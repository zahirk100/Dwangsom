/**
 * Vercel laadt server.js zelf en haalt de applicatie uit de default export.
 * Ontbreekt die, dan weigert de runtime de hele module:
 *
 *   Invalid export found in module "/var/task/server.mjs".
 *   The default export must be a function or server.
 *
 * Elk verzoek faalt dan, ook dat naar de startpagina. Deze test draait de
 * applicatie uitsluitend via die default export, zodat dat niet opnieuw
 * ongemerkt kan sneuvelen.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'dwangsom-ingang-'));
process.env.DATA_DIR = tijdelijk;
process.env.BEHEER_WACHTWOORD = 'test-wachtwoord';

const applicatie = await import('../server.js');

test('server.js heeft een default export die een functie is', () => {
  assert.equal(typeof applicatie.default, 'function');
});

const server = http.createServer((req, res) => applicatie.default(req, res));
await new Promise((resolve) => server.listen(0, resolve));
const basis = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  server.close();
  await fs.rm(tijdelijk, { recursive: true, force: true });
});

test('de default export serveert de pagina\'s', async () => {
  for (const pad of ['/', '/aanvraag', '/beheer', '/hoe-werkt-het']) {
    const antwoord = await fetch(basis + pad);
    assert.equal(antwoord.status, 200, `${pad} gaf ${antwoord.status}`);
    assert.match(antwoord.headers.get('content-type'), /text\/html/);
  }
});

test('de default export serveert de gedeelde modules en assets', async () => {
  const module = await fetch(`${basis}/shared/dwangsom.js`);
  assert.equal(module.status, 200);
  assert.match(module.headers.get('content-type'), /javascript/);

  const stijl = await fetch(`${basis}/assets/stijl.css`);
  assert.equal(stijl.status, 200);
  assert.match(stijl.headers.get('content-type'), /css/);
});

test('de default export handelt ook de API af', async () => {
  const catalogus = await (await fetch(`${basis}/api/catalogus`)).json();
  assert.ok(catalogus.zaaktypen.length > 10);

  const ingediend = await fetch(`${basis}/api/aanvragen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invoer: {
        bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', basisdatum: '2025-01-06',
        ingebrekeGesteld: true, ingebrekestellingDatum: '2025-04-01',
      },
      contact: { naam: 'I. Ingang', email: 'i@voorbeeld.nl', iban: 'NL91ABNA0417164300', adres: 'Ingangslaan 3', postcode: '3456 EF', woonplaats: 'Testdorp', akkoordVoorwaarden: true },
    }),
  });
  assert.equal(ingediend.status, 201);
  assert.equal((await ingediend.json()).rapport.berekening.totaal, 1442);
});

test('een onbekend pad geeft een nette 404 in plaats van een crash', async () => {
  const antwoord = await fetch(`${basis}/bestaat-niet`);
  assert.equal(antwoord.status, 404);
});
