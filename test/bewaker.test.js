/**
 * De automatische berichten aan de aanvrager.
 *
 * Dit is het soort logica dat pas opvalt als het misgaat bij een echte klant:
 * een mail die nooit komt, of drie keer dezelfde mail, of een herinnering over
 * ontbrekende stukken bij een zaak die al is toegekend. Alle drie zijn hier te
 * toetsen zonder mailserver en zonder te wachten tot morgen, omdat
 * `bepaalBerichten` puur is: dossier plus datum erin, berichten eruit.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { bepaalBerichten, bewaakDossier, MOMENT, MAX_POGINGEN, HERINNERING_NA_DAGEN } from '../src/bewaker.js';
import { UITKOMST } from '../public/shared/dwangsom.js';
import { parseDatum, vandaag } from '../public/shared/datum.js';
import { SJABLONEN } from '../src/mail.js';

const NU = parseDatum('2026-09-22');

/** Een dossier dat op zichzelf compleet is; elke toets verandert er één ding aan. */
const dossier = (extra = {}) => ({
  id: 'd1',
  referentie: 'DWS-2026-0001',
  gebruikerId: 'g1',
  status: 'nieuw',
  aangemaaktOp: '2026-09-01T10:00:00.000Z',
  invoer: { bestuursorgaan: 'uwv', organisatienaam: 'UWV', zaaktype: 'uwv-wia' },
  contact: { naam: 'T. Tester', email: 'test@example.nl' },
  rapport: { uitkomst: UITKOMST.TERMIJN_LOOPT, beslistermijn: { einddatum: '2026-12-01' } },
  // Alles binnen, zodat de stukkenherinnering niet elke toets vervuilt.
  stukken: { ontvangstbevestiging: true, termijnbrief: true, machtiging: true, primair_besluit: true,
    bezwaarschrift: true, verdagingsbrief: true, 'primair-besluit': true },
  berichten: {},
  ...extra,
});

const sleutels = (d, nu = NU) => bepaalBerichten(d, nu).map((b) => b.sleutel);

// ------------------------------------------------------ de datummomenten ---

test('een lopende termijn levert nog geen bericht op', () => {
  assert.deepEqual(sleutels(dossier()), []);
});

test('zodra de beslistermijn voorbij is, hoort de aanvrager dat', () => {
  const d = dossier({ rapport: { uitkomst: UITKOMST.TERMIJN_LOOPT, beslistermijn: { einddatum: '2026-09-21' } } });
  assert.deepEqual(sleutels(d), [MOMENT.TERMIJN_VERLOPEN]);
});

test('de laatste dag van de termijn is nog geen overschrijding', () => {
  // De instantie heeft die dag nog. Een dag te vroeg mailen dat zij te laat
  // zijn is erger dan een dag te laat.
  const d = dossier({ rapport: { uitkomst: UITKOMST.TERMIJN_LOOPT, beslistermijn: { einddatum: '2026-09-23' } } });
  assert.deepEqual(sleutels(d), []);
});

test('de dag dat de dwangsom begint te lopen levert een bericht op', () => {
  const d = dossier({
    rapport: { uitkomst: UITKOMST.HERSTELTERMIJN_LOOPT, berekening: { eersteDag: '2026-09-22' } },
  });
  assert.deepEqual(sleutels(d), [MOMENT.DWANGSOM_LOOPT]);
});

test('een hersteltermijn die nog loopt levert niets op', () => {
  const d = dossier({
    rapport: { uitkomst: UITKOMST.HERSTELTERMIJN_LOOPT, berekening: { eersteDag: '2026-10-05' } },
  });
  assert.deepEqual(sleutels(d), []);
});

// ----------------------------------------------------- de statusmomenten ---

test('een verstuurde melding wordt aan de aanvrager gemeld', () => {
  const d = dossier({ status: 'ingebrekestelling-verstuurd' });
  assert.ok(sleutels(d).includes(MOMENT.MELDING_VERSTUURD));
});

test('bij een toekenning gaat er een bericht met het bedrag mee', () => {
  const d = dossier({ status: 'toegekend', afhandeling: { bedragToegekend: 1442 } });
  const berichten = bepaalBerichten(d, NU);
  assert.deepEqual(berichten.map((b) => b.sleutel), [MOMENT.TOEGEKEND]);
  assert.equal(berichten[0].gegevens.bedrag, '€ 1442,00');
});

