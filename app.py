import os
import yaml
import json
import asyncio
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv
from geopy.geocoders import Nominatim
from geopy.distance import geodesic
from contextlib import asynccontextmanager

load_dotenv()

ACCESS_PASSWORD = os.environ.get("ACCESS_PASSWORD", "sgcn2026")
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
        app.state.query_cache = {}
    except Exception as e:
        print(f"Error during startup: {e}")
        # Initialize with empty data to avoid crashing the whole server
        app.state.data = {}
        app.state.missions_data = {}
        app.state.country_mapping = {}
        app.state.query_cache = {}
        
    yield
    # Cleanup if necessary

app = FastAPI(lifespan=lifespan)

# Authentication Middleware
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # Public paths
    public_paths = ["/", "/login", "/style.css", "/app.js", "/favicon.ico", "/health"]
    
    if request.url.path in public_paths or request.url.path.startswith("/js/"):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response
    
    # Check for session cookie
    auth_cookie = request.cookies.get("session_token")
    if auth_cookie != SESSION_TOKEN:
        # If it's an API call or data file, return 401
        if request.url.path.endswith((".json", ".yaml")) or request.url.path == "/route":
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
        # Otherwise redirect to home (where the login overlay will show)
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

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

import unicodedata

def clean_string(s):
    if not s or not isinstance(s, str):
        return ""
    # Convert to lowercase and replace special Vietnamese character 'đ'
    s = s.lower().replace('đ', 'd')
    # Normalize to decompose accents/diacritics and filter them out
    s = "".join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))
    # Keep only alphanumeric characters
    s_clean = "".join(c for c in s if c.isalnum())
    # Trim common administrative suffixes from the end
    for suffix in ["province", "prefecture", "state", "region", "autonomousregion", "community", "department"]:
        if s_clean.endswith(suffix):
            s_clean = s_clean[:-len(suffix)]
    return s_clean

def route_by_rules(country, user_lat, user_lng, data, missions_data, address=None):
    countries_data = data.get('countries', {})
    country_missions = [m for m in missions_data.values() if isinstance(m, dict) and m.get('country') == country]
    
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
                clean_state = clean_string(state)
                clean_city = clean_string(city)
                for entry in sub_national:
                    regions = entry.get('regions', [])
                    clean_regions = [clean_string(r) for r in regions]
                    if (clean_state and clean_state in clean_regions) or (clean_city and clean_city in clean_regions):
                        return {"mission": entry.get('mission'), "type": "resident"}
                
                if rule.get('restrict_to_sub_national') and (clean_state or clean_city):
                    return None

            # 2. Check for legacy provinces block if present
            if state and rule.get('provinces'):
                clean_state = clean_string(state)
                clean_provinces = {clean_string(k): v for k, v in rule['provinces'].items()}
                if clean_state in clean_provinces:
                    return {"mission": clean_provinces[clean_state], "type": "subnational"}

        if ctype == 'cross_accredited':
            return {"mission": rule.get('accrediting_mission'), "type": ctype}
            
        elif ctype == 'cross_accredited_with_honorary':
            hon_offices = rule.get('honorary_offices', [])
            if hon_offices:
                return {
                    "mission": hon_offices[0].get('mission'),
                    "type": ctype,
                    "secondary_mission": rule.get('accrediting_mission'),
                    "secondary_label": "SUPERVISING RESIDENT MISSION"
                }
                
        elif ctype == 'none':
            hon_offices = rule.get('honorary_offices', [])
            if hon_offices:
                # Find the nearest resident mission among all resident missions in missions_data
                nearest_res_mission = None
                min_dist = float('inf')
                for m_name, m_info in missions_data.items():
                    if m_info.get('type') in ['Honorary Consulate', 'Honorary Consulate-General']:
                        continue
                    if m_info.get('lat') and m_info.get('lng'):
                        dist = geodesic((user_lat, user_lng), (m_info['lat'], m_info['lng'])).km
                        if dist < min_dist:
                            min_dist = dist
                            nearest_res_mission = m_name
                
                return {
                    "mission": hon_offices[0].get('mission'),
                    "type": ctype,
                    "secondary_mission": nearest_res_mission,
                    "secondary_label": "NEAREST RESIDENT OFFICE"
                }
                
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

        # Fallback if sub-national routing didn't resolve to a mission
        fallback = rule.get('fallback_when_unresolved')
        if fallback == 'capital_mission' and rule.get('capital_mission'):
            return {"mission": rule.get('capital_mission'), "type": "resident"}
        elif fallback == 'list_all':
            capital_city = rule.get('capital')
            if capital_city:
                for m_info in country_missions:
                    if m_info.get('city') == capital_city:
                        return {"mission": m_info['name'], "type": "resident"}

    # Sub-national routing (resident countries) - Fallback to nearest
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
            
    # Find the nearest mission globally (including honorary offices)
    nearest_mission = None
    min_dist = float('inf')
    for m_name, m_info in missions_data.items():
        if m_info.get('lat') and m_info.get('lng'):
            dist = geodesic((user_lat, user_lng), (m_info['lat'], m_info['lng'])).km
            if dist < min_dist:
                min_dist = dist
                nearest_mission = m_name
                
    if nearest_mission:
        return {"mission": nearest_mission, "type": "nearest_resident"}
            
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
    query_cache = req.app.state.query_cache
    missions_list = list(missions_data.keys())
    
    # 1. Deterministic Geocoding & Rules Engine
    try:
        query_key = payload.location.lower().strip()
        location = query_cache.get(query_key)
        
        if not location:
            location = await asyncio.to_thread(
                geolocator.geocode,
                payload.location,
                addressdetails=True,
                language='en',
                timeout=5
            )
            
            if location:
                query_cache[query_key] = location
                if len(query_cache) > 1000:
                    first_key = next(iter(query_cache))
                    del query_cache[first_key]

        if location:
            address = location.raw.get('address') if location.raw else None
            country = address.get('country') if address else None
            if country:
                country = normalize_country(country, country_mapping)
            
            route_result = route_by_rules(country, location.latitude, location.longitude, data, missions_data, address)
            
            if route_result and route_result.get('mission') in missions_list:
                mission_name = route_result['mission']
                routing_type = route_result['type']
                print(f"Routing '{payload.location}' to: {mission_name} ({routing_type})")
                res = {
                    "mission": mission_name, 
                    "routing_type": routing_type,
                    "lat": location.latitude,
                    "lng": location.longitude,
                    "queried_country": country
                }
                if 'secondary_mission' in route_result:
                    res['secondary_mission'] = route_result['secondary_mission']
                if 'secondary_label' in route_result:
                    res['secondary_label'] = route_result['secondary_label']
                return res
        
        # If geocoding finds something but no rules match, return MFA HQ as fallback
        # If location was found, we can still return coordinates to center the map
        if location:
            return {
                "mission": "MFA HQ", 
                "routing_type": "fallback",
                "lat": location.latitude,
                "lng": location.longitude,
                "queried_country": address.get('country') if address else None
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
