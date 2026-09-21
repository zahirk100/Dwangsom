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
  for (const naam of ['dwangsom.js', 'datum.js', 'catalogus.js', 'dossier.js', 'identiteit.js', 'brief.js']) {
    assert.ok(
      fs.existsSync(path.join(WORTEL, 'public', 'shared', naam)),
      `public/shared/${naam} ontbreekt; de browser importeert die rechtstreeks`,
    );
  }
});
