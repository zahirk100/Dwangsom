/**
 * Op Vercel gaat het bestandssysteem vóór de serverloze functie: bestaat er
 * een public/<pad>.html, dan serveert het platform dat bestand en komt de
 * routetabel in server.js nooit aan bod.
 *
 * Dat ging precies één keer mis: /aanvraag moest de nieuwe funnel tonen,
 * maar public/aanvraag.html bestond nog en werd statisch geserveerd. Lokaal
 * was daar niets van te merken, want daar beslist de router wel. Deze test
 * bewaakt dat een route die iets anders serveert dan zijn eigen naam, geen
 * gelijknamig bestand naast zich heeft staan.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.env.DATA_DIR = fs.mkdtempSync(path.join(WORTEL, 'data', 'routes-'));

const { PAGINAS, FUNNEL } = await import('../server.js');

test.after(() => fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }));

test('elke route serveert een bestand dat ook echt bestaat', () => {
  for (const [route, bestand] of Object.entries(PAGINAS)) {
    const pad = path.join(WORTEL, 'public', bestand);
    assert.ok(fs.existsSync(pad), `${route} verwijst naar public/${bestand}, dat er niet is`);
  }
});

test('een route die iets anders serveert dan zijn eigen naam, mag geen gelijknamig bestand hebben', () => {
  for (const [route, bestand] of Object.entries(PAGINAS)) {
    if (route === '/') continue;
    const eigenNaam = `${route.slice(1)}.html`;
    if (eigenNaam === bestand) continue;

    const botsing = path.join(WORTEL, 'public', eigenNaam);
    assert.ok(
      !fs.existsSync(botsing),
      `${route} hoort ${bestand} te serveren, maar public/${eigenNaam} bestaat ook. `
      + 'Op Vercel wint dat bestand en wordt de routetabel overgeslagen.',
    );
  }
});

test('de funnelschakelaar wijst naar bestaande pagina\'s', () => {
  assert.equal(FUNNEL, 'nieuw', 'standaard staat de nieuwe funnel op /aanvraag');
  assert.equal(PAGINAS['/aanvraag'], 'start.html');
  assert.equal(PAGINAS['/aanvraag-klassiek'], 'aanvraag-klassiek.html');
  assert.equal(PAGINAS['/aanvraag-nieuw'], 'start.html');
});

test('de gedeelde modules staan waar de browser ze verwacht', () => {
  for (const naam of ['dwangsom.js', 'datum.js', 'catalogus.js', 'dossier.js', 'identiteit.js',
    'brief.js', 'herkomst.js']) {
    assert.ok(
      fs.existsSync(path.join(WORTEL, 'public', 'shared', naam)),
      `public/shared/${naam} ontbreekt; de browser importeert die rechtstreeks`,
    );
  }
});

/**
 * Elk script dat iets importeert, valt om als dat bestand er niet is.
 *
 * Bij assets/meting.js weegt dat zwaarder dan elders: mislukt die import, dan
 * meet de hele site niets meer, en juist daar merk je het niet aan het scherm.
 */
test('de scripts importeren alleen gedeelde modules die bestaan', () => {
  const map = path.join(WORTEL, 'public', 'assets');
  for (const bestand of fs.readdirSync(map).filter((n) => n.endsWith('.js'))) {
    const bron = fs.readFileSync(path.join(map, bestand), 'utf8');
    for (const [, pad] of bron.matchAll(/from\s+'(\/shared\/[^']+)'/g)) {
      assert.ok(
        fs.existsSync(path.join(WORTEL, 'public', pad.replace(/^\//, ''))),
        `assets/${bestand} importeert ${pad}, maar dat bestand bestaat niet`,
      );
    }
  }
});

/**
 * Elke pagina waar een bezoeker kan landen, moet geteld worden.
 *
 * Een pagina zonder meetscript is een blinde vlek die je niet ziet: de cijfers
 * zien er normaal uit, ze zijn alleen niet compleet. /hoe-werkt-het stond zo
 * een tijd buiten beeld terwijl het wel in de sitemap staat.
 *
 * Andersom net zo belangrijk: de beheeromgeving en het klantportaal tellen
 * juist níét mee. Een middag in de dossiers zou anders als bezoek in de
 * trechter belanden en elke verhouding vertroebelen.
 */
test('bezoekerspagina\'s worden geteld, beheerpagina\'s niet', () => {
  const heeft = (bestand) => fs.readFileSync(path.join(WORTEL, 'public', bestand), 'utf8')
    .includes('/assets/meting.js');

  for (const pad of ['/', '/hoe-werkt-het', '/contact', '/privacy', '/voorwaarden',
    '/uwv-wia', '/bijstand', '/aanvraag', '/uwv-te-laat']) {
    assert.ok(heeft(PAGINAS[pad]), `${pad} laadt geen meting.js en telt dus niet mee`);
  }

  for (const pad of ['/beheer', '/cijfers', '/mijn']) {
    assert.ok(!heeft(PAGINAS[pad]), `${pad} telt mee als bezoek; dat vertroebelt de cijfers`);
  }
});

/**
 * Het vinkje boven de handtekening zegt "ga akkoord met de voorwaarden".
 * Daar hoorde lange tijd geen pagina bij: je tekende voor iets wat nergens
 * stond. Zo'n dode verwijzing mag niet ongemerkt terugkomen.
 */
test('de voorwaarden waar de aanvrager voor tekent, bestaan ook echt', () => {
  assert.equal(PAGINAS['/voorwaarden'], 'voorwaarden.html');

  const funnel = fs.readFileSync(path.join(WORTEL, 'public', PAGINAS['/aanvraag']), 'utf8');
  const vinkje = funnel.slice(funnel.indexOf('id="akkoord"'), funnel.indexOf('id="akkoord"') + 400);
  assert.match(vinkje, /href="\/voorwaarden"/, 'het akkoordvinkje moet naar de voorwaarden linken');
});

test('de voorwaarden noemen geen bedrag dat niet is ingesteld', () => {
  const tekst = fs.readFileSync(path.join(WORTEL, 'public', 'voorwaarden.html'), 'utf8');
  const body = tekst.slice(tekst.indexOf('<main'), tekst.indexOf('</main>')).replace(/\s+/g, ' ');
  assert.doesNotMatch(body, /\d+\s*%/, 'een percentage hoort uit de omgeving te komen, niet uit de pagina');
  assert.match(body, /hoor je vooraf precies wat onze vergoeding is/);
});
