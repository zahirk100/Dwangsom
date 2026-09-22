/**
 * Het klantportaal.
 *
 * De kernvraag is hier steeds dezelfde: kan iemand iets zien dat niet van hem
 * is? Daarom draaien de meeste tests om twee klanten naast elkaar, en om wat
 * er wél en níét in het antwoord zit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'nubeslist-portaal-'));
process.env.DATA_DIR = tijdelijk;
process.env.SESSIE_GEHEIM = 'testgeheim-voor-het-portaal';
process.env.PORT = '0';
delete process.env.BEHEER_OPEN;

const { start, server, opslag } = await import('../server.js');
await start(0);
const basis = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  server.close();
  await fs.rm(tijdelijk, { recursive: true, force: true });
});

const haal = (pad, opties = {}) => fetch(basis + pad, {
  headers: { 'Content-Type': 'application/json', ...(opties.headers || {}) }, ...opties,
});

const dag = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/** Dient in zoals de funnel dat doet en geeft het referentienummer terug. */
async function dienIn(email, naam = 'K. Klant') {
  const antwoord = await haal('/api/aanvragen', {
    method: 'POST',
    body: JSON.stringify({
      invoer: {
        bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', basisdatum: dag(300),
        ingebrekeGesteld: true, ingebrekestellingDatum: dag(90),
      },
      contact: {
        naam, email, adres: 'Teststraat 1', postcode: '1000 AA', woonplaats: 'Amsterdam',
        geboortedatum: '1980-01-01', bsn: '111222333', iban: 'NL91ABNA0417164300',
        machtiging: true, akkoordVoorwaarden: true,
      },
      herkomst: 'briefupload',
    }),
  });
  const tekst = await antwoord.text();
  assert.equal(antwoord.status, 201, tekst);
  return JSON.parse(tekst);
}

/** Logt in als klant door de koppeling te pakken die de funnel aanmaakte. */
async function logInAlsKlant(email) {
  const gebruikers = await opslag.rijen('gebruikers');
  const klant = gebruikers.find((g) => g.email === email.toLowerCase());
  assert.ok(klant, `geen account gevonden voor ${email}`);

  // In een test kunnen we geen mail lezen, dus vragen we gewoon een nieuwe aan.
  await haal('/api/mijn/link', { method: 'POST', body: JSON.stringify({ email }) });
  const { Gebruikers } = await import('../src/gebruikers.js');
  const { sessieSleutel } = await import('../src/sessie.js');
  const hulp = new Gebruikers({ opslag, sleutel: sessieSleutel(process.env) });
  const token = await hulp.maakKoppeling(klant.id, 'magic');

  const antwoord = await haal('/api/mijn/koppeling', {
    method: 'POST', body: JSON.stringify({ token }),
  });
  assert.equal(antwoord.status, 200, await antwoord.text());
  return antwoord.headers.getSetCookie()[0].split(';')[0];
}

test('de funnel maakt een account aan op het opgegeven e-mailadres', async () => {
  const uitslag = await dienIn('een@voorbeeld.nl', 'Een Klant');
  assert.equal(uitslag.portaal, true, 'de klant hoort zijn zaak te kunnen volgen');

  const gebruikers = await opslag.rijen('gebruikers');
  const klant = gebruikers.find((g) => g.email === 'een@voorbeeld.nl');
  assert.ok(klant);
  assert.equal(klant.rol, 'klant');
  assert.equal(klant.wachtwoordHash, '', 'een klant heeft geen wachtwoord nodig');
});

test('zonder inloggen is er niets te zien', async () => {
  assert.equal((await haal('/api/mijn/dossiers')).status, 401);
});

test('met een koppeling uit de mail zie je je eigen zaak', async () => {
  const cookie = await logInAlsKlant('een@voorbeeld.nl');
  const data = await (await haal('/api/mijn/dossiers', { headers: { cookie } })).json();
  assert.equal(data.dossiers.length, 1);
  assert.equal(data.gebruiker.email, 'een@voorbeeld.nl');
  assert.equal(data.dossiers[0].invoer.bestuursorgaan, 'uwv');
});

test('een koppeling werkt maar één keer', async () => {
  const { Gebruikers } = await import('../src/gebruikers.js');
  const { sessieSleutel } = await import('../src/sessie.js');
  const hulp = new Gebruikers({ opslag, sleutel: sessieSleutel(process.env) });
  const klant = (await opslag.rijen('gebruikers')).find((g) => g.email === 'een@voorbeeld.nl');
  const token = await hulp.maakKoppeling(klant.id, 'magic');

  assert.equal((await haal('/api/mijn/koppeling', {
    method: 'POST', body: JSON.stringify({ token }),
  })).status, 200);
  assert.equal((await haal('/api/mijn/koppeling', {
    method: 'POST', body: JSON.stringify({ token }),
  })).status, 400);
});

