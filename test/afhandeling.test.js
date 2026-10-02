/**
 * Het afhandelen van een dossier: brief erbij, in gebreke stellen, status.
 *
 * Dit is de kant van de medewerker. Een dossier dat uit een gesprek komt, komt
 * binnen zonder brief en zonder berekening; de stappen daarna bepalen of er
 * een vordering ontstaat of niet. Twee dingen mogen daarbij nooit gebeuren, en
 * daar gaan de meeste toetsen hieronder over:
 *
 * 1. Een datum die uit een brief gelezen is, mag niet buiten een mens om in
 *    het dossier belanden. Tekstherkenning haalt data door elkaar, en een
 *    verkeerde beslisdatum kost de aanvrager zijn hele vordering.
 * 2. Een ingebrekestelling die te vroeg de deur uit gaat, telt niet. Dan is de
 *    zaak niet verloren, maar het moet opnieuw - en dat ziet niemand terug.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'nubeslist-afhandeling-'));
process.env.DATA_DIR = tijdelijk;
process.env.SESSIE_GEHEIM = 'testgeheim-voor-het-afhandelen';
process.env.TARIEF_PERCENTAGE = '25';
process.env.BEDRIJF_NAAM = 'NuBeslist';
process.env.BEDRIJF_ADRES = 'Zuiderkade 12';
process.env.BEDRIJF_POSTCODE_PLAATS = '8302 AB  Emmeloord';
process.env.PORT = '0';
delete process.env.BEHEER_OPEN;

const { start, server, opslag } = await import('../server.js');
await start(0);
const basis = `http://127.0.0.1:${server.address().port}`;

const { logInAlsBeheerder } = await import('./hulp-inloggen.mjs');
const { cookie } = await logInAlsBeheerder(basis);

test.after(async () => {
  server.close();
  await fs.rm(tijdelijk, { recursive: true, force: true });
});

const BRIEF = await fs.readFile(
  new URL('../voorbeelden/uwv-ww-termijn-lang-verstreken.txt', import.meta.url), 'utf8',
);
const BRIEFLADING = {
  bestandsnaam: 'uwv-ww.txt',
  mediaType: 'text/plain',
  data: Buffer.from(BRIEF, 'utf8').toString('base64'),
};

const HANDTEKENING = { afbeelding: `data:image/png;base64,${'A'.repeat(300)}` };

/** Een dossier zoals het uit een WhatsApp-gesprek binnenkomt: leeg. */
async function nieuwDossier() {
  const gemaakt = await (await fetch(`${basis}/api/beheer/aanmeldlinks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ notitie: 'uit een gesprek' }),
  })).json();
  const token = new URL(gemaakt.url).searchParams.get('t');

  const ingediend = await (await fetch(`${basis}/api/aanmelden`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      t: token,
      naam: 'K. Bakker',
      geboortedatum: '1979-03-02',
      bsn: '111222333',
      iban: 'NL91ABNA0417164300',
      akkoord: true,
      handtekening: HANDTEKENING,
    }),
  })).json();

  const alle = await opslag.haalAlle();
  const dossier = alle.find((a) => a.referentie === ingediend.referentie);
  return dossier;
}

const api = (pad, opties = {}) => fetch(`${basis}/api/beheer/aanvragen/${pad}`, {
  ...opties,
  headers: { 'Content-Type': 'application/json', cookie, ...(opties.headers || {}) },
});

const lees = (id, lading = BRIEFLADING) => api(`${id}/brief-lezen`, {
  method: 'POST', body: JSON.stringify(lading),
});

const bijwerken = (id, body) => api(`${id}/bijwerken`, {
  method: 'POST', body: JSON.stringify(body),
});

/** Het dossier zoals het nu in de opslag staat. */
async function uitOpslag(id) {
  const alle = await opslag.haalAlle();
  return alle.find((a) => a.id === id);
}

// ------------------------------------------------- de brief laten lezen ----

test('alleen een medewerker kan een brief laten lezen', async () => {
  const dossier = await nieuwDossier();
  const zonder = await fetch(`${basis}/api/beheer/aanvragen/${dossier.id}/brief-lezen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(BRIEFLADING),
  });
  assert.equal(zonder.status, 401);
});

