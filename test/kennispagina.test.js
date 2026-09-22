/**
 * De kennispagina's.
 *
 * Deze pagina's beantwoorden een vraag die iemand intypt voordat hij weet dat
 * wij bestaan. Dat maakt twee dingen belangrijk.
 *
 * **De inhoud moet kloppen met de rekenmodule.** De bedragen en termijnen
 * komen uit `dwangsom.js` en `catalogus.js`. Een uitlegpagina die iets anders
 * zegt dan de uitslag die de bezoeker even later krijgt, is erger dan geen
 * uitlegpagina.
 *
 * **Lege plekken vallen niet op.** Deze toetsen kwamen voort uit een echte
 * fout: de koppen boven de termijnentabellen stonden op `orgaan.naam` terwijl
 * de catalogus `label` gebruikt. Resultaat: vijf lege `<h3>`-koppen, vijf
 * naamloze tabellen, en niets dat stukging.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { kennispaginas, KENNISLINKS } from '../src/kennispagina.js';
import { TARIEF } from '../public/shared/dwangsom.js';
import { ZAAKTYPEN, BESTUURSORGANEN } from '../public/shared/catalogus.js';

const paginas = kennispaginas({ TARIEF_PERCENTAGE: '25' });
const vind = (pad) => paginas.find((p) => p.pad === pad).html;

/** De json-ld blokken als objecten. Elk blok apart, anders loopt een regex door. */
function schemas(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]));
}

// ------------------------------------------------------------ niets leegs ---

test('geen enkele kop of cel is leeg', () => {
  for (const { bestand, html } of paginas) {
    for (const tag of ['h1', 'h2', 'h3', 'td', 'th', 'summary']) {
      const leeg = html.match(new RegExp(`<${tag}[^>]*>\\\\s*</${tag}>`, 'g')) || [];
      assert.equal(leeg.length, 0, `${bestand} heeft ${leeg.length} lege <${tag}>`);
    }
  }
});

test('elke instantie staat met naam boven zijn tabel', () => {
  const html = vind('/beslistermijn');
  for (const orgaan of BESTUURSORGANEN) {
    if (orgaan.id === 'anders') continue;
    assert.ok(html.includes(`<h3>${orgaan.label}</h3>`), `${orgaan.label} mist zijn kop`);
  }
});

// ----------------------------------------------------- klopt met de bron ---

test('de termijnentabel komt uit de catalogus en mist niets', () => {
  const html = vind('/beslistermijn');
  const eigen = ZAAKTYPEN.filter((z) => z.bestuursorgaan !== 'anders');
  for (const zaak of eigen) {
    assert.ok(html.includes(zaak.label), `${zaak.id} staat niet in de tabel`);
    assert.ok(html.includes(zaak.grondslag), `de grondslag van ${zaak.id} ontbreekt`);
  }
  assert.ok(eigen.length >= 15, 'verwacht een volle tabel');
});

test('de bedragen komen uit de wettelijke tabel', () => {
  const html = vind('/dwangsom-berekenen');
  for (const tr of TARIEF.tranches) {
    assert.ok(html.includes(`&euro; ${tr.perDag} per dag`), `€ ${tr.perDag} ontbreekt`);
  }
  assert.ok(html.includes('1.442'), 'het maximum hoort erin');
  assert.ok(html.includes(String(TARIEF.maxDagen)), 'het aantal dagen hoort erin');
});

test('de optelling in de tabel klopt', () => {
  const html = vind('/dwangsom-berekenen');
  let som = 0;
  for (const tr of TARIEF.tranches) {
    som += tr.dagen * tr.perDag;
    const getoond = String(som).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    assert.ok(html.includes(`&euro; ${getoond}`), `tussentotaal € ${getoond} ontbreekt`);
  }
  assert.equal(som, TARIEF.maxBedrag, 'de tranches horen op te tellen tot het maximum');
});

test('het rekenvoorbeeld klopt met de tranches', () => {
  const html = vind('/dwangsom-berekenen');
  const eerste = TARIEF.tranches[0].dagen * TARIEF.tranches[0].perDag;
  const tien = 10 * TARIEF.tranches[1].perDag;
  assert.ok(html.includes(`&euro; ${eerste}`), `€ ${eerste} ontbreekt in het voorbeeld`);
  assert.ok(html.includes(`&euro; ${tien}`));
  assert.ok(html.includes(`&euro; ${eerste + tien}`), 'de som van het voorbeeld ontbreekt');
});

test('de twee weken uit de wet staan er, en geen ander getal', () => {
  const html = vind('/ingebrekestelling');
  assert.match(html, /twee weken/);
  assert.match(html, /4:17 lid 3/);
  assert.ok(!/drie weken|vier weken om alsnog/.test(html));
});

// ---------------------------------------------------------- geen beloftes ---

