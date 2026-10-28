// The layers over the planet on Generate and Import — Evolution's bar (plans/VIEW_UI_PLAN.md): Terrain · Satellite ·
// Climate (its own row: Köppen · Temperature · Rain · Wind · Currents · More…, and the season where the layer has
// seasons) · Heightmap · Plates (Generate). On a phone, one list (#mobileViewSwitch). The layer ids are the pages':
// '' the terrain, 'biome' Satellite, 'landheightmap', 'plates' (the plate colours), the climate's Inspect ids
// (js/climate-layers.js); any other — the sidebar's Inspect list — lights no tab.

import { climateLayer } from './climate-layers.js';

/** The climate maps under the Climate tab: its five tabs and its More… list. */
const CLIMATE_MAPS = new Set(['koppen', 'temperature', 'precip', 'wind', 'currents', 'pressure', 'upwelling', 'ice', 'tempRange', 'rainShadow', 'aridity', 'growing', 'rainSeason']);

/**
 * Wire the bar: `onLayer(layer)` when a tab, a climate map or the phone's list is chosen.
 * @returns {{ sync(layer: string): void }} lights the tabs (and shows the season) for the layer shown
 */
export function initLayerBar(onLayer) {
    const $ = (id) => document.getElementById(id);
    const tabs = $('mapTabs'), sub = $('subBar'), climateTabs = $('climateTabs'), more = $('climateMore'), season = $('climateSeason'), phone = $('mobileViewSwitch');
    let climate = 'koppen';             // (the Climate tab opens on the climate map last shown)
    const pick = (layer) => onLayer(layer === 'climate' ? climate : layer);
    tabs.addEventListener('click', (e) => { const t = e.target.closest('.map-tab'); if (t) pick(t.dataset.layer); });
    climateTabs.addEventListener('click', (e) => { const t = e.target.closest('.map-tab'); if (t) pick(t.dataset.layer); });
    more.addEventListener('change', () => { if (more.value) pick(more.value); });
    phone?.addEventListener('change', () => pick(phone.value));
    return {
        sync(layer) {
            const isClimate = CLIMATE_MAPS.has(layer), seasonal = !!climateLayer(layer)?.seasonal || layer === 'biome';
            if (isClimate) climate = layer;
            for (const t of tabs.querySelectorAll('.map-tab')) t.classList.toggle('active', t.dataset.layer === layer || (t.dataset.layer === 'climate' && isClimate));
            for (const t of climateTabs.querySelectorAll('.map-tab')) t.classList.toggle('active', t.dataset.layer === layer);
            const inMore = !!more.querySelector(`option[value="${layer}"]`);
            more.value = inMore ? layer : ''; more.classList.toggle('active', inMore);
            sub.hidden = !isClimate && !seasonal;
            climateTabs.hidden = more.hidden = !isClimate;
            season.hidden = !seasonal;
            if (phone) phone.value = [...phone.options].some(o => o.value === layer) ? layer : 'inspect';
        },
    };
}
