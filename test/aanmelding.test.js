/**
 * Aanmelden via een link uit een gesprek.
 *
 * De link is het enige slot op dit formulier: wie hem heeft, mag een machtiging
 * tekenen met een burgerservicenummer en een rekeningnummer erin. Daar hangt
 * dus nogal wat vanaf, en de meeste toetsen hieronder gaan over wat er níét
 * mag: een link die verlopen is, al gebruikt is, ingetrokken is, of helemaal
 * niet bestaat.
 *
 * De tweede zorg is wat er daarna in het dossier staat. Een aanmelding komt
 * binnen zónder brief en zónder berekening; die horen dan ook nergens verzonnen
 * te worden.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'nubeslist-aanmelding-'));
process.env.DATA_DIR = tijdelijk;
process.env.SESSIE_GEHEIM = 'testgeheim-voor-de-aanmeldingen';
process.env.TARIEF_PERCENTAGE = '25';
process.env.PORT = '0';
delete process.env.BEHEER_OPEN;

const { start, server, opslag, store } = await import('../server.js');
const { vandaagSleutel } = await import('../src/meting.js');
await start(0);
const basis = `http://127.0.0.1:${server.address().port}`;

const { logInAlsBeheerder } = await import('./hulp-inloggen.mjs');
const { cookie } = await logInAlsBeheerder(basis);

test.after(async () => {
  server.close();
  await fs.rm(tijdelijk, { recursive: true, force: true });
});

const HANDTEKENING = { afbeelding: `data:image/png;base64,${'A'.repeat(300)}` };

const COMPLEET = {
  naam: 'T. Tester',
  geboortedatum: '1980-05-17',
  bsn: '111222333',
  iban: 'NL91ABNA0417164300',
  email: 'tester@voorbeeld.nl',
  akkoord: true,
  handtekening: HANDTEKENING,
};

async function maakLink(notitie = 'Jan uit het gesprek van 14:20', extra = {}) {
  const antwoord = await fetch(`${basis}/api/beheer/aanmeldlinks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ notitie, ...extra }),
  });
  assert.equal(antwoord.status, 201);
  const data = await antwoord.json();
  return { ...data, token: new URL(data.url).searchParams.get('t') };
}

/** Dezelfde aanroep, maar dan om een weigering te bekijken. */
const probeerLink = (lading) => fetch(`${basis}/api/beheer/aanmeldlinks`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', cookie },
  body: JSON.stringify(lading),
});

const meld = (lading) => fetch(`${basis}/api/aanmelden`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(lading),
});

// --------------------------------------------------------------- de link ---

