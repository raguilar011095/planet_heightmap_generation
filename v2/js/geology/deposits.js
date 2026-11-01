// Deposit systems (plans/V2_GEOLOGY_PLAN.md G3 and G4; Madeline James's deposit types; research §2, §4–6): where each kind
// of ore, fuel and industrial mineral formed on a finished moment, and whether it survives at a reach a people could dig.
//
// Each system is a MINERAL SYSTEM — a source, a way up and a trap, the right timing — and its EXPOSURE: how deep it formed
// against how deep erosion has cut since (buried → exposed → worn away), all smooth weightings (no hard cut-offs). The
// history's record (tectonics/step/geology.js) gives the settings and the wear, per sim cell; the finished moment gives
// the rock at the surface (rocks.js: a deposit in the basement hides under cover), the climate (laterites, salt, peat,
// enriched copper), the rivers (placers carried down from their sources) and the ice (which strips placers). Deposits
// cluster in districts (noise of each system's own, its share of the permissive ground), so a belt is a chain of
// districts, never a smear. Each cell's richness 0…1 is banded poor · moderate · rich (GEOLOGY.deposits.grades); the
// page shows them as soft washes over the land, off a 0.25° grid (each grid cell the richest of its cells).
//
// G3 — from the history: porphyry copper and epithermal gold over arcs (zoned across an Andean belt, tin far inboard),
// orogenic gold in old belts and sutures, VMS on docked arcs and ophiolites, skarns where granite meets limestone, MVT
// and SEDEX lead-zinc in foreland platforms and rift basins, IOCG on reworked craton edges, nickel and platinum under
// flood basalts at craton edges, layered intrusions, native copper in rift basalts, kimberlites on some old cratons, the
// shields' greenstone gold and banded iron, one world's fossil gold reef — and oil and gas (source, burial, trap, seal).
// G4 — from the climate and the rivers: bauxite and laterites, enriched copper, gossans, placers, salt, ironstones,
// bog iron, coal, peat and wood.

import { CrustType, CrustFlag, OrogenyType, VolcanicType } from '../tectonics/model/crust.js';
import { GeoFlag, decodeCoverKm, decodeExhumKm, decodeUnroofKm, decodeFacies, decodeArcMyr, decodeAge, decodeFloodMyr } from '../tectonics/model/geology.js';
import { FastNoise } from '../core/fast-noise.js';
import { LatLonGrid } from '../finish/finish-grid.js';
import { Biome } from '../finish/finish-cover.js';
import { Rock, ROCK_COUNT, simRocks, hash01, bedTops, B_GRANITE, NB } from './rocks.js';
import { GEOLOGY } from './geology-config.js';
import { DistrictShapes } from './district-shapes.js';

const R = 6371;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
/** A depth window: 0 while buried (erosion short of `top`), 1 while exposed, 0 again once worn past `bottom` (km). */
const window = (E, top, bottom, w = 0.5) => smooth(top - w, top + w, E) * (1 - smooth(bottom - w, bottom + w, E));

/** The systems, in the order they are kept. group: metal (G3), fuel, mineral (G4); rgb: the wash's colour. */
export const DEPOSITS = [
    // ── G3: metals from the history ──
    { id: 'porphyry', name: 'Porphyry copper', yields: 'copper, molybdenum, gold', group: 'metal', rgb: [226, 116, 52], words: 'formed 1–4 km beneath a volcanic arc; bared some 10–40 Myr after' },
    { id: 'epithermal', name: 'Epithermal gold-silver', yields: 'gold, silver', group: 'metal', rgb: [246, 206, 70], words: 'hot springs over a young arc; gone once erosion takes a kilometre' },
    { id: 'orogenicGold', name: 'Orogenic gold', yields: 'gold', group: 'metal', rgb: [238, 184, 40], words: 'quartz veins deep in a collision belt, bared as it wears' },
    { id: 'vms', name: 'Massive sulfide', yields: 'copper, zinc, gold, silver', group: 'metal', rgb: [196, 84, 64], words: 'sea-floor vents of an arc or a back-arc, docked onto land' },
    { id: 'skarn', name: 'Skarn', yields: 'copper, iron, zinc, gold', group: 'metal', rgb: [214, 96, 150], words: 'where granite was pushed into limestone' },
    { id: 'mvt', name: 'Lead-zinc in limestone', yields: 'lead, zinc', group: 'metal', rgb: [120, 136, 196], words: 'brines driven through limestone by a rising range (Mississippi Valley type)' },
    { id: 'sedex', name: 'Lead-zinc-silver in shale', yields: 'lead, zinc, silver', group: 'metal', rgb: [150, 120, 200], words: 'vents on a rift basin\'s muddy floor (sedimentary exhalative)' },
    { id: 'tin', name: 'Tin-tungsten', yields: 'tin, tungsten', group: 'metal', rgb: [70, 190, 200], words: 'granites of melted sediment, far inboard of a collision or an arc — scarce' },
    { id: 'iocg', name: 'Iron oxide copper-gold', yields: 'iron, copper, gold', group: 'metal', rgb: [168, 92, 60], words: 'a craton\'s edge, reworked by later belts or plumes' },
    { id: 'magmatic', name: 'Nickel-copper-platinum', yields: 'nickel, copper, platinum', group: 'metal', rgb: [96, 176, 120], words: 'the feeders of a flood basalt where it crossed a craton\'s edge' },
    { id: 'layered', name: 'Layered intrusion', yields: 'chromium, platinum, vanadium', group: 'metal', rgb: [60, 140, 110], words: 'a great magma chamber on a craton, bared as its lavas wore away' },
    { id: 'nativeCopper', name: 'Native copper', yields: 'copper (pure metal)', group: 'metal', rgb: [236, 132, 96], words: 'flood basalt that filled a rift — copper ready to hammer' },
    { id: 'kimberlite', name: 'Kimberlite diamonds', yields: 'diamonds', group: 'metal', rgb: [220, 230, 240], words: 'pipes from deep under an ancient craton — some cratons rich, some barren' },
    { id: 'greenstoneGold', name: 'Greenstone gold', yields: 'gold', group: 'metal', rgb: [230, 200, 60], words: 'a shield\'s ancient greenstone belts' },
    { id: 'bif', name: 'Banded iron', yields: 'iron', group: 'metal', rgb: [160, 70, 70], words: 'an ancient ocean\'s iron, laid on a shield' },
    { id: 'reef', name: 'Ancient gold reef', yields: 'gold, uranium', group: 'metal', rgb: [252, 226, 120], words: 'the one great fossil placer of the world\'s oldest shield' },
    // ── oil and gas (added, developer) ──
    { id: 'oil', name: 'Oil', yields: 'oil', group: 'fuel', rgb: [60, 52, 48], words: 'organic mud buried into the oil window, trapped and sealed' },
    { id: 'gas', name: 'Gas', yields: 'natural gas', group: 'fuel', rgb: [120, 170, 220], words: 'buried deeper than oil, or from coal' },
    { id: 'bitumen', name: 'Bitumen, tar and oil shale', yields: 'bitumen, asphalt, oil shale', group: 'fuel', rgb: [96, 78, 60], words: 'an oil basin lifted and opened: seeps, tar sands, unripe oil shale' },
    // ── G4: the climate and the rivers ──
    { id: 'bauxite', name: 'Bauxite', yields: 'aluminium', group: 'mineral', rgb: [214, 112, 78], words: 'rock weathered for millions of years on hot, wet, gentle ground' },
    { id: 'niLaterite', name: 'Nickel laterite', yields: 'nickel, cobalt', group: 'mineral', rgb: [110, 180, 140], words: 'weathered ophiolite and greenstone in the warm wet tropics' },
    { id: 'ironLaterite', name: 'Iron laterite', yields: 'iron', group: 'mineral', rgb: [176, 90, 64], words: 'the red iron crust of warm weathered ground' },
    { id: 'supergene', name: 'Enriched copper', yields: 'copper, native copper and silver', group: 'mineral', rgb: [70, 170, 150], words: 'copper ore weathered rich under a warm, dry sky (the Atacama)' },
    { id: 'gossan', name: 'Gossan', yields: 'gold, silver at the surface', group: 'mineral', rgb: [190, 120, 60], words: 'the rusty cap of a weathered sulfide body — early gold and silver' },
    { id: 'placerGold', name: 'Placer gold', yields: 'gold', group: 'mineral', rgb: [250, 220, 90], words: 'gold carried down rivers from its source — richest where the ice never came' },
    { id: 'placerTin', name: 'Placer tin', yields: 'tin', group: 'mineral', rgb: [110, 210, 220], words: 'tin stone washed down from tin granites' },
    { id: 'placerDiamond', name: 'Placer diamonds', yields: 'diamonds', group: 'mineral', rgb: [232, 240, 250], words: 'diamonds carried far down a river from the pipes' },
    { id: 'salt', name: 'Salt', yields: 'salt, potash, gypsum', group: 'mineral', rgb: [236, 160, 206], words: 'salt lakes, pans and flats of the dry country, and old salt beds bared' },
    { id: 'ironstone', name: 'Ironstone', yields: 'iron', group: 'mineral', rgb: [150, 100, 70], words: 'iron oolites of an old warm shallow sea' },
    { id: 'bogIron', name: 'Bog iron', yields: 'iron', group: 'mineral', rgb: [130, 96, 56], words: 'iron settled in wet, sandy lowlands — the first iron' },
    // ── fuel ──
    { id: 'coal', name: 'Coal', yields: 'coal', group: 'fuel', rgb: [44, 40, 40], words: 'swamps of a basin that lay in a wet belt, buried and bared again' },
    { id: 'peat', name: 'Peat', yields: 'peat', group: 'fuel', rgb: [110, 90, 60], words: 'wet, flat, badly drained ground with a warm wet season' },
    { id: 'wood', name: 'Wood', yields: 'timber, charcoal', group: 'fuel', rgb: [70, 130, 70], words: 'the forests of the finished planet' },
    // ── G5: the Stone Age's own (her list: flint, obsidian, nephrite, agate) ──
    { id: 'flint', name: 'Flint and chert', yields: 'flint, chert, jasper, quartzite', group: 'stone', rgb: [150, 160, 176], words: 'flint in chalk and limestone (the best); chert, jasper and quartzite in older rock; the gravels below them — a stone to knap almost anywhere off the great plains' },
    { id: 'obsidian', name: 'Obsidian', yields: 'obsidian', group: 'stone', rgb: [70, 60, 90], words: 'volcanic glass of a young arc — the sharpest edge there is, traded far' },
    { id: 'jade', name: 'Jade', yields: 'nephrite, jadeite', group: 'stone', rgb: [90, 170, 120], words: 'serpentinite and mélange of old sea floor thrust up where a sea closed' },
    { id: 'agate', name: 'Agate and jasper', yields: 'agate, jasper, chalcedony', group: 'stone', rgb: [200, 120, 90], words: 'silica in the cavities of flood basalts' },
    // ── G7: gems (her kinds: kimberlite — the diamonds above — pegmatite, metamorphic, sedimentary and placer gems) ──
    { id: 'pegmatite', name: 'Pegmatite gems', yields: 'tourmaline, aquamarine, topaz', group: 'gem', rgb: [120, 170, 240], words: 'the last, gas-rich melts of granites deep in a collision belt — crystals a hand long' },
    { id: 'emerald', name: 'Emerald', yields: 'emerald', group: 'gem', rgb: [40, 180, 100], words: 'where pegmatites cut old sea floor, or hot brines the black shale of a fold belt' },
    { id: 'corundum', name: 'Ruby and sapphire', yields: 'ruby, sapphire, spinel', group: 'gem', rgb: [214, 40, 90], words: 'limestone baked to marble deep in a collision belt' },
    { id: 'lapis', name: 'Lapis lazuli', yields: 'lapis lazuli', group: 'gem', rgb: [50, 70, 190], words: 'marble where a granite touched it — rare, and traded across continents' },
    { id: 'basaltGems', name: 'Sapphire and peridot in basalt', yields: 'sapphire, zircon, peridot', group: 'gem', rgb: [90, 120, 200], words: 'carried up from the mantle by a hotspot\'s lavas on a continent' },
    { id: 'amethyst', name: 'Amethyst geodes', yields: 'amethyst, agate', group: 'gem', rgb: [160, 90, 210], words: 'crystal-lined cavities in a flood basalt' },
    { id: 'opal', name: 'Opal', yields: 'opal', group: 'gem', rgb: [246, 160, 96], words: 'silica from ground weathered deep, set in the sandstone of dry country' },
    { id: 'turquoise', name: 'Turquoise', yields: 'turquoise, malachite', group: 'gem', rgb: [56, 196, 176], words: 'copper ore weathered under a desert sky' },
    { id: 'garnet', name: 'Garnet', yields: 'garnet', group: 'gem', rgb: [128, 28, 36], words: 'grown in schist and gneiss — the commonest gem' },
    { id: 'gemPlacer', name: 'Gem gravels', yields: 'ruby, sapphire, spinel, garnet, zircon', group: 'gem', rgb: [196, 80, 120], words: 'gems washed down from their sources into a river\'s gravels' },
    // ── her building stone (limestone, sandstone, granite, marble, clay — and slate): the rocks, where they make the ground ──
    { id: 'stoneLimestone', name: 'Limestone', yields: 'limestone, lime for mortar', group: 'building', rgb: [130, 170, 220], words: 'the platforms of old warm seas' },
    { id: 'stoneSandstone', name: 'Sandstone', yields: 'sandstone', group: 'building', rgb: [222, 182, 112], words: 'the sand of basins, laid by rivers and seas' },
    { id: 'stoneGranite', name: 'Granite and gneiss', yields: 'granite, gneiss', group: 'building', rgb: [214, 120, 120], words: 'the roots of mountain belts and the shields, bared' },
    { id: 'stoneMarble', name: 'Marble', yields: 'marble', group: 'building', rgb: [240, 238, 230], words: 'limestone baked in a mountain belt' },
    { id: 'stoneSlate', name: 'Slate', yields: 'slate for roofs and floors', group: 'building', rgb: [96, 106, 128], words: 'mud squeezed in a mountain belt' },
    { id: 'clay', name: 'Clay', yields: 'clay for brick and pottery', group: 'building', rgb: [190, 100, 70], words: 'the plains of rivers and deltas, and shale — brick where stone is scarce' },
    // ── D4 (plans/V2_DEPOSITS_LOOK_PLAN.md: iron in most mountain belts, each its kind; stone wherever there is rock) — kept
    // after every older kind, so a planet file's older rows read on (save/migrations.js) ──
    { id: 'ironVein', name: 'Iron veins and replacements', yields: 'iron (hematite, siderite, magnetite)', group: 'metal', rgb: [186, 70, 50], words: 'a mountain belt\'s hot fluids through its limestone and slate — the Erzberg, Bilbao, Elba: most belts some' },
    { id: 'ioa', name: 'Magnetite-apatite', yields: 'iron, phosphate', group: 'metal', rgb: [150, 60, 80], words: 'magnetite bodies along a volcanic arc\'s front — Kiruna, Chile\'s iron belt' },
    { id: 'stoneVolcanic', name: 'Basalt and tuff', yields: 'basalt, andesite, tuff', group: 'building', rgb: [120, 100, 140], words: 'the dark stone of lava fields and the soft tuff of volcanoes' },
];
export const DEPOSIT_INDEX = Object.fromEntries(DEPOSITS.map((d, i) => [d.id, i]));

