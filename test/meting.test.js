/**
 * De tellingen.
 *
 * De meetroute staat open: hij moet vanuit de browser aan te roepen zijn.
 * Een open route die naar de opslag schrijft is een uitnodiging, dus de
 * meeste toetsen hieronder gaan over wat er níét in mag komen.
 *
 * De tweede zorg is privacy. Wie op /uwv-wia komt, vertelt daarmee iets over
 * zijn gezondheid. Door alleen op te tellen kan dat nergens terechtkomen -
 * maar dan moet er ook echt niets anders bewaard worden, en dat bewaken deze
 * toetsen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  normaliseerBron, kanaal, normaliseerPagina, veld, overzicht, geldigeGebeurtenis,
  laatsteDagen, GEBEURTENISSEN,
} from '../src/meting.js';

const tijdelijk = await fs.mkdtemp(path.join(os.tmpdir(), 'nubeslist-meting-'));
process.env.DATA_DIR = tijdelijk;
process.env.SESSIE_GEHEIM = 'testgeheim-voor-de-metingen';
process.env.PORT = '0';
delete process.env.BEHEER_OPEN;

const { start, server, opslag } = await import('../server.js');
await start(0);
const basis = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  server.close();
  await fs.rm(tijdelijk, { recursive: true, force: true });
});

const meld = (body) => fetch(`${basis}/api/meting`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

const vandaag = new Date().toISOString().slice(0, 10);
const tel = () => opslag.tellingen(vandaag);

// ------------------------------------------------------------- bronnen ---

test('varianten van facebook komen allemaal op meta uit', () => {
  for (const ruw of ['meta', 'facebook', 'FB', 'instagram', 'ig', 'meta-ads']) {
    assert.equal(normaliseerBron(ruw), 'meta-ads', `${ruw} hoort meta-ads te zijn`);
  }
  // Een verwijzing vanaf Facebook zonder klik-parameter is geen advertentie
  // maar een gedeeld bericht. Die twee op één hoop gooien maakt het cijfer
  // waar je op stuurt onbruikbaar: je ziet dan niet wat de advertentie deed.
  assert.equal(normaliseerBron('', 'l.facebook.com'), 'sociaal');
});

/**
 * De klik-parameters van de advertentieplatforms.
 *
 * Dit is de reden dat er weken lang wel kliks in de advertentiebeheerder
 * stonden en geen betaald verkeer in de cijfers. Google en Meta zetten geen
 * `utm_source`; ze plakken alleen hun eigen kenmerk achter de link. Herken je
 * dat niet, dan telt een betaalde klik uit Google als organisch zoekverkeer
 * en een betaalde klik uit Meta als een bezoeker die het adres zelf intypte.
 */
test('een klik op een advertentie is te herkennen aan de url', () => {
  const uit = (zoek, verwijzer = '') => kanaal({ zoek, verwijzer });
  assert.equal(uit('?gclid=EAIaIQ', 'www.google.com'), 'google-ads');
  assert.equal(uit('?gbraid=0AAA'), 'google-ads');
  assert.equal(uit('?wbraid=0AAA'), 'google-ads');
  assert.equal(uit('?gad_source=1'), 'google-ads');
  assert.equal(uit('?fbclid=IwAR'), 'meta-ads');
  assert.equal(uit('?ttclid=abc'), 'andere-ads');
  assert.equal(uit('?msclkid=abc'), 'andere-ads');
  // Zonder kenmerk is dezelfde verwijzer gewoon zoekverkeer.
  assert.equal(uit('', 'www.google.com'), 'organisch');
});

test('een medium dat zegt dat het geen advertentie is, wint van de rest', () => {
  // Een fbclid blijft aan een link plakken als iemand hem doorstuurt. Staat er
  // dan een eigen tag bij die zegt dat het een nieuwsbrief is, dan is dat het
  // betrouwbaardere signaal.
  assert.equal(kanaal({ zoek: '?fbclid=x&utm_medium=email' }), 'overig');
  assert.equal(kanaal({ zoek: '?utm_source=google&utm_medium=organic', verwijzer: 'www.google.com' }),
    'organisch');
});

