/**
 * De ingangen: één intakeflow met veel voordeuren.
 *
 * Elke advertentie landt op een eigen pagina met eigen titel, omschrijving en
 * kop, en geeft de instantie door aan de funnel. Dat is de hele belofte van de
 * personalisatie, dus staat hij hier vast: bestanden die echt bestaan, teksten
 * die van elkaar verschillen, en een knop die de zaak meeneemt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALGEMEEN, CAMPAGNES, alleIngangen, ingangVoor, campagnePaden } from '../public/shared/campagnes.js';
import { landingHtml, alleLandingspaginas } from '../src/landingpagina.js';
import { BESTUURSORGANEN, zoekZaaktype } from '../public/shared/catalogus.js';
import { siteBasis } from '../src/site.js';
import { faqSchema } from '../src/seo.js';

const SITE = siteBasis();

const WORTEL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUBLIEK = path.join(WORTEL, 'public');

test('elke ingang heeft alle teksten die de pagina nodig heeft', () => {
  for (const ingang of alleIngangen()) {
    for (const veld of ['titel', 'omschrijving', 'kop', 'onder', 'lead', 'knop']) {
      const waarde = ingang[veld];
      assert.ok(typeof waarde === 'string' && waarde.trim().length > 0,
        `ingang "${ingang.slug || '/'}" mist ${veld}`);
    }
    assert.ok(ingang.titel.length <= 70, `titel van "${ingang.slug || '/'}" is te lang voor een zoekresultaat`);
    assert.ok(ingang.omschrijving.length >= 70, `omschrijving van "${ingang.slug || '/'}" is te kort`);
  }
});

test('de instantie en het zaaktype van een ingang bestaan echt', () => {
  for (const c of CAMPAGNES) {
    // Een lege instantie mag: "nog-niet-te-laat" gaat over een termijn die
    // nog loopt, bij welke instantie dan ook. Een gevulde moet kloppen.
    assert.ok(c.instantie === '' || BESTUURSORGANEN.some((b) => b.id === c.instantie),
      `"${c.slug}" verwijst naar onbekende instantie ${c.instantie}`);
    if (c.zaak) {
      const zaaktype = zoekZaaktype(c.zaak);
      assert.ok(zaaktype, `"${c.slug}" verwijst naar onbekend zaaktype ${c.zaak}`);
      assert.equal(zaaktype.bestuursorgaan, c.instantie,
        `"${c.slug}": ${c.zaak} hoort bij ${zaaktype.bestuursorgaan}, niet bij ${c.instantie}`);
    }
  }
});

test('geen twee ingangen delen een pad, een titel of een kop', () => {
  for (const veld of ['slug', 'titel', 'kop']) {
    const waarden = alleIngangen().map((i) => i[veld]);
    assert.equal(new Set(waarden).size, waarden.length, `twee ingangen hebben dezelfde ${veld}`);
  }
});

test('elke ingang is ook echt als bestand uitgeschreven', () => {
  for (const { bestand } of alleLandingspaginas()) {
    assert.ok(fs.existsSync(path.join(PUBLIEK, bestand)),
      `public/${bestand} ontbreekt; draai node scripts/maak-paginas.mjs`);
  }
});

test('de uitgeschreven bestanden lopen niet achter op het template', () => {
  // Anders staat er een oude tekst online terwijl de broncode al bij is.
  for (const { bestand, html } of alleLandingspaginas()) {
    const opSchijf = fs.readFileSync(path.join(PUBLIEK, bestand), 'utf8');
    assert.equal(opSchijf, html,
      `public/${bestand} wijkt af van src/landingpagina.js; draai node scripts/maak-paginas.mjs`);
  }
});

test('de knop neemt de instantie en het zaaktype mee naar de funnel', () => {
  const wia = CAMPAGNES.find((c) => c.slug === 'uwv-wia');
  const html = landingHtml(wia);
  assert.match(html, /href="\/aanvraag\?instantie=uwv&amp;zaak=uwv-wia"/);

  // De algemene pagina kiest niets voor de bezoeker, die vraagt het hem.
  const algemeen = landingHtml(ALGEMEEN);
  assert.match(algemeen, /Op wie wacht je\?/);
  assert.ok(!/href="\/aanvraag\?instantie=[a-z]+&amp;zaak=/.test(algemeen),
    'de homepage hoort geen zaaktype voor te selecteren');
});

test('een campagnepagina noemt zijn eigen instantie en niet "de instantie"', () => {
  const bijstand = landingHtml(CAMPAGNES.find((c) => c.slug === 'bijstand'));
  assert.match(bijstand, /Het lijkt erop dat je gemeente te laat is/);
  assert.match(bijstand, /Bijstandsuitkering aanvragen/);
  assert.ok(!/Het lijkt erop dat UWV te laat is/.test(bijstand),
    'een gemeentepagina hoort geen UWV als voorbeeld te geven');

  const aow = landingHtml(CAMPAGNES.find((c) => c.slug === 'aow'));
  assert.match(aow, /Het lijkt erop dat de SVB te laat is/);
});

test('elke pagina heeft zijn eigen canonieke url en og-tags', () => {
  for (const ingang of alleIngangen()) {
    const html = landingHtml(ingang);
    const url = ingang.slug ? `${SITE}/${ingang.slug}` : `${SITE}/`;
    assert.match(html, new RegExp(`<link rel="canonical" href="${url}">`), `${ingang.slug || '/'} mist canonical`);
    assert.match(html, new RegExp(`<meta property="og:url" content="${url}">`), `${ingang.slug || '/'} mist og:url`);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  }
});

test('ingangVoor vindt een pagina terug aan haar pad', () => {
  assert.equal(ingangVoor('/').slug, '');
  assert.equal(ingangVoor('/uwv-wia').slug, 'uwv-wia');
  assert.equal(ingangVoor('uwv-wia.html').slug, 'uwv-wia');
  assert.equal(ingangVoor('/bestaat-niet'), null);
});

test('de routetabel kent elk campagnepad', async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(WORTEL, 'data', 'campagnes-'));
  const { PAGINAS } = await import('../server.js');
  try {
    for (const pad of campagnePaden()) {
      assert.equal(PAGINAS[pad], `${pad.slice(1)}.html`, `${pad} staat niet in de routetabel`);
    }
  } finally {
    fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
  }
});

test('de teksten spreken de bezoeker aan met je, niet met u', () => {
  for (const ingang of alleIngangen()) {
    for (const veld of ['kop', 'onder', 'lead', 'knop', 'omschrijving']) {
      const tekst = ingang[veld];
      assert.ok(!/\b(uw|Uw)\b/.test(tekst), `"${ingang.slug || '/'}" gebruikt "uw" in ${veld}: ${tekst}`);
    }
  }
});

// --------------------------------------------------- de nieuwe indeling ---

test('de pagina volgt de volgorde van de bezoeker, niet die van een brochure', () => {
  const html = landingHtml(ALGEMEEN);
  const volgorde = ['id="herkenning"', 'id="vergoeding"', 'id="werkwijze"', 'id="verdeling"',
    'id="dossier"', 'id="waarvoor"', 'id="waarom"', 'id="kosten"', 'id="vertrouwen"', 'id="vragen"'];
  let vorige = -1;
  for (const merk of volgorde) {
    const plek = html.indexOf(merk);
    assert.ok(plek > vorige, `${merk} staat op de verkeerde plek`);
    vorige = plek;
  }
});

test('het bedrag staat al in het eerste scherm, niet pas verderop', () => {
  const html = landingHtml(ALGEMEEN);
  const hero = html.slice(0, html.indexOf('id="herkenning"'));
  assert.match(hero, /1\.442/, 'de belangrijkste trigger hoort boven de vouw');
});

test('zonder omgevingsvariabele staat het gekozen tarief van 20% op de pagina', () => {
  const kosten = kostensectie(landingHtml(ALGEMEEN, {}));
  assert.match(kosten, /20%/);
});

test('een uitdrukkelijk leeggezet tarief levert geen verzonnen getal op', () => {
  const kosten = kostensectie(landingHtml(ALGEMEEN, { TARIEF_PERCENTAGE: '0' }));
  assert.match(kosten, /vooraf precies wat onze vergoeding is/);
  assert.ok(!/\d+%/.test(kosten), 'er hoort geen verzonnen percentage te staan');
});

const kostensectie = (html) => html.slice(html.indexOf('id="kosten"'), html.indexOf('id="vertrouwen"'));

test('met een ingesteld tarief staat het bedrag er wél, met rekenvoorbeeld', () => {
  const html = landingHtml(ALGEMEEN, { TARIEF_PERCENTAGE: '25' });
  const kosten = kostensectie(html);
  assert.match(kosten, /25%/);
  assert.match(kosten, /Rekenvoorbeeld/);
});

test('de te brede belofte over "vrijwel elke aanvraag" staat er niet meer', () => {
  // Die zin was juridisch te ruim: art. 4:17 kent voorwaarden en uitzonderingen.
  for (const ingang of alleIngangen()) {
    const html = landingHtml(ingang);
    assert.ok(!/vrijwel elke aanvraag/.test(html),
      `"${ingang.slug || '/'}" belooft nog te veel`);
  }
});

test('elke pagina zegt wie erachter zit en dat het geld naar de klant gaat', () => {
  const html = landingHtml(ALGEMEEN);
  assert.match(html, /Achter NuBeslist/);
  assert.match(html, /KvK/);
  assert.match(html, /rechtstreeks op je eigen\s+rekening/);
  assert.match(html, /href="\/privacy"/);
});

test('de algemene pagina vraagt om een instantie en laadt het script dat dat verwerkt', () => {
  const html = landingHtml(ALGEMEEN);
  assert.match(html, /id="instantiekeuze"/);
  assert.match(html, /id="procedurekeuze"/);
  assert.match(html, /data-instantie="uwv"/);
  assert.match(html, /assets\/landing\.js/);
});

test('er is een ingang voor wie nog niet te laat is', () => {
  // Deze bezoeker kan vandaag niets vorderen en is op elke andere pagina een
  // afhaker. Hij hoort een eigen voordeur te hebben, geen voetnoot in de FAQ.
  const ingang = CAMPAGNES.find((c) => c.slug === 'nog-niet-te-laat');
  assert.ok(ingang, 'de vooraanmelding hoort een eigen ingang te zijn');
  assert.equal(ingang.instantie, '', 'deze ingang geldt voor elke instantie');
  assert.match(ingang.knop, /bijhouden|bijhoud|Houd/i);
});

test('elke pagina heeft een plek waar de volgende stap verschijnt', () => {
  // Zonder dit vak veranderde er na een keuze wel van alles, maar allemaal
  // boven de vouw: op een telefoon leek een tik niets te doen en stond er bij
  // de keuzeknoppen geen knop om verder te gaan.
  for (const ingang of alleIngangen()) {
    const html = landingHtml(ingang);
    if (!html.includes('id="instantiekeuze"')) continue;
    assert.match(html, /id="keuzeactie"/,
      `"${ingang.slug || '/'}" heeft keuzeknoppen maar geen vak voor de volgende stap`);
  }
});

// ------------------------------------------- elke zaakpagina een eigen kern --

/*
 * De aanleiding is een meting in Search Console: eenentwintig pagina's wel
 * gevonden, niet opgenomen. /uwv-wia en /jeugdhulp bleken toen 499 van hun 531
 * regels te delen - één pagina in twintig jasjes. Deze toetsen bewaken dat er
 * per zaaksoort een eigen kern blijft staan.
 */

