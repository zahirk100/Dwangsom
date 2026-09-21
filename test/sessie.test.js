import test from 'node:test';
import assert from 'node:assert/strict';

import { maakToken, tokenIsGeldig, sessieCookie, sessieSleutel, SESSIEDUUR_MS } from '../src/sessie.js';

const sleutel = sessieSleutel({ BEHEER_WACHTWOORD: 'geheim' });

test('een vers token is geldig', () => {
  assert.equal(tokenIsGeldig(sleutel, maakToken(sleutel)), true);
});

test('hetzelfde wachtwoord geeft dezelfde sleutel, ook in een ander proces', () => {
  const tweede = sessieSleutel({ BEHEER_WACHTWOORD: 'geheim' });
  assert.equal(tokenIsGeldig(tweede, maakToken(sleutel)), true);
});

test('een ander wachtwoord maakt lopende sessies ongeldig', () => {
  const andere = sessieSleutel({ BEHEER_WACHTWOORD: 'ander' });
  assert.equal(tokenIsGeldig(andere, maakToken(sleutel)), false);
});

test('SESSIE_GEHEIM gaat voor op het wachtwoord', () => {
  const a = sessieSleutel({ SESSIE_GEHEIM: 'abc', BEHEER_WACHTWOORD: 'x' });
  const b = sessieSleutel({ SESSIE_GEHEIM: 'abc', BEHEER_WACHTWOORD: 'y' });
  assert.equal(tokenIsGeldig(b, maakToken(a)), true);
});

test('een verlopen token wordt geweigerd', () => {
  const token = maakToken(sleutel, Date.now() - SESSIEDUUR_MS - 1000);
  assert.equal(tokenIsGeldig(sleutel, token), false);
});

test('knoeien met de vervaldatum of de handtekening werkt niet', () => {
  const token = maakToken(sleutel);
  const [vervalt, handtekening] = token.split('.');
  assert.equal(tokenIsGeldig(sleutel, `${Number(vervalt) + 99999999}.${handtekening}`), false);
  assert.equal(tokenIsGeldig(sleutel, `${vervalt}.${handtekening.slice(0, -1)}x`), false);
  assert.equal(tokenIsGeldig(sleutel, `${vervalt}.kort`), false);
});

test('onzin als token levert geen uitzondering op', () => {
  for (const onzin of [undefined, null, '', 'geen-punt', '.', 12345, {}]) {
    assert.equal(tokenIsGeldig(sleutel, onzin), false);
  }
});

test('het cookie is HttpOnly en SameSite, en Secure achter HTTPS', () => {
  const gewoon = sessieCookie('t');
  assert.match(gewoon, /HttpOnly/);
  assert.match(gewoon, /SameSite=Strict/);
  assert.doesNotMatch(gewoon, /Secure/);
  assert.match(sessieCookie('t', { veilig: true }), /Secure/);
  assert.match(sessieCookie('', { verwijder: true }), /Max-Age=0/);
});
