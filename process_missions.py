import yaml
import json
import time
import urllib.request
import urllib.parse
import os

YAML_PATH = 'mission_routing_data.yaml'
JSON_PATH = 'missions.json'
CACHE_PATH = 'geocoding_cache.json'

def get_cache():
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, 'r') as f:
            return json.load(f)
    return {}

def save_cache(cache):
    with open(CACHE_PATH, 'w') as f:
        json.dump(cache, f, indent=2)

def geocode(address, city, country, cache):
    query = f"{address}, {city}, {country}"
    if query in cache:
        return cache[query]
    
    query_fallback = f"{city}, {country}"
    if query_fallback in cache:
        return cache[query_fallback]
    
    # Try with full address
    coords = _fetch_nominatim(query)
    if coords:
        cache[query] = coords
        return coords
    
    time.sleep(1) # Rate limit protection
    coords = _fetch_nominatim(query_fallback)
    if coords:
        cache[query_fallback] = coords
        return coords
    
    return None

def _fetch_nominatim(query):
    url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(query)}&format=json&limit=1"
    headers = {'User-Agent': 'AntigravityMissionMap/1.1'}
    
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            if data:
                return [float(data[0]['lat']), float(data[0]['lon'])]
    except Exception as e:
        print(f"Error geocoding {query}: {e}")
    return None

def main():
    print("Loading data...")
    with open(YAML_PATH, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)
    
    # Map mission name to list of countries covered and their coverage types
    coverage_map = {}
    coverage_types_map = {}
    countries_data = data.get('countries', {})
    for country_name, info in countries_data.items():
        covering_mission = info.get('accrediting_mission') or info.get('covering_mission')
        if covering_mission:
            if covering_mission not in coverage_map:
                coverage_map[covering_mission] = []
            coverage_map[covering_mission].append(country_name)
            
            if covering_mission not in coverage_types_map:
                coverage_types_map[covering_mission] = {}
            coverage_types_map[covering_mission][country_name] = info.get('coverage_type', '')

    missions_data = data.get('missions', {})
    cache = get_cache()
    
    processed = []
    total = len(missions_data)
    count = 0
    
    for name, details in missions_data.items():
        count += 1
        print(f"[{count}/{total}] Processing {name}...")
        
        if not isinstance(details, dict):
            continue
            
        lat_lng = geocode(
            details.get('address', ''), 
            details.get('city', ''), 
            details.get('country', ''),
            cache
        )
        
        # Determine coverage
        mission_coverage = coverage_map.get(name, [])
        host_country = details.get('country')
        if host_country and host_country not in mission_coverage:
            mission_coverage.append(host_country)

        mission_info = {
            'name': name,
            'region': 'Global', # Default as it's not structured in YAML
            'type': details.get('type', 'Unknown'),
            'country': details.get('country', ''),
            'city': details.get('city', ''),
            'address': details.get('address', ''),
            'phone': details.get('phone', ''),
            'email': details.get('email', ''),
            'website': details.get('website', ''),
            'emergency': details.get('emergency_contact', ''),
            'hours': details.get('operating_hours', {}),
            'lat': lat_lng[0] if lat_lng else None,
            'lng': lat_lng[1] if lat_lng else None,
            'coverage': mission_coverage,
            'coverage_types': coverage_types_map.get(name, {})
        }
        processed.append(mission_info)
        
        # Save cache every 10 missions
        if count % 10 == 0:
            save_cache(cache)

    save_cache(cache)
    
    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(processed, f, indent=2)
    print(f"Done! Saved {len(processed)} missions to {JSON_PATH}")

if __name__ == "__main__":
    main()
