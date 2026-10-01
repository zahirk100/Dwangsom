/**
 * De toestemmingsvraag, en de Meta Pixel die er pas na komt.
 *
 * Tot nu toe hoefde deze site niets te vragen: er werd geteld en verder niets,
 * er ging niets op het apparaat van de bezoeker en er ging niets naar een
 * ander bedrijf. Met een pixel van Meta verandert dat alle drie. Die zet een
 * cookie, leest hem terug en stuurt wat je doet naar Meta. Daar is in
 * Nederland toestemming voor nodig, vooraf en uit vrije wil, en die
 * toestemming moet net zo makkelijk te weigeren zijn als te geven.
 *
 * Daarom staat de pixel hier niet in de pagina maar achter deze module. Hij
 * wordt pas opgehaald nadat iemand op "Akkoord" heeft geklikt. Wie weigert of
 * de vraag wegklikt, krijgt geen enkel verzoek naar Meta, ook niet één.
 *
 * Onze eigen tellingen (assets/meting.js) blijven los hiervan draaien. Die
 * zetten niets op het apparaat en gaan nergens heen, dus daar is geen
 * toestemming voor nodig en die horen dus ook niet achter deze vraag te staan.
 */

const SLEUTEL = 'nb-toestemming';

/**
 * Verandert er iets wezenlijks aan wat we vragen, dan hoort de vraag opnieuw
 * gesteld te worden. Een oude "ja" dekt geen nieuwe partij of nieuw doel.
 */
const VERSIE = 1;

/**
 * Pagina's waar de pixel niet komt, ook niet met toestemming.
 *
 * Een pixel stuurt het adres van de pagina mee. Wie op /uwv-wia komt, vertelt
 * daarmee iets over zijn gezondheid, en wie op /bijstand of /schuldhulp komt
 * iets over zijn financiële situatie. Dat zijn bijzondere persoonsgegevens:
 * daar gelden zwaardere eisen voor dan gewone toestemming, en de voorwaarden
 * van Meta verbieden het aanleveren ervan ook gewoon.
 *
 * Het alternatief zou zijn om de pixel helemaal niet te plaatsen. Dit is de
 * middenweg: op de pagina's die niets over iemand verklappen telt hij mee, op
 * deze niet. Wil je het anders, zet dan META_PIXEL_OVERAL op 1; dat is dan een
 * bewuste keuze en geen ongeluk.
 */
const GEVOELIGE_PADEN = [
  '/uwv-wia', '/uwv-wajong', '/uwv-ziektewet', '/uwv-ww',
  '/bijstand', '/schuldhulp', '/jeugdhulp', '/wmo',
];

// ------------------------------------------------------------ de keuze ----

/** @returns {'ja'|'nee'|null} */
function keuze() {
  try {
    const ruw = window.localStorage.getItem(SLEUTEL);
    if (!ruw) return null;
    const bewaard = JSON.parse(ruw);
    if (!bewaard || bewaard.versie !== VERSIE) return null;
    return bewaard.antwoord === 'ja' ? 'ja' : 'nee';
  } catch {
    // Geen opslag beschikbaar (privévenster, geblokkeerde cookies). Dan is er
    // geen toestemming en gaat er dus niets naar Meta.
    return null;
  }
}

function bewaarKeuze(antwoord) {
  try {
    window.localStorage.setItem(SLEUTEL, JSON.stringify({
      antwoord, versie: VERSIE, op: new Date().toISOString(),
    }));
  } catch { /* kunnen we niet bewaren, dan vragen we het de volgende keer weer */ }
}

// ---------------------------------------------------------- de banner -----

/**
 * De opmaak reist mee met de banner.
 *
 * Dit kon niet in het gewone stijlblad: de advertentielanding heeft haar eigen
 * opmaak en laadt assets/stijl.css helemaal niet. De banner stond daar dus
 * zonder enige vormgeving, en juist dat is de pagina waar het meeste verkeer
 * binnenkomt. Kleuren staan er daarom hard in, met var() ervoor voor de
 * pagina's waar die wel bestaan.
 */
