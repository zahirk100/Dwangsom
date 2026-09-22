/**
 * Maakt de advertentiebeelden voor de UWV-campagne.
 *
 * Waarom een script en geen map met plaatjes? Omdat de tekst op zo'n beeld
 * dezelfde belofte doet als de landingspagina, en die belofte verandert. Staat
 * het bedrag in een png, dan verandert het daar niet mee en adverteer je
 * maanden later met een verkeerd getal. Hier komt het uit dezelfde bron als de
 * site: public/shared/dwangsom.js en public/shared/tarief.js.
 *
 * Uitvoeren met:
 *   node scripts/maak-advertenties.mjs
 *
 * De beelden komen in public/advertenties/ en zijn daarmee ook via het web
 * bereikbaar - handig om er een advertentiesysteem naar te laten wijzen.
 *
 * Formaten (de gangbare plaatsingen):
 *   1200x628   Meta/LinkedIn link, en meteen de og:image van de landing
 *   1080x1080  vierkant, feed en carrousel
 *   1080x1350  4:5, de hoogste feedplaatsing die niet wordt bijgesneden
 *   1080x1920  story en reel
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TARIEF } from '../public/shared/dwangsom.js';
import { tarief } from '../public/shared/tarief.js';
import { advertentieteksten, LIMIETEN } from '../src/advertentieteksten.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const UIT = path.join(HIER, '..', 'public', 'advertenties');

/**
 * Playwright opzoeken zonder er een afhankelijkheid van te maken.
 *
 * De applicatie draait op nul npm-pakketten en dat blijft zo; dit is een
 * gereedschap voor marketingbeeld, geen onderdeel van de site. Daarom hier
 * zoeken in plaats van in package.json zetten - anders sleept elke deploy een
 * browser van honderden megabytes mee voor vier plaatjes.
 *
 * Eigen pad meegeven kan met PLAYWRIGHT_PAD.
 */
async function haalChromium() {
  const kandidaten = [
    process.env.PLAYWRIGHT_PAD,
    'playwright',
    '/opt/node22/lib/node_modules/playwright/index.mjs',
    '/usr/lib/node_modules/playwright/index.mjs',
  ].filter(Boolean);
  for (const kandidaat of kandidaten) {
    try {
      const mod = await import(kandidaat);
      if (mod.chromium) return mod.chromium;
    } catch { /* volgende proberen */ }
  }
  console.error(`
  Playwright niet gevonden.

  Dit script tekent de advertentiebeelden in een browser. De applicatie zelf
  heeft geen enkel npm-pakket nodig; dit gereedschap wel.

    npm install -g playwright && npx playwright install chromium

  Staat hij ergens anders, geef dan het pad mee:

    PLAYWRIGHT_PAD=/pad/naar/playwright/index.mjs node scripts/maak-advertenties.mjs
`);
  process.exit(1);
}

const t = tarief(process.env);
const MAX = String(TARIEF.maxBedrag).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const PRIJS = t.bekend
  ? (t.soort === 'vast' ? `Alleen bij een vergoeding: € ${t.bedrag}` : `Alleen bij een vergoeding: ${t.percentage}%`)
  : 'Je hoort vooraf wat het kost';

/**
 * De vier boodschappen.
 *
 * Elk beeld doet één ding. Een advertentie die drie dingen zegt wordt in de
 * feed niet gelezen maar weggescrold.
 *
 *   herkenning  - "dit gaat over mij"        (breedste bereik)
 *   bedrag      - "er kan geld tegenover"    (hoogste doorklik, laagste kwaliteit)
 *   geruststelling - "het is veilig"         (voor wie al twijfelde)
 *   eenvoud     - "ik hoef het niet te snappen"
 */
export const BOODSCHAPPEN = [
  {
    id: 'herkenning',
    oog: 'Wacht je al maanden op UWV?',
    onder: 'Upload je brief. Wij zoeken gratis uit of UWV al had moeten beslissen.',
    chip: 'Gratis controle',
    cta: 'Controleer mijn UWV-brief',
    kleur: 'blauw',
  },
  {
    id: 'bedrag',
    oog: `UWV te laat?<br>Tot € ${MAX}`,
    onder: 'Blijft een beslissing uit, dan kan je wettelijke vergoeding oplopen. Of dat voor jou geldt, controleren wij gratis.',
    chip: 'Wettelijke vergoeding',
    cta: 'Controleer mijn situatie',
    kleur: 'groen',
  },
  {
    id: 'geruststelling',
    oog: 'Geen bezwaar.<br>Alleen een melding.',
    onder: 'De melding gaat over het uitblijven van een beslissing, niet over de inhoud van je zaak.',
    chip: 'Je zit nergens aan vast',
    cta: 'Lees wat het betekent',
    kleur: 'blauw',
  },
  {
    id: 'eenvoud',
    oog: 'Geen idee of UWV te laat is?',
    onder: 'Hoeft ook niet. Upload je brief, dan zoeken wij de datum op die voor jouw zaak geldt.',
    chip: 'Binnen een minuut',
    cta: 'Upload mijn UWV-brief',
    kleur: 'donker',
  },
];

