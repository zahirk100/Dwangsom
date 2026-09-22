/**
 * Het tarief.
 *
 * Eén regel staat hier voorop: zonder ingesteld tarief noemt de site géén
 * getal. Een verzonnen percentage op het scherm waar iemand tekent, is erger
 * dan geen percentage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tarief, tariefZin, tariefVoorbeeld, tariefKort, ontbrekendTarief } from '../public/shared/tarief.js';

test('zonder instelling noemt de site geen bedrag en geen percentage', () => {
  const t = tarief({});
  assert.equal(t.bekend, false);
  const zin = tariefZin(t);
  assert.ok(!/\d/.test(zin), `er staat een getal in: ${zin}`);
  assert.match(zin, /vooraf/);
  assert.equal(tariefVoorbeeld(t), '', 'zonder tarief ook geen rekenvoorbeeld');
  assert.match(ontbrekendTarief({}), /TARIEF_PERCENTAGE/);
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
