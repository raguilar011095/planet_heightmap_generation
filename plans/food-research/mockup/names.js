// Earth likenesses for a world's crops: each place crops were first grown is "like" one of Earth's regions where farming
// began, chosen by climate and pulled toward what nearby places are like (how hard: the developer's toggle); each crop is
// named "X-like" from the catalogue of Earth's crops. A different world: likenesses, never claims.
// Each crop: its Earth home regions, its own climate where unlike its home's (T °C mean, W wetness, E height km), and two
// rough judgements, 0…1 — pop: how widely grown and loved on Earth (FAO output, how many cuisines rely on it); nut: how
// much it feeds (energy and protein for staples and pulses, nutrient density for vegetables; spices little). w: the
// Wikipedia article where the plain name would land elsewhere.
(function (root) {
'use strict';
const PKG = {
    FC: { name: 'the Fertile Crescent', lat: 36, lon: 40, T: 16, W: 0.35, E: 0.6, ws: 0.8, world: 'O' },
    MED: { name: 'the Mediterranean', lat: 38, lon: 20, T: 16, W: 0.5, E: 0.3, ws: 0.8, world: 'O' },
    EU: { name: 'temperate Europe', lat: 49, lon: 10, T: 9, W: 1.1, E: 0.3, ws: 0.5, world: 'O' },
    CAS: { name: 'Central Asia', lat: 40, lon: 66, T: 12, W: 0.3, E: 0.8, ws: 0.65, world: 'O' },
    YR: { name: 'the Yellow River', lat: 35, lon: 110, T: 12, W: 0.55, E: 0.5, ws: 0.15, world: 'O' },
    YZ: { name: 'the Yangtze', lat: 30, lon: 115, T: 17, W: 1.2, E: 0.1, ws: 0.3, world: 'O' },
    YUN: { name: 'Yunnan–Assam', lat: 25, lon: 100, T: 16, W: 1.2, E: 1.6, ws: 0.15, world: 'O' },
    GA: { name: 'the Ganges', lat: 25, lon: 85, T: 25, W: 0.8, E: 0.1, ws: 0.1, world: 'O' },
    SIN: { name: 'South India', lat: 10, lon: 77, T: 27, W: 1.3, E: 0.3, ws: 0.3, world: 'O' },
    MOL: { name: 'the Moluccas', lat: -3, lon: 128, T: 27, W: 2.2, E: 0.1, ws: 0.45, world: 'O' },
    NG: { name: 'New Guinea', lat: -6, lon: 145, T: 22, W: 2.0, E: 1.0, ws: 0.5, world: 'O' },
    SWA: { name: 'the Sahel', lat: 13, lon: 0, T: 28, W: 0.35, E: 0.3, ws: 0.05, world: 'O' },
    WAF: { name: 'the West African forest', lat: 7, lon: -3, T: 26, W: 1.1, E: 0.2, ws: 0.2, world: 'O' },
    ET: { name: 'the Ethiopian highlands', lat: 9, lon: 39, T: 17, W: 0.9, E: 2.2, ws: 0.15, world: 'O' },
    MA: { name: 'Mesoamerica', lat: 18, lon: -97, T: 21, W: 0.7, E: 1.2, ws: 0.1, world: 'N' },
    AN: { name: 'the Andes', lat: -13, lon: -72, T: 10, W: 0.7, E: 3.3, ws: 0.15, world: 'N' },
    AM: { name: 'Amazonia', lat: -10, lon: -63, T: 26, W: 1.3, E: 0.2, ws: 0.15, world: 'N' },
    ENA: { name: 'eastern North America', lat: 37, lon: -88, T: 13, W: 1.0, E: 0.2, ws: 0.45, world: 'N' },
};
const KEYS = Object.keys(PKG), NK = KEYS.length;
const I = (n, p, x) => ({ n, p: p.split(' '), ...(x || {}) });
const CAT = {
    staple: [
        [I('japonica rice', 'YZ', { pop: 1, nut: 0.8, w: 'Japonica rice' }), I('indica rice', 'GA', { pop: 1, nut: 0.8, w: 'Indica rice' }), I('African rice', 'SWA', { W: 0.6, pop: 0.4, nut: 0.75, w: 'Oryza glaberrima' }),
            I('Manchurian wild rice', 'YZ', { T: 15, W: 1.3, pop: 0.25, nut: 0.7, w: 'Zizania latifolia' }), I('northern wild rice', 'ENA', { T: 7, pop: 0.3, nut: 0.8, w: 'Zizania palustris' })],
        [I('bread wheat', 'FC CAS', { pop: 1, nut: 0.85, w: 'Common wheat' }), I('durum wheat', 'FC MED', { pop: 0.7, nut: 0.85 }), I('emmer', 'FC', { pop: 0.6, nut: 0.8 }), I('einkorn', 'FC', { E: 0.9, pop: 0.4, nut: 0.8, w: 'Einkorn wheat' }),
            I('barley', 'FC', { W: 0.3, pop: 0.9, nut: 0.8 }), I('rye', 'EU', { T: 7, pop: 0.7, nut: 0.8 }), I('oats', 'EU', { W: 1.2, pop: 0.75, nut: 0.85, w: 'Oat' }), I('spelt', 'EU', { pop: 0.5, nut: 0.8 }),
            I('teff', 'ET', { E: 2.2, pop: 0.4, nut: 0.85 }), I('quinoa', 'AN', { E: 3.3, pop: 0.55, nut: 0.9 }), I('kañiwa', 'AN', { E: 3.8, pop: 0.2, nut: 0.85, w: 'Chenopodium pallidicaule' }),
            I('buckwheat', 'YUN', { T: 12, E: 1.8, pop: 0.5, nut: 0.8 }), I('naked barley', 'CAS', { E: 2.5, pop: 0.4, nut: 0.8, w: 'Hordeum vulgare var. nudum' })],
        [I('maize', 'MA', { pop: 1, nut: 0.8 }), I('foxtail millet', 'YR', { pop: 0.6, nut: 0.8 }), I('broomcorn millet', 'YR', { W: 0.4, pop: 0.55, nut: 0.8, w: 'Proso millet' }),
            I('sorghum', 'SWA ET', { pop: 0.85, nut: 0.8, w: 'Sorghum bicolor' }), I('pearl millet', 'SWA', { W: 0.25, pop: 0.7, nut: 0.8 }), I('finger millet', 'ET', { pop: 0.5, nut: 0.8 }),
            I('fonio', 'SWA WAF', { pop: 0.3, nut: 0.75, w: 'Digitaria exilis' }), I('little millet', 'SIN', { pop: 0.25, nut: 0.75, w: 'Panicum sumatrense' }), I('browntop millet', 'SIN', { pop: 0.15, nut: 0.7, w: 'Urochloa ramosa' }),
            I('goosefoot', 'ENA', { pop: 0.15, nut: 0.8, w: 'Chenopodium berlandieri' }), I('maygrass', 'ENA', { pop: 0.1, nut: 0.7, w: 'Phalaris caroliniana' }), I('grain amaranth', 'MA', { pop: 0.35, nut: 0.85, w: 'Amaranth grain' }),
            I('sauwi millet', 'MA', { W: 0.3, pop: 0.1, nut: 0.7, w: 'Panicum sonorum' }), I('Job’s tears', 'YUN', { pop: 0.2, nut: 0.75, w: 'Coix lacryma-jobi' })],
        [I('potato', 'AN', { E: 3.3, pop: 1, nut: 0.75 }), I('oca', 'AN', { E: 3.3, pop: 0.3, nut: 0.6, w: 'Oxalis tuberosa' }), I('ulluco', 'AN', { E: 3.5, pop: 0.25, nut: 0.55 }),
            I('mashua', 'AN', { E: 3.5, pop: 0.15, nut: 0.55, w: 'Tropaeolum tuberosum' }), I('sweet potato', 'AM MA', { pop: 0.9, nut: 0.8 }), I('cassava', 'AM', { pop: 0.95, nut: 0.6 }),
            I('Guinea yam', 'WAF', { pop: 0.6, nut: 0.65, w: 'Dioscorea rotundata' }), I('greater yam', 'NG MOL', { pop: 0.5, nut: 0.65, w: 'Dioscorea alata' }), I('taro', 'NG', { pop: 0.65, nut: 0.65 }),
            I('arrowroot', 'AM', { pop: 0.25, nut: 0.55, w: 'Maranta arundinacea' }), I('konjac', 'YUN', { pop: 0.25, nut: 0.4 }), I('Jerusalem artichoke', 'ENA', { pop: 0.25, nut: 0.6 }),
            I('tannia', 'AM', { pop: 0.3, nut: 0.6, w: 'Xanthosoma sagittifolium' }), I('maca', 'AN', { E: 4, pop: 0.2, nut: 0.6, w: 'Lepidium meyenii' })],
        [I('banana', 'NG', { pop: 1, nut: 0.7 }), I('plantain', 'NG', { pop: 0.8, nut: 0.7, w: 'Cooking banana' }), I('breadfruit', 'MOL', { pop: 0.45, nut: 0.7 }), I('sago palm', 'NG', { W: 2.5, pop: 0.35, nut: 0.55, w: 'Metroxylon sagu' }),
            I('date palm', 'FC', { W: 0.08, T: 25, pop: 0.75, nut: 0.75 }), I('enset', 'ET', { pop: 0.25, nut: 0.6, w: 'Ensete ventricosum' }), I('peach palm', 'AM', { pop: 0.25, nut: 0.7, w: 'Bactris gasipaes' }),
            I('coconut', 'MOL', { pop: 0.9, nut: 0.75 }), I('chestnut', 'MED', { T: 12, pop: 0.45, nut: 0.7, w: 'Castanea sativa' })],
    ],
    // (each pulse's own climate as grown: lentils, chickpeas and grass peas the cool season of warm lands too; common and
    // runner beans cool summers; lima, tepary and peanuts the heat; soy north into Manchuria, mung and black gram the hot monsoon)
    pulseCool: [I('lentil', 'FC', { T: 19, W: 0.4, pop: 0.85, nut: 0.95 }), I('pea', 'FC', { T: 10, W: 0.8, pop: 0.85, nut: 0.9 }), I('chickpea', 'FC', { T: 21, W: 0.35, pop: 0.85, nut: 0.95 }),
        I('faba bean', 'FC MED', { T: 11, W: 0.8, pop: 0.6, nut: 0.9, w: 'Vicia faba' }), I('grass pea', 'FC', { T: 22, W: 0.35, pop: 0.25, nut: 0.8, w: 'Lathyrus sativus' }),
        I('bitter vetch', 'FC', { T: 15, W: 0.35, pop: 0.15, nut: 0.75, w: 'Vicia ervilia' }), I('tarwi lupin', 'AN', { E: 3, pop: 0.2, nut: 0.9, w: 'Lupinus mutabilis' })],
    pulseWarm: [I('common bean', 'MA AN', { T: 12, pop: 0.95, nut: 0.95, w: 'Phaseolus vulgaris' }), I('lima bean', 'AN', { T: 21, E: 0.5, pop: 0.5, nut: 0.9 }), I('runner bean', 'MA', { T: 10, E: 1.5, pop: 0.4, nut: 0.9, w: 'Phaseolus coccineus' }),
        I('tepary bean', 'MA', { T: 22, W: 0.25, pop: 0.2, nut: 0.9 }), I('peanut', 'AM', { T: 24, pop: 0.95, nut: 0.95 }), I('jack bean', 'MA', { T: 24, pop: 0.15, nut: 0.8, w: 'Canavalia ensiformis' })],
    pulseMonsoon: [I('soybean', 'YR', { T: 11, pop: 1, nut: 1 }), I('mung bean', 'GA', { T: 26, pop: 0.7, nut: 0.9 }), I('adzuki bean', 'YZ', { T: 14, pop: 0.5, nut: 0.9 }),
        I('black gram', 'SIN', { T: 26, pop: 0.5, nut: 0.9, w: 'Vigna mungo' }), I('pigeon pea', 'SIN GA', { T: 25, W: 0.6, pop: 0.55, nut: 0.9 }), I('moth bean', 'GA', { T: 27, W: 0.25, pop: 0.2, nut: 0.85, w: 'Vigna aconitifolia' }),
        I('rice bean', 'YUN', { T: 20, pop: 0.2, nut: 0.85, w: 'Vigna umbellata' })],
    pulseSavanna: [I('cowpea', 'SWA', { T: 27, W: 0.4, pop: 0.8, nut: 0.9 }), I('Bambara groundnut', 'SWA', { T: 26, W: 0.5, pop: 0.35, nut: 0.9 }), I('hyacinth bean', 'ET', { T: 22, pop: 0.3, nut: 0.85, w: 'Lablab' }),
        I('Kersting’s groundnut', 'WAF', { T: 27, W: 0.7, pop: 0.1, nut: 0.8, w: 'Macrotyloma geocarpum' }), I('horse gram', 'SIN', { T: 26, W: 0.35, pop: 0.25, nut: 0.85, w: 'Macrotyloma uniflorum' })],
    olive: [I('olive', 'MED', { pop: 0.95, nut: 0.7 }), I('argan', 'MED', { T: 19, W: 0.25, pop: 0.25, nut: 0.6, w: 'Argania' }), I('carob', 'MED', { pop: 0.35, nut: 0.6 }),
        I('tea-oil camellia', 'YZ', { pop: 0.2, nut: 0.5, w: 'Camellia oleifera' }), I('shea', 'SWA', { pop: 0.45, nut: 0.6, w: 'Vitellaria' })],
    vine: [I('grape', 'FC MED', { pop: 1, nut: 0.6 }), I('Amur grape', 'YR', { T: 5, pop: 0.2, nut: 0.5, w: 'Vitis amurensis' }), I('muscadine', 'ENA', { pop: 0.2, nut: 0.5 }),
        I('kiwi vine', 'YZ', { pop: 0.6, nut: 0.7, w: 'Kiwifruit' }), I('passion fruit', 'AM', { pop: 0.55, nut: 0.65, w: 'Passiflora edulis' }), I('hops', 'EU', { pop: 0.45, nut: 0.2 })],
    date: [I('date palm', 'FC', { W: 0.08, pop: 0.8, nut: 0.75 }), I('doum palm', 'ET SWA', { pop: 0.15, nut: 0.5, w: 'Hyphaene thebaica' }), I('jujube', 'YR', { W: 0.3, pop: 0.45, nut: 0.6 }),
        I('mesquite', 'MA', { W: 0.15, pop: 0.2, nut: 0.6, w: 'Prosopis' }), I('Indian jujube', 'GA', { pop: 0.3, nut: 0.6, w: 'Ziziphus mauritiana' }), I('prickly pear', 'MA', { W: 0.15, pop: 0.4, nut: 0.55, w: 'Opuntia ficus-indica' })],
    pome: [I('apple', 'CAS', { pop: 1, nut: 0.6 }), I('pear', 'CAS', { pop: 0.85, nut: 0.6 }), I('plum', 'EU', { pop: 0.75, nut: 0.6 }), I('apricot', 'YR CAS', { pop: 0.7, nut: 0.65 }),
        I('cherry', 'EU', { pop: 0.8, nut: 0.6 }), I('peach', 'YZ', { pop: 0.85, nut: 0.6 }), I('quince', 'CAS', { pop: 0.3, nut: 0.5 }), I('persimmon', 'YZ', { pop: 0.5, nut: 0.65 }),
        I('pawpaw', 'ENA', { pop: 0.15, nut: 0.6, w: 'Asimina triloba' }), I('hawthorn', 'YR', { pop: 0.15, nut: 0.5, w: 'Crataegus pinnatifida' }), I('currant', 'EU', { pop: 0.3, nut: 0.7, w: 'Blackcurrant' }),
        I('strawberry', 'EU AN', { pop: 0.9, nut: 0.65 }), I('blueberry', 'ENA', { pop: 0.6, nut: 0.75 }), I('cranberry', 'ENA', { W: 1.2, pop: 0.4, nut: 0.6 })],
    nut: [I('walnut', 'CAS', { pop: 0.8, nut: 0.95, w: 'Juglans regia' }), I('almond', 'FC', { pop: 0.85, nut: 0.95 }), I('pistachio', 'CAS', { W: 0.25, pop: 0.6, nut: 0.95 }),
        I('hazelnut', 'EU', { pop: 0.7, nut: 0.95 }), I('sweet chestnut', 'MED', { pop: 0.5, nut: 0.7, w: 'Castanea sativa' }), I('pecan', 'ENA', { pop: 0.5, nut: 0.95 }),
        I('hickory', 'ENA', { pop: 0.15, nut: 0.9 }), I('Brazil nut', 'AM', { pop: 0.4, nut: 0.95 }), I('candlenut', 'MOL', { pop: 0.1, nut: 0.8 }),
        I('canarium nut', 'NG', { pop: 0.1, nut: 0.85, w: 'Canarium indicum' }), I('cashew', 'AM', { pop: 0.75, nut: 0.9 })],
    citrus: [I('orange', 'YUN', { pop: 0.95, nut: 0.7, w: 'Orange (fruit)' }), I('pomelo', 'YUN', { pop: 0.4, nut: 0.65 }), I('mandarin', 'YZ', { pop: 0.85, nut: 0.7, w: 'Mandarin orange' }),
        I('lemon', 'YUN GA', { pop: 0.85, nut: 0.6 }), I('lychee', 'YZ', { pop: 0.5, nut: 0.6 }), I('mango', 'GA SIN', { pop: 0.95, nut: 0.7 }), I('avocado', 'MA', { pop: 0.85, nut: 0.85 }),
        I('cherimoya', 'AN', { pop: 0.3, nut: 0.6 }), I('papaya', 'MA', { pop: 0.7, nut: 0.7 }), I('guava', 'AM', { pop: 0.55, nut: 0.75 }), I('jackfruit', 'SIN', { pop: 0.45, nut: 0.65 }),
        I('pomegranate', 'CAS FC', { pop: 0.55, nut: 0.65 }), I('fig', 'FC', { pop: 0.6, nut: 0.65, w: 'Common fig' }), I('pineapple', 'AM', { pop: 0.85, nut: 0.6 }),
        I('durian', 'MOL', { pop: 0.35, nut: 0.7 }), I('mangosteen', 'MOL', { pop: 0.3, nut: 0.6, w: 'Purple mangosteen' }), I('rambutan', 'MOL', { pop: 0.3, nut: 0.6 })],
    bark: [I('cinnamon', 'SIN', { pop: 0.9, nut: 0.2, w: 'Cinnamomum verum' }), I('cassia', 'YZ YUN', { pop: 0.6, nut: 0.2, w: 'Cinnamomum cassia' }), I('canella', 'MA', { pop: 0.1, nut: 0.2, w: 'Canella winterana' }),
        I('Indonesian cinnamon', 'MOL', { pop: 0.3, nut: 0.2, w: 'Cinnamomum burmanni' }), I('sassafras', 'ENA', { pop: 0.15, nut: 0.1 })],
    berry: [I('black pepper', 'SIN', { pop: 1, nut: 0.2 }), I('long pepper', 'GA', { pop: 0.2, nut: 0.2 }), I('cubeb', 'MOL', { pop: 0.15, nut: 0.2 }), I('Ashanti pepper', 'WAF', { pop: 0.1, nut: 0.2, w: 'Piper guineense' }),
        I('vanilla', 'MA', { pop: 0.9, nut: 0.1 }), I('betel', 'MOL SIN', { pop: 0.3, nut: 0.1 })],
    bud: [I('clove', 'MOL', { pop: 0.8, nut: 0.2 }), I('nutmeg and mace', 'MOL', { pop: 0.8, nut: 0.2, w: 'Nutmeg' }), I('allspice', 'MA', { pop: 0.5, nut: 0.2 }), I('star anise', 'YUN', { pop: 0.55, nut: 0.2, w: 'Illicium verum' }),
        I('caper', 'MED', { W: 0.3, pop: 0.4, nut: 0.2 })],
    rhizome: [I('ginger', 'YUN MOL', { pop: 1, nut: 0.3 }), I('turmeric', 'SIN GA', { pop: 0.9, nut: 0.3 }), I('galangal', 'MOL', { pop: 0.35, nut: 0.2 }), I('cardamom', 'SIN', { pop: 0.75, nut: 0.2 }),
        I('grains of paradise', 'WAF', { pop: 0.15, nut: 0.2 }), I('zedoary', 'SIN', { pop: 0.1, nut: 0.2, w: 'Curcuma zedoaria' })],
    seed: [I('cumin', 'FC CAS', { pop: 0.85, nut: 0.3 }), I('coriander', 'FC', { pop: 0.85, nut: 0.3 }), I('fenugreek', 'FC', { pop: 0.5, nut: 0.4 }), I('nigella', 'FC', { pop: 0.35, nut: 0.3, w: 'Nigella sativa' }),
        I('black mustard', 'EU', { pop: 0.6, nut: 0.4, w: 'Brassica nigra' }), I('sesame', 'GA SWA', { pop: 0.85, nut: 0.8 }), I('anise', 'MED', { pop: 0.45, nut: 0.3 }), I('caraway', 'EU', { pop: 0.4, nut: 0.3 }),
        I('fennel', 'MED', { pop: 0.5, nut: 0.4 }), I('saffron', 'CAS MED', { pop: 0.7, nut: 0.2 }), I('Sichuan pepper', 'YUN', { pop: 0.45, nut: 0.2 }), I('sumac', 'FC', { pop: 0.3, nut: 0.2, w: 'Rhus coriaria' }),
        I('annatto', 'AM', { pop: 0.3, nut: 0.2 }), I('chia', 'MA', { pop: 0.35, nut: 0.85, w: 'Salvia hispanica' })],
    resin: [I('frankincense', 'ET', { pop: 0.5, nut: 0 }), I('myrrh', 'ET', { pop: 0.4, nut: 0 }), I('mastic', 'MED', { pop: 0.2, nut: 0, w: 'Mastic (plant resin)' }), I('copal', 'MA', { pop: 0.2, nut: 0 }),
        I('benzoin', 'MOL', { pop: 0.15, nut: 0, w: 'Benzoin (resin)' }), I('sandalwood', 'SIN', { pop: 0.4, nut: 0, w: 'Santalum album' })],
    allium: [I('onion', 'CAS', { pop: 1, nut: 0.6 }), I('garlic', 'CAS', { pop: 0.95, nut: 0.6 }), I('leek', 'MED', { pop: 0.5, nut: 0.55 }), I('shallot', 'CAS', { pop: 0.45, nut: 0.55 }),
        I('ramps', 'ENA', { pop: 0.15, nut: 0.5, w: 'Allium tricoccum' }), I('chives', 'CAS EU', { pop: 0.4, nut: 0.6 }), I('scallion', 'YR', { pop: 0.6, nut: 0.55 })],
    brassica: [I('cabbage', 'MED', { pop: 0.9, nut: 0.75 }), I('Chinese cabbage', 'YR', { pop: 0.7, nut: 0.75 }), I('mustard greens', 'GA', { pop: 0.45, nut: 0.8, w: 'Brassica juncea' }), I('kale', 'EU', { pop: 0.55, nut: 0.95 }),
        I('bok choy', 'YZ', { pop: 0.5, nut: 0.8 }), I('broccoli', 'MED', { pop: 0.8, nut: 0.9 }), I('cauliflower', 'MED', { pop: 0.65, nut: 0.75 }), I('kohlrabi', 'EU', { pop: 0.2, nut: 0.7 })],
    gourd: [I('squash', 'MA ENA', { pop: 0.85, nut: 0.7, w: 'Cucurbita' }), I('pumpkin', 'MA', { pop: 0.85, nut: 0.75 }), I('bottle gourd', 'SWA', { pop: 0.4, nut: 0.5, w: 'Calabash' }),
        I('wax gourd', 'YZ', { pop: 0.3, nut: 0.45 }), I('luffa', 'GA', { pop: 0.25, nut: 0.45 }), I('chayote', 'MA', { pop: 0.3, nut: 0.5 })],
    chili: [I('chili', 'MA', { pop: 1, nut: 0.7, w: 'Chili pepper' }), I('ají', 'AN AM', { pop: 0.4, nut: 0.7, w: 'Capsicum baccatum' }), I('horseradish', 'EU', { pop: 0.3, nut: 0.5 }),
        I('wasabi', 'YZ', { W: 1.6, pop: 0.3, nut: 0.5 }), I('mustard', 'EU GA', { pop: 0.6, nut: 0.6, w: 'Mustard plant' })],
    melon: [I('melon', 'ET GA', { pop: 0.75, nut: 0.55, w: 'Melon' }), I('watermelon', 'SWA', { pop: 0.95, nut: 0.5 }), I('cucumber', 'GA', { pop: 0.95, nut: 0.45 }), I('bitter melon', 'SIN', { pop: 0.3, nut: 0.6, w: 'Momordica charantia' }),
        I('gherkin', 'WAF', { pop: 0.2, nut: 0.45, w: 'Cucumis anguria' })],
    greens: [I('lettuce', 'FC', { pop: 0.95, nut: 0.5 }), I('spinach', 'CAS', { pop: 0.85, nut: 0.95 }), I('amaranth greens', 'MA', { pop: 0.35, nut: 0.9, w: 'Amaranthus dubius' }), I('purslane', 'MED', { pop: 0.2, nut: 0.75, w: 'Portulaca oleracea' }),
        I('water spinach', 'YZ', { pop: 0.35, nut: 0.75, w: 'Ipomoea aquatica' }), I('chaya', 'MA', { pop: 0.1, nut: 0.85, w: 'Cnidoscolus aconitifolius' }), I('sorrel', 'EU', { pop: 0.2, nut: 0.6 }),
        I('chard', 'MED', { pop: 0.45, nut: 0.85 }), I('watercress', 'EU', { pop: 0.35, nut: 0.85 }), I('celery', 'MED', { pop: 0.65, nut: 0.4 }), I('Malabar spinach', 'SIN', { pop: 0.15, nut: 0.7, w: 'Basella alba' })],
    nightshade: [I('eggplant', 'GA YUN', { pop: 0.85, nut: 0.55 }), I('tomato', 'AN MA', { pop: 1, nut: 0.7 }), I('okra', 'ET', { pop: 0.6, nut: 0.7 }), I('tomatillo', 'MA', { pop: 0.3, nut: 0.6 }),
        I('African eggplant', 'WAF', { pop: 0.2, nut: 0.55, w: 'Solanum aethiopicum' }), I('pepino', 'AN', { pop: 0.1, nut: 0.5, w: 'Solanum muricatum' }), I('sweet pepper', 'MA', { pop: 0.85, nut: 0.75, w: 'Bell pepper' })],
    herbs: [I('thyme', 'MED', { pop: 0.5, nut: 0.4, w: 'Thymus vulgaris' }), I('oregano', 'MED', { pop: 0.55, nut: 0.4 }), I('mint', 'MED', { pop: 0.6, nut: 0.4, w: 'Mentha' }), I('basil', 'SIN', { pop: 0.7, nut: 0.45 }),
        I('perilla', 'YR', { pop: 0.3, nut: 0.45 }), I('epazote', 'MA', { pop: 0.15, nut: 0.4 }), I('lemongrass', 'MOL', { pop: 0.4, nut: 0.35, w: 'Cymbopogon' }), I('dill', 'FC', { pop: 0.45, nut: 0.4 }),
        I('parsley', 'MED', { pop: 0.7, nut: 0.6 }), I('rosemary', 'MED', { pop: 0.5, nut: 0.4 }), I('sage', 'MED', { pop: 0.45, nut: 0.4, w: 'Salvia officinalis' }), I('tarragon', 'CAS', { pop: 0.25, nut: 0.4 }),
        I('chamomile', 'EU', { pop: 0.3, nut: 0.3 })],
    rootveg: [I('carrot', 'CAS', { pop: 1, nut: 0.8 }), I('turnip', 'EU', { pop: 0.6, nut: 0.6 }), I('beet', 'MED', { pop: 0.7, nut: 0.7, w: 'Beetroot' }), I('radish', 'YR MED', { pop: 0.7, nut: 0.5 }),
        I('daikon', 'YZ', { pop: 0.45, nut: 0.5 }), I('parsnip', 'EU', { pop: 0.3, nut: 0.6 }), I('jícama', 'MA', { pop: 0.3, nut: 0.5 }), I('yacón', 'AN', { pop: 0.15, nut: 0.5 }),
        I('rutabaga', 'EU', { pop: 0.25, nut: 0.6 }), I('burdock', 'YZ', { pop: 0.15, nut: 0.5, w: 'Arctium lappa' }), I('salsify', 'MED', { pop: 0.1, nut: 0.5, w: 'Tragopogon porrifolius' })],
    brew: [I('tea', 'YUN', { T: 16, pop: 1, nut: 0.2, w: 'Camellia sinensis' }), I('arabica coffee', 'ET', { T: 19, E: 1.6, pop: 1, nut: 0.2, w: 'Coffea arabica' }), I('khat', 'ET', { E: 1.8, pop: 0.25, nut: 0.1 }),
        I('coca', 'AN', { T: 18, E: 1.5, pop: 0.35, nut: 0.2 }), I('yerba mate', 'AM', { T: 20, E: 0.5, pop: 0.45, nut: 0.2 }), I('tobacco', 'AN AM', { T: 20, pop: 0.8, nut: 0, w: 'Nicotiana tabacum' })],
    shade: [I('cacao', 'AM MA', { pop: 0.95, nut: 0.4, w: 'Theobroma cacao' }), I('kola nut', 'WAF', { pop: 0.4, nut: 0.2 }), I('areca nut', 'MOL SIN', { pop: 0.5, nut: 0.1 }),
        I('guaraná', 'AM', { pop: 0.3, nut: 0.2 }), I('kava', 'NG', { pop: 0.3, nut: 0.1 }), I('robusta coffee', 'WAF', { pop: 0.7, nut: 0.2, w: 'Coffea canephora' })],
    fibre: [I('flax', 'FC', { T: 10, pop: 0.7, nut: 0.7 }), I('hemp', 'YR', { T: 12, pop: 0.7, nut: 0.5 }), I('tree cotton', 'GA', { T: 25, W: 0.6, pop: 0.5, nut: 0.3, w: 'Gossypium arboreum' }),
        I('upland cotton', 'MA', { T: 23, W: 0.6, pop: 0.9, nut: 0.3, w: 'Gossypium hirsutum' }), I('ramie', 'YZ', { pop: 0.2, nut: 0.1 }), I('jute', 'GA', { W: 1.3, T: 26, pop: 0.5, nut: 0.2 }),
        I('sunflower', 'ENA', { T: 15, pop: 0.85, nut: 0.85, w: 'Common sunflower' }), I('safflower', 'FC', { W: 0.3, pop: 0.35, nut: 0.6 }), I('rapeseed', 'EU', { pop: 0.8, nut: 0.7 }),
        I('sisal', 'MA', { W: 0.25, pop: 0.3, nut: 0.1 }), I('indigo', 'GA', { pop: 0.4, nut: 0, w: 'Indigofera tinctoria' }), I('woad', 'EU', { pop: 0.15, nut: 0 }),
        I('madder', 'FC', { pop: 0.15, nut: 0, w: 'Rubia tinctorum' }), I('oil palm', 'WAF', { T: 26, W: 1.6, pop: 0.9, nut: 0.7, w: 'Elaeis guineensis' })],
};
const gc = (a1, o1, a2, o2) => { const r = Math.PI / 180, x = Math.sin(a1 * r) * Math.sin(a2 * r) + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.cos((o1 - o2) * r); return 6371 * Math.acos(Math.min(1, Math.max(-1, x))); };
const NEAR = KEYS.map(a => KEYS.map(b => (a === b ? 1 : Math.max(0, Math.min(1, (6000 - gc(PKG[a].lat, PKG[a].lon, PKG[b].lat, PKG[b].lon)) / 4500)))));
const KI = Object.fromEntries(KEYS.map((k, i) => [k, i]));
const climFit = (h, c) => Math.exp(-0.5 * (((h.T - c.T) / 5) ** 2 + (Math.log(Math.max(0.03, h.W) / Math.max(0.03, c.W)) / 0.55) ** 2 + ((h.E - c.E) / 1.0) ** 2 + ((h.ws - c.ws) / 0.22) ** 2));
const itemClim = it => { const ps = it.p.map(k => PKG[k]); const avg = f => ps.reduce((s, P) => s + P[f], 0) / ps.length; return { T: it.T ?? avg('T'), W: it.W ?? avg('W'), E: it.E ?? avg('E'), ws: it.ws ?? avg('ws') }; };
/** How near a crop's Earth homes are to a site's likenesses (its own, then its runner-up at 0.7). */
const nearItem = (it, pkg, pkg2) => { let v = 0; for (const k of it.p) { const q = KI[k]; v = Math.max(v, NEAR[pkg][q], pkg2 >= 0 ? 0.7 * NEAR[pkg2][q] : 0); } return v; };
const sameWorld = (it, pkg) => it.p.some(k => PKG[k].world === PKG[KEYS[pkg]].world);
const wiki = it => `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(it.w || it.n)}&go=Go`;
const PULL = { free: { lam: 0, pen: 0 }, regional: { lam: 1.4, pen: 0.35 }, strict: { lam: 3.2, pen: 2 } };
const gumbel = (h01, seed, stream, id) => -Math.log(-Math.log(h01(seed, stream, id)));

/** Each site's Earth likeness (an index into KEYS, and a runner-up): climate, a seeded nudge, and the pull toward what nearby
 *  sites are like — near on Earth and on Earth's same side of the oceans — settled over a few sweeps, the earliest first. */
function choosePackages(sites, pull, seed, h01, noise = 0.45) {
    const P = PULL[pull], n = sites.length;
    const base = sites.map((s, i) => KEYS.map((k, p) => 1.4 * climFit(s.h, PKG[k]) + noise * gumbel(h01, seed, 11, i * 64 + p)));
    const W = sites.map(s => sites.map(t => (s === t ? 0 : Math.exp(-((gc(s.lat, s.lon, t.lat, t.lon) / 2200) ** 2)) * (s.mass === t.mass ? 1 : 0.5))));
    const cur = base.map(row => row.indexOf(Math.max(...row))), second = new Array(n).fill(-1);
    const order = sites.map((_, i) => i).sort((a, b) => sites[a].t - sites[b].t);
    for (let sweep = 0; sweep < 6; sweep++) {
        let changed = false;
        for (const i of order) {
            let wsum = 0; for (let j = 0; j < n; j++) wsum += W[i][j];
            let b1 = -1, v1 = -Infinity, b2 = -1, v2 = -Infinity;
            for (let p = 0; p < NK; p++) {
                let coh = 0;
                for (let j = 0; j < n; j++) { if (W[i][j] < 0.01) continue; const q = cur[j]; coh += W[i][j] * (NEAR[p][q] + (PKG[KEYS[p]].world === PKG[KEYS[q]].world ? 0.25 : -P.pen)); }
                const v = base[i][p] + P.lam * coh / Math.max(0.6, wsum);
                if (v > v1) { b2 = b1; v2 = v1; b1 = p; v1 = v; } else if (v > v2) { b2 = p; v2 = v; }
            }
            if (b1 !== cur[i]) { cur[i] = b1; changed = true; }
            second[i] = v2 > v1 - 0.35 ? b2 : -1;
        }
        if (!changed) break;
    }
    return { pkg: cur, second };
}
/** A staple variant's name at a site: the catalogue's crop most like the site's Earth regions, suited to its climate, from
 *  Earth's same side of the oceans unless the pull is free, weighted by how popular and how nourishing it is (R: the
 *  realism's weights) — each crop once where it can be. Returns { label, item }. */
function chooseItem(list, h, pkg, pkg2, used, pull, seed, h01, gid, R = { pop: 1, nut: 0.5, noise: 0.35 }) {
    const P = PULL[pull];
    let best = null, bv = -Infinity;
    list.forEach((it, i) => {
        const v = 1.6 * nearItem(it, pkg, pkg2) + 0.7 * climFit(h, itemClim(it)) - (sameWorld(it, pkg) ? 0 : 2 * P.pen) + 0.8 * R.pop * ((it.pop ?? 0.5) - 0.5) + 0.5 * R.nut * ((it.nut ?? 0.5) - 0.5)
            + R.noise * gumbel(h01, seed, 23, gid * 64 + i) - 3 * (used.get(it.n) || 0);
        if (v > bv) { bv = v; best = it; }
    });
    const nth = (used.get(best.n) || 0) + 1; used.set(best.n, nth);
    return { label: `${best.n}-like${nth > 1 ? ` ${['', '', 'II', 'III', 'IV', 'V'][nth] || nth}` : ''}`, item: best };
}
root.FoodNames = { PKG, KEYS, CAT, choosePackages, chooseItem, itemClim, nearItem, sameWorld, wiki };
})(typeof window !== 'undefined' ? window : globalThis);
