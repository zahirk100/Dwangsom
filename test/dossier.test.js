/**
 * Per soort zaak hebben wij andere gegevens en stukken nodig. Deze tests
 * bewaken dat de aanvrager niet meer wordt gevraagd dan nodig, en dat wij
 * niets vergeten te vragen wat wel nodig is.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { berekenDwangsom, UITKOMST } from '../public/shared/dwangsom.js';
import { bepaalDossiereisen, dossierStatus, stukkenVanKlant } from '../public/shared/dossier.js';

const verplicht = (dossier) => bepaalDossiereisen(dossier).gegevens.filter((g) => g.verplicht).map((g) => g.id);
const stukIds = (dossier) => bepaalDossiereisen(dossier).stukken.map((s) => s.id);

function zaak(invoer, contact = {}) {
  const rapport = berekenDwangsom(invoer);
  return { invoer, contact, rapport };
}

test('een vooraanmelding vraagt niet meer dan contactgegevens', () => {
  const dossier = zaak(
    { bestuursorgaan: 'gemeente', zaaktype: 'gem-bijstand', basisdatum: '2026-01-05', peildatum: '2026-02-01' },
    { machtiging: true },
  );
  assert.deepEqual(verplicht(dossier), ['naam', 'email']);
});

test('gaan wij optreden, dan zijn de adresgegevens wel nodig', () => {
  const dossier = zaak(
    {
      bestuursorgaan: 'gemeente', zaaktype: 'gem-bijstand', basisdatum: '2026-01-05',
      ingebrekeGesteld: true, ingebrekestellingDatum: '2026-04-01', peildatum: '2026-05-01',
    },
    { machtiging: true },
  );
  const velden = verplicht(dossier);
  for (const id of ['naam', 'email', 'adres', 'postcode', 'woonplaats', 'geboortedatum']) {
    assert.ok(velden.includes(id), `${id} hoort verplicht te zijn`);
  }
  assert.ok(!velden.includes('telefoon'), 'een telefoonnummer afdwingen is een onnodige drempel');
  assert.ok(!velden.includes('kenmerk'), 'het kenmerk kent niet iedere aanvrager');
});

test('zonder machtiging is de geboortedatum niet nodig', () => {
  const invoer = {
    bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', basisdatum: '2026-01-05',
    ingebrekeGesteld: true, ingebrekestellingDatum: '2026-04-01', peildatum: '2026-05-01',
  };
  assert.ok(!verplicht(zaak(invoer, { machtiging: false })).includes('geboortedatum'));
  assert.ok(verplicht(zaak(invoer, { machtiging: true })).includes('geboortedatum'));
});

test('bij bezwaar vragen wij het primaire besluit en het bezwaarschrift', () => {
  const ids = stukIds(zaak({
    bestuursorgaan: 'gemeente', zaaktype: 'gem-bezwaar', basisdatum: '2025-10-01', peildatum: '2026-04-01',
  }));
  assert.ok(ids.includes('primair-besluit'));
  assert.ok(ids.includes('bezwaarschrift'));
  assert.ok(!ids.includes('ontvangstbevestiging'), 'bij bezwaar is dat het bezwaarschrift zelf');
});

test('een al verstuurde ingebrekestelling vraagt om het verzendbewijs', () => {
  const ids = stukIds(zaak({
    bestuursorgaan: 'uwv', zaaktype: 'uwv-ww', basisdatum: '2026-01-05',
    ingebrekeGesteld: true, ingebrekestellingDatum: '2026-04-01', peildatum: '2026-05-01',
  }));
  assert.ok(ids.includes('ingebrekestelling'));
  assert.ok(ids.includes('verzendbewijs'));
});

test('verdaging en opschorting vragen om de bijbehorende brief', () => {
  const ids = stukIds(zaak({
    bestuursorgaan: 'gemeente', zaaktype: 'gem-wmo', basisdatum: '2026-01-05',
    verdaagd: true, opschortingDagen: 10, peildatum: '2026-06-01',
  }));
  assert.ok(ids.includes('verdagingsbrief'));
  assert.ok(ids.includes('opschortingsbrief'));
});

test('de machtiging is iets dat wij aanleveren, niet de aanvrager', () => {
  const dossier = zaak({
    bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', basisdatum: '2026-01-05',
    ingebrekeGesteld: true, ingebrekestellingDatum: '2026-04-01', peildatum: '2026-05-01',
  }, { machtiging: true });
  const machtiging = bepaalDossiereisen(dossier).stukken.find((s) => s.id === 'machtiging');
  assert.equal(machtiging.door, 'wij');
  assert.ok(!stukkenVanKlant(dossier).some((s) => s.id === 'machtiging'));
});

test('de dossierstatus laat zien wat nog ontbreekt', () => {
  const dossier = zaak({
    bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', basisdatum: '2026-01-05',
    ingebrekeGesteld: true, ingebrekestellingDatum: '2026-04-01', peildatum: '2026-05-01',
  });

  const leeg = dossierStatus({ ...dossier, stukken: {} });
  assert.equal(leeg.compleet, false);
  assert.equal(leeg.ontbreekt.length, 3);

  const compleet = dossierStatus({
    ...dossier,
    stukken: { ontvangstbevestiging: true, ingebrekestelling: true, verzendbewijs: true },
  });
  assert.equal(compleet.compleet, true);
  assert.equal(compleet.ontbreekt.length, 0);
});

test('optionele stukken blokkeren een compleet dossier niet', () => {
  const dossier = zaak({
    bestuursorgaan: 'gemeente', zaaktype: 'gem-bijstand', basisdatum: '2026-01-05',
    termijnBekend: true, termijnEinddatum: '2026-03-01',
    ingebrekeGesteld: true, ingebrekestellingDatum: '2026-04-01', peildatum: '2026-05-01',
  });
  const status = dossierStatus({
    ...dossier,
    stukken: { ontvangstbevestiging: true, ingebrekestelling: true, verzendbewijs: true },
  });
  assert.equal(status.compleet, true, 'alleen de termijnbrief ontbreekt nog, en die is optioneel');
  assert.deepEqual(status.ontbreekt.map((s) => s.id), ['termijnbrief']);
});

test('bij een verstreken termijn met machtiging hoort de machtiging in de stukken', () => {
  // Dit ging mis: zo'n zaak heet intern een vooraanmelding, dus stond de
  // machtiging niet in de stukkenlijst terwijl de aanvrager al getekend had
  // en er een ingebrekestelling namens hem de deur uit moest.
  const eisen = bepaalDossiereisen({
    invoer: { bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', basisdatum: '2026-01-05' },
    contact: { machtiging: true },
    rapport: {
      uitkomst: UITKOMST.INGEBREKESTELLING_NODIG,
      vervolg: { soort: 'vooraanmelding' },
    },
  });
  assert.ok(eisen.stukken.some((s) => s.id === 'machtiging'), 'de machtiging hoort erbij');
  const verplicht = eisen.gegevens.filter((g) => g.verplicht).map((g) => g.id);
  assert.ok(verplicht.includes('adres'), 'zonder adres kan de brief niet verstuurd worden');
  assert.ok(verplicht.includes('bsn'), 'het bestuursorgaan vindt de zaak met het BSN terug');
});

test('loopt de termijn nog, dan vragen wij niet meer dan contactgegevens', () => {
  const eisen = bepaalDossiereisen({
    invoer: { bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', basisdatum: '2026-09-01' },
    contact: { machtiging: true },
    rapport: { uitkomst: UITKOMST.TERMIJN_LOOPT, vervolg: { soort: 'vooraanmelding' } },
  });
  const verplicht = eisen.gegevens.filter((g) => g.verplicht).map((g) => g.id);
  assert.ok(!verplicht.includes('bsn'), 'er gebeurt nog niets, dus dit hoeft nog niet');
  assert.ok(!verplicht.includes('adres'));
});

test('zonder machtiging vragen wij niets extra, ook niet bij een verstreken termijn', () => {
  // Dan sturen wij niets namens deze persoon; het dossier is een vraag.
  const eisen = bepaalDossiereisen({
    invoer: { bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', basisdatum: '2026-01-05' },
    contact: { machtiging: false },
    rapport: { uitkomst: UITKOMST.INGEBREKESTELLING_NODIG, vervolg: { soort: 'vooraanmelding' } },
  });
  const verplicht = eisen.gegevens.filter((g) => g.verplicht).map((g) => g.id);
  assert.ok(!verplicht.includes('bsn'));
  assert.ok(!eisen.stukken.some((s) => s.id === 'machtiging'));
});