/** What the land yields, metal by metal (developer, 2026-10-20: "a more simple map of just iron, gold, tin etc, like the
 *  output metals"): each the systems it comes from, by how much of a system's richness is that metal — iron from six
 *  kinds of deposit, gold from five. A place's richness in a metal is its richest source's, a little more where several
 *  overlap. group: metal or fuel. */
export const METALS = [
    { id: 'iron', name: 'Iron', group: 'metal', rgb: [196, 84, 60], words: 'the commonest ore — in most mountain belts, in bogs, beds and crusts: what the Iron Age needed was fuel and skill, not ore',
        sources: [['bogIron', 1], ['ironstone', 1], ['ironLaterite', 1], ['bif', 1], ['iocg', 0.7], ['skarn', 0.5], ['ironVein', 1], ['ioa', 1]] },
    { id: 'copper', name: 'Copper', group: 'metal', rgb: [222, 128, 56], words: 'over volcanic arcs, in sea-floor sulfides and skarns, native in rift basalts',
        sources: [['porphyry', 1], ['vms', 0.8], ['supergene', 1], ['skarn', 0.6], ['nativeCopper', 0.9], ['iocg', 0.6], ['magmatic', 0.4]] },
    { id: 'gold', name: 'Gold', group: 'metal', rgb: [244, 204, 64], words: 'in the veins of old collision belts and over young arcs, and down their rivers',
        sources: [['orogenicGold', 1], ['epithermal', 1], ['placerGold', 1], ['greenstoneGold', 1], ['reef', 1], ['porphyry', 0.2], ['iocg', 0.3], ['gossan', 0.3], ['vms', 0.15]] },
    { id: 'silver', name: 'Silver', group: 'metal', rgb: [196, 206, 222], words: 'with gold over young arcs, with lead in basins, and in weathered caps',
        sources: [['epithermal', 0.9], ['sedex', 0.6], ['gossan', 0.6], ['vms', 0.4], ['supergene', 0.4], ['mvt', 0.25]] },
    { id: 'tin', name: 'Tin', group: 'metal', rgb: [80, 196, 206], words: 'granites far inboard of collisions and arcs, and the streams below them — scarce, and traded far',
        sources: [['tin', 1], ['placerTin', 1]] },
    { id: 'leadZinc', name: 'Lead and zinc', group: 'metal', rgb: [132, 140, 210], words: 'in the limestone and shale of sedimentary basins, and with copper',
        sources: [['mvt', 1], ['sedex', 1], ['vms', 0.6], ['skarn', 0.4]] },
    { id: 'aluminium', name: 'Aluminium', group: 'metal', rgb: [222, 120, 96], words: 'bauxite: rock weathered on hot, wet, gentle ground — Industrial only',
        sources: [['bauxite', 1]] },
    { id: 'nickel', name: 'Nickel', group: 'metal', rgb: [106, 184, 132], words: 'under flood basalts at a craton\'s edge, and in tropical laterites',
        sources: [['magmatic', 1], ['niLaterite', 1]] },
    { id: 'platinum', name: 'Platinum and chromium', group: 'metal', rgb: [150, 170, 160], words: 'great layered intrusions and flood basalts\' feeders',
        sources: [['layered', 1], ['magmatic', 0.6]] },
    { id: 'diamonds', name: 'Diamonds', group: 'metal', rgb: [228, 236, 248], words: 'pipes on some ancient cratons, and far down their rivers',
        sources: [['kimberlite', 1], ['placerDiamond', 1]] },
    { id: 'salt', name: 'Salt', group: 'metal', rgb: [236, 160, 206], words: 'salt lakes, pans and flats of dry country, and old salt beds',
        sources: [['salt', 1]] },
    { id: 'coal', name: 'Coal', group: 'fuel', rgb: [52, 48, 48], words: 'old swamps of basins that lay in a wet belt', sources: [['coal', 1]] },
    { id: 'oilGas', name: 'Oil and gas', group: 'fuel', rgb: [90, 120, 170], words: 'buried, trapped and sealed in sedimentary basins — on land and offshore; seeps and tar where lifted',
        sources: [['oil', 1], ['gas', 0.9], ['bitumen', 0.6]] },
    { id: 'peat', name: 'Peat', group: 'fuel', rgb: [120, 96, 64], words: 'wet, flat, badly drained ground', sources: [['peat', 1]] },
    { id: 'wood', name: 'Wood', group: 'fuel', rgb: [70, 130, 70], words: 'the forests of the finished planet', sources: [['wood', 1]] },
];
const D = DEPOSIT_INDEX, SYS = DEPOSITS.length;

