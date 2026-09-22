/**
 * Het tarief.
 *
 * Het gekozen tarief is 25%, en dat is de standaard. De omgeving gaat daar
 * vóór, zodat het te wijzigen is zonder de code aan te raken.
 *
 * Eén regel blijft overeind: wordt het tarief uitdrukkelijk leeggezet, dan
 * noemt de site géén getal. Een verzonnen percentage op het scherm waar iemand
 * tekent, is erger dan geen percentage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tarief, tariefZin, tariefVoorbeeld, tariefKort, ontbrekendTarief,
  tariefSplitsing, STANDAARD_PERCENTAGE,
} from '../public/shared/tarief.js';

test('zonder omgevingsvariabele geldt het gekozen tarief van 25%', () => {
  const t = tarief({});
  assert.equal(t.bekend, true);
  assert.equal(t.soort, 'percentage');
  assert.equal(t.percentage, STANDAARD_PERCENTAGE);
  assert.match(tariefZin(t), /25%/);
  assert.equal(ontbrekendTarief({}), '');
});

test('de omgeving gaat vóór de standaard', () => {
  assert.equal(tarief({ TARIEF_PERCENTAGE: '20' }).percentage, 20);
  assert.equal(tarief({ TARIEF_VAST: '129' }).soort, 'vast');
});

test('uitdrukkelijk leeggezet betekent: noem geen getal', () => {
  // Dit is de ontsnapping voor als het tarief nog niet vaststaat. Een 0 of
  // iets onleesbaars is een keuze, geen vergissing, dus dan niet stilletjes
  // terugvallen op 25%.
  for (const env of [{ TARIEF_PERCENTAGE: '0' }, { TARIEF_PERCENTAGE: 'nader te bepalen' }]) {
    const t = tarief(env);
    assert.equal(t.bekend, false, `${JSON.stringify(env)} hoort geen tarief op te leveren`);
    const zin = tariefZin(t);
    assert.ok(!/\d/.test(zin), `er staat een getal in: ${zin}`);
    assert.match(zin, /vooraf/);
    assert.equal(tariefVoorbeeld(t), '', 'zonder tarief ook geen rekenvoorbeeld');
    assert.match(ontbrekendTarief(env), /TARIEF_PERCENTAGE/);
  }
});

test('de splitsing laat zien wat de aanvrager overhoudt', () => {
  // Een percentage zegt mensen weinig; dit is het getal waar het om gaat.
  const split = tariefSplitsing(tarief({}), 1442);
  assert.equal(split.vergoeding, 360.5);
  assert.equal(split.overhoudt, 1081.5);

  const vast = tariefSplitsing(tarief({ TARIEF_VAST: '129' }), 1442);
  assert.equal(vast.vergoeding, 129);
  assert.equal(vast.overhoudt, 1313);

  // Nooit meer rekenen dan er binnenkomt.
  assert.equal(tariefSplitsing(tarief({ TARIEF_VAST: '129' }), 69).vergoeding, 69);
  assert.equal(tariefSplitsing(tarief({}), 0), null);
  assert.equal(tariefSplitsing(tarief({ TARIEF_PERCENTAGE: '0' }), 500), null);
});

test('een percentage komt overal in dezelfde vorm terug', () => {
  const t = tarief({ TARIEF_PERCENTAGE: '25' });
  assert.equal(t.soort, 'percentage');
  assert.match(tariefZin(t), /25%/);
  assert.match(tariefKort(t), /25%/);
  assert.equal(ontbrekendTarief({ TARIEF_PERCENTAGE: '25' }), '');
});

test('het rekenvoorbeeld klopt en leest als Nederlands geld', () => {
  const voorbeeld = tariefVoorbeeld(tarief({ TARIEF_PERCENTAGE: '25' }), 1000);
  assert.match(voorbeeld, /€ 1\.000/, 'duizendtallen met een punt');
  assert.match(voorbeeld, /€ 250/);
  assert.match(voorbeeld, /€ 750/);

  const vast = tariefVoorbeeld(tarief({ TARIEF_VAST: '129' }), 1442);
  assert.match(vast, /€ 129/);
  assert.match(vast, /€ 1\.313/);
});

test('een vast bedrag is nooit hoger dan wat er binnenkomt', () => {
  // Anders staat er dat je geld moet bijleggen.
  const voorbeeld = tariefVoorbeeld(tarief({ TARIEF_VAST: '200' }), 150);
  assert.match(voorbeeld, /€ 150/);
  assert.ok(!/-/.test(voorbeeld), `er staat een negatief bedrag in: ${voorbeeld}`);
});

test('onzinnige instellingen worden genegeerd in plaats van getoond', () => {
  for (const env of [
    { TARIEF_PERCENTAGE: '0' }, { TARIEF_PERCENTAGE: '-5' }, { TARIEF_PERCENTAGE: '120' },
    { TARIEF_PERCENTAGE: 'veel' }, { TARIEF_VAST: '0' }, { TARIEF_VAST: 'gratis' },
  ]) {
    assert.equal(tarief(env).bekend, false, `${JSON.stringify(env)} hoort niet te tellen`);
  }
});

test('een percentage wint van een vast bedrag als beide zijn ingesteld', () => {
  const t = tarief({ TARIEF_PERCENTAGE: '20', TARIEF_VAST: '99' });
  assert.equal(t.soort, 'percentage');
});
