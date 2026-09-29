/**
 * Hoe lang er gewacht wordt op het lezen van een brief.
 *
 * Een pdf met tekstlaag wordt hier gelezen en is er meteen. Een foto gaat naar
 * de tekstherkenning en dat duurt seconden tot tientallen seconden. Daar
 * hoort een keten van grenzen bij, en die keten stond eerder verkeerd om:
 *
 *   - De browser had helemaal geen grens. Kwam er geen antwoord, dan bleef het
 *     verzoek openstaan en bleef op het scherm "Wij lezen je brief..." staan
 *     met een knop die uit bleef. Voorgoed - zelfs opnieuw proberen kon niet.
 *   - De tekstherkenning wachtte 45 seconden, langer dan een serverloze
 *     functie op de meeste plannen mag draaien. Werd de functie afgebroken,
 *     dan kwam er dus helemaal geen antwoord terug.
 *
 * De volgorde hoort te zijn: de tekstherkenning geeft het als eerste op, dan
 * kan de server nog met een echte reden terugkomen ("de tekstherkenning
 * reageerde niet") in plaats van dat de bezoeker afknapt op zijn eigen klok en
 * niets wijzer wordt.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { WACHTTIJD_MS as SERVER_WACHTTIJD } from '../src/tekstherkenning.js';

const brieven = fs.readFileSync(new URL('../public/assets/brieven.js', import.meta.url), 'utf8');

/** De grens in de browser. Uit de bron, want dit bestand draait niet in node. */
const browserWachttijd = Number(/export const WACHTTIJD_MS = (\d+);/.exec(brieven)[1]);

test('de browser geeft het niet eerder op dan de tekstherkenning', () => {
  assert.ok(browserWachttijd > SERVER_WACHTTIJD,
    `de browser wacht ${browserWachttijd}ms en de tekstherkenning ${SERVER_WACHTTIJD}ms; `
    + 'dan krijgt de bezoeker "het duurde te lang" terwijl wij de echte reden hadden');
});

test('de tekstherkenning past binnen wat een serverloze functie mag duren', () => {
  // 60 seconden is de ruimste grens die je op Vercel zonder betaald plan
  // krijgt, en de meeste projecten staan lager. Wordt de functie afgebroken,
  // dan komt er geen antwoord en dus ook geen bruikbare melding.
  assert.ok(SERVER_WACHTTIJD <= 60000, 'langer dan een functie mag draaien heeft geen zin');
  assert.ok(SERVER_WACHTTIJD >= 20000, 'een foto van een hele brief heeft echt even nodig');
});

test('het verzoek naar /api/brief heeft een grens', () => {
  // Zonder afbreeksein blijft een verzoek dat nooit beantwoord wordt eeuwig
  // openstaan, en daar bleef de bezoeker in hangen.
  const verzoek = /await fetch\('\/api\/brief'[\s\S]*?\}\);/.exec(brieven);
  assert.ok(verzoek, 'het verzoek naar /api/brief hoort in brieven.js te staan');
  assert.match(verzoek[0], /signal: afbreeksein\(/,
    'zonder afbreeksein kan een verzoek eeuwig blijven staan');
});

test('een verlopen verzoek levert een melding op waar iemand iets mee kan', () => {
  assert.match(brieven, /TimeoutError/, 'een verlopen verzoek hoort herkend te worden');
  assert.match(brieven, /duurde te lang/);
  assert.match(brieven, /stuur de brief dan als pdf/i, 'en er hoort een uitweg bij te staan');
});

test('de knop gaat na een mislukte controle weer aan', () => {
  // Een uitgeschakelde knop onder een zin die blijft staan is precies waar de
  // bezoeker in bleef hangen. Daarom in een finally, niet in de catch: ook een
  // fout die wij niet voorzien hoort de knop terug te geven.
  const campagne = fs.readFileSync(new URL('../public/assets/campagne.js', import.meta.url), 'utf8');
  const afhandeling = /startknop\.addEventListener\('click'[\s\S]*?\n\}\);/.exec(campagne)[0];
  assert.match(afhandeling, /\} finally \{[\s\S]*startknop\.disabled = false;/,
    'de knop hoort in een finally weer aan te gaan');
});