test('de brief komt in het dossier en levert een voorstel op', async () => {
  const dossier = await nieuwDossier();
  const antwoord = await lees(dossier.id);
  assert.equal(antwoord.status, 200);
  const data = await antwoord.json();

  // Wat er uit deze brief hoort te komen: de instantie, de soort zaak en de
  // twee datums waar de hele berekening op staat.
  assert.equal(data.voorstel.bestuursorgaan, 'uwv');
  assert.equal(data.voorstel.basisdatum, '2026-04-07');
  assert.equal(data.voorstel.termijnEinddatum, '2026-06-01');
  assert.equal(data.voorstel.termijnBekend, true);
  assert.ok(data.voorstel.zaaktype, 'de soort zaak hoort erbij te staan');

  // Het kenmerk van de instantie stond in de brief; dat hoeft niemand over te
  // tikken.
  assert.match(data.voorstelContact.kenmerk || '', /WW-2026-30912|456789123/);

  // En het bestand zelf hangt nu in het dossier.
  const bijgewerkt = await uitOpslag(dossier.id);
  assert.equal(bijgewerkt.bestanden.length, 1);
  assert.equal(bijgewerkt.bestanden[0].bestandsnaam, 'uwv-ww.txt');
  assert.equal(bijgewerkt.bestanden[0].stukId, 'termijnbrief');
});

test('wat de lezer vindt, verandert nog niets in het dossier', async () => {
  // Hier zit het hele verschil tussen een hulpmiddel en een risico: de
  // behandelaar ziet eerst wat er gevonden is en drukt daarna zelf op
  // overnemen.
  const dossier = await nieuwDossier();
  await lees(dossier.id);
  const na = await uitOpslag(dossier.id);
  assert.deepEqual(na.invoer, {}, 'de invoer is ongevraagd gevuld');
  assert.equal(na.rapport, null, 'er is ongevraagd gerekend');
});

test('het proefrapport laat zien wat de zaak zou worden', async () => {
  const dossier = await nieuwDossier();
  const data = await (await lees(dossier.id)).json();
  assert.ok(data.proefrapport, 'er hoort een proefberekening bij');
  assert.ok(data.proefrapport.kop, 'zonder kop staat er niets op het scherm');
  assert.equal(data.proefrapport.uitkomst, 'ingebrekestelling-nodig',
    'deze termijn is ruim verstreken, dus de volgende stap is de ingebrekestelling');
});

test('wat een mens heeft ingevuld, wint van wat een machine leest', async () => {
  const dossier = await nieuwDossier();
  const gezet = await bijwerken(dossier.id, { invoer: { basisdatum: '2026-04-01' } });
  assert.equal(gezet.status, 200);

  const data = await (await lees(dossier.id)).json();
  assert.ok(!('basisdatum' in data.voorstel), 'de brief overschrijft de ingevulde datum');
  assert.equal(data.voorstel.termijnEinddatum, '2026-06-01', 'de lege velden komen er wel bij');
});

test('overnemen vult het dossier en rekent het door', async () => {
  const dossier = await nieuwDossier();
  const data = await (await lees(dossier.id)).json();
  const antwoord = await bijwerken(dossier.id, {
    invoer: data.voorstel, contact: data.voorstelContact, toelichting: 'Overgenomen uit de brief.',
  });
  assert.equal(antwoord.status, 200);
  const na = await uitOpslag(dossier.id);

  // Instantie en soort zaak zijn de twee velden die eerder stil wegvielen:
  // zonder die twee valt er niets te rekenen en weet de brief niet of er een
  // burgerservicenummer bij hoort.
  assert.equal(na.invoer.bestuursorgaan, 'uwv');
  assert.ok(na.invoer.zaaktype);
  assert.equal(na.invoer.termijnEinddatum, '2026-06-01');
  assert.equal(na.rapport.uitkomst, 'ingebrekestelling-nodig');
  assert.ok(na.historie.some((h) => /brief/i.test(h.tekst)));
});

