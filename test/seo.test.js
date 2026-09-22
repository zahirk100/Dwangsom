/**
 * Wat een zoekmachine van deze site ziet.
 *
 * SEO-fouten zijn stille fouten. Een sitemap die naar een noindex-pagina
 * wijst, twee pagina's met dezelfde titel, of een FAQ-schema met vragen die
 * niet op de pagina staan: niets daarvan valt op bij het testen, en alle drie
 * kosten ze posities of leveren ze een waarschuwing in Search Console op.
 *
 * De belangrijkste toets hieronder is die op het FAQ-schema. Google eist dat
 * elke vraag in de gestructureerde gegevens ook zichtbaar op de pagina staat;
 * onjuiste gegevens kosten je de weergave of een handmatige maatregel.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { robotsTxt, sitemapXml, faqSchema, organisatieSchema, kruimelSchema, metSchema } from '../src/seo.js';
import { alleLandingspaginas } from '../src/landingpagina.js';
import { campagneHtml, CAMPAGNE_PAD } from '../src/campagnepagina.js';

const WORTEL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lees = (naam) => fs.readFileSync(path.join(WORTEL, 'public', naam), 'utf8');

/** De json-ld blokken uit een pagina, als objecten. */
function schemas(html) {
  const blokken = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return blokken.map((m) => JSON.parse(m[1]));
}

const paginas = alleLandingspaginas({ TARIEF_PERCENTAGE: '25' });

// ---------------------------------------------------------------- robots ---

test('robots.txt wijst naar de sitemap en houdt de afgeschermde delen buiten', () => {
  const r = robotsTxt();
  assert.match(r, /Sitemap: https:\/\/nubeslist\.nl\/sitemap\.xml/);
  for (const pad of ['/beheer', '/mijn', '/api/']) {
    assert.ok(r.includes(`Disallow: ${pad}`), `${pad} hoort uitgesloten te zijn`);
  }
  assert.match(r, /^User-agent: \*/m);
});