test('een toekenning zonder vastgelegd bedrag verzint er geen', () => {
  const d = dossier({ status: 'toegekend', afhandeling: {} });
  assert.match(bepaalBerichten(d, NU)[0].gegevens.bedrag, /vastgestelde bedrag/);
});

test('een afgewezen of afgesloten zaak krijgt niets meer', () => {
  for (const status of ['afgewezen', 'afgesloten']) {
    const d = dossier({ status, rapport: { uitkomst: UITKOMST.TERMIJN_LOOPT, beslistermijn: { einddatum: '2026-01-01' } } });
    assert.deepEqual(sleutels(d), [], `status ${status} hoort stil te zijn`);
  }
});

test('een toegekende zaak krijgt geen herinnering over stukken meer', () => {
  // Dit is de mail waar mensen terecht boos van worden: geld binnen, en dan
  // nog een verzoek om papieren.
  const d = dossier({ status: 'toegekend', afhandeling: { bedragToegekend: 500 }, stukken: {} });
  assert.deepEqual(sleutels(d), [MOMENT.TOEGEKEND]);
});

// ------------------------------------------------------- de herinnering ---

test('ontbrekende stukken leveren na een paar dagen één herinnering op', () => {
  const d = dossier({ stukken: {} });
  assert.ok(sleutels(d).includes(MOMENT.STUKKEN_HERINNERING));
});

test('een vers dossier krijgt nog geen herinnering', () => {
  const d = dossier({ stukken: {}, aangemaaktOp: '2026-09-21T10:00:00.000Z' });
  assert.ok(!sleutels(d).includes(MOMENT.STUKKEN_HERINNERING));
});

test('de herinnering komt precies op de afgesproken dag', () => {
  const start = new Date(NU - HERINNERING_NA_DAGEN * 24 * 60 * 60 * 1000).toISOString();
  const d = dossier({ stukken: {}, aangemaaktOp: start });
  assert.ok(sleutels(d).includes(MOMENT.STUKKEN_HERINNERING));
});

test('de herinnering noemt welke stukken ontbreken', () => {
  const d = dossier({ stukken: {} });
  const bericht = bepaalBerichten(d, NU).find((b) => b.sleutel === MOMENT.STUKKEN_HERINNERING);
  assert.ok(Array.isArray(bericht.gegevens.stukken) && bericht.gegevens.stukken.length > 0);
});

// ------------------------------------------------------------ één keer ---

test('een verstuurd bericht gaat nooit een tweede keer', () => {
  const d = dossier({
    rapport: { uitkomst: UITKOMST.TERMIJN_LOOPT, beslistermijn: { einddatum: '2026-09-01' } },
    berichten: { [MOMENT.TERMIJN_VERLOPEN]: { verstuurdOp: '2026-09-02T08:00:00.000Z' } },
  });
  assert.deepEqual(sleutels(d), []);
});

test('een mislukte verzending mag opnieuw, maar niet eindeloos', () => {
  const maak = (pogingen) => dossier({
    rapport: { uitkomst: UITKOMST.TERMIJN_LOOPT, beslistermijn: { einddatum: '2026-09-01' } },
    berichten: { [MOMENT.TERMIJN_VERLOPEN]: { pogingen } },
  });
  assert.deepEqual(sleutels(maak(1)), [MOMENT.TERMIJN_VERLOPEN]);
  assert.deepEqual(sleutels(maak(MAX_POGINGEN)), []);
});

// -------------------------------------------------------------- grenzen ---

test('zonder account of e-mailadres gaat er niets uit', () => {
  assert.deepEqual(sleutels(dossier({ gebruikerId: null, status: 'ingebrekestelling-verstuurd' })), []);
  assert.deepEqual(sleutels(dossier({ contact: { naam: 'T' }, status: 'ingebrekestelling-verstuurd' })), []);
});

test('elk moment verwijst naar een sjabloon dat echt bestaat', () => {
  const alle = [
    dossier({ rapport: { uitkomst: UITKOMST.TERMIJN_LOOPT, beslistermijn: { einddatum: '2026-01-01' } } }),
    dossier({ rapport: { uitkomst: UITKOMST.HERSTELTERMIJN_LOOPT, berekening: { eersteDag: '2026-01-01' } } }),
    dossier({ status: 'ingebrekestelling-verstuurd' }),
    dossier({ status: 'toegekend', afhandeling: { bedragToegekend: 100 } }),
    dossier({ stukken: {} }),
  ];
  const gezien = new Set();
  for (const d of alle) {
    for (const bericht of bepaalBerichten(d, NU)) {
      assert.equal(typeof SJABLONEN[bericht.sjabloon], 'function',
        `sjabloon ${bericht.sjabloon} bestaat niet in mail.js`);
      gezien.add(bericht.sleutel);
    }
  }
  assert.equal(gezien.size, Object.keys(MOMENT).length, `niet elk moment gedekt: ${[...gezien]}`);
});

