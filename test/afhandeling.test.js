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

const { start, server, opslag, store } = await import('../server.js');
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


/**
 * De tekst uit een pdf halen.
 *
 * Onze pdf's zijn niet gecomprimeerd en zetten elke regel als een losse string
 * in de tekenstroom. Dat is genoeg om te controleren wat er in de brief staat,
 * en het controleert het échte bestand - niet een tussenvorm die de behandelaar
 * nooit onder ogen krijgt.
 */
function pdfTekst(buffer) {
  const ruw = Buffer.from(buffer).toString('latin1');
  const stukken = [...ruw.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)].map((m) => m[1]
    .replace(/\\(\d{3})/g, (_, octaal) => String.fromCharCode(parseInt(octaal, 8)))
    .replace(/\\([()\\])/g, '$1'));
  return Buffer.from(stukken.join(' '), 'latin1').toString('latin1').replace(/\s+/g, ' ');
}

const briefVan = async (id, pad = '/ingebrekestelling') => {
  const antwoord = await api(`${id}${pad}`);
  const buffer = Buffer.from(await antwoord.arrayBuffer());
  return { antwoord, buffer, tekst: pdfTekst(buffer) };
};

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
    contact: {
      adres: 'Molenweg 88', postcode: '7511 AB', woonplaats: 'Enschede', telefoon: '06 12345678',
    },
  });
  return uitOpslag(dossier.id);
}

/*
 * Toetsen die alleen lézen, delen één dossier. Elke aanmelding telt mee in de
 * snelheidsbegrenzer op het indienen, en die zit er niet voor niets: hij moet
 * in de toetsen net zo hard staan als in het echt.
 */
let gedeeld = null;
async function dossierKlaarGedeeld() {
  if (!gedeeld) gedeeld = await dossierKlaar();
  return gedeeld;
}

test('de brief is alleen voor ingelogde medewerkers', async () => {
  const dossier = await dossierKlaarGedeeld();
  const zonder = await fetch(`${basis}/api/beheer/aanvragen/${dossier.id}/ingebrekestelling`);
  assert.equal(zonder.status, 401);
});

test('de brief opent als pdf, kant-en-klaar', async () => {
  /*
   * Een pdf en geen webpagina: een browser zet bij het afdrukken zijn eigen
   * kop- en voetregels erbij, met de datum en het webadres erin, en dat hoort
   * niet op een brief die namens iemand anders de deur uit gaat.
   */
  const dossier = await dossierKlaarGedeeld();
  const { antwoord, buffer, tekst } = await briefVan(dossier.id);

  assert.equal(antwoord.status, 200);
  assert.match(antwoord.headers.get('content-type') || '', /application\/pdf/);
  assert.match(antwoord.headers.get('content-disposition') || '', /^inline/,
    'de brief hoort te openen, niet in de map Downloads te belanden');
  assert.equal(buffer.slice(0, 5).toString(), '%PDF-');

  assert.match(tekst, /Ingebrekestelling wegens niet tijdig beslissen/);
  assert.match(tekst, /1 juni 2026/, 'de beslisdatum hoort erin te staan');
  assert.match(tekst, /K\. Bakker/);
  assert.match(tekst, /Molenweg 88/);
  assert.match(tekst, /111222333/, 'UWV zoekt de zaak op met dit nummer');
  assert.match(tekst, /artikel 4:17/);
});

test('de brief is van de aanvrager en noemt ons nergens', async () => {
  /*
   * Dit is een keuze met gevolgen. Zou de brief namens ons ondertekend worden,
   * dan moet er een machtiging mee en krijgt de instantie te zien wat wij met
   * de aanvrager hebben afgesproken. Nu is het een brief van hemzelf, die wij
   * alleen afdrukken en op de post doen.
   */
  const dossier = await dossierKlaarGedeeld();
  const { tekst } = await briefVan(dossier.id);

  assert.ok(!/NuBeslist/i.test(tekst), 'onze naam staat in de brief');
  assert.ok(!/machtiging/i.test(tekst), 'er wordt naar een machtiging verwezen');
  assert.ok(!/namens/i.test(tekst), 'de brief zegt dat hij namens iemand wordt verstuurd');
  assert.ok(!/gemachtigde/i.test(tekst));

  // Wat er wél onder staat: de naam van de aanvrager, getypt. Niets om met de
  // hand te zetten voordat de envelop dichtkan.
  assert.match(tekst, /Met vriendelijke groet, K\. Bakker/);
  assert.match(tekst, /Enschede, \d{1,2} \w+ 20\d\d/, 'plaats en datum van de aanvrager');
});

