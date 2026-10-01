/**
 * De zelfcontrole van de site.
 *
 * Waarom dit bestaat: "ik zie geen cijfers" kan tien dingen betekenen, en van
 * buitenaf zien ze er allemaal hetzelfde uit. De landingspagina laadt, de
 * advertentie telt een klik, en verder gebeurt er niets zichtbaars. Elk van de
 * schakels hieronder kan stuk zijn zonder dat een van de andere het verraadt.
 *
 * Daarom loopt deze pagina ze los van elkaar na, in de volgorde waarin een
 * bezoeker ze tegenkomt, en zegt hij per schakel wat er dan te doen staat.
 * Alles gebeurt vanuit de browser, zodat het ook werkt als er in productie
 * helemaal geen server draait: juist dan wil je het weten.
 */
const proeven = document.getElementById('proeven');
const oordeel = document.getElementById('oordeel');
const opnieuw = document.getElementById('opnieuw');

function el(tag, attrs = {}, ...kinderen) {
  const n = document.createElement(tag);
  for (const [k, w] of Object.entries(attrs)) {
    if (w === null || w === undefined) continue;
    if (k === 'tekst') n.textContent = w; else n.setAttribute(k, w);
  }
  for (const kind of kinderen.flat()) {
    if (kind === null || kind === undefined || kind === false) continue;
    n.append(kind.nodeType ? kind : document.createTextNode(String(kind)));
  }
  return n;
}

const TEKENS = { goed: '✓', fout: '✕', 'let-op': '!', bezig: '…' };

function toonProef(naam, toon, uitslag, watNu) {
  const vak = el('div', { class: `proef proef--${toon}` },
    el('span', { class: 'proef__teken', 'aria-hidden': 'true', tekst: TEKENS[toon] }),
    el('span', { class: 'proef__naam', tekst: naam }),
    el('span', { class: 'proef__uitslag', tekst: uitslag }),
    watNu ? el('div', { class: 'proef__wat-nu' }, watNu) : el('span', {}));
  proeven.append(vak);
  return vak;
}

/** Tekst met stukjes code erin, zonder innerHTML. */
function metCode(...delen) {
  return delen.map((deel) => (typeof deel === 'string' ? deel : el('code', { tekst: deel.code })));
}

/** Een verzoek dat nooit mag blijven hangen: liever een fout dan een leeg scherm. */
async function haal(pad, opties = {}) {
  const afbreker = new AbortController();
  const klok = setTimeout(() => afbreker.abort(), 12000);
  try {
    return await fetch(pad, { ...opties, signal: afbreker.signal, cache: 'no-store' });
  } finally {
    clearTimeout(klok);
  }
}

// ------------------------------------------------------------- de proeven ---

/**
 * 1. Draait er een API?
 *
 * Dit is de schakel die het vaakst stilletjes ontbreekt. Levert de hosting
 * alleen de map met pagina's uit, dan zijn dat echte bestanden en die doen het
 * gewoon; /api/... bestaat dan niet en geeft de foutpagina van de hosting
 * terug. De site ziet er dan volkomen normaal uit terwijl er niets geteld,
 * niets gelezen en niets ingediend kan worden.
 */
async function proefApi() {
  let antwoord;
  try {
    antwoord = await haal('/api/versie', { headers: { Accept: 'application/json' } });
  } catch (err) {
    toonProef('De API antwoordt', 'fout', `Geen antwoord: ${err.message}.`,
      'De server was niet te bereiken. Staat de site wel online?');
    return null;
  }
  const soort = antwoord.headers.get('content-type') || '';
  if (!antwoord.ok || !soort.includes('json')) {
    toonProef('De API antwoordt', 'fout',
      `/api/versie gaf ${antwoord.status} en geen json.`,
      metCode('Er draait geen serverfunctie. Op Vercel worden alleen bestanden in ',
        { code: 'api/' }, ' een functie; staat die map er niet, dan is er geen API en '
        + 'wordt er niets geteld of opgeslagen. De pagina’s blijven het intussen '
        + 'wel doen, want dat zijn echte bestanden. Controleer of ',
        { code: 'api/[...pad].js' }, ' is meegedeployed.'));
    return null;
  }
  const versie = await antwoord.json();
  toonProef('De API antwoordt', 'goed',
    `Ja. Versie ${versie.commit} op ${versie.branch}.`,
    'Zie je hier een oudere commit dan je verwacht, dan staat je laatste '
    + 'wijziging nog niet live en kijk je naar de vorige versie van de site.');
  return versie;
}

