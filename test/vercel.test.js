/**
 * Bootst na hoe Vercel de applicatie aanroept: het platform laadt server.js,
 * roept de default export aan, leest de body al in (req.body) en beeindigt
 * TLS zelf (x-forwarded-proto). Deze test bewaakt dat de applicatie daar
 * tegen kan, zonder dat er echt gedeployd hoeft te worden.
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

const { default: handler } = await import('../server.js');

// De nabootsing: body inlezen, dan pas de functie aanroepen. Net als bij een
// rewrite op Vercel blijft req.url het pad dat de bezoeker vroeg.
const server = http.createServer(async (req, res) => {
  const stukken = [];
  for await (const stuk of req) stukken.push(stuk);
  const ruw = Buffer.concat(stukken).toString('utf8');
  if (ruw && String(req.headers['content-type'] || '').includes('json')) {
    try { req.body = JSON.parse(ruw); } catch { req.body = ruw; }
  }
  req.query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
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

test('de applicatie serveert ook de pagina\'s zelf', async () => {
  // Vercel draait server.js als de applicatie: pagina's en API lopen via
  // dezelfde router, zonder rewrite die het pad onderweg verandert.
  const antwoord = await haal('/');
  assert.equal(antwoord.status, 200);
  assert.match(antwoord.headers.get('content-type'), /text\/html/);
  assert.match(await antwoord.text(), /Dwangsomhulp/);

  for (const pad of ['/aanvraag', '/beheer', '/hoe-werkt-het']) {
    const pagina = await haal(pad);
    assert.equal(pagina.status, 200, `${pad} gaf ${pagina.status}`);
  }

  const module = await haal('/shared/dwangsom.js');
  assert.equal(module.status, 200);
  assert.match(module.headers.get('content-type'), /javascript/);
});

test('zonder cookie blijft het beheerdeel dicht', async () => {
  assert.equal((await haal('/api/beheer/aanvragen')).status, 401);
  assert.equal((await haal('/api/beheer/export.csv')).status, 401);
});
