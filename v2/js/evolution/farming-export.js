// The Food tab's rows of the export panel (view/export-panel.js), shared by the pages that show it: Evolution
// (export.js draws them from a finished moment's picture) and Generate with the present-day world (js/export-generate.js
// draws them from its mesh). Moved here unchanged from export.js.

import { farmOptions } from './farming-view.js';
import { STAPLE_WORDS, TECHNIQUES } from '../farming/farming.js';
import { LIFESTYLE_WORDS, GATHER } from '../farming/living.js';

/** The Food data maps' scales (linear, as export-raster.js's; the staple foods' and the lifestyles' indices listed in the README). */
export const FARM_SCALES = {
    farmland:  { unit: 'farmland (0 barren … 1 the richest: the Farmland view\'s ramp)', lo: 0, hi: 1 },
    people:    { unit: 'people a km² (pre-industrial)', lo: 0, hi: 1000 },
    soil:      { unit: 'soil fertility (0 barren … 1 the richest)', lo: 0, hi: 1 },
    season:    { unit: 'months crops grow', lo: 0, hi: 12 },
    staple:    { unit: 'staple food index (0 = nothing or sea; the README lists them)', lo: 0, hi: 255 },
    lifestyle: { unit: 'lifestyle index (0 = uninhabited or sea; the README lists them)', lo: 0, hi: 255 },
};
const farmData = (key, suffix, label, scale, bits = 16) => ({ key, suffix, label, scale: FARM_SCALES[scale], bits });
/** The README's lists of the staple foods and the lifestyles (the index files' numbers), when the export has them. */
export const staplesList = files => [...(files.some(f => f.file?.key === 'staple') ? [{ title: 'Staple foods (the number in the staple food index file)', items: STAPLE_WORDS }] : []),
    ...(files.some(f => f.file?.key === 'lifestyle') ? [{ title: 'Lifestyles (the number in the lifestyle index file)', items: LIFESTYLE_WORDS }] : [])];

/** The Food group of the export panel: the Food views as shown — with the techniques chosen in its legend — and their
 *  data maps the numbers themselves. */
export const FOOD_GROUP = { id: 'farming', label: 'Food', rows: [
    { id: 'farmLand', label: 'Farmland', colour: true, needs: 'farming', data: [farmData('farmTech', 'watered', 'Farmland with the techniques chosen', 'farmland'), farmData('farmRain', 'rain', 'Farmland by rain alone', 'farmland')], tip: 'What the land could grow, with the farming techniques chosen in its legend; as data, with them and by rain alone' },
    { id: 'farmStaple', label: 'Staple food', colour: true, needs: 'farming', data: [farmData('staple', 'index', 'Staple food index', 'staple', 8)], tip: 'What each place would live on most — paddy grains, cool- or warm-season grains, roots and tubers, livestock, fish or wild foods; as data, each food’s index (the README lists them)' },
    { id: 'farmLife', label: 'Lifestyle', colour: true, needs: 'farming', data: [farmData('lifestyle', 'index', 'Lifestyle index', 'lifestyle', 8)], tip: 'How each place’s people would live — farming, herding or gathering; as data, each lifestyle’s index (the README lists them)' },
    { id: 'farmPeople', label: 'People', colour: true, needs: 'farming', data: [farmData('people', '', 'People a km²', 'people')], tip: 'How many people the land could feed, pre-industrial, a km²' },
    { id: 'farmSoil', label: 'Soil', colour: true, needs: 'farming', data: [farmData('soil', '', 'Soil fertility', 'soil')], tip: 'How fertile the ground is' },
    { id: 'farmSeason', label: 'Growing season', colour: true, needs: 'farming', data: [farmData('seasonRain', 'rain', 'Growing season by rain alone', 'season'), farmData('seasonWatered', 'watered', 'Growing season, watered', 'season')], tip: 'The months crops grow, as its legend shows; as data, by rain alone and watered' },
] };

/** The Food views' choices, for the README: the techniques on, how firmly gatherers hold on. */
export function farmingNote() {
    const on = TECHNIQUES.filter(k => farmOptions[k]);
    return `Food maps: as its legend shows them — techniques ${on.length ? on.join(', ') : 'none (rain alone)'}; ` +
        `gatherers holding on unless farming or herding feeds ${GATHER.hold}× as many`;
}

