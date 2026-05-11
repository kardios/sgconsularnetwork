# Consular Network | Singapore Overseas Missions

An interactive map and routing system for Singapore's overseas missions. This application helps users find the nearest or most appropriate consular mission based on their location.

## Features
- **Interactive Map**: Visualize the global network of Singapore's Embassies, High Commissions, and Consulates.
- **Smart Routing**: Enter a location to find the covering mission, including handling for cross-accredited regions.
- **Mission Details**: Quick access to addresses, contact information, and operating hours.
- **Coverage Shading**: Visualize the geographical coverage of capital missions.

## Tech Stack
- **Frontend**: HTML5, CSS3 (Vanilla), JavaScript, Leaflet.js
- **Backend**: Python, FastAPI, Geopy
- **Data**: YAML, JSON

## Local Development

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the Server**:
   ```bash
   python app.py
   ```

3. **Access the App**:
   Open `http://localhost:8000` in your browser.

## Deployment to Render

To deploy this app on Render:

1. **Create a new Web Service** on Render.
2. **Connect your GitHub repository**.
3. **Configure the Service**:
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
4. **Environment Variables**:
   - Render automatically sets the `$PORT` variable which `uvicorn` will use.

## License
MIT