test('een onbekende bron wordt overig, geen eigen teller', () => {
  // Zonder dit krijgt elke verzonnen utm_source een eigen regel en is het
  // overzicht binnen een week onleesbaar.
  assert.equal(normaliseerBron('nieuwsbriefje-maart'), 'overig');
  assert.equal(normaliseerBron('<script>alert(1)</script>'), 'overig');
});

test('geen bron en geen verwijzer is direct', () => {
  assert.equal(normaliseerBron('', ''), 'direct');
});

test('een zoekmachine als verwijzer is organisch', () => {
  assert.equal(normaliseerBron('', 'www.google.com'), 'organisch');
  assert.equal(normaliseerBron('', 'duckduckgo.com'), 'organisch');
});

// ------------------------------------------------------------- pagina's ---

test('alleen bekende paden krijgen een eigen teller', () => {
  const bekend = ['/uwv-wia', '/ingebrekestelling'];
  assert.equal(normaliseerPagina('/uwv-wia', bekend), 'uwv-wia');
  assert.equal(normaliseerPagina('/verzonnen', bekend), 'overig');
});

test('de queryreeks wordt weggeknipt', () => {
  // Daar kan van alles in staan wat we niet willen bewaren.
  const bekend = ['/uwv-wia'];
  assert.equal(normaliseerPagina('/uwv-wia?email=iemand@voorbeeld.nl', bekend), 'uwv-wia');
  assert.equal(normaliseerPagina('/uwv-wia#ergens', bekend), 'uwv-wia');
});

// ----------------------------------------------------------- de route ---

test('een gewone melding wordt geteld', async () => {
  const antwoord = await meld({ g: 'bezoek', b: 'facebook', p: '/uwv-te-laat' });
  assert.equal(antwoord.status, 204);
  const tellingen = await tel();
  assert.equal(tellingen[veld('bezoek', 'meta-ads', 'uwv-te-laat')], 1);
});

/**
 * Advertentieverkeer moet in zijn geheel aankomen.
 *
 * De grens is er om te voorkomen dat iemand de tellers volschrijft, niet om
 * bezoekers te weren. Zolang het adres van de bezoeker niet doorkwam, gold
 * hij voor de hele site tegelijk: met een advertentie aan was hij binnen
 * enkele minuten vol en verdween al het verkeer daarna in stilte.
 */
