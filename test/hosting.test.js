/**
 * Wat er nodig is om de site op een echte hosting te laten werken.
 *
 * Deze toetsen bestaan omdat er weken lang iets stuk was dat van buitenaf niet
 * te zien is. Een hosting die statische bestanden uitlevert, doet de pagina's
 * perfect: dat zijn echte bestanden. Maar draait er geen serverfunctie, dan
 * bestaat /api/... simpelweg niet, en dan wordt er niets geteld, geen brief
 * gelezen en geen aanvraag opgeslagen. De landingspagina laadt, de advertentie
 * telt zijn klik, en verder gebeurt er niets. Van de site af is er geen enkel
 * verschil te zien met een site waar toevallig niemand doorklikt.
 *
 * Twee dingen moeten daarom vaststaan, en allebei zijn ze hier stukgegaan:
 *  - er is een functiebestand, zodat de API bestaat;
 *  - elke pagina waar een bezoeker kan landen, is een echt bestand, zodat hij
 *    ook zonder functie bereikbaar is.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';

const WORTEL = path.dirname(path.dirname(new URL(import.meta.url).pathname));
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nubeslist-hosting-'));
process.env.SESSIE_GEHEIM = 'een-vast-testgeheim-voor-de-hosting';

test.after(() => fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }));

// ------------------------------------------------------- de functie zelf ---

test('er is een functiebestand, zodat de API in productie bestaat', () => {
  const map = path.join(WORTEL, 'api');
  assert.ok(fs.existsSync(map), 'de map api/ ontbreekt; zonder die map is er geen API in productie');
  const bestanden = fs.readdirSync(map);
  assert.ok(bestanden.some((naam) => naam.startsWith('[...')),
    `api/ heeft geen vangnetbestand ([...pad].js); nu is alleen ${bestanden.join(', ')} bereikbaar`);
});

test('het functiebestand levert een functie op', async () => {
  // Vercel weigert een module zonder default export die een functie is, met
  // "Invalid export found in module". Dan faalt elk verzoek, ook dat naar de
  // startpagina.
  const { default: handler } = await import('../api/[...pad].js');
  assert.equal(typeof handler, 'function', 'de default export hoort een functie te zijn');
});

test('de API antwoordt via het functiebestand op het echte pad', async () => {
  // Het pad mag onderweg niet veranderen. Een rewrite die /api/beheer/login in
  // /api/index veranderde, heeft eerder de hele API omgelegd zonder dat er iets
  // aan te zien was behalve "Onbekend API-pad".
  const { default: handler } = await import('../api/[...pad].js');
  const server = http.createServer((req, res) => { handler(req, res); });
  await new Promise((resolve) => server.listen(0, resolve));
  const basis = `http://127.0.0.1:${server.address().port}`;
  try {
    const antwoord = await fetch(`${basis}/api/versie`, { headers: { Accept: 'application/json' } });
    assert.equal(antwoord.status, 200);
    const data = await antwoord.json();
    assert.ok('opslagDuurzaam' in data, 'de versieroute hoort te zeggen of de opslag blijft bestaan');

    // En een pad dieper in de boom komt ook op zijn eigen route uit.
    assert.equal((await fetch(`${basis}/api/beheer/aanvragen`)).status, 401,
      'een beheerpad hoort 401 te geven, niet 404: 404 betekent dat het pad niet aankwam');
  } finally {
    server.close();
  }
});

// ------------------------------------------ de site zonder enige functie ---

/**
 * Doet na wat een hosting doet die alleen public/ uitlevert: cleanUrls aan
 * (dus /pad vindt pad.html) en verder niets.
 */
function statischeHosting() {
  const publiek = path.join(WORTEL, 'public');
  return (pad) => {
    for (const kandidaat of [pad, `${pad}.html`, path.join(pad, 'index.html')]) {
      const bestand = path.join(publiek, kandidaat.replace(/^\/+/, ''));
      if (bestand.startsWith(publiek) && fs.existsSync(bestand) && fs.statSync(bestand).isFile()) {
        return bestand;
      }
    }
    return null;
  };
}

test('elke pagina van een bezoeker bestaat ook als los bestand', async () => {
  const vind = statischeHosting();
  const { PAGINAS } = await import('../server.js');

  // De beheeromgeving en het portaal mogen van de server afhangen; een
  // bezoeker komt daar niet vanaf een advertentie terecht.
  const alleenVoorIngelogden = ['/beheer', '/cijfers', '/mijn'];

  const ontbreekt = [];
  for (const pad of Object.keys(PAGINAS)) {
    if (alleenVoorIngelogden.includes(pad)) continue;
    if (!vind(pad)) ontbreekt.push(pad);
  }
  assert.deepEqual(ontbreekt, [],
    `deze adressen bestaan alleen zolang elk verzoek langs de server komt: ${ontbreekt.join(', ')}. `
    + 'Levert de hosting public/ rechtstreeks uit, dan geven ze een 404.');
});

test('het adres uit de advertenties is een echt bestand', () => {
  // De landingspagina verwijst hierheen. Ontbreekt dit bestand, dan loopt al
  // het betaalde verkeer op een foutpagina terwijl de landingspagina het doet.
  const vind = statischeHosting();
  assert.ok(vind('/aanvraag'), 'public/aanvraag.html ontbreekt; draai `npm run build`');

  const landing = fs.readFileSync(path.join(WORTEL, 'public', 'uwv-te-laat.html'), 'utf8');
  const doelen = [...landing.matchAll(/href="(\/[a-z0-9-]+)(?:\?[^"]*)?"/g)].map((m) => m[1]);
  const kapot = [...new Set(doelen)].filter((pad) => !vind(pad));
  assert.deepEqual(kapot, [],
    `de advertentielanding verwijst naar adressen die zonder server niet bestaan: ${kapot.join(', ')}`);
});

test('de diagnosepagina werkt ook als er verder niets werkt', () => {
  // Zij is het vangnet: als de API weg is, moet juist zij het nog doen, anders
  // is er geen manier om van buitenaf te zien wat er stuk is.
  const vind = statischeHosting();
  assert.ok(vind('/diagnose'), 'public/diagnose.html ontbreekt');
  assert.ok(vind('/assets/diagnose.js'), 'het script van de diagnosepagina ontbreekt');

  const html = fs.readFileSync(path.join(WORTEL, 'public', 'diagnose.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/,
    'de diagnosepagina hoort niet in Google te komen');

  const robots = fs.readFileSync(path.join(WORTEL, 'public', 'robots.txt'), 'utf8');
  assert.match(robots, /Disallow: \/diagnose/);
});
