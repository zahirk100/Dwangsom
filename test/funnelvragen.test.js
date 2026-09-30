/**
 * Wat de funnel nog vraagt - en vooral wat niet meer.
 *
 * De aanvraag vroeg eerder adres, geboortedatum, burgerservicenummer en
 * rekeningnummer, op het moment dat iemand net zijn brief had laten lezen en
 * nog niet wist of wij iets voor hem konden betekenen. Dat is omgedraaid: hier
 * vragen wij alleen wat nodig is om de opdracht aan te nemen en contact te
 * houden. De rest komt in het dossier, als de zaak is nagelopen.
 *
 * Deze toetsen bewaken twee dingen tegelijk: dat er niet méér gevraagd wordt
 * (een bijzonder persoonsgegeven van iemand die geen klant wordt), en dat er
 * niet minder gevraagd wordt (zonder e-mailadres kunnen wij niets laten weten).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { teVragenVelden, NIET_IN_DE_FUNNEL } from '../public/shared/funnelvragen.js';
import { AANVRAAGVELDEN } from '../public/shared/dossier.js';

const ids = (zaak) => teVragenVelden(zaak).map((v) => v.id);

test('de funnel vraagt een naam, een e-mailadres en een kenmerk', () => {
  assert.deepEqual(ids({ bestuursorgaan: 'uwv' }), ['naam', 'email', 'kenmerk']);
});

test('naam en e-mailadres zijn verplicht, het kenmerk niet', () => {
  const velden = teVragenVelden({ bestuursorgaan: 'uwv' });
  const verplicht = velden.filter((v) => v.verplicht).map((v) => v.id);
  assert.deepEqual(verplicht, ['naam', 'email']);
  assert.deepEqual(verplicht, AANVRAAGVELDEN,
    'wat de funnel verplicht stelt en wat de server eist, hoort hetzelfde te zijn');
});

test('het burgerservicenummer wordt hier niet gevraagd, bij geen enkele instantie', () => {
  // Dit is de kern van de wijziging. Een burgerservicenummer van iemand die
  // nooit klant wordt, hoort niet in onze opslag te staan.
  for (const orgaan of ['uwv', 'duo', 'svb', 'gemeente', 'belastingdienst', '']) {
    assert.ok(!ids({ bestuursorgaan: orgaan }).includes('bsn'), `bsn wordt gevraagd bij ${orgaan}`);
  }
});

test('adres, geboortedatum en rekeningnummer worden hier evenmin gevraagd', () => {
  const gevraagd = new Set(ids({ bestuursorgaan: 'uwv' }));
  for (const id of NIET_IN_DE_FUNNEL) {
    assert.ok(!gevraagd.has(id), `${id} hoort pas in het dossier gevraagd te worden`);
  }
});

test('wat uit de brief kwam, staat alvast ingevuld', () => {
  // Nooit twee keer vragen wat wij al weten: dat blijft.
  const velden = teVragenVelden({
    bestuursorgaan: 'duo',
    herkenning: { naam: 'L. Pietersen', kenmerk: 'DUO-99887' },
  });
  assert.equal(velden.find((v) => v.id === 'naam').waarde, 'L. Pietersen');
  assert.equal(velden.find((v) => v.id === 'kenmerk').waarde, 'DUO-99887');
  assert.equal(velden.find((v) => v.id === 'email').waarde, '', 'dat weten wij nog niet');
});

test('wat de aanvrager zelf invulde gaat vóór wat wij uit de brief lazen', () => {
  const velden = teVragenVelden({
    herkenning: { naam: 'Uit de brief' },
    contact: { naam: 'Zelf ingetypt' },
  });
  assert.equal(velden.find((v) => v.id === 'naam').waarde, 'Zelf ingetypt');
});

test('het kenmerkveld noemt de instantie waar het vandaan komt', () => {
  assert.match(teVragenVelden({ bestuursorgaan: 'uwv' })[2].label, /UWV/);
  assert.match(teVragenVelden({ bestuursorgaan: 'duo' })[2].label, /DUO/);
});

test('een veld waarover de server klaagde, wordt afgedwongen verplicht', () => {
  // Anders krijgt de aanvrager een foutmelding over iets wat hij mocht
  // overslaan.
  const velden = teVragenVelden({ geforceerd: ['kenmerk'] });
  assert.equal(velden.find((v) => v.id === 'kenmerk').verplicht, true);
});