test('robots.txt sluit de site niet per ongeluk helemaal af', () => {
  // Eén verdwaalde regel en je bent onvindbaar. Dat gebeurt vaker dan je denkt.
  const r = robotsTxt();
  assert.ok(!/^Disallow: \/$/m.test(r), 'dit zou de hele site uitsluiten');
  assert.match(r, /^Allow: \//m);
});

// --------------------------------------------------------------- sitemap ---

test('de sitemap is geldige xml met absolute adressen', () => {
  const xml = sitemapXml([{ pad: '/' }, { pad: '/uwv' }]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  for (const loc of [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
    assert.match(loc, /^https:\/\/nubeslist\.nl\//, `${loc} hoort absoluut te zijn`);
  }
});

test('de gebouwde sitemap bevat geen enkele noindex-pagina', () => {
  // Dit is de waarschuwing die iedereen in Search Console krijgt en niemand
  // kan verklaren: "ingediend en als noindex gemarkeerd".
  const xml = lees('sitemap.xml');
  const paden = [...xml.matchAll(/<loc>https:\/\/nubeslist\.nl(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
  for (const pad of paden) {
    const bestand = pad === '/' ? 'index.html' : `${pad.slice(1)}.html`;
    const html = lees(bestand);
    assert.ok(!/name="robots" content="noindex/.test(html), `${pad} staat op noindex`);
  }
  for (const verboden of ['/beheer', '/mijn', '/aanvraag', '/aanvraag-klassiek', '/start']) {
    assert.ok(!paden.includes(verboden), `${verboden} hoort niet in de sitemap`);
  }
});

test('elke pagina in de sitemap bestaat ook echt', () => {
  const xml = lees('sitemap.xml');
  const paden = [...xml.matchAll(/<loc>https:\/\/nubeslist\.nl(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.ok(paden.length >= 20, `verwacht minstens twintig pagina's, kreeg ${paden.length}`);
  for (const pad of paden) {
    const bestand = pad === '/' ? 'index.html' : `${pad.slice(1)}.html`;
    assert.ok(fs.existsSync(path.join(WORTEL, 'public', bestand)), `${pad} bestaat niet`);
  }
});

test('de advertentielanding staat in de sitemap', () => {
  assert.ok(lees('sitemap.xml').includes(`<loc>https://nubeslist.nl${CAMPAGNE_PAD}</loc>`));
});

// ---------------------------------------------------- gestructureerd: faq ---

test('elke vraag in het FAQ-schema staat ook zichtbaar op de pagina', () => {
  // De harde eis van Google. Hier is dat geborgd doordat het schema uit de
  // pagina wordt gelezen; deze toets bewaakt dat dat zo blijft.
  const bronnen = [...paginas.map((p) => p.html), campagneHtml({ TARIEF_PERCENTAGE: '25' })];
  let gezien = 0;
  for (const html of bronnen) {
    const faq = schemas(html).find((s) => s['@type'] === 'FAQPage');
    if (!faq) continue;
    gezien++;
    for (const vraag of faq.mainEntity) {
      assert.ok(html.includes(vraag.name),
        `"${vraag.name}" staat in het schema maar niet op de pagina`);
      assert.ok(vraag.acceptedAnswer.text.length > 30, 'een antwoord van niets zegt niets');
    }
  }
  assert.ok(gezien > 5, `verwacht FAQ-schema op meerdere pagina's, kreeg ${gezien}`);
});

test('het FAQ-schema bevat geen uitklappers die geen vraag zijn', () => {
  const faq = schemas(campagneHtml({})).find((s) => s['@type'] === 'FAQPage');
  for (const vraag of faq.mainEntity) {
    assert.match(vraag.name, /\?$/, `"${vraag.name}" is geen vraag`);
  }
});

test('een pagina met te weinig vragen krijgt geen FAQ-schema', () => {
  assert.equal(faqSchema('<html><body><p>niets</p></body></html>', 'https://x/'), null);
});

test('het schema bevat geen html of entiteiten', () => {
  const alles = JSON.stringify(schemas(campagneHtml({})));
  assert.ok(!alles.includes('<'), 'geen tags in de tekst');
  assert.ok(!/&[a-z]+;/.test(alles), 'geen ongeconverteerde entiteiten');
});

// ------------------------------------------------- gestructureerd: overig ---

test('elke pagina noemt dezelfde organisatie, en verzint geen beoordelingen', () => {
  for (const { bestand, html } of paginas) {
    const org = schemas(html).find((s) => s['@type'] === 'Organization');
    assert.ok(org, `${bestand} mist het organisatieschema`);
    assert.equal(org['@id'], 'https://nubeslist.nl/#organisatie');
    assert.ok(!('aggregateRating' in org), 'verzonnen beoordelingen kosten je een handmatige maatregel');
    assert.ok(!('review' in org));
  }
});

test('het organisatieschema laat leeg wat leeg is', () => {
  // "nog niet ingevuld" als adres is slechter dan geen adres.
  const leeg = organisatieSchema({ naam: 'nubeslist.nl', adres: 'nog niet ingevuld', kvk: 'nog niet ingevuld' });
  assert.ok(!('address' in leeg));
  assert.ok(!('identifier' in leeg));
  assert.ok(!JSON.stringify(leeg).includes('nog niet ingevuld'));

  const vol = organisatieSchema({
    naam: 'Nubeslist B.V.', adres: 'Straat 1', postcodePlaats: '1234 AB Amsterdam',
    kvk: '12345678', email: 'info@nubeslist.nl',
  });
  // Een Nederlandse postcode heeft een spatie in zich; splitsen op de eerste
  // spatie leverde eerder "1234" op met "AB Amsterdam" als woonplaats.
  assert.equal(vol.address.postalCode, '1234 AB');
  assert.equal(vol.address.addressLocality, 'Amsterdam');
  const zonderSpatie = organisatieSchema({
    naam: 'x', adres: 'Straat 1', postcodePlaats: '1234AB Amsterdam',
  });
  assert.equal(zonderSpatie.address.postalCode, '1234AB');
  assert.equal(zonderSpatie.address.addressLocality, 'Amsterdam');
  assert.equal(vol.identifier.value, '12345678');
});

test('een zaakpagina hangt in het kruimelpad onder zijn instantie', () => {
  const wia = paginas.find((p) => p.bestand === 'uwv-wia.html');
  const kruimels = schemas(wia.html).find((s) => s['@type'] === 'BreadcrumbList');
  assert.ok(kruimels, 'de WIA-pagina hoort een kruimelpad te hebben');
  const paden = kruimels.itemListElement.map((k) => k.item);
  assert.deepEqual(paden, [
    'https://nubeslist.nl/',
    'https://nubeslist.nl/uwv',
    'https://nubeslist.nl/uwv-wia',
  ]);
  kruimels.itemListElement.forEach((k, i) => assert.equal(k.position, i + 1));
});

test('de startpagina krijgt geen kruimelpad van één kruimel', () => {
  const index = paginas.find((p) => p.bestand === 'index.html');
  assert.ok(!schemas(index.html).some((s) => s['@type'] === 'BreadcrumbList'));
  assert.equal(kruimelSchema([{ naam: 'x', pad: '/' }]), null);
});

test('metSchema laat een pagina zonder blokken met rust', () => {
  assert.equal(metSchema('<html><head></head></html>', [null, null]), '<html><head></head></html>');
});

// ------------------------------------------------------- titels en teksten ---

test('elke pagina heeft een eigen titel en omschrijving', () => {
  const titels = new Map();
  const omschrijvingen = new Map();
  for (const { bestand, html } of paginas) {
    const titel = /<title>([^<]+)<\/title>/.exec(html)[1];
    const omschrijving = /<meta name="description" content="([^"]+)"/.exec(html)[1];
    assert.ok(!titels.has(titel), `"${titel}" staat op zowel ${titels.get(titel)} als ${bestand}`);
    assert.ok(!omschrijvingen.has(omschrijving),
      `dezelfde omschrijving op ${omschrijvingen.get(omschrijving)} en ${bestand}`);
    titels.set(titel, bestand);
    omschrijvingen.set(omschrijving, bestand);
  }
});

test('titels en omschrijvingen hebben een bruikbare lengte', () => {
  for (const { bestand, html } of paginas) {
    const titel = /<title>([^<]+)<\/title>/.exec(html)[1];
    const omschrijving = /<meta name="description" content="([^"]+)"/.exec(html)[1];
    // Boven ~60 tekens kapt Google de titel af; onder 120 tekens laat je
    // ruimte in het zoekresultaat liggen.
    assert.ok(titel.length >= 20 && titel.length <= 70, `${bestand}: titel is ${titel.length} tekens`);
    assert.ok(omschrijving.length >= 90 && omschrijving.length <= 175,
      `${bestand}: omschrijving is ${omschrijving.length} tekens`);
  }
});

test('elke pagina heeft precies één h1 en een eigen canonical', () => {
  const canoniek = new Map();
  for (const { bestand, html } of paginas) {
    const h1 = html.match(/<h1[^>]*>/g) || [];
    assert.equal(h1.length, 1, `${bestand} heeft ${h1.length} keer h1`);
    const c = /<link rel="canonical" href="([^"]+)"/.exec(html);
    assert.ok(c, `${bestand} mist een canonical`);
    assert.ok(!canoniek.has(c[1]), `${c[1]} staat op ${canoniek.get(c[1])} en ${bestand}`);
    canoniek.set(c[1], bestand);
  }
});

test('de taal staat vast op nederlands', () => {
  for (const { bestand, html } of paginas) {
    assert.match(html, /<html lang="nl"/, `${bestand} mist de taal`);
  }
});
