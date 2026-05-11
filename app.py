import os
import yaml
import json
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv
from geopy.geocoders import Nominatim
from geopy.distance import geodesic
from contextlib import asynccontextmanager

load_dotenv()

ACCESS_PASSWORD = os.environ.get("ACCESS_PASSWORD", "mfa2026")
SESSION_TOKEN = "sg-consular-secure-v1"

from fastapi.responses import JSONResponse, FileResponse

from pathlib import Path

# Setup absolute paths
BASE_DIR = Path(__file__).resolve().parent
YAML_PATH = BASE_DIR / 'mission_routing_data.yaml'
JSON_PATH = BASE_DIR / 'missions.json'
MAPPING_PATH = BASE_DIR / 'country_mapping.json'

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        # Load YAML
        if YAML_PATH.exists():
            with open(YAML_PATH, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f)
        else:
            print(f"Warning: {YAML_PATH} not found")
            data = {}
        
        # Load Missions JSON
        missions_data = {}
        if JSON_PATH.exists():
            with open(JSON_PATH, 'r', encoding='utf-8') as f:
                missions_json = json.load(f)
            missions_data = {m['name']: m for m in missions_json}
        else:
            print(f"Warning: {JSON_PATH} not found")
            missions_data = data.get('missions', {})
            
        # Load Country Mapping
        if MAPPING_PATH.exists():
            with open(MAPPING_PATH, 'r', encoding='utf-8') as f:
                country_mapping = json.load(f)
        else:
            print(f"Warning: {MAPPING_PATH} not found")
            country_mapping = {}

        app.state.data = data
        app.state.missions_data = missions_data
        app.state.country_mapping = country_mapping
    except Exception as e:
        print(f"Error during startup: {e}")
        # Initialize with empty data to avoid crashing the whole server
        app.state.data = {}
        app.state.missions_data = {}
        app.state.country_mapping = {}
        
    yield
    # Cleanup if necessary

app = FastAPI(lifespan=lifespan)

# Authentication Middleware
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # Public paths
    public_paths = ["/", "/login", "/style.css", "/app.js", "/favicon.ico", "/health"]
    
    if request.url.path in public_paths:
        return await call_next(request)
    
    # Check for session cookie
    auth_cookie = request.cookies.get("session_token")
    if auth_cookie != SESSION_TOKEN:
        # If it's an API call or data file, return 401
        if request.url.path.endswith((".json", ".yaml")) or request.url.path == "/route":
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
        # Otherwise redirect to home (where the login overlay will show)
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    return await call_next(request)

@app.post("/login")
async def login(payload: dict):
    password = payload.get("password")
    if password == ACCESS_PASSWORD:
        response = JSONResponse(content={"message": "Logged in"})
        response.set_cookie(
            key="session_token", 
            value=SESSION_TOKEN, 
            httponly=True, 
            samesite="lax",
            max_age=60*60*24*7 # 1 week
        )
        return response
    raise HTTPException(status_code=401, detail="Invalid password")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def normalize_country(country, mapping):
    # Return the mapped name if it exists, otherwise return the original country name
    return mapping.get(country, country)

