/**
 * De toestemmingsvraag en de Meta Pixel.
 *
 * Hier zit het grootste risico van de hele site. Een pixel die te vroeg laadt
 * is geen schoonheidsfoutje: dan is er persoonsgegevens gedeeld met een ander
 * bedrijf zonder dat iemand ja heeft gezegd, en dat is niet terug te draaien.
 *
 * Deze toetsen lezen de uitgeleverde bestanden, want dat is wat een bezoeker
 * echt krijgt. De vraag die ze allemaal stellen is dezelfde: kan er iets naar
 * Meta gaan voordat er op "Akkoord" is geklikt?
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'nubeslist-toestemming-'));
process.env.DATA_DIR = tijdelijk;
process.env.SESSIE_GEHEIM = 'testgeheim-voor-de-toestemming';
process.env.PORT = '0';

const { start, server } = await import('../server.js');
await start(0);
const basis = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  server.close();
  await fs.rm(tijdelijk, { recursive: true, force: true });
});

const haal = (pad) => fetch(basis + pad);
const script = await (await haal('/assets/toestemming.js')).text();

const PUBLIEKE_PAGINAS = ['/', '/uwv-te-laat', '/aanvraag', '/hoe-werkt-het', '/contact',
  '/uwv-wia', '/bijstand', '/privacy', '/voorwaarden'];

// ------------------------------------------------- niets zonder akkoord ---

test('geen enkele pagina laadt de pixel rechtstreeks', async () => {
  // Staat de code van Meta in de pagina zelf, dan draait hij voordat er iets
  // gevraagd is, hoe keurig de banner er verder ook uitziet.
  for (const pad of [...PUBLIEKE_PAGINAS, '/beheer', '/cijfers', '/mijn', '/diagnose']) {
    const html = await (await haal(pad)).text();
    assert.ok(!/connect\.facebook\.net/.test(html), `${pad} laadt fbevents.js rechtstreeks`);
    assert.ok(!/fbq\(/.test(html), `${pad} roept fbq aan vanuit de pagina`);
  }
});

test('de pixel wordt pas opgehaald nadat iemand ja zegt', () => {
  // De enige plek waar het adres van Meta staat, hoort in de functie te staan
  // die pas na een akkoord wordt aangeroepen.
  const laadFunctie = /function laadPixel\([\s\S]*?\n}/.exec(script);
  assert.ok(laadFunctie, 'laadPixel hoort te bestaan');
  assert.match(laadFunctie[0], /connect\.facebook\.net/);

  const voorkomens = script.match(/connect\.facebook\.net/g) || [];
  assert.equal(voorkomens.length, 1, 'het adres van Meta hoort op één plek te staan');

  // En die functie wordt alleen aangeroepen vanuit `aanzetten`, dat zelf
  // alleen draait bij een bewaarde ja of na een klik op Akkoord.
  assert.match(script, /const aanzetten = \(\) => \{[\s\S]*?laadPixel\(id\)/);
  assert.match(script, /if \(gekozen === 'nee'\) return;/,
    'een nee hoort de pixel definitief tegen te houden');
});

test('zonder ingesteld pixelnummer gebeurt er helemaal niets', () => {
  // Geen nummer betekent geen pixel én geen toestemmingsvraag: anders vraag je
  // mensen om toestemming voor iets wat er niet is.
  assert.match(script, /if \(!id\) return;/);
});

test('automatische geavanceerde matching staat uit', () => {
  // Anders leest Meta zelf de velden van het formulier uit. Daar staan een
  // naam, een e-mailadres en straks een rekeningnummer in.
  assert.match(script, /fbq\('set', 'autoConfig', false, id\)/);
  const zetten = script.indexOf("'autoConfig'");
  const init = script.indexOf("fbq('init'");
  assert.ok(zetten > 0 && zetten < init, 'autoConfig hoort vóór init te staan');
});

test('er gaat nooit iets over de persoon of de zaak mee', () => {
  // De gebeurtenisfunctie mag precies twee dingen versturen: de naam en het
  // nummer. Komt daar ooit een derde argument bij, dan valt dit om.
  const stuur = /window\.fbq\('track',[^;]*;/.exec(script);
  assert.ok(stuur, 'er hoort één plek te zijn waar een gebeurtenis verstuurd wordt');
  assert.match(stuur[0], /window\.fbq\('track', naam, gegevens, \{ eventID: id \}\)/);

  for (const verboden of ['bsn', 'iban', 'naam:', 'email', 'zaaktype', 'instantie',
    'bestuursorgaan', 'bedrag', 'uitkering']) {
    assert.ok(!new RegExp(`${verboden}`, 'i').test(stuur[0]),
      `er gaat "${verboden}" mee naar Meta`);
  }
});

test('elke gebeurtenis krijgt een eigen nummer', () => {
  // Zodat dezelfde gebeurtenis straks ook via de Conversions API kan komen
  // zonder dat Meta hem twee keer telt.
  assert.match(script, /function gebeurtenisId\(\)/);
  assert.match(script, /randomUUID/);
  assert.match(script, /eventID: id/);
});

test('de testcode komt uit de omgeving en zit er niet in gebakken', () => {
  assert.match(script, /instellingen\.META_TEST_EVENT_CODE/);
  assert.ok(!/test_event_code:\s*'[A-Za-z0-9]/.test(script), 'er staat een vaste testcode in');
});

test('het pixelnummer staat nergens in de code of in een pagina', async () => {
  // Het nummer hoort uit de omgeving te komen. Staat het in de repository, dan
  // staat het ook in elke testomgeving en stuurt die vrolijk mee.
  const bestanden = ['/assets/toestemming.js', '/assets/funnel.js', '/assets/meting.js'];
  for (const pad of [...bestanden, ...PUBLIEKE_PAGINAS]) {
    const tekst = await (await haal(pad)).text();
    assert.ok(!/\b\d{15,16}\b/.test(tekst), `${pad} bevat een hardgecodeerd pixelnummer`);
  }
});

// -------------------------------------------------------- de instellingen -

test('de server geeft het pixelnummer door uit de omgeving', async () => {
  const eerder = process.env.META_PIXEL_ID;
  try {
    delete process.env.META_PIXEL_ID;
    const zonder = await (await haal('/api/instellingen')).json();
    assert.equal(zonder.META_PIXEL_ID, '', 'zonder omgevingsvariabele hoort het leeg te zijn');

    process.env.META_PIXEL_ID = '2013586469157514';
    const met = await (await haal('/api/instellingen')).json();
    assert.equal(met.META_PIXEL_ID, '2013586469157514');
  } finally {
    if (eerder === undefined) delete process.env.META_PIXEL_ID;
    else process.env.META_PIXEL_ID = eerder;
  }
});

// -------------------------------------------------------------- de banner -

test('de banner neemt zijn eigen opmaak mee', () => {
  // De advertentielanding heeft haar eigen opmaak en laadt assets/stijl.css
  // niet. Zonder eigen stijl stond de banner daar zonder enige vormgeving, en
  // dat is net de pagina waar het meeste verkeer binnenkomt.
  assert.match(script, /const OPMAAK = `/);
  assert.match(script, /\.nb-toestemming \{/);
  assert.match(script, /document\.head\.append\(blok\)/);
});

test('de banner vraagt het in gewone taal en laat weigeren even makkelijk zijn', () => {
  assert.match(script, /Akkoord/);
  assert.match(script, /Weigeren/);
  // Allebei een gewone knop, geen link of klein grijs tekstje: een weigering
  // die moeilijker te vinden is dan een akkoord, is geen vrije keuze.
  const knoppen = script.match(/<button type="button" class="nb-toestemming__knop[^"]*" data-antwoord="(ja|nee)">/g) || [];
  assert.equal(knoppen.length, 2, 'er horen twee echte knoppen te staan');

  // B1: korte zinnen. Geen zin in de banner langer dan 20 woorden.
  const tekst = /<div class="nb-toestemming__tekst">([\s\S]*?)<\/div>/.exec(script)[1]
    .replace(/<[^>]+>/g, ' ');
  for (const zin of tekst.split(/[.?!]/).map((z) => z.trim()).filter(Boolean)) {
    const woorden = zin.split(/\s+/).length;
    assert.ok(woorden <= 20, `deze zin is te lang voor B1 (${woorden} woorden): "${zin}"`);
  }
  // En geen woorden die je moet opzoeken.
  for (const jargon of ['tracking', 'analytics', 'personaliseren', 'optimaliseren',
    'verwerkingsverantwoordelijke', 'gerechtvaardigd belang']) {
    assert.ok(!new RegExp(jargon, 'i').test(tekst), `"${jargon}" hoort niet in een B1-tekst`);
  }
});

test('de keuze wordt bewaard en een oude keuze vervalt bij een wijziging', () => {
  assert.match(script, /localStorage\.setItem/);
  assert.match(script, /bewaard\.versie !== VERSIE/,
    'verandert er iets wezenlijks, dan hoort de vraag opnieuw gesteld te worden');
});

test('op pagina\'s die iets over iemand verklappen komt de pixel niet', () => {
  // Een pixel stuurt het adres van de pagina mee. "/uwv-wia" vertelt Meta dat
  // deze bezoeker arbeidsongeschikt is, en dat is een bijzonder persoonsgegeven.
  const lijst = /const GEVOELIGE_PADEN = \[([\s\S]*?)\];/.exec(script);
  assert.ok(lijst, 'er hoort een lijst met gevoelige paden te staan');
  for (const pad of ['/uwv-wia', '/uwv-wajong', '/uwv-ziektewet', '/bijstand', '/schuldhulp']) {
    assert.ok(lijst[1].includes(`'${pad}'`), `${pad} hoort in de lijst`);
  }
  assert.match(script, /if \(!overal && gevoeligePagina\(\)\) return;/);
});

// ------------------------------------------------ onze eigen telling ------

/**
 * Onze eigen cijfers blijven buiten de toestemming staan.
 *
 * Dat is geen slordigheid maar het hele punt: er wordt geteld, er gaat niets
 * naar een ander bedrijf en er wordt niets op het apparaat gezet of gelezen.
 * Daar is geen toestemming voor nodig, en zou je het er wel achter zetten dan
 * raak je de helft van je cijfers kwijt zonder dat iemand er iets mee opschiet.
 */
