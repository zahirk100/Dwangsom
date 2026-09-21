/**
 * Het systeem moet zelf bepalen of iemand nu kan indienen of alleen een
 * vooraanmelding kan doen, en welke datum daarbij bewaakt moet worden. Dat is
 * wat de beheeromgeving in aparte kopjes zet.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { berekenDwangsom, DOSSIERSOORT } from '../public/shared/dwangsom.js';

const basis = { bestuursorgaan: 'gemeente', zaaktype: 'gem-bijstand', basisdatum: '2026-01-05' };

test('wie kan vorderen krijgt een aanvraag, en die is vandaag aan de beurt', () => {
  const r = berekenDwangsom({
    ...basis, ingebrekeGesteld: true, ingebrekestellingDatum: '2026-04-01', peildatum: '2026-04-20',
  });
  assert.equal(r.vervolg.soort, DOSSIERSOORT.AANVRAAG);
  assert.equal(r.vervolg.kanNuIndienen, true);
  assert.equal(r.vervolg.actiedatum, '2026-04-20');
});

test('loopt de beslistermijn nog, dan is het een vooraanmelding met de einddatum', () => {
  const r = berekenDwangsom({ ...basis, peildatum: '2026-02-01' });
  assert.equal(r.vervolg.soort, DOSSIERSOORT.VOORAANMELDING);
  assert.equal(r.vervolg.kanNuIndienen, false);
  // De termijn loopt tot en met 2 maart; de dag erna kan er iets gebeuren.
  assert.equal(r.vervolg.actiedatum, '2026-03-03');
});

test('is de termijn verstreken zonder ingebrekestelling, dan kan dat direct', () => {
  const r = berekenDwangsom({ ...basis, peildatum: '2026-03-20' });
  assert.equal(r.vervolg.soort, DOSSIERSOORT.VOORAANMELDING);
  assert.equal(r.vervolg.actiedatum, '2026-03-20');
  assert.match(r.vervolg.actieLabel, /ngebrekestelling/);
});

test('tijdens de hersteltermijn wordt de eerste dwangsomdag bewaakt', () => {
  const r = berekenDwangsom({
    ...basis, ingebrekeGesteld: true, ingebrekestellingDatum: '2026-04-01', peildatum: '2026-04-08',
  });
  assert.equal(r.vervolg.soort, DOSSIERSOORT.VOORAANMELDING);
  assert.equal(r.vervolg.actiedatum, '2026-04-16');
  assert.equal(r.vervolg.actiedatum, r.berekening.eersteDag);
});

test('zonder recht wordt het een beoordeling zonder datum', () => {
  const r = berekenDwangsom({ ...basis, wooVerzoek: true, peildatum: '2026-06-01' });
  assert.equal(r.vervolg.soort, DOSSIERSOORT.BEOORDELING);
  assert.equal(r.vervolg.actiedatum, null);
});

test('onvolledige invoer levert geen soort op', () => {
  assert.equal(berekenDwangsom({}).vervolg.soort, null);
  assert.equal(berekenDwangsom({ zaaktype: 'gem-bijstand' }).vervolg.kanNuIndienen, false);
});

test('een vooraanmelding wordt vanzelf een aanvraag als de tijd verstrijkt', () => {
  const zaak = { ...basis, ingebrekeGesteld: true, ingebrekestellingDatum: '2026-04-01' };
  assert.equal(berekenDwangsom({ ...zaak, peildatum: '2026-04-10' }).vervolg.soort, DOSSIERSOORT.VOORAANMELDING);
  assert.equal(berekenDwangsom({ ...zaak, peildatum: '2026-04-16' }).vervolg.soort, DOSSIERSOORT.AANVRAAG);
});
