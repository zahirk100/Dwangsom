/**
 * De taal in de funnel.
 *
 * Deze toetsen komen uit een doorloop als klant: iemand die al maanden op
 * UWV wacht, weinig van beslistermijnen weet en zijn aanvraag niet in gevaar
 * wil brengen. Drie dingen bleken dan te tellen.
 *
 * **Betekenis, geen rekenwerk.** "Dat is 114 dagen geleden" is een som; "je
 * wacht 114 dagen langer dan in je brief staat" is een conclusie. Hetzelfde
 * getal, een heel ander effect.
 *
 * **Geen juridische termen in de knoppen.** "Naar de machtiging" en
 * "Ingebrekestelling versturen" zijn precies de woorden die wij horen te
 * vertalen; daarvoor komt iemand hier.
 *
 * **Geen aftreksom vlak voor de handtekening.** Die zette een verliesanker
 * neer bij een bedrag dat de klant op dat moment nog niet heeft.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const funnel = fs.readFileSync(path.join(WORTEL, 'public/assets/funnel.js'), 'utf8');
/**
 * De bron zonder commentaar.
 *
 * Commentaar legt juist vaak uit waarom een zin weg is ("hier stond eerder
 * binnen twee werkdagen"), en dan slaat een toets op die zin alarm over de
 * uitleg in plaats van over de tekst.
 */
const code = funnel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const start = fs.readFileSync(path.join(WORTEL, 'public/start.html'), 'utf8');

