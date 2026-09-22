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

test('een inloglink overleeft een tweede keer openen, maar niet lang', async () => {
  // Een link in een e-mail wordt zelden precies één keer opgehaald: mailapps
  // en scanners halen hem vooraf op, en mensen tikken twee keer. Werd hij bij
  // de eerste aanraking vernietigd, dan kreeg de klant die hem zelf opende
  // een inlogscherm met "deze link is al gebruikt". Precies dat gebeurde.
  const { Gebruikers, KOPPELING_COULANCE_MS } = await import('../src/gebruikers.js');
  const { sessieSleutel } = await import('../src/sessie.js');
  const hulp = new Gebruikers({ opslag, sleutel: sessieSleutel(process.env) });
  const klant = (await opslag.rijen('gebruikers')).find((g) => g.email === 'een@voorbeeld.nl');
  const token = await hulp.maakKoppeling(klant.id, 'magic');

  const inwisselen = () => haal('/api/mijn/koppeling', {
    method: 'POST', body: JSON.stringify({ token }),
  });

  assert.equal((await inwisselen()).status, 200);
  assert.equal((await inwisselen()).status, 200, 'binnen de coulanceperiode werkt hij nog');

  // Nu het eerste gebruik terugzetten tot voorbij de coulanceperiode.
  // De meest recent gebruikte koppeling van deze klant is de onze; eerdere
  // tests hebben er ook een paar aangemaakt.
  const rijen = await opslag.rijen('koppelingen');
  const deze = rijen
    .filter((r) => r.gebruikerId === klant.id && r.gebruiktOp)
    .sort((a, b) => b.gebruiktOp - a.gebruiktOp)[0];
  assert.ok(deze, 'de gebruikte koppeling hoort te bestaan');
  await opslag.zetRij('koppelingen', deze.id, {
    ...deze, gebruiktOp: Date.now() - KOPPELING_COULANCE_MS - 1000,
  });
  assert.equal((await inwisselen()).status, 400, 'daarna is hij op');
});