const ARC_BELTS = new Set([OrogenyType.ANDEAN, OrogenyType.ARC]);
const COLLISION_BELTS = new Set([OrogenyType.URAL, OrogenyType.HIMALAYAN, OrogenyType.TRANSPRESSION]);
// (how readily each rock weathers to bauxite: basalt and volcanics best, granite, gneiss and shale well, limestone (karst
// bauxite), sandstone little; young sediment has not weathered long enough)
const BAUX_HOST = new Float32Array(16).fill(0.7);
BAUX_HOST[Rock.BASALT] = 1; BAUX_HOST[Rock.VOLCANIC] = 0.9; BAUX_HOST[Rock.LIMESTONE] = 0.6; BAUX_HOST[Rock.SANDSTONE] = 0.25;
BAUX_HOST[Rock.OPHIOLITE] = 0.4; BAUX_HOST[Rock.GREENSTONE] = 0.4; BAUX_HOST[Rock.ALLUVIUM] = 0.1;
// (how much iron a rock leaves in its weathered crust: basalt, greenstone, ophiolite and the shields' banded iron most
// (Simandou, the Deccan's laterites), granite, gneiss and shale some, limestone and quartz sandstone little)
const FE_HOST = new Float32Array(16).fill(0.4);
FE_HOST[Rock.BASALT] = 1; FE_HOST[Rock.GREENSTONE] = 1; FE_HOST[Rock.OPHIOLITE] = 1; FE_HOST[Rock.SHIELD] = 0.7; FE_HOST[Rock.VOLCANIC] = 0.7;
FE_HOST[Rock.GNEISS] = 0.5; FE_HOST[Rock.GRANITE] = 0.45; FE_HOST[Rock.SLATE] = 0.5; FE_HOST[Rock.SHALE] = 0.4; FE_HOST[Rock.SANDSTONE] = 0.2;
FE_HOST[Rock.LIMESTONE] = 0.2; FE_HOST[Rock.SALT] = 0; FE_HOST[Rock.ALLUVIUM] = 0.1;
const WOOD = { [Biome.RAINFOREST]: 1, [Biome.EVERGREEN]: 0.9, [Biome.DECIDUOUS]: 1, [Biome.CONIFER]: 0.95, [Biome.BOREAL]: 0.8, [Biome.DRY_FOREST]: 0.7,
    [Biome.WOODLAND]: 0.6, [Biome.MEDITERRANEAN]: 0.45, [Biome.SAVANNA]: 0.35, [Biome.GRASSLAND]: 0.12, [Biome.STEPPE]: 0.08, [Biome.TUNDRA]: 0.05, [Biome.SEMI_DESERT]: 0.04 };

// the record's part of each system, per sim cell (one array each): the fields read below
const REC = ['porphyry', 'epithermal', 'orogenicGold', 'vms', 'skarn', 'mvt', 'sedex', 'tin', 'iocg', 'magmatic', 'layered', 'nativeCopper', 'kimberlite',
    'greenstone', 'bif', 'reef', 'oil', 'gas', 'bitumen', 'shale', 'coal', 'ironstone', 'craton', 'salt',
    // (G7: the gems' settings — pegmatite fields, marble, a hotspot's basalts on land, flood basalts left, a fold belt's black shale)
    'pegmatite', 'marble', 'hotspot', 'lip', 'foldShale',
    // (and the grain the districts are drawn out along: a belt's across-distance (km) and its share, a shield's axis)
    'grainD', 'beltW', 'axX', 'axY', 'axZ', 'ironVein', 'ioa',
    // (D1: the beds — an immature source rock's oil shale, and the cover now: thin over the basement's highs)
    'oilShale', 'coverNow'];
const NOT_SYSTEMS = new Set(['craton', 'salt', 'shale', 'grainD', 'beltW', 'axX', 'axY', 'axZ', 'coverNow']);
const GEM_REC = ['pegmatite', 'marble', 'hotspot', 'lip', 'foldShale'];

/**
 * The record's part of every system, per sim cell — the settings and the wear, at the cell's own time (0…1 each).
 * Cratons keep their own character (seeded per craton: its own streams): how ancient, how endowed, diamonds or not,
 * banded iron or not, a layered intrusion or not; and one craton in the world holds the great fossil gold reef.
 */