test('een dossier dat gaat lopen, schuift zelf naar In behandeling', async () => {
  // Met de hand bijzetten werd vergeten, en een dossier met de verkeerde
  // status komt niet terug op de werklijst.
  const dossier = await nieuwDossier();
  assert.equal(dossier.status, 'nieuw');
  const data = await (await lees(dossier.id)).json();
  await bijwerken(dossier.id, { invoer: data.voorstel });

  const na = await uitOpslag(dossier.id);
  assert.equal(na.status, 'in-behandeling');
  assert.ok(na.historie.some((h) => /Status van Nieuw naar In behandeling/.test(h.tekst)));

  // En daarna niet meer: een status die een mens heeft gezet, blijft staan.
  await fetch(`${basis}/api/beheer/aanvragen/${dossier.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ status: 'stukken-opgevraagd' }),
  });
  await bijwerken(dossier.id, { toelichting: 'Nog eens doorgerekend.' });
  assert.equal((await uitOpslag(dossier.id)).status, 'stukken-opgevraagd');
});

test('een verzonnen instantie of soort zaak komt er niet in', async () => {
  const dossier = await nieuwDossier();
  const antwoord = await bijwerken(dossier.id, { invoer: { bestuursorgaan: 'ministerie-van-niets' } });
  assert.equal(antwoord.status, 422);
  assert.ok((await antwoord.json()).velden.bestuursorgaan);

  const tweede = await bijwerken(dossier.id, { invoer: { zaaktype: 'iets-anders' } });
  assert.equal(tweede.status, 422);
});

// ---------------------------------------------- de ingebrekestelling -------

/** Een dossier dat klaar is om in gebreke te stellen. */
async function dossierKlaar() {
  const dossier = await nieuwDossier();
  const data = await (await lees(dossier.id)).json();
  await bijwerken(dossier.id, { invoer: data.voorstel, contact: data.voorstelContact });
  await bijwerken(dossier.id, {
    contact: { adres: 'Molenweg 88', postcode: '7511 AB', woonplaats: 'Enschede' },
  });
  return uitOpslag(dossier.id);
}

test('de brief is alleen voor ingelogde medewerkers', async () => {
  const dossier = await dossierKlaar();
  const zonder = await fetch(`${basis}/api/beheer/aanvragen/${dossier.id}/ingebrekestelling`);
  assert.equal(zonder.status, 401);
});

test('de ingebrekestelling staat op papier met de datums uit het dossier', async () => {
  const dossier = await dossierKlaar();
  const html = await (await api(`${dossier.id}/ingebrekestelling`)).text();
  assert.match(html, /Ingebrekestelling wegens niet tijdig beslissen/);
  assert.ok(html.includes(dossier.referentie));
  assert.match(html, /1 juni 2026/, 'de beslisdatum uit de brief hoort erin te staan');
  assert.match(html, /K\. Bakker/);
  assert.match(html, /Molenweg 88/);
  assert.match(html, /111222333/, 'UWV zoekt de zaak op met dit nummer');
  assert.match(html, /artikel 4:17/);
  assert.ok(!/Nog niet compleet/.test(html), 'dit dossier is compleet');
  assert.ok(!/nog te vroeg/i.test(html), 'deze termijn is verstreken');
});

test('de brief noemt de bedragen uit de wet en verzint er geen', async () => {
  // Deze bedragen staan in artikel 4:17 Awb. Een brief die een ander bedrag
  // noemt - of 'undefined', wat hier echt in heeft gestaan - is geen brief
  // waarmee iemand iets kan.
  const { TARIEF, euro } = await import('../public/shared/dwangsom.js');
  const dossier = await dossierKlaar();
  const html = await (await api(`${dossier.id}/ingebrekestelling`)).text();

  assert.ok(!/undefined|NaN/.test(html), 'er staat een bedrag in dat nergens vandaan komt');
  for (const tranche of TARIEF.tranches) {
    assert.ok(html.includes(euro(tranche.perDag).replace('€ ', '')),
      `het bedrag van ${euro(tranche.perDag)} per dag hoort in de brief te staan`);
  }
  assert.ok(html.includes(euro(TARIEF.maxBedrag).replace('€ ', '')), 'het maximum hoort erin');
  assert.match(html, new RegExp(`${TARIEF.maxDagen} dagen`));
});

test('een brief met een gat erin zegt welk gegeven ontbreekt', async () => {
  // Liever een invulregel en een waarschuwing dan een gegokt nummer: een
  // verkeerd burgerservicenummer in deze brief maakt hem waardeloos.
  const dossier = await nieuwDossier();
  const data = await (await lees(dossier.id)).json();
  await bijwerken(dossier.id, { invoer: data.voorstel });
  const html = await (await api(`${dossier.id}/ingebrekestelling`)).text();
  assert.match(html, /Nog niet compleet/);
  assert.match(html, /Adres/);
  assert.match(html, /\.{20,}/, 'een ontbrekend gegeven hoort een invulregel te zijn');
});

test('zonder verzenddatum wordt er niets vastgelegd', async () => {
  const dossier = await dossierKlaar();
  const antwoord = await api(`${dossier.id}/ingebrekestelling`, {
    method: 'POST', body: JSON.stringify({}),
  });
  assert.equal(antwoord.status, 422);
  assert.match((await antwoord.json()).fout, /datum/i);
});

test('te vroeg in gebreke stellen wordt tegengehouden', async () => {
  const dossier = await nieuwDossier();
  const over = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  await bijwerken(dossier.id, {
    invoer: {
      bestuursorgaan: 'uwv', zaaktype: 'uwv-ww', basisdatum: '2026-09-01',
      termijnBekend: true, termijnEinddatum: over,
    },
    contact: { adres: 'Molenweg 88', postcode: '7511 AB', woonplaats: 'Enschede' },
  });

  const antwoord = await api(`${dossier.id}/ingebrekestelling`, {
    method: 'POST', body: JSON.stringify({ datum: '2026-10-01' }),
  });
  assert.equal(antwoord.status, 422);
  assert.match((await antwoord.json()).fout, /nog niet verstreken/);

  const na = await uitOpslag(dossier.id);
  assert.ok(!na.invoer.ingebrekeGesteld, 'er is toch iets vastgelegd');
  assert.notEqual(na.status, 'ingebrekestelling-verstuurd');
});

test('versturen legt de datum vast, rekent door en schuift de status mee', async () => {
  const dossier = await dossierKlaar();
  const antwoord = await api(`${dossier.id}/ingebrekestelling`, {
    method: 'POST', body: JSON.stringify({ datum: '2026-09-20' }),
  });
  assert.equal(antwoord.status, 200);

  const na = await uitOpslag(dossier.id);
  assert.equal(na.invoer.ingebrekeGesteld, true);
  assert.equal(na.invoer.ingebrekestellingDatum, '2026-09-20');
  assert.equal(na.invoer.ingebrekestellingDoorOns, true);
  assert.equal(na.status, 'ingebrekestelling-verstuurd');
  assert.ok(na.historie.some((h) => h.tekst.includes('2026-09-20')),
    'het dossier hoort te laten zien wanneer de brief de deur uit ging');

  // De klok loopt nu: de berekening hoort vanaf deze datum te rekenen.
  assert.equal(na.rapport.invoer.ingebrekestellingDatum, '2026-09-20');
});

test('een onvolledig dossier kan alleen met opzet toch de deur uit', async () => {
  const dossier = await nieuwDossier();
  const data = await (await lees(dossier.id)).json();
  await bijwerken(dossier.id, { invoer: data.voorstel });

  const geweigerd = await api(`${dossier.id}/ingebrekestelling`, {
    method: 'POST', body: JSON.stringify({ datum: '2026-09-20' }),
  });
  assert.equal(geweigerd.status, 422);
  assert.ok((await geweigerd.json()).ontbreekt.includes('Adres'));

  const toch = await api(`${dossier.id}/ingebrekestelling`, {
    method: 'POST', body: JSON.stringify({ datum: '2026-09-20', tochDoorgaan: true }),
  });
  assert.equal(toch.status, 200);
  assert.equal((await uitOpslag(dossier.id)).status, 'ingebrekestelling-verstuurd');
});

// ------------------------------------------------------------ geen breuk ---

test('de brief die wij zelf opstellen blijft werken', async () => {
  // Deze route heette eerder net zo als die van het inlezen; dan wint er één
  // en verdwijnt de ander zonder foutmelding.
  const dossier = await dossierKlaar();
  const opgesteld = await api(`${dossier.id}/brief`, {
    method: 'POST', body: JSON.stringify({ soort: 'ingebrekestelling' }),
  });
  assert.equal(opgesteld.status, 200);
  const na = await uitOpslag(dossier.id);
  assert.ok(na.bestanden.some((b) => b.stukId === 'correspondentie'),
    'de opgestelde brief hoort in het dossier te blijven staan');

  const gedownload = await api(`${dossier.id}/brief?soort=claim`);
  assert.equal(gedownload.status, 200);
  assert.match(gedownload.headers.get('content-disposition') || '', /attachment/);
});
