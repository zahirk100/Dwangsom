/**
 * De funnel vraagt niet twee keer wat al uit de brief kwam. Dat mag alleen
 * niet betekenen dat een fout onzichtbaar wordt: een nummer dat bij het woord
 * "burgerservicenummer" staat, is niet altijd een burgerservicenummer. Wordt
 * zo'n waarde later door de server afgekeurd, dan zit de aanvrager met een
 * melding over een veld dat nergens op het scherm staat. Precies dat gebeurde.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { teVragenVelden } from '../public/shared/funnelvragen.js';

const ids = (zaak) => teVragenVelden(zaak).map((v) => v.id);

const uitDuoBrief = {
  bestuursorgaan: 'duo',
  herkenning: {
    naam: 'L. Pietersen', adres: 'Hoofdweg 3', postcode: '9726 AA',
    woonplaats: 'Groningen', bsn: '111222333',
  },
};

test('wat uit de brief kwam, wordt niet opnieuw gevraagd', () => {
  assert.deepEqual(ids(uitDuoBrief), ['geboortedatum', 'iban', 'email', 'telefoon']);
});

test('een onbruikbaar burgerservicenummer uit de brief wordt alsnog gevraagd', () => {
  const zaak = { ...uitDuoBrief, herkenning: { ...uitDuoBrief.herkenning, bsn: '123456789' } };
  const velden = teVragenVelden(zaak);
  const bsn = velden.find((v) => v.id === 'bsn');
  assert.ok(bsn, 'zonder dit veld kan de aanvrager de fout niet herstellen');
  assert.match(bsn.hulp, /geen geldig burgerservicenummer/);
});

test('staat er geen nummer in de brief, dan wordt het gewoon gevraagd', () => {
  const zaak = { bestuursorgaan: 'uwv', herkenning: { naam: 'K. Bakker' } };
  const velden = ids(zaak);
  assert.ok(velden.includes('bsn'));
  assert.match(teVragenVelden(zaak).find((v) => v.id === 'bsn').hulp, /je zaak te kunnen vinden/);
});

test('instanties die geen burgerservicenummer vragen, krijgen dat veld niet', () => {
  assert.ok(!ids({ bestuursorgaan: 'anders', herkenning: { naam: 'A' } }).includes('bsn'));
  assert.ok(ids({ bestuursorgaan: 'gemeente', herkenning: { naam: 'A' } }).includes('bsn'));
});

test('een veld waarover de server klaagde, wordt afgedwongen getoond', () => {
  const zonder = ids(uitDuoBrief);
  assert.ok(!zonder.includes('woonplaats'), 'die stond in de brief');

  const met = ids({ ...uitDuoBrief, geforceerd: ['woonplaats', 'bsn'] });
  assert.ok(met.includes('woonplaats'));
  assert.ok(met.includes('bsn'));
});

test('een ingevulde correctie gaat voor op wat uit de brief kwam', () => {
  const zaak = {
    ...uitDuoBrief,
    herkenning: { ...uitDuoBrief.herkenning, bsn: '123456789' },
    contact: { bsn: '111222333' },
  };
  assert.ok(!ids(zaak).includes('bsn'), 'de aanvrager heeft het al rechtgezet');
});

test('een onbruikbaar rekeningnummer wordt als zodanig benoemd', () => {
  const zaak = { ...uitDuoBrief, contact: { iban: 'NL00BANK0000000000' } };
  const iban = teVragenVelden(zaak).find((v) => v.id === 'iban');
  assert.match(iban.hulp, /klopt niet/);
});

test('de vaste velden worden altijd gevraagd', () => {
  for (const id of ['geboortedatum', 'iban', 'email', 'telefoon']) {
    assert.ok(ids(uitDuoBrief).includes(id), `${id} hoort er altijd bij`);
  }
  assert.equal(teVragenVelden(uitDuoBrief).find((v) => v.id === 'telefoon').verplicht, false);
});
