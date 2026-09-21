import test from 'node:test';
import assert from 'node:assert/strict';

import { bedragOverDagen, berekenDwangsom, TARIEF, UITKOMST } from '../public/shared/dwangsom.js';
import { parseDatum, plusDagen, formatDatum } from '../public/shared/datum.js';

const basis = {
  bestuursorgaan: 'gemeente',
  zaaktype: 'gem-bijstand',
  basisdatum: '2026-01-05',
};

test('de tranches uit art. 4:17 lid 2 tellen op tot het wettelijk maximum', () => {
  assert.equal(bedragOverDagen(42).totaal, TARIEF.maxBedrag);
  assert.equal(bedragOverDagen(14).totaal, 14 * 23);
  assert.equal(bedragOverDagen(28).totaal, 14 * 23 + 14 * 35);
  assert.equal(bedragOverDagen(1).totaal, 23);
  assert.equal(bedragOverDagen(0).totaal, 0);
});

test('boven 42 dagen loopt het bedrag niet verder op', () => {
  assert.equal(bedragOverDagen(43).totaal, TARIEF.maxBedrag);
  assert.equal(bedragOverDagen(1000).totaal, TARIEF.maxBedrag);
  assert.equal(bedragOverDagen(1000).tranches.reduce((s, t) => s + t.dagen, 0), 42);
});

test('negatieve of onzinnige invoer levert nul op', () => {
  assert.equal(bedragOverDagen(-5).totaal, 0);
  assert.equal(bedragOverDagen(Number.NaN).totaal, 0);
});

test('binnen de beslistermijn: nog geen recht, wel een einddatum', () => {
  const r = berekenDwangsom({ ...basis, peildatum: '2026-02-01' });
  assert.equal(r.uitkomst, UITKOMST.TERMIJN_LOOPT);
  // Acht weken na 5 januari 2026.
  assert.equal(r.beslistermijn.einddatum, '2026-03-02');
});

test('termijn verstreken zonder ingebrekestelling: eerst in gebreke stellen', () => {
  const r = berekenDwangsom({ ...basis, peildatum: '2026-03-20' });
  assert.equal(r.uitkomst, UITKOMST.INGEBREKESTELLING_NODIG);
  assert.ok(r.vooruitblik.eersteDag > '2026-03-20');
  assert.equal(r.vooruitblik.maximumBedrag, 1442);
});

test('de eerste dwangsomdag ligt vijftien dagen na de ingebrekestelling', () => {
  const r = berekenDwangsom({
    ...basis,
    ingebrekeGesteld: true,
    ingebrekestellingDatum: '2026-04-01',
    peildatum: '2026-04-20',
  });
  assert.equal(r.uitkomst, UITKOMST.RECHT);
  // Twee weken herstel: t/m 15 april. Eerste dwangsomdag: 16 april.
  assert.equal(r.berekening.eersteDag, '2026-04-16');
  assert.equal(r.berekening.dagen, 5);
  assert.equal(r.berekening.totaal, 5 * 23);
  assert.equal(r.berekening.doorlopend, true);
});

test('tijdens de hersteltermijn van twee weken loopt nog geen dwangsom', () => {
  const r = berekenDwangsom({
    ...basis,
    ingebrekeGesteld: true,
    ingebrekestellingDatum: '2026-04-01',
    peildatum: '2026-04-10',
  });
  assert.equal(r.uitkomst, UITKOMST.HERSTELTERMIJN_LOOPT);
  assert.equal(r.berekening.totaal, 0);
});

test('het maximum wordt bereikt op dag 42 en loopt daarna niet verder op', () => {
  const laat = berekenDwangsom({
    ...basis,
    ingebrekeGesteld: true,
    ingebrekestellingDatum: '2026-04-01',
    peildatum: '2026-12-31',
  });
  assert.equal(laat.berekening.dagen, 42);
  assert.equal(laat.berekening.totaal, 1442);
  assert.equal(laat.berekening.maximumBereikt, true);
  assert.equal(laat.berekening.doorlopend, false);
  assert.equal(laat.berekening.maximumOp, formatDatum(plusDagen(parseDatum('2026-04-16'), 41)));
});

test('een besluit binnen de twee weken sluit de dwangsom uit', () => {
  const r = berekenDwangsom({
    ...basis,
    ingebrekeGesteld: true,
    ingebrekestellingDatum: '2026-04-01',
    besluitGenomen: true,
    besluitDatum: '2026-04-14',
    peildatum: '2026-05-01',
  });
  assert.equal(r.uitkomst, UITKOMST.GEEN_RECHT);
  assert.equal(r.blokkades[0].code, 'binnen-herstel');
});

test('bij een later besluit telt de dwangsom tot en met de dag ervoor', () => {
  const r = berekenDwangsom({
    ...basis,
    ingebrekeGesteld: true,
    ingebrekestellingDatum: '2026-04-01',
    besluitGenomen: true,
    besluitDatum: '2026-04-21',
    peildatum: '2026-06-01',
  });
  assert.equal(r.uitkomst, UITKOMST.RECHT);
  assert.equal(r.berekening.laatsteDag, '2026-04-20');
  assert.equal(r.berekening.dagen, 5);
  assert.equal(r.berekening.doorlopend, false);
});

test('een besluit binnen de beslistermijn geeft geen recht', () => {
  const r = berekenDwangsom({ ...basis, besluitGenomen: true, besluitDatum: '2026-02-10', peildatum: '2026-06-01' });
  assert.equal(r.uitkomst, UITKOMST.GEEN_RECHT);
  assert.equal(r.blokkades[0].code, 'op-tijd');
});