const OPMAAK = `
.nb-toestemming {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483000;
  background: var(--vlak, #ffffff);
  border-top: 1px solid var(--rand, #e3e9f5);
  box-shadow: 0 -8px 30px rgba(11, 18, 80, .12);
  font-family: var(--font, Figtree, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif);
  color: var(--tekst, #0b1250);
  line-height: 1.5;
}
.nb-toestemming__binnen {
  max-width: 1120px; margin: 0 auto;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  display: flex; flex-wrap: wrap; gap: 14px 24px;
  align-items: center; justify-content: space-between;
}
.nb-toestemming__tekst { flex: 1 1 320px; min-width: 0; }
.nb-toestemming__tekst strong { display: block; margin-bottom: 4px; font-size: 1rem; }
.nb-toestemming__tekst p {
  margin: 0 0 4px; font-size: .92rem; max-width: 62ch;
  color: var(--tekst-zacht, #56628f);
}
.nb-toestemming__klein { font-size: .84rem; }
.nb-toestemming__tekst a { color: inherit; }
.nb-toestemming__knoppen { display: flex; gap: 10px; flex: 0 0 auto; }
.nb-toestemming__knop {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 12px 20px; border-radius: 10px; border: 1px solid transparent;
  font: inherit; font-size: .97rem; font-weight: 700; white-space: nowrap;
  cursor: pointer;
}
.nb-toestemming__knop--ja { background: var(--actie, #0e9486); color: #ffffff; }
.nb-toestemming__knop--nee {
  background: var(--vlak, #ffffff); color: var(--tekst, #0b1250);
  border-color: var(--rand-sterk, #cfe0f2);
}
.nb-toestemming__knop:focus-visible { outline: 3px solid #4fb3f6; outline-offset: 2px; }
@media (max-width: 560px) {
  .nb-toestemming__knoppen { width: 100%; }
  .nb-toestemming__knop { flex: 1; }
}`;

function zetOpmaak() {
  if (document.getElementById('nb-toestemming-opmaak')) return;
  const blok = document.createElement('style');
  blok.id = 'nb-toestemming-opmaak';
  blok.textContent = OPMAAK;
  document.head.append(blok);
}

function bouwBanner(opKeuze) {
  const vak = document.createElement('div');
  vak.className = 'nb-toestemming';
  vak.setAttribute('role', 'dialog');
  vak.setAttribute('aria-modal', 'false');
  vak.setAttribute('aria-labelledby', 'toestemming-kop');
  vak.innerHTML = `
    <div class="nb-toestemming__binnen">
      <div class="nb-toestemming__tekst">
        <strong id="toestemming-kop">Mogen wij meten hoe je onze site gebruikt?</strong>
        <p>
          Wij willen graag weten of onze advertenties werken. Daarvoor zetten wij
          een cookie van Facebook. Die onthoudt dat jij op onze site bent geweest.
          Jouw brief, je gegevens en waar je op wacht gaan nooit mee.
        </p>
        <p class="nb-toestemming__klein">
          Zeg je nee, dan werkt de site gewoon. Je kiest zelf.
          <a href="/privacy">Lees wat wij bewaren</a>.
        </p>
      </div>
      <div class="nb-toestemming__knoppen">
        <button type="button" class="nb-toestemming__knop nb-toestemming__knop--ja" data-antwoord="ja">Akkoord</button>
        <button type="button" class="nb-toestemming__knop nb-toestemming__knop--nee" data-antwoord="nee">Weigeren</button>
      </div>
    </div>`;

  for (const knop of vak.querySelectorAll('button[data-antwoord]')) {
    knop.addEventListener('click', () => {
      const antwoord = knop.getAttribute('data-antwoord');
      bewaarKeuze(antwoord);
      vak.remove();
      opKeuze(antwoord);
    });
  }
  return vak;
}

function toonBanner(opKeuze) {
  zetOpmaak();
  const vak = bouwBanner(opKeuze);
  document.body.append(vak);
}

