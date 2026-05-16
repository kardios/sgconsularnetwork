import re
import json

with open("c:\\antigravity\\coverage\\travel_titles.md", "r", encoding="utf-8") as f:
    lines = f.readlines()

advisories = []
current_country = None
current_link = None

for line in lines:
    line = line.strip()
    if line.startswith("## "):
        current_country = line[3:].strip()
    elif line.startswith("*http"):
        current_link = line.strip("*")
    elif line.startswith("- "):
        # Parse title and coordinates
        # Example: - Travel Advisory for Saudi Arabia (7 March 2026) | Saudi Arabia (23.8859, 45.0792)
        match = re.match(r"- (.*?) \| .*?\(([-\d.]+),\s*([-\d.]+)\)", line)
        if match:
            title = match.group(1).strip()
            lat = float(match.group(2))
            lng = float(match.group(3))
            
            # Determine type
            type_ = "notice"
            if "advisory" in title.lower():
                type_ = "advisory"
                
            advisories.append({
                "country": current_country,
                "title": title,
                "type": type_,
                "link": current_link,
                "lat": lat,
                "lng": lng
            })

with open("c:\\antigravity\\coverage\\travel_advisories.json", "w", encoding="utf-8") as f:
    json.dump(advisories, f, indent=4)

print(f"Generated {len(advisories)} advisories.")