test('bij bezwaar begint de beslistermijn pas na de bezwaartermijn', () => {
  const r = berekenDwangsom({
    bestuursorgaan: 'gemeente', zaaktype: 'gem-bezwaar',
    basisdatum: '2026-01-05', peildatum: '2026-04-01',
  });
  // 5 jan + 6 weken bezwaartermijn = 16 feb, + 6 weken beslistermijn = 30 maart.
  assert.equal(r.beslistermijn.einddatum, '2026-03-30');
});

test('met een adviescommissie geldt twaalf weken in plaats van zes', () => {
  const zonder = berekenDwangsom({ zaaktype: 'gem-bezwaar', basisdatum: '2026-01-05', peildatum: '2026-04-01' });
  const met = berekenDwangsom({ zaaktype: 'gem-bezwaar', basisdatum: '2026-01-05', adviescommissie: true, peildatum: '2026-04-01' });
  assert.equal(met.beslistermijn.einddatum, '2026-05-11');
  assert.ok(met.beslistermijn.einddatum > zonder.beslistermijn.einddatum);
});

test('een door het bestuursorgaan genoemde datum gaat voor op de standaardtermijn', () => {
  const r = berekenDwangsom({
    ...basis, termijnBekend: true, termijnEinddatum: '2026-05-01', peildatum: '2026-05-10',
  });
  assert.equal(r.beslistermijn.einddatum, '2026-05-01');
  assert.equal(r.beslistermijn.bron, 'opgave-bestuursorgaan');
});

test('opschorting verschuift het einde van de termijn', () => {
  const r = berekenDwangsom({ ...basis, opschortingDagen: 10, peildatum: '2026-03-05' });
  assert.equal(r.beslistermijn.einddatum, '2026-03-12');
  assert.equal(r.uitkomst, UITKOMST.TERMIJN_LOOPT);
});

test('verdaging bij bezwaar verlengt met zes weken', () => {
  const r = berekenDwangsom({ zaaktype: 'gem-bezwaar', basisdatum: '2026-01-05', verdaagd: true, peildatum: '2026-04-01' });
  assert.equal(r.beslistermijn.einddatum, '2026-05-11');
});

test('Woo-verzoeken en asielaanvragen zijn uitgesloten', () => {
  for (const veld of ['wooVerzoek', 'asielzaak']) {
    const r = berekenDwangsom({ ...basis, [veld]: true, ingebrekeGesteld: true, ingebrekestellingDatum: '2026-04-01', peildatum: '2026-06-01' });
    assert.equal(r.uitkomst, UITKOMST.GEEN_RECHT);
    assert.equal(r.berekening, null);
  }
});

test('wie geen belanghebbende is, krijgt geen dwangsom', () => {
  const r = berekenDwangsom({ ...basis, geenBelanghebbende: true, peildatum: '2026-06-01' });
  assert.equal(r.uitkomst, UITKOMST.GEEN_RECHT);
  assert.equal(r.blokkades[0].code, 'belanghebbende');
});

test('buiten behandeling stellen is ook een besluit', () => {
  const r = berekenDwangsom({ ...basis, buitenBehandeling: true, peildatum: '2026-06-01' });
  assert.equal(r.uitkomst, UITKOMST.GEEN_RECHT);
  assert.equal(r.blokkades[0].code, 'buiten-behandeling');
});

test('een te vroege ingebrekestelling levert een waarschuwing op', () => {
  const r = berekenDwangsom({
    ...basis, ingebrekeGesteld: true, ingebrekestellingDatum: '2026-02-01', peildatum: '2026-05-01',
  });
  assert.ok(r.waarschuwingen.some((w) => w.code === 'prematuur'));
  // Er wordt gerekend vanaf het einde van de beslistermijn, niet vanaf de brief.
  assert.equal(r.berekening.eersteDag, '2026-03-17');
});

test('een ingebrekestelling meer dan een jaar te laat levert een waarschuwing op', () => {
  const r = berekenDwangsom({
    ...basis, ingebrekeGesteld: true, ingebrekestellingDatum: '2027-06-01', peildatum: '2027-08-01',
  });
  assert.ok(r.waarschuwingen.some((w) => w.code === 'onredelijk-laat'));
});

test('onvolledige invoer geeft een nette melding in plaats van een fout', () => {
  assert.equal(berekenDwangsom({}).onvolledig, true);
  assert.equal(berekenDwangsom({ zaaktype: 'gem-bijstand' }).onvolledig, true);
  assert.equal(berekenDwangsom({ zaaktype: 'gem-bijstand', basisdatum: 'onzin' }).onvolledig, true);
});

test('een aanvraagdatum in de toekomst wordt geweigerd', () => {
  const r = berekenDwangsom({ ...basis, basisdatum: '2030-01-01', peildatum: '2026-06-01' });
  assert.equal(r.onvolledig, true);
});

test('de tijdlijn bevat de wettelijke ijkpunten', () => {
  const r = berekenDwangsom({
    ...basis, ingebrekeGesteld: true, ingebrekestellingDatum: '2026-04-01', peildatum: '2026-05-01',
  });
  const sleutels = r.tijdlijn.map((p) => p.sleutel);
  for (const verwacht of ['aanvraag', 'beslistermijn', 'ingebrekestelling', 'herstel', 'eerste-dwangsomdag', 'maximum']) {
    assert.ok(sleutels.includes(verwacht), `tijdlijn mist ${verwacht}`);
  }
});