/**
 * 2. Blijft opgeslagen wat er geteld wordt?
 *
 * Zonder database valt de applicatie op een serverloze hosting terug op
 * werkgeheugen. Dan wordt er wél geteld en is het even later weg.
 */
function proefOpslag(versie) {
  if (!versie) return;
  if (versie.opslagDuurzaam) {
    toonProef('De cijfers blijven bewaard', 'goed', `Ja, opslag: ${versie.opslag}.`);
    return;
  }
  toonProef('De cijfers blijven bewaard', 'fout',
    `Nee. De opslag is "${versie.opslag}" en die is vluchtig.`,
    metCode('Er wordt geteld in het werkgeheugen van een serverloze functie. '
      + 'Zodra die afkoelt of opnieuw start, staat alles weer op nul, en bij '
      + 'drukte tellen meerdere instanties langs elkaar heen. Zet ',
      { code: 'KV_REST_API_URL' }, ' en ', { code: 'KV_REST_API_TOKEN' },
      ' (of de Upstash-varianten) in de omgevingsvariabelen en deploy opnieuw.'));
}

/**
 * 3. Bestaat de pagina waar de advertenties op uitkomen?
 *
 * /aanvraag had lang geen eigen bestand. Op een hosting die de map met
 * pagina’s rechtstreeks uitlevert, bestaat dat adres dan niet en loopt al het
 * advertentieverkeer op een 404 - terwijl de landingspagina ernaast het doet.
 */
async function proefFunnel() {
  for (const pad of ['/uwv-te-laat', '/aanvraag']) {
    let antwoord;
    try {
      antwoord = await haal(pad, { headers: { Accept: 'text/html' } });
    } catch (err) {
      toonProef(`De pagina ${pad}`, 'fout', `Geen antwoord: ${err.message}.`);
      continue;
    }
    if (!antwoord.ok) {
      toonProef(`De pagina ${pad}`, 'fout', `Geeft ${antwoord.status}.`,
        pad === '/aanvraag'
          ? metCode('Dit is het adres waar elke advertentie op uitkomt. Geeft het een '
            + 'fout, dan klikt iedereen die op een advertentie klikt zich een '
            + 'foutpagina in. Draai ', { code: 'npm run build' },
          ' zodat public/aanvraag.html bestaat, en deploy opnieuw.')
          : 'Deze landingspagina wordt in de advertenties gebruikt.');
      continue;
    }
    const html = await antwoord.text();
    const meet = html.includes('/assets/meting.js');
    toonProef(`De pagina ${pad}`, meet ? 'goed' : 'let-op',
      meet ? 'Laadt en telt mee.' : 'Laadt, maar telt niet mee.',
      meet ? null : 'Op deze pagina staat geen meetscript, dus bezoek eraan is '
        + 'onzichtbaar in de cijfers.');
  }
}

/**
 * 4. Laden de scripts die de meting doen?
 *
 * meting.js importeert een gedeelde module. Mislukt die import, dan draait het
 * hele script niet en meet de site niets meer - zonder dat er iets aan het
 * scherm te zien is.
 */
