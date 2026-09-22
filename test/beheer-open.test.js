/**
 * Testmodus: met BEHEER_OPEN=1 is de beheeromgeving zonder wachtwoord te
 * bekijken. Handig om te proefdraaien, en juist daarom moet de applicatie
 * er eerlijk over zijn: de omgeving meldt zelf dat ze openstaat.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'dwangsom-open-'));
process.env.DATA_DIR = tijdelijk;
process.env.BEHEER_OPEN = '1';
delete process.env.BEHEER_WACHTWOORD;

const { start, server } = await import('../server.js');
await start(0);
const basis = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  server.close();
  await fs.rm(tijdelijk, { recursive: true, force: true });
});

const haal = (pad, opties = {}) =>
  fetch(basis + pad, { headers: { 'Content-Type': 'application/json' }, ...opties });

test('de omgeving meldt dat ze open staat', async () => {
  const data = await (await haal('/api/beheer/sessie')).json();
  assert.equal(data.ingelogd, true);
  assert.equal(data.open, true);
  assert.ok(data.gebruiker, 'in testmodus doet de omgeving alsof er een beheerder is');
  assert.equal(data.gebruiker.rol, 'beheerder');
});

test('het overzicht is zonder cookie bereikbaar en zegt dat het open staat', async () => {
  const antwoord = await haal('/api/beheer/aanvragen');
  assert.equal(antwoord.status, 200);
  const data = await antwoord.json();
  assert.equal(data.open, true);
  assert.ok(Array.isArray(data.aanvragen));
});

test('inloggen lukt zonder wachtwoord in te typen', async () => {
  const antwoord = await haal('/api/beheer/login', { method: 'POST', body: JSON.stringify({}) });
  assert.equal(antwoord.status, 200);
  assert.equal((await antwoord.json()).open, true);
});

test('een dossier openen en bijwerken werkt ook in testmodus', async () => {
  await haal('/api/aanvragen', {
    method: 'POST',
    body: JSON.stringify({
      invoer: { bestuursorgaan: 'gemeente', zaaktype: 'gem-wmo', basisdatum: '2025-01-06' },
      contact: { naam: 'O. Open', email: 'o@voorbeeld.nl', akkoordVoorwaarden: true },
    }),
  });
  const lijst = await (await haal('/api/beheer/aanvragen')).json();
  assert.equal(lijst.aanvragen.length, 1);

  const bijgewerkt = await haal(`/api/beheer/aanvragen/${lijst.aanvragen[0].id}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'in-behandeling' }),
  });
  assert.equal(bijgewerkt.status, 200);
});