export function simDeposits(frame, simMesh, seed, G = GEOLOGY) {
    const n = simMesh.numCells, time = frame.time, P = Object.fromEntries(REC.map(k => [k, new Float32Array(n)])), fac = {};
    const rk = simRocks(frame, simMesh, seed, G), Dp = G.deposits;
    // (the reef's craton: the one with the highest draw among those on land)
    let reefT = -1, reefH = -1;
    for (let w = 0; w < n; w++) if (frame.owner[w] >= 0 && frame.type[w] === CrustType.CRATON) { const h = hash01(seed ^ 0x3175, frame.terrane[w]); if (h > reefH) { reefH = h; reefT = frame.terrane[w]; } }
    for (let w = 0; w < n; w++) {
        if (frame.owner[w] < 0 || frame.type[w] === CrustType.OCEAN) continue;
        const type = frame.type[w], flags = frame.flags[w], geo = frame.geoFlags[w], belt = frame.oroType[w], ter = frame.terrane[w];
        const ex = decodeExhumKm(frame.exhumKm[w]), un = Math.max(0, decodeUnroofKm(frame.unroofKm[w])), arcMyr = decodeArcMyr(frame.arcMyr[w]);
        const cover = decodeCoverKm(frame.coverKm[w]), coverMax = decodeCoverKm(frame.coverMaxKm[w]), maxAgo = decodeAge(frame.coverMaxAge[w]);
        decodeFacies(frame.facies[w], fac);
        // (how long ago its belt was last active — a prehistoric belt's before the history began — and its previous one's)
        const quiet = belt ? time - frame.oroLast[w] : Infinity, prevQuiet = frame.prevType[w] ? time - frame.prevLast[w] : Infinity;
        // (how long since its arc was live: a subduction belt's quiet time; crust once in an arc, since it left it — its birth
        // and its time in the arc — the world's start at the latest)
        const arcAge = ARC_BELTS.has(belt) || belt === OrogenyType.LARAMIDE ? quiet : Math.max(0, time - Math.max(frame.formedAt[w], 0) - arcMyr);
        // (and since its mountain building: the belt's, else the previous belt's, else the history's whole length)
        const orogenAge = Math.min(quiet, prevQuiet, time);
        const keep = (age, half) => Math.pow(0.5, Math.max(0, age) / half), H = Dp.halfLifeMyr;
        const live = belt ? 1 - smooth(G.arcActiveMyr[0], G.arcActiveMyr[1], quiet) : 0;
        const beltAge = belt && frame.oroLast[w] >= 0 ? time - (frame.oroStart?.[w] ?? frame.oroLast[w]) : belt ? Infinity : 0;
        const u = frame.beltU[w] / 255, thick = frame.thickKm[w];
        const lip = frame.volcType[w] === VolcanicType.LIP && frame.volcKm[w] > 0, lipLeft = lip ? Math.max(0, frame.volcKm[w] - frame.volcWornKm[w]) : 0;
        const lipWorn = lip ? clamp01(frame.volcWornKm[w] / Math.max(0.05, frame.volcKm[w])) : 0;
        const rift = !!(geo & GeoFlag.RIFT_BASIN || flags & CrustFlag.FAILED_RIFT || belt === OrogenyType.RIFT);
        P.craton[w] = type === CrustType.CRATON ? 1 : 0;
        P.salt[w] = fac.salt;
        P.coverNow[w] = cover;
        // (the grain: across a belt from its front, km — as the Rocks map's fold stripes read it — and a shield's trend)
        if (belt && frame.beltReach[w] > 0) { P.grainD[w] = rk.dKm[w]; P.beltW[w] = 1; }       // (a belt whose geometry was kept)
        P.axX[w] = rk.axis[3 * w]; P.axY[w] = rk.axis[3 * w + 1]; P.axZ[w] = rk.axis[3 * w + 2];
        // ── arcs: porphyry copper 1–4 km down, epithermal gold above it; zoned across an Andean belt (iron and IOCG at the
        // front, copper on the arc, tin far inboard); richer where long-lived, on thick crust, and where the slab turned ──
        const arcLike = ARC_BELTS.has(belt) || belt === OrogenyType.LARAMIDE || type === CrustType.ARC || (geo & GeoFlag.WAS_ARC) || arcMyr > 0;
        if (arcLike) {
            const island = type === CrustType.ARC;
            // (how much the arc's top has worn since its ores formed: a live arc as it rises, a dead one since it died)
            // (the arc's own magmatism: a subduction belt's — a collision over old arc crust is not an arc)
            const arcBelt = ARC_BELTS.has(belt) || belt === OrogenyType.LARAMIDE, arcLive = arcBelt ? live : 0;
            const E = arcLive > 0.5 ? 0.5 + Dp.liveWearKmPerMyr * Math.min(arcMyr, 25) : un + 1;
            // (epithermal ores form at the surface for as long as the arc lives; a dead arc's last ones go with its first km,
            // and seldom outlast a few tens of Myr even where it wears slowly — exposed ones are mostly young: research §2)
            const Eepi = arcLive > 0.5 ? 0.3 : un + 0.3, young = arcLive > 0.5 ? 1 : arcBelt ? 1 - smooth(25, 70, quiet) : 0;
            const onArc = belt === OrogenyType.ANDEAN ? smooth(0.03, 0.15, u) * (1 - smooth(0.45, 0.6, u)) : belt === OrogenyType.LARAMIDE ? 0.3 : 1;
            const fert = smooth(2, 24, arcMyr + 6 * live) * (0.55 + 0.45 * smooth(3, 20, thick)) * (geo & GeoFlag.SLAB_CHANGE ? 1.35 : 1) * (island ? 0.8 : 1);
            P.porphyry[w] = fert * onArc * window(E, 0.8, 5.5, 0.6) * keep(arcAge, H.porphyry);
            P.epithermal[w] = fert * Math.max(onArc, 0.5) * (1 - smooth(0.7, 1.6, Eepi)) * young * keep(arcAge, H.epithermal);
            // post-collisional porphyries: an old arc's crust thickened by a later collision (gold-rich: Tibet)
            if ((geo & GeoFlag.WAS_ARC) && COLLISION_BELTS.has(belt)) P.porphyry[w] = Math.max(P.porphyry[w], 0.6 * live * window(ex, 0.8, 6, 0.6) * keep(quiet, H.porphyry));
            if (belt === OrogenyType.ANDEAN) P.iocg[w] = Math.max(P.iocg[w], 0.6 * smooth(0, 0.05, u) * (1 - smooth(0.1, 0.2, u)) * window(un + 2, 1, 8));
            // (D4: magnetite-apatite bodies along the arc's front — Kiruna, Chile's iron belt — bared as it wears)
            P.ioa[w] = fert * (belt === OrogenyType.ANDEAN ? smooth(0, 0.05, u) * (1 - smooth(0.25, 0.4, u)) : 0.5) * window(E, 0.5, 8, 0.6) * keep(arcAge, H.ioa);
        }
        // (how much a belt's top has worn since its granites and veins set, a few km down: a live belt as it rises, a
        // quiet one since)
        const Ebelt = live > 0.5 ? 1 + Dp.liveWearKmPerMyr * Math.min(Math.max(0, beltAge), 40) : un + 4;
        // ── tin and tungsten: granites of melted sediment, far inboard on thickened crust — narrow, scarce ──
        if (COLLISION_BELTS.has(belt) && belt !== OrogenyType.TRANSPRESSION) P.tin[w] = smooth(12, 30, thick) * window(Ebelt, 3, 12, 1) * smooth(0.35, 0.6, u) * keep(quiet, H.tin);
        if (belt === OrogenyType.ANDEAN) P.tin[w] = Math.max(P.tin[w], smooth(0.6, 0.78, u) * smooth(8, 22, thick) * window(Ebelt, 2.5, 12, 1) * keep(quiet, H.tin));
        // ── orogenic gold: collision and accretion belts and old sutures, deep in their roots, once the belt is mature (none
        // in belts younger than ~50 Myr); bared between ~2 and ~16 km of wear; the world's old mobile belts too ──
        // (its age: since the collision itself — the belt's if it is one, else the one it overprinted; an old suture's, the
        // history's whole length at the least)
        const collided = COLLISION_BELTS.has(belt) || COLLISION_BELTS.has(frame.prevType[w]);
        const collAge = COLLISION_BELTS.has(belt) ? quiet : COLLISION_BELTS.has(frame.prevType[w]) ? prevQuiet : time;
        if (collided || flags & CrustFlag.SUTURE) P.orogenicGold[w] = (flags & CrustFlag.SUTURE ? 0.9 : 0.7) * smooth(30, 70, beltAge) * window(Ebelt, 2, 18, 1) * keep(collAge, H.orogenicGold);
        else if (belt && frame.oroLast[w] < 0) P.orogenicGold[w] = Dp.prehistoricGold * window(ex, 2, 18, 1) * keep(quiet, H.orogenicGold);
        // ── D4: iron veins and replacements — a belt's hot fluids through its carbonate and slate, hematite, siderite and
        // magnetite (the Erzberg, Bilbao, Siegerland, Elba): most belts some, from a few hundred metres to deep in their roots,
        // lasting as long as those roots ──
        if (belt || frame.prevType[w]) P.ironVein[w] = (collided ? 1 : ARC_BELTS.has(belt) || belt === OrogenyType.LARAMIDE ? 0.8 : 0.6) * window(Math.max(ex, Ebelt), 0.3, 14, 0.8) * keep(orogenAge, H.ironVein);
        // ── massive sulfide: sea-floor vents of an arc, a back-arc or an ophiolite, docked onto land; it lasts as long as
        // its host rocks do ──
        if (type === CrustType.ARC || (geo & GeoFlag.WAS_ARC) || (geo & GeoFlag.OPHIOLITE)) {
            const docked = type !== CrustType.ARC ? 1 : 0.6;
            P.vms[w] = docked * (geo & GeoFlag.OPHIOLITE ? 0.75 : 1) * smooth(0, 0.6, ex + un + 0.3) * (1 - smooth(12, 18, ex)) * keep(Math.min(arcAge, orogenAge), H.vms);
        }
        // ── skarn: granite into carbonate — where a belt's plutons rise under limestone cover ──
        const granite = rk.base[NB * w + B_GRANITE];
        P.skarn[w] = smooth(0.04, 0.25, granite) * smooth(0.05, 0.3, Math.max(fac.carb, (geo & (GeoFlag.SHELF | GeoFlag.EPEIRIC)) ? 0.25 : 0)) * window(Ebelt, 0.5, 10, 0.8) * keep(Math.min(arcAge, orogenAge), H.skarn);
        // ── lead-zinc: MVT in a foreland's or a platform's limestone beside a rising range, more near salt; SEDEX in a rift
        // basin's dark mud ──
        if (cover > 0.2) {
            P.mvt[w] = smooth(0.15, 0.5, fac.carb) * (geo & GeoFlag.FORELAND ? 1 : 0.4) * (0.75 + 0.5 * smooth(0.05, 0.3, fac.salt)) * keep(maxAgo, H.mvt);
            if (rift || flags & CrustFlag.RIFT_MARGIN) P.sedex[w] = smooth(0.4, 1.5, coverMax) * (0.5 + 0.5 * smooth(0.05, 0.35, fac.organic)) * (1 - 0.6 * fac.carb) * keep(maxAgo, H.sedex);
        }
        // ── plumes: nickel-copper-platinum in a flood basalt's feeders (craton edges, below); a layered intrusion bared on
        // a craton once its lavas have worn away; native copper where flood basalt filled a rift ──
        if (lip) {
            P.magmatic[w] = smooth(0.15, 0.6, lipWorn) * (0.7 + 0.3 * smooth(0.05, 0.3, fac.salt + 0.25 * fac.coal));
            if (type === CrustType.CRATON) P.layered[w] = smooth(0.5, 0.85, lipWorn);
            if (rift || flags & CrustFlag.RIFT_MARGIN) P.nativeCopper[w] = smooth(0.05, 0.4, lipLeft);
        }
        // ── the cratons' own: diamonds (only ancient ones, some barren), greenstone gold, banded iron, a layered
        // intrusion inherited from their past, the reef ──
        if (type === CrustType.CRATON) {
            const ancient = hash01(seed ^ 0xa7c1, ter) < Dp.ancientCratonShare, endow = 0.3 + hash01(seed ^ 0xe11d, ter);
            P.greenstone[w] = Math.min(1.2, endow);
            if (ancient && hash01(seed ^ 0xd1a3, ter) < Dp.diamondCratonShare) P.kimberlite[w] = 0.6 + 0.4 * hash01(seed ^ 0xd1a4, ter);
            if (hash01(seed ^ 0xb1f0, ter) < Dp.bifCratonShare) P.bif[w] = 0.6 + 0.4 * hash01(seed ^ 0xb1f1, ter);
            if (hash01(seed ^ 0x1a7e, ter) < Dp.layeredCratonShare) P.layered[w] = Math.max(P.layered[w], 0.7);
            if (ter === reefT) P.reef[w] = 1;
            // (an edge reworked by later belts or plumes: IOCG, read with the edge below)
            if (belt || frame.prevType[w] || lip) P.iocg[w] = Math.max(P.iocg[w], 0.5 + 0.5 * hash01(seed ^ 0x10c6, ter));
        } else if (frame.prevType[w] || belt) P.iocg[w] = Math.max(P.iocg[w], 0.25 * keep(orogenAge, H.iocg));
        // ── oil and gas: organic-rich mud buried into the oil window (hotter in a rift, cooler in a foreland or on a
        // craton), trapped (fold belts best, under salt, rift blocks, carbonate platforms, else the strata themselves),
        // kept while sealed (longer under salt) and not lifted out; lifted, it seeps, turns to tar, bares oil shale ──
        if (coverMax > 0.5) {
            const grad = rift ? 40 : (geo & GeoFlag.WAS_ARC) || ARC_BELTS.has(belt) ? 34 : (geo & GeoFlag.FORELAND) || type === CrustType.CRATON ? 22 : 28;
            const T = 15 + grad * 0.85 * coverMax, removed = Math.max(0, coverMax - cover);
            // (D2: a basin's source rock lies through its column, not only at its floor — so a thick basin has its oil window
            // somewhere in it (and its gas below): only a very hot one has cooked most of its oil to gas)
            const oilWin = smooth(55, 75, T) * (1 - 0.6 * smooth(190, 260, T)), gasWin = smooth(120, 155, T);
            const src = smooth(0.02, 0.15, fac.organic) * smooth(0.8, 2, coverMax), coalSrc = smooth(0.06, 0.3, fac.coal) * smooth(1, 3, coverMax);
            const fold = belt || (geo & GeoFlag.FORELAND) ? 1 : 0;
            const trap = Math.min(1, Math.max(0.5, 0.95 * fold, 2.5 * fac.salt, rift ? 0.8 : 0, 0.7 * smooth(0.2, 0.5, fac.carb)));
            // (kept while sealed — longer under salt: the Permian Basin's and the Williston's Paleozoic oil is still there)
            const tau = 180 + 300 * smooth(0.08, 0.3, fac.salt), keep = Math.exp(-maxAgo / tau);
            P.oil[w] = src * oilWin * trap * keep * (1 - smooth(1, 3, removed));
            P.gas[w] = Math.max(src * gasWin, coalSrc * smooth(100, 140, T)) * trap * Math.sqrt(keep) * (1 - smooth(2, 4, removed));
            // (lifted out: seeps and tar where a mature basin lost its roof; oil shale where rich mud never ripened)
            P.bitumen[w] = src * Math.max(oilWin, 0.4) * smooth(0.6, 2, removed) * smooth(0.1, 0.5, cover);
            // (oil shale: rich mud that never ripened — a bed of the cover, cropping out as the finished surface cuts it)
            P.oilShale[w] = smooth(0.04, 0.2, fac.organic) * (1 - smooth(50, 70, T)) * smooth(0.2, 0.6, cover);
        }
        // ── coal: the basin's coal measures (laid where the basin lay in a wet belt — or, by her rule, where it lay within
        // 45° of the equator: the history's record, tectonics config geology.coalByWetBelts) ──
        // (fac.coal: the coal measures' share of the fill — tectonics config geology.coalShare)
        P.coal[w] = smooth(0.06, 0.3, fac.coal) * smooth(0.2, 1.2, cover);
        // ── oolitic ironstone: an old warm shallow sea's iron, where its beds remain ──
        // (and the coal measures' own clay ironstone and blackband — Britain's Industrial Revolution ran on them: wherever
        // there is coal — with the coal, on the finished surface)
        if (geo & (GeoFlag.SHELF | GeoFlag.EPEIRIC)) P.ironstone[w] = smooth(4, 30, decodeFloodMyr(frame.floodMyr[w])) * (0.5 + 0.5 * smooth(0.1, 0.35, fac.carb)) * smooth(0.1, 0.5, cover);
        P.shale[w] = fac.organic;
        // ── G7, the gems' settings. Pegmatites: the last melts of a collision belt's granites on thickened crust, bared 3–14 km
        // down (tin's setting, wider across the belt), and the old belts' — the history's earlier collisions, the start
        // world's mobile belts (Minas Gerais, Madagascar) ──
        let peg = 0;
        if (COLLISION_BELTS.has(belt) && belt !== OrogenyType.TRANSPRESSION) peg = smooth(10, 25, thick) * window(Ebelt, 3, 14, 1) * smooth(0.15, 0.45, u) * keep(quiet, H.pegmatite);
        if (COLLISION_BELTS.has(frame.prevType[w])) peg = Math.max(peg, 0.7 * window(ex, 3, 16, 1) * keep(prevQuiet, H.pegmatite));
        if (belt && frame.oroLast[w] < 0) peg = Math.max(peg, 0.5 * window(ex, 3, 16, 1));
        P.pegmatite[w] = peg;
        // marble: a carbonate platform's limestone (a passive margin's, a shallow sea's) caught in a belt and baked 4–24 km
        // down — rubies and sapphires in it (Mogok), lapis where a granite touched it
        const platform = Math.max(smooth(0.1, 0.4, fac.carb), geo & (GeoFlag.SHELF | GeoFlag.EPEIRIC) ? 0.6 : 0, flags & CrustFlag.RIFT_MARGIN ? 0.7 : 0);
        const beltK = collided ? 1 : belt || frame.prevType[w] ? 0.45 : 0;
        if (beltK > 0 && platform > 0) P.marble[w] = beltK * platform * window(Math.max(ex, Ebelt), 4, 24, 1.5) * keep(Math.min(collAge, orogenAge), H.marble);
        // a hotspot's alkali lavas on a continent bring up sapphire, zircon and peridot (eastern Australia, Thailand); a flood
        // basalt's cavities fill with amethyst and agate (Paraná); a fold belt's black shale holds Colombia's emeralds
        if (frame.volcType[w] === VolcanicType.TRACK && type !== CrustType.ARC) P.hotspot[w] = smooth(0.05, 0.4, Math.max(0, frame.volcKm[w] - frame.volcWornKm[w])) * keep(time - frame.volcAt[w], H.basaltGems);
        if (lip) P.lip[w] = smooth(0.1, 0.6, lipLeft);
        if (belt && cover > 0.3) P.foldShale[w] = smooth(0.04, 0.2, fac.organic) * (ARC_BELTS.has(belt) || belt === OrogenyType.LARAMIDE ? 1 : 0.6) * keep(quiet, H.foldShale);
    }
    return P;
}

