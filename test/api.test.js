import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'dwangsom-test-'));
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

function haal(pad, opties = {}) {
  return fetch(basisUrl + pad, {
    headers: { 'Content-Type': 'application/json', ...(opties.headers || {}) },
    ...opties,
  });
}

const geldigeAanvraag = {
  invoer: {
    bestuursorgaan: 'uwv',
    zaaktype: 'uwv-wia',
    basisdatum: '2025-01-06',
    ingebrekeGesteld: true,
    ingebrekestellingDatum: '2025-04-01',
  },
  contact: { naam: 'T. Tester', email: 'tester@voorbeeld.nl', adres: 'Teststraat 1', postcode: '1234 AB', woonplaats: 'Testdorp', akkoordVoorwaarden: true },
};

test('de landingspagina en de wizard worden geserveerd', async () => {
  for (const pad of ['/', '/aanvraag', '/beheer', '/hoe-werkt-het']) {
    const antwoord = await haal(pad);
    assert.equal(antwoord.status, 200, `${pad} gaf ${antwoord.status}`);
    assert.match(antwoord.headers.get('content-type'), /text\/html/);
  }
});

test('de gedeelde rekenmodule is bereikbaar voor de browser', async () => {
  const antwoord = await haal('/shared/dwangsom.js');
  assert.equal(antwoord.status, 200);
  assert.match(antwoord.headers.get('content-type'), /javascript/);
});

test('padtraversal wordt geblokkeerd', async () => {
  const antwoord = await haal('/shared/../server.js');
  assert.equal(antwoord.status, 404);
});

test('een aanvraag indienen levert een referentienummer en een serverberekening op', async () => {
  const antwoord = await haal('/api/aanvragen', { method: 'POST', body: JSON.stringify(geldigeAanvraag) });
  assert.equal(antwoord.status, 201);
  const data = await antwoord.json();
  assert.match(data.referentie, /^DWS-\d{4}-\d{4}$/);
  assert.equal(data.rapport.uitkomst, 'recht');
  assert.equal(data.rapport.berekening.totaal, 1442);
});

test('een onvolledige aanvraag wordt geweigerd met veldfouten', async () => {
  const antwoord = await haal('/api/aanvragen', {
    method: 'POST',
    body: JSON.stringify({ invoer: { zaaktype: 'uwv-wia' }, contact: { naam: '', email: 'geen-adres' } }),
  });
  assert.equal(antwoord.status, 422);
  const data = await antwoord.json();
  assert.ok(data.velden.basisdatum);
  assert.ok(data.velden.naam);
  assert.ok(data.velden.email);
  assert.ok(data.velden.akkoordVoorwaarden);
});

test('de server vertrouwt de berekening van de client niet', async () => {
  const antwoord = await haal('/api/aanvragen', {
    method: 'POST',
    body: JSON.stringify({
      ...geldigeAanvraag,
      rapport: { uitkomst: 'recht', berekening: { totaal: 999999 } },
    }),
  });
  const data = await antwoord.json();
  assert.equal(data.rapport.berekening.totaal, 1442);
});

test('het beheerdeel is afgeschermd', async () => {
  const antwoord = await haal('/api/beheer/aanvragen');
  assert.equal(antwoord.status, 401);
});

test('inloggen met een onjuist wachtwoord mislukt', async () => {
  const antwoord = await haal('/api/beheer/login', { method: 'POST', body: JSON.stringify({ wachtwoord: 'fout' }) });
  assert.equal(antwoord.status, 401);
});

test('de beheerder ziet de aanvraag, wijzigt de status en voegt een notitie toe', async () => {
  const inlog = await haal('/api/beheer/login', { method: 'POST', body: JSON.stringify({ wachtwoord: 'test-wachtwoord' }) });
  assert.equal(inlog.status, 200);
  const cookie = inlog.headers.getSetCookie()[0].split(';')[0];
  const metCookie = { headers: { cookie } };

  const lijst = await (await haal('/api/beheer/aanvragen', metCookie)).json();
  assert.ok(lijst.aanvragen.length >= 1);
  const eerste = lijst.aanvragen[0];
  assert.equal(eerste.status, 'nieuw');
  assert.equal(eerste.bedrag, 1442);
  assert.ok(lijst.statistieken.totaalBedrag >= 1442);

  const gewijzigd = await (await haal(`/api/beheer/aanvragen/${eerste.id}`, {
    ...metCookie, method: 'PATCH', body: JSON.stringify({ status: 'in-behandeling' }),
  })).json();
  assert.equal(gewijzigd.aanvraag.status, 'in-behandeling');
  assert.equal(gewijzigd.aanvraag.historie.length, 2);

  const metNotitie = await (await haal(`/api/beheer/aanvragen/${eerste.id}/notities`, {
    ...metCookie, method: 'POST', body: JSON.stringify({ tekst: 'Gebeld met aanvrager.' }),
  })).json();
  assert.equal(metNotitie.aanvraag.notities[0].tekst, 'Gebeld met aanvrager.');

  const onbekendeStatus = await haal(`/api/beheer/aanvragen/${eerste.id}`, {
    ...metCookie, method: 'PATCH', body: JSON.stringify({ status: 'verzonnen' }),
  });
  assert.equal(onbekendeStatus.status, 400);

  const brief = await (await haal(`/api/beheer/aanvragen/${eerste.id}/brief?soort=claim`, metCookie)).text();
  assert.match(brief, /artikel 4:18/);
  assert.match(brief, /T\. Tester/);

  const csv = await (await haal('/api/beheer/export.csv', metCookie)).text();
  assert.match(csv, /referentie/);
  assert.match(csv, /tester@voorbeeld\.nl/);

  const filter = await (await haal('/api/beheer/aanvragen?zoek=bestaatniet', metCookie)).json();
  assert.equal(filter.aanvragen.length, 0);
});

