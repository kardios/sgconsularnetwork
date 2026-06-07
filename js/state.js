export const state = {
    map: null,
    missions: [],
    markers: [],
    countryLayer: null,
    userMarker: null,
    countryNameMap: {}
};

export function normalizeCountryName(name) {
    return state.countryNameMap[name] || name;
}
