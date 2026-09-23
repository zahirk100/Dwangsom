/**
 * De tellingen.
 *
 * De meetroute staat open: hij moet vanuit de browser aan te roepen zijn.
 * Een open route die naar de opslag schrijft is een uitnodiging, dus de
 * meeste toetsen hieronder gaan over wat er níét in mag komen.
 *
 * De tweede zorg is privacy. Wie op /uwv-wia komt, vertelt daarmee iets over
 * zijn gezondheid. Door alleen op te tellen kan dat nergens terechtkomen -
 * maar dan moet er ook echt niets anders bewaard worden, en dat bewaken deze
 * toetsen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  normaliseerBron, normaliseerPagina, veld, overzicht, geldigeGebeurtenis,
  laatsteDagen, GEBEURTENISSEN,
} from '../src/meting.js';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'nubeslist-meting-'));
process.env.DATA_DIR = tijdelijk;
process.env.SESSIE_GEHEIM = 'testgeheim-voor-de-metingen';
process.env.PORT = '0';
delete process.env.BEHEER_OPEN;

const { start, server, opslag } = await import('../server.js');
await start(0);
const basis = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  server.close();
  await fs.rm(tijdelijk, { recursive: true, force: true });
});

const meld = (body) => fetch(`${basis}/api/meting`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

const vandaag = new Date().toISOString().slice(0, 10);
const tel = () => opslag.tellingen(vandaag);

// ------------------------------------------------------------- bronnen ---

test('varianten van facebook komen allemaal op meta uit', () => {
  for (const ruw of ['meta', 'facebook', 'FB', 'instagram', 'ig']) {
    assert.equal(normaliseerBron(ruw), 'meta', `${ruw} hoort meta te zijn`);
  }
  assert.equal(normaliseerBron('', 'l.facebook.com'), 'meta');
});

test('een onbekende bron wordt overig, geen eigen teller', () => {
  // Zonder dit krijgt elke verzonnen utm_source een eigen regel en is het
  // overzicht binnen een week onleesbaar.
  assert.equal(normaliseerBron('nieuwsbriefje-maart'), 'overig');
  assert.equal(normaliseerBron('<script>alert(1)</script>'), 'overig');
});

test('geen bron en geen verwijzer is direct', () => {
  assert.equal(normaliseerBron('', ''), 'direct');
});

test('een zoekmachine als verwijzer is organisch', () => {
  assert.equal(normaliseerBron('', 'www.google.com'), 'organisch');
  assert.equal(normaliseerBron('', 'duckduckgo.com'), 'organisch');
});

// ------------------------------------------------------------- pagina's ---

test('alleen bekende paden krijgen een eigen teller', () => {
  const bekend = ['/uwv-wia', '/ingebrekestelling'];
  assert.equal(normaliseerPagina('/uwv-wia', bekend), 'uwv-wia');
  assert.equal(normaliseerPagina('/verzonnen', bekend), 'overig');
});

test('de queryreeks wordt weggeknipt', () => {
  // Daar kan van alles in staan wat we niet willen bewaren.
  const bekend = ['/uwv-wia'];
  assert.equal(normaliseerPagina('/uwv-wia?email=iemand@voorbeeld.nl', bekend), 'uwv-wia');
  assert.equal(normaliseerPagina('/uwv-wia#ergens', bekend), 'uwv-wia');
});

// ----------------------------------------------------------- de route ---

test('een gewone melding wordt geteld', async () => {
  const antwoord = await meld({ g: 'bezoek', b: 'facebook', p: '/uwv-te-laat' });
  assert.equal(antwoord.status, 204);
  const tellingen = await tel();
  assert.equal(tellingen[veld('bezoek', 'meta', 'uwv-te-laat')], 1);
});

test('een verzonnen gebeurtenis wordt niet geteld', async () => {
  const voor = Object.keys(await tel()).length;
  await meld({ g: 'hack', b: 'meta' });
  await meld({ g: '__proto__', b: 'meta' });
  await meld({ g: 'constructor', b: 'meta' });
  assert.equal(Object.keys(await tel()).length, voor, 'er is een teller bijgekomen');
});

test('de route antwoordt altijd 204, ook op onzin', async () => {
  // Een meetroute mag nooit een reden zijn dat er iets op het scherm misgaat,
  // en een foutmelding zou verklappen welke gebeurtenissen wel bestaan.
  for (const body of [{}, { g: '' }, { g: 'bezoek', b: {} }, { onzin: true }]) {
    assert.equal((await meld(body)).status, 204, JSON.stringify(body));
  }
  const kapot = await fetch(`${basis}/api/meting`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'geen json',
  });
  assert.equal(kapot.status, 204);
});

test('de meetroute zet geen cookie', async () => {
  const antwoord = await meld({ g: 'bezoek' });
  assert.equal(antwoord.headers.getSetCookie().length, 0,
    'zodra hier een cookie uit komt, is er toestemming nodig');
});

test('er komt niets in de opslag wat naar één bezoeker leidt', async () => {
  await meld({ g: 'bezoek', b: 'meta', p: '/uwv-wia' });
  const tellingen = await tel();
  const alles = JSON.stringify(tellingen);
  // Elke sleutel is gebeurtenis|bron[|pagina] en elke waarde een getal.
  for (const [sleutel, waarde] of Object.entries(tellingen)) {
    const delen = sleutel.split('|');
    assert.ok(delen.length >= 2 && delen.length <= 3, `rare sleutel: ${sleutel}`);
    assert.ok(geldigeGebeurtenis(delen[0]), `onbekende gebeurtenis: ${delen[0]}`);
    assert.equal(typeof waarde, 'number', `${sleutel} is geen getal`);
  }
  assert.ok(!/\d{1,3}(\.\d{1,3}){3}/.test(alles), 'er staat een ip-adres in');
  assert.ok(!alles.includes('@'), 'er staat een e-mailadres in');
  assert.ok(!/Mozilla|Chrome|Safari/.test(alles), 'er staat een useragent in');
});

test('de cijfers zitten achter de inlog', async () => {
  assert.equal((await fetch(`${basis}/api/beheer/metingen`)).status, 401);
});

test('het cijferscherm staat op noindex', async () => {
  const html = await (await fetch(`${basis}/cijfers`)).text();
  assert.match(html, /name="robots" content="noindex/);
});

// -------------------------------------------------------- het overzicht ---

test('de trechter rekent de percentages per stap uit', () => {
  const o = overzicht([{ dag: '2026-09-23', tellingen: {
    'bezoek|meta|uwv-te-laat': 200, 'funnel-start|meta': 50,
    'funnel-uitslag|meta': 25, 'funnel-gegevens|meta': 10, 'aanvraag|meta': 4,
  } }]);
  const per = Object.fromEntries(o.trechter.map((r) => [r.stap, r]));
  assert.equal(per.bezoek.aantal, 200);
  assert.equal(per['funnel-start'].vanVorige, 25);
  assert.equal(per['funnel-uitslag'].vanVorige, 50);
  assert.equal(per.aanvraag.vanBezoek, 2);
});

test('delen door nul levert geen NaN op in het scherm', () => {
  const o = overzicht([{ dag: '2026-09-23', tellingen: {} }]);
  for (const rij of o.trechter) {
    assert.ok(rij.vanVorige === null || Number.isFinite(rij.vanVorige), `${rij.stap}: ${rij.vanVorige}`);
    assert.ok(rij.vanBezoek === null || Number.isFinite(rij.vanBezoek), `${rij.stap}: ${rij.vanBezoek}`);
  }
});

test('onbekende sleutels in de opslag worden overgeslagen', () => {
  // Oude of beschadigde gegevens mogen het overzicht niet laten struikelen.
  const o = overzicht([{ dag: '2026-09-23', tellingen: {
    'bezoek|meta': 5, 'rommel|meta': 99, 'kapot': 3,
  } }]);
  assert.equal(o.totalen.bezoek, 5);
  assert.ok(!('rommel' in o.totalen));
});

test('de dagenlijst loopt van oud naar nieuw en eindigt vandaag', () => {
  const dagen = laatsteDagen(7);
  assert.equal(dagen.length, 7);
  assert.equal(dagen[6], new Date().toISOString().slice(0, 10));
  assert.deepEqual(dagen, [...dagen].sort());
});

// ----------------------------------------------------------- de tellers ---

test('twee tellingen tegelijk gaan niet verloren', async () => {
  const start = (await tel())['bezoek|direct'] || 0;
  await Promise.all(Array.from({ length: 20 }, () => opslag.tel(vandaag, 'bezoek|direct')));
  assert.equal((await tel())['bezoek|direct'], start + 20);
});

test('elke gebeurtenis heeft een leesbare naam voor het scherm', () => {
  for (const [id, label] of Object.entries(GEBEURTENISSEN)) {
    assert.ok(label && label.length > 3, `${id} mist een label`);
  }
});
