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
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { alleLandingspaginas } from '../src/landingpagina.js';
import { campagnepaginas, CAMPAGNE_PAD } from '../src/campagnepagina.js';
import { robotsTxt, sitemapXml } from '../src/seo.js';
import { kennispaginas } from '../src/kennispagina.js';
import { contactpaginas, CONTACT_PAD } from '../src/contactpagina.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PUBLIEK = path.join(HIER, '..', 'public');

const landingen = alleLandingspaginas();
const kennis = kennispaginas();
const contact = contactpaginas();
for (const { bestand, html } of [...landingen, ...campagnepaginas(), ...kennis, ...contact]) {
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
  // De kennispagina's: ze beantwoorden een vraag die iemand intypt voordat
  // hij weet dat wij bestaan. Dat is ander verkeer dan de campagnepagina's.
  ...kennis.map(({ pad }) => ({ pad, prioriteit: 0.8, frequentie: 'monthly' })),
  { pad: CONTACT_PAD, prioriteit: 0.5, frequentie: 'yearly' },
  { pad: '/voorwaarden', prioriteit: 0.3, frequentie: 'yearly' },
  { pad: '/privacy', prioriteit: 0.3, frequentie: 'yearly' },
];

/*
  Het lettertype.

  Figtree staat niet in de repository; de woff2-bestanden horen in
  public/assets/ te staan als figtree-400.woff2 tot en met figtree-800.woff2.
  Staan ze er, dan worden ze hier aangemeld; staan ze er niet, dan blijft dit
  bestand leeg en valt de site terug op het lettertype van het systeem. Zo
  staan er nooit vier verzoeken in de pagina die 404 opleveren.
*/
const GEWICHTEN = [400, 600, 700, 800];
const gevonden = GEWICHTEN.filter((g) => existsSync(path.join(PUBLIEK, 'assets', `figtree-${g}.woff2`)));
const lettertype = gevonden.length
  ? gevonden.map((g) => `@font-face{font-family:Figtree;font-weight:${g};font-display:swap;`
    + `src:url(/assets/figtree-${g}.woff2) format('woff2')}`).join('\n')
  : '/* Figtree niet gevonden in public/assets/; de site gebruikt het systeemlettertype. */';
writeFileSync(path.join(PUBLIEK, 'assets', 'lettertype.css'), `${lettertype}\n`);
console.log(`  ${'assets/lettertype.css'.padEnd(26)} ${gevonden.length} gewichten`);

/*
  De voorbeeldbrieven.

  Ze staan in `voorbeelden/` omdat ze daar gemaakt worden, maar de funnel heeft
  ze nodig op een adres dat de browser kan ophalen: de knop "Probeer met een
  voorbeeldbrief" haalt er een op. Kopiëren in plaats van dubbel bewaren, zodat
  er niet twee versies kunnen ontstaan.
*/
const VOORBEELDEN = path.join(HIER, '..', 'voorbeelden');
const NAAR = path.join(PUBLIEK, 'voorbeelden');
if (existsSync(VOORBEELDEN)) {
  mkdirSync(NAAR, { recursive: true });
  const brieven = readdirSync(VOORBEELDEN).filter((naam) => naam.endsWith('.pdf'));
  for (const naam of brieven) copyFileSync(path.join(VOORBEELDEN, naam), path.join(NAAR, naam));
  console.log(`  ${'voorbeelden/'.padEnd(26)} ${brieven.length} brieven`);
}

/*
  /aanvraag als echt bestand.

  Dit is het adres waar elke advertentie op uitkomt, en het was het enige
  adres van de site zonder eigen bestand: de server besliste per verzoek welke
  funnel erbij hoorde. Dat werkt zolang elk verzoek langs de server komt.
  Komt het niet, omdat de hosting public/ rechtstreeks uitlevert, dan bestaat
  juist dát adres niet en loopt al het advertentieverkeer op een 404 - terwijl
  de landingspagina ernaast het prima doet, want dat is wel een bestand.

  De keuze tussen de twee funnels staat in de omgeving en die is hier al
  bekend, dus hij kan net zo goed nu gemaakt worden. Eén bestand minder om
  aan te nemen dat het goed gaat.
*/
const FUNNELBESTAND = (process.env.FUNNEL || 'nieuw') === 'klassiek'
  ? 'aanvraag-klassiek.html'
  : 'start.html';
// /aanvraag-nieuw is het tweede adres van dezelfde funnel; het staat in de
// README, dus het hoort ook zonder server te werken.
for (const naam of ['aanvraag.html', 'aanvraag-nieuw.html']) {
  copyFileSync(path.join(PUBLIEK, naam === 'aanvraag.html' ? FUNNELBESTAND : 'start.html'),
    path.join(PUBLIEK, naam));
  console.log(`  ${naam.padEnd(26)} kopie van ${naam === 'aanvraag.html' ? FUNNELBESTAND : 'start.html'}`);
}

writeFileSync(path.join(PUBLIEK, 'robots.txt'), robotsTxt());
console.log(`  ${'robots.txt'.padEnd(26)} ${robotsTxt().length} tekens`);
const sitemap = sitemapXml(inSitemap);
writeFileSync(path.join(PUBLIEK, 'sitemap.xml'), sitemap);
console.log(`  ${'sitemap.xml'.padEnd(26)} ${inSitemap.length} pagina's`);