test('een uitnodiging blijft hard eenmalig', async () => {
  // Die geeft meer weg dan toegang tot je eigen dossier.
  const { Gebruikers } = await import('../src/gebruikers.js');
  const { sessieSleutel } = await import('../src/sessie.js');
  const hulp = new Gebruikers({ opslag, sleutel: sessieSleutel(process.env) });
  const klant = (await opslag.rijen('gebruikers')).find((g) => g.email === 'een@voorbeeld.nl');
  const token = await hulp.maakKoppeling(klant.id, 'uitnodiging');

  assert.ok(await hulp.verzilverKoppeling(token, 'uitnodiging'));
  assert.equal(await hulp.verzilverKoppeling(token, 'uitnodiging'), null);
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

// --------------------------------------------- stukken aanleveren ---------

test('het portaal vraagt precies de stukken die bij deze zaak horen', async () => {
  const cookie = await logInAlsKlant('een@voorbeeld.nl');
  const data = await (await haal('/api/mijn/dossiers', { headers: { cookie } })).json();
  const stukken = data.dossiers[0].stukken;

  assert.ok(Array.isArray(stukken) && stukken.length > 0, 'er hoort een lijst te zijn');
  const ids = stukken.map((s) => s.id);
  // Deze zaak is een aanvraag waarbij zelf in gebreke is gesteld.
  assert.ok(ids.includes('ontvangstbevestiging'), 'bewijs van de aanvraag');
  assert.ok(ids.includes('ingebrekestelling'), 'de eigen melding van de aanvrager');
  assert.ok(ids.includes('verzendbewijs'), 'en het verzendbewijs daarvan');
  // Een bezwaarstuk hoort hier juist niet bij: dit is geen bezwaarzaak.
  assert.ok(!ids.includes('bezwaarschrift'));
  for (const stuk of stukken) {
    assert.ok(stuk.label, 'elk stuk heeft een naam die de klant begrijpt');
    assert.equal(typeof stuk.binnen, 'boolean');
  }
});

test('een bezwaarzaak vraagt andere stukken dan een aanvraag', async () => {
  await haal('/api/aanvragen', {
    method: 'POST',
    body: JSON.stringify({
      invoer: {
        bestuursorgaan: 'uwv', zaaktype: 'uwv-bezwaar', basisdatum: dag(300),
        ingebrekeGesteld: true, ingebrekestellingDatum: dag(90),
      },
      contact: {
        naam: 'B. Bezwaar', email: 'bezwaar@voorbeeld.nl', adres: 'Teststraat 1',
        postcode: '1000 AA', woonplaats: 'Amsterdam', geboortedatum: '1980-01-01',
        bsn: '111222333', iban: 'NL91ABNA0417164300',
        machtiging: true, akkoordVoorwaarden: true,
      },
    }),
  });
  const cookie = await logInAlsKlant('bezwaar@voorbeeld.nl');
  const data = await (await haal('/api/mijn/dossiers', { headers: { cookie } })).json();
  const ids = data.dossiers[0].stukken.map((s) => s.id);

  assert.ok(ids.includes('primair-besluit'), 'het besluit waartegen bezwaar is gemaakt');
  assert.ok(ids.includes('bezwaarschrift'));
  assert.ok(!ids.includes('ontvangstbevestiging'), 'dat hoort bij een aanvraag, niet bij bezwaar');
});

test('de klant levert een stuk aan en het staat daarna als binnen', async () => {
  const cookie = await logInAlsKlant('een@voorbeeld.nl');
  const voor = await (await haal('/api/mijn/dossiers', { headers: { cookie } })).json();
  const dossier = voor.dossiers[0];
  const stuk = dossier.stukken.find((s) => !s.binnen);
  assert.ok(stuk, 'er hoort nog iets open te staan');

  const antwoord = await haal(`/api/mijn/dossiers/${dossier.id}/stuk`, {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({
      stukId: stuk.id,
      bestandsnaam: 'mijn-brief.pdf',
      mediaType: 'application/pdf',
      data: Buffer.from('%PDF-1.4 dit is een testbestand').toString('base64'),
    }),
  });
  const tekst = await antwoord.text();
  assert.equal(antwoord.status, 200, tekst);
  const bijgewerkt = JSON.parse(tekst).dossier.stukken.find((s) => s.id === stuk.id);
  assert.equal(bijgewerkt.binnen, true);
  assert.equal(bijgewerkt.bestanden.length, 1);
  assert.equal(bijgewerkt.bestanden[0].bestandsnaam, 'mijn-brief.pdf');
});

test('een aangeleverd bestand is terug te downloaden, maar niet door een ander', async () => {
  const cookie = await logInAlsKlant('een@voorbeeld.nl');
  const data = await (await haal('/api/mijn/dossiers', { headers: { cookie } })).json();
  const dossier = data.dossiers[0];
  const bestand = dossier.stukken.flatMap((s) => s.bestanden)[0];
  assert.ok(bestand, 'er hoort een bestand te staan');

  const eigen = await haal(`/api/mijn/dossiers/${dossier.id}/bestanden/${bestand.id}`, {
    headers: { cookie },
  });
  assert.equal(eigen.status, 200);
  assert.match(eigen.headers.get('content-disposition'), /attachment/,
    'nooit inline tonen; een geüpload bestand laten renderen is onnodig risico');

  const cookieAnder = await logInAlsKlant('twee@voorbeeld.nl');
  const vanAnder = await haal(`/api/mijn/dossiers/${dossier.id}/bestanden/${bestand.id}`, {
    headers: { cookie: cookieAnder },
  });
  assert.equal(vanAnder.status, 404, 'het dossier van een ander bestaat voor jou niet');
});

test('een stuk dat in deze zaak niet gevraagd wordt, wordt geweigerd', async () => {
  const cookie = await logInAlsKlant('een@voorbeeld.nl');
  const data = await (await haal('/api/mijn/dossiers', { headers: { cookie } })).json();
  const antwoord = await haal(`/api/mijn/dossiers/${data.dossiers[0].id}/stuk`, {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({ stukId: 'bezwaarschrift', bestandsnaam: 'x.pdf', data: 'eA==' }),
  });
  assert.equal(antwoord.status, 400);
  assert.match((await antwoord.json()).fout, /niet gevraagd/);
});

test('een te groot bestand wordt geweigerd met uitleg', async () => {
  const cookie = await logInAlsKlant('een@voorbeeld.nl');
  const data = await (await haal('/api/mijn/dossiers', { headers: { cookie } })).json();
  const dossier = data.dossiers[0];
  const antwoord = await haal(`/api/mijn/dossiers/${dossier.id}/stuk`, {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({
      stukId: dossier.stukken[0].id,
      bestandsnaam: 'groot.pdf',
      data: 'A'.repeat(5 * 1024 * 1024),
    }),
  });
  assert.equal(antwoord.status, 413);
  assert.match((await antwoord.json()).fout, /3 MB/);
});

test('nieuwe post van de instantie mag altijd geüpload worden', async () => {
  // Dit is geen gevraagd stuk maar een open bak: krijgt iemand rechtstreeks
  // een besluit, dan moeten wij dat weten zonder dat hij belt.
  const cookie = await logInAlsKlant('een@voorbeeld.nl');
  const data = await (await haal('/api/mijn/dossiers', { headers: { cookie } })).json();
  const dossier = data.dossiers[0];

  const antwoord = await haal(`/api/mijn/dossiers/${dossier.id}/stuk`, {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({
      stukId: 'nieuwe-post',
      bestandsnaam: 'besluit-van-uwv.pdf',
      mediaType: 'application/pdf',
      data: Buffer.from('%PDF-1.4 een besluit').toString('base64'),
    }),
  });
  const tekst = await antwoord.text();
  assert.equal(antwoord.status, 200, tekst);

  const bijgewerkt = JSON.parse(tekst).dossier;
  assert.equal(bijgewerkt.nieuwePost.length, 1);
  assert.equal(bijgewerkt.nieuwePost[0].bestandsnaam, 'besluit-van-uwv.pdf');
  // En hij hoort niet tussen de gevraagde stukken te gaan staan.
  assert.ok(!bijgewerkt.stukken.some((s) => s.id === 'nieuwe-post'));
});

test('nieuwe post is voor de klant terug te lezen', async () => {
  const cookie = await logInAlsKlant('een@voorbeeld.nl');
  const data = await (await haal('/api/mijn/dossiers', { headers: { cookie } })).json();
  const dossier = data.dossiers[0];
  const bestand = dossier.nieuwePost[0];
  assert.ok(bestand, 'de zojuist geüploade post hoort er te staan');

  const antwoord = await haal(`/api/mijn/dossiers/${dossier.id}/bestanden/${bestand.id}`, {
    headers: { cookie },
  });
  assert.equal(antwoord.status, 200);
  assert.match(antwoord.headers.get('content-disposition'), /attachment/);
});

test('wie ook medewerker is, komt wel in zijn eigen dossier', async () => {
  // Zo kwam dit aan het licht: degene die de eerste beheerder aanmaakte deed
  // daarna met hetzelfde e-mailadres een testaanvraag. Die zaak werd aan zijn
  // bestaande account gehangen, de inloglink maakte een sessie voor dat
  // account, en het portaal wees hem af op zijn rol - zonder foutmelding,
  // alsof de link stuk was.
  const { Gebruikers } = await import('../src/gebruikers.js');
  const { sessieSleutel } = await import('../src/sessie.js');
  const hulp = new Gebruikers({ opslag, sleutel: sessieSleutel(process.env) });

  const klant = (await opslag.rijen('gebruikers')).find((g) => g.email === 'een@voorbeeld.nl');
  await opslag.zetRij('gebruikers', klant.id, { ...klant, rol: 'beheerder' });

  const token = await hulp.maakKoppeling(klant.id, 'magic');
  const inloggen = await haal('/api/mijn/koppeling', {
    method: 'POST', body: JSON.stringify({ token }),
  });
  assert.equal(inloggen.status, 200);
  const cookie = inloggen.headers.getSetCookie().join('; ');

  const sessie = await (await haal('/api/mijn/sessie', { headers: { cookie } })).json();
  assert.equal(sessie.ingelogd, true, `het portaal hoort hem binnen te laten (${sessie.detail})`);

  const data = await (await haal('/api/mijn/dossiers', { headers: { cookie } })).json();
  assert.ok(data.dossiers.length > 0, 'en hij ziet zijn eigen zaak');

  await opslag.zetRij('gebruikers', klant.id, klant);
});

test('het klantcookie geeft geen toegang tot de beheeromgeving', async () => {
  // De rolcontrole is uit het portaal gehaald; dan moet vaststaan dat dit
  // cookie niet alsnog ergens anders binnenkomt.
  const cookie = await logInAlsKlant('een@voorbeeld.nl');
  const beheer = await haal('/api/beheer/aanvragen', { headers: { cookie } });
  assert.equal(beheer.status, 401, 'de beheeromgeving vraagt een eigen cookie, met tweede factor');
});
