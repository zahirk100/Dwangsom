/**
 * De cijfers waarop een advertentiebudget wordt gestuurd.
 *
 * Twee dingen maken dit scherm waardevol of waardeloos.
 *
 * **Volledigheid van de trechter.** Eén stap die niet geteld wordt, maakt niet
 * alleen die stap leeg maar ook elk percentage eronder. Precies dat gebeurde:
 * "Funnel geopend" stond wel in de trechter maar werd nergens afgevuurd, dus
 * het gat tussen "bezoek" en "brief geüpload" was onzichtbaar.
 *
 * **Uitsplitsing.** Een totaal over alle bronnen verbergt het kanaal dat niets
 * oplevert: als meta veel klikt en niets oplevert en google het omgekeerde
 * doet, ziet het gemiddelde er middelmatig uit en lijkt er niets aan de hand.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { overzicht, trechterVan, TRECHTERSTAPPEN, veld, GEBEURTENISSEN } from '../src/meting.js';
import { controleOverzicht, maakControle } from '../src/controles.js';

const funnel = fs.readFileSync(new URL('../public/assets/funnel.js', import.meta.url), 'utf8');

// ------------------------------------------------------- de meting zelf ---

test('elke stap van de trechter wordt ook echt afgevuurd', () => {
  // Zonder deze toets kan er een stap in de trechter staan die niemand telt,
  // en dan is hij altijd nul zonder dat iemand dat merkt. Dat is precies wat
  // er met "Funnel geopend" gebeurde.
  //
  // De funnel vuurt op twee manieren: met een losse meet('...') en via de
  // MEETSTAP-tabel, die per scherm zegt wat er geteld wordt. Beide meenemen,
  // anders keurt deze toets iets af dat wel degelijk gemeten wordt.
  const los = [...funnel.matchAll(/meet\('([a-z-]+)'/g)].map((m) => m[1]);
  const tabel = /const MEETSTAP = \{[\s\S]*?\};/.exec(funnel);
  assert.ok(tabel, 'de tabel met metingen per scherm hoort in funnel.js te staan');
  const uitTabel = [...tabel[0].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
  // 'bezoek' telt meting.js voor elke pagina die dat script laadt.
  const afgevuurd = new Set(['bezoek', ...los, ...uitTabel]);
  for (const stap of TRECHTERSTAPPEN) {
    assert.ok(afgevuurd.has(stap), `"${stap}" staat in de trechter maar wordt nergens gemeten`);
  }
});

test('de trechter zegt hoeveel mensen er op elke stap wegliepen', () => {
  const t = trechterVan({ bezoek: 100, 'funnel-start': 40, 'funnel-brief': 30, aanvraag: 5 });
  const bij = (stap) => t.find((r) => r.stap === stap);
  assert.equal(bij('bezoek').verloren, null, 'bij de eerste stap is er nog niets verloren');
  assert.equal(bij('funnel-start').verloren, 60);
  assert.equal(bij('funnel-start').vanVorige, 40);
  assert.equal(bij('funnel-start').vanBezoek, 40);
  assert.equal(bij('funnel-brief').verloren, 10);
});

test('zonder verkeer staan er nullen en geen percentages', () => {
  const t = trechterVan({});
  assert.ok(t.every((r) => r.aantal === 0));
  assert.ok(t.every((r) => r.vanBezoek === null), 'delen door nul levert geen percentage op');
});

// ------------------------------------------------- per dag en per bron ----

const ruw = [
  { dag: '2026-09-28', tellingen: {
    [veld('bezoek', 'meta', 'uwv-te-laat')]: 10,
    [veld('funnel-start', 'meta')]: 4,
    [veld('aanvraag', 'meta')]: 1,
    [veld('bezoek', 'google', 'uwv')]: 6,
    [veld('funnel-start', 'google')]: 5,
    [veld('aanvraag', 'google')]: 3,
  } },
  { dag: '2026-09-29', tellingen: {
    [veld('bezoek', 'meta', 'uwv-te-laat')]: 20,
    [veld('funnel-start', 'meta')]: 2,
  } },
];

test('elke dag heeft alle stappen, ook als ze nul zijn', () => {
  // Een dag die ontbreekt leest als "geen gegevens", een dag met nullen als
  // "niemand kwam". Dat verschil wil je zien.
  const uit = overzicht(ruw);
  for (const dag of uit.dagen) {
    for (const stap of TRECHTERSTAPPEN) {
      assert.equal(typeof dag[stap], 'number', `${dag.dag} mist ${stap}`);
    }
  }
  assert.equal(uit.dagen[0].bezoek, 16);
  assert.equal(uit.dagen[1].bezoek, 20);
  assert.equal(uit.dagen[1].aanvraag, 0);
});

test('per dag is ook per bron uit te splitsen', () => {
  const uit = overzicht(ruw);
  assert.equal(uit.dagen[0].bronnen.meta.bezoek, 10);
  assert.equal(uit.dagen[0].bronnen.google.bezoek, 6);
  assert.equal(uit.dagen[1].bronnen.google, undefined, 'die dag kwam er niets van google');
});

test('elke bron krijgt een eigen trechter', () => {
  // Dit is het hele punt: meta klikt twee keer zoveel en levert een derde op.
  const uit = overzicht(ruw);
  const meta = uit.trechterPerBron.meta;
  const google = uit.trechterPerBron.google;
  assert.equal(meta.find((r) => r.stap === 'bezoek').aantal, 30);
  assert.equal(meta.find((r) => r.stap === 'aanvraag').aantal, 1);
  assert.equal(google.find((r) => r.stap === 'bezoek').aantal, 6);
  assert.equal(google.find((r) => r.stap === 'aanvraag').aantal, 3);
  // En de trechter per bron telt op tot het totaal.
  const totaalBezoek = Object.values(uit.trechterPerBron)
    .reduce((som, t) => som + t.find((r) => r.stap === 'bezoek').aantal, 0);
  assert.equal(totaalBezoek, uit.totalen.bezoek);
});

test('het overzicht noemt de stappen, zodat het scherm ze niet hoeft te kennen', () => {
  const uit = overzicht(ruw);
  assert.deepEqual(uit.stappen.map((s) => s.id), TRECHTERSTAPPEN);
  for (const stap of uit.stappen) assert.equal(stap.label, GEBEURTENISSEN[stap.id]);
});

// ------------------------------------------ de controles per dag en bron --

const controle = (over) => maakControle({
  sleutel: over.sleutel,
  stap: over.stap || 'uitslag',
  bron: over.bron || '',
  van: over.van || '',
  invoer: { bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', termijnEinddatum: '2026-08-01' },
  rapport: { uitkomst: over.uitkomst || 'recht', berekening: { totaal: over.bedrag || 0 } },
});

test('de controles zijn per kanaal uit te splitsen', () => {
  // Niet hoeveel klikken een advertentie kostte, maar wat voor zaken eruit
  // kwamen - en hoeveel euro er bleef liggen bij mensen die recht hadden.
  const rijen = [
    { ...controle({ sleutel: 'a', bron: 'meta', bedrag: 500 }), aanvraagId: '' },
    { ...controle({ sleutel: 'b', bron: 'meta', bedrag: 300 }), aanvraagId: 'D-1' },
    { ...controle({ sleutel: 'c', bron: 'google', bedrag: 900 }), aanvraagId: '' },
  ];
  const uit = controleOverzicht(rijen);
  assert.equal(uit.perBron.meta.controles, 2);
  assert.equal(uit.perBron.meta.aanvragen, 1);
  assert.equal(uit.perBron.meta.gemistBedrag, 500, 'alleen wat níét is ingediend');
  assert.equal(uit.perBron.google.gemistBedrag, 900);
});

test('een controle zonder bron valt onder "onbekend" en verdwijnt niet', () => {
  const uit = controleOverzicht([controle({ sleutel: 'x' })]);
  assert.equal(uit.perBron.onbekend.controles, 1);
});

test('de controles zijn per dag uit te splitsen', () => {
  const vandaag = new Date().toISOString().slice(0, 10);
  const uit = controleOverzicht([
    controle({ sleutel: 'a', bedrag: 200 }),
    { ...controle({ sleutel: 'b', bedrag: 100 }), aanvraagId: 'D-2' },
  ]);
  assert.equal(uit.perDag.length, 1);
  assert.equal(uit.perDag[0].dag, vandaag);
  assert.equal(uit.perDag[0].controles, 2);
  assert.equal(uit.perDag[0].aanvragen, 1);
  assert.equal(uit.perDag[0].gemistBedrag, 200, 'alleen de zaak die niet werd ingediend');
});

test('de landingspagina wordt apart bijgehouden', () => {
  // Twee advertenties op dezelfde bron kunnen naar verschillende pagina's
  // wijzen; zonder dit is niet te zien welke daarvan werkt.
  const uit = controleOverzicht([
    controle({ sleutel: 'a', bron: 'meta', van: 'uwv-te-laat' }),
    controle({ sleutel: 'b', bron: 'meta', van: 'nog-niet-te-laat' }),
  ]);
  assert.equal(uit.perLanding['uwv-te-laat'].controles, 1);
  assert.equal(uit.perLanding['nog-niet-te-laat'].controles, 1);
});
