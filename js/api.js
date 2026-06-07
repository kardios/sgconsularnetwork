export async function performLogin(password) {
    return await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });
}

export async function loadInitialData() {
    const [missionsRes, countriesRes, mappingRes] = await Promise.all([
        fetch('missions.json'),
        fetch('countries.json'),
        fetch('country_mapping.json')
    ]);

    if (missionsRes.status === 401 || countriesRes.status === 401 || mappingRes.status === 401) {
        throw new Error('Unauthorized');
    }

    if (!missionsRes.ok || !countriesRes.ok || !mappingRes.ok) {
        throw new Error('Failed to load data');
    }

    const missions = await missionsRes.json();
    const mappingData = await mappingRes.json();
    const countriesGeoJSON = await countriesRes.json();

    return { missions, mappingData, countriesGeoJSON };
}



export async function routeLocation(location, signal) {
    const response = await fetch('/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location }),
        signal
    });
    if (!response.ok) throw new Error('Routing failed');
    return await response.json();
}
