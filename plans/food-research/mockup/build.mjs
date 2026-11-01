import fs from 'node:fs';
const t = fs.readFileSync('template.html', 'utf8');
const out = t.replace('/*WORLD*/', () => fs.readFileSync('world.js', 'utf8')).replace('/*NAMES*/', () => fs.readFileSync('names.js', 'utf8')).replace('/*ITEMS*/', () => fs.readFileSync('items.js', 'utf8')).replace('/*UI*/', () => fs.readFileSync('ui.js', 'utf8'));
fs.writeFileSync('food-mockups.html', out);
console.log('built', (out.length / 1024).toFixed(0), 'KB');
