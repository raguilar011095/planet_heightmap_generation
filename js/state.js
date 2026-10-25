// Shared mutable application state.
// All modules import this same object, so mutations are visible everywhere.
export const state = {
    planetMesh: null,
    wireMesh: null,
    arrowGroup: null,
    windArrowGroup: null,
    curData: null,
    plateColors: {},
    _hoverBackup: null,
    hoveredPlate: -1,
    hoveredRegion: -1,
    hoveredKoppen: -1,
    _koppenHoverBackup: null,
    _mapKoppenHoverBackup: null,
    mapMesh: null,
    mapFaceToSide: null,
    _mapHoverBackup: null,
    mapGridMesh: null,
    globeGridMesh: null,
    gridEnabled: true,
    gridSpacing: 15,
    mapMode: false,
    mapCenterLon: 0,
    mapProjection: 'equirect',  // the map view's projection and its options (js/map-projection.js)
    mapProjOpts: {},
    dragStart: null,
    debugLayer: '',
    showPlates: false,          // the Plates tab (Generate): the plate colours, with no other layer
    climateSeason: 'year',       // the climate's Inspect layers: 'year', 'jan' or 'jul' (js/climate-layers.js)
    palette: 'classic',         // the Terrain view's colours (js/terrain-palette.js)
    isTouchDevice: ('ontouchstart' in window) || (navigator.maxTouchPoints > 0),
    editMode: false,
    oceanCurrentArrowGroup: null,
    climateComputed: false,
    pendingToggles: new Set(),
    _pendingBackup: null,
    _mapPendingBackup: null,
    importedHeightmap: false,
};
