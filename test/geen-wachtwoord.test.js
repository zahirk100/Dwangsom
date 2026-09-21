/**
 * Een testdeploy op Vercel zonder ingestelde omgevingsvariabelen is de meest
 * waarschijnlijke eerste stap. Dan moet de applicatie niet stuk lijken, maar
 * uitleggen wat er nog moet gebeuren - en het aanvraagdeel moet gewoon werken.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL = '1';
delete process.env.BEHEER_WACHTWOORD;
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;

const { start, server, opslag } = await import('../server.js');
await start(0);
const basis = `http://127.0.0.1:${server.address().port}`;

test.after(() => server.close());

function haal(pad, opties = {}) {
  return fetch(basis + pad, { headers: { 'Content-Type': 'application/json' }, ...opties });
}

test('zonder database valt de applicatie terug op vluchtige opslag', () => {
  assert.equal(opslag.soort, 'geheugen');
  assert.equal(opslag.duurzaam, false);
});

test('de beheerpagina meldt dat er nog een wachtwoord ingesteld moet worden', async () => {
  const data = await (await haal('/api/beheer/sessie')).json();
  assert.equal(data.ingelogd, false);
  assert.equal(data.wachtwoordIngesteld, false);
  assert.equal(data.instelbaar, true, 'de pagina moet de instructie kunnen tonen');
});

test('inloggen wordt geweigerd met uitleg in plaats van een vaag foutje', async () => {
  const antwoord = await haal('/api/beheer/login', { method: 'POST', body: JSON.stringify({ wachtwoord: 'gok' }) });
  assert.equal(antwoord.status, 503);
  assert.match((await antwoord.json()).fout, /beheerwachtwoord/i);
});

test('het beheerdeel blijft dicht', async () => {
  assert.equal((await haal('/api/beheer/aanvragen')).status, 401);
});

test('het aanvraagdeel werkt ondertussen volledig', async () => {
  const antwoord = await haal('/api/aanvragen', {
    method: 'POST',
    body: JSON.stringify({
      invoer: {
        bestuursorgaan: 'gemeente', zaaktype: 'gem-wmo', basisdatum: '2025-01-06',
        ingebrekeGesteld: true, ingebrekestellingDatum: '2025-04-01',
      },
      contact: { naam: 'T. Test', email: 't@voorbeeld.nl', iban: 'NL91ABNA0417164300', adres: 'Testpad 4', postcode: '4567 GH', woonplaats: 'Testdorp', akkoordVoorwaarden: true },
    }),
  });
  assert.equal(antwoord.status, 201);
  const data = await antwoord.json();
  assert.match(data.referentie, /^DWS-\d{4}-0001$/);
  assert.equal(data.rapport.berekening.totaal, 1442);
});
