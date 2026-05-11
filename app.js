let map;
        let missions = [];
        let markers = [];
        let countryLayer = null;
        let activeMarker = null;
        
        let debounceTimer = null;
        let currentAbortController = null;
        let userMarker = null;

        // Name Normalization Map (Formal -> Short for GeoJSON)
        let countryNameMap = {};

        function normalizeCountryName(name) {
            return countryNameMap[name] || name;
        }

        async function init() {
            // Handle Login
            const loginOverlay = document.getElementById('login-overlay');
            const passwordInput = document.getElementById('password-input');
            const loginBtn = document.getElementById('login-btn');
            const loginError = document.getElementById('login-error');

            const performLogin = async () => {
                const password = passwordInput.value.trim();
                if (!password) return;
                
                loginBtn.disabled = true;
                loginBtn.textContent = 'Verifying...';
                
                try {
                    const res = await fetch('/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password })
                    });
                    
                    if (res.ok) {
                        loginOverlay.classList.remove('visible');
                        // Retry initialization
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

            loginBtn.onclick = performLogin;
            passwordInput.onkeypress = (e) => { if (e.key === 'Enter') performLogin(); };

            map = L.map('map', {
                zoomControl: false,
                attributionControl: false
            }).setView([15, 10], 2.5);

            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 16,
                attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
            }).addTo(map);

            L.control.zoom({ position: 'bottomright' }).addTo(map);

            try {
                const [missionsRes, countriesRes, mappingRes] = await Promise.all([
                    fetch('missions.json'),
                    fetch('countries.json'),
                    fetch('country_mapping.json')
                ]);

                if (missionsRes.status === 401 || countriesRes.status === 401 || mappingRes.status === 401) {
                    loginOverlay.classList.add('visible');
                    document.getElementById('loading').style.display = 'none';
                    return;
                }

                if (!missionsRes.ok || !countriesRes.ok || !mappingRes.ok) throw new Error('Failed to load data');
                
                missions = await missionsRes.json();
                const mappingData = await mappingRes.json();
                
                // Invert the Short -> Formal mapping to Formal -> Short for shading
                for (const [shortName, formalName] of Object.entries(mappingData)) {
                    countryNameMap[formalName] = shortName;
                }
                const countriesGeoJSON = await countriesRes.json();
                
                countryLayer = L.geoJSON(countriesGeoJSON, {
                    style: {
                        fillColor: 'transparent',
                        weight: 0,
                        opacity: 0,
                        fillOpacity: 0
                    }
                }).addTo(map);

                missions.sort((a, b) => a.name.localeCompare(b.name));
                renderMissions(missions, true, false);
                
                map.on('click', () => {
                    closeInfoPanel();
                });
                
                setTimeout(() => {
                    document.getElementById('loading').style.opacity = '0';
                    setTimeout(() => {
                        document.getElementById('loading').style.display = 'none';
                    }, 500);
                }, 1000);

            } catch (error) {
                console.error('Error initializing map:', error);
                document.getElementById('loading').innerHTML = `<p style="color: #ef4444;">Error: ${error.message}</p>`;
            }

            const searchInput = document.getElementById('search');
            
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.trim();
                const termLower = term.toLowerCase();
                
                // Clear any existing debounce timer
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }
                
                // 1. Instant local filter
                if (termLower.length === 0) {
                    renderMissions([], false, true);
                    
                    // Reset UI
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
                    // Filter missions: prioritize matches at the start of name, city, or country
                    filtered = missions.filter(m => 
                        m.name.toLowerCase().includes(termLower) || 
                        m.city.toLowerCase().includes(termLower) || 
                        m.country.toLowerCase().includes(termLower)
                    );
                    
                    // Sort to put prefix matches first
                    filtered.sort((a, b) => {
                        const aName = a.name.toLowerCase().startsWith(termLower) || a.city.toLowerCase().startsWith(termLower);
                        const bName = b.name.toLowerCase().startsWith(termLower) || b.city.toLowerCase().startsWith(termLower);
                        if (aName && !bName) return -1;
                        if (!aName && bName) return 1;
                        return 0;
                    });

                    renderMissions(filtered, false, true);
                }
                
                // 2. Debounced smart search (800ms)
                // ONLY trigger if we don't have an obvious local match
                if (term.length >= 3 && filtered.length === 0) {
                    debounceTimer = setTimeout(() => {
                        smartSearch(term, false);
                    }, 800);
                }
            });

            // Re-introduce Enter key for the "Final" explicit search (drops the red cross)
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

        async function smartSearch(location, isFinal = false) {
            const spinner = document.getElementById('search-spinner');
            const statusLabel = document.getElementById('search-status');
            
            // Abort previous request if one is in flight
            if (currentAbortController) {
                currentAbortController.abort();
            }
            
            currentAbortController = new AbortController();
            const signal = currentAbortController.signal;

            spinner.classList.add('active');
            statusLabel.textContent = "Analyzing location...";
            statusLabel.style.color = "var(--text-dim)";

            try {
                const response = await fetch('/route', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ location: location }),
                    signal: signal
                });

                if (!response.ok) throw new Error('Routing failed');
                
                const data = await response.json();
                const missionName = data.mission;
                const routingType = data.routing_type;
                
                let userLat = data.lat !== undefined ? parseFloat(data.lat) : null;
                let userLng = data.lng !== undefined ? parseFloat(data.lng) : null;

                const mission = missions.find(m => m.name === missionName);
                if (mission) {
                    // Only drop the red cross if it's an explicit "Enter" search
                    if (isFinal) {
                        selectMission(mission, null, userLat, userLng);
                    } else {
                        renderMissions([mission], false, true); // Just show it in the sidebar list
                    }
                    
                    if (routingType && routingType.startsWith('cross_accredited')) {
                        statusLabel.textContent = `No local presence. Routing to accredited mission: ${missionName}`;
                    } else {
                        statusLabel.textContent = `Routed to ${missionName}`;
                    }
                    statusLabel.style.color = "#4ade80"; // green
                    setTimeout(() => { if (statusLabel.textContent.includes("Routed")) statusLabel.textContent = ""; }, 3000);
                } else {
                    if (missionName === "MFA HQ") {
                        statusLabel.textContent = `No resident mission in this location.`;
                        statusLabel.style.color = "#facc15"; // yellow
                        
                        // Only pan/zoom and drop the cross if it's an explicit "Enter" search
                        if (isFinal && userLat !== null && userLng !== null) {
                            map.flyTo([userLat, userLng], 4, { duration: 1.5 });
                            
                            if (userMarker) map.removeLayer(userMarker);
                            const crossIcon = L.divIcon({
                                className: 'custom-cross-icon',
                                html: `<div style="color: #ef4444; font-size: 28px; font-weight: bold; text-align: center; line-height: 28px; text-shadow: 0 0 10px rgba(0,0,0,0.8);">×</div>`,
                                iconSize: [28, 28],
                                iconAnchor: [14, 14]
                            });
                            userMarker = L.marker([userLat, userLng], { icon: crossIcon }).addTo(map);
                        }
                    } else {
                        statusLabel.textContent = `No match for "${missionName}"`;
                        statusLabel.style.color = "#facc15"; // yellow
                    }
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    // Ignored, user kept typing
                    console.log('Aborted smart search for', location);
                } else {
                    console.error('Smart Search Error:', error);
                    statusLabel.textContent = 'Routing unavailable. Try again.';
                    statusLabel.style.color = "#ef4444"; // red
                }
            } finally {
                // If this is the current active request, turn off spinner
                if (currentAbortController && currentAbortController.signal === signal) {
                    spinner.classList.remove('active');
                    currentAbortController = null;
                }
            }
        }

        function highlightCoverage(coverage) {
            if (!countryLayer || !coverage) return;
            
            const normalizedCoverage = coverage.map(normalizeCountryName);
            
            countryLayer.setStyle(f => {
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

        function resetShading() {
            if (countryLayer) {
                countryLayer.setStyle({
                    fillColor: 'transparent',
                    weight: 0,
                    opacity: 0,
                    fillOpacity: 0
                });
            }
        }

        function selectMission(m, item = null, userLat = null, userLng = null) {
            const capitalMissions = ['Embassy', 'High Commission', 'Trade Office', 'Permanent Mission'];
            
            // UI state
            document.querySelectorAll('.mission-item').forEach(i => i.classList.remove('active'));
            if (item) {
                item.classList.add('active');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                // Find and highlight in list if not provided
                const listItems = document.querySelectorAll('.mission-item');
                for (const li of listItems) {
                    if (li.querySelector('.name').textContent === m.name) {
                        li.classList.add('active');
                        li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        break;
                    }
                }
            }

            if (userMarker) {
                map.removeLayer(userMarker);
                userMarker = null;
            }

            let targetLat = userLat !== null ? userLat : m.lat;
            let targetLng = userLng !== null ? userLng : m.lng;

            // Offset for mobile bottom sheet
            if (window.innerWidth <= 768) {
                targetLat -= 1.5; // Offset to keep marker in top half
            }

            if (userLat !== null && userLng !== null) {
                map.flyTo([targetLat, targetLng], 6, { duration: 1.5 });
                const crossIcon = L.divIcon({
                    className: 'custom-cross-icon',
                    html: `<div style="color: #ef4444; font-size: 28px; font-weight: bold; text-align: center; line-height: 28px; text-shadow: 0 0 10px rgba(0,0,0,0.8);">×</div>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                });
                userMarker = L.marker([userLat, userLng], { icon: crossIcon }).addTo(map);
            } else {
                map.flyTo([targetLat, targetLng], 6, { duration: 1.5 });
            }
            
            showInfoPanel(m);
            
            resetShading();
        }

        function showInfoPanel(m) {
            // "Covers" display and shading only for Embassies, High Commissions, and Taipei Trade Office
            const isCapitalMission = m.type === 'Embassy' || m.type === 'High Commission' || (m.type === 'Trade Office' && m.city === 'Taipei');
            
            const coverageAttr = m.coverage ? m.coverage : [m.country];
            const coverageJson = JSON.stringify(coverageAttr).replace(/'/g, "&apos;");
            
            const showCoverageBtn = isCapitalMission ? 
                `<button class="btn btn-primary" style="flex: 1; border: 1px solid var(--border-glass); background: rgba(56, 189, 248, 0.1); color: var(--accent-blue);" onclick='highlightCoverage(${coverageJson})'>Show Coverage</button>` : '';

            const coversRow = isCapitalMission ? `
                <div class="info-row">
                    <div class="info-label">Covers</div>
                    <div class="info-value">${m.coverage ? m.coverage.join(', ') : m.country}</div>
                </div>
            ` : '';

            const phoneRow = m.phone ? `
                <div class="info-row">
                    <div class="info-label">Phone</div>
                    <div class="info-value"><a href="tel:${m.phone}" style="color: var(--accent-blue); text-decoration: none;">${m.phone}</a></div>
                </div>
            ` : '';

            const emailRow = m.email ? `
                <div class="info-row">
                    <div class="info-label">Email</div>
                    <div class="info-value"><a href="mailto:${m.email}" style="color: var(--accent-blue); text-decoration: none;">${m.email}</a></div>
                </div>
            ` : '';

            const emergencyRow = m.emergency ? `
                <div class="info-row">
                    <div class="info-label">Emergency</div>
                    <div class="info-value"><span style="color: #ef4444; font-weight: 600;">${m.emergency}</span></div>
                </div>
            ` : '';

            const appointmentRow = m.hours && m.hours.by_appointment !== undefined ? `
                <div class="info-row">
                    <div class="info-label">Appointment</div>
                    <div class="info-value">${m.hours.by_appointment ? 'Required' : 'Not Required'}</div>
                </div>
            ` : '';

            let hoursHtml = 'N/A';
            if (m.hours && m.hours.schedule) {
                const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
                const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                
                let groups = [];
                let currentGroup = null;
                
                for (let i = 0; i < days.length; i++) {
                    const h = m.hours.schedule[days[i]];
                    if (!currentGroup) {
                        currentGroup = { startDay: dayNames[i], endDay: dayNames[i], hours: h };
                    } else if (currentGroup.hours === h) {
                        currentGroup.endDay = dayNames[i];
                    } else {
                        groups.push(currentGroup);
                        currentGroup = { startDay: dayNames[i], endDay: dayNames[i], hours: h };
                    }
                }
                if (currentGroup) groups.push(currentGroup);
                
                hoursHtml = groups.map(g => {
                    const dayStr = g.startDay === g.endDay ? g.startDay : `${g.startDay}-${g.endDay}`;
                    return `<div style="display: flex; justify-content: space-between; gap: 8px;"><span style="color: var(--text-dim);">${dayStr}</span> <span>${g.hours}</span></div>`;
                }).join('');
            }

            const hoursRow = m.hours ? `
                <div class="info-row" style="flex-direction: column; align-items: flex-start; gap: 4px;">
                    <div class="info-label">Operating Hours <span style="font-size: 0.75rem; color: var(--text-dim);">(${m.hours.timezone || ''})</span></div>
                    <div class="info-value" style="width: 100%;">${hoursHtml}</div>
                </div>
            ` : '';

            const content = `
                <div class="popup-content" style="padding: 0;">
                    <h3 style="font-size: 1.25rem; margin-top: 8px; margin-bottom: 16px;">${m.name}</h3>
                    <div class="info-row">
                        <div class="info-label">Address</div>
                        <div class="info-value">${m.address}</div>
                    </div>
                    ${phoneRow}
                    ${emailRow}
                    ${emergencyRow}
                    ${appointmentRow}
                    ${hoursRow}
                    ${coversRow}
                    <div class="popup-actions" style="display: flex; gap: 8px; margin-top: 16px;">
                        <a href="${m.website}" target="_blank" class="btn btn-primary" style="flex: 1;">Official Site</a>
                        ${showCoverageBtn}
                    </div>
                </div>
            `;
            document.getElementById('info-content').innerHTML = content;
            document.getElementById('info-panel').classList.add('visible');
        }

        function closeInfoPanel() {
            document.getElementById('info-panel').classList.remove('visible');
            document.querySelectorAll('.mission-item').forEach(i => i.classList.remove('active'));
            resetShading();
            if (userMarker) {
                map.removeLayer(userMarker);
                userMarker = null;
            }
        }

        function renderMissions(data, updateMap = true, updateList = true) {
            const list = document.getElementById('list');
            if (updateList) list.innerHTML = '';
            
            if (updateMap) {
                markers.forEach(m => map.removeLayer(m));
                markers = [];
            }

            data.forEach(m => {
                if (m.lat && m.lng) {
                    if (updateMap) {
                        // Determine marker color based on mission type rules
                        let color = '#38bdf8'; // Default accent blue
                        if (['Embassy', 'High Commission'].includes(m.type) || (m.type === 'Trade Office' && m.city === 'Taipei')) {
                            color = '#D94B4B'; // Diplomatic Red
                        } else if (['Consulate-General', 'Consulate', 'Permanent Mission'].includes(m.type)) {
                            color = '#3B82F6'; // Consular Blue
                        } else if (['Honorary Consulate', 'Honorary Consulate-General'].includes(m.type)) {
                            color = '#F4B942'; // Ambassador Gold
                        }

                        const icon = L.divIcon({
                            className: 'custom-div-icon',
                            html: `<div class="custom-marker" style="background: ${color}; box-shadow: 0 0 12px ${color};" id="marker-${m.name.replace(/\s+/g, '-')}"></div>`,
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]
                        });

                        const marker = L.marker([m.lat, m.lng], { icon }).addTo(map);

                        // Popup replaced with info panel
                        marker.on('click', () => selectMission(m));
                        markers.push(marker);
                        m.marker = marker;
                    }

                    // Add to list
                    if (updateList) {
                        const item = document.createElement('div');
                        item.className = 'mission-item';
                        item.innerHTML = `
                            <span class="name">${m.name}</span>
                            <div class="location">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                ${m.city}, ${m.country}
                            </div>
                            <span class="type-badge">${m.type}</span>
                        `;
                        
                        item.onclick = () => selectMission(m, item);
                        list.appendChild(item);
                    }
                }
            });
        }

        window.onload = init;