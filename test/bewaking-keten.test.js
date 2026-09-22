/**
 * De hele keten: een behandelaar zet een stap, de aanvrager hoort het.
 *
 * De losse onderdelen staan in bewaker.test.js. Wat daar niet in past is de
 * koppeling zelf: dat de statusroute de bewaker echt aanroept, dat er een
 * werkende inloglink in de mail komt, en dat dezelfde stap twee keer zetten
 * niet twee keer mailt. Dat laatste is de fout die je pas ziet als een klant
 * klaagt over drie identieke berichten.
 *
 * De mail gaat hier via het logboek (geen sleutel in de omgeving), dus wordt
 * `console.log` even opgevangen. Dat is meteen de echte verzendweg zoals die
 * lokaal en op een nieuwe omgeving werkt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'nubeslist-keten-'));
process.env.DATA_DIR = tijdelijk;
process.env.SESSIE_GEHEIM = 'testgeheim-voor-de-keten';
process.env.PORT = '0';
delete process.env.RESEND_API_KEY;
delete process.env.POSTMARK_API_KEY;
delete process.env.BEHEER_OPEN;

const { start, server } = await import('../server.js');
await start(0);
const basisUrl = `http://127.0.0.1:${server.address().port}`;

const { logInAlsBeheerder } = await import('./hulp-inloggen.mjs');
const { cookie } = await logInAlsBeheerder(basisUrl, { email: 'keten@nubeslist.nl' });

test.after(async () => {
  server.close();
  await fs.rm(tijdelijk, { recursive: true, force: true });
});

// De post opvangen die anders in de terminal zou belanden.
const postvak = [];
const echteLog = console.log;
console.log = (...args) => { postvak.push(args.join(' ')); };
test.after(() => { console.log = echteLog; });

const haal = (pad, opties = {}) => fetch(basisUrl + pad, {
  headers: { 'Content-Type': 'application/json', cookie, ...(opties.headers || {}) }, ...opties,
});

const dag = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function dienIn(email) {
  const antwoord = await fetch(`${basisUrl}/api/aanvragen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invoer: {
        bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', basisdatum: dag(200),
        ingebrekeGesteld: true, ingebrekestellingDatum: dag(40),
      },
      contact: {
        naam: 'K. Klant', email, adres: 'Werkstraat 2', postcode: '1000 AA',
        woonplaats: 'Amsterdam', geboortedatum: '1980-01-01', bsn: '111222333',
        iban: 'NL91ABNA0417164300', machtiging: true, akkoordVoorwaarden: true,
      },
      herkomst: 'funnel',
    }),
  });
  const tekst = await antwoord.text();
  assert.equal(antwoord.status, 201, tekst);
  const { referentie } = JSON.parse(tekst);
  const lijst = await (await haal(`/api/beheer/aanvragen?zoek=${referentie}`)).json();
  return lijst.aanvragen[0];
}

/** Wacht tot de post binnen is; het bericht gaat bewust naast het antwoord om. */
async function wachtOpPost(patroon, pogingen = 40) {
  for (let i = 0; i < pogingen; i++) {
    const treffer = postvak.filter((r) => patroon.test(r));
    if (treffer.length > 0) return treffer;
    await new Promise((r) => setTimeout(r, 25));
  }
  return [];
}

