# Consular Network | Singapore Overseas Missions

An interactive map and routing system for Singapore's overseas missions. This application helps users find the nearest or most appropriate consular mission based on their location.

## Features
- **Interactive Map**: Visualize the global network of Singapore's Embassies, High Commissions, and Consulates with distinct color-coded markers.
- **Smart Routing**: Enter a location to find the covering mission, including handling for cross-accredited regions.
- **Mission Details**: Quick access to addresses, contact information, and real-time operating status based on the mission's local timezone.
- **Coverage Shading**: Visualize the geographical coverage of capital missions.
- **Travel Advisories**: Displays global travel advisories and notices as interactive map flags.
- **Secure Access**: The application is protected by a password gate.

## Tech Stack
- **Frontend**: HTML5, CSS3 (Vanilla), JavaScript (Modular), Leaflet.js
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
   Open `http://localhost:8000` in your browser. The default password for local development is `sgcn2026`.

## Deployment to Render

To deploy this app on Render:

1. **Create a new Web Service** on Render.
2. **Connect your GitHub repository**.
3. **Configure the Service**:
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn -w 4 -k uvicorn.workers.UvicornWorker app:app` (or it will automatically use the provided `Procfile`)
4. **Environment Variables**:
   - `ACCESS_PASSWORD`: Set this to your desired password to protect the site.
   - Render automatically sets the `$PORT` variable.

## License
MIT