// ------------------------------------------------------------- de pixel ---

let geladen = false;

/** Een eigen nummer per gebeurtenis, zodat dezelfde later niet dubbel telt. */
function gebeurtenisId() {
  try {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  } catch { /* valt terug op het alternatief hieronder */ }
  return `nb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** De standaardcode van Meta, zonder het noscript-deel. */
function laadPixel(id) {
  /* eslint-disable */
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  // Automatische geavanceerde matching uit. Anders leest Meta zelf velden uit
  // formulieren op de pagina, en op dit formulier staan een naam, een
  // e-mailadres en straks een rekeningnummer. Dat mag daar nooit terechtkomen.
  window.fbq('set', 'autoConfig', false, id);
  window.fbq('init', id);
  geladen = true;
}

/** Instellingen die alleen de server weet. */
async function haalInstellingen() {
  try {
    const antwoord = await fetch('/api/instellingen', { headers: { Accept: 'application/json' } });
    if (!antwoord.ok) return {};
    return await antwoord.json();
  } catch {
    return {};
  }
}

// ------------------------------------------------------- de gebeurtenissen -

/**
 * Wat er naar Meta gaat.
 *
 * Alleen de naam van de gebeurtenis en een eigen nummer. Geen naam, geen
 * e-mailadres, geen burgerservicenummer, geen rekeningnummer, en ook niet om
 * welke uitkering of welke instantie het gaat. Dat laatste lijkt onschuldig,
 * maar "Lead" plus "wia" vertelt Meta dat deze persoon arbeidsongeschikt is.
 *
 * Alles loopt via deze ene functie, zodat er maar één plek is waar dat kan
 * misgaan.
 */
let actief = false;
let testcode = '';

export function metaGebeurtenis(naam) {
  if (!actief) return null;
  const id = gebeurtenisId();
  try {
    // test_event_code hoort bij de custom data; staat hij niet ingesteld, dan
    // gaat er helemaal geen tweede argument mee.
    const gegevens = testcode ? { test_event_code: testcode } : {};
    window.fbq('track', naam, gegevens, { eventID: id });
  } catch { /* een meting mag nooit iets op het scherm kosten */ }
  return id;
}

/** Zodat de funnel en de knoppen erbij kunnen zonder te importeren. */
window.nbMeta = metaGebeurtenis;

/**
 * Klikken op een manier om contact op te nemen.
 *
 * Gedelegeerd, zodat het ook werkt voor knoppen die er later bij komen, en
 * zonder dat elke pagina er iets voor hoeft te doen.
 */
function luisterNaarContact() {
  document.addEventListener('click', (gebeurtenis) => {
    const link = gebeurtenis.target.closest
      && gebeurtenis.target.closest('a[href^="tel:"], a[href^="mailto:"], a[href*="wa.me"], a[href="/contact"]');
    if (link) metaGebeurtenis('Contact');
  }, { capture: true });
}

// ------------------------------------------------------------------ start --

function gevoeligePagina() {
  const pad = location.pathname.replace(/\/+$/, '') || '/';
  return GEVOELIGE_PADEN.includes(pad);
}

async function start() {
  const instellingen = await haalInstellingen();
  const id = String(instellingen.META_PIXEL_ID || '').trim();
  if (!id) return;                       // geen pixel ingesteld, geen vraag
  testcode = String(instellingen.META_TEST_EVENT_CODE || '').trim();
  const overal = String(instellingen.META_PIXEL_OVERAL || '') === '1';

  const aanzetten = () => {
    if (!overal && gevoeligePagina()) return;
    if (!geladen) laadPixel(id);
    actief = true;
    metaGebeurtenis('PageView');
    luisterNaarContact();
  };

  const gekozen = keuze();
  if (gekozen === 'ja') { aanzetten(); return; }
  if (gekozen === 'nee') return;

  toonBanner((antwoord) => { if (antwoord === 'ja') aanzetten(); });
}

start();
