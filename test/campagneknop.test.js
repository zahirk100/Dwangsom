/**
 * De knop "Controleer mijn UWV-brief".
 *
 * Deze ene knop is nu twee keer stuk geweest, allebei de keren op dezelfde
 * manier: hij deed iets anders dan hij belooft.
 *
 *   1. Eerst bracht hij je alléén naar het uploadvak. Daar moest je nóg een
 *      keer klikken om een bestand te kiezen.
 *   2. Daarna sprong de pagina naar het vak én ging de kiezer open. Vanaf de
 *      hero is dat ruim vijfduizend pixels naar beneden terwijl er een
 *      keuzevenster overheen komt. Breek je dat af, dan sta je ergens waar je
 *      niet om gevraagd hebt.
 *
 * De regel is nu: klikken opent de kiezer, en verder niets. Het vak komt pas
 * in beeld als er iets te zien is - als er een bestand gekozen is, of als het
 * keuzevenster zonder keuze dichtgaat.
 *
 * Deze toets leest de broncode en niet het gedrag. Dat is geen schoonheid,
 * maar `assets/campagne.js` draait in de browser en raakt `document` al bij
 * het laden aan; in node valt hij niet te importeren. De volgorde in deze
 * handler is het hele punt, dus die wordt hier vastgelegd. Verandert de vorm
 * van de code, pas dan deze toets aan - maar controleer eerst in de browser
 * dat de knop nog steeds meteen de kiezer opent.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bron = fs.readFileSync(new URL('../public/assets/campagne.js', import.meta.url), 'utf8');

/** De body van de klikafhandelaar van elke knop die naar het uploadvak wijst. */
function klikafhandelaar() {
  const begin = bron.indexOf("document.querySelectorAll('a[href=\"#upload\"]')");
  assert.ok(begin > 0, 'de knoppen naar het uploadvak horen een eigen afhandelaar te hebben');
  const eind = bron.indexOf('\n}', begin);
  return bron.slice(begin, eind);
}

test('de knop opent de bestandskiezer', () => {
  assert.match(klikafhandelaar(), /invoer\.click\(\)/,
    'zonder dit moet de bezoeker twee keer klikken');
});

test('de knop verplaatst de pagina niet voordat er iets gekozen is', () => {
  const handler = klikafhandelaar();
  const kiezen = handler.indexOf('invoer.click()');
  const verplaatsen = handler.indexOf('naarVak()');
  assert.ok(verplaatsen === -1 || verplaatsen > handler.indexOf('gekozen.length > 0'),
    'de pagina mag alleen verplaatsen in de tak waarin al een brief gekozen is');
  assert.ok(kiezen > 0, 'de kiezer hoort hier open te gaan');
  assert.ok(!/scrollIntoView/.test(handler.slice(0, kiezen)),
    'er mag niet gescrold worden voordat de kiezer opengaat');
});

test('het vak komt in beeld zodra er een bestand gekozen is', () => {
  // Anders kiest iemand vanaf de hero een foto en blijft de pagina daar
  // staan; hij ziet dan niet dat zijn brief is aangekomen.
  const verandert = /invoer\.addEventListener\('change'[\s\S]*?\n\}\);/.exec(bron);
  assert.ok(verandert, 'de invoer hoort een change-afhandelaar te hebben');
  assert.match(verandert[0], /naarVak\(\)/);
});

test('een afgebroken keuze laat de knop toch ergens heen gaan', () => {
  // Sluit iemand het keuzevenster zonder iets te kiezen, dan lijkt de knop
  // anders niets te doen.
  const afgebroken = /invoer\.addEventListener\('cancel'[\s\S]*?\n\}\);/.exec(bron);
  assert.ok(afgebroken, 'een afgebroken keuze hoort opgevangen te worden');
  assert.match(afgebroken[0], /naarVak\(\)/);
});