async function proefScripts() {
  const bestanden = ['/assets/meting.js', '/shared/herkomst.js', '/assets/funnel.js'];
  const stuk = [];
  for (const pad of bestanden) {
    try {
      const antwoord = await haal(pad);
      const soort = antwoord.headers.get('content-type') || '';
      if (!antwoord.ok || !/javascript|ecmascript/.test(soort)) {
        stuk.push(`${pad} (${antwoord.status}${soort ? `, ${soort.split(';')[0]}` : ''})`);
      }
    } catch (err) {
      stuk.push(`${pad} (${err.message})`);
    }
  }
  if (stuk.length === 0) {
    toonProef('De meetscripts laden', 'goed', 'Alle scripts worden goed uitgeleverd.');
    return;
  }
  toonProef('De meetscripts laden', 'fout', `Niet gevonden: ${stuk.join(', ')}.`,
    'Een script dat een ontbrekende module importeert, draait helemaal niet. '
    + 'Dan meet de site niets, terwijl de pagina er normaal uitziet.');
}

/**
 * 5. Komt een melding echt aan?
 *
 * De laatste schakel, en de enige die de hele weg aflegt: dezelfde route die
 * elke pagina gebruikt, met een melding die apart geteld wordt.
 */
async function proefMeting() {
  let antwoord;
  try {
    antwoord = await haal('/api/meting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ g: 'diagnose', b: 'direct' }),
    });
  } catch (err) {
    toonProef('Een melding komt aan', 'fout', `De meetroute gaf geen antwoord: ${err.message}.`);
    return;
  }
  if (antwoord.status !== 204) {
    toonProef('Een melding komt aan', 'fout',
      `De meetroute antwoordde met ${antwoord.status} in plaats van 204.`,
      'Zolang dit niet klopt, wordt er van geen enkele bezoeker iets geteld.');
    return;
  }

  // Terugkijken of hij is opgeslagen kan alleen als beheerder. Zonder login is
  // "aangekomen" alles wat we kunnen vaststellen, en dat staat er dan ook.
  let terug;
  try {
    terug = await haal('/api/beheer/metingen?dagen=1', { headers: { Accept: 'application/json' } });
  } catch { terug = null; }

  if (!terug || terug.status === 401 || terug.status === 403) {
    toonProef('Een melding komt aan', 'goed',
      'De meetroute nam de melding aan.',
      'Of hij ook is opgeslagen, is alleen als beheerder te zien. Log in op '
      + '/beheer en kijk daarna op /cijfers bij "Werkt de meting?".');
    return;
  }
  if (!terug.ok) {
    toonProef('Een melding komt aan', 'let-op',
      `De melding is aangenomen, maar de cijfers gaven ${terug.status}.`);
    return;
  }
  const data = await terug.json();
  const geteld = (data.diagnoses || {})[data.vandaag] || 0;
  if (geteld > 0) {
    toonProef('Een melding komt aan', 'goed',
      'De melding is aangekomen en opgeslagen. De hele keten werkt.');
  } else {
    toonProef('Een melding komt aan', 'fout',
      'De melding is aangenomen maar was daarna niet terug te vinden.',
      'Dit hoort bij een vluchtige opslag: de melding belandde op een andere '
      + 'instantie dan deze vraag. Zie de regel over de opslag hierboven.');
  }
}

/**
 * 6. Kan de pixel van Meta hier überhaupt aankomen?
 *
 * Als er in Advertentiebeheer niets binnenkomt, zijn er drie heel verschillende
 * oorzaken en die zien er aan die kant allemaal hetzelfde uit: de pixel staat
 * niet ingesteld, deze bezoeker gaf geen toestemming, of het apparaat blokkeert
 * Facebook. Die laatste is de stille: advertentieblokkers en de
 * trackingbescherming van telefoons houden het script tegen, en dan gebeurt er
 * niets zonder dat er iets te zien is.
 *
 * Deze proef stuurt met opzet GEEN gebeurtenis. Hij kijkt alleen of het script
 * van Meta bereikbaar is, zodat je eigen cijfers niet vervuild raken met
 * testverkeer.
 */