test('geen pagina belooft dat de instantie sneller beslist', () => {
  for (const { bestand, html } of paginas) {
    assert.ok(!/sneller beslis/i.test(html), `${bestand} doet een belofte over snelheid`);
    assert.ok(!/gegarandeerd/i.test(html), `${bestand} garandeert iets`);
  }
});

test('elke pagina zegt dat het geen juridisch advies is', () => {
  for (const { bestand, html } of paginas) {
    assert.match(html, /geen juridisch advies/, `${bestand} mist het voorbehoud`);
    assert.match(html, /geen\s+overheidsinstantie/, `${bestand} mist de disclaimer`);
  }
});

test('de uitsluitingen staan erbij, niet alleen de aanspraak', () => {
  // Een pagina die alleen vertelt wat je kunt krijgen en niet wanneer niet,
  // wekt verwachtingen die de rekenmodule даarna moet afbreken.
  const html = vind('/ingebrekestelling');
  for (const geval of ['Woo', 'Asiel', 'belanghebbende', 'buiten behandeling']) {
    assert.ok(html.toLowerCase().includes(geval.toLowerCase()), `${geval} ontbreekt`);
  }
});

// ------------------------------------------------------------- vindbaarheid ---

test('elke pagina heeft één h1, een eigen titel, omschrijving en canonical', () => {
  const gezien = new Set();
  for (const { pad, bestand, html } of paginas) {
    assert.equal((html.match(/<h1[^>]*>/g) || []).length, 1, `${bestand}: aantal h1`);
    const titel = /<title>([^<]+)<\/title>/.exec(html)[1];
    const omschrijving = /<meta name="description" content="([^"]+)"/.exec(html)[1];
    assert.ok(titel.length >= 20 && titel.length <= 70, `${bestand}: titel is ${titel.length} tekens`);
    assert.ok(omschrijving.length >= 90 && omschrijving.length <= 175,
      `${bestand}: omschrijving is ${omschrijving.length} tekens`);
    assert.ok(!gezien.has(titel), `dubbele titel: ${titel}`);
    gezien.add(titel);
    assert.ok(html.includes(`<link rel="canonical" href="https://nubeslist.nl${pad}">`),
      `${bestand}: canonical klopt niet`);
  }
});

test('elke pagina draagt een FAQ-schema waarvan de vragen op de pagina staan', () => {
  for (const { bestand, html } of paginas) {
    const faq = schemas(html).find((s) => s['@type'] === 'FAQPage');
    assert.ok(faq, `${bestand} mist het FAQ-schema`);
    assert.ok(faq.mainEntity.length >= 4, `${bestand} heeft maar ${faq.mainEntity.length} vragen`);
    for (const vraag of faq.mainEntity) {
      assert.ok(html.includes(vraag.name), `"${vraag.name}" staat niet op ${bestand}`);
    }
  }
});

// ------------------------------------------------------------ interne links ---

test('de pagina\'s verwijzen naar elkaar, maar niet naar zichzelf', () => {
  for (const { pad, bestand, html } of paginas) {
    const verder = /<div class="verder">([\s\S]*?)<\/div>/.exec(html)[1];
    assert.ok(!verder.includes(`href="${pad}"`), `${bestand} linkt in "verder lezen" naar zichzelf`);
    for (const link of KENNISLINKS) {
      if (link.pad === pad) continue;
      assert.ok(verder.includes(`href="${link.pad}"`), `${bestand} mist de link naar ${link.pad}`);
    }
  }
});

test('elke kennispagina staat in de voet van elke pagina', () => {
  for (const { bestand, html } of paginas) {
    const voet = /<footer[\s\S]*?<\/footer>/.exec(html)[0];
    for (const link of KENNISLINKS) {
      assert.ok(voet.includes(`href="${link.pad}"`), `${bestand}: voet mist ${link.pad}`);
    }
  }
});

test('de kennislinks staan ook in de voet van de campagne- en landingspagina\'s', async () => {
  const { alleLandingspaginas } = await import('../src/landingpagina.js');
  for (const { bestand, html } of alleLandingspaginas({ TARIEF_PERCENTAGE: '25' })) {
    const voet = /<footer[\s\S]*?<\/footer>/.exec(html)[0];
    for (const link of KENNISLINKS) {
      assert.ok(voet.includes(`href="${link.pad}"`), `${bestand}: voet mist ${link.pad}`);
    }
  }
});

test('elke kennispagina is als pad bereikbaar en staat in de sitemap', async () => {
  const { PAGINAS } = await import('../server.js');
  const fs = await import('node:fs');
  const sitemap = fs.readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  for (const { pad, bestand } of paginas) {
    assert.equal(PAGINAS[pad], bestand, `${pad} is niet bereikbaar`);
    assert.ok(sitemap.includes(`<loc>https://nubeslist.nl${pad}</loc>`), `${pad} mist in de sitemap`);
  }
});