test('de brief noemt de bedragen uit de wet en verzint er geen', async () => {
  // Deze bedragen staan in artikel 4:17 Awb. Een brief die een ander bedrag
  // noemt - of 'undefined', wat hier echt in heeft gestaan - is geen brief
  // waarmee iemand iets kan.
  const { TARIEF, euro } = await import('../public/shared/dwangsom.js');
  const dossier = await dossierKlaarGedeeld();
  const html = await (await api(`${dossier.id}/ingebrekestelling`)).text();

  assert.ok(!/undefined|NaN/.test(html), 'er staat een bedrag in dat nergens vandaan komt');
  for (const tranche of TARIEF.tranches) {
    assert.ok(html.includes(euro(tranche.perDag).replace('€ ', '')),
      `het bedrag van ${euro(tranche.perDag)} per dag hoort in de brief te staan`);
  }
  assert.ok(html.includes(euro(TARIEF.maxBedrag).replace('€ ', '')), 'het maximum hoort erin');
  assert.match(html, new RegExp(`${TARIEF.maxDagen} dagen`));
});

test('een brief met een gat erin verzint niets, en gaat niet de deur uit', async () => {
  // Liever een zichtbare invulregel dan een gegokt nummer: een verkeerd
  // burgerservicenummer in deze brief maakt hem waardeloos. En hij kan niet
  // als verstuurd worden vastgelegd zolang het gat er zit.
  const dossier = await nieuwDossier();
  const data = await (await lees(dossier.id)).json();
  await bijwerken(dossier.id, { invoer: data.voorstel });

  const { tekst } = await briefVan(dossier.id);
  assert.match(tekst, /\.{20,}/, 'een ontbrekend gegeven hoort een invulregel te zijn');

  const geweigerd = await api(`${dossier.id}/ingebrekestelling`, {
    method: 'POST', body: JSON.stringify({ datum: '2026-09-20' }),
  });
  assert.equal(geweigerd.status, 422);
  assert.ok((await geweigerd.json()).ontbreekt.includes('Adres'));
});

