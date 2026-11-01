import http from 'node:http'; import fs from 'node:fs';
// Serves the mock-up with the skeleton the Artifact viewer adds (doctype, charset, viewport, reset).
const head = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(head + fs.readFileSync('food-mockups.html', 'utf8') + '</body></html>'); }).listen(8765, '127.0.0.1');