export const FORMATEN = [
  { id: '1200x628', breedte: 1200, hoogte: 628 },
  { id: '1080x1080', breedte: 1080, hoogte: 1080 },
  { id: '1080x1350', breedte: 1080, hoogte: 1350 },
  { id: '1080x1920', breedte: 1080, hoogte: 1920 },
];

const PALET = {
  blauw: { vlak: '#f2f7fe', accent: '#24509a', oog: '#14213a', onder: '#42536e', chipVlak: '#dfeafb', chipTekst: '#24509a' },
  groen: { vlak: '#eefaf3', accent: '#15784a', oog: '#0f2e20', onder: '#3c5a4b', chipVlak: '#d4f0e0', chipTekst: '#15784a' },
  donker: { vlak: '#1c3a6e', accent: '#ffffff', oog: '#ffffff', onder: '#cfdcf0', chipVlak: 'rgba(255,255,255,.16)', chipTekst: '#ffffff' },
};

/** Eén beeld als losstaande html; playwright maakt er een png van. */
export function beeldHtml(boodschap, formaat) {
  const p = PALET[boodschap.kleur];
  const donker = boodschap.kleur === 'donker';
  const staand = formaat.hoogte / formaat.breedte;
  // Op een story is er veel hoogte en weinig breedte, op 1200x628 andersom.
  // Maten alleen op de breedte baseren gaf op 1200x628 een koptekst die zo
  // groot werd dat de knop eronder buiten beeld viel. Daarom telt de kleinste
  // van de twee: een beeld heeft nooit meer ruimte dan zijn krapste kant.
  const oogMaat = Math.round(Math.min(
    formaat.breedte * (staand > 1.5 ? 0.082 : staand > 1.1 ? 0.078 : 0.072),
    formaat.hoogte * 0.092,
  ));
  const onderMaat = Math.round(oogMaat * 0.4);
  const schaal = oogMaat / 78;
  const marge = Math.round(Math.min(formaat.breedte * 0.075, formaat.hoogte * 0.085));
  // Op een liggend beeld blijft de tekst links, zodat het vlak rechts leeg
  // blijft en de kop niet over de cirkel heen loopt.
  const tekstBreedte = staand > 1.1 ? '100%' : '62%';

  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${formaat.breedte}px; height: ${formaat.hoogte}px; overflow: hidden;
    background: ${p.vlak}; color: ${p.oog};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: ${marge}px; position: relative;
  }
  body::after {
    content: ""; position: absolute; right: ${-formaat.breedte * 0.22}px;
    top: ${-formaat.breedte * 0.18}px;
    width: ${formaat.breedte * 0.72}px; height: ${formaat.breedte * 0.72}px; border-radius: 50%;
    background: ${donker ? 'rgba(255,255,255,.06)' : 'rgba(36,80,154,.05)'};
  }
  .laag { position: relative; z-index: 1; }
  .merk { display: flex; align-items: center; gap: ${Math.round(12 * schaal)}px;
    font-size: ${Math.round(onderMaat * 0.95)}px; font-weight: 700; color: ${donker ? '#fff' : '#14213a'}; }
  .merk svg { width: ${Math.round(40 * schaal)}px; height: ${Math.round(40 * schaal)}px; border-radius: ${Math.round(11 * schaal)}px; }
  .merk em { font-style: normal; color: ${donker ? '#9dc0f2' : '#24509a'}; }
  .chip { display: inline-block; padding: ${Math.round(9 * schaal)}px ${Math.round(18 * schaal)}px;
    border-radius: 999px; background: ${p.chipVlak}; color: ${p.chipTekst};
    font-size: ${Math.round(onderMaat * 0.82)}px; font-weight: 700;
    margin-bottom: ${Math.round(oogMaat * 0.42)}px; }
  .laag { max-width: ${tekstBreedte}; }
  h1 { font-size: ${oogMaat}px; line-height: 1.08; letter-spacing: -0.028em; font-weight: 800;
    color: ${p.oog}; }
  p { margin-top: ${Math.round(oogMaat * 0.3)}px; font-size: ${onderMaat}px; line-height: 1.4;
    color: ${p.onder}; max-width: 30ch; }
  .cta { display: inline-flex; align-items: center; gap: ${Math.round(12 * schaal)}px;
    padding: ${Math.round(onderMaat * 0.72)}px ${Math.round(onderMaat * 1.25)}px;
    border-radius: ${Math.round(14 * schaal)}px;
    background: ${donker ? '#fff' : p.accent}; color: ${donker ? '#1c3a6e' : '#fff'};
    font-size: ${Math.round(onderMaat * 1.02)}px; font-weight: 700; }
  .voet { display: flex; align-items: center; justify-content: space-between; gap: ${marge}px; flex-wrap: wrap;
    margin-top: ${Math.round(oogMaat * 0.42)}px; }
  .prijs { font-size: ${Math.round(onderMaat * 0.86)}px; color: ${p.onder}; font-weight: 600; }
  .bron { font-size: ${Math.round(onderMaat * 0.66)}px; line-height: 1.3;
    color: ${donker ? '#9dc0f2' : '#8a95a8'}; max-width: 46ch; }