/** Each system's districts as district-shapes.js takes them: its spacing and share (deposits.district), its recipe and
 *  its association (deposits.shapes). */
export function districtSystems(G = GEOLOGY) {
    const Dp = G.deposits, SH = Dp.shapes;
    return DEPOSITS.map(d => {
        const o = Dp.district[d.id] ?? Dp.district.default;
        return { L: o[0], share: o[1], recipe: SH.recipes[SH.recipeOf[d.id] ?? SH.recipeOf.default], assoc: SH.associationOf[d.id] ?? null };
    });
}

/**
 * Every system's richness on a finished moment, per 0.25° grid cell (the richest of its cells): kept for the land and
 * the shelf only.
 * @param {Object} o  { mesh, z, ocean, frame, simMesh, seed, rock (rocks.js, per cell), rec (each cell's record cell),
 *   on ({grid, lat, lon}), local: { glaciated (0/1), till (0…255), lake (Water kinds), q (m³/s), recv, order (the
 *   rivers' receivers and their order, upstream last), biome (per cell, Biome in its low five bits), clim ({baux, ni, ironLat, evap, peat,
 *   semi}: the climate's tests, 0…255 per cell), ice (under ice now, 0/1) } }
 * @returns {{step: number, w: number, h: number, cells: Int32Array, data: Uint8Array, rows: number, shares: Float32Array,
 *   metalShares: Float32Array}} data: rows × K bytes (row-major, K = cells.length), richness × 255 — the systems
 *   (DEPOSITS), then the metals (METALS); shares, metalShares: the land's share poor / moderate / rich of each
 */
