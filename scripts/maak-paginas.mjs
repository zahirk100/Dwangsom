/**
 * Schrijft de landingspagina's uit src/landingpagina.js naar public/.
 *
 * Waarom echte bestanden en geen server die rendert? Twee redenen. Op Vercel
 * gaat het bestandssysteem vóór de functie, dus een bestand is de zekerste
 * route. En een advertentie wil dat titel, omschrijving en kop in de bron van
 * de pagina staan, niet dat javascript ze er later in zet.
 *
 * Uitvoeren met: node scripts/maak-paginas.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { alleLandingspaginas } from '../src/landingpagina.js';
import { campagnepaginas } from '../src/campagnepagina.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PUBLIEK = path.join(HIER, '..', 'public');

for (const { bestand, html } of [...alleLandingspaginas(), ...campagnepaginas()]) {
  writeFileSync(path.join(PUBLIEK, bestand), html);
  console.log(`  ${bestand.padEnd(26)} ${html.length} tekens`);
}