test('de eigen telling staat los van de toestemmingsvraag', async () => {
  const meting = await (await haal('/assets/meting.js')).text();
  // Het woord mag in de uitleg staan; waar het om gaat is dat de code er niet
  // op wacht en er niet naar kijkt.
  const zonderUitleg = meting.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const afhankelijkheid of ['nb-toestemming', 'localStorage', 'nbMeta', 'fbq']) {
    assert.ok(!zonderUitleg.includes(afhankelijkheid),
      `meting.js hangt af van ${afhankelijkheid}; dan telt hij niet meer voor iedereen`);
  }
  assert.match(meting, /meet\('bezoek'\)/, 'elke pagina telt een bezoek, hoe de keuze ook uitvalt');

  // En de pagina laadt allebei de scripts, los van elkaar.
  const html = await (await haal('/uwv-te-laat')).text();
  assert.match(html, /assets\/meting\.js/);
  assert.match(html, /assets\/toestemming\.js/);
});

test('het antwoord op de vraag wordt geteld, maar alleen ja of nee', async () => {
  const { veld } = await import('../src/meting.js');
  const melden = (b) => fetch(`${basis}/api/meting`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ g: 'toestemming', b }),
  });
  await melden('ja');
  await melden('nee');
  // Iets anders dan ja hoort als nee te tellen en nooit een eigen teller te
  // krijgen: deze route staat open.
  await melden('<script>');
  const { opslag } = await import('../server.js');
  const { vandaagSleutel } = await import('../src/meting.js');
  const tellingen = await opslag.tellingen(vandaagSleutel());
  assert.equal(tellingen[veld('toestemming', 'ja')], 1);
  assert.equal(tellingen[veld('toestemming', 'nee')], 2);
  for (const sleutel of Object.keys(tellingen)) {
    if (sleutel.startsWith('toestemming|')) {
      assert.match(sleutel, /^toestemming\|(ja|nee)$/, `rare sleutel: ${sleutel}`);
    }
  }
});

// ------------------------------------------------- waar de events vandaan --

test('de funnel meldt alleen de naam van de gebeurtenis', async () => {
  const funnel = await (await haal('/assets/funnel.js')).text();
  const aanroepen = [...funnel.matchAll(/window\.nbMeta\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(aanroepen.sort(), ["'CompleteRegistration'", "'Lead'"],
    'er horen precies twee meldingen te zijn, allebei zonder gegevens');
});

test('Lead hoort bij de uitslag en CompleteRegistration bij de verstuurde opdracht', async () => {
  const funnel = await (await haal('/assets/funnel.js')).text();
  assert.match(funnel, /naam === 'uitslag'[\s\S]{0,200}nbMeta\('Lead'\)/,
    'Lead hoort te vuren zodra de uitslag in beeld komt');
  assert.match(funnel, /meet\('aanvraag'\);[\s\S]{0,400}nbMeta\('CompleteRegistration'\)/,
    'CompleteRegistration hoort pas te vuren als de opdracht is aangekomen');
});
