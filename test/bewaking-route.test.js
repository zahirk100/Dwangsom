/**
 * De deur naar de dagelijkse bewaking.
 *
 * Wie deze route kan aanroepen, laat de applicatie mail versturen naar echte
 * aanvragers. Dat maakt hem interessant voor iemand anders dan Vercel, dus de
 * toetsen hieronder gaan niet over wat hij doet maar over wie hem mag openen.
 *
 * De belangrijkste is de laatste: een vergeten `CRON_GEHEIM` moet de deur
 * dichtdoen en niet openzetten. Dat is precies het soort standaardwaarde dat
 * je maar één keer verkeerd hoeft te kiezen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'nubeslist-bewaking-'));
process.env.DATA_DIR = tijdelijk;
process.env.SESSIE_GEHEIM = 'testgeheim-voor-de-bewaking';
process.env.PORT = '0';
delete process.env.BEHEER_OPEN;
delete process.env.CRON_GEHEIM;

const { start, server } = await import('../server.js');
await start(0);
const basis = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  server.close();
  delete process.env.CRON_GEHEIM;
  await fs.rm(tijdelijk, { recursive: true, force: true });
});

const roep = (headers = {}) => fetch(`${basis}/api/taken/bewaking`, { headers });

test('zonder ingesteld geheim doet de route niets', async () => {
  delete process.env.CRON_GEHEIM;
  const antwoord = await roep();
  assert.equal(antwoord.status, 503);
});

test('met een geheim maar zonder sleutel: geen toegang', async () => {
  process.env.CRON_GEHEIM = 'het-geheim-van-de-bewaking';
  assert.equal((await roep()).status, 401);
});

test('met een verkeerde sleutel: geen toegang', async () => {
  process.env.CRON_GEHEIM = 'het-geheim-van-de-bewaking';
  assert.equal((await roep({ Authorization: 'Bearer fout' })).status, 401);
  // Ook een sleutel van de juiste lengte komt er niet in.
  assert.equal((await roep({ Authorization: 'Bearer het-geheim-van-de-bewakinX' })).status, 401);
});

test('met de juiste sleutel loopt de ronde en komt er een verslag terug', async () => {
  process.env.CRON_GEHEIM = 'het-geheim-van-de-bewaking';
  const antwoord = await roep({ Authorization: 'Bearer het-geheim-van-de-bewaking' });
  assert.equal(antwoord.status, 200);
  const body = await antwoord.json();
  assert.equal(typeof body.bekeken, 'number');
  assert.equal(typeof body.verstuurd, 'number');
});

test('de taakroute zit niet achter het klantportaal en lekt geen dossiers', async () => {
  process.env.CRON_GEHEIM = 'het-geheim-van-de-bewaking';
  const body = await (await roep({ Authorization: 'Bearer het-geheim-van-de-bewaking' })).json();
  const tekst = JSON.stringify(body);
  assert.ok(!tekst.includes('@'), 'het verslag hoort geen e-mailadressen te bevatten');
  assert.ok(!('dossiers' in body));
});
