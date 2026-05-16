import { state, normalizeCountryName } from './state.js';
import { selectMission } from './map.js';

export function getMissionLocalStatus(hours) {
    if (!hours || !hours.timezone || !hours.schedule) {
        return { isOpen: false, localTime: 'N/A', localDate: 'N/A', statusText: 'Status Unknown', statusClass: 'status-closed' };
    }

    const now = new Date();
    const timeZone = hours.timezone;

    try {
        const localTimeStr = now.toLocaleTimeString('en-SG', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
        const localDateStr = now.toLocaleDateString('en-SG', { timeZone, weekday: 'short', day: 'numeric', month: 'short' });
        const day = new Intl.DateTimeFormat('en-SG', { weekday: 'short', timeZone }).format(now).toLowerCase();

        const daySchedule = hours.schedule[day];
        let isOpen = false;
        let statusText = 'Closed';
        let statusClass = 'status-closed';

        if (daySchedule && daySchedule !== 'closed') {
            const ranges = daySchedule.split(',');
            isOpen = ranges.some(range => {
                const [start, end] = range.split('-');
                return localTimeStr >= start && localTimeStr <= end;
            });
        }

        if (isOpen) {
            statusText = 'Open Now';
            statusClass = 'status-open';
        }

        return { isOpen, localTime: localTimeStr, localDate: localDateStr, statusText, statusClass };
    } catch (e) {
        console.error('Error calculating local status:', e);
        return { isOpen: false, localTime: 'Error', localDate: 'Error', statusText: 'Status Error', statusClass: 'status-closed' };
    }
}

export function showInfoPanel(m) {
    const isCapitalMission = m.type === 'Embassy' || m.type === 'High Commission' || (m.type === 'Trade Office' && m.city === 'Taipei');
    
    const template = document.getElementById('tpl-info-panel');
    const contentDiv = document.getElementById('info-content');
    contentDiv.innerHTML = ''; // clear old
    
    const clone = template.content.cloneNode(true);
    
    clone.querySelector('.tpl-name').textContent = m.name;
    
    if (m.address) {
        clone.querySelector('.tpl-address').textContent = m.address;
    } else {
        clone.querySelector('.tpl-address-row').style.display = 'none';
    }
    
    if (m.phone) {
        const phoneA = clone.querySelector('.tpl-phone');
        phoneA.textContent = m.phone;
        phoneA.href = `tel:${m.phone}`;
    } else {
        clone.querySelector('.tpl-phone-row').style.display = 'none';
    }
    
    if (m.email) {
        const emailA = clone.querySelector('.tpl-email');
        emailA.textContent = m.email;
        emailA.href = `mailto:${m.email}`;
    } else {
        clone.querySelector('.tpl-email-row').style.display = 'none';
    }
    
    if (m.emergency) {
        clone.querySelector('.tpl-emergency').textContent = m.emergency;
    } else {
        clone.querySelector('.tpl-emergency-row').style.display = 'none';
    }
    
    if (m.hours && m.hours.by_appointment !== undefined) {
        clone.querySelector('.tpl-appointment').textContent = m.hours.by_appointment ? 'Required' : 'Not Required';
    } else {
        clone.querySelector('.tpl-appointment-row').style.display = 'none';
    }
    
    if (m.hours && m.hours.schedule) {
        const { localTime, localDate, statusText, statusClass } = getMissionLocalStatus(m.hours);
        clone.querySelector('.tpl-status').textContent = statusText;
        clone.querySelector('.tpl-status').className = `status-badge tpl-status ${statusClass}`;
        clone.querySelector('.tpl-local-datetime').textContent = `${localDate}, ${localTime}`;
        
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

        const hoursHtml = groups.map(g => {
            const dayStr = g.startDay === g.endDay ? g.startDay : `${g.startDay}-${g.endDay}`;
            return `<div style="display: flex; justify-content: space-between; gap: 8px;"><span style="color: var(--text-dim);">${dayStr}</span> <span>${g.hours.replace(/,/g, ', ')}</span></div>`;
        }).join('');
        
        clone.querySelector('.tpl-hours-list').innerHTML = hoursHtml;
    } else {
        clone.querySelector('.tpl-hours-row').style.display = 'none';
    }
    
    if (isCapitalMission) {
        const coverageAttr = m.coverage ? m.coverage : [m.country];
        clone.querySelector('.tpl-covers').textContent = coverageAttr.join(', ');
        
        const coverageBtn = clone.querySelector('.tpl-coverage-btn');
        coverageBtn.addEventListener('click', () => {
            import('./map.js').then(module => {
                module.highlightCoverage(coverageAttr);
            });
        });
    } else {
        clone.querySelector('.tpl-covers-row').style.display = 'none';
        clone.querySelector('.tpl-coverage-btn').style.display = 'none';
    }
    
    if (m.website) {
        clone.querySelector('.tpl-website').href = m.website;
    } else {
        clone.querySelector('.tpl-website').style.display = 'none';
    }
    
    contentDiv.appendChild(clone);
    document.getElementById('info-panel').classList.add('visible');
}

export function closeInfoPanel() {
    document.getElementById('info-panel').classList.remove('visible');
    document.querySelectorAll('.mission-item').forEach(i => i.classList.remove('active'));
    import('./map.js').then(module => {
        module.resetShading();
        if (state.userMarker) {
            state.map.removeLayer(state.userMarker);
            state.userMarker = null;
        }
    });
}

export function renderMissionsList(data) {
    const list = document.getElementById('list');
    list.innerHTML = '';

    data.forEach(m => {
        if (m.lat && m.lng) {
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
    });
}

export function checkAndDisplayAdvisory(countries) {
    const alertBox = document.getElementById('search-advisory-alert');
    if (!alertBox) return;

    if (!countries || countries.length === 0) {
        alertBox.style.display = 'none';
        return;
    }
    
    let matchedAds = [];
    for (const c of countries) {
        const normalizedC = normalizeCountryName(c);
        const ads = state.globalAdvisories.filter(a => a.country.toLowerCase() === normalizedC.toLowerCase());
        matchedAds = matchedAds.concat(ads);
    }
    
    if (matchedAds.length > 0) {
        alertBox.style.display = 'flex';
        alertBox.style.flexDirection = 'column';
        alertBox.innerHTML = ''; // clear old
        
        const hasAdvisory = matchedAds.some(a => a.type === 'advisory');
        const bgColor = hasAdvisory ? 'rgba(248, 113, 113, 0.15)' : 'rgba(250, 204, 21, 0.15)';
        const borderColor = hasAdvisory ? 'rgba(248, 113, 113, 0.4)' : 'rgba(250, 204, 21, 0.4)';
        const textColor = hasAdvisory ? '#f87171' : '#facc15';
        const text = hasAdvisory ? 'Travel Advisory' : 'Travel Notice';
        const countryStr = [...new Set(matchedAds.map(a => a.country))].join(', ');
        
        alertBox.style.background = bgColor;
        alertBox.style.border = `1px solid ${borderColor}`;
        
        const template = document.getElementById('tpl-advisory-banner');
        const clone = template.content.cloneNode(true);
        
        const bannerLink = clone.querySelector('.tpl-banner-link');
        bannerLink.href = matchedAds[0].link;
        bannerLink.style.color = textColor;
        clone.querySelector('.tpl-banner-text').textContent = `${text} for ${countryStr}`;
        
        const listDiv = clone.querySelector('.tpl-advisory-list');
        listDiv.style.borderTop = `1px solid ${borderColor}`;
        
        matchedAds.forEach((adv, idx) => {
            const itemColor = adv.type === 'advisory' ? '#f87171' : '#facc15';
            
            const div = document.createElement('div');
            div.className = 'advisory-item';
            div.dataset.idx = idx;
            div.style.cssText = 'cursor: pointer; display: flex; align-items: flex-start; gap: 8px; padding: 6px; border-radius: 8px; transition: background 0.2s;';
            div.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="${itemColor}" style="margin-top: 2px; flex-shrink: 0;"><path d="M5 21V4h9l1 2h5v10h-7l-1-2H7v7H5z"/></svg>
                <span style="font-size: 0.8rem; color: var(--text-main); line-height: 1.3;">${adv.title}</span>
            `;
            
            div.addEventListener('mouseenter', () => div.style.background = 'rgba(255, 255, 255, 0.05)');
            div.addEventListener('mouseleave', () => div.style.background = 'transparent');
            div.addEventListener('click', () => {
                if (adv && adv.marker) {
                    state.map.flyTo([adv.lat, adv.lng], 6, { duration: 1.0 });
                    setTimeout(() => {
                        adv.marker.openTooltip();
                    }, 500);
                }
            });
            listDiv.appendChild(div);
        });
        
        alertBox.appendChild(clone);
    } else {
        alertBox.style.display = 'none';
    }
}
