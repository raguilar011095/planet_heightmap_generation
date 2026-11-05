// Generate's and Import's entry: the page on the shared core (js/generate-next.js, js/import-next.js — Evolution's
// planet view, layer bar, finish and export: plans/SHARED_CORE_PLAN.md) with ?next=1, today's (js/main.js,
// js/import-main.js) without. Only the one loaded: each page draws on the same canvas with its own renderer.
const next = new URLSearchParams(location.search).has('next'), importing = /import(\.html)?$/.test(location.pathname);
const page = importing ? (next ? './import-next.js' : './import-main.js') : (next ? './generate-next.js' : './main.js');
import(page).catch((err) => { console.error(err); window.orogenCantRun?.(); });