const ZAAKPAGINAS = alleIngangen().filter((i) => i.slug && i.zaak);

function zinnenVan(ingang) {
  return landingHtml(ingang, {})
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.?!])\s+/)
    .map((z) => z.trim())
    .filter((z) => z.length > 25);
}

test('elke zaakpagina noemt zijn eigen termijn en zijn eigen voorbeeld', () => {
  const voorbeelden = new Set();
  for (const ingang of ZAAKPAGINAS) {
    const html = landingHtml(ingang, {});
    assert.match(html, /id="termijn"/, `/${ingang.slug} mist het blok met de beslistermijn`);

    const kop = /<h2>Hoelang mag ([^<]+?) over ([^<]+?) doen\?<\/h2>/.exec(html);
    assert.ok(kop, `/${ingang.slug} mist een kop over de termijn`);
    assert.ok(!/\(/.test(kop[2]), `/${ingang.slug}: "${kop[2]}" leest niet als een zin`);

    // Het rekenvoorbeeld hoort per zaaksoort te verschillen; staan er dertien
    // keer dezelfde datums, dan hebben wij dertien keer dezelfde pagina.
    const stappen = /Je dient de aanvraag in op <strong>([^<]+)<\/strong>[\s\S]*?staat er\s*<strong>([^<]+)<\/strong>/.exec(html);
    assert.ok(stappen, `/${ingang.slug} mist het rekenvoorbeeld`);
    voorbeelden.add(`${stappen[1]}|${stappen[2]}`);
  }
  assert.equal(voorbeelden.size, ZAAKPAGINAS.length,
    'twee zaakpagina\'s tonen hetzelfde rekenvoorbeeld');
});

test('twee zaakpagina\'s delen niet bijna hun hele tekst', () => {
  /*
   * Niet nul: kop, voet en de uitleg over hoe het werkt horen gelijk te zijn.
   * Wel een plafond, want daarboven is het voor een zoekmachine één pagina.
   *
   * Het was 94%. Het dichtst bij elkaar zitten nu /uwv-wia en /uwv-ww met 83%,
   * en dat is eerlijk gezegd omdat die twee procedures het ook écht zijn:
   * dezelfde instantie, dezelfde termijn van acht weken, dezelfde grondslag.
   * Blijft Google die twee overslaan, dan is samenvoegen onder /uwv de
   * volgende stap - niet nog meer tekst erbij verzinnen.
   */
  const grens = 0.85;
  for (let i = 1; i < ZAAKPAGINAS.length; i += 1) {
    const a = zinnenVan(ZAAKPAGINAS[i - 1]);
    const b = new Set(zinnenVan(ZAAKPAGINAS[i]));
    const gedeeld = a.filter((z) => b.has(z)).length / a.length;
    assert.ok(gedeeld < grens,
      `/${ZAAKPAGINAS[i - 1].slug} en /${ZAAKPAGINAS[i].slug} delen `
      + `${Math.round(gedeeld * 100)}% van hun zinnen`);
  }
});

test('de eigen vragen staan bovenaan en komen in het schema terecht', () => {
  for (const ingang of ZAAKPAGINAS.slice(0, 4)) {
    const html = landingHtml(ingang, {});
    const vragen = [...html.matchAll(/<summary[^>]*>([^<]*)<\/summary>/g)].map((m) => m[1]);
    assert.match(vragen[0], /^Wat is de beslistermijn voor /,
      `/${ingang.slug}: de eigen vraag hoort bovenaan te staan`);
    const schema = faqSchema(html, `https://x/${ingang.slug}`);
    assert.ok(schema, `/${ingang.slug} mist een FAQ-schema`);
    assert.ok(schema.mainEntity.length >= 5);
    assert.match(schema.mainEntity[0].name, /beslistermijn/i);
  }
});
