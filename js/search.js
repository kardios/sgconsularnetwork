import { state } from './state.js';
import { routeLocation } from './api.js';
import { selectMission, dropFallbackMarker } from './map.js';
import { renderMissionsList, checkAndDisplayAdvisory } from './ui.js';

let debounceTimer = null;
let currentAbortController = null;

export function setupSearch() {
    const searchInput = document.getElementById('search');

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim();
        const termLower = term.toLowerCase();

        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        if (termLower.length === 0) {
            renderMissionsList([]);
            checkAndDisplayAdvisory([]);

            document.getElementById('search-status').textContent = '';
            document.getElementById('search-spinner').classList.remove('active');
            if (currentAbortController) {
                currentAbortController.abort();
                currentAbortController = null;
            }
            return;
        }

        let filtered = [];
        if (termLower.length >= 3) {
            filtered = state.missions.filter(m =>
                m.name.toLowerCase().includes(termLower) ||
                m.city.toLowerCase().includes(termLower) ||
                m.country.toLowerCase().includes(termLower)
            );

            filtered.sort((a, b) => {
                const aName = a.name.toLowerCase().startsWith(termLower) || a.city.toLowerCase().startsWith(termLower);
                const bName = b.name.toLowerCase().startsWith(termLower) || b.city.toLowerCase().startsWith(termLower);
                if (aName && !bName) return -1;
                if (!aName && bName) return 1;
                return 0;
            });

            renderMissionsList(filtered);
            const matchedCountries = [...new Set(filtered.map(m => m.country))];
            checkAndDisplayAdvisory(matchedCountries);
        }

        if (term.length >= 3 && filtered.length === 0) {
            debounceTimer = setTimeout(() => {
                smartSearch(term, false);
            }, 800);
        }
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const term = searchInput.value.trim();
            if (term.length >= 3) {
                if (debounceTimer) clearTimeout(debounceTimer);
                smartSearch(term, true);
            }
        }
    });
}

export async function smartSearch(location, isFinal = false) {
    const spinner = document.getElementById('search-spinner');
    const statusLabel = document.getElementById('search-status');

    if (currentAbortController) {
        currentAbortController.abort();
    }

    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    spinner.classList.add('active');
    statusLabel.textContent = "Analyzing location...";
    statusLabel.style.color = "var(--text-dim)";

    try {
        const data = await routeLocation(location, signal);
        
        const missionName = data.mission;
        const routingType = data.routing_type;
        const queriedCountry = data.queried_country;

        let userLat = data.lat !== undefined ? parseFloat(data.lat) : null;
        let userLng = data.lng !== undefined ? parseFloat(data.lng) : null;

        const mission = state.missions.find(m => m.name === missionName);
        
        if (queriedCountry) {
            checkAndDisplayAdvisory([queriedCountry]);
        } else if (mission) {
            checkAndDisplayAdvisory([mission.country]);
        } else {
            checkAndDisplayAdvisory([]);
        }

        if (mission) {
            if (isFinal) {
                selectMission(mission, null, userLat, userLng);
            } else {
                renderMissionsList([mission]);
            }

            if (routingType && routingType.startsWith('cross_accredited')) {
                statusLabel.textContent = `No local presence. Routing to accredited mission: ${missionName}`;
            } else {
                statusLabel.textContent = `Routed to ${missionName}`;
            }
            statusLabel.style.color = "#4ade80"; 
            setTimeout(() => { if (statusLabel.textContent.includes("Routed")) statusLabel.textContent = ""; }, 3000);
        } else {
            if (missionName === "MFA HQ") {
                statusLabel.textContent = `No resident mission in this location.`;
                statusLabel.style.color = "#facc15"; 

                if (isFinal && userLat !== null && userLng !== null) {
                    dropFallbackMarker(userLat, userLng);
                }
            } else {
                statusLabel.textContent = `No match for "${missionName}"`;
                statusLabel.style.color = "#facc15"; 
            }
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Aborted smart search for', location);
        } else {
            console.error('Smart Search Error:', error);
            statusLabel.textContent = 'Routing unavailable. Try again.';
            statusLabel.style.color = "#ef4444"; 
        }
    } finally {
        if (currentAbortController && currentAbortController.signal === signal) {
            spinner.classList.remove('active');
            currentAbortController = null;
        }
    }
}
