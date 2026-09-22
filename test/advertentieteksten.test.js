/**
 * De advertentieteksten.
 *
 * Twee soorten fouten kosten hier direct geld.
 *
 * Een kop van 31 tekens wordt door Google geweigerd. Dat merk je pas als je
 * de campagne probeert te plaatsen, meestal op het moment dat je hem live
 * wilde hebben.
 *
 * Een advertentie die een ander percentage noemt dan de funnel afrekent, is
 * een onjuiste prijsvermelding aan een consument. Daarom komt het bedrag uit
 * dezelfde bron als de site, en bewaakt deze toets dat het meebeweegt.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { advertentieteksten, LIMIETEN } from '../src/advertentieteksten.js';
import { TARIEF } from '../public/shared/dwangsom.js';

const teksten = (env = { TARIEF_PERCENTAGE: '25' }) => advertentieteksten(env);

// ----------------------------------------------------------- tekenlimieten ---

test('elke Google-kop past binnen 30 tekens', () => {
  for (const kop of teksten().google.koppen) {
    assert.ok(kop.length <= LIMIETEN.googleKop,
      `"${kop}" is ${kop.length} tekens, maximaal ${LIMIETEN.googleKop}`);
  }
});

test('elke Google-omschrijving past binnen 90 tekens', () => {
  for (const o of teksten().google.omschrijvingen) {
    assert.ok(o.length <= LIMIETEN.googleOmschrijving,
      `"${o}" is ${o.length} tekens, maximaal ${LIMIETEN.googleOmschrijving}`);
  }
});

test('de padjes in de weergegeven url passen binnen 15 tekens', () => {
  for (const pad of teksten().google.paden) {
    assert.ok(pad.length <= LIMIETEN.googlePad, `"${pad}" is ${pad.length} tekens`);
  }
});

test('elke Meta-kop en -omschrijving past', () => {
  for (const a of teksten().meta.advertenties) {
    assert.ok(a.kop.length <= LIMIETEN.metaKop, `kop "${a.kop}" is ${a.kop.length} tekens`);
    assert.ok(a.omschrijving.length <= LIMIETEN.metaOmschrijving,
      `omschrijving "${a.omschrijving}" is ${a.omschrijving.length} tekens`);
  }
});

test('Google wil er genoeg om mee te draaien', () => {
  // Onder de tien koppen kan Google nauwelijks combineren en zakt de kwaliteit.
  assert.ok(teksten().google.koppen.length >= 10);
  assert.ok(teksten().google.omschrijvingen.length >= 3);
});

// ------------------------------------------------------------- het tarief ---

test('het percentage in de tekst komt uit de omgeving', () => {
  const alles = (env) => JSON.stringify(advertentieteksten(env));
  assert.match(alles({ TARIEF_PERCENTAGE: '10' }), /10%/);
  assert.ok(!alles({ TARIEF_PERCENTAGE: '10' }).includes('25%'));
  assert.match(alles({ TARIEF_PERCENTAGE: '25' }), /25%/);
});

test('zonder ingesteld tarief noemt geen enkele advertentie een percentage', () => {
  const leeg = JSON.stringify(advertentieteksten({ TARIEF_PERCENTAGE: '0' }));
  assert.ok(!/\d+%/.test(leeg), 'geen verzonnen percentage in een advertentie');
  assert.match(leeg, /vooraf/);
});

test('het maximumbedrag komt uit de wettelijke tabel', () => {
  const alles = JSON.stringify(teksten());
  assert.ok(alles.includes('1.442'));
  assert.equal(TARIEF.maxBedrag, 1442, 'verandert dit, dan verandert de advertentie mee');
});

// ------------------------------------------------------------- de beloftes ---

test('geen advertentie belooft dat UWV sneller beslist', () => {
  const alles = JSON.stringify(teksten()).toLowerCase();
  for (const zin of ['sneller beslist', 'snellere beslissing', 'dwingt uwv', 'uwv moet dan']) {
    assert.ok(!alles.includes(zin), `"${zin}" is een belofte die niemand kan waarmaken`);
  }
});

test('geen advertentie belooft een bedrag dat niet zeker is', () => {
  const alles = JSON.stringify(teksten()).toLowerCase();
  for (const zin of ['krijg € 1.442', 'ontvang € 1.442', 'gegarandeerd', 'altijd recht op']) {
    assert.ok(!alles.includes(zin), `"${zin}" mag hier niet staan`);
  }
  // Wel steeds het voorbehoud.
  assert.match(JSON.stringify(teksten()), /tot € 1\.442/);
});

test('geen advertentie doet zich voor als UWV of de overheid', () => {
  // Dit is de fout die een advertentieaccount kost, en terecht.
  const t = teksten();
  for (const kop of [...t.google.koppen, ...t.meta.advertenties.map((a) => a.kop)]) {
    assert.ok(!/^UWV$|^Mijn UWV|uwv\.nl|officieel uwv|namens uwv/i.test(kop), `"${kop}" leunt op UWV`);
  }
});

// ----------------------------------------------------------- de zoekwoorden ---

test('er staan uitsluitingen in, anders betaal je voor het verkeerde verkeer', () => {
  const z = teksten().zoekwoorden;
  assert.ok(z.uitsluiten.length >= 5);
  // Wie "zelf" of "voorbeeldbrief" zoekt, wil geen dienstverlener.
  assert.ok(z.uitsluiten.includes('zelf'));
  assert.ok(z.uitsluiten.includes('voorbeeldbrief'));
  // En wie "vacature" zoekt al helemaal niet.
  assert.ok(z.uitsluiten.includes('vacature'));
});

test('de probleemwoorden zijn ruimer dan de juridische termen', () => {
  // Mensen die "dwangsom" typen weten al wat het is; dat zijn er weinig en ze
  // zijn duur. De doelgroep typt "uwv duurt lang".
  const z = teksten().zoekwoorden;
  assert.ok(z.probleem.length > z.oplossing.length);
});

test('elk Meta-beeld heeft een bijbehorende tekst', async () => {
  const { BOODSCHAPPEN } = await import('../scripts/maak-advertenties.mjs');
  const beeldIds = BOODSCHAPPEN.map((b) => b.id).sort();
  const tekstIds = teksten().meta.advertenties.map((a) => a.id).sort();
  assert.deepEqual(tekstIds, beeldIds,
    'een beeld zonder tekst of een tekst zonder beeld is een advertentie die je niet kunt plaatsen');
});