test('een verstuurde melding bereikt de aanvrager, met een werkende inloglink', async () => {
  const dossier = await dienIn('melding@voorbeeld.nl');
  postvak.length = 0;

  const antwoord = await haal(`/api/beheer/aanvragen/${dossier.id}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'ingebrekestelling-verstuurd' }),
  });
  assert.equal(antwoord.status, 200);

  const post = await wachtOpPost(/melding@voorbeeld\.nl/);
  assert.ok(post.length > 0, 'er had een bericht naar de aanvrager moeten gaan');
  const alles = post.join('\n') + '\n' + postvak.join('\n');
  assert.match(alles, /termijn voorbij|melding/i);

  // De knop in die mail moet ook echt ergens toe leiden.
  const link = /\/mijn\?t=([A-Za-z0-9._-]+)/.exec(postvak.join('\n'));
  assert.ok(link, 'de mail hoort een inloglink te bevatten');
  const ingelogd = await fetch(`${basisUrl}/api/mijn/koppeling`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: link[1] }),
  });
  assert.equal(ingelogd.status, 200, 'de link uit de mail hoort te werken');
});

test('dezelfde stap twee keer zetten mailt niet twee keer', async () => {
  const dossier = await dienIn('eenmaal@voorbeeld.nl');
  const tel = async () => {
    await wachtOpPost(/eenmaal@voorbeeld\.nl/);
    return postvak.filter((r) => r.includes('eenmaal@voorbeeld.nl')).length;
  };

  postvak.length = 0;
  await haal(`/api/beheer/aanvragen/${dossier.id}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'ingebrekestelling-verstuurd' }),
  });
  const na1 = await tel();
  assert.equal(na1, 1);

  // Heen en weer: de status verandert echt, dus de route doet zijn werk - maar
  // het moment is al gemeld en hoort niet opnieuw de deur uit te gaan.
  await haal(`/api/beheer/aanvragen/${dossier.id}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'in-behandeling' }),
  });
  await haal(`/api/beheer/aanvragen/${dossier.id}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'ingebrekestelling-verstuurd' }),
  });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await tel(), 1, 'het moment was al gemeld');
});

test('een toekenning meldt het bedrag dat is vastgelegd', async () => {
  const dossier = await dienIn('toegekend@voorbeeld.nl');
  postvak.length = 0;

  await haal(`/api/beheer/aanvragen/${dossier.id}/afhandeling`, {
    method: 'POST',
    body: JSON.stringify({ bedragToegekend: 1442, status: 'toegekend', beschikkingOp: dag(1) }),
  });

  const post = await wachtOpPost(/toegekend@voorbeeld\.nl/);
  assert.ok(post.length > 0, 'de aanvrager hoort te horen dat er is toegekend');
  assert.match(postvak.join('\n'), /Goed nieuws/i);
});

test('het dossier tekent aan wat er automatisch is verstuurd', async () => {
  const dossier = await dienIn('logboek@voorbeeld.nl');
  await haal(`/api/beheer/aanvragen/${dossier.id}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'ingebrekestelling-verstuurd' }),
  });
  await wachtOpPost(/logboek@voorbeeld\.nl/);
  await new Promise((r) => setTimeout(r, 150));

  const { aanvraag } = await (await haal(`/api/beheer/aanvragen/${dossier.id}`)).json();
  assert.ok(aanvraag.berichten && aanvraag.berichten['melding-verstuurd'],
    'de verzending hoort in het dossier te staan');
  assert.ok(aanvraag.berichten['melding-verstuurd'].verstuurdOp);
  assert.ok(aanvraag.historie.some((h) => /Automatisch bericht verstuurd/.test(h.tekst)),
    'de behandelaar hoort in de historie te zien dat er gemaild is');
});

test('het klantportaal geeft de verzendadministratie niet aan de klant', async () => {
  // `berichten` is intern. Het hoort bij dezelfde afspraak als notities en
  // historie: de klant krijgt zijn zaak, niet onze boekhouding erover.
  const dossier = await dienIn('privacy@voorbeeld.nl');
  await haal(`/api/beheer/aanvragen/${dossier.id}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'ingebrekestelling-verstuurd' }),
  });
  const post = await wachtOpPost(/privacy@voorbeeld\.nl/);
  assert.ok(post.length > 0);

  // De logboekregel met het adres en die met de knop zijn twee losse regels,
  // dus zoeken gaat over het hele postvak en niet over de treffer alleen.
  const links = [...postvak.join('\n').matchAll(/\/mijn\?t=([A-Za-z0-9._-]+)/g)];
  assert.ok(links.length > 0, 'er hoort een inloglink in de post te staan');
  const link = links[links.length - 1];
  const ingelogd = await fetch(`${basisUrl}/api/mijn/koppeling`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: link[1] }),
  });
  const klantCookie = ingelogd.headers.getSetCookie()[0].split(';')[0];
  const mijn = await (await fetch(`${basisUrl}/api/mijn/dossiers`, {
    headers: { cookie: klantCookie },
  })).json();
  const tekst = JSON.stringify(mijn);
  assert.ok(!tekst.includes('berichten'), 'berichten hoort niet in het portaal te staan');
  assert.ok(!tekst.includes('111222333'), 'het bsn hoort niet in het portaal te staan');
});
