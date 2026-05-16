import { state, normalizeCountryName } from './state.js';
import { showInfoPanel } from './ui.js';

export function initMap() {
    state.map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([15, 10], 2.5);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 16,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(state.map);

    L.control.zoom({ position: 'bottomright' }).addTo(state.map);

    state.advisoryLayerGroup = L.layerGroup();
    state.advisoryLayerGroup.addTo(state.map);
}

export function drawCountries(geojsonData) {
    state.countryLayer = L.geoJSON(geojsonData, {
        style: {
            fillColor: 'transparent',
            weight: 0,
            opacity: 0,
            fillOpacity: 0
        }
    }).addTo(state.map);
}

export function renderAdvisoryMarkers() {
    const coordCounts = {};

    state.globalAdvisories.forEach(adv => {
        const key = `${adv.lat},${adv.lng}`;
        if (!coordCounts[key]) coordCounts[key] = 0;
        const offsetIdx = coordCounts[key]++;
        
        const lat = adv.lat;
        const lng = adv.lng + (offsetIdx * 1.5);

        const flagColor = adv.type === 'advisory' ? '#f87171' : '#facc15';
        const icon = L.divIcon({
            className: 'custom-flag-icon',
            html: `<svg class="flag-marker flag-${adv.type}" viewBox="0 0 24 24">
                            <path d="M5 21V4h9l1 2h5v10h-7l-1-2H7v7H5z"/>
                           </svg>`,
            iconSize: [22, 22],
            iconAnchor: [-4, 26]
        });

        const marker = L.marker([lat, lng], {
            icon,
            zIndexOffset: 1000
        });
        state.advisoryLayerGroup.addLayer(marker);

        adv.marker = marker;

        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            window.open(adv.link, '_blank');
        });

        marker.bindTooltip(adv.title, {
            direction: 'top',
            offset: [10, -20]
        });
    });
}

export function renderMissionMarkers(data) {
    state.markers.forEach(m => state.map.removeLayer(m));
    state.markers = [];

    data.forEach(m => {
        if (m.lat && m.lng) {
            let color = '#38bdf8'; 
            let shapeClass = 'shape-circle'; 

            if (['Embassy', 'High Commission'].includes(m.type) || (m.type === 'Trade Office' && m.city === 'Taipei')) {
                color = '#15803d'; 
                shapeClass = 'shape-square';
            } else if (['Consulate-General', 'Consulate', 'Permanent Mission'].includes(m.type)) {
                color = '#3B82F6'; 
                shapeClass = 'shape-circle';
            } else if (['Honorary Consulate', 'Honorary Consulate-General'].includes(m.type)) {
                color = '#d946ef'; 
                shapeClass = 'shape-diamond';
            }

            const icon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div class="custom-marker ${shapeClass}" style="background: ${color}; box-shadow: 0 0 12px ${color};" id="marker-${m.name.replace(/\s+/g, '-')}"></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            });

            const marker = L.marker([m.lat, m.lng], { icon }).addTo(state.map);

            marker.on('click', () => selectMission(m));
            marker.bindTooltip(m.name, { direction: 'top', offset: [0, -10] });
            state.markers.push(marker);
            m.marker = marker;
        }
    });
}

export function highlightCoverage(coverage) {
    if (!state.countryLayer || !coverage) return;

    const normalizedCoverage = coverage.map(normalizeCountryName);

    state.countryLayer.setStyle(f => {
        const props = f.properties;
        const namesToCheck = [
            props.name,
            props.name_long,
            props.admin,
            props.sovereignt,
            props.formal_en
        ];

        const isMatch = namesToCheck.some(name => name && normalizedCoverage.includes(name));

        if (isMatch) {
            return {
                fillColor: '#00f2fe',
                weight: 1,
                opacity: 0.8,
                color: 'white',
                fillOpacity: 0.25
            };
        }
        return {
            fillColor: 'transparent',
            weight: 0,
            opacity: 0,
            fillOpacity: 0
        };
    });
}

export function resetShading() {
    if (state.countryLayer) {
        state.countryLayer.setStyle({
            fillColor: 'transparent',
            weight: 0,
            opacity: 0,
            fillOpacity: 0
        });
    }
}

export function selectMission(m, item = null, userLat = null, userLng = null) {
    document.querySelectorAll('.mission-item').forEach(i => i.classList.remove('active'));
    if (item) {
        item.classList.add('active');
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        const listItems = document.querySelectorAll('.mission-item');
        for (const li of listItems) {
            if (li.querySelector('.name').textContent === m.name) {
                li.classList.add('active');
                li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                break;
            }
        }
    }

    if (state.userMarker) {
        state.map.removeLayer(state.userMarker);
        state.userMarker = null;
    }

    let targetLat = userLat !== null ? userLat : m.lat;
    let targetLng = userLng !== null ? userLng : m.lng;

    if (window.innerWidth <= 768) {
        targetLat -= 1.5;
    }

    if (userLat !== null && userLng !== null) {
        state.map.flyTo([targetLat, targetLng], 6, { duration: 1.5 });
        const pinIcon = L.divIcon({
            className: 'custom-pin-icon',
            html: `<svg class="pin-marker" viewBox="0 0 24 24" width="32" height="32" fill="#6b7280" stroke="#fff" stroke-width="1.5">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3" fill="#fff"></circle>
                    </svg>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        });
        state.userMarker = L.marker([userLat, userLng], { icon: pinIcon }).addTo(state.map);
    } else {
        state.map.flyTo([targetLat, targetLng], 6, { duration: 1.5 });
    }

    showInfoPanel(m);
    resetShading();
}

export function dropFallbackMarker(userLat, userLng) {
    if (state.userMarker) state.map.removeLayer(state.userMarker);
    const pinIcon = L.divIcon({
        className: 'custom-pin-icon',
        html: `<svg class="pin-marker" viewBox="0 0 24 24" width="32" height="32" fill="#6b7280" stroke="#fff" stroke-width="1.5">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3" fill="#fff"></circle>
                </svg>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32]
    });
    state.map.flyTo([userLat, userLng], 4, { duration: 1.5 });
    state.userMarker = L.marker([userLat, userLng], { icon: pinIcon }).addTo(state.map);
}