export function depositFields({ mesh, z, ocean, frame, simMesh, seed, rock, rec, on, local = {} }, G = GEOLOGY) {
    const n = mesh.numCells, { xyz } = mesh, Dp = G.deposits, { lat, lon } = on;
    const { glaciated = null, till = null, lake = null, q = null, recv = null, order = null, biome = null, clim = null, ice = null, colS = null, colT = null, colArch = null } = local;
    const P = simDeposits(frame, simMesh, seed, G);
    // (the shelf: sea over continental crust, shallow — oil and gas only)
    const shelf = c => ocean[c] && z[c] > Dp.shelfKm && frame.owner[rec[c]] >= 0 && frame.type[rec[c]] !== CrustType.OCEAN;
    const kept = c => !ocean[c] || shelf(c);
    // ── the record's parts, smooth over a sim cell or so (as the rocks read them), at each cell ──
    const coarse = new LatLonGrid(0.5), recordKm = G.recordBlurCells * simMesh.edgeKm, F = {};
    coarse.blurMany(coarse.averageMapped(lat, lon, rec, REC.map(k => P[k]), kept), recordKm).forEach((g, i) => { F[REC[i]] = g; });
    // (where the record has any system at all — a cell elsewhere skips them)
    // (only the grid cells the record reaches — every field has its values in the same ones, the blur's: NaN elsewhere)
    const anyRec = new Float32Array(coarse.size), anyGem = new Float32Array(coarse.size), F0 = F[REC[0]], held = [];
    for (let q = 0; q < coarse.size; q++) if (F0[q] === F0[q]) held.push(q);
    for (const k of REC) {
        if (NOT_SYSTEMS.has(k)) continue;
        const f = F[k], a = GEM_REC.includes(k) ? anyGem : anyRec;
        for (let i = 0; i < held.length; i++) { const q = held[i]; if (f[q] > a[q]) a[q] = f[q]; }
    }
    // (a craton's edge: where the craton's share over ~150 km is middling)
    const edgeGrid = coarse.blur(F.craton, 150);
    // ── the ground: each cell's slope (km/km) and its height over the land around it ──
    const fine = on.grid, ref = fine.blur(fine.average(lat, lon, z, c => !ocean[c]), 40);
    // (and how rough it is: the spread of the heights over ~50 km around (km) — several cells at every detail, so the same
    // at every detail, as a slope between neighbouring cells is not: finer meshes resolve steeper slopes)
    const onLand = c => !ocean[c], z2 = new Float32Array(n);
    for (let c = 0; c < n; c++) z2[c] = z[c] * z[c];
    const [zMean, zSq] = coarse.blurMany([coarse.average(lat, lon, z, onLand), coarse.average(lat, lon, z2, onLand)], 50), rough = new Float32Array(coarse.size);
    for (let q = 0; q < coarse.size; q++) rough[q] = zMean[q] === zMean[q] ? Math.sqrt(Math.max(0, zSq[q] - zMean[q] * zMean[q])) : NaN;
    // ── districts: each system's permissive ground broken into districts — clusters of clusters, drawn out along the
    // grain, gathered on lineaments, bent and lobed (district-shapes.js), each its share of the ground ──
    const nz = new FastNoise(((seed | 0) * 0x6c8b + 0x3d) >>> 0), SH = Dp.shapes;
    // (the beds: the column's contacts as the Rocks map counts them, and which of them are ironstone horizons — a sea's
    // condensed beds, seeded)
    const tops = bedTops(seed, G), B = Dp.beds, horizon = tops.map((_, k) => hash01(seed ^ 0x1e05, k) < B.ironHorizonShare);
    const scale = DEPOSITS.map(d => Dp.scale[d.id] ?? 1), kimbF = R / Dp.kimberliteFieldKm, layeredF = R / Dp.layeredKm, reefF = R / Dp.reefKm, ruleIce = G.guideRules.iceStripsPlacers;
    // ── the grid each cell writes into: each 0.25° cell the richest of its cells, kept where there is land or shelf ──
    // (no finer than the mesh: a grid cell holds a terrain cell or more — 0.25° from ~2.5M cells, 0.5° at 640K, 1° at 160K)
    const step = [Dp.gridDeg, 0.5, 1, 2].find(d => d >= Dp.gridDeg && d * 111 >= 1.25 * mesh.edgeKm) ?? 2;
    const shapes = new DistrictShapes(seed, districtSystems(G), SH, step);
    const out = new LatLonGrid(step), gi = new Int32Array(out.size).fill(-1), list = [], cellG = new Int32Array(n).fill(-1);
    for (let c = 0; c < n; c++) {
        if (!kept(c)) continue;
        const k = out.index(lat[c], lon[c]);
        if (gi[k] < 0) { gi[k] = list.length; list.push(k); }
        cellG[c] = gi[k];
    }
    const K = list.length, data = new Uint8Array(SYS * K), shares = new Float32Array(3 * SYS), [gPoor, gMod, gRich] = Dp.grades;
    const write = (c, k, v) => {
        v = clamp01(scale[k] * v);
        const b = Math.round(255 * v), j = k * K + cellG[c];
        if (b > data[j]) data[j] = b;
        return v;
    };
    const goldSrc = new Float32Array(n), tinSrc = new Float32Array(n), diaSrc = new Float32Array(n), gemSrc = new Float32Array(n);
    // (each grid cell's rocks: each kind's share of its land cells — a grid cell's together)
    const rs = new Float32Array(ROCK_COUNT * K), cnt = new Float32Array(K);
    for (let c = 0; c < n; c++) if (!ocean[c] && cellG[c] >= 0) { rs[cellG[c] * ROCK_COUNT + rock[c]]++; cnt[cellG[c]]++; }
    for (let j = 0; j < K; j++) if (cnt[j]) for (let r = 0; r < ROCK_COUNT; r++) rs[j * ROCK_COUNT + r] /= cnt[j];
    // (a system's richness here: its district's noise read only where it can be at all)
    let C = 0, X = 0, Y = 0, Z = 0, J = 0, J4 = 0;     // (J4: the grid cell's rock shares in rs)
    const ci = new Int32Array(4), cw = new Float64Array(4);
    // (read at the cell in hand — its four record corners ci, cw; its grid cell J — made once, not a cell at a time)
    const g = f => { const v = coarse.atCorners(f, ci, cw); return v > 0 ? v : 0; };
    const or = (s, rest) => s + (1 - s) * rest;
    const wd = (k, v) => write(C, k, v > 0.003 ? v * shapes.at(k) : 0);
    // (the same where the cell's own richness is not needed after: skipped where even a full district could not raise its
    // grid cell's richest — the same grid, sooner)
    const wq = (k, v) => { if (v > 0.003 && data[k * K + cellG[C]] < Math.round(255 * clamp01(scale[k] * v))) write(C, k, v * shapes.at(k)); };
    // (a pipe field's or an intrusion's spot: read at the warped position — irregular, never a disc)
    const spot = (v, lamF, lo, hi, o) => { if (!(v > 0.003)) return 0; const w = shapes.warped(); return v * smooth(lo, hi, nz.noise3D(w.wx * lamF + o, w.wy * lamF + 2 * o, w.wz * lamF - o)); };
    // (a value of the record's that may be negative — a shield's axis — or missing: 0)
    const gs = f => { const v = coarse.atCorners(f, ci, cw); return v === v ? v : 0; };
    for (let c = 0; c < n; c++) {
        if (cellG[c] < 0) continue;
        const x = xyz[3 * c], y = xyz[3 * c + 1], zz = xyz[3 * c + 2], la = lat[c], lo = lon[c];
        C = c; X = x; Y = y; Z = zz;
        coarse.corners(la, lo, ci, cw);
        // (the grain here: a belt's — the distance across it — and a shield's trend, by how much of each is here)
        const bw = gs(F.beltW), wB = smooth(0.1, 0.6, bw), psiB = wB > 0 ? gs(F.grainD) / Math.max(0.05, bw) : 0, crat = gs(F.craton);
        let wC = 0, psiC = 0;
        if (crat > 0.1) {
            const ax = gs(F.axX), ay = gs(F.axY), az = gs(F.axZ), al = Math.hypot(ax, ay, az);
            if (al > 0.05) { wC = smooth(0.15, 0.6, crat) * (1 - wB) * smooth(0.05, 0.3, al); psiC = R * (x * ax + y * ay + zz * az) / al; }
        }
        shapes.cell(x, y, zz, la, lo, psiB, wB, psiC, wC);
        if (ocean[c]) { wq(D.oil, g(F.oil)); wq(D.gas, g(F.gas)); continue; }
        // (the ground's rocks as the district has them: each kind's share in the grid cell — a host is a district's matter, not
        // one cell's on a fine rock map)
        J = cellG[c]; J4 = J * ROCK_COUNT;
        const cover = rs[J4 + Rock.SANDSTONE] + rs[J4 + Rock.SHALE] + rs[J4 + Rock.LIMESTONE] + rs[J4 + Rock.SALT], young = rs[J4 + Rock.ALLUVIUM], base = Math.max(0, 1 - cover - young);
        // (a deposit in the basement: hidden under cover or young sediment — some still found, by its signs)
        const bared = base + 0.25 * cover + 0.3 * young, glac = glaciated && glaciated[c] ? 1 : 0;
        // (D1: where the surface meets the rock column — km above the basement, as the Rocks map counts its beds — and how
        // far below the cover's top that is)
        const sK = colS && colS[c] ? colS[c] / 1000 : 0, inCover = sK > 0, depth = inCover ? Math.max(0, colT[c] / 1000 - sK) : Infinity;
        const rk = rock[c];
        // ── G3 (where the record has any of it near: most land has none) ──
        let porphyry = 0, epithermal = 0, orogenic = 0, vms = 0, skarn = 0, mvt = 0, sedex = 0, tin = 0, kimb = 0, green = 0, reef = 0;
        if (coarse.atCorners(anyRec, ci, cw) > 0.002) {
            porphyry = wd(D.porphyry, g(F.porphyry) * bared);
            epithermal = wd(D.epithermal, g(F.epithermal) * or(rs[J4 + Rock.VOLCANIC], bared));
            orogenic = wd(D.orogenicGold, g(F.orogenicGold) * or(rs[J4 + Rock.SLATE] + rs[J4 + Rock.GNEISS] + rs[J4 + Rock.GREENSTONE], 0.8 * bared));
            vms = wd(D.vms, g(F.vms) * or(rs[J4 + Rock.VOLCANIC] + rs[J4 + Rock.BASALT] + rs[J4 + Rock.OPHIOLITE] + rs[J4 + Rock.GREENSTONE] + rs[J4 + Rock.SLATE], 0.4 * bared));
            skarn = wd(D.skarn, g(F.skarn) * or(rs[J4 + Rock.GRANITE] + rs[J4 + Rock.LIMESTONE], 0.35 * bared));
            // (lead-zinc in limestone: where the platform's cover is thin over the basement's highs — the Ozark dome's flanks —
            // as the brines rose up their edges)
            mvt = wd(D.mvt, g(F.mvt) * (0.6 * rs[J4 + Rock.LIMESTONE] + 0.4 * cover) * (0.45 + 0.55 * smooth(B.mvtBaseKm[1], B.mvtBaseKm[0], g(F.coverNow))));
            sedex = wd(D.sedex, g(F.sedex) * or(rs[J4 + Rock.SHALE] + 0.6 * rs[J4 + Rock.SANDSTONE] + 0.4 * rs[J4 + Rock.LIMESTONE], 0.1));
            tin = wd(D.tin, g(F.tin) * or(rs[J4 + Rock.GRANITE], 0.5 * bared));
            const craton = coarse.atCorners(edgeGrid, ci, cw), edge = smooth(0.15, 0.4, craton) * (1 - smooth(0.6, 0.9, craton));
            wq(D.iocg, g(F.iocg) * Math.max(edge, 0.25) * bared);
            wq(D.magmatic, g(F.magmatic) * Math.max(edge, 0.2) * or(0.7 * rs[J4 + Rock.BASALT], bared));
            write(c, D.layered, spot(g(F.layered), layeredF, 0.5, 0.62, 21.1) * bared);
            wq(D.nativeCopper, g(F.nativeCopper) * or(rs[J4 + Rock.BASALT], 0.3));
            // (kimberlites: fields ~40 km across, a few hundred km apart — spots of their own noise — on the craton itself)
            kimb = write(c, D.kimberlite, spot(g(F.kimberlite) * smooth(0.45, 0.75, g(F.craton)), kimbF, 0.7, 0.78, 3.3) * or(base, 0.5));
            green = wd(D.greenstoneGold, g(F.greenstone) * smooth(0, 0.25, rs[J4 + Rock.GREENSTONE]));
            // (D3: banded iron in its belts, not the whole shield — the greenstone keels the Rocks map draws, and the folded
            // basins along the craton's edge (the Hamersley, the Transvaal, the Labrador Trough))
            // (D4: and richest where deep weathering leached the silica out — the Hamersley's, Carajás's high-grade hematite)
            wq(D.bif, g(F.bif) * Math.max(Math.min(1, 2.2 * rs[J4 + Rock.GREENSTONE]), 0.7 * edge * Math.min(1, rs[J4 + Rock.SHIELD] + rs[J4 + Rock.SLATE] + rs[J4 + Rock.GNEISS] + 0.5 * cover)) * (0.7 + 0.5 * (clim ? clim.ironLat[c] / 255 : 0)));
            // (D4: a belt's iron — veins and replacements in its limestone and slate; magnetite along an arc's front)
            wq(D.ironVein, g(F.ironVein) * or(Math.min(1, rs[J4 + Rock.LIMESTONE] + rs[J4 + Rock.SLATE] + 0.5 * rs[J4 + Rock.GNEISS] + 0.4 * rs[J4 + Rock.VOLCANIC]), 0.45 * bared));
            wq(D.ioa, g(F.ioa) * or(Math.min(1, rs[J4 + Rock.VOLCANIC] + 0.7 * rs[J4 + Rock.GRANITE]), 0.4 * bared));
            reef = write(c, D.reef, spot(g(F.reef), reefF, 0.55, 0.66, 31.7) * (cover + 0.6 * rs[J4 + Rock.SHIELD]));
            // (D2: oil gathers on the structure's highs — a fold belt's anticlines, in trends along its front (the Zagros), the
            // platform's arches; gas too, and in the deep basin between them)
            const arch = colArch ? smooth(0.1, 0.6, colArch[c] / 255) : 0;
            wq(D.oil, g(F.oil) * (cover + young + 0.1 * base) * (B.trapFloor + (1 - B.trapFloor) * arch));
            wq(D.gas, g(F.gas) * (cover + young + 0.1 * base) * (0.5 + 0.5 * Math.max(arch, smooth(1.5, 4, colT ? colT[c] / 1000 : 0))));
            // (seeps and tar where a basin lost its roof; oil shale where the surface lies within its bed, near the cover's top)
            const shaleBed = inCover ? smooth(-0.1, 0.2, B.oilShaleKm - depth) * (rk === Rock.SHALE ? 1 : rk === Rock.LIMESTONE ? 0.6 : 0.3) : 0;
            wq(D.bitumen, Math.max(g(F.bitumen) * (cover + 0.5 * young), g(F.oilShale) * shaleBed));
        }
        // (the placers' sources: gold, tin and diamonds where they lie bared)
        goldSrc[c] = Math.max(bared * Math.max(orogenic, epithermal, green, 0.6 * porphyry), 0.4 * reef);
        tinSrc[c] = tin; diaSrc[c] = kimb;
        // ── G4: the climate's work on the ground ──
        if (clim) {
            const rgh = coarse.atCorners(rough, ci, cw), relief = z[c] - fine.at(ref, la, lo), gentle = smooth(0.35, 0.12, rgh), flat = smooth(0.15, 0.05, rgh);
            let host = 0, feHost = 0;
            for (let r = 1; r < ROCK_COUNT; r++) { host += rs[J4 + r] * BAUX_HOST[r]; feHost += rs[J4 + r] * FE_HOST[r]; }
            // ── D1b: the ground decides. A weathered crust (laterite, bauxite) caps old, flat, well-drained ground — the
            // interfluves and plateau tops, broken where valleys cut through (West Africa's and Australia's mesas) — never a
            // river's plain; peat and bog iron lie low, on flat, badly drained floors and the rivers' plains; salt flats in the
            // lowest pans of dry country. (The place's height over the land within ~40 km: + an interfluve, − a valley floor) ──
            const GR = Dp.ground, plainRock = rk === Rock.ALLUVIUM;
            const crust = smooth(GR.crustRelief[0], GR.crustRelief[1], relief) * (plainRock ? GR.crustOnPlain : 1);
            const lowFloor = Math.max(smooth(GR.floorRelief[0], GR.floorRelief[1], relief), plainRock ? 1 : 0);
            const baux = clim.baux[c] / 255;
            wq(D.bauxite, baux * gentle * host * crust);
            write(c, D.niLaterite, (clim.ni[c] / 255) * gentle * crust * Math.min(1, 2 * (rs[J4 + Rock.OPHIOLITE] + 0.6 * rs[J4 + Rock.GREENSTONE] + 0.25 * rs[J4 + Rock.BASALT])));
            wq(D.ironLaterite, (clim.ironLat[c] / 255) * gentle * crust * feHost * (1 - 0.7 * baux));
            // (copper ore weathered rich: a long dry season, no ice, the ground not stripped fast)
            write(c, D.supergene, Math.max(porphyry, 0.7 * vms, 0.5 * skarn) * (clim.semi[c] / 255) * (1 - glac) * (1 - 0.6 * smooth(0.6, 1.2, rgh)));
            write(c, D.gossan, Math.max(vms, porphyry, skarn, 0.7 * mvt, 0.7 * sedex) * (1 - 0.8 * glac) * (1 - 0.8 * young));
            // (salt: the lakes and pans; old salt beds bared in a dry land; flats of the dry country — a playa, a sabkha)
            const evap = clim.evap[c] / 255, lk = lake ? lake[c] : 0;
            const flats = 0.75 * evap * flat * (0.5 + 0.5 * young) * smooth(GR.panRelief[0], GR.panRelief[1], relief);
            write(c, D.salt, Math.max(lk === 3 ? 1 : lk === 2 ? 0.85 : 0, Math.min(1, 3 * rs[J4 + Rock.SALT]) * (0.6 + 0.4 * evap), flats));
            const peat = (clim.peat[c] / 255) * flat * lowFloor * (till && till[c] > 40 ? 1.2 : 1) * (ice && ice[c] ? 0 : 1);
            wq(D.peat, peat);
            // (bog iron: any wet, badly drained lowland with a growing season — wider than peat's — richest on the ice age's
            // sands and till: the commonest early iron of the north)
            const wetLow = Math.sqrt(clim.peat[c] / 255) * smooth(0.25, 0.08, rgh) * Math.max(0.25, lowFloor) * (ice && ice[c] ? 0 : 1);
            wq(D.bogIron, wetLow * (till && till[c] > 40 ? 1 : 0.35 + 0.5 * (young + rs[J4 + Rock.SANDSTONE])));
            // (G7: the dry country's gems — opal in the sandstone and shale of old, gentle, deeply weathered ground (the Great
            // Artesian Basin), a little in rhyolite; turquoise and malachite over copper ore under a desert sky (Sinai, Nishapur))
            const arid = clim.arid[c] / 255;
            wq(D.opal, arid * gentle * crust * Math.min(1, 1.2 * (rs[J4 + Rock.SANDSTONE] + 0.7 * rs[J4 + Rock.SHALE]) + 0.4 * rs[J4 + Rock.VOLCANIC]));
            wq(D.turquoise, Math.max(porphyry, 0.7 * vms, 0.5 * skarn) * arid * (1 - glac));
        }
        // ── D1: the beds, cropping out as the Rocks map's do. Coal measures: the cover's top — its make-up is the top's, as
        // last laid — coal where the surface still lies within them: the basin's floor and its synclines, gone from the
        // anticlines and from valleys cut below their base; in their sandstone and shale ──
        const coalV = inCover ? g(F.coal) * smooth(-0.1, 0.25, B.coalMeasuresKm - depth) *
            (rk === Rock.SANDSTONE || rk === Rock.SHALE ? 1 : rk === Rock.LIMESTONE ? 0.35 : rk === Rock.ALLUVIUM ? 0.5 : 0) : 0;
        wq(D.coal, coalV);
        // oolitic ironstone: thin beds at some of the column's contacts (a sea's condensed horizons), cropping out where the
        // surface crosses them — lines round the platform's scarps and up its valleys; and the coal measures' clay ironstone
        let ironB = 0;
        if (inCover) {
            let i = 0;
            while (i < tops.length - 1 && tops[i] <= sK) i++;
            const below = i > 0 ? tops[i - 1] : 0, near = sK - below < tops[i] - sK ? i - 1 : i, dist = Math.min(sK - below, tops[i] - sK);
            if (near >= 0 && horizon[near]) ironB = smooth(B.ironHorizonKm, 0.3 * B.ironHorizonKm, dist);
        }
        wq(D.ironstone, Math.max(g(F.ironstone) * ironB * (rk === Rock.ALLUVIUM ? 0.4 : 1), 0.5 * coalV));
        write(c, D.wood, biome ? (WOOD[biome[c] & 31] ?? 0) : 0);
        // ── the Stone Age's stones: flint in chalk and limestone (and the gravels below them), obsidian on a young arc's
        // volcanics, jade where old sea floor was thrust up, agate in flood basalts ──
        // (D4: knappable stone almost anywhere off the great plains — flint in chalk and limestone the best; chert, jasper and
        // quartzite in the older rocks; obsidian on its own below)
        wq(D.flint, Math.min(1, 1.6 * rs[J4 + Rock.LIMESTONE] + 0.6 * rs[J4 + Rock.GREENSTONE] + 0.35 * (rs[J4 + Rock.SHALE] + rs[J4 + Rock.SLATE] + rs[J4 + Rock.SANDSTONE] + rs[J4 + Rock.VOLCANIC]) + 0.25 * (rs[J4 + Rock.SHIELD] + rs[J4 + Rock.GNEISS])) + 0.3 * young);
        wq(D.obsidian, Math.min(1, 2 * rs[J4 + Rock.VOLCANIC]) * smooth(0.01, 0.15, g(F.epithermal)));
        wq(D.jade, Math.min(1, 1.1 * rs[J4 + Rock.OPHIOLITE] + 0.2 * rs[J4 + Rock.GREENSTONE]));
        wq(D.agate, Math.min(1, 0.8 * rs[J4 + Rock.BASALT]));
        // ── G7: the gems (kimberlites' diamonds above; the dry country's opal and turquoise with the climate) — pegmatites in
        // granite and gneiss; emeralds where pegmatites cut old sea floor, or in a fold belt's black shale; rubies and
        // sapphires in marble, lapis where granite met it; sapphire and peridot in a hotspot's basalts; amethyst geodes in
        // flood basalts; garnet in schist and gneiss ──
        let mar = 0, gemFrom = 0;
        if (coarse.atCorners(anyGem, ci, cw) > 0.002) {
            const peg = g(F.pegmatite);
            mar = g(F.marble);
            const pegm = wd(D.pegmatite, peg * or(rs[J4 + Rock.GRANITE] + rs[J4 + Rock.GNEISS] + 0.5 * rs[J4 + Rock.SLATE], 0.4 * bared));
            wq(D.emerald, Math.max(peg * Math.min(1, 3 * (rs[J4 + Rock.OPHIOLITE] + rs[J4 + Rock.GREENSTONE]) + 0.3 * rs[J4 + Rock.SLATE]), g(F.foldShale) * Math.min(1, 2 * rs[J4 + Rock.SHALE])));
            const corund = wd(D.corundum, mar * or(rs[J4 + Rock.GNEISS] + rs[J4 + Rock.SLATE], 0.3 * bared));
            wq(D.lapis, mar * Math.min(1, 2 * rs[J4 + Rock.GRANITE]) * or(rs[J4 + Rock.GNEISS] + rs[J4 + Rock.SLATE] + rs[J4 + Rock.LIMESTONE], 0.2));
            const basaltGem = wd(D.basaltGems, g(F.hotspot) * Math.min(1, 1.5 * rs[J4 + Rock.BASALT] + 0.3 * young));
            wq(D.amethyst, g(F.lip) * Math.min(1, 1.2 * rs[J4 + Rock.BASALT]));
            gemFrom = Math.max(corund, 0.8 * basaltGem, 0.5 * pegm);
        }
        const garnet = wd(D.garnet, Math.min(1, rs[J4 + Rock.GNEISS] + 0.7 * rs[J4 + Rock.SLATE] + 0.3 * rs[J4 + Rock.SHIELD]));
        // (the gem gravels' sources: rubies, sapphires and the rest where they lie bared)
        gemSrc[c] = bared * Math.max(gemFrom, 0.25 * garnet);
        // ── her building stone (D4, developer 2026-10-31: the rock under each place "feels slightly like a copout"; and "the
        // goodness of the stone should have no impact on the color, but the quality of the area/ease of access should"): how
        // much of the rock there is × how easily it is got at — hill country bares its bedrock (valley sides, scarps, crags),
        // the plains bury it under river silt, loess and till, and deep tropical weathering under metres of red earth; the
        // glaciers' scour left it bare — and a few quarry districts where a formation is at its best (Carrara, Portland,
        // Aswan). Where stone is scarce, clay for brick: the rivers' plains and the shale lowlands (Mesopotamia, the
        // Netherlands, the Ganges) ──
        const BS = Dp.buildingStone, hills = smooth(BS.hillsRough[0], BS.hillsRough[1], coarse.atCorners(rough, ci, cw) || 0);
        const deepRed = clim ? Math.max(clim.baux[c], clim.ironLat[c]) / 255 : 0;
        const access = Math.min(1, (1 - young) * (BS.plainAccess + (1 - BS.plainAccess) * hills) * (1 - BS.weatheredLoss * deepRed * (1 - hills)) * (glac ? BS.scouredGain : 1));
        const stoneHere = (1 - young) * (1 - rs[J4 + Rock.SHALE] - rs[J4 + Rock.SALT]);
        const quarry = stoneHere > 0.05 && access > 0.05 ? 1 - BS.quarry + BS.quarry * shapes.at(D.stoneGranite) : 1 - BS.quarry;
        const stone = v => Math.min(1, BS.gain * v * access * quarry);
        write(c, D.stoneLimestone, stone(rs[J4 + Rock.LIMESTONE]));
        write(c, D.stoneSandstone, stone(rs[J4 + Rock.SANDSTONE]));
        write(c, D.stoneGranite, stone(rs[J4 + Rock.GRANITE] + rs[J4 + Rock.GNEISS] + rs[J4 + Rock.SHIELD] + rs[J4 + Rock.GREENSTONE]));
        write(c, D.stoneVolcanic, stone(rs[J4 + Rock.BASALT] + rs[J4 + Rock.VOLCANIC] + rs[J4 + Rock.OPHIOLITE]));
        write(c, D.stoneMarble, stone(mar * Math.min(1, 1.5 * (rs[J4 + Rock.GNEISS] + rs[J4 + Rock.SLATE]) + 0.3 * rs[J4 + Rock.LIMESTONE])));
        write(c, D.stoneSlate, stone(rs[J4 + Rock.SLATE]));
        write(c, D.clay, Math.min(1, (1.1 * young + 0.6 * rs[J4 + Rock.SHALE]) * (BS.clayHills + (1 - BS.clayHills) * (1 - hills))));
    }
    // ── placers: gold, tin and diamonds carried down the rivers from where they lie bared, fading with distance; laid
    // where a river runs gentle. Ice strips them (guideRules.iceStripsPlacers): poor under the old ice, moderate at its
    // edge, richest where it never came — or, by her rule, richest near the old ice ──
    if (recv && order) {
        const carry = (src, Lkm) => {
            for (let i = order.length - 1; i >= 0; i--) {
                const c = order[i], d = recv[c];
                if (d < 0 || ocean[d] || !(src[c] > 0)) continue;
                const step = R * Math.hypot(xyz[3 * d] - xyz[3 * c], xyz[3 * d + 1] - xyz[3 * c + 1], xyz[3 * d + 2] - xyz[3 * c + 2]), v = src[c] * Math.exp(-step / Lkm);
                if (v > src[d]) src[d] = v;
            }
            return src;
        };
        // (a cell's share the placer gravels take: a band along the river, placerBandKm either side)
        const band = Math.min(1, 2 * Dp.placerBandKm / mesh.edgeKm);
        const gold = carry(goldSrc, Dp.placerKm.gold), tin = carry(tinSrc, Dp.placerKm.tin), dia = carry(diaSrc, Dp.placerKm.diamond), gem = carry(gemSrc, Dp.placerKm.gem);
        for (let c = 0; c < n; c++) {
            if (ocean[c]) continue;
            const flow = q ? smooth(1, 15, q[c]) : 0;
            if (!(flow > 0)) continue;
            const gentle = smooth(0.45, 0.15, coarse.at(rough, lat[c], lon[c])), g0 = glaciated && glaciated[c] ? 1 : 0, edge = till && !g0 ? till[c] / 255 : 0;
            const iceK = ruleIce ? (g0 ? 0.15 : 1 - 0.4 * edge) : (g0 ? 0.8 : 0.7 + 0.6 * edge);
            const k = flow * (0.5 + 0.5 * gentle) * iceK * band;
            write(c, D.placerGold, gold[c] * k); write(c, D.placerTin, tin[c] * k); write(c, D.placerDiamond, dia[c] * k); write(c, D.gemPlacer, gem[c] * k);
        }
    }
    // (the land's shares as the map paints them: each grid cell's richness over its land cells — the systems' as the metals')
    shares.fill(0);
    for (let k = 0; k < SYS; k++) for (let j = 0; j < K; j++) {
        if (!cnt[j]) continue;
        const v = data[k * K + j] / 255;
        if (v >= gRich) shares[3 * k + 2] += cnt[j]; else if (v >= gMod) shares[3 * k + 1] += cnt[j]; else if (v >= gPoor) shares[3 * k] += cnt[j];
    }
    // ── the metals, per grid cell: each its richest source's richness, a little more where several overlap — kept after the
    // systems (rows SYS…); their land shares by the grid cells' land ──
    const MET = METALS.length, ROWS = SYS + MET, all = new Uint8Array(ROWS * K), metalShares = new Float32Array(3 * MET);
    all.set(data);
    let landCells = 0;
    for (let j = 0; j < K; j++) landCells += cnt[j];
    METALS.forEach((m, mi) => {
        const ks = Int32Array.from(m.sources, ([id]) => D[id] * K), ws = Float64Array.from(m.sources, ([, w]) => w), ns = ks.length, row = (SYS + mi) * K;
        for (let j = 0; j < K; j++) {
            let mx = 0, sum = 0;
            for (let i = 0; i < ns; i++) { const v = ws[i] * data[ks[i] + j] / 255; if (v > mx) mx = v; sum += v; }
            const v = Math.min(1, mx + 0.15 * (sum - mx));
            all[row + j] = Math.round(255 * v);
            if (cnt[j]) { if (v >= gRich) metalShares[3 * mi + 2] += cnt[j]; else if (v >= gMod) metalShares[3 * mi + 1] += cnt[j]; else if (v >= gPoor) metalShares[3 * mi] += cnt[j]; }
        }
    });
    for (let i = 0; i < metalShares.length; i++) metalShares[i] /= Math.max(1, landCells);
    for (let i = 0; i < shares.length; i++) shares[i] /= Math.max(1, landCells);
    // (grid cells no terrain cell fell in — toward the poles a grid cell is narrower than a terrain cell — take their
    // neighbours' richest, twice over: no holes in a district)
    let cur = list, curData = all, curK = K;
    const nb8 = (g, fn) => {
        const y = Math.floor(g / out.w), x = g % out.w;
        for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= out.h) continue;
            for (let dx = -1; dx <= 1; dx++) if (dx || dy) fn(yy * out.w + (x + dx + out.w) % out.w);
        }
    };
    for (let pass = 0; pass < 2; pass++) {
        // (the empty neighbours, each a slot of its own; then each takes its kept neighbours' richest, row by row)
        const start = curK;
        for (let j = 0; j < start; j++) nb8(cur[j], h => { if (gi[h] < 0) { gi[h] = cur.length; cur.push(h); } });
        const K2 = cur.length;
        if (K2 === start) break;
        const d2 = new Uint8Array(ROWS * K2);
        for (let k = 0; k < ROWS; k++) d2.set(curData.subarray(k * start, (k + 1) * start), k * K2);
        for (let j = 0; j < start; j++) nb8(cur[j], h => {
            const t = gi[h];
            if (t < start) return;
            for (let k = 0; k < ROWS; k++) { const v = curData[k * start + j]; if (v > d2[k * K2 + t]) d2[k * K2 + t] = v; }
        });
        curData = d2; curK = K2;
    }
    // (each kept grid cell's land cells — 0 where filled in — so the page can weigh the land: the ages' shares)
    const land = new Uint16Array(cur.length);
    for (let j = 0; j < K; j++) land[j] = Math.min(65535, cnt[j]);
    return { step, w: out.w, h: out.h, cells: Int32Array.from(cur), data: curData, rows: ROWS, land, shares, metalShares };
}

