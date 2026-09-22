/**
 * De losse advertentielanding.
 *
 * Achter deze pagina staat een advertentiebudget, en er staan drie dingen op
 * die bij een fout duur zijn:
 *
 *   - **Het tarief.** Zegt de landing 10% en rekent de funnel 25% af, dan is
 *     dat een onjuiste prijsvermelding aan een consument. Daarom komt het
 *     bedrag hier uit dezelfde bron als de rest van de applicatie en niet uit
 *     de tekst. Deze toets bewaakt dat het ook echt meebeweegt.
 *   - **De beloftes.** "UWV gaat hierdoor sneller beslissen" en "dit kan nooit
 *     gevolgen hebben voor je uitkering" zijn precies de twee zinnen die een
 *     wervende tekst wil maken en die niemand kan waarmaken.
 *   - **De uitgangen.** Een advertentieklik die de site in wandelt is betaald
 *     verkeer dat niets oplevert. Deze pagina heeft geen menu.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { campagneHtml, CAMPAGNE_PAD } from '../src/campagnepagina.js';
import { STANDAARD_PERCENTAGE } from '../public/shared/tarief.js';
import { TARIEF } from '../public/shared/dwangsom.js';

const html = (env = {}) => campagneHtml(env);

/**
 * Alleen de tekst die de bezoeker ziet.
 *
 * Zonder dit kijkt een toets naar "geen percentage" ook in de stylesheet mee,
 * en daar staat `max-width: 100%`. Dat is geen prijsvermelding.
 */
const zichtbaar = (env = {}) => campagneHtml(env).replace(/<style>[\s\S]*?<\/style>/g, '');

// ------------------------------------------------------------- het tarief ---

test('het percentage komt uit de omgeving, niet uit de tekst', () => {
  assert.match(zichtbaar({ TARIEF_PERCENTAGE: '10' }), /10%/);
  assert.ok(!zichtbaar({ TARIEF_PERCENTAGE: '10' }).includes('25%'),
    'er mag geen ander percentage blijven staan');
  assert.match(zichtbaar({ TARIEF_PERCENTAGE: '25' }), /25%/);
});

test('het rekenvoorbeeld rekent mee met het tarief', () => {
  // Bij 10% van € 1.000 hoort € 100 en € 900 - geen van drieën hardgecodeerd.
  const tien = html({ TARIEF_PERCENTAGE: '10' });
  assert.match(tien, /€ 100,00/);
  assert.match(tien, /€ 900,00/);
  const kwart = html({ TARIEF_PERCENTAGE: '25' });
  assert.match(kwart, /€ 250,00/);
  assert.match(kwart, /€ 750,00/);
});

test('bedragen boven de duizend krijgen een duizendtalpunt', () => {
  // "€ 1081,50" leest niet; dat is precies het bedrag dat de bezoeker
  // overhoudt en dus het bedrag dat je goed wilt hebben.
  const kwart = html({ TARIEF_PERCENTAGE: '25' });
  assert.match(kwart, /€ 1\.081,50/);
  assert.ok(!/€ \d{4},/.test(kwart), 'geen bedrag zonder duizendtalpunt');
});

test('een vast bedrag werkt ook, zonder dat er ergens een percentage blijft staan', () => {
  const vast = zichtbaar({ TARIEF_VAST: '129' });
  assert.match(vast, /€ 129/);
  assert.ok(!/\d+\s*%/.test(vast), 'bij een vast bedrag hoort nergens een percentage te staan');
});

test('zonder tarief noemt de pagina geen enkel bedrag voor onze hulp', () => {
  // Dezelfde afspraak als in de funnel: een verzonnen percentage op de pagina
  // waar iemand besluit te tekenen is erger dan geen percentage.
  const leeg = zichtbaar({ TARIEF_PERCENTAGE: '0' });
  assert.match(leeg, /vooraf/i);
  assert.ok(!/\d+\s*%/.test(leeg), 'geen verzonnen percentage');
  assert.ok(!/€ \d/.test(leeg.split('id="kosten"')[1].split('</section>')[0]),
    'in het kostenblok hoort dan geen bedrag te staan');
});

test('zonder omgeving valt de pagina terug op het gekozen tarief', () => {
  assert.match(html({}), new RegExp(`${STANDAARD_PERCENTAGE}%`));
});

// ----------------------------------------------------------- de beloftes ---

