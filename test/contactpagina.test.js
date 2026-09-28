/**
 * De contactpagina.
 *
 * Deze pagina is de plek waar iemand met een probleem terechtkomt. Wat hier
 * misgaat is duurder dan een lelijke pagina: een knop naar een nummer dat niet
 * bestaat of een adres dat niemand leest, betekent dat iemand met een lopende
 * termijn in de leegte belt. Daarom toetst dit bestand vooral wat er *niet*
 * mag staan.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { contactHtml, contactpaginas, CONTACT_PAD } from '../src/contactpagina.js';

const PUBLIEK = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'public');

const MET_ALLES = {
  BEDRIJF_NAAM: 'nubeslist.nl',
  BEDRIJF_KVK: '78229197',
  BEDRIJF_POSTCODE_PLAATS: '8302 AB Emmeloord',
  BEDRIJF_EMAIL: 'info@nubeslist.nl',
  WHATSAPP_NUMMER: '+31 6 12345678',
};

test('zonder gegevens in de omgeving staan er geen lege of doodlopende knoppen', () => {
  const html = contactHtml({});
  assert.ok(!/WhatsApp/.test(html), 'geen whatsappknop zonder nummer');
  assert.ok(!/mailto:/.test(html), 'geen mailknop zonder adres');
  assert.ok(!/tel:/.test(html), 'geen telefoonknop zonder nummer');
  assert.ok(!/KvK-nummer/.test(html), 'geen lege rij in de bedrijfsgegevens');
  // Maar de pagina blijft bruikbaar: het eigen dossier staat er altijd.
  assert.match(html, /Naar mijn dossier/);
});

test('met gegevens in de omgeving staan ze er allemaal, en kloppen de links', () => {
  const html = contactHtml(MET_ALLES);
  assert.match(html, /https:\/\/wa\.me\/31612345678/, 'het nummer hoort zonder tekens in de link');
  assert.match(html, /mailto:info@nubeslist\.nl/);
  assert.match(html, /78229197/);
  assert.match(html, /8302 AB Emmeloord/);
});

test('de pagina zegt waarvoor je níet bij ons moet zijn', () => {
  // Wie belt over zijn uitkering zelf, moet bij de instantie zijn. Dat hier
  // niet zeggen levert teleurgestelde mensen en werk op.
  const html = contactHtml(MET_ALLES);
  assert.match(html, /particuliere dienstverlener/);
  assert.match(html, /moet je bij de instantie zijn/);
});

test('de pagina belooft geen bereikbaarheid die niet is afgesproken', () => {
  const html = contactHtml(MET_ALLES);
  assert.ok(!/24\/7|altijd bereikbaar|binnen een uur/i.test(html));
  assert.match(html, /binnen 1 werkdag/);
});

test('er wordt niet gevraagd om een burgerservicenummer per e-mail', () => {
  assert.match(contactHtml(MET_ALLES), /burgerservicenummer er niet in/);
});

test('de pagina wordt meegebouwd, is bereikbaar en staat in de voetregels', () => {
  const paginas = contactpaginas({});
  assert.equal(paginas.length, 1);
  assert.equal(paginas[0].bestand, 'contact.html');

  const opSchijf = fs.readFileSync(path.join(PUBLIEK, 'contact.html'), 'utf8');
  assert.equal(opSchijf, contactHtml(), 'public/contact.html loopt achter; draai npm run build');

  // Een pagina waar nergens heen wordt gelinkt, bestaat voor niemand.
  for (const bestand of ['index.html', 'uwv.html', 'beslistermijn.html', 'privacy.html']) {
    const html = fs.readFileSync(path.join(PUBLIEK, bestand), 'utf8');
    assert.match(html, /href="\/contact"/, `${bestand} verwijst niet naar de contactpagina`);
  }
});

test('contact staat in het menu, niet alleen onderaan de pagina', () => {
  // Wie een vraag heeft, scrolt niet eerst naar de voetregel. De balk is waar
  // iemand kijkt, en op een telefoon zit die balk achter de menuknop.
  const paginas = ['index.html', 'uwv.html', 'uwv-wia.html', 'beslistermijn.html',
    'hoe-werkt-het.html', 'contact.html', 'start.html', 'mijn.html', 'privacy.html',
    'voorwaarden.html', 'aanvraag-klassiek.html'];
  for (const bestand of paginas) {
    const html = fs.readFileSync(path.join(PUBLIEK, bestand), 'utf8');
    const balk = html.split('<nav id="balk-nav">')[1];
    assert.ok(balk, `${bestand} heeft geen menu`);
    const menu = balk.split('</nav>')[0];
    assert.match(menu, /href="\/contact"/, `${bestand} heeft geen contactlink in het menu`);
  }
});

test('de route staat in de server', async () => {
  const { PAGINAS } = await import('../server.js');
  assert.equal(PAGINAS[CONTACT_PAD], 'contact.html');
});