</style></head><body>

  <div class="laag merk">
    <svg viewBox="0 0 64 64"><defs><linearGradient id="v" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b7ad4"/><stop offset="1" stop-color="#1c3a6e"/></linearGradient></defs>
      <rect width="64" height="64" rx="16" fill="${donker ? '#ffffff' : 'url(#v)'}"/>
      <path d="M22.5 33.2 30.8 41.5 51 18.5" fill="none" stroke="${donker ? '#1c3a6e' : '#fff'}"
            stroke-width="6.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span>nubeslist<em>.nl</em></span>
  </div>

  <div class="laag">
    <span class="chip">${boodschap.chip}</span>
    <h1>${boodschap.oog}</h1>
    <p>${boodschap.onder}</p>
    <div class="voet">
      <span class="cta">${boodschap.cta}</span>
      <span class="prijs">${PRIJS}</span>
    </div>
  </div>

  <p class="laag bron">nubeslist.nl is een particuliere dienstverlener en niet verbonden aan UWV.</p>

</body></html>`;
}

/**
 * Weigeren om een beeld te maken waar de tekst niet in past.
 *
 * Een advertentie met een afgesneden knop is geld weggooien, en op een png
 * zie je het pas als je hem opent. Dit is de enige controle die dat vangt
 * voordat het bestand bestaat.
 */
async function controleerPassend(pagina, wat) {
  const meting = await pagina.evaluate(() => {
    const b = document.body;
    // Niet naar scrollHeight kijken: het decoratieve rondje steekt met opzet
    // buiten het beeld uit, en dan meldt scrollHeight een overloop die er voor
    // de kijker niet is. Wat telt zijn de blokken die tekst dragen.
    const leesbaar = [...b.querySelectorAll('h1, p, .cta, .chip, .merk')];
    const buiten = leesbaar
      .filter((n) => {
        const r = n.getBoundingClientRect();
        return r.bottom > b.clientHeight + 1 || r.right > b.clientWidth + 1
          || r.top < -1 || r.left < -1;
      })
      .map((n) => n.tagName.toLowerCase() + (n.className ? '.' + n.className.trim().replace(/\s+/g, '.') : ''));
    const onderkant = Math.max(...leesbaar.map((n) => n.getBoundingClientRect().bottom));
    return { onderkant: Math.round(onderkant), past: b.clientHeight, buiten };
  });
  if (meting.buiten.length > 0) {
    console.error(`\n  Past niet: ${wat} - tekst loopt tot ${meting.onderkant}px in `
      + `${meting.past}px, buiten beeld: ${meting.buiten.join(', ')}`);
    process.exitCode = 1;
  }
}

// Alleen tekenen als dit bestand zelf wordt uitgevoerd. Wie alleen `beeldHtml`
// importeert - een toets bijvoorbeeld - hoort geen browser te starten.
const ZELF = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (!ZELF) {
  // eslint-disable-next-line no-empty
} else {
mkdirSync(UIT, { recursive: true });
const chromium = await haalChromium();
const browser = await chromium.launch(
  process.env.CHROMIUM_PAD ? { executablePath: process.env.CHROMIUM_PAD } : {});
let aantal = 0;
for (const boodschap of BOODSCHAPPEN) {
  for (const formaat of FORMATEN) {
    const pagina = await browser.newPage({ viewport: { width: formaat.breedte, height: formaat.hoogte } });
    await pagina.setContent(beeldHtml(boodschap, formaat), { waitUntil: 'load' });
    await controleerPassend(pagina, `${boodschap.id} ${formaat.id}`);
    const naam = `uwv-${boodschap.id}-${formaat.id}.png`;
    await pagina.screenshot({ path: path.join(UIT, naam) });
    await pagina.close();
    console.log(`  ${naam}`);
    aantal++;
  }
}

// De deelkaart die de landingspagina als og:image gebruikt, is hetzelfde
// beeld. Zo ziet een gedeelde link er hetzelfde uit als de advertentie.
const deel = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await deel.setContent(beeldHtml(BOODSCHAPPEN[0], { id: 'og', breedte: 1200, hoogte: 630 }), { waitUntil: 'load' });
await deel.screenshot({ path: path.join(UIT, 'uwv-deelkaart.png') });
await deel.close();
console.log('  uwv-deelkaart.png');

await browser.close();
console.log(`\n  ${aantal + 1} beelden in public/advertenties/`);

// -------------------------------------------------------------- het blad ---

/**
 * Het overzicht om uit te knippen en in een advertentiesysteem te plakken.
 *
 * Dit bestand wordt geschreven, niet bijgehouden. Anders drijft het af van de
 * teksten in src/advertentieteksten.js, en dan plak je maanden later een kop
 * in Google die nergens meer op slaat.
 */
function blad() {
  const t = advertentieteksten(process.env);
  const teken = (r) => `${r} *(${r.length})*`;
  const regels = [];
  const r = (...x) => regels.push(...x);

  r('# Campagne UWV — teksten en beelden', '',
    '> Dit bestand wordt geschreven door `node scripts/maak-advertenties.mjs`.',
    '> Pas de teksten aan in `src/advertentieteksten.js` en draai het opnieuw;',
    '> handmatige wijzigingen hier gaan bij de volgende ronde verloren.', '',
    `Landingspagina: **https://nubeslist.nl/uwv-te-laat**  `,
    `Tarief in deze teksten: **${PRIJS}**`, '',
    '---', '');

  r('## Google — responsive search ad', '',
    `### Koppen (max ${LIMIETEN.googleKop} tekens)`, '');
  for (const k of t.google.koppen) r(`- ${teken(k)}`);
  r('', `### Omschrijvingen (max ${LIMIETEN.googleOmschrijving} tekens)`, '');
  for (const o of t.google.omschrijvingen) r(`- ${teken(o)}`);
  r('', `### Weergegeven pad (max ${LIMIETEN.googlePad} tekens)`, '');
  for (const pad of t.google.paden) r(`- ${teken(pad)}`);

  r('', '### Zoekwoorden', '', '**Het probleem — hier zit de doelgroep**', '');
  for (const z of t.zoekwoorden.probleem) r(`- ${z}`);
  r('', '**De oplossing — weinig volume, hogere prijs, hogere intentie**', '');
  for (const z of t.zoekwoorden.oplossing) r(`- ${z}`);
  r('', '**Uitsluiten — anders betaal je voor verkeer dat nooit klant wordt**', '');
  r(t.zoekwoorden.uitsluiten.map((z) => `\`${z}\``).join(' · '));

  r('', '---', '', '## Meta — per boodschap één advertentie', '');
  for (const a of t.meta.advertenties) {
    r(`### ${a.id}`, '',
      '**Primaire tekst**', '', '```', a.tekst, '```', '',
      `**Kop** ${teken(a.kop)}  `,
      `**Omschrijving** ${teken(a.omschrijving)}  `,
      `**Knop** ${a.knop}`, '',
      '**Beelden**', '');
    for (const f of FORMATEN) r(`- \`advertenties/uwv-${a.id}-${f.id}.png\` — ${f.id}`);
    r('');
  }

  r('---', '', '## Waar deze teksten bewust vaag blijven', '',
    'Drie dingen staan er met opzet niet in, omdat ze niet waar te maken zijn:', '',
    '- dat UWV **sneller** gaat beslissen door een melding;',
    '- dat een melding **nooit** gevolgen heeft voor een lopende zaak;',
    `- dat iemand **€ ${MAX}** krijgt. Er staat steeds *tot* € ${MAX}.`, '',
    'Een toets bewaakt dat (`test/advertentieteksten.test.js`). Wordt de tekst',
    'wervender gemaakt, dan valt die toets om.', '');

  return regels.join('\n');
}

const bladPad = path.join(HIER, '..', 'docs', 'campagne-uwv.md');
writeFileSync(bladPad, blad());
console.log('  docs/campagne-uwv.md');
}