test('zonder verzenddatum wordt er niets vastgelegd', async () => {
  const dossier = await dossierKlaarGedeeld();
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
    contact: {
      adres: 'Molenweg 88', postcode: '7511 AB', woonplaats: 'Enschede', telefoon: '06 12345678',
    },
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

// -------------------------------------------- het lijstje dat UWV publiceert --

/*
 * UWV zet op zijn eigen site wat er in een melding per brief moet staan. Wij
 * sturen onze eigen ingebrekestelling in plaats van hun formulier, en dat mag:
 * een ingebrekestelling is vormvrij. Maar dan moet die brief wél alles bevatten
 * wat zij noemen, anders is het alsnog onvolledig en begint de klok niet te
 * lopen. Vandaar deze toets, met hun eigen woorden als meetlat:
 *
 *   - De datum.
 *   - Uw naam en adres.
 *   - Uw burgerservicenummer.
 *   - Uw telefoonnummer.
 *   - Voor welke aanvraag of welk bezwaar wij te laat zijn met beslissen.
 *   - De datum waarop u de aanvraag heeft gedaan of het bezwaar heeft gemaakt.
 *   - Uw rekeningnummer waarop u de vergoeding wilt ontvangen.
 *
 * Het laatste punt van hun lijst (loonheffingennummer) geldt alleen voor
 * werkgevers; onze aanvragers zijn particulieren.
 */
test('de ingebrekestelling bevat alles wat UWV in een melding per brief eist', async () => {
  const dossier = await dossierKlaarGedeeld();
  const kaal = (await briefVan(dossier.id)).tekst;

  const eisen = [
    ['de datum', /\d{1,2} (januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december) 20\d\d/],
    ['de naam', /K\. Bakker/],
    ['het adres', /Molenweg 88/],
    ['de postcode en woonplaats', /7511 AB\s+Enschede/],
    ['het burgerservicenummer', /111222333/],
    ['het telefoonnummer', /06 12345678/],
    ['om welke aanvraag het gaat', /WW-aanvraag/],
    ['de datum van de aanvraag', /7 april 2026/],
    ['het rekeningnummer', /NL91 ?ABNA ?0417 ?1643 ?00/],
  ];
  for (const [wat, patroon] of eisen) {
    assert.match(kaal, patroon, `UWV vraagt om ${wat}; dat staat niet in de brief`);
  }

  // En hij gaat naar de postbus die UWV voor deze meldingen noemt.
  assert.match(kaal, /Postbus 58175/);
  assert.match(kaal, /1040 HD\s+AMSTERDAM/i);
});

test('een brief zonder telefoonnummer of rekeningnummer heet onvolledig', async () => {
  // Niet stilletjes versturen: het zijn precies de twee velden die wij eerder
  // niet eens vroegen, en zonder die twee voldoet de brief niet aan het lijstje.
  const dossier = await nieuwDossier();
  const data = await (await lees(dossier.id)).json();
  await bijwerken(dossier.id, {
    invoer: data.voorstel,
    contact: { adres: 'Molenweg 88', postcode: '7511 AB', woonplaats: 'Enschede' },
  });

  const antwoord = await api(`${dossier.id}/ingebrekestelling`, {
    method: 'POST', body: JSON.stringify({ datum: '2026-09-20' }),
  });
  assert.equal(antwoord.status, 422);
  assert.ok((await antwoord.json()).ontbreekt.includes('Telefoonnummer'));

  // In de brief staat op die plek een invulregel, geen verzonnen nummer.
  const { tekst } = await briefVan(dossier.id);
  assert.match(tekst, /Telefoonnummer \.{20,}/);
});

test('voor een andere instantie verzinnen wij geen postbus', async () => {
  // Alleen van UWV weten wij het adres zeker. Een gegokt postbusnummer laat de
  // brief op de verkeerde stapel belanden, en dat kost dagen.
  const dossier = await dossierKlaar();
  await bijwerken(dossier.id, { invoer: { bestuursorgaan: 'gemeente', zaaktype: 'gem-bijstand' } });
  const html = await (await api(`${dossier.id}/ingebrekestelling`)).text();
  assert.ok(!/58175/.test(html), 'het UWV-postbusnummer staat in een brief aan de gemeente');
  assert.match(html, /\.{20,}/, 'er hoort een invulregel voor het adres te staan');
});

test('er is maar één ingebrekestelling, waar je hem ook vandaan haalt', async () => {
  /*
   * Er waren er twee: de opgemaakte pagina bij stap 3, en een tekstversie
   * achter de downloadknop onder Correspondentie. Welke de deur uit ging, hing
   * af van welke knop een behandelaar toevallig aanklikte - en die tweede
   * noemde het burgerservicenummer niet, het rekeningnummer niet, en zette
   * "[Afdeling / postadres]" in plaats van een adres. Precies de gegevens
   * waarop UWV een melding beoordeelt.
   */
  const dossier = await dossierKlaarGedeeld();
  const stap3 = (await briefVan(dossier.id)).tekst;
  const download = await api(`${dossier.id}/brief?soort=ingebrekestelling`);
  const gedownload = Buffer.from(await download.arrayBuffer());

  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-type') || '', /application\/pdf/);
  assert.equal(pdfTekst(gedownload), stap3, 'de downloadknop geeft een andere brief dan stap 3');
  assert.ok(!/\[Afdeling/.test(stap3));

  // En wat er in het dossier bewaard wordt, is diezelfde brief.
  const bewaard = await api(`${dossier.id}/brief`, {
    method: 'POST', body: JSON.stringify({ soort: 'ingebrekestelling' }),
  });
  assert.equal(bewaard.status, 200);
  const na = await uitOpslag(dossier.id);
  const stuk = na.bestanden.find((b) => b.stukId === 'correspondentie');
  assert.match(stuk.bestandsnaam, /\.pdf$/);
  assert.equal(stuk.mediaType, 'application/pdf');
});

test('de claimbrief blijft gewone tekst', async () => {
  // Die is om in een e-mail te plakken, niet om af te drukken.
  const dossier = await dossierKlaarGedeeld();
  const antwoord = await api(`${dossier.id}/brief?soort=claim`);
  assert.equal(antwoord.status, 200);
  assert.match(antwoord.headers.get('content-type') || '', /text\/plain/);
  assert.match(antwoord.headers.get('content-disposition') || '', /\.txt/);
});

// ------------------------------------------- de kalender loopt vanzelf door --

/*
 * Wat hier misging: een dossier bleef "De beslistermijn loopt nog - het
 * bestuursorgaan heeft nog tot en met 12 oktober de tijd (7 dagen)" tonen, ook
 * op 13 oktober. Het rapport wordt namelijk bewaard zoals het was op de dag dat
 * iemand het liet uitrekenen, en niemand rekende opnieuw. Een scherm dat
 * gisteren gelijk had, is vandaag gewoon fout - en bij deze zaken hangt er een
 * stap aan vast die dan te laat wordt gezet.
 */

/**
 * Een dossier waarvan de termijn gisteren afliep, met een berekening van vorige
 * week erin.
 *
 * Precies de situatie die misging: op de dag van invoeren klopte het rapport,
 * en daarna liep de kalender door zonder dat iemand opnieuw rekende.
 */
async function dossierTermijnNetVoorbij() {
  /*
   * Rechtstreeks in de opslag, niet via het aanmeldformulier. Deze toetsen gaan
   * over de beheerkant, en elke aanmelding telt mee in de snelheidsbegrenzer op
   * het indienen - die hoort in de toetsen net zo hard te staan als in het echt.
   */
  const { berekenDwangsom } = await import('../public/shared/dwangsom.js');
  const dag = (dagen) => new Date(Date.now() + dagen * 86400000).toISOString().slice(0, 10);
  const invoer = {
    bestuursorgaan: 'uwv', zaaktype: 'uwv-ww', basisdatum: dag(-120),
    termijnBekend: true, termijnEinddatum: dag(-1),
  };
  // Het rapport zoals het er een week geleden uitzag: toen liep de termijn nog.
  const rapport = berekenDwangsom({ ...invoer, peildatum: dag(-8) });
  assert.equal(rapport.uitkomst, 'termijn-loopt',
    'de opzet klopt niet: het bewaarde rapport hoort achter te lopen');

  const dossier = await store.nieuweAanvraag({
    invoer,
    contact: {
      naam: 'K. Bakker', geboortedatum: '1979-03-02', bsn: '111222333',
      iban: 'NL91ABNA0417164300', adres: 'Molenweg 88', postcode: '7511 AB',
      woonplaats: 'Enschede', telefoon: '06 12345678',
    },
    rapport,
    stukken: {},
    handtekening: null,
    historieregel: 'Toetsdossier met een berekening van vorige week.',
    meta: {},
  });
  return dossier;
}

test('een dossier rekent zichzelf bij als de termijn voorbij is', async () => {
  const dossier = await dossierTermijnNetVoorbij();

  // Zo staat het in de opslag: de berekening van vorige week.
  assert.equal(dossier.rapport.uitkomst, 'termijn-loopt');

  // En zo komt het op het scherm: met de datum van vandaag.
  const data = await (await api(`${dossier.id}`)).json();
  assert.equal(data.aanvraag.rapport.uitkomst, 'ingebrekestelling-nodig',
    'de termijn is voorbij; dan is de volgende stap de ingebrekestelling');
  assert.ok(!/loopt nog/i.test(data.aanvraag.rapport.kop + data.aanvraag.rapport.samenvatting),
    'het scherm zegt nog steeds dat de termijn loopt');
});

test('ook in de lijst staat de stand van vandaag', async () => {
  const dossier = await dossierTermijnNetVoorbij();
  const lijst = await (await fetch(`${basis}/api/beheer/aanvragen`, { headers: { cookie } })).json();
  const regel = lijst.aanvragen.find((a) => a.referentie === dossier.referentie);
  assert.ok(regel, 'het dossier hoort in de lijst te staan');
  assert.equal(regel.uitkomst, 'ingebrekestelling-nodig');
});

test('een afgeronde zaak blijft staan zoals hij is vastgesteld', async () => {
  // Daar is het bedrag vastgesteld; dat hoort niet verder te tellen omdat er
  // een dag voorbijgaat.
  const dossier = await dossierTermijnNetVoorbij();
  await fetch(`${basis}/api/beheer/aanvragen/${dossier.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ status: 'toegekend' }),
  });
  const data = await (await api(`${dossier.id}`)).json();
  assert.equal(data.aanvraag.rapport.uitkomst, 'termijn-loopt',
    'bij een afgeronde zaak hoort de berekening te blijven staan zoals vastgesteld');
});

test('de dagelijkse ronde schrijft de nieuwe stand ook weg', async () => {
  // Het scherm rekent zelf bij, maar de werklijst, de soort van het dossier en
  // de cijfers lezen uit de opslag. Die hoort dus mee te schuiven.
  const { hernieuwBerekening } = await import('../src/bewaker.js');
  const dossier = await dossierTermijnNetVoorbij();
  assert.equal(dossier.rapport.uitkomst, 'termijn-loopt');

  const na = await hernieuwBerekening(dossier, { store });
  assert.equal(na.rapport.uitkomst, 'ingebrekestelling-nodig');
  assert.ok(na.historie.some((h) => /kalender/i.test(h.tekst)),
    'een wijziging die vanzelf gaat, hoort wel in de historie te staan');

  // En een tweede ronde op dezelfde dag schrijft niets meer.
  const regels = na.historie.length;
  const nogmaals = await hernieuwBerekening(na, { store });
  assert.equal(nogmaals.historie.length, regels, 'de ronde schrijft bij elke keer een regel');
});

test('een peildatum kan een dossier niet op een oude dag vastzetten', async () => {
  /*
   * Dit kwam bij het naspelen boven water. De knop "opnieuw doorrekenen" gaf de
   * meegestuurde invoer rechtstreeks door, inclusief een peildatum. Die werd
   * opgeslagen, en daarna rekende het dossier voor altijd met die dag - het
   * schoof dus nooit meer mee met de kalender, precies de fout die wij hier
   * aan het repareren waren.
   */
  const dossier = await dossierTermijnNetVoorbij();
  const terug = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  await api(`${dossier.id}/herbereken`, {
    method: 'POST',
    body: JSON.stringify({ invoer: { peildatum: terug }, toelichting: 'proef' }),
  });

  const na = await uitOpslag(dossier.id);
  assert.ok(!na.invoer.peildatum, 'er staat een peildatum in het dossier');

  const data = await (await api(`${dossier.id}`)).json();
  assert.equal(data.aanvraag.rapport.uitkomst, 'ingebrekestelling-nodig',
    'het dossier rekent met een oude dag in plaats van met vandaag');
});

test('de knop Verstuurd op meldt het ook aan de aanvrager', async () => {
  /*
   * Dit liep uiteen: wie de status met de hand omzette in de lijst, stuurde de
   * aanvrager een bericht; wie de knop "Verstuurd op" gebruikte - de bedoelde
   * weg - niet. Dan hangt het ervan af welke weg een behandelaar toevallig
   * neemt of iemand hoort dat zijn zaak is gemeld.
   */
  const bron = await fs.readFile(new URL('../server.js', import.meta.url), 'utf8');
  const blok = /if \(subpad === '\/ingebrekestelling' && req\.method === 'POST'\)[\s\S]*?\n    \}/
    .exec(bron);
  assert.ok(blok, 'de route hoort in server.js te staan');
  assert.match(blok[0], /meldAanKlant\(/,
    'het vastleggen van de verzending meldt niets aan de aanvrager');
});

test('het bericht over de verstuurde melding gaat maar één keer', async () => {
  // Zet een behandelaar de status nog eens om, dan hoort de aanvrager niet
  // twee keer hetzelfde te horen.
  const { bepaalBerichten, MOMENT } = await import('../src/bewaker.js');
  const dossier = {
    gebruikerId: 'g-1',
    referentie: 'DWS-2026-0001',
    contact: { naam: 'K. Bakker', email: 'k@voorbeeld.nl' },
    invoer: { bestuursorgaan: 'uwv' },
    rapport: { uitkomst: 'hersteltermijn-loopt' },
    status: 'ingebrekestelling-verstuurd',
    stukken: {},
    berichten: {},
    aangemaaktOp: new Date().toISOString(),
  };
  const eerste = bepaalBerichten(dossier);
  assert.ok(eerste.some((b) => b.sleutel === MOMENT.MELDING_VERSTUURD));

  const na = { ...dossier, berichten: { [MOMENT.MELDING_VERSTUURD]: { verstuurdOp: new Date().toISOString() } } };
  assert.ok(!bepaalBerichten(na).some((b) => b.sleutel === MOMENT.MELDING_VERSTUURD),
    'hetzelfde bericht gaat een tweede keer de deur uit');
});
