// Generate's entry: the page on the shared core (js/generate-next.js — Evolution's planet view, layer bar, finish and
// export: plans/SHARED_CORE_PLAN.md) with ?next=1, today's page (js/main.js) without. Only the one loaded: each page
// draws on the same canvas with its own renderer.
const next = new URLSearchParams(location.search).has('next');
import(next ? './generate-next.js' : './main.js').catch((err) => { console.error(err); window.orogenCantRun?.(); });
