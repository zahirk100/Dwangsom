/**
 * De keuzelijst in het klantportaal.
 *
 * Wie hier zes testzaken had staan, kreeg ze alle zes onder elkaar: een muur
 * waarin je je eigen zaak niet terugvindt. Sinds er een lijst bovenaan staat
 * zijn er twee dingen die stil kapot kunnen:
 *
 *   - een klasse die in mijn.js wordt gezet maar in mijn.html geen stijl
 *     heeft, waardoor de lijst als kale knoppen op elkaar plakt;
 *   - de lijst die ook verschijnt bij één zaak, en dan alleen een extra klik
 *     is tussen de aanvrager en het enige wat hij wil zien.
 *
 * Allebei zie je pas in een browser. Deze toets leest de bron.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const js = fs.readFileSync(path.join(WORTEL, 'public/assets/mijn.js'), 'utf8');
const html = fs.readFileSync(path.join(WORTEL, 'public/mijn.html'), 'utf8');

test('elke klasse van de zakenlijst heeft een stijl in mijn.html', () => {
  const klassen = new Set();
  for (const m of js.matchAll(/\b(zakenlijst|zaakregel(?:__[a-z]+)?(?:--\$\{[^}]+\})?)\b/g)) {
    // Klassen met een sjabloonstuk (--${samen.kleur}) staan als variant in de
    // css; de basisklasse controleren is genoeg.
    klassen.add(m[1].replace(/--\$\{[^}]+\}$/, ''));
  }
  assert.ok(klassen.size >= 5, `verwacht meerdere klassen, kreeg ${[...klassen]}`);
  for (const klasse of klassen) {
    assert.ok(html.includes(`.${klasse}`), `.${klasse} wordt gezet in mijn.js maar heeft geen stijl in mijn.html`);
  }
});

test('de statuskleuren van een regel hebben allemaal een stijl', () => {
  for (const kleur of ['goed', 'info', 'let-op']) {
    assert.ok(html.includes(`.zaakregel__staat--${kleur}`), `kleur ${kleur} mist een stijl`);
  }
});

test('bij één zaak komt er geen keuzelijst tussen', () => {
  assert.match(js, /dossiers\.length === 1[\s\S]{0,220}rendereDossier\(data\.dossiers\[0\]\)/);
});

test('een geopende zaak heeft een weg terug', () => {
  assert.match(js, /Al mijn zaken/);
});

test('de regels vertellen een schermlezer of ze openstaan', () => {
  assert.match(js, /'aria-expanded': 'false'/);
  assert.match(js, /setAttribute\('aria-expanded'/);
});