test('verkeer van veel bezoekers tegelijk wordt helemaal geteld', async () => {
  process.env.VERTROUW_PROXY = '1';
  try {
    const voor = (await tel())[veld('bezoek', 'google-ads', 'uwv-te-laat')] || 0;
    const bezoekers = 80;
    for (let i = 0; i < bezoekers; i += 1) {
      const antwoord = await fetch(`${basis}/api/meting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `198.51.100.${i}` },
        body: JSON.stringify({ g: 'bezoek', b: 'google-ads', p: '/uwv-te-laat' }),
      });
      assert.equal(antwoord.status, 204);
    }
    const na = (await tel())[veld('bezoek', 'google-ads', 'uwv-te-laat')] || 0;
    assert.equal(na - voor, bezoekers,
      `er zijn ${bezoekers} bezoeken gemeld en ${na - voor} geteld`);
  } finally {
    delete process.env.VERTROUW_PROXY;
  }
});

/**
 * De testknop van het cijferscherm.
 *
 * Telt wel, maar hoort nergens tussen de bezoekerscijfers te staan: één
 * klik op "Test de meting" zou anders als bezoeker meetellen en de trechter
 * scheeftrekken.
 */
test('een testmelding telt apart en niet in de trechter', async () => {
  assert.equal((await meld({ g: 'diagnose', b: 'direct' })).status, 204);
  const uit = overzicht([{ dag: vandaag, tellingen: await tel() }]);
  assert.ok((uit.diagnoses[vandaag] || 0) >= 1, 'de testmelding is niet apart geteld');
  assert.equal(uit.totalen.diagnose, undefined, 'de testmelding staat tussen de totalen');
  for (const [bron, tellingen] of Object.entries(uit.perBron)) {
    assert.equal(tellingen.diagnose, undefined, `de testmelding staat onder ${bron}`);
  }
});

test('een verzonnen gebeurtenis wordt niet geteld', async () => {
  const voor = Object.keys(await tel()).length;
  await meld({ g: 'hack', b: 'meta' });
  await meld({ g: '__proto__', b: 'meta' });
  await meld({ g: 'constructor', b: 'meta' });
  assert.equal(Object.keys(await tel()).length, voor, 'er is een teller bijgekomen');
});

test('de route antwoordt altijd 204, ook op onzin', async () => {
  // Een meetroute mag nooit een reden zijn dat er iets op het scherm misgaat,
  // en een foutmelding zou verklappen welke gebeurtenissen wel bestaan.
  for (const body of [{}, { g: '' }, { g: 'bezoek', b: {} }, { onzin: true }]) {
    assert.equal((await meld(body)).status, 204, JSON.stringify(body));
  }
  const kapot = await fetch(`${basis}/api/meting`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'geen json',
  });
  assert.equal(kapot.status, 204);
});

test('de meetroute zet geen cookie', async () => {
  const antwoord = await meld({ g: 'bezoek' });
  assert.equal(antwoord.headers.getSetCookie().length, 0,
    'zodra hier een cookie uit komt, is er toestemming nodig');
});

test('er komt niets in de opslag wat naar één bezoeker leidt', async () => {
  await meld({ g: 'bezoek', b: 'meta', p: '/uwv-wia' });
  const tellingen = await tel();
  const alles = JSON.stringify(tellingen);
  // Elke sleutel is gebeurtenis|bron[|pagina] en elke waarde een getal.
  for (const [sleutel, waarde] of Object.entries(tellingen)) {
    const delen = sleutel.split('|');
    assert.ok(delen.length >= 2 && delen.length <= 3, `rare sleutel: ${sleutel}`);
    assert.ok(geldigeGebeurtenis(delen[0]), `onbekende gebeurtenis: ${delen[0]}`);
    assert.equal(typeof waarde, 'number', `${sleutel} is geen getal`);
  }
  assert.ok(!/\d{1,3}(\.\d{1,3}){3}/.test(alles), 'er staat een ip-adres in');
  assert.ok(!alles.includes('@'), 'er staat een e-mailadres in');
  assert.ok(!/Mozilla|Chrome|Safari/.test(alles), 'er staat een useragent in');
});

test('de cijfers zitten achter de inlog', async () => {
  assert.equal((await fetch(`${basis}/api/beheer/metingen`)).status, 401);
});

test('het cijferscherm staat op noindex', async () => {
  const html = await (await fetch(`${basis}/cijfers`)).text();
  assert.match(html, /name="robots" content="noindex/);
});

// -------------------------------------------------------- het overzicht ---

test('de trechter rekent de percentages per stap uit', () => {
  const o = overzicht([{ dag: '2026-09-23', tellingen: {
    'bezoek|meta|uwv-te-laat': 200, 'funnel-start|meta': 50, 'funnel-brief|meta': 30,
    'funnel-uitslag|meta': 25, 'funnel-gegevens|meta': 10, 'funnel-akkoord|meta': 6,
    'aanvraag|meta': 4,
  } }]);
  const per = Object.fromEntries(o.trechter.map((r) => [r.stap, r]));
  assert.equal(per.bezoek.aantal, 200);
  assert.equal(per['funnel-start'].vanVorige, 25);
  // Het uploaden van de brief staat in de trechter: dat is het getal waar het
  // om gaat bij de vraag hoeveel mensen echt iets aanleveren.
  assert.equal(per['funnel-brief'].aantal, 30);
  assert.equal(per['funnel-uitslag'].vanVorige, 83.3);
  assert.equal(per.aanvraag.vanBezoek, 2);
});

test('delen door nul levert geen NaN op in het scherm', () => {
  const o = overzicht([{ dag: '2026-09-23', tellingen: {} }]);
  for (const rij of o.trechter) {
    assert.ok(rij.vanVorige === null || Number.isFinite(rij.vanVorige), `${rij.stap}: ${rij.vanVorige}`);
    assert.ok(rij.vanBezoek === null || Number.isFinite(rij.vanBezoek), `${rij.stap}: ${rij.vanBezoek}`);
  }
});

test('onbekende sleutels in de opslag worden overgeslagen', () => {
  // Oude of beschadigde gegevens mogen het overzicht niet laten struikelen.
  const o = overzicht([{ dag: '2026-09-23', tellingen: {
    'bezoek|meta': 5, 'rommel|meta': 99, 'kapot': 3,
  } }]);
  assert.equal(o.totalen.bezoek, 5);
  assert.ok(!('rommel' in o.totalen));
});

test('de dagenlijst loopt van oud naar nieuw en eindigt vandaag', () => {
  const dagen = laatsteDagen(7);
  assert.equal(dagen.length, 7);
  assert.equal(dagen[6], new Date().toISOString().slice(0, 10));
  assert.deepEqual(dagen, [...dagen].sort());
});

// ----------------------------------------------------------- de tellers ---

test('twee tellingen tegelijk gaan niet verloren', async () => {
  const start = (await tel())['bezoek|direct'] || 0;
  await Promise.all(Array.from({ length: 20 }, () => opslag.tel(vandaag, 'bezoek|direct')));
  assert.equal((await tel())['bezoek|direct'], start + 20);
});

test('elke gebeurtenis heeft een leesbare naam voor het scherm', () => {
  for (const [id, label] of Object.entries(GEBEURTENISSEN)) {
    assert.ok(label && label.length > 3, `${id} mist een label`);
  }
});

/**
 * Een scherm zonder link bestaat niet.
 *
 * /cijfers was gebouwd, getest en bereikbaar - maar nergens aangeklikt kunnen
 * worden. Je kon er alleen komen door het adres te typen. Dat is geen klein
 * detail: een functie die je niet kunt vinden, heb je niet.
 */
test('de beheeromgeving linkt naar de cijfers, en terug', async () => {
  const beheer = await (await fetch(`${basis}/beheer`)).text();
  assert.match(beheer, /href="\/cijfers"/, 'vanuit /beheer is /cijfers niet aan te klikken');

  const cijfers = await (await fetch(`${basis}/cijfers`)).text();
  assert.match(cijfers, /href="\/beheer"/, 'vanuit /cijfers is er geen weg terug');
});

test('de cijfers staan niet in het menu van de openbare site', async () => {
  // Een bezoeker heeft er niets te zoeken en krijgt toch 401; die link zou
  // alleen verwarring opleveren.
  for (const pad of ['/', '/uwv', '/ingebrekestelling']) {
    const html = await (await fetch(basis + pad)).text();
    assert.ok(!html.includes('href="/cijfers"'), `${pad} linkt naar de cijfers`);
  }
});

/**
 * De herkomst moet de sprong naar de funnel overleven.
 *
 * Dit ging mis en het kostte precies wat je niet wilt kwijtraken. De
 * advertentielanding stuurde `bron=uwv-te-laat` mee - een paginanaam in het
 * veld voor het kanaal - en daarmee viel elke advertentieklik onder "overig"
 * in plaats van onder "meta". In de cijfers stond Meta op nul aanvragen
 * terwijl Meta ze wel degelijk had geleverd.
 */
test('een paginanaam hoort niet in het kanaalveld', () => {
  // Als dit ooit weer gebeurt, is het aan de uitkomst te zien: een
  // paginanaam die als kanaal wordt aangeboden, wordt "overig".
  assert.equal(normaliseerBron('uwv-te-laat'), 'overig');
  assert.equal(normaliseerBron('meta'), 'meta-ads');
});

test('de advertentielanding zet de paginanaam in `van`, niet in `bron`', async () => {
  const { campagneHtml } = await import('../src/campagnepagina.js');
  const html = campagneHtml({ TARIEF_PERCENTAGE: '25' });
  const links = [...html.matchAll(/href="(\/aanvraag[^"]*)"/g)].map((m) => m[1]);
  assert.ok(links.length > 0);
  for (const link of links) {
    assert.ok(!/bron=uwv-te-laat/.test(link), `${link} zet een paginanaam in bron`);
    assert.match(link, /van=uwv-te-laat/, `${link} mist de paginamarkering`);
  }
});

test('het meetscript geeft de herkomst door aan de funnelknoppen', async () => {
  const fsp = await import('node:fs/promises');
  const pad = new URL('../public/assets/meting.js', import.meta.url);
  const script = await fsp.readFile(pad, 'utf8');
  assert.match(script, /geefHerkomstDoor/);
  assert.match(script, /a\[href\^="\/aanvraag"\]/);
  // Een link die zelf al een bron draagt, wordt niet overschreven.
  assert.match(script, /searchParams\.has\('bron'\)/);
});