test('alleen een medewerker kan een aanmeldlink maken', async () => {
  const zonder = await fetch(`${basis}/api/beheer/aanmeldlinks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notitie: 'x' }),
  });
  assert.equal(zonder.status, 401);
});

test('de link wijst naar het formulier en vervalt vanzelf', async () => {
  const link = await maakLink();
  assert.match(link.url, /\/aanmelden\?t=/);
  assert.ok(link.token.length >= 20, 'een te kort token is te raden');
  const dagen = (new Date(link.verlooptOp).getTime() - Date.now()) / 86400000;
  assert.ok(dagen > 13 && dagen < 15, `de link hoort twee weken te werken, niet ${dagen} dagen`);
});

test('het token staat nergens in de opslag, alleen een hash', async () => {
  // Raakt de database op straat, dan mogen daar geen werkende links in liggen.
  const link = await maakLink();
  const rijen = await opslag.rijen('aanmeldlinks');
  const alles = JSON.stringify(rijen);
  assert.ok(!alles.includes(link.token), 'het token zelf staat in de opslag');
  assert.ok(rijen.some((r) => r.notitie.includes('Jan')), 'de notitie hoort er wel in te staan');
});

test('de notitie van de medewerker blijft binnen', async () => {
  const link = await maakLink('06 12345678, mevrouw De Vries');
  const open = await (await fetch(`${basis}/api/aanmelden?t=${encodeURIComponent(link.token)}`)).json();
  assert.equal(open.geldig, true);
  assert.ok(!JSON.stringify(open).includes('De Vries'), 'de aanvrager ziet onze notitie');
  assert.ok(!JSON.stringify(open).includes('12345678'));
});

test('een link die niet bestaat, geeft geen formulier', async () => {
  const uit = await (await fetch(`${basis}/api/aanmelden?t=verzonnen-token-abcdef`)).json();
  assert.equal(uit.geldig, false);
  assert.match(uit.reden, /kennen wij niet/);
});

// ---------------------------------------------------------- het indienen ---

test('een complete aanmelding wordt een dossier', async () => {
  const link = await maakLink();
  const antwoord = await meld({ t: link.token, ...COMPLEET });
  assert.equal(antwoord.status, 201);
  const data = await antwoord.json();
  assert.match(data.referentie, /^DWS-\d{4}-\d{4}$/);

  const lijst = await (await fetch(`${basis}/api/beheer/aanvragen?soort=aanmelding`, {
    headers: { cookie },
  })).json();
  const dossier = lijst.aanvragen.find((a) => a.referentie === data.referentie);
  assert.ok(dossier, 'het dossier hoort in de bak Aanmeldingen te staan');
  assert.equal(dossier.soort, 'aanmelding');
  assert.equal(dossier.status, 'nieuw');
});

test('het dossier verzint geen brief en geen berekening', async () => {
  // Er is nog niets geüpload en niets gerekend. Zou daar iets staan, dan gaat
  // een behandelaar op een getal af dat nergens vandaan komt.
  const link = await maakLink();
  const { referentie } = await (await meld({ t: link.token, ...COMPLEET })).json();
  const alle = await opslag.haalAlle();
  const dossier = alle.find((a) => a.referentie === referentie);

  assert.equal(dossier.brief, null);
  assert.equal(dossier.rapport, null);
  assert.deepEqual(dossier.invoer, {});
  assert.equal(dossier.actiedatum, null);

  // Wat er wél is: een getekende machtiging en de gegevens om mee te melden.
  assert.equal(dossier.machtiging.digitaal, true);
  assert.ok(dossier.handtekening.afbeelding.startsWith('data:image/png;base64,'));
  assert.equal(dossier.contact.bsn, '111222333');
  assert.equal(dossier.contact.iban, 'NL91ABNA0417164300');
  assert.equal(dossier.contact.geboortedatum, '1980-05-17');
  assert.match(dossier.historie[0].tekst, /aanmeldlink/i);
  assert.equal(dossier.meta.ingediendVia, 'aanmeldlink');
});

test('de link werkt daarna niet meer', async () => {
  const link = await maakLink();
  assert.equal((await meld({ t: link.token, ...COMPLEET })).status, 201);

  const nogmaals = await meld({ t: link.token, ...COMPLEET, naam: 'Iemand anders' });
  assert.equal(nogmaals.status, 410);
  assert.match((await nogmaals.json()).fout, /al gebruikt/);

  const openen = await (await fetch(`${basis}/api/aanmelden?t=${encodeURIComponent(link.token)}`)).json();
  assert.equal(openen.geldig, false);
});

test('een ingetrokken link doet niets meer', async () => {
  const link = await maakLink();
  const weg = await fetch(`${basis}/api/beheer/aanmeldlinks?id=${encodeURIComponent(link.id)}`, {
    method: 'DELETE', headers: { cookie },
  });
  assert.equal(weg.status, 200);
  assert.equal((await meld({ t: link.token, ...COMPLEET })).status, 410);
});

test('een verlopen link doet niets meer', async () => {
  const { maakAanmeldlink } = await import('../src/aanmelding.js');
  const { token } = await maakAanmeldlink(opslag, { notitie: 'oud', geldigMs: -1000 });
  const antwoord = await meld({ t: token, ...COMPLEET });
  assert.equal(antwoord.status, 410);
  assert.match((await antwoord.json()).fout, /verlopen/);
});

// --------------------------------------------------- wat er niet door mag ---

test('zonder handtekening of akkoord komt er geen dossier', async () => {
  for (const ontbreekt of ['handtekening', 'akkoord']) {
    const link = await maakLink();
    const lading = { t: link.token, ...COMPLEET };
    delete lading[ontbreekt];
    const antwoord = await meld(lading);
    assert.equal(antwoord.status, 422, `zonder ${ontbreekt} hoort het te stoppen`);
    assert.ok((await antwoord.json()).velden[ontbreekt]);

    // En de link blijft werken, zodat iemand het gewoon kan afmaken.
    const open = await (await fetch(`${basis}/api/aanmelden?t=${encodeURIComponent(link.token)}`)).json();
    assert.equal(open.geldig, true, 'een fout in het formulier mag de link niet opbranden');
  }
});

test('een burgerservicenummer of rekeningnummer dat niet klopt, komt er niet in', async () => {
  const link = await maakLink();
  const antwoord = await meld({ t: link.token, ...COMPLEET, bsn: '123456789', iban: 'NL00BANK0000000000' });
  assert.equal(antwoord.status, 422);
  const velden = (await antwoord.json()).velden;
  assert.match(velden.bsn, /klopt niet/);
  assert.match(velden.iban, /klopt niet/);
});

test('een getekend plaatje moet echt een plaatje zijn', async () => {
  const link = await maakLink();
  const antwoord = await meld({
    t: link.token, ...COMPLEET,
    handtekening: { afbeelding: 'javascript:alert(1)' },
  });
  assert.equal(antwoord.status, 422);
  assert.ok((await antwoord.json()).velden.handtekening);
});

test('een kind kan niet zelf tekenen', async () => {
  const link = await maakLink();
  const kind = new Date(Date.now() - 10 * 365.25 * 86400000).toISOString().slice(0, 10);
  const antwoord = await meld({ t: link.token, ...COMPLEET, geboortedatum: kind });
  assert.equal(antwoord.status, 422);
  assert.match((await antwoord.json()).velden.geboortedatum, /16 jaar/);
});

// ------------------------------------------------------------- privacy -----

test('wat de klantkant teruggeeft, bevat geen burgerservicenummer', async () => {
  // Dezelfde afspraak als voor elk ander dossier. De lijst met velden die naar
  // de klant gaat staat in server.js; die wordt hier gelezen, want een nummer
  // dat daar ooit bij komt te staan, komt er bij elke aanvrager uit.
  const bron = await fs.readFile(new URL('../server.js', import.meta.url), 'utf8');
  const blok = /function voorKlant\(a\) \{[\s\S]*?\n\}/.exec(bron);
  assert.ok(blok, 'voorKlant hoort in server.js te staan');
  assert.ok(!/\bbsn\b\s*:/.test(blok[0]) || /bsnBekend/.test(blok[0]),
    'het burgerservicenummer hoort niet voluit naar de klant');
  assert.ok(!/(^|[^A-Za-z])iban\s*:/.test(blok[0].replace(/ibanBekend\s*:/g, '')),
    'het rekeningnummer hoort niet naar de klant');
});

test('het formulier staat niet in Google en vraagt niet om een brief', async () => {
  const html = await (await fetch(`${basis}/aanmelden`)).text();
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.ok(!/type="file"/.test(html), 'de brief komt later via de beheeromgeving, niet hier');
  const robots = await (await fetch(`${basis}/robots.txt`)).text();
  assert.match(robots, /Disallow: \/aanmelden/);
});

test('de machtiging noemt de vergoeding en verzint er geen', async () => {
  const open = await (await fetch(`${basis}/api/aanmelden?t=${(await maakLink()).token}`)).json();
  assert.equal(open.TARIEF_PERCENTAGE, '25', 'het tarief komt uit de omgeving');

  const script = await (await fetch(`${basis}/assets/aanmelden.js`)).text();
  assert.match(script, /tariefZin/, 'de vergoedingsregel hoort uit tarief.js te komen');
  // Geen enkel percentage of bedrag dat in de code is vastgelegd.
  assert.ok(!/\b\d{1,2}\s?%/.test(script), 'er staat een vast percentage in het script');
});

// ------------------------------------------------------ de vooraanmelding --

/*
 * Het tweede soort link: voor wie er nog net te vroeg bij is. De instantie
 * heeft dan nog tijd, er valt niets te vorderen en er is dus ook niets te
 * beloven. Wat wij wél doen is de datum bewaken.
 *
 * Waar deze toetsen op letten is wie welk werk doet. De zaak wordt vastgelegd
 * door de medewerker die de link maakt - die heeft de aanvrager toch al aan de
 * lijn - en niet op het scherm van de aanvrager. Dat scherm is daarmee even
 * kort als bij een gewone aanmelding: gegevens, handtekening, klaar. Zonder
 * zaak komt er geen link, want een vooraanmelding die niets bewaakt is precies
 * het dossier dat blijft liggen.
 */

const RECENT = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
const LANG_GELEDEN = new Date(Date.now() - 300 * 86400000).toISOString().slice(0, 10);

const ZAAK = { bestuursorgaan: 'uwv', zaaktype: 'uwv-ww', basisdatum: RECENT };

/** Een vooraanmeldlink zoals een medewerker die maakt: mét de zaak erop. */
const voorafLink = (zaak = ZAAK) => maakLink('Mo, 06 11111111', { soort: 'vooraanmelding', zaak });

/** Een aanvrager die alleen zijn eigen gegevens invult en tekent. */
const vooraf = (lading) => meld({ ...COMPLEET, ...lading });

const dossierVan = async (referentie) => (await opslag.haalAlle())
  .find((a) => a.referentie === referentie);

test('een gewone link blijft een gewone aanmelding', async () => {
  const link = await maakLink();
  const open = await (await fetch(`${basis}/api/aanmelden?t=${encodeURIComponent(link.token)}`)).json();
  assert.equal(open.soort, 'aanmelding');
  assert.deepEqual(open.zaak, {});
});

test('een vooraanmeldlink zonder zaak wordt niet gemaakt', async () => {
  // Liever hier stoppen dan een dossier dat geen datum bewaakt. Weet je de
  // zaak nog niet, dan is er de gewone aanmeldlink.
  const antwoord = await probeerLink({ notitie: 'x', soort: 'vooraanmelding' });
  assert.equal(antwoord.status, 422);
  const velden = (await antwoord.json()).velden;
  assert.ok(velden.bestuursorgaan);
  assert.ok(velden.zaaktype);
  assert.ok(velden.basisdatum);

  const links = await (await fetch(`${basis}/api/beheer/aanmeldlinks`, { headers: { cookie } })).json();
  assert.ok(!links.links.some((l) => l.soort === 'vooraanmelding' && !l.zaak.zaaktype));
});

test('de aanvrager krijgt niets te vragen, alleen te controleren', async () => {
  const link = await voorafLink();
  assert.equal(link.soort, 'vooraanmelding');

  const open = await (await fetch(`${basis}/api/aanmelden?t=${encodeURIComponent(link.token)}`)).json();
  assert.equal(open.soort, 'vooraanmelding');
  assert.deepEqual(open.zaak, { bestuursorgaan: 'uwv', zaaktype: 'uwv-ww', basisdatum: RECENT });
  assert.ok(!JSON.stringify(open).includes('06 11111111'), 'de aanvrager ziet onze notitie');
});

test('tekenen is genoeg: er ontstaat een dossier dat een datum bewaakt', async () => {
  const link = await voorafLink();
  // Let op wat hier níét wordt meegestuurd: geen zaak. Dat is het hele punt.
  const antwoord = await vooraf({ t: link.token });
  assert.equal(antwoord.status, 201);
  const data = await antwoord.json();
  assert.equal(data.soort, 'vooraanmelding');
  assert.match(data.bewaaktTot, /^\d{4}-\d{2}-\d{2}$/);

  const dossier = await dossierVan(data.referentie);
  assert.equal(dossier.soort, 'vooraanmelding');
  assert.equal(dossier.status, 'nieuw');
  assert.equal(dossier.invoer.bestuursorgaan, 'uwv');
  assert.equal(dossier.invoer.zaaktype, 'uwv-ww');
  assert.equal(dossier.invoer.basisdatum, RECENT);
  assert.equal(dossier.rapport.uitkomst, 'termijn-loopt');
  assert.equal(dossier.actiedatum, data.bewaaktTot);
  assert.match(dossier.historie[0].tekst, /vooraanmelding/i);
  assert.equal(dossier.meta.ingediendVia, 'vooraanmeldlink');

  // De machtiging is er net zo goed als bij een gewone aanmelding.
  assert.equal(dossier.machtiging.digitaal, true);
  assert.equal(dossier.contact.bsn, '111222333');
});

test('wat de medewerker noteerde, kan niet vanaf het formulier worden omgezet', async () => {
  // Het formulier stuurt deze velden alleen mee als wij ze zelf niet wisten.
  // Komt er toch iets anders binnen, dan telt wat in het gesprek is vastgelegd.
  const link = await voorafLink();
  const { referentie } = await (await vooraf({
    t: link.token,
    zaak: { bestuursorgaan: 'gemeente', zaaktype: 'gem-bijstand', basisdatum: LANG_GELEDEN },
  })).json();

  const dossier = await dossierVan(referentie);
  assert.equal(dossier.invoer.bestuursorgaan, 'uwv');
  assert.equal(dossier.invoer.zaaktype, 'uwv-ww');
  assert.equal(dossier.invoer.basisdatum, RECENT);
});

test('de datum uit de brief gaat voor op onze eigen termijn', async () => {
  const eigen = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  const link = await voorafLink({ ...ZAAK, termijnEinddatum: eigen });
  const { referentie } = await (await vooraf({ t: link.token })).json();

  const dossier = await dossierVan(referentie);
  assert.equal(dossier.invoer.termijnEinddatum, eigen);
  assert.equal(dossier.invoer.termijnBekend, true);
});

test('blijkt de termijn tóch al voorbij, dan staat het dossier meteen op de werklijst', async () => {
  // Een medewerker kan zich vergissen in de datum. Dan wachten wij niet: de
  // zaak hoort vandaag al op de lijst, met de ingebrekestelling als volgende stap.
  const link = await voorafLink({ ...ZAAK, basisdatum: LANG_GELEDEN });
  const { referentie, bewaaktTot } = await (await vooraf({ t: link.token })).json();

  const dossier = await dossierVan(referentie);
  assert.equal(dossier.rapport.uitkomst, 'ingebrekestelling-nodig');
  assert.equal(dossier.rapport.vervolg.actieLabel, 'Ingebrekestelling versturen');
  assert.ok(bewaaktTot <= vandaagSleutel(), `de datum om te bewaken is ${bewaaktTot}, niet vandaag`);

  const werklijst = await store.lijst({ actie: 'nodig' });
  assert.ok(werklijst.some((a) => a.referentie === referentie),
    'een zaak waar vandaag iets moet gebeuren, hoort op de werklijst te staan');
});

test('een zaak die niet bestaat, komt er niet op de link', async () => {
  const verzonnen = await probeerLink({
    notitie: 'x', soort: 'vooraanmelding', zaak: { ...ZAAK, bestuursorgaan: 'ministerie' },
  });
  assert.equal(verzonnen.status, 422);

  // Bijstand bij UWV bestaat niet, en zou met de verkeerde termijn rekenen.
  const kruislings = await probeerLink({
    notitie: 'x', soort: 'vooraanmelding', zaak: { ...ZAAK, zaaktype: 'gem-bijstand' },
  });
  assert.equal(kruislings.status, 422);
  assert.match((await kruislings.json()).velden.zaaktype, /hoort niet bij deze instantie/);

  const morgen = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const toekomst = await probeerLink({
    notitie: 'x', soort: 'vooraanmelding', zaak: { ...ZAAK, basisdatum: morgen },
  });
  assert.equal(toekomst.status, 422);
});

test('via de zaakvelden komt er niets anders het dossier in', async () => {
  // Alleen de vier velden die bij de zaak horen. Zou hier meer doorheen
  // kunnen, dan bepaalt de aanvrager zelf dat hij al in gebreke heeft gesteld.
  const link = await voorafLink();
  const { referentie } = await (await vooraf({
    t: link.token,
    zaak: { ingebrekeGesteld: true, ingebrekestellingDatum: '2026-01-01', opschortingDagen: 99 },
  })).json();

  const dossier = await dossierVan(referentie);
  assert.ok(!dossier.invoer.ingebrekeGesteld);
  assert.ok(!dossier.invoer.ingebrekestellingDatum);
  assert.ok(!dossier.invoer.opschortingDagen);
});

test('een oude link zonder zaak loopt niet dood', async () => {
  // Links van vóór deze regel liggen nog in chats. Die vragen het alsnog aan
  // de aanvrager in plaats van hem met een foutmelding achter te laten.
  const { maakAanmeldlink } = await import('../src/aanmelding.js');
  const { token } = await maakAanmeldlink(opslag, { notitie: 'oud', soort: 'vooraanmelding' });

  const leeg = await vooraf({ t: token });
  assert.equal(leeg.status, 422);
  assert.ok((await leeg.json()).velden.zaaktype, 'dan hoort het formulier het te vragen');

  const antwoord = await vooraf({ t: token, zaak: ZAAK });
  assert.equal(antwoord.status, 201);
  assert.equal((await dossierVan((await antwoord.json()).referentie)).invoer.zaaktype, 'uwv-ww');
});

test('een verzonnen soort link wordt gewoon een aanmelding', async () => {
  const link = await maakLink('x', { soort: 'van-alles' });
  assert.equal(link.soort, 'aanmelding');
});

test('de bevestigingsmail belooft bij een vooraanmelding geen brief en geen bedrag', async () => {
  // De gewone mail zegt "wij gaan met je brief aan de slag". Bij een
  // vooraanmelding is er geen brief en valt er nog niets te halen; die mail
  // zou dus een verwachting wekken die wij niet waarmaken.
  const { SJABLONEN } = await import('../src/mail.js');
  const mail = SJABLONEN['vooraanmelding-bevestiging']({
    naam: 'M. El Amrani', referentie: 'DWS-2026-0099',
    bewaaktTot: '15 november 2026', url: 'https://nubeslist.nl/mijn?t=x',
  });
  const alles = JSON.stringify(mail);
  assert.match(alles, /15 november 2026/);
  assert.match(alles, /in gebreke/);
  assert.ok(!/met je brief aan de slag/.test(alles));
  assert.ok(!/€|procent|%/.test(alles), 'er hoort geen bedrag in te staan');
});
