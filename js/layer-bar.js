// The layers over the planet on Generate and Import — Evolution's bar (plans/VIEW_UI_PLAN.md): Terrain · Satellite ·
// Climate (its own row: Köppen · Temperature · Rain · Wind · Currents · More…, and the season where the layer has
// seasons) · Heightmap · Plates (Generate). On a phone, one list (#mobileViewSwitch). The layer ids are the pages':
// '' the terrain, 'biome' Satellite, 'landheightmap', 'plates' (the plate colours), the climate's Inspect ids
// (js/climate-layers.js); any other — the sidebar's Inspect list — lights no tab.
// The present-day world (?next=1; plans/GENERATE_REDESIGN_PLAN.md G7e) adds Geology (Rocks · Deposits · Ages, with the
// deposit's and the age's pickers) and Food (Farmland · Staple food · Lifestyle · People · Soil · Growing season), each its
// own row, as Evolution's (js/present-layers-view.js).

import { climateLayer } from './climate-layers.js';
import { isGeologyLayer, isFoodLayer, pick as presentPick } from './present-layers-view.js';

/** The climate maps under the Climate tab: its five tabs and its More… list. */
const CLIMATE_MAPS = new Set(['koppen', 'temperature', 'precip', 'wind', 'currents', 'pressure', 'upwelling', 'ice', 'tempRange', 'rainShadow', 'aridity', 'growing', 'rainSeason']);

/**
 * Wire the bar: `onLayer(layer)` when a tab, a climate map or the phone's list is chosen.
 * @returns {{ sync(layer: string): void }} lights the tabs (and shows the season) for the layer shown
 */
export function initLayerBar(onLayer) {
    const $ = (id) => document.getElementById(id);
    const tabs = $('mapTabs'), sub = $('subBar'), climateTabs = $('climateTabs'), more = $('climateMore'), season = $('climateSeason'), phone = $('mobileViewSwitch');
    const geoTabs = $('geologyTabs'), foodTabs = $('foodTabs'), depPick = $('depositPick'), agePick = $('agePick');
    // (the present-day world's tabs only with ?next=1)
    const next = new URLSearchParams(location.search).has('next');
    for (const el of document.querySelectorAll('#mapTabs [data-present]')) el.hidden = !next;
    if (!next) for (const el of document.querySelectorAll('#mobileViewSwitch [data-present]')) el.remove();
    let climate = 'koppen', geology = 'geoRocks', food = 'farmLand', shown = '';   // (each tab opens on its map last shown)
    const pick = (layer) => onLayer(layer === 'climate' ? climate : layer === 'geology' ? geology : layer === 'food' ? food : layer);
    tabs.addEventListener('click', (e) => { const t = e.target.closest('.map-tab'); if (t) pick(t.dataset.layer); });
    climateTabs.addEventListener('click', (e) => { const t = e.target.closest('.map-tab'); if (t) pick(t.dataset.layer); });
    geoTabs?.addEventListener('click', (e) => { const t = e.target.closest('.map-tab'); if (t) pick(t.dataset.layer); });
    foodTabs?.addEventListener('click', (e) => { const t = e.target.closest('.map-tab'); if (t) pick(t.dataset.layer); });
    // (the Deposits view's system and the Ages view's age: the same view drawn again)
    depPick?.addEventListener('change', () => { presentPick.deposit = depPick.value || 'all'; onLayer(shown); });
    agePick?.addEventListener('change', () => { presentPick.age = agePick.value; presentPick.ageRes = 'all'; onLayer(shown); });
    more.addEventListener('change', () => { if (more.value) pick(more.value); });
    phone?.addEventListener('change', () => pick(phone.value));
    return {
        sync(layer) {
            shown = layer;
            const isClimate = CLIMATE_MAPS.has(layer), seasonal = !!climateLayer(layer)?.seasonal || layer === 'biome';
            const isGeo = isGeologyLayer(layer), isFood = isFoodLayer(layer);
            if (isClimate) climate = layer;
            if (isGeo) geology = layer;
            if (isFood) food = layer;
            for (const t of tabs.querySelectorAll('.map-tab')) t.classList.toggle('active', t.dataset.layer === layer || (t.dataset.layer === 'climate' && isClimate)
                || (t.dataset.layer === 'geology' && isGeo) || (t.dataset.layer === 'food' && isFood));
            for (const row of [climateTabs, geoTabs, foodTabs]) if (row) for (const t of row.querySelectorAll('.map-tab')) t.classList.toggle('active', t.dataset.layer === layer);
            const inMore = !!more.querySelector(`option[value="${layer}"]`);
            more.value = inMore ? layer : ''; more.classList.toggle('active', inMore);
            sub.hidden = !isClimate && !seasonal && !isGeo && !isFood;
            climateTabs.hidden = more.hidden = !isClimate;
            if (geoTabs) geoTabs.hidden = !isGeo;
            if (foodTabs) foodTabs.hidden = !isFood;
            if (depPick) depPick.hidden = layer !== 'geoDeposits';
            if (agePick) agePick.hidden = layer !== 'geoAges';
            season.hidden = !seasonal;
            if (phone) phone.value = [...phone.options].some(o => o.value === layer) ? layer : 'inspect';
        },
    };
}