test('de pagina belooft niet dat UWV sneller gaat beslissen', () => {
  const h = html();
  assert.match(h, /kunnen wij niet garanderen/i);
  assert.ok(!/UWV beslist (dan )?sneller/i.test(h));
  assert.ok(!/zorgt ervoor dat UWV sneller/i.test(h));
});

test('de pagina belooft niet dat er nooit gevolgen zijn voor de uitkering', () => {
  const h = html();
  assert.ok(!/nooit gevolgen/i.test(h), 'dat is een belofte die niemand kan waarmaken');
  assert.ok(!/geen enkel risico/i.test(h));
  assert.match(h, /uitblijven van een beslissing/i, 'wel uitleggen waar de melding over gaat');
});

test('de pagina suggereert niet dat iedereen het maximumbedrag krijgt', () => {
  const h = html();
  assert.match(h, /tot € 1\.442/);
  assert.match(h, /hangt af van jouw situatie/i);
  assert.ok(!/je krijgt € 1\.442/i.test(h));
});

test('het maximum en de dagtarieven komen uit de wettelijke tabel', () => {
  const h = html();
  for (const tr of TARIEF.tranches) assert.ok(h.includes(`€ ${tr.perDag} per dag`), `€ ${tr.perDag} ontbreekt`);
  assert.ok(h.includes(String(TARIEF.maxDagen)), 'het aantal dagen hoort erin');
});

test('er staan geen verzonnen ervaringen van klanten op', () => {
  const h = html();
  for (const woord of ['testimonial', 'sterren', 'beoordeeld met', 'Trustpilot']) {
    assert.ok(!h.toLowerCase().includes(woord.toLowerCase()), `${woord} hoort hier niet`);
  }
});

test('de voorbeeldkaarten zijn als voorbeeld gemerkt', () => {
  // Een kaart met datums erin mag niet te lezen zijn als een echt dossier.
  const h = html();
  const kaarten = h.match(/class="voorbeeldkaart__merkje"/g) || [];
  assert.equal(kaarten.length, 2, 'beide kaarten horen een merkje te dragen');
  assert.match(h, /Voorbeeld</);
});

// ----------------------------------------------------------- de uitgangen ---

test('de balk heeft geen navigatie: elke link daar is een uitgang', () => {
  const balk = html().split('<header')[1].split('</header>')[0];
  assert.ok(!balk.includes('<a '), 'geen links in de balk van een advertentiepagina');
  assert.ok(!balk.includes('<nav'), 'geen menu');
});

test('alle knoppen gaan naar de funnel, met de herkomst erachter', () => {
  const h = html();
  const knoppen = [...h.matchAll(/href="(\/aanvraag[^"]*)"/g)].map((m) => m[1]);
  assert.ok(knoppen.length >= 4, `verwacht meerdere knoppen, kreeg ${knoppen.length}`);
  for (const k of knoppen) {
    assert.match(k, /instantie=uwv/, 'de instantie hoort al gekozen te zijn');
    assert.match(k, /bron=uwv-te-laat/, 'zonder herkomst is niet te meten wat deze pagina doet');
  }
});

test('de pagina hangt niet aan de stylesheets van de site', () => {
  // Verandert er iets aan de vormgeving van de site, dan verandert er niets
  // aan de pagina waar advertentiegeld achter zit.
  const h = html();
  assert.ok(!h.includes('stijl.css'), 'geen gedeelde stylesheet');
  assert.ok(!h.includes('landing.css'));
  assert.match(h, /<style>/);
});

// --------------------------------------------------------------- vindbaar ---

test('titel, omschrijving en canonical staan in de bron', () => {
  const h = html();
  assert.match(h, /<title>[^<]{30,}<\/title>/);
  assert.match(h, /<meta name="description" content="[^"]{80,}"/);
  assert.match(h, new RegExp(`<link rel="canonical" href="https://nubeslist\\.nl${CAMPAGNE_PAD}">`));
  assert.match(h, /og:image/);
});

test('de voetregel zegt dat wij geen overheidsinstantie zijn', () => {
  const h = html();
  assert.match(h, /geen\s+overheidsinstantie/);
  assert.match(h, /niet verbonden aan UWV/);
});

test('de pagina wordt meegebouwd en is als pad bereikbaar', async () => {
  const { campagnepaginas } = await import('../src/campagnepagina.js');
  const paginas = campagnepaginas({});
  assert.equal(paginas.length, 1);
  assert.equal(paginas[0].bestand, 'uwv-te-laat.html');
  const { PAGINAS } = await import('../server.js');
  assert.equal(PAGINAS[CAMPAGNE_PAD], 'uwv-te-laat.html');
});