test('de uitslag noemt de betekenis, niet alleen het aantal dagen', () => {
  assert.match(funnel, /dagen? langer/);
  assert.ok(!/dagen'} geleden/.test(code), 'het kale "dagen geleden" hoort vertaald te zijn');
});

test('de datum en de betekenis staan naast elkaar', () => {
  assert.match(funnel, /feitrij__vak/);
  assert.match(start, /\.feitrij \{/);
  assert.match(start, /grid-template-columns: 1fr 1fr/);
});

test('er staat een zin boven de vervolgvragen', () => {
  // Zonder deze verandert het gevoel van "ze hebben mijn zaak uitgezocht"
  // naar "oké, nu begint alsnog een formulier".
  assert.match(funnel, /aanvulkop/);
  assert.match(funnel, /alleen nog een paar dingen/);
});

test('de knoppen gebruiken geen juridische termen', () => {
  const knoppen = [...code.matchAll(/knopVerder\.textContent = '([^']+)'/g)].map((m) => m[1]);
  assert.ok(knoppen.length >= 3, `verwacht meerdere knopteksten, kreeg ${knoppen.length}`);
  for (const knop of knoppen) {
    assert.ok(!/machtiging|ingebrekestelling|dwangsom/i.test(knop), `"${knop}" is juridische taal`);
  }
  assert.ok(knoppen.some((k) => /akkoord/i.test(k)), 'de stap heet in de balk "Akkoord"');
});

test('de knop belooft niet dat er nu al iets naar de instantie gaat', () => {
  // Het volgende scherm zegt dat wij de melding nog voorbereiden, dus
  // "machtigen en indienen" was een verwachtingsbreuk. "Bezig met indienen…"
  // mag wel: dat gaat over het indienen van de aanvraag bij ons, en het is
  // een laadtoestand die de klant een halve seconde ziet.
  const knoppen = [...code.matchAll(/knopVerder\.textContent = '([^']+)'/g)]
    .map((m) => m[1])
    .filter((k) => !/^Bezig met/.test(k));
  for (const knop of knoppen) {
    assert.ok(!/indienen/i.test(knop), `"${knop}" belooft dat er nu iets wordt ingediend`);
  }
});

test('"Ingebrekestelling versturen" wordt vertaald voor de klant', () => {
  assert.match(funnel, /volgendeStapInGewoneTaal/);
  assert.match(funnel, /laten weten dat je nog wacht/);
});

test('de zaak wordt met één vaste korte vorm benoemd', () => {
  // "je WW-aanvraag", niet het catalogus-label in kleine letters: dat maakt
  // van WW ineens ww en levert kromme zinnen op.
  assert.match(funnel, /function zaakInEenZin/);
  assert.match(funnel, /'uwv-ww': 'je WW-aanvraag'/);
  assert.ok(!/zaaktype\.label\.toLowerCase\(\)/.test(code),
    'het catalogus-label hoort niet in kleine letters in een zin te belanden');
});

test('het kostenblok is een afspraak, geen kostenopgave met aftreksom', () => {
  assert.match(funnel, /Onze afspraak met jou/);
  assert.ok(!/kostensom__rij--af/.test(code), 'de aftreksom hoort weg te zijn');
  assert.ok(!/function kostenSom/.test(code));
  assert.match(funnel, /voor het behandelen van je zaak/);
});

test('het kostenblok zegt dat het geld rechtstreeks naar de klant gaat', () => {
  assert.match(funnel, /rechtstreeks aan jou/);
  assert.match(funnel, /Wij ontvangen jouw vergoeding niet/);
});

test('het tarief komt uit de instellingen, niet uit de tekst', () => {
  // Anders staat er straks 20% op het scherm terwijl de funnel 25% afrekent.
  assert.match(funnel, /tarief\(INSTELLINGEN\)/);
  assert.ok(!/\b(10|20|25)%/.test(code), 'er staat een hardgecodeerd percentage in');
});

test('vlak voor de handtekening staat de geruststelling opnieuw', () => {
  // Erover lezen op de landingspagina is iets anders dan tekenen.
  assert.match(funnel, /Dit gaat alleen over het wachten op je beslissing/);
  assert.match(funnel, /veranderen daarmee niets aan wat je hebt aangevraagd/);
});

test('de regel onder het vinkje noemt de afspraak ondubbelzinnig', () => {
  assert.match(start, /id="akkoord-tarief"/);
  assert.match(funnel, /akkoord-tarief/);
  assert.match(funnel, /Geen vergoeding is € 0/);
});

test('na afloop staat er wat de klant zelf nog moet doen', () => {
  // "Vanaf hier regelen wij het" leidt tot "dan hoef ik niets te doen", en
  // dat klopt op één ding na: post die rechtstreeks naar de klant gaat.
  assert.match(funnel, /Wat moet jij nu doen\? Niets/);
  assert.match(funnel, /nieuwe brief, e-mail of beslissing/);
});

test('er staat een datum in plaats van "binnen twee werkdagen"', () => {
  assert.match(funnel, /function uiterlijkOp/);
  assert.ok(!/Binnen twee werkdagen/.test(code), 'de klant hoort niet zelf te rekenen');
  assert.match(funnel, /Uiterlijk \$\{uiterlijk\}/);
});

test('uiterlijkOp slaat het weekend over', () => {
  // Twee werkdagen vanaf vrijdag is dinsdag, niet zondag.
  const bron = /function uiterlijkOp[\s\S]*?\n}/.exec(funnel)[0];
  const maak = new Function('toonDatum', `${bron}; return uiterlijkOp;`);
  const fn = maak((ms) => new Date(ms).toISOString().slice(0, 10));
  assert.equal(fn(2, new Date('2026-09-25T10:00:00Z')), '2026-09-29', 'vrijdag + 2 werkdagen = dinsdag');
  assert.equal(fn(2, new Date('2026-09-21T10:00:00Z')), '2026-09-23', 'maandag + 2 = woensdag');
});

test('de conclusie herhaalt wat de klant zelf heeft ingevuld', () => {
  assert.match(funnel, /Je kunt nu in actie komen/);
  assert.match(funnel, /Je gaf aan dat je \$\{nogNiets/);
  assert.match(funnel, /stellen wij de melding aan \$\{orgaan\} voor je op/);
});

test('de funnel spreekt de klant met je aan, niet met u', () => {
  // Eén "u" tussen alle "je"-teksten valt op als een formulier van de
  // overheid, en dat is precies waar de klant van wegloopt.
  const teksten = [...code.matchAll(/tekst: '([^']{12,})'/g)].map((m) => m[1]);
  for (const t of teksten) {
    assert.ok(!/\b(u|uw)\b/.test(t), `"${t}" spreekt met u aan`);
  }
});