test('de opgeslagen gegevens overleven een herstart van de applicatie', async () => {
  const ruw = JSON.parse(await fs.readFile(path.join(tijdelijk, 'aanvragen.json'), 'utf8'));
  assert.equal(ruw.versie, 1);
  assert.ok(ruw.aanvragen.length >= 1);
  assert.equal(ruw.aanvragen.at(-1).contact.email, 'tester@voorbeeld.nl');
});

test('een onbekend API-pad geeft 404', async () => {
  const antwoord = await haal('/api/bestaat-niet');
  assert.equal(antwoord.status, 404);
});

test('een zaak waarin nog niets te vorderen valt, wordt een vooraanmelding', async () => {
  const antwoord = await haal('/api/aanvragen', {
    method: 'POST',
    body: JSON.stringify({
      invoer: { bestuursorgaan: 'gemeente', zaaktype: 'gem-wmo', basisdatum: '2099-01-01' },
      contact: { naam: 'V. Vooraf', email: 'vooraf@voorbeeld.nl', akkoordVoorwaarden: true },
    }),
  });
  // Een datum in de toekomst is onvolledig; neem een zaak die net loopt.
  assert.equal(antwoord.status, 422);

  const recent = new Date();
  recent.setUTCDate(recent.getUTCDate() - 7);
  const tweede = await haal('/api/aanvragen', {
    method: 'POST',
    body: JSON.stringify({
      invoer: { bestuursorgaan: 'gemeente', zaaktype: 'gem-wmo', basisdatum: recent.toISOString().slice(0, 10) },
      contact: { naam: 'V. Vooraf', email: 'vooraf@voorbeeld.nl', akkoordVoorwaarden: true },
    }),
  });
  assert.equal(tweede.status, 201);
  const data = await tweede.json();
  assert.equal(data.soort, 'vooraanmelding');
  assert.equal(data.rapport.vervolg.kanNuIndienen, false);
});

test('een vooraanmelding vraagt geen adresgegevens, een aanvraag wel', async () => {
  const recent = new Date();
  recent.setUTCDate(recent.getUTCDate() - 7);

  // Zonder adres mag een vooraanmelding gewoon binnenkomen.
  const vooraf = await haal('/api/aanvragen', {
    method: 'POST',
    body: JSON.stringify({
      invoer: { bestuursorgaan: 'uwv', zaaktype: 'uwv-ww', basisdatum: recent.toISOString().slice(0, 10) },
      contact: { naam: 'Z. Zonder', email: 'z@voorbeeld.nl', akkoordVoorwaarden: true },
    }),
  });
  assert.equal(vooraf.status, 201);

  // Bij een lopende dwangsom is het adres wel nodig; dat hoort de server te zeggen.
  const zonderAdres = await haal('/api/aanvragen', {
    method: 'POST',
    body: JSON.stringify({
      invoer: {
        bestuursorgaan: 'uwv', zaaktype: 'uwv-wia', basisdatum: '2025-01-06',
        ingebrekeGesteld: true, ingebrekestellingDatum: '2025-04-01',
      },
      contact: { naam: 'Z. Zonder', email: 'z@voorbeeld.nl', akkoordVoorwaarden: true },
    }),
  });
  assert.equal(zonderAdres.status, 422);
  const fouten = (await zonderAdres.json()).velden;
  assert.ok(fouten.adres && fouten.postcode && fouten.woonplaats);
});

