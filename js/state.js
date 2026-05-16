export const state = {
    map: null,
    missions: [],
    markers: [],
    countryLayer: null,
    userMarker: null,
    countryNameMap: {},
    globalAdvisories: [],
    advisoryLayerGroup: null
};

export function normalizeCountryName(name) {
    return state.countryNameMap[name] || name;
}