// ------------------------------------------------------- de hele ronde ---

test('bewaakDossier verstuurt, tekent aan en herhaalt zich niet', async () => {
  const verstuurd = [];
  const genoteerd = [];
  const d = dossier({ rapport: { uitkomst: UITKOMST.TERMIJN_LOOPT, beslistermijn: { einddatum: '2026-09-01' } } });
  const nep = {
    store: {
      async noteerBericht(id, sleutel, opties) {
        genoteerd.push([id, sleutel, opties.gelukt]);
        d.berichten[sleutel] = opties.gelukt ? { verstuurdOp: 'nu' } : { pogingen: 1 };
      },
    },
    gebruikers: { async maakKoppeling() { return 'token-abc'; } },
    async verstuur(bericht) { verstuurd.push(bericht); return { gelukt: true }; },
    siteUrl: 'https://nubeslist.nl',
    nu: NU,
  };

  const eerste = await bewaakDossier(d, nep);
  assert.deepEqual(eerste.verstuurd, [MOMENT.TERMIJN_VERLOPEN]);
  assert.equal(verstuurd.length, 1);
  assert.equal(verstuurd[0].aan, 'test@example.nl');
  assert.match(verstuurd[0].gegevens.url, /^https:\/\/nubeslist\.nl\/mijn\?t=token-abc$/);
  assert.deepEqual(genoteerd, [['d1', MOMENT.TERMIJN_VERLOPEN, true]]);

  // Tweede ronde op dezelfde dag: stil.
  const tweede = await bewaakDossier(d, nep);
  assert.deepEqual(tweede.verstuurd, []);
  assert.equal(verstuurd.length, 1, 'een tweede ronde mag niet nog eens mailen');
});

test('een mislukte mail wordt als mislukt aangetekend, niet als verstuurd', async () => {
  const d = dossier({ status: 'ingebrekestelling-verstuurd' });
  const genoteerd = [];
  const uitslag = await bewaakDossier(d, {
    store: { async noteerBericht(id, sleutel, o) { genoteerd.push(o.gelukt); } },
    gebruikers: { async maakKoppeling() { return 't'; } },
    async verstuur() { return { gelukt: false, fout: 'geen sleutel' }; },
    siteUrl: 'https://nubeslist.nl',
    nu: NU,
  });
  assert.deepEqual(uitslag.mislukt, [MOMENT.MELDING_VERSTUURD]);
  assert.deepEqual(uitslag.verstuurd, []);
  assert.deepEqual(genoteerd, [false]);
});

test('een dossier dat ontploft houdt de ronde niet tegen', async () => {
  const d = dossier({ status: 'ingebrekestelling-verstuurd' });
  const uitslag = await bewaakDossier(d, {
    store: { async noteerBericht() {} },
    gebruikers: { async maakKoppeling() { throw new Error('opslag weg'); } },
    async verstuur() { throw new Error('mag niet gebeuren'); },
    siteUrl: 'https://nubeslist.nl',
    nu: NU,
  });
  assert.deepEqual(uitslag.mislukt, [MOMENT.MELDING_VERSTUURD]);
});

test('geen enkel automatisch bericht bevat bsn, iban of geboortedatum', () => {
  // E-mail is geen beveiligd kanaal. Wie de gegevens wil zien, logt in.
  const d = dossier({
    stukken: {},
    status: 'ingebrekestelling-verstuurd',
    contact: { naam: 'T. Tester', email: 't@example.nl', bsn: '111222333',
      iban: 'NL91ABNA0417164300', geboortedatum: '1986-10-22' },
  });
  for (const bericht of bepaalBerichten(d, NU)) {
    const inhoud = JSON.stringify(SJABLONEN[bericht.sjabloon]({ ...bericht.gegevens, url: 'https://x/y' }));
    for (const geheim of ['111222333', 'NL91ABNA0417164300', '1986-10-22']) {
      assert.ok(!inhoud.includes(geheim), `${bericht.sjabloon} lekt ${geheim}`);
    }
  }
});
