/**
 * Bootst na hoe Vercel de serverloze functie aanroept: het platform leest de
 * body al in (req.body), zet de segmenten van de catch-all route in req.query
 * en beeindigt TLS zelf (x-forwarded-proto). Deze test bewaakt dat de
 * applicatie daar tegen kan, zonder dat er echt gedeployd hoeft te worden.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'dwangsom-vercel-'));
process.env.DATA_DIR = tijdelijk;
process.env.BEHEER_WACHTWOORD = 'test-wachtwoord';

const { default: handler } = await import('../api/[...pad].js');

// De nabootsing: body inlezen, req.query vullen, dan pas de functie aanroepen.
const server = http.createServer(async (req, res) => {
  const stukken = [];
  for await (const stuk of req) stukken.push(stuk);
  const ruw = Buffer.concat(stukken).toString('utf8');
  if (ruw && String(req.headers['content-type'] || '').includes('json')) {
    try { req.body = JSON.parse(ruw); } catch { req.body = ruw; }
  }
  const url = new URL(req.url, 'http://localhost');
  req.query = Object.fromEntries(url.searchParams);
  req.query.pad = url.pathname.replace(/^\/api\//, '').split('/');
  req.headers['x-forwarded-proto'] = 'https';
  await handler(req, res);
});

await new Promise((resolve) => server.listen(0, resolve));
const basis = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  server.close();
  await fs.rm(tijdelijk, { recursive: true, force: true });
});

function haal(pad, opties = {}) {
  return fetch(basis + pad, { headers: { 'Content-Type': 'application/json', ...(opties.headers || {}) }, ...opties });
}

test('de catalogus is bereikbaar via de serverloze functie', async () => {
  const data = await (await haal('/api/catalogus')).json();
  assert.ok(data.zaaktypen.length > 10);
  assert.equal(data.bestuursorganen.length, 3);
});

test('indienen werkt terwijl het platform de body al heeft ingelezen', async () => {
  const antwoord = await haal('/api/aanvragen', {
    method: 'POST',
    body: JSON.stringify({
      invoer: {
        bestuursorgaan: 'uwv', zaaktype: 'uwv-ww', basisdatum: '2025-01-06',
        ingebrekeGesteld: true, ingebrekestellingDatum: '2025-04-01',
      },
      contact: { naam: 'V. Vercel', email: 'v@voorbeeld.nl', akkoordVoorwaarden: true },
    }),
  });
  assert.equal(antwoord.status, 201);
  const data = await antwoord.json();
  assert.match(data.referentie, /^DWS-\d{4}-\d{4}$/);
  assert.equal(data.rapport.berekening.totaal, 1442);
});

test('een ongeldige body geeft 400 in plaats van een crash', async () => {
  const antwoord = await haal('/api/berekening', { method: 'POST', body: '{kapot' });
  assert.equal(antwoord.status, 400);
});

test('het sessiecookie krijgt Secure mee achter HTTPS en blijft werken', async () => {
  const inlog = await haal('/api/beheer/login', { method: 'POST', body: JSON.stringify({ wachtwoord: 'test-wachtwoord' }) });
  assert.equal(inlog.status, 200);
  const setCookie = inlog.headers.getSetCookie()[0];
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /HttpOnly/);

  const cookie = setCookie.split(';')[0];
  const lijst = await (await haal('/api/beheer/aanvragen', { headers: { cookie } })).json();
  assert.equal(lijst.aanvragen.length, 1);
  assert.ok(lijst.opslag, 'de beheeromgeving hoort te weten hoe er wordt opgeslagen');
  assert.equal(lijst.opslag.duurzaam, true);
});

test('een sessie overleeft een koude start van de functie', async () => {
  const inlog = await haal('/api/beheer/login', { method: 'POST', body: JSON.stringify({ wachtwoord: 'test-wachtwoord' }) });
  const cookie = inlog.headers.getSetCookie()[0].split(';')[0];

  // Een verse instantie: eigen module-lading, geen gedeeld geheugen.
  const { sessieSleutel, tokenIsGeldig } = await import('../src/sessie.js?vers=1');
  const verseSleutel = sessieSleutel({ BEHEER_WACHTWOORD: 'test-wachtwoord' });
  assert.equal(tokenIsGeldig(verseSleutel, cookie.split('=')[1]), true);
});

test('het pad wordt herbouwd als het platform alleen de routesegmenten geeft', async () => {
  const antwoord = await new Promise((resolve) => {
    const nep = {
      method: 'GET',
      url: '/api/index',  // pad van de functie zelf, niet van het verzoek
      headers: { host: 'test' },
      query: { pad: ['catalogus'] },
    };
    const stukken = [];
    const res = {
      headersSent: false,
      statusCode: 200,
      setHeader() {},
      writeHead(code) { this.statusCode = code; return this; },
      end(body) { this.headersSent = true; resolve({ status: this.statusCode, body: String(body || stukken.join('')) }); },
    };
    handler(nep, res);
  });
  assert.equal(antwoord.status, 200);
  assert.ok(JSON.parse(antwoord.body).zaaktypen.length > 0);
});

test('zonder cookie blijft het beheerdeel dicht', async () => {
  assert.equal((await haal('/api/beheer/aanvragen')).status, 401);
  assert.equal((await haal('/api/beheer/export.csv')).status, 401);
});
