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

test('de prijsregel noemt het tarief en verder geen ander getal', () => {
  // De pagina noemt onze prijs op precies één plek. Staat daar iets anders
  // dan wat de funnel afrekent, dan is dat een onjuiste prijsvermelding.
  const prijsregel = (env) => /<div class="price2">([^<]*)<\/div>/.exec(zichtbaar(env))[1];
  assert.equal(prijsregel({ TARIEF_PERCENTAGE: '10' }), '10% van die vergoeding');
  assert.equal(prijsregel({ TARIEF_VAST: '129' }), '€ 129');
});

test('bedragen boven de duizend krijgen een duizendtalpunt', () => {
  // "€ 1442" leest niet als een bedrag; dat is het getal waar de bezoeker
  // naar kijkt en dus het getal dat je goed wilt hebben.
  const kwart = html({ TARIEF_PERCENTAGE: '25' });
  assert.match(kwart, /€ 1\.442/);
  assert.ok(!/€ \d{4}\b/.test(kwart), 'geen bedrag zonder duizendtalpunt');
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
  const prijsregel = /<div class="price2">([^<]*)<\/div>/.exec(leeg)[1];
  assert.ok(!/[€\d]/.test(prijsregel), `de prijsregel noemt dan geen bedrag: ${prijsregel}`);
});

test('zonder omgeving valt de pagina terug op het gekozen tarief', () => {
  assert.match(html({}), new RegExp(`${STANDAARD_PERCENTAGE}%`));
});

// ----------------------------------------------------------- de beloftes ---

test('de pagina belooft niet dat UWV sneller gaat beslissen', () => {
  const h = html();
  assert.match(h, /kunnen wij niet garanderen/i);
  assert.match(h, /sneller/i, 'de belofte die niet gedaan wordt, wordt wel benoemd');
  assert.ok(!/UWV beslist (dan )?sneller/i.test(h));
  assert.ok(!/zorgt ervoor dat UWV sneller/i.test(h));
});

test('de pagina belooft niet dat er nooit gevolgen zijn voor de uitkering', () => {
  const h = html();
  assert.ok(!/nooit gevolgen/i.test(h), 'dat is een belofte die niemand kan waarmaken');
  assert.ok(!/geen enkel risico/i.test(h));
  assert.match(h, /alleen over het feit dat je nog op een beslissing wacht/i,
    'wel uitleggen waar de melding over gaat');
});

test('de pagina suggereert niet dat iedereen het maximumbedrag krijgt', () => {
  const h = html();
  assert.match(h, /Maximaal/);
  assert.match(h, /voor jouw situatie/i, 'het bedrag hoort aan de eigen situatie te hangen');
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

test('de kaart met datums erin is als voorbeeld gemerkt', () => {
  // Een kaart met een datum en een aantal dagen erin mag niet te lezen zijn
  // als de eigen uitslag van de bezoeker.
  const kaart = html().split('class="result"')[1].split('</section>')[0];
  assert.match(kaart, /Voorbeeld van je uitslag/);
  assert.match(kaart, /Dit is een voorbeeld/);
});

// ----------------------------------------------------------- de uitgangen ---

test('de balk heeft geen uitgangen, alleen plekken op deze pagina', () => {
  // De regel is niet "geen links" maar "geen uitgangen". Een menu dat naar
  // stukken van deze pagina springt houdt de bezoeker hier; een link naar de
  // site is betaald verkeer dat wegloopt.
  const balk = html().split('<header')[1].split('</header>')[0];
  const links = [...balk.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(links.length > 0, 'de knop rechtsboven hoort ergens heen te gaan');
  for (const link of links) {
    assert.match(link, /^#/, `${link} is een uitgang en hoort hier niet`);
  }
});

test('er staat niets in de balk dat op een knop lijkt maar er geen is', () => {
  // Rechtsboven stond een grijs label. Daar werd op geklikt en er gebeurde
  // niets; dat is een valse belofte op de plek waar iedereen een knop zoekt.
  const balk = html().split('<header')[1].split('</header>')[0];
  assert.ok(!balk.includes('balk__rust'), 'het oude niet-klikbare label hoort weg');
});

test('de knoppen brengen de bezoeker naar het uploadvak', () => {
  // Elke knop op de pagina doet hetzelfde: naar het vak waar de brief in
  // gaat. Niet naar de site, en niet naar een tweede beslismoment.
  const knoppen = [...html().matchAll(/class="btn[^"]*" [^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(knoppen.length >= 3, `verwacht meerdere knoppen, kreeg ${knoppen.length}`);
  for (const knop of knoppen) assert.equal(knop, '#upload');
});

test('de weg naar de funnel draagt deze pagina mee', () => {
  // `van` en niet `bron`: `bron` is het kanaal waar de bezoeker vandaan komt
  // en `van` is de pagina waarop hij klikte. Stond hier eerst een paginanaam
  // in `bron`, en toen viel elke advertentieklik onder "overig".
  const h = html();
  const knoppen = [...h.matchAll(/href="(\/aanvraag[^"]*)"/g)].map((m) => m[1]);
  assert.ok(knoppen.length >= 1, 'er hoort een weg naar de funnel te zijn');
  for (const k of knoppen) {
    assert.match(k, /instantie=uwv/, 'de instantie hoort al gekozen te zijn');
    assert.match(k, /van=uwv-te-laat/, 'zonder markering is niet te meten wat deze pagina doet');
    assert.ok(!/bron=/.test(k), 'het kanaal wordt door meting.js toegevoegd, niet hier');
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

test('de pagina zegt op meer dan één plek dat wij niet van UWV zijn', () => {
  // Wie op een advertentie klikt die over zijn UWV-brief gaat, moet nergens
  // kunnen denken dat hij bij UWV zelf is.
  const h = html();
  assert.match(h, /onafhankelijk van UWV/);
  assert.match(h, /geen onderdeel van UWV of de overheid/);
});

test('het uploadvak stuurt zelf niets, maar geeft de brief door aan de funnel', () => {
  // De pagina belooft dat er nog niets naar UWV gaat. Dat klopt alleen als
  // hier ook echt geen verzending zit: het bestand reist mee naar de funnel.
  const h = html();
  assert.ok(!h.includes('/api/'), 'de landing praat zelf niet met de server');
  assert.match(h, /id="verder"/, 'de bestemming hoort als link in de pagina te staan');
  assert.match(h, /assets\/campagne\.js/);
});

test('contactknoppen staan er alleen als er ook een adres achter zit', () => {
  const zonder = html({});
  assert.ok(!/WhatsApp/.test(zonder), 'geen whatsappknop zonder nummer');
  assert.ok(!/mailto:/.test(zonder), 'geen mailknop zonder adres');

  const met = html({ WHATSAPP_NUMMER: '+31 6 12345678', BEDRIJF_EMAIL: 'info@nubeslist.nl' });
  assert.match(met, /https:\/\/wa\.me\/31612345678/);
  assert.match(met, /mailto:info@nubeslist\.nl/);
});

test('de pagina wordt meegebouwd en is als pad bereikbaar', async () => {
  const { campagnepaginas } = await import('../src/campagnepagina.js');
  const paginas = campagnepaginas({});
  assert.equal(paginas.length, 1);
  assert.equal(paginas[0].bestand, 'uwv-te-laat.html');
  const { PAGINAS } = await import('../server.js');
  assert.equal(PAGINAS[CAMPAGNE_PAD], 'uwv-te-laat.html');
});
