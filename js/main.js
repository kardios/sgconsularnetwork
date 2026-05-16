import { state } from './state.js';
import { performLogin, loadInitialData, loadAdvisories } from './api.js';
import { initMap, drawCountries, renderAdvisoryMarkers, renderMissionMarkers } from './map.js';
import { renderMissionsList, closeInfoPanel } from './ui.js';
import { setupSearch } from './search.js';

async function init() {
    const loginOverlay = document.getElementById('login-overlay');
    const passwordInput = document.getElementById('password-input');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');

    const handleLogin = async () => {
        const password = passwordInput.value.trim();
        if (!password) return;

        loginBtn.disabled = true;
        loginBtn.textContent = 'Verifying...';

        try {
            const res = await performLogin(password);
            if (res.ok) {
                loginOverlay.classList.remove('visible');
                location.reload();
            } else {
                loginError.textContent = 'Incorrect password. Access denied.';
                passwordInput.value = '';
            }
        } catch (e) {
            loginError.textContent = 'Server error. Please try again.';
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Access Map';
        }
    };

    loginBtn.onclick = handleLogin;
    passwordInput.onkeypress = (e) => { if (e.key === 'Enter') handleLogin(); };

    // Initialize Map UI
    initMap();
    document.getElementById('close-info-btn').addEventListener('click', closeInfoPanel);

    try {
        const { missions, mappingData, countriesGeoJSON } = await loadInitialData();
        
        state.missions = missions;
        for (const [shortName, formalName] of Object.entries(mappingData)) {
            state.countryNameMap[formalName] = shortName;
        }

        drawCountries(countriesGeoJSON);

        state.missions.sort((a, b) => a.name.localeCompare(b.name));
        renderMissionMarkers(state.missions);

        try {
            state.globalAdvisories = await loadAdvisories();
            renderAdvisoryMarkers();
        } catch(e) {
            console.error('Error rendering advisories:', e);
        }

        const advisoryToggle = document.getElementById('advisory-toggle');
        if (advisoryToggle) {
            advisoryToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    state.map.addLayer(state.advisoryLayerGroup);
                } else {
                    state.map.removeLayer(state.advisoryLayerGroup);
                }
            });
        }

        state.map.on('click', () => {
            closeInfoPanel();
        });

        setTimeout(() => {
            document.getElementById('loading').style.opacity = '0';
            setTimeout(() => {
                document.getElementById('loading').style.display = 'none';
            }, 500);
        }, 1000);

        setupSearch();

    } catch (error) {
        if (error.message === 'Unauthorized') {
            loginOverlay.classList.add('visible');
            document.getElementById('loading').style.display = 'none';
        } else {
            console.error('Error initializing map:', error);
            document.getElementById('loading').innerHTML = `<p style="color: #ef4444;">Error: ${error.message}</p>`;
        }
    }
}

window.onload = init;