/** The climate's tests for the deposits, from a cell's twelve months (°C, mm): bauxite (Price et al. 1997), nickel
 *  laterite (Thorne et al.), iron laterite, evaporites (Bao et al. 2023: of the months over 24 °C, 80 % under 100 mm),
 *  peat and coal (Bao: ≥ 80 % of the months over 10 °C with over 40 mm; none where every month is over 30 °C), enriched
 *  copper (a long dry season, warm enough) — each 0…255, into `out` (arrays) at cell c. */
export function climateTests(T12, P12, c, out) {
    let tSum = 0, pSum = 0, cold = Infinity, warm = -Infinity, dry60 = 0, hot = 0, hotDry = 0, warm10 = 0, wet10 = 0, allHot = true;
    for (let m = 0; m < 12; m++) {
        const t = T12[m], p = P12[m];
        tSum += t; pSum += p;
        if (t < cold) cold = t;
        if (t > warm) warm = t;
        if (p < 60) dry60++;
        if (t > 24) { hot++; if (p < 100) hotDry++; }
        if (t > 10) { warm10++; if (p > 40) wet10++; }
        if (t <= 30) allHot = false;
    }
    const mat = tSum / 12, map = pSum;
    out.baux[c] = Math.round(255 * smooth(20, 23, mat) * smooth(1000, 1400, map) * smooth(7.5, 5.5, dry60));
    out.ni[c] = Math.round(255 * smooth(800, 1100, map) * smooth(13, 16, cold) * (1 - smooth(26, 28.5, cold)) * smooth(20, 23, warm) * (1 - smooth(30.5, 32.5, warm)));
    out.ironLat[c] = Math.round(255 * smooth(15, 20, mat) * smooth(500, 900, map));
    out.evap[c] = Math.round(255 * Math.max(hot ? smooth(0.6, 0.85, hotDry / hot) * smooth(0.5, 2.5, hot) : 0, smooth(350, 120, map) * smooth(0, 10, mat)));
    out.peat[c] = allHot || warm10 < 2 ? 0 : Math.round(255 * smooth(0.75, 0.95, wet10 / warm10) * smooth(1.5, 3.5, warm10) * smooth(350, 600, map));
    // (enriched copper: weathered under a long dry season, the water table rising and falling — semi-arid or seasonally
    // wet; a hyperarid desert keeps what earlier, wetter times made — the Atacama — so it counts, a little less)
    out.semi[c] = Math.round(255 * smooth(5, 11, mat) * smooth(3, 5, dry60) * (0.6 + 0.4 * smooth(60, 180, map)) * (1 - smooth(1200, 1600, map)));
    // (G7: dry, warm country — opal and turquoise: Coober Pedy ~150 mm, Lightning Ridge ~480, Nishapur ~250)
    out.arid[c] = Math.round(255 * smooth(650, 300, map) * smooth(10, 16, mat));
}
export const climateTestArrays = n => ({ baux: new Uint8Array(n), ni: new Uint8Array(n), ironLat: new Uint8Array(n), evap: new Uint8Array(n), peat: new Uint8Array(n), semi: new Uint8Array(n), arid: new Uint8Array(n) });
