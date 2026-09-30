/**
 * Het adres van de bezoeker achter een proxy.
 *
 * Dit is geen randgeval maar de kern van elke snelheidsgrens in deze
 * applicatie. Op Vercel komt elk verzoek binnen via het platform, en dan is
 * `socket.remoteAddress` het adres van dat platform: voor iedereen hetzelfde.
 * Alle grenzen deelden daardoor één teller voor de hele site.
 *
 * Wat dat deed: de meetgrens van zestig meldingen per tien minuten was met
 * een advertentie aan binnen enkele minuten vol, waarna elke volgende melding
 * werd weggegooid. De route antwoordt altijd 204, dus daar was niets van te
 * zien: in de advertentiebeheerder liepen de kliks op, hier bleef het stil.
 * Dezelfde teller gold voor het uploaden van een brief en voor het indienen
 * van een aanvraag, dus daar liepen echte aanvragers tegen een grens aan die
 * voor hen niet bedoeld was.
 *
 * De keerzijde staat er ook in: een header mag alleen worden geloofd als er
 * echt een proxy voor staat. Anders kiest een aanvaller zijn eigen grens.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { clientIp, achterProxy, Snelheidsbegrenzer } from '../src/http-util.js';

const verzoek = (headers = {}, remoteAddress = '10.0.0.1') => ({ headers, socket: { remoteAddress } });

test('zonder proxy telt alleen het adres van de verbinding', () => {
  const req = verzoek({ 'x-forwarded-for': '9.9.9.9' }, '203.0.113.7');
  assert.equal(clientIp(req, { proxy: false }), '203.0.113.7');
});

test('achter een proxy telt het doorgegeven adres van de bezoeker', () => {
  assert.equal(clientIp(verzoek({ 'x-forwarded-for': '198.51.100.4' }), { proxy: true }), '198.51.100.4');
  assert.equal(clientIp(verzoek({ 'x-real-ip': '198.51.100.5' }), { proxy: true }), '198.51.100.5');
  assert.equal(clientIp(verzoek({ 'x-vercel-forwarded-for': '198.51.100.6' }), { proxy: true }),
    '198.51.100.6');
});

test('van een ketting adressen telt de bezoeker, niet de laatste proxy', () => {
  const req = verzoek({ 'x-forwarded-for': '198.51.100.4, 70.41.3.18, 150.172.238.178' });
  assert.equal(clientIp(req, { proxy: true }), '198.51.100.4');
});

test('ontbreekt de header, dan blijft het adres van de verbinding over', () => {
  assert.equal(clientIp(verzoek({}, '203.0.113.9'), { proxy: true }), '203.0.113.9');
  assert.equal(clientIp({ headers: {}, socket: {} }, { proxy: true }), 'onbekend');
});

test('alleen een omgeving met een proxy ervoor vertrouwt de header', () => {
  assert.equal(achterProxy({}), false);
  assert.equal(achterProxy({ VERCEL: '1' }), true);
  assert.equal(achterProxy({ AWS_LAMBDA_FUNCTION_NAME: 'iets' }), true);
  assert.equal(achterProxy({ VERTROUW_PROXY: '1' }), true);
});

test('twee bezoekers achter dezelfde proxy delen hun grens niet', () => {
  // Dit is de toets die het echte probleem beschrijft: met één sleutel voor
  // iedereen is de derde bezoeker al geweigerd.
  const grens = new Snelheidsbegrenzer({ max: 2, vensterMs: 60_000 });
  const adressen = ['198.51.100.1', '198.51.100.2', '198.51.100.3'];
  for (const adres of adressen) {
    const req = verzoek({ 'x-forwarded-for': adres });
    assert.equal(grens.controleer(clientIp(req, { proxy: true })).toegestaan, true,
      `${adres} werd geweigerd terwijl hij nog niets gedaan had`);
  }
  // En de grens zelf werkt nog wel, per bezoeker.
  const zelfde = verzoek({ 'x-forwarded-for': '198.51.100.1' });
  assert.equal(grens.controleer(clientIp(zelfde, { proxy: true })).toegestaan, true);
  assert.equal(grens.controleer(clientIp(zelfde, { proxy: true })).toegestaan, false);
});
