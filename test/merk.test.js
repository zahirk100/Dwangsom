/**
 * Het merk en de vindbaarheid: naam, titels, meta-teksten en de iconen.
 * Een hernoeming die er half doorheen komt, valt op een deelbare pagina
 * meteen op, dus staat hij hier vast.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'nubeslist-merk-'));
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

const haal = (pad) => fetch(basisUrl + pad);
const PUBLIEKE_PAGINAS = ['/', '/aanvraag', '/hoe-werkt-het', '/aanvraag-klassiek'];
const ALLE_PAGINAS = [...PUBLIEKE_PAGINAS, '/beheer'];

test('de oude naam staat nergens meer in de uitgeleverde pagina\'s', async () => {
  for (const pad of ALLE_PAGINAS) {
    const html = await (await haal(pad)).text();
    assert.ok(!/Dwangsomhulp/i.test(html), `${pad} noemt de oude naam nog`);
    assert.match(html, /nubeslist\.nl/, `${pad} noemt de nieuwe naam niet`);
  }
  for (const bestand of ['/assets/funnel.js', '/assets/wizard.js', '/assets/beheer.js', '/assets/stijl.css']) {
    const tekst = await (await haal(bestand)).text();
    assert.ok(!/Dwangsomhulp/i.test(tekst), `${bestand} noemt de oude naam nog`);
  }
});

test('elke pagina heeft een eigen titel, omschrijving en canonieke url', async () => {
  const titels = new Set();
  for (const pad of PUBLIEKE_PAGINAS) {
    const html = await (await haal(pad)).text();
    const titel = /<title>([^<]+)<\/title>/.exec(html);
    assert.ok(titel, `${pad} heeft geen titel`);
    assert.ok(titel[1].length >= 20 && titel[1].length <= 70, `${pad}: titel is ${titel[1].length} tekens`);
    assert.ok(!titels.has(titel[1]), `${pad} deelt zijn titel met een andere pagina`);
    titels.add(titel[1]);

    const omschrijving = /<meta name="description" content="([^"]+)">/.exec(html);
    assert.ok(omschrijving, `${pad} heeft geen omschrijving`);
    assert.ok(omschrijving[1].length >= 70, `${pad}: omschrijving is te kort`);
    assert.match(html, /<link rel="canonical" href="https:\/\/nubeslist\.nl/, `${pad} mist een canonieke url`);
  }
});

test('een gedeelde link krijgt een titel, een omschrijving en een beeld mee', async () => {
  for (const pad of PUBLIEKE_PAGINAS) {
    const html = await (await haal(pad)).text();
    for (const tag of ['og:type', 'og:title', 'og:description', 'og:image', 'og:url']) {
      assert.match(html, new RegExp(`property="${tag}"`), `${pad} mist ${tag}`);
    }
    assert.match(html, /name="twitter:card" content="summary_large_image"/, `${pad} mist de twitterkaart`);
  }
});

test('de beheerpagina wordt niet geïndexeerd en is niet deelbaar bedoeld', async () => {
  const html = await (await haal('/beheer')).text();
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.ok(!/og:image/.test(html), 'de beheeromgeving hoort geen deelkaart te hebben');
});

test('het merkteken en de iconen worden uitgeleverd met het juiste type', async () => {
  const verwacht = [
    ['/merk.svg', 'image/svg+xml'],
    ['/icoon-180.png', 'image/png'],
    ['/icoon-512.png', 'image/png'],
    ['/deelkaart.png', 'image/png'],
  ];
  for (const [pad, type] of verwacht) {
    const antwoord = await haal(pad);
    assert.equal(antwoord.status, 200, `${pad} gaf ${antwoord.status}`);
    assert.match(antwoord.headers.get('content-type'), new RegExp(type.replace('+', '\\+')));
    const lijf = await antwoord.arrayBuffer();
    assert.ok(lijf.byteLength > 400, `${pad} is verdacht klein`);
  }
});

test('elke pagina wijst naar het merkteken en naar het telefoonicoon', async () => {
  for (const pad of ALLE_PAGINAS) {
    const html = await (await haal(pad)).text();
    assert.match(html, /<link rel="icon" href="\/merk\.svg" type="image\/svg\+xml">/, `${pad} mist het favicon`);
    assert.match(html, /<link rel="apple-touch-icon" href="\/icoon-180\.png">/, `${pad} mist het telefoonicoon`);
    assert.match(html, /<meta name="theme-color"/, `${pad} mist een themakleur`);
  }
});

test('de zichtbare teksten gebruiken geen streepjes als scheidingsteken', async () => {
  // Gedachtestreepjes en middenpunten tussen zinsdelen leiden af; die horen
  // vervangen te zijn door gewone leestekens.
  for (const pad of PUBLIEKE_PAGINAS) {
    const html = await (await haal(pad)).text();
    const zichtbaar = html
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ');
    for (const teken of ['—', '·', '–']) {
      assert.ok(!zichtbaar.includes(teken),
        `${pad} bevat nog "${teken}" in de lopende tekst`);
    }
  }
});

test('de naam op de machtiging volgt BEDRIJF_NAAM, met nubeslist.nl als terugval', async () => {
  const { organisatiegegevens } = await import('../src/organisatie.js');
  assert.equal(organisatiegegevens({}).naam, 'nubeslist.nl');
  assert.equal(organisatiegegevens({ BEDRIJF_NAAM: 'Anders B.V.' }).naam, 'Anders B.V.');
});
