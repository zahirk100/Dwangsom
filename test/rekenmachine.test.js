/**
 * De rekenmachine op /dwangsom-berekenen en de lead die eruit komt.
 *
 * Dit is de kortste weg van de hele site: iemand zoekt "dwangsom berekenen",
 * rekent zijn eigen zaak uit en laat drie velden achter. Geen brief, geen
 * burgerservicenummer, geen machtiging - die komen later, als wij hem gesproken
 * hebben.
 *
 * Twee dingen bewaken de toetsen hieronder. Het bedrag komt van de server en
 * niet van de bezoeker: een bedrag dat je zelf kunt meesturen is geen bedrag.
 * En er komt niets in het dossier wat niet gevraagd is - zeker geen
 * burgerservicenummer of machtiging die er nooit geweest is.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'nubeslist-reken-'));
process.env.DATA_DIR = tijdelijk;
process.env.SESSIE_GEHEIM = 'testgeheim-voor-de-rekenmachine';
process.env.TARIEF_PERCENTAGE = '25';
process.env.PORT = '0';
delete process.env.BEHEER_OPEN;

const { start, server, opslag } = await import('../server.js');
await start(0);
const basis = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  server.close();
  await fs.rm(tijdelijk, { recursive: true, force: true });
});

const RECENT = new Date(Date.now() - 300 * 86400000).toISOString().slice(0, 10);
const ZAAK = { bestuursorgaan: 'uwv', zaaktype: 'uwv-ww', basisdatum: RECENT };
const WIE = { naam: 'M. El Amrani', telefoon: '06 12345678' };

const lead = (lading) => fetch(`${basis}/api/lead`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(lading),
});

const dossierVan = async (referentie) => (await opslag.haalAlle())
  .find((a) => a.referentie === referentie);

// ---------------------------------------------------------- de pagina ------

test('de rekenmachine staat op de pagina en laadt zijn script', async () => {
  const html = await (await fetch(`${basis}/dwangsom-berekenen`)).text();
  assert.match(html, /id="r-orgaan"/);
  assert.match(html, /id="r-zaak"/);
  assert.match(html, /id="r-datum"/);
  assert.match(html, /id="r-uitslag"/);
  assert.match(html, /\/assets\/rekenmachine\.js/);
  // En hij vraagt niets wat hier niet hoort.
  assert.ok(!/burgerservicenummer/i.test(html.slice(html.indexOf('id="reken"'), html.indexOf('</section>'))),
    'de rekenmachine vraagt om een burgerservicenummer');
});

test('het script rekent met dezelfde motor als de rest van de site', async () => {
  const script = await (await fetch(`${basis}/assets/rekenmachine.js`)).text();
  assert.match(script, /from '\/shared\/dwangsom\.js'/);
  // Geen bedrag of percentage dat hier apart is ingetypt.
  assert.ok(!/\b\d{1,2}\s?%/.test(script), 'er staat een vast percentage in het script');
  assert.ok(!/1\.?442/.test(script), 'er staat een vast bedrag in het script');
});

// ------------------------------------------------------------- de lead -----

test('zonder naam, telefoonnummer of zaak komt er niets binnen', async () => {
  const antwoord = await lead({});
  assert.equal(antwoord.status, 422);
  const velden = (await antwoord.json()).velden;
  for (const veld of ['naam', 'telefoon', 'bestuursorgaan', 'zaaktype', 'basisdatum']) {
    assert.ok(velden[veld], `${veld} hoort gevraagd te worden`);
  }
});

test('een lead wordt een dossier met een eigen berekening', async () => {
  const antwoord = await lead({ zaak: ZAAK, ...WIE, email: 'mo@voorbeeld.nl' });
  assert.equal(antwoord.status, 201);
  const data = await antwoord.json();
  assert.match(data.referentie, /^DWS-\d{4}-\d{4}$/);

  const dossier = await dossierVan(data.referentie);
  assert.equal(dossier.status, 'nieuw');
  assert.equal(dossier.contact.naam, 'M. El Amrani');
  assert.equal(dossier.contact.telefoon, '06 12345678');
  assert.equal(dossier.contact.email, 'mo@voorbeeld.nl');
  assert.equal(dossier.invoer.zaaktype, 'uwv-ww');
  assert.ok(dossier.rapport.uitkomst, 'er hoort een berekening in te staan');
  assert.equal(dossier.meta.ingediendVia, 'rekenmachine');
  assert.match(dossier.historie[0].tekst, /uitgerekend/i);

  // Wat er níét is: dit is nog geen getekende zaak.
  assert.equal(dossier.handtekening, null);
  assert.deepEqual(dossier.machtiging, {});
  assert.ok(!dossier.contact.bsn);
  assert.ok(!dossier.contact.iban);
});

test('het bedrag komt van de server, niet van de bezoeker', async () => {
  // Zou een meegestuurd rapport blijven staan, dan bepaalt de bezoeker zelf
  // wat zijn zaak waard is - en gaat een behandelaar daarop af.
  const { referentie } = await (await lead({
    zaak: ZAAK,
    ...WIE,
    rapport: { uitkomst: 'recht', kop: 'Verzonnen', berekening: { totaal: 99999 } },
    bedrag: 99999,
  })).json();

  const dossier = await dossierVan(referentie);
  assert.notEqual(dossier.rapport.kop, 'Verzonnen');
  const totaal = dossier.rapport.berekening ? dossier.rapport.berekening.totaal : 0;
  assert.notEqual(totaal, 99999);
});

test('een al verstuurde ingebrekestelling telt mee', async () => {
  const datum = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const { referentie } = await (await lead({
    zaak: ZAAK, ...WIE, ingebrekeGesteld: true, ingebrekestellingDatum: datum,
  })).json();

  const dossier = await dossierVan(referentie);
  assert.equal(dossier.invoer.ingebrekeGesteld, true);
  assert.equal(dossier.invoer.ingebrekestellingDatum, datum);
  assert.equal(dossier.invoer.ingebrekestellingDoorOns, false,
    'wij hebben die brief niet gestuurd; dat moet het dossier weten');
  assert.equal(dossier.rapport.uitkomst, 'recht');
});

test('een ingebrekestelling in de toekomst wordt geweigerd', async () => {
  const morgen = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const antwoord = await lead({
    zaak: ZAAK, ...WIE, ingebrekeGesteld: true, ingebrekestellingDatum: morgen,
  });
  assert.equal(antwoord.status, 422);
  assert.match((await antwoord.json()).velden.ingebrekestellingDatum, /toekomst/);
});

test('de lead wordt geteld, los van de trechter van de funnel', async () => {
  const { vandaagSleutel, BUITEN_DE_TRECHTER, TRECHTERSTAPPEN } = await import('../src/meting.js');
  const telop = async () => Object.entries(await opslag.tellingen(vandaagSleutel()))
    .filter(([sleutel]) => sleutel === 'reken-lead' || sleutel.startsWith('reken-lead|'))
    .reduce((som, [, aantal]) => som + aantal, 0);

  const voor = await telop();
  await lead({ zaak: ZAAK, ...WIE });
  assert.equal(await telop(), voor + 1);

  // En hij vervuilt de funnel niet: die gaat over mensen met een brief.
  assert.ok(BUITEN_DE_TRECHTER.includes('reken-lead'));
  assert.ok(!TRECHTERSTAPPEN.includes('reken-lead'));
});