def route_by_rules(country, user_lat, user_lng, data, missions_data, address=None):
    countries_data = data.get('countries', {})
    
    if country in countries_data:
        rule = countries_data[country]
        ctype = rule.get('coverage_type', 'none')
        
        # Sub-national province/state routing override
        if address:
            # Check for province/state specific rules
            state = address.get('state') or address.get('province') or address.get('region')
            city = address.get('city') or address.get('town') or address.get('village')
            
            # 1. Check for explicit sub_national block (e.g., China, India, USA)
            sub_national = rule.get('sub_national')
            if sub_national:
                for entry in sub_national:
                    regions = entry.get('regions', [])
                    if (state and state in regions) or (city and city in regions):
                        return {"mission": entry.get('mission'), "type": "resident"}

            # 2. Check for legacy provinces block if present
            if state and rule.get('provinces') and state in rule['provinces']:
                return {"mission": rule['provinces'][state], "type": "subnational"}

        if ctype == 'cross_accredited':
            return {"mission": rule.get('accrediting_mission'), "type": ctype}
            
        elif ctype in ['cross_accredited_with_honorary', 'none']:
            hon_offices = rule.get('honorary_offices', [])
            if hon_offices:
                return {"mission": hon_offices[0].get('mission'), "type": ctype}
                
        elif ctype == 'nearest_honorary':
            hon_offices = rule.get('honorary_offices', [])
            closest_mission = None
            min_dist = float('inf')
            for office in hon_offices:
                m_name = office.get('mission')
                m_info = missions_data.get(m_name)
                if m_info and m_info.get('lat') and m_info.get('lng'):
                    dist = geodesic((user_lat, user_lng), (m_info['lat'], m_info['lng'])).km
                    if dist < min_dist:
                        min_dist = dist
                        closest_mission = m_name
            if closest_mission:
                return {"mission": closest_mission, "type": ctype}
                
        elif ctype == 'nearest_office':
            offices_to_check = []
            hon_offices = rule.get('honorary_offices', [])
            for office in hon_offices:
                offices_to_check.append(office.get('mission'))
            if rule.get('accrediting_mission'):
                offices_to_check.append(rule.get('accrediting_mission'))
            if rule.get('primary_mission'):
                offices_to_check.append(rule.get('primary_mission'))
                
            closest_mission = None
            min_dist = float('inf')
            for m_name in offices_to_check:
                m_info = missions_data.get(m_name)
                if m_info and m_info.get('lat') and m_info.get('lng'):
                    dist = geodesic((user_lat, user_lng), (m_info['lat'], m_info['lng'])).km
                    if dist < min_dist:
                        min_dist = dist
                        closest_mission = m_name
            if closest_mission:
                return {"mission": closest_mission, "type": ctype}

    # Sub-national routing (resident countries) - Fallback to nearest
    country_missions = [m for m in missions_data.values() if isinstance(m, dict) and m.get('country') == country]
    
    if len(country_missions) >= 1:
        closest_mission = None
        min_dist = float('inf')
        for m_info in country_missions:
            if m_info.get('lat') and m_info.get('lng'):
                dist = geodesic((user_lat, user_lng), (m_info['lat'], m_info['lng'])).km
                if dist < min_dist:
                    min_dist = dist
                    closest_mission = m_info['name']
        if closest_mission:
            return {"mission": closest_mission, "type": "resident"}
            
    return None

geolocator = Nominatim(user_agent="antigravity_mission_router")

class LocationRequest(BaseModel):
    location: str

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.post("/route")
async def route_location(req: Request, payload: LocationRequest):
    data = req.app.state.data
    missions_data = req.app.state.missions_data
    country_mapping = req.app.state.country_mapping
    missions_list = list(missions_data.keys())
    
    # 1. Deterministic Geocoding & Rules Engine
    try:
        location = geolocator.geocode(payload.location, addressdetails=True, language='en', timeout=5)
        if location and location.raw.get('address'):
            address = location.raw['address']
            country = address.get('country')
            if country:
                country = normalize_country(country, country_mapping)
                route_result = route_by_rules(country, location.latitude, location.longitude, data, missions_data, address)
                
                if route_result and route_result['mission'] in missions_list:
                    mission_name = route_result['mission']
                    routing_type = route_result['type']
                    print(f"Routing '{payload.location}' to: {mission_name} ({routing_type})")
                    return {
                        "mission": mission_name, 
                        "routing_type": routing_type,
                        "lat": location.latitude,
                        "lng": location.longitude
                    }
        
        # If geocoding finds something but no rules match, return MFA HQ as fallback
        # If location was found, we can still return coordinates to center the map
        if location:
            return {
                "mission": "MFA HQ", 
                "routing_type": "fallback",
                "lat": location.latitude,
                "lng": location.longitude
            }
        return {"mission": "MFA HQ", "routing_type": "fallback"}

    except Exception as e:
        print(f"Routing failed: {e}")
        return {"mission": "MFA HQ", "routing_type": "error"}

# Serve static files
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
