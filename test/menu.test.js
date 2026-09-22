/**
 * De navigatie op een telefoon.
 *
 * Hier ging het mis met een regel die er onschuldig uitzag:
 * `.balk nav a.nav-secundair { display: none }` onder 720px. "Hoe het werkt",
 * "Kosten" en "Vragen" waren daarmee op een telefoon niet te bereiken — geen
 * responsief ontwerp maar verlies. Deze toets bewaakt dat elke pagina met een
 * balk een uitklapmenu heeft, en dat de klant zijn eigen dossier kan vinden.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { landingHtml } from '../src/landingpagina.js';
import { alleIngangen } from '../public/shared/campagnes.js';

const WORTEL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lees = (naam) => fs.readFileSync(path.join(WORTEL, 'public', naam), 'utf8');

/** Pagina's met een balk waar een bezoeker op kan landen. */
const MET_BALK = [
  'start.html', 'mijn.html', 'beheer.html', 'hoe-werkt-het.html',
  'privacy.html', 'voorwaarden.html', 'aanvraag-klassiek.html',
];

test('elke pagina met een balk heeft een uitklapmenu', () => {
  for (const naam of MET_BALK) {
    const html = lees(naam);
    assert.match(html, /<nav id="balk-nav"/, `${naam} heeft geen nav met een id om aan te haken`);
    assert.match(html, /assets\/menu\.js/, `${naam} laadt het menuscript niet`);
  }
});

test('ook de campagnepaginas hebben het menu', () => {
  for (const ingang of alleIngangen()) {
    const html = landingHtml(ingang);
    assert.match(html, /<nav id="balk-nav"/, `"${ingang.slug || '/'}" mist de nav-id`);
    assert.match(html, /assets\/menu\.js/, `"${ingang.slug || '/'}" laadt het menuscript niet`);
  }
});

test('een klant kan zijn eigen dossier vinden vanuit de navigatie', () => {
  // Dit ontbrak overal: wie terugkwam voor zijn zaak had geen enkele link.
  const balkVan = (html) => html.slice(html.indexOf('<nav id="balk-nav"'), html.indexOf('</nav>'));

  assert.match(balkVan(landingHtml(alleIngangen()[0])), /href="\/mijn"/);
  for (const naam of ['start.html', 'hoe-werkt-het.html', 'privacy.html', 'voorwaarden.html']) {
    assert.match(balkVan(lees(naam)), /href="\/mijn"/, `${naam} heeft geen link naar het dossier`);
  }
});

test('het open menu toont zijn links ook echt', () => {
  // Dit ging bijna mis op specificiteit: de regel die de links in de balk
  // verbergt woog zwaarder dan de regel die ze in het open paneel toont, dus
  // het menu ging wel open maar bleef leeg. Een browsertest ving het; deze
  // toets bewaakt dat de toonregel zwaar genoeg blijft.
  const css = fs.readFileSync(path.join(WORTEL, 'public', 'assets', 'stijl.css'), 'utf8');
  const verberg = css.indexOf('.balk--met-menu nav > *:not(.knop--primair)');
  const toon = css.indexOf('.balk--met-menu.balk--open nav > *');
  assert.ok(verberg > -1, 'de verbergregel hoort te bestaan');
  assert.ok(toon > -1, 'de toonregel moet twee klassen gebruiken, anders verliest hij');
  assert.ok(toon > verberg, 'en hij moet erna staan');
});

test('de inhoudelijke links worden niet langer zomaar verborgen', () => {
  // Zonder javascript mogen ze wijken - dan is er geen menu - maar zodra het
  // menu er is, horen ze bereikbaar te zijn.
  const css = fs.readFileSync(path.join(WORTEL, 'public', 'assets', 'stijl.css'), 'utf8');
  assert.doesNotMatch(css, /^\s*\.balk nav a\.nav-secundair \{ display: none; \}/m,
    'deze regel maakte de links op een telefoon onbereikbaar');
  assert.match(css, /\.balk:not\(\.balk--met-menu\) nav a\.nav-secundair \{ display: none; \}/);
});