test('een onbekend e-mailadres krijgt hetzelfde antwoord als een bekend', async () => {
  // Anders is met dit formulier uit te vragen wie er klant is.
  const bekend = await haal('/api/mijn/link', {
    method: 'POST', body: JSON.stringify({ email: 'een@voorbeeld.nl' }),
  });
  const onbekend = await haal('/api/mijn/link', {
    method: 'POST', body: JSON.stringify({ email: 'niemand@nergens.nl' }),
  });
  assert.equal(bekend.status, onbekend.status);
  assert.deepEqual(await bekend.json(), await onbekend.json());
});

test('de zaak van een ander is onzichtbaar, ook met het juiste dossier-id', async () => {
  await dienIn('twee@voorbeeld.nl', 'Twee Klant');
  const cookieEen = await logInAlsKlant('een@voorbeeld.nl');
  const cookieTwee = await logInAlsKlant('twee@voorbeeld.nl');

  const vanEen = await (await haal('/api/mijn/dossiers', { headers: { cookie: cookieEen } })).json();
  const vanTwee = await (await haal('/api/mijn/dossiers', { headers: { cookie: cookieTwee } })).json();
  assert.equal(vanEen.dossiers.length, 1);
  assert.equal(vanTwee.dossiers.length, 1);
  assert.notEqual(vanEen.dossiers[0].id, vanTwee.dossiers[0].id);

  // Klant twee probeert het dossier van klant een bij te werken.
  const stiekem = await haal(`/api/mijn/dossiers/${vanEen.dossiers[0].id}/gegevens`, {
    method: 'POST', headers: { cookie: cookieTwee }, body: JSON.stringify({ telefoon: '0600000000' }),
  });
  assert.equal(stiekem.status, 404, 'een dossier van een ander bestaat voor jou niet');
});

test('het portaal geeft nooit het burgerservicenummer of interne notities prijs', async () => {
  const cookie = await logInAlsKlant('een@voorbeeld.nl');
  const data = await (await haal('/api/mijn/dossiers', { headers: { cookie } })).json();
  const ruw = JSON.stringify(data);

  assert.ok(!ruw.includes('111222333'), 'het BSN hoort nooit naar het portaal te gaan');
  assert.ok(!ruw.includes('NL91ABNA0417164300'), 'het rekeningnummer ook niet');
  assert.equal(data.dossiers[0].contact.bsnBekend, true, 'wel dát het bekend is');
  assert.ok(!('historie' in data.dossiers[0]), 'de interne historie blijft binnen');
  assert.ok(!('notities' in data.dossiers[0]), 'interne notities al helemaal');
  assert.ok(!('handtekening' in data.dossiers[0]));
  assert.ok(!('brief' in data.dossiers[0]), 'de ingelezen brieftekst hoeft niet terug');
});

test('de klant vult zelf aan wat er ontbreekt, maar niet alles', async () => {
  const cookie = await logInAlsKlant('een@voorbeeld.nl');
  const voor = await (await haal('/api/mijn/dossiers', { headers: { cookie } })).json();
  const id = voor.dossiers[0].id;

  const antwoord = await haal(`/api/mijn/dossiers/${id}/gegevens`, {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({
      telefoon: '0301234567',
      woonplaats: 'Utrecht',
      // Deze twee horen genegeerd te worden: die corrigeert een behandelaar.
      bsn: '123456782',
      iban: 'NL02ABNA0123456789',
    }),
  });
  const tekst = await antwoord.text();
  assert.equal(antwoord.status, 200, tekst);
  const { dossier } = JSON.parse(tekst);
  assert.equal(dossier.contact.telefoon, '0301234567');
  assert.equal(dossier.contact.woonplaats, 'Utrecht');

  // In de opslag mag het BSN niet zijn meegegaan.
  const alle = await opslag.haalAlle();
  const opgeslagen = alle.find((a) => a.id === id);
  assert.equal(opgeslagen.contact.bsn, '111222333', 'het oude nummer staat er nog');
  assert.equal(opgeslagen.contact.iban, 'NL91ABNA0417164300');
});

test('uitloggen maakt de sessie ongeldig', async () => {
  const cookie = await logInAlsKlant('een@voorbeeld.nl');
  assert.equal((await haal('/api/mijn/dossiers', { headers: { cookie } })).status, 200);
  await haal('/api/mijn/uitloggen', { method: 'POST', headers: { cookie } });
  assert.equal((await haal('/api/mijn/dossiers', { headers: { cookie } })).status, 401);
});

test('een klantcookie geeft geen toegang tot de beheeromgeving', async () => {
  const cookie = await logInAlsKlant('een@voorbeeld.nl');
  // Het cookie heet anders, maar zelfs onder de beheernaam hoort het niets te doen.
  const alsBeheer = cookie.replace(/^nb_klant=/, 'nb_beheer=');
  assert.equal((await haal('/api/beheer/aanvragen', { headers: { cookie: alsBeheer } })).status, 401);
});
