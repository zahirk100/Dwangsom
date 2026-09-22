/**
 * De beheeromgeving als werkbank: kan een behandelaar een dossier oppakken,
 * corrigeren, stappen vastleggen en afsluiten zonder de aanvrager te mailen?
 * Elke test hieronder staat voor precies zo'n handeling.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'dwangsom-behandeling-'));
process.env.DATA_DIR = tijdelijk;
process.env.BEHEER_WACHTWOORD = 'test-wachtwoord';
process.env.PORT = '0';

const { start, server } = await import('../server.js');
await start(0);
const basisUrl = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  server.close();
  await fs.rm(tijdelijk, { recursive: true, force: true });
});

const { logInAlsBeheerder } = await import('./hulp-inloggen.mjs');
const { cookie } = await logInAlsBeheerder(basisUrl);

function haal(pad, opties = {}) {
  return fetch(basisUrl + pad, {
    headers: { 'Content-Type': 'application/json', cookie, ...(opties.headers || {}) },
    ...opties,
  });
}

const vandaag = new Date();
const dagenGeleden = (n) => new Date(vandaag.getTime() - n * 86400000).toISOString().slice(0, 10);

/** Dient een dossier in zoals de funnel dat doet en geeft het dossier terug. */
async function dienIn({ invoer, contact }) {
  const antwoord = await fetch(`${basisUrl}/api/aanvragen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invoer: { bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', ...invoer },
      contact: {
        naam: 'B. Behandeling', email: 'b@voorbeeld.nl', adres: 'Werkstraat 2',
        postcode: '1000 AA', woonplaats: 'Amsterdam', geboortedatum: '1980-01-01',
        bsn: '111222333', iban: 'NL91ABNA0417164300',
        machtiging: true, akkoordVoorwaarden: true, ...contact,
      },
      herkomst: 'briefupload',
    }),
  });
  const tekst = await antwoord.text();
  assert.equal(antwoord.status, 201, tekst);
  const { referentie } = JSON.parse(tekst);
  const lijst = await (await haal(`/api/beheer/aanvragen?zoek=${referentie}`)).json();
  return lijst.aanvragen[0];
}

test('de behandelaar corrigeert gegevens zelf, in plaats van de aanvrager te mailen', async () => {
  const dossier = await dienIn({
    invoer: { basisdatum: dagenGeleden(200), ingebrekeGesteld: true, ingebrekestellingDatum: dagenGeleden(40) },
    contact: { naam: 'K. Krom', telefoon: '' },
  });

  const antwoord = await haal(`/api/beheer/aanvragen/${dossier.id}/bijwerken`, {
    method: 'POST',
    body: JSON.stringify({ contact: { naam: 'K. Recht', telefoon: '0301234567' } }),
  });
  assert.equal(antwoord.status, 200);
  const { aanvraag } = await antwoord.json();
  assert.equal(aanvraag.contact.naam, 'K. Recht');
  assert.equal(aanvraag.contact.telefoon, '0301234567');
  assert.equal(aanvraag.contact.email, 'b@voorbeeld.nl', 'wat niet is meegestuurd blijft staan');
  assert.match(aanvraag.historie.at(-1).tekst, /Gegevens bijgewerkt: naam, telefoon/);
});

test('een correctie met een onjuist BSN wordt per veld afgewezen en verandert niets', async () => {
  const dossier = await dienIn({ invoer: { basisdatum: dagenGeleden(200) } });

  const antwoord = await haal(`/api/beheer/aanvragen/${dossier.id}/bijwerken`, {
    method: 'POST',
    body: JSON.stringify({ contact: { bsn: '123456789' } }),
  });
  assert.equal(antwoord.status, 422);
  assert.match((await antwoord.json()).velden.bsn, /klopt niet/);

  const detail = await (await haal(`/api/beheer/aanvragen/${dossier.id}`)).json();
  assert.equal(detail.aanvraag.contact.bsn, '111222333', 'het oude nummer staat er nog');
});

test('velden die niet van de behandelaar zijn, worden genegeerd', async () => {
  const dossier = await dienIn({ invoer: { basisdatum: dagenGeleden(200) } });

  const antwoord = await haal(`/api/beheer/aanvragen/${dossier.id}/bijwerken`, {
    method: 'POST',
    body: JSON.stringify({ contact: { naam: 'B. Nieuw' }, status: 'toegekend', referentie: 'DWS-9999-9999' }),
  });
  assert.equal(antwoord.status, 200);
  const { aanvraag } = await antwoord.json();
  assert.equal(aanvraag.contact.naam, 'B. Nieuw');
  assert.equal(aanvraag.referentie, dossier.referentie, 'de referentie is niet te overschrijven');
  assert.notEqual(aanvraag.status, 'toegekend', 'status gaat via het statusveld, niet hierlangs');
});

test('een vastgelegde ingebrekestelling rekent het dossier opnieuw door en verzet de bewaakdatum', async () => {
  const dossier = await dienIn({ invoer: { basisdatum: dagenGeleden(200), ingebrekeGesteld: false } });
  assert.equal(dossier.soort, 'vooraanmelding');
  assert.equal(dossier.actieLabel, 'Ingebrekestelling versturen');

  const verstuurd = dagenGeleden(1);
  const antwoord = await haal(`/api/beheer/aanvragen/${dossier.id}/bijwerken`, {
    method: 'POST',
    body: JSON.stringify({
      invoer: { ingebrekeGesteld: true, ingebrekestellingDatum: verstuurd },
      toelichting: `Ingebrekestelling verstuurd op ${verstuurd}.`,
    }),
  });
  assert.equal(antwoord.status, 200);
  const { aanvraag } = await antwoord.json();
  assert.equal(aanvraag.invoer.ingebrekeGesteld, true);
  assert.equal(aanvraag.rapport.uitkomst, 'hersteltermijn-loopt');
  assert.ok(aanvraag.actiedatum > verstuurd, 'er wordt nu op de eerste dwangsomdag gewacht');
  assert.match(aanvraag.historie.at(-1).tekst, /Ingebrekestelling verstuurd/);
});

test('een vastgelegd besluit sluit de berekening af op de dag van het besluit', async () => {
  const dossier = await dienIn({
    invoer: { basisdatum: dagenGeleden(300), ingebrekeGesteld: true, ingebrekestellingDatum: dagenGeleden(90) },
  });
  assert.equal(dossier.uitkomst, 'recht');

  const besluit = dagenGeleden(2);
  const { aanvraag } = await (await haal(`/api/beheer/aanvragen/${dossier.id}/bijwerken`, {
    method: 'POST',
    body: JSON.stringify({
      invoer: { besluitGenomen: true, besluitDatum: besluit },
      toelichting: `Besluit ontvangen op ${besluit}.`,
    }),
  })).json();
  assert.equal(aanvraag.invoer.besluitGenomen, true);
  assert.equal(aanvraag.rapport.berekening.doorlopend, false, 'de teller staat stil');
  assert.ok(aanvraag.rapport.berekening.totaal > 0);
});

test('de afhandeling legt bedrag, datums en status vast en sluit het dossier', async () => {
  const dossier = await dienIn({
    invoer: { basisdatum: dagenGeleden(300), ingebrekeGesteld: true, ingebrekestellingDatum: dagenGeleden(90) },
  });

  const antwoord = await haal(`/api/beheer/aanvragen/${dossier.id}/afhandeling`, {
    method: 'POST',
    body: JSON.stringify({
      bedragToegekend: 1442, beschikkingOp: '2026-10-15', uitbetaaldOp: '2026-10-29',
      status: 'toegekend', toelichting: 'Volledig toegekend.',
    }),
  });
  assert.equal(antwoord.status, 200);
  const { aanvraag } = await antwoord.json();
  assert.equal(aanvraag.afhandeling.bedragToegekend, 1442);
  assert.equal(aanvraag.afhandeling.beschikkingOp, '2026-10-15');
  assert.equal(aanvraag.afhandeling.uitbetaaldOp, '2026-10-29');
  assert.equal(aanvraag.status, 'toegekend');
  assert.ok(aanvraag.historie.some((h) => /1442/.test(h.tekst)), 'het bedrag staat in de historie');

  const lijst = await (await haal(`/api/beheer/aanvragen?zoek=${aanvraag.referentie}`)).json();
  assert.equal(lijst.aanvragen[0].bedragToegekend, 1442, 'de lijst toont het toegekende bedrag');
  assert.ok(lijst.statistieken.toegekendBedrag >= 1442, 'het telt mee in de kengetallen');
});

test('een onzinnige datum in de afhandeling wordt niet opgeslagen', async () => {
  const dossier = await dienIn({ invoer: { basisdatum: dagenGeleden(200) } });
  const { aanvraag } = await (await haal(`/api/beheer/aanvragen/${dossier.id}/afhandeling`, {
    method: 'POST',
    body: JSON.stringify({ bedragToegekend: 'veel', beschikkingOp: 'morgen', status: 'onbekend' }),
  })).json();
  assert.equal(aanvraag.afhandeling.bedragToegekend, null);
  assert.equal(aanvraag.afhandeling.beschikkingOp, '');
  assert.notEqual(aanvraag.status, 'onbekend');
});

test('de werklijst toont alleen dossiers waarvan de bewaakdatum is bereikt', async () => {
  const nu = await dienIn({
    invoer: { basisdatum: dagenGeleden(300), ingebrekeGesteld: true, ingebrekestellingDatum: dagenGeleden(90) },
    contact: { naam: 'W. Werklijst' },
  });
  const later = await dienIn({
    invoer: { basisdatum: dagenGeleden(200), ingebrekeGesteld: true, ingebrekestellingDatum: dagenGeleden(1) },
    contact: { naam: 'L. Later' },
  });
  assert.ok(later.actiedatum > new Date().toISOString().slice(0, 10), 'die datum ligt nog voor ons');

  const werklijst = await (await haal('/api/beheer/aanvragen?actie=nodig')).json();
  const ids = werklijst.aanvragen.map((a) => a.id);
  assert.ok(ids.includes(nu.id), 'wat vandaag moet, staat erin');
  assert.ok(!ids.includes(later.id), 'wat later moet, staat er niet in');

  const datums = werklijst.aanvragen.map((a) => a.actiedatum);
  assert.deepEqual(datums, [...datums].sort(), 'het oudste werk staat bovenaan');
});

test('een afgehandeld dossier valt uit de werklijst, ook als de datum is bereikt', async () => {
  const dossier = await dienIn({
    invoer: { basisdatum: dagenGeleden(300), ingebrekeGesteld: true, ingebrekestellingDatum: dagenGeleden(90) },
    contact: { naam: 'A. Afgerond' },
  });
  const voor = await (await haal('/api/beheer/aanvragen?actie=nodig')).json();
  assert.ok(voor.aanvragen.some((a) => a.id === dossier.id));

  await haal(`/api/beheer/aanvragen/${dossier.id}/afhandeling`, {
    method: 'POST', body: JSON.stringify({ bedragToegekend: 500, status: 'toegekend' }),
  });

  const na = await (await haal('/api/beheer/aanvragen?actie=nodig')).json();
  assert.ok(!na.aanvragen.some((a) => a.id === dossier.id), 'afgehandeld werk komt niet terug');
});

test('een vooraanmelding die aanvraag wordt, meldt zelf welke gegevens nog ontbreken', async () => {
  // Bij een vooraanmelding treden wij nog niet op, dus het BSN is dan niet
  // verplicht. Zodra er wel opgetreden kan worden, moet het er zijn - en dat
  // hoort de behandelaar te zien zonder het dossier door te spitten.
  const dossier = await dienIn({
    invoer: { basisdatum: dagenGeleden(200), ingebrekeGesteld: false },
    contact: { naam: 'O. Onvolledig', bsn: '', geboortedatum: '' },
  });
  assert.equal(dossier.soort, 'vooraanmelding');
  assert.equal(dossier.gegevensOntbreken, 0, 'voor een vooraanmelding is dit nog niet nodig');

  const { aanvraag } = await (await haal(`/api/beheer/aanvragen/${dossier.id}/bijwerken`, {
    method: 'POST',
    body: JSON.stringify({
      invoer: {
        ingebrekeGesteld: true, ingebrekestellingDatum: dagenGeleden(60),
        ingebrekestellingDoorOns: true,
      },
      toelichting: 'Ingebrekestelling door ons verstuurd.',
    }),
  })).json();
  assert.equal(aanvraag.soort, 'aanvraag');

  const lijst = await (await haal(`/api/beheer/aanvragen?zoek=${dossier.referentie}`)).json();
  assert.ok(lijst.aanvragen[0].gegevensOntbreken >= 1, 'nu ontbreken BSN en geboortedatum wel');

  const detail = await (await haal(`/api/beheer/aanvragen/${dossier.id}`)).json();
  const ontbreekt = detail.eisen.gegevens.filter((g) => g.verplicht && !detail.aanvraag.contact[g.id]);
  assert.ok(ontbreekt.some((g) => g.id === 'bsn'), 'het BSN staat erbij');

  await haal(`/api/beheer/aanvragen/${dossier.id}/bijwerken`, {
    method: 'POST', body: JSON.stringify({ contact: { bsn: '111222333', geboortedatum: '1975-06-06' } }),
  });
  const naLijst = await (await haal(`/api/beheer/aanvragen?zoek=${dossier.referentie}`)).json();
  assert.equal(naLijst.aanvragen[0].gegevensOntbreken, 0, 'na aanvullen is het dossier compleet');
});

test('een ingebrekestelling die wij zelf verstuurden, wordt niet bij de aanvrager opgevraagd', async () => {
  const dossier = await dienIn({
    invoer: { basisdatum: dagenGeleden(200), ingebrekeGesteld: false },
    contact: { naam: 'Z. Zelf' },
  });

  await haal(`/api/beheer/aanvragen/${dossier.id}/bijwerken`, {
    method: 'POST',
    body: JSON.stringify({
      invoer: {
        ingebrekeGesteld: true, ingebrekestellingDatum: dagenGeleden(60),
        ingebrekestellingDoorOns: true,
      },
    }),
  });
  const ons = await (await haal(`/api/beheer/aanvragen/${dossier.id}`)).json();
  const vanKlant = ons.eisen.stukken.filter((st) => st.door === 'klant').map((st) => st.id);
  assert.ok(!vanKlant.includes('ingebrekestelling'), 'onze eigen brief wordt niet opgevraagd');
  assert.ok(!vanKlant.includes('verzendbewijs'), 'ons eigen verzendbewijs wordt niet opgevraagd');

  // Deed de aanvrager het zelf, dan moeten die twee stukken er wel komen.
  const zelf = await dienIn({
    invoer: {
      basisdatum: dagenGeleden(300), ingebrekeGesteld: true,
      ingebrekestellingDatum: dagenGeleden(90), ingebrekestellingDoorOns: false,
    },
    contact: { naam: 'E. Eigen' },
  });
  const eigen = await (await haal(`/api/beheer/aanvragen/${zelf.id}`)).json();
  const opvragen = eigen.eisen.stukken.filter((st) => st.door === 'klant').map((st) => st.id);
  assert.ok(opvragen.includes('ingebrekestelling'));
  assert.ok(opvragen.includes('verzendbewijs'));
});

test('de brief van de aanvrager telt als aangeleverd stuk, zodat niets ten onrechte ontbreekt', async () => {
  const antwoord = await fetch(`${basisUrl}/api/aanvragen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invoer: {
        bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', basisdatum: dagenGeleden(300),
        ingebrekeGesteld: true, ingebrekestellingDatum: dagenGeleden(90),
      },
      contact: {
        naam: 'S. Stukken', email: 's@voorbeeld.nl', adres: 'Briefstraat 1',
        postcode: '1000 AA', woonplaats: 'Amsterdam', geboortedatum: '1980-01-01',
        bsn: '111222333', iban: 'NL91ABNA0417164300', machtiging: true, akkoordVoorwaarden: true,
      },
      brief: { bron: 'pdf', bestandsnaam: 'brief.pdf', tekst: 'UWV ontvangstbevestiging' },
      handtekening: { afbeelding: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==', gezetOp: new Date().toISOString() },
      herkomst: 'briefupload',
    }),
  });
  const { referentie } = await antwoord.json();
  const lijst = await (await haal(`/api/beheer/aanvragen?zoek=${referentie}`)).json();
  const dossier = lijst.aanvragen[0];
  // De ingebrekestelling stelde de aanvrager zelf op, dus die twee stukken
  // horen wel gevraagd te worden; de brief uit de funnel niet meer.
  const detail = await (await haal(`/api/beheer/aanvragen/${dossier.id}`)).json();
  assert.equal(detail.aanvraag.stukken.ontvangstbevestiging, true, 'de brief uit de funnel telt mee');
  assert.equal(detail.aanvraag.stukken.machtiging, true, 'de digitale handtekening telt mee');
});
