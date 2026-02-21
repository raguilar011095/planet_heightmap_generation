// Shared mutable application state.
// All modules import this same object, so mutations are visible everywhere.
export const state = {
    planetMesh: null,
    wireMesh: null,
    arrowGroup: null,
    curData: null,
    plateColors: {},
    baseColors: null,
    hoveredPlate: -1,
    mapMesh: null,
    mapFaceToSide: null,
    mapBaseColors: null,
    mapMode: false,
    dragStart: null,
    debugLayer: '',
};
