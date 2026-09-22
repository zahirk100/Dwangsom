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
import { campagnepaginas, CAMPAGNE_PAD } from '../src/campagnepagina.js';
import { robotsTxt, sitemapXml } from '../src/seo.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PUBLIEK = path.join(HIER, '..', 'public');

const landingen = alleLandingspaginas();
for (const { bestand, html } of [...landingen, ...campagnepaginas()]) {
  writeFileSync(path.join(PUBLIEK, bestand), html);
  console.log(`  ${bestand.padEnd(26)} ${html.length} tekens`);
}

/*
  robots.txt en sitemap.xml horen bij dezelfde ronde.

  Een sitemap die met de hand wordt bijgehouden mist binnen een maand de
  nieuwste pagina, en dat is precies de pagina waarvoor je hem had. Daarom
  wordt hij hier uit dezelfde lijst geschreven die ook de bestanden maakt.

  Alleen pagina's die ook echt geïndexeerd mogen worden: de funnel en de
  beheeromgeving staan op noindex, en daarnaar verwijzen levert alleen
  waarschuwingen op in Search Console.
*/
const inSitemap = [
  { pad: '/', prioriteit: 1.0, frequentie: 'weekly' },
  // De losse advertentielanding: eigen onderwerp, eigen zoekwoorden.
  { pad: CAMPAGNE_PAD, prioriteit: 0.9, frequentie: 'monthly' },
  // Elke campagne-ingang. De brede ingangen (uwv, gemeente) staan hoger dan
  // de smalle (uwv-wia), want daar zit het meeste zoekvolume.
  ...landingen
    .filter(({ ingang }) => ingang.slug)
    .map(({ ingang }) => ({
      pad: `/${ingang.slug}`,
      prioriteit: ingang.zaak ? 0.7 : 0.8,
      frequentie: 'monthly',
    })),
  { pad: '/hoe-werkt-het', prioriteit: 0.8, frequentie: 'monthly' },
  { pad: '/voorwaarden', prioriteit: 0.3, frequentie: 'yearly' },
  { pad: '/privacy', prioriteit: 0.3, frequentie: 'yearly' },
];

writeFileSync(path.join(PUBLIEK, 'robots.txt'), robotsTxt());
console.log(`  ${'robots.txt'.padEnd(26)} ${robotsTxt().length} tekens`);
const sitemap = sitemapXml(inSitemap);
writeFileSync(path.join(PUBLIEK, 'sitemap.xml'), sitemap);
console.log(`  ${'sitemap.xml'.padEnd(26)} ${inSitemap.length} pagina's`);