async function proefPixel() {
  let instellingen = {};
  try {
    const antwoord = await haal('/api/instellingen', { headers: { Accept: 'application/json' } });
    if (antwoord.ok) instellingen = await antwoord.json();
  } catch { /* dan weten we het niet, dat komt hieronder terug */ }

  const id = String(instellingen.META_PIXEL_ID || '').trim();
  if (!id) {
    toonProef('De Meta Pixel', 'let-op', 'Staat niet ingesteld.',
      metCode('Zonder ', { code: 'META_PIXEL_ID' }, ' in de omgevingsvariabelen komt er geen '
        + 'pixel en wordt er ook geen toestemming gevraagd. Dat is prima als je hem niet wilt; '
        + 'wil je hem wel, zet die variabele dan en deploy opnieuw.'));
    return;
  }

  // Heeft deze bezoeker op dit apparaat ja gezegd?
  let keuze = null;
  try {
    const ruw = window.localStorage.getItem('nb-toestemming');
    if (ruw) keuze = (JSON.parse(ruw) || {}).antwoord || null;
  } catch { /* privevenster: dan is er geen keuze bewaard */ }

  // Is het script van Meta hier te bereiken? Alleen laden, niets versturen.
  const bereikbaar = await new Promise((klaar) => {
    const proef = document.createElement('script');
    proef.async = true;
    proef.src = 'https://connect.facebook.net/en_US/fbevents.js';
    const af = (uitslag) => { proef.remove(); klaar(uitslag); };
    proef.onload = () => af(true);
    proef.onerror = () => af(false);
    setTimeout(() => af(false), 8000);
    document.head.append(proef);
  });

  if (!bereikbaar) {
    toonProef('De Meta Pixel', 'fout',
      'Het script van Facebook is op dit apparaat niet te laden.',
      'Dit apparaat of deze browser blokkeert Facebook: een advertentieblokker, een '
      + 'blokkerende dns, of de trackingbescherming van je telefoon. Er wordt dan niets '
      + 'naar Meta verstuurd en in Advertentiebeheer blijft het leeg, terwijl er aan de '
      + 'site niets mis is. Probeer het op een ander apparaat of in een andere browser '
      + 'voordat je verder zoekt.');
    return;
  }

  if (keuze !== 'ja') {
    toonProef('De Meta Pixel', 'let-op',
      keuze === 'nee'
        ? 'Ingesteld en bereikbaar, maar jij hebt hier geweigerd.'
        : 'Ingesteld en bereikbaar, maar jij hebt hier nog niets gekozen.',
      'Zonder jouw akkoord wordt er van dit apparaat niets naar Meta gestuurd. Ga naar de '
      + 'site, klik op Akkoord en kom hier terug.');
    return;
  }

  toonProef('De Meta Pixel', 'goed',
    'Ingesteld, bereikbaar, en jij gaf hier toestemming.',
    'Gebeurtenissen vanaf dit apparaat horen in Advertentiebeheer te verschijnen. Dat kan '
    + 'tot een halfuur duren, en kijk of de gekozen periode vandaag wel bevat.');
}

// ------------------------------------------------------------------ ronde ---

async function kijkNa() {
  opnieuw.disabled = true;
  proeven.textContent = '';
  oordeel.className = 'oordeel';
  oordeel.textContent = 'Bezig met nakijken…';

  const versie = await proefApi();
  proefOpslag(versie);
  await proefFunnel();
  await proefScripts();
  await proefMeting();
  await proefPixel();

  const fouten = proeven.querySelectorAll('.proef--fout').length;
  const letOp = proeven.querySelectorAll('.proef--let-op').length;
  if (fouten > 0) {
    oordeel.className = 'oordeel oordeel--fout';
    oordeel.textContent = fouten === 1
      ? 'Er is één ding stuk. Zolang dat zo is, kloppen de cijfers niet.'
      : `Er zijn ${fouten} dingen stuk. Zolang dat zo is, kloppen de cijfers niet.`;
  } else if (letOp > 0) {
    oordeel.className = 'oordeel';
    oordeel.textContent = 'De keten werkt, maar er valt iets op. Zie hieronder.';
  } else {
    oordeel.className = 'oordeel oordeel--goed';
    oordeel.textContent = 'Alles werkt. Wat er binnenkomt, wordt geteld en bewaard.';
  }
  opnieuw.disabled = false;
}

opnieuw.addEventListener('click', kijkNa);
kijkNa();