test('de beheerder kan op soort filteren en de stukken bijwerken', async () => {
  const inlog = await haal('/api/beheer/login', { method: 'POST', body: JSON.stringify({ wachtwoord: 'test-wachtwoord' }) });
  const cookie = inlog.headers.getSetCookie()[0].split(';')[0];
  const metCookie = { headers: { cookie } };

  const alles = await (await haal('/api/beheer/aanvragen', metCookie)).json();
  assert.ok(alles.soorten.length === 3);
  assert.ok(alles.statistieken.perSoort.vooraanmelding >= 2);

  const alleenVooraf = await (await haal('/api/beheer/aanvragen?soort=vooraanmelding', metCookie)).json();
  assert.ok(alleenVooraf.aanvragen.length >= 2);
  assert.ok(alleenVooraf.aanvragen.every((a) => a.soort === 'vooraanmelding'));
  assert.ok(alleenVooraf.aanvragen.every((a) => a.actiedatum), 'een vooraanmelding zonder datum is stuurloos');

  const aanvragen = await (await haal('/api/beheer/aanvragen?soort=aanvraag', metCookie)).json();
  const dossier = aanvragen.aanvragen[0];
  assert.equal(dossier.dossierCompleet, false);
  assert.ok(dossier.stukkenOntbreken > 0);

  const detail = await (await haal(`/api/beheer/aanvragen/${dossier.id}`, metCookie)).json();
  assert.ok(detail.eisen.stukken.length > 0, 'de beheerder moet zien wat er nodig is');

  const bijgewerkt = await (await haal(`/api/beheer/aanvragen/${dossier.id}/stukken`, {
    ...metCookie, method: 'POST',
    body: JSON.stringify({ stukken: { ontvangstbevestiging: true, verzonnen: true } }),
  })).json();
  assert.equal(bijgewerkt.aanvraag.stukken.ontvangstbevestiging, true);
  assert.equal(bijgewerkt.aanvraag.stukken.verzonnen, undefined, 'onbekende stukken worden genegeerd');

  const csv = await (await haal('/api/beheer/export.csv', metCookie)).text();
  assert.match(csv, /soort/);
  assert.match(csv, /Vooraanmelding/);
});

test('de beheerder maakt met een klik een machtiging en houdt de status bij', async () => {
  const inlog = await haal('/api/beheer/login', { method: 'POST', body: JSON.stringify({ wachtwoord: 'test-wachtwoord' }) });
  const cookie = inlog.headers.getSetCookie()[0].split(';')[0];
  const metCookie = { headers: { cookie } };

  const aanvragen = await (await haal('/api/beheer/aanvragen?soort=aanvraag', metCookie)).json();
  const dossier = aanvragen.aanvragen[0];

  const document = await haal(`/api/beheer/aanvragen/${dossier.id}/machtiging`, metCookie);
  assert.equal(document.status, 200);
  assert.match(document.headers.get('content-type'), /text\/html/);
  assert.match(document.headers.get('x-robots-tag'), /noindex/);
  const html = await document.text();
  assert.match(html, /Machtiging/);
  assert.match(html, /T\. Tester/, 'de bekende gegevens staan er al in');
  assert.match(html, /Teststraat 1/);

  const detail = await (await haal(`/api/beheer/aanvragen/${dossier.id}`, metCookie)).json();
  assert.ok(Array.isArray(detail.machtiging.ontbrekendeGegevens));
  assert.ok(detail.machtiging.ontbrekendeGegevens.includes('Geboortedatum'),
    'zonder geboortedatum hoort de beheerder gewaarschuwd te worden');

  const verstuurd = await (await haal(`/api/beheer/aanvragen/${dossier.id}/machtiging`, {
    ...metCookie, method: 'POST', body: JSON.stringify({ actie: 'verstuurd' }),
  })).json();
  assert.ok(verstuurd.aanvraag.machtiging.verstuurdOp);

  const ontvangen = await (await haal(`/api/beheer/aanvragen/${dossier.id}/machtiging`, {
    ...metCookie, method: 'POST', body: JSON.stringify({ actie: 'ontvangen' }),
  })).json();
  assert.ok(ontvangen.aanvraag.machtiging.ontvangenOp);
  assert.equal(ontvangen.aanvraag.stukken.machtiging, true,
    'de ondertekende machtiging hoort meteen als stuk in het dossier te hangen');
  assert.match(ontvangen.aanvraag.historie.at(-1).tekst, /ondertekende machtiging/i);

  const onzin = await haal(`/api/beheer/aanvragen/${dossier.id}/machtiging`, {
    ...metCookie, method: 'POST', body: JSON.stringify({ actie: 'iets-anders' }),
  });
  assert.equal(onzin.status, 400);
});

test('de machtiging is niet zonder inloggen op te halen', async () => {
  const lijst = await (await haal('/api/beheer/aanvragen', {
    headers: { cookie: (await (await haal('/api/beheer/login', { method: 'POST', body: JSON.stringify({ wachtwoord: 'test-wachtwoord' }) })).headers.getSetCookie()[0].split(';')[0]) },
  })).json();
  const antwoord = await haal(`/api/beheer/aanvragen/${lijst.aanvragen[0].id}/machtiging`);
  assert.equal(antwoord.status, 401);
});
