/**
 * De allereerste start: er staat nog geen enkel account.
 *
 * Dat is de meest waarschijnlijke eerste stap na een verse deploy, en de
 * applicatie moet dan niet stuk lijken maar uitleggen wat er moet gebeuren.
 * De eerste beheerder maakt zichzelf aan; daarna kan dat nooit meer, anders
 * kon iedereen die het pad kent zichzelf beheerder maken.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'nubeslist-eerste-'));
process.env.DATA_DIR = tijdelijk;
process.env.SESSIE_GEHEIM = 'testgeheim-voor-de-eerste-start';
delete process.env.BEHEER_OPEN;

const { start, server } = await import('../server.js');
await start(0);
const basis = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  server.close();
  await fs.rm(tijdelijk, { recursive: true, force: true });
});

const haal = (pad, opties = {}) => fetch(basis + pad, {
  headers: { 'Content-Type': 'application/json', ...(opties.headers || {}) }, ...opties,
});

test('de beheerpagina meldt dat er nog geen account is', async () => {
  const data = await (await haal('/api/beheer/sessie')).json();
  assert.equal(data.ingelogd, false);
  assert.equal(data.eersteStart, true, 'de pagina moet het aanmaakscherm kunnen tonen');
  assert.ok(Array.isArray(data.rollen) && data.rollen.length >= 3);
});

test('het beheerdeel blijft ondertussen dicht', async () => {
  assert.equal((await haal('/api/beheer/aanvragen')).status, 401);
});

test('een te kort wachtwoord wordt geweigerd met uitleg', async () => {
  const antwoord = await haal('/api/beheer/eerste-beheerder', {
    method: 'POST',
    body: JSON.stringify({ email: 'baas@nubeslist.nl', naam: 'Baas', wachtwoord: 'kort' }),
  });
  assert.equal(antwoord.status, 400);
  assert.match((await antwoord.json()).fout, /minstens 12 tekens/i);
});

test('de eerste beheerder maakt zichzelf aan en is meteen ingelogd', async () => {
  const antwoord = await haal('/api/beheer/eerste-beheerder', {
    method: 'POST',
    body: JSON.stringify({
      email: 'baas@nubeslist.nl', naam: 'De Baas', wachtwoord: 'een-lang-genoeg-wachtwoord',
    }),
  });
  assert.equal(antwoord.status, 201);
  const cookie = antwoord.headers.getSetCookie()[0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  const { gebruiker } = await antwoord.json();
  assert.equal(gebruiker.rol, 'beheerder');
  assert.equal(gebruiker.email, 'baas@nubeslist.nl');
  assert.ok(!('wachtwoordHash' in gebruiker), 'een hash hoort nooit de deur uit te gaan');
});

test('zonder tweede factor kom je niet bij de dossiers', async () => {
  const inlog = await haal('/api/beheer/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'baas@nubeslist.nl', wachtwoord: 'een-lang-genoeg-wachtwoord' }),
  });
  const cookie = inlog.headers.getSetCookie()[0].split(';')[0];
  const data = await inlog.json();
  assert.equal(data.tweefactorInstellen, true);

  // De sessie is er wel, maar de dossiers blijven dicht tot de tweede factor staat.
  assert.equal((await haal('/api/beheer/aanvragen', { headers: { cookie } })).status, 401);

  const sessie = await (await haal('/api/beheer/sessie', { headers: { cookie } })).json();
  assert.equal(sessie.ingelogd, false);
  assert.equal(sessie.tweefactorNodig, true, 'het scherm moet de instelwizard kunnen tonen');
});

test('met tweefactor gaat de deur open, en de codes komen één keer in beeld', async () => {
  const { logInAlsBeheerder } = await import('./hulp-inloggen.mjs');
  // Deze beheerder bestaat al, dus hier het gewone pad: inloggen plus instellen.
  const inlog = await haal('/api/beheer/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'baas@nubeslist.nl', wachtwoord: 'een-lang-genoeg-wachtwoord' }),
  });
  const cookie = inlog.headers.getSetCookie()[0].split(';')[0];
  const { codeVoor } = await import('../src/totp.js');

  const start2 = await (await haal('/api/beheer/tweefactor/start', {
    method: 'POST', headers: { cookie }, body: '{}',
  })).json();
  assert.match(start2.otpauth, /^otpauth:\/\/totp\//);
  assert.ok(start2.geheim.length >= 16);

  const bevestigd = await haal('/api/beheer/tweefactor/bevestig', {
    method: 'POST', headers: { cookie }, body: JSON.stringify({ code: codeVoor(start2.geheim) }),
  });
  assert.equal(bevestigd.status, 200);
  const { herstelcodes } = await bevestigd.json();
  assert.equal(herstelcodes.length, 8, 'voor als de telefoon kwijtraakt');

  assert.equal((await haal('/api/beheer/aanvragen', { headers: { cookie } })).status, 200);
  assert.ok(logInAlsBeheerder, 'de hulpfunctie bestaat');
});

test('een tweede keer een eerste beheerder aanmaken lukt niet', async () => {
  const antwoord = await haal('/api/beheer/eerste-beheerder', {
    method: 'POST',
    body: JSON.stringify({ email: 'indringer@voorbeeld.nl', naam: 'X', wachtwoord: 'ook-een-lang-wachtwoord' }),
  });
  assert.equal(antwoord.status, 409);
});
