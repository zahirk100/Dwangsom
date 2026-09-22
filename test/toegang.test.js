/**
 * Wachtwoorden, tweefactor en sessies.
 *
 * Dit is de code waar een fout het duurst is, dus staat hier het meeste vast:
 * dat een hash niet terug te rekenen is, dat een code uit de app klopt met de
 * officiële testwaarden, dat een herstelcode maar één keer werkt en dat een
 * geknoeid cookie niets oplevert.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { hashWachtwoord, wachtwoordKlopt, keurWachtwoord, MINIMALE_LENGTE } from '../src/wachtwoord.js';
import { nieuwGeheim, codeVoor, codeKlopt, naarBasis32, vanBasis32, otpauthUrl } from '../src/totp.js';
import { Gebruikers, magWijzigen, magBeheren, isMedewerker, naarBuiten } from '../src/gebruikers.js';
import { GeheugenOpslag } from '../src/opslag.js';

// ---------------------------------------------------------- wachtwoorden ---

test('een hash verraadt het wachtwoord niet en is elke keer anders', async () => {
  const hash = await hashWachtwoord('geheim-wachtwoord-123');
  assert.ok(!hash.includes('geheim'), 'het wachtwoord hoort er niet in te staan');
  assert.match(hash, /^scrypt\$\d+\$\d+\$\d+\$/);

  const tweede = await hashWachtwoord('geheim-wachtwoord-123');
  assert.notEqual(hash, tweede, 'elk wachtwoord krijgt zijn eigen zout');
  assert.ok(await wachtwoordKlopt('geheim-wachtwoord-123', tweede));
});

test('een onjuist wachtwoord wordt afgekeurd, en rommel laat niets omvallen', async () => {
  const hash = await hashWachtwoord('het-echte-wachtwoord');
  assert.equal(await wachtwoordKlopt('bijna-het-echte', hash), false);
  assert.equal(await wachtwoordKlopt('', hash), false);
  assert.equal(await wachtwoordKlopt('x', 'geen-geldige-hash'), false);
  assert.equal(await wachtwoordKlopt('x', ''), false);
  assert.equal(await wachtwoordKlopt('x', null), false);
  // Absurde kosten zouden het proces laten hangen; die horen geweigerd.
  assert.equal(await wachtwoordKlopt('x', 'scrypt$99999999$8$1$AAAA$AAAA'), false);
});

test('een te kort of te eenvormig wachtwoord wordt geweigerd met uitleg', () => {
  assert.match(keurWachtwoord('kort'), new RegExp(String(MINIMALE_LENGTE)));
  assert.match(keurWachtwoord('aaaaaaaaaaaaaaa'), /verschillende tekens/);
  assert.equal(keurWachtwoord('een-prima-wachtwoord'), '');
});

// ------------------------------------------------------------- tweefactor ---

test('de codes komen overeen met de testwaarden uit RFC 6238', () => {
  // Het geheim uit de RFC is de tekst "12345678901234567890".
  const geheim = naarBasis32(Buffer.from('12345678901234567890'));
  assert.equal(codeVoor(geheim, 59 * 1000), '287082');
  assert.equal(codeVoor(geheim, 1111111109 * 1000), '081804');
  assert.equal(codeVoor(geheim, 1234567890 * 1000), '005924');
});

test('base32 gaat heen en weer zonder verlies', () => {
  const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual([...vanBasis32(naarBasis32(bytes))], [...bytes]);
  // Spaties en kleine letters horen gewoon te werken; mensen typen het over.
  assert.deepEqual([...vanBasis32('jbsw y3dp'.toUpperCase())], [...vanBasis32('JBSWY3DP')]);
});

test('een code is een halve minuut speling waard, maar niet meer', () => {
  const geheim = nieuwGeheim();
  const nu = Date.now();
  assert.equal(codeKlopt(geheim, codeVoor(geheim, nu), nu), true);
  assert.equal(codeKlopt(geheim, codeVoor(geheim, nu - 30_000), nu), true, 'iets achterlopen mag');
  assert.equal(codeKlopt(geheim, codeVoor(geheim, nu + 30_000), nu), true, 'iets voorlopen ook');
  assert.equal(codeKlopt(geheim, codeVoor(geheim, nu - 120_000), nu), false, 'twee minuten niet');
  assert.equal(codeKlopt(geheim, '000000', nu), false);
  assert.equal(codeKlopt(geheim, 'abcdef', nu), false);
  assert.equal(codeKlopt(geheim, '', nu), false);
  assert.equal(codeKlopt('', '123456', nu), false);
});

test('de otpauth-koppeling bevat alles wat een app nodig heeft', () => {
  const url = otpauthUrl({ geheim: 'ABCDEFGH', email: 'test@nubeslist.nl' });
  assert.match(url, /^otpauth:\/\/totp\//);
  assert.match(url, /secret=ABCDEFGH/);
  assert.match(url, /issuer=nubeslist\.nl/);
  assert.match(url, /digits=6/);
});

// --------------------------------------------------------------- accounts ---

async function verseGebruikers() {
  const opslag = new GeheugenOpslag();
  await opslag.init();
  return new Gebruikers({ opslag, sleutel: Buffer.alloc(32, 9) });
}

test('de eerste beheerder kan zichzelf aanmaken, daarna niemand meer', async () => {
  const g = await verseGebruikers();
  assert.equal(await g.isLeeg(), true);
  await g.maakEersteBeheerder({ email: 'Baas@Nubeslist.NL', naam: 'Baas', wachtwoord: 'een-lang-wachtwoord' });
  assert.equal(await g.isLeeg(), false);
  await assert.rejects(
    () => g.maakEersteBeheerder({ email: 'twee@nubeslist.nl', wachtwoord: 'nog-een-lang-wachtwoord' }),
    /al een beheerder/,
  );
});

test('een e-mailadres wordt hoofdletterongevoelig herkend', async () => {
  const g = await verseGebruikers();
  await g.maakEersteBeheerder({ email: 'Baas@Nubeslist.NL', naam: 'Baas', wachtwoord: 'een-lang-wachtwoord' });
  assert.ok(await g.vindOpEmail('baas@nubeslist.nl'));
  assert.ok(await g.vindOpEmail('  BAAS@NUBESLIST.NL  '));
  const uitslag = await g.controleerWachtwoord('BAAS@nubeslist.nl', 'een-lang-wachtwoord');
  assert.ok(uitslag.gebruiker, uitslag.fout);
});

test('een onbekend account geeft dezelfde melding als een fout wachtwoord', async () => {
  const g = await verseGebruikers();
  await g.maakEersteBeheerder({ email: 'baas@nubeslist.nl', wachtwoord: 'een-lang-wachtwoord' });
  const onbekend = await g.controleerWachtwoord('niemand@nergens.nl', 'wat-dan-ook');
  const fout = await g.controleerWachtwoord('baas@nubeslist.nl', 'verkeerd-wachtwoord');
  assert.equal(onbekend.fout, fout.fout, 'anders is uit te vragen wie er een account heeft');
});

test('een herstelcode werkt precies één keer', async () => {
  const g = await verseGebruikers();
  const baas = await g.maakEersteBeheerder({ email: 'b@n.nl', wachtwoord: 'een-lang-wachtwoord' });
  const { geheim } = await g.begingTweefactor(baas.id);
  const codes = await g.bevestigTweefactor(baas.id, codeVoor(geheim));
  assert.equal(codes.length, 8);

  assert.equal(await g.controleerTweedeFactor(await g.vind(baas.id), codes[0]), true);
  assert.equal(await g.controleerTweedeFactor(await g.vind(baas.id), codes[0]), false, 'op is op');
  assert.equal(await g.controleerTweedeFactor(await g.vind(baas.id), codes[1]), true, 'de rest werkt nog');
});

test('tweefactor telt pas na bevestigen met een kloppende code', async () => {
  const g = await verseGebruikers();
  const baas = await g.maakEersteBeheerder({ email: 'b@n.nl', wachtwoord: 'een-lang-wachtwoord' });
  await g.begingTweefactor(baas.id);
  assert.equal((await g.vind(baas.id)).totpBevestigdOp, null, 'nog niet bevestigd');
  await assert.rejects(() => g.bevestigTweefactor(baas.id, '000000'), /klopt niet/);
  assert.equal((await g.vind(baas.id)).totpBevestigdOp, null);
});

test('een uitnodiging werkt één keer en verloopt', async () => {
  const g = await verseGebruikers();
  const baas = await g.maakEersteBeheerder({ email: 'b@n.nl', wachtwoord: 'een-lang-wachtwoord' });
  const { gebruiker, uitnodiging } = await g.nodigMedewerkerUit({
    email: 'nieuw@nubeslist.nl', naam: 'Nieuw', rol: 'behandelaar', door: baas.id,
  });
  assert.equal(gebruiker.wachtwoordHash, '', 'een uitgenodigde heeft nog geen wachtwoord');

  assert.ok(await g.verzilverKoppeling(uitnodiging, 'uitnodiging'));
  assert.equal(await g.verzilverKoppeling(uitnodiging, 'uitnodiging'), null, 'op is op');
  // Een token voor een ander doel mag niet passen op dit slot.
  const magic = await g.maakKoppeling(gebruiker.id, 'magic');
  assert.equal(await g.verzilverKoppeling(magic, 'uitnodiging'), null);
});

test('twee accounts op hetzelfde e-mailadres kan niet', async () => {
  const g = await verseGebruikers();
  const baas = await g.maakEersteBeheerder({ email: 'b@n.nl', wachtwoord: 'een-lang-wachtwoord' });
  await g.nodigMedewerkerUit({ email: 'x@n.nl', rol: 'lezer', door: baas.id });
  await assert.rejects(
    () => g.nodigMedewerkerUit({ email: 'X@N.NL', rol: 'lezer', door: baas.id }),
    /bestaat al/,
  );
});

test('de laatste beheerder kan zichzelf niet wegwerken', async () => {
  const g = await verseGebruikers();
  const baas = await g.maakEersteBeheerder({ email: 'b@n.nl', wachtwoord: 'een-lang-wachtwoord' });
  await assert.rejects(() => g.zetActief(baas.id, false), /laatste beheerder/);
  await assert.rejects(() => g.wijzigRol(baas.id, 'lezer'), /laatste beheerder/);
});

test('rollen bepalen wat er mag', () => {
  assert.equal(magWijzigen({ rol: 'beheerder' }), true);
  assert.equal(magWijzigen({ rol: 'behandelaar' }), true);
  assert.equal(magWijzigen({ rol: 'lezer' }), false, 'een meekijker wijzigt niets');
  assert.equal(magBeheren({ rol: 'behandelaar' }), false);
  assert.equal(isMedewerker({ rol: 'klant', actief: true }), false);
  assert.equal(isMedewerker({ rol: 'behandelaar', actief: false }), false);
});

test('er gaan nooit hashes of geheimen naar de browser', () => {
  const buiten = naarBuiten({
    id: 'a', email: 'b@n.nl', naam: 'B', rol: 'beheerder', actief: true,
    wachtwoordHash: 'scrypt$geheim', totpGeheim: 'ABCDEF', herstelcodes: ['x'],
    aangemaaktOp: '2026-01-01', totpBevestigdOp: '2026-01-02',
  });
  assert.equal(buiten.tweefactorAan, true);
  for (const verboden of ['wachtwoordHash', 'totpGeheim', 'herstelcodes']) {
    assert.ok(!(verboden in buiten), `${verboden} hoort niet naar buiten te gaan`);
  }
});

// ---------------------------------------------------------------- sessies ---

test('een sessie werkt, en een geknoeid cookie niet', async () => {
  const g = await verseGebruikers();
  const baas = await g.maakEersteBeheerder({ email: 'b@n.nl', wachtwoord: 'een-lang-wachtwoord' });
  const cookie = await g.maakSessie(baas, { ip: '1.2.3.4' });

  assert.equal((await g.uitCookie(cookie)).gebruiker.id, baas.id);
  assert.equal(await g.uitCookie(`${cookie.split('.')[0]}.eigenhandtekening`), null);
  assert.equal(await g.uitCookie('zomaar-wat'), null);
  assert.equal(await g.uitCookie(''), null);
  assert.equal(await g.uitCookie(null), null);

  await g.beeindigSessie(cookie);
  assert.equal(await g.uitCookie(cookie), null, 'uitloggen doet de sessie echt weg');
});

test('een geblokkeerd account verliest zijn lopende sessies', async () => {
  const g = await verseGebruikers();
  const baas = await g.maakEersteBeheerder({ email: 'b@n.nl', wachtwoord: 'een-lang-wachtwoord' });
  const { gebruiker } = await g.nodigMedewerkerUit({
    email: 'collega@n.nl', rol: 'behandelaar', door: baas.id,
  });
  const cookie = await g.maakSessie(gebruiker);
  assert.ok(await g.uitCookie(cookie));

  await g.zetActief(gebruiker.id, false, baas.id);
  assert.equal(await g.uitCookie(cookie), null, 'geblokkeerd is meteen geblokkeerd');
});

test('verlopen sessies en koppelingen worden opgeruimd', async () => {
  const g = await verseGebruikers();
  const baas = await g.maakEersteBeheerder({ email: 'b@n.nl', wachtwoord: 'een-lang-wachtwoord' });
  await g.maakSessie(baas, { duurMs: 1000 });
  await g.maakKoppeling(baas.id, 'magic', 1000);

  const morgen = Date.now() + 25 * 60 * 60 * 1000;
  assert.equal(await g.ruimOp(morgen), 2);
  assert.equal(await g.ruimOp(morgen), 0, 'en dan is er niets meer op te ruimen');
});
