/**
 * De aanvraag, van brief tot opdracht.
 *
 * De reis bestaat uit drie sporen, en de bezoeker ziet er telkens één:
 *
 *   1. **de controle** - je brief, aanvullen, je uitslag. Gratis, en je zit
 *      nergens aan vast. Wie hier stopt heeft gekregen waarvoor hij kwam.
 *   2. **de opdracht** - je keuze, je gegevens, toestemming. Pas hier wordt
 *      het een zaak, en pas hier vragen wij gegevens.
 *   3. **daarna** - de bevestiging en je dossier.
 *
 * Die volgorde is het hele punt. Eerder vroeg dit formulier op stap drie om
 * een adres, een geboortedatum, een burgerservicenummer en een rekeningnummer,
 * van iemand die net een foto van zijn brief had gemaakt en nog niet wist of
 * wij iets voor hem konden betekenen. Dat is nu weg: wij vragen een naam en
 * een e-mailadres, en de rest pas in het dossier - als de zaak is nagelopen en
 * er echt iets te doen valt. Zie `shared/funnelvragen.js` en `AANVRAAGVELDEN`.
 *
 * Elk scherm is een `<section data-scherm="...">` in start.html. `toon()`
 * wisselt ze en tekent de stappenbalk en de zijkolom erbij; er is dus één plek
 * waar staat waar de bezoeker is.
 */

import { berekenDwangsom, euro, UITKOMST } from '/shared/dwangsom.js';
import { parseDatum, toonDatum, vandaag, verschilDagen } from '/shared/datum.js';
import { labelBestuursorgaan, zoekZaaktype } from '/shared/catalogus.js';
import { teVragenVelden } from '/shared/funnelvragen.js';
import { tarief, tariefSplitsing, tariefKort, euroTekst } from '/shared/tarief.js';
import { meet } from '/assets/meting.js';
import { leesBrieven, combineer, alsLading, gekozenBestanden, MAX_BRIEVEN } from '/assets/brieven.js';

/** Instellingen die niet in de pagina kunnen staan: het tarief. */
const INSTELLINGEN = {};
fetch('/api/instellingen').then((a) => a.json()).then((d) => {
  Object.assign(INSTELLINGEN, d);
  // Het tarief komt later binnen dan de eerste tekening; staat de bezoeker al
  // op een scherm waar een bedrag hoort, dan hoort dat bedrag er alsnog te
  // komen in plaats van pas bij de volgende klik.
  if (['hulp', 'toestemming', 'voortgang'].includes(huidig)) toon(huidig);
}).catch(() => {});

const bij = (id) => document.getElementById(id);
const kaart = bij('kaart');

/** Kwam iemand via een advertentie, dan staat zijn instantie al in de url. */
const ingang = (() => {
  const params = new URLSearchParams(location.search);
  return { instantie: params.get('instantie') || '', van: params.get('van') || '' };
})();

/** De zaak zoals wij hem kennen. Groeit mee met wat de bezoeker aanlevert. */
const zaak = {
  invoer: {}, herkenning: {}, contact: {}, rapport: null,
  brief: null, verlengbrief: null, brieven: [], gelezenBrieven: [], brievenOpmerkingen: [],
  uitBrieven: { verdaagd: false, ingebrekeGesteld: false, besluitGenomen: false },
  handtekening: null, referentie: '', dossier: null,
};

// ------------------------------------------------------------- hulpjes ----

function el(tag, attrs = {}, ...kinderen) {
  const knoop = document.createElement(tag);
  for (const [naam, waarde] of Object.entries(attrs)) {
    if (waarde === null || waarde === undefined) continue;
    if (naam === 'tekst') knoop.textContent = waarde;
    else if (naam === 'class') knoop.className = waarde;
    else knoop.setAttribute(naam, waarde);
  }
  for (const kind of kinderen) {
    if (kind === null || kind === undefined || kind === false) continue;
    knoop.append(typeof kind === 'string' ? document.createTextNode(kind) : kind);
  }
  return knoop;
}

function zetFout(naam, tekst) {
  const vak = document.querySelector(`[data-fout="${naam}"]`);
  if (!vak) return;
  vak.textContent = tekst || '';
  vak.classList.toggle('verborgen', !tekst);
}

function datumTekst(iso) {
  const d = parseDatum(iso);
  return d ? toonDatum(d) : '';
}

/** 'de instantie' -> 'De instantie'. */
const metHoofdletter = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);

/** De naam van de instantie zoals hij in een zin past. */
function orgaanNaam() {
  return zaak.invoer.organisatienaam
    || labelBestuursorgaan(zaak.invoer.bestuursorgaan)
    || labelBestuursorgaan(ingang.instantie)
    || 'de instantie';
}

/**
 * De zaak in één korte vorm: 'je WW-aanvraag'.
 *
 * Met opzet een vaste lijst en niet het catalogus-label in kleine letters:
 * daarmee werd "WW" ineens "ww" en stonden er kromme zinnen op het scherm.
 */
function zaakInEenZin() {
  const zaaktype = zoekZaaktype(zaak.invoer && zaak.invoer.zaaktype);
  if (!zaaktype) return '';
  return { 'uwv-wia': 'je WIA-beslissing', 'uwv-ww': 'je WW-aanvraag',
    'uwv-wajong': 'je Wajong-beslissing', 'uwv-zw': 'je Ziektewet-uitkering',
    'uwv-herbeoordeling': 'je herbeoordeling', 'uwv-bezwaar': 'je bezwaar',
    'gem-bijstand': 'je bijstandsaanvraag', 'gem-bijzondere-bijstand': 'je aanvraag voor bijzondere bijstand',
    'gem-wmo': 'je Wmo-aanvraag', 'gem-jeugdwet': 'je aanvraag voor jeugdhulp',
    'gem-schuldhulp': 'je aanvraag voor schuldhulp', 'gem-parkeervergunning': 'je aanvraag bij de gemeente',
    'gem-bezwaar': 'je bezwaar', 'duo-studiefinanciering': 'je studiefinanciering',
    'duo-bezwaar': 'je bezwaar', 'svb-aow': 'je AOW-aanvraag', 'svb-bezwaar': 'je bezwaar',
    'bel-toeslag': 'je toeslag', 'bel-bezwaar': 'je bezwaar',
    'overig-aanvraag': 'je aanvraag', 'overig-bezwaar': 'je bezwaar' }[zaaktype.id] || '';
}

/**
 * De volgende stap zoals wij hem noemen, niet zoals de wet hem noemt.
 *
 * "Ingebrekestelling versturen" is precies het woord waarvoor iemand hier
 * komt; dat op zijn scherm zetten is de vertaling overslaan.
 */
function volgendeStapInGewoneTaal(vervolg, orgaan) {
  const ruw = String((vervolg && vervolg.actieLabel) || '');
  if (/ingebrekestelling/i.test(ruw)) return `${orgaan} laten weten dat je nog wacht`;
  if (/dwangsom/i.test(ruw)) return `De vergoeding bij ${orgaan} opeisen`;
  if (/termijn/i.test(ruw)) return `Wachten tot de termijn van ${orgaan} afloopt`;
  return ruw || 'Beoordelen door een behandelaar';
}

/**
 * Twee werkdagen vanaf vandaag, als datum.
 *
 * "Binnen twee werkdagen" laat de klant zelf rekenen, en op vrijdag rekent
 * hij verkeerd. Wij vertalen naar de datum die voor hem geldt.
 */
function uiterlijkOp(werkdagen = 2, vanaf = new Date()) {
  const d = new Date(vanaf.getTime());
  let over = werkdagen;
  while (over > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) over--;
  }
  return toonDatum(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

// ------------------------------------------------------- de schermen -----

/**
 * De drie sporen, en welk scherm waar in staat.
 *
 * `zij` is de tekst in de smalle kolom. Die hoort bij de stap en niet bij de
 * kaart: het is de geruststelling die je nodig hebt op het moment dat je aan
 * die stap begint, en hij staat daarom op één plek in plaats van in elk
 * scherm opnieuw.
 */
const SPOREN = {
  controle: ['Je brief', 'Aanvullen', 'Je uitslag'],
  opdracht: ['Je keuze', 'Je gegevens', 'Toestemming'],
  na: ['Bevestiging', 'Voortgang'],
};

const SCHERMEN = {
  kiezen: {
    spoor: 'controle', stap: 1, zijkop: 'Een kleine eerste stap',
    zij: ['Je hoeft niet zelf de juiste datum te vinden.', 'Een foto of pdf is genoeg.'],
  },
  lezen: {
    spoor: 'controle', stap: 1, zijkop: 'Je houdt de controle',
    zij: ['Er gaat geen melding naar de instantie.', 'Je kunt je bestanden nog aanpassen.'],
  },
  aanvullen: {
    spoor: 'controle', stap: 2, zijkop: 'Je kunt verder',
    zij: ['Je eerdere bestanden blijven staan.', 'Een onzekere uitkomst is geen afwijzing.'],
  },
  'meer-info': {
    spoor: 'controle', stap: 2, zijkop: 'Je kunt verder',
    zij: ['Je eerdere bestanden blijven staan.', 'Een onzekere uitkomst is geen afwijzing.'],
  },
  onleesbaar: {
    spoor: 'controle', stap: 2, zijkop: 'Je kunt verder',
    zij: ['Je eerdere bestanden blijven staan.', 'Een onzekere uitkomst is geen afwijzing.'],
  },
  'beslissing-binnen': {
    spoor: 'controle', stap: 2, zijkop: 'Je kunt verder',
    zij: ['Je eerdere bestanden blijven staan.', 'Een onzekere uitkomst is geen afwijzing.'],
  },
  storing: {
    spoor: 'controle', stap: 2, zijkop: 'Je kunt verder',
    zij: ['Je eerdere bestanden blijven staan.', 'Een onzekere uitkomst is geen afwijzing.'],
  },
  uitslag: {
    spoor: 'controle', stap: 3, zijkop: 'Jouw uitslag eerst',
    zij: ['Bekijk wat we hebben gevonden en waarop dat is gebaseerd.',
      'Je hoeft geen opdracht te geven om je uitslag te zien.'],
  },
  hulp: {
    spoor: 'opdracht', stap: 1, zijkop: 'Jij kiest de hulp',
    zij: ['Je mag de melding ook zelf regelen.',
      'Geen vergoeding voor het wachten? Dan kost onze hulp niets.'],
  },
  zelf: {
    spoor: 'opdracht', stap: 1, zijkop: 'Jij kiest de hulp',
    zij: ['Je mag de melding ook zelf regelen.', 'Een onzekere uitkomst is geen afwijzing.'],
  },
  gegevens: {
    spoor: 'opdracht', stap: 2, zijkop: 'Alleen wat nodig is',
    zij: ['Controleer je naam en e-mailadres voordat je verdergaat.',
      'Je burgerservicenummer en rekeningnummer vragen wij hier niet.'],
  },
  toestemming: {
    spoor: 'opdracht', stap: 3, zijkop: 'Dit is jouw keuze',
    zij: ['Controleer de zaak, onze werkzaamheden en de kosten.',
      'Er is nog niets naar de instantie gestuurd.'],
  },
  bevestiging: {
    spoor: 'na', stap: 1, zijkop: 'Wat gebeurt er nu?',
    zij: ['Een opdracht ontvangen is iets anders dan een melding versturen.',
      'Je ziet apart wanneer de melding is verstuurd.'],
  },
  voortgang: {
    spoor: 'na', stap: 2, zijkop: 'Geen verrassingen',
    zij: ['Je ziet wie aan zet is en wat jij eventueel moet doen.'],
  },
};

/** Welke meting en welke controlestap bij een scherm horen. */
const MEETSTAP = {
  uitslag: 'funnel-uitslag', gegevens: 'funnel-gegevens', toestemming: 'funnel-akkoord',
};
const CONTROLESTAP = { uitslag: 'uitslag', gegevens: 'gegevens', toestemming: 'akkoord' };
const gemeten = new Set();

let huidig = 'kiezen';

function tekenStappen(scherm) {
  const balk = bij('stappen');
  balk.textContent = '';
  const namen = SPOREN[scherm.spoor];
  namen.forEach((naam, i) => {
    const nummer = i + 1;
    const stand = nummer < scherm.stap ? 'klaar' : (nummer === scherm.stap ? 'bezig' : 'open');
    balk.append(el('li', { 'data-stand': stand },
      el('span', { class: 'stap__bol', tekst: String(nummer), 'aria-hidden': 'true' }),
      el('span', { class: 'stap__naam', tekst: naam }),
      stand === 'bezig' ? el('span', { class: 'sr-only', tekst: ' (hier ben je nu)' }) : null));
  });
}

/**
 * Van scherm wisselen.
 *
 * Eén plek, zodat de stappenbalk, de zijkolom, de meting en de focus niet
 * kunnen gaan afwijken van wat er te zien is.
 */
function toon(naam) {
  const scherm = SCHERMEN[naam];
  if (!scherm) return;
  huidig = naam;

  for (const sectie of document.querySelectorAll('[data-scherm]')) {
    sectie.classList.toggle('verborgen', sectie.dataset.scherm !== naam);
  }
  tekenStappen(scherm);
  bij('zij-kop').textContent = scherm.zijkop;
  const zij = bij('zij-tekst');
  zij.textContent = '';
  for (const regel of scherm.zij) zij.append(el('p', { tekst: regel }));

  // Wat er op dit scherm hoort te staan, wordt hier getekend. Zo kan een
  // scherm nooit oude inhoud laten zien van een eerdere doorloop.
  if (VOORBEREID[naam]) VOORBEREID[naam]();

  if (MEETSTAP[naam] && !gemeten.has(MEETSTAP[naam])) {
    gemeten.add(MEETSTAP[naam]);
    meet(MEETSTAP[naam]);
  }
  if (CONTROLESTAP[naam]) legControleVast(CONTROLESTAP[naam]);

  // Naar boven, en de kaart krijgt de focus: anders leest een schermlezer na
  // een klik gewoon door op de oude plek.
  scrollTo({ top: 0, behavior: 'smooth' });
  kaart.focus({ preventScroll: true });
}

// Knoppen en links die alleen van scherm wisselen.
for (const knop of document.querySelectorAll('[data-terug], [data-scherm-heen]')) {
  knop.addEventListener('click', (e) => {
    e.preventDefault();
    toon(knop.dataset.terug || knop.dataset.schermHeen);
  });
}

// ------------------------------------------- de controle vastleggen ------

/**
 * Een uitgevoerde controle vastleggen, ook als er geen aanvraag van komt.
 *
 * Verreweg de meeste mensen die hun brief laten lezen, dienen niets in. Wat
 * er dan wegloopt willen wij kunnen zien: wat voor zaak het was en waar
 * iemand stopte. De sleutel is een willekeurig nummer dat alleen in dit
 * tabblad leeft - er wordt niets op het apparaat gezet en niets herkend bij
 * een volgend bezoek.
 *
 * Naam, e-mailadres en telefoon gaan nooit mee; die horen niet bij iemand die
 * niets van ons heeft gevraagd.
 */
const controleSleutel = (() => {
  try { return crypto.randomUUID(); } catch {
    return `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
})();
let brievenGemeld = false;

function legControleVast(stap) {
  if (!zaak.invoer || !zaak.rapport) return;
  const params = new URLSearchParams(location.search);
  const lading = {
    sleutel: controleSleutel,
    stap,
    bron: params.get('bron') || params.get('utm_source') || '',
    van: params.get('van') || '',
    invoer: zaak.invoer,
    rapport: zaak.rapport,
  };
  if (!brievenGemeld && zaak.brieven.length > 0) {
    brievenGemeld = true;
    lading.brieven = zaak.brieven.map((brief, i) => ({
      bestandsnaam: brief.bestandsnaam,
      bron: brief.bron,
      soort: zaak.gelezenBrieven[i] ? zaak.gelezenBrieven[i].soort : '',
      tekst: brief.tekst,
    }));
  }
  try {
    const blok = new Blob([JSON.stringify(lading)], { type: 'application/json' });
    if (navigator.sendBeacon && blok.size < 60000) {
      navigator.sendBeacon('/api/controle', blok);
      return;
    }
    fetch('/api/controle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lading), keepalive: blok.size < 60000,
    }).catch(() => {});
  } catch { /* meten mag nooit in de weg zitten */ }
}

// --------------------------------------------------- 1. je brief kiezen --

const invoerveld = bij('bestand');
const kiesvak = bij('kiesvak');
const bestandenlijst = bij('bestanden');
const kiesmelding = bij('kiezen-melding');

/** @type {{bestand: File, sleutel: string, soort: 'foto'|'pdf', url: string}[]} */
let gekozen = [];

const sleutelVan = (b) => JSON.stringify([b.name, b.size, b.lastModified, b.type]);

function soortVan(bestand) {
  const naam = String(bestand.name || '').toLowerCase();
  if (bestand.type === 'image/svg+xml' || /\.svgz?$/.test(naam)) return null;
  if (bestand.type === 'application/pdf' || /\.pdf$/.test(naam)) return 'pdf';
  if (/^image\/(jpeg|png|webp|heic|heif|avif|gif|bmp|x-ms-bmp|tiff)$/i.test(bestand.type)
    || /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp|tiff?)$/.test(naam)) return 'foto';
  return null;
}

function leesbaarFormaat(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} MB`;
}

function melding(soort, titel, tekst) {
  return el('div', { class: `melding melding--${soort}`, style: 'margin-top:18px' },
    el('strong', { tekst: titel }), tekst ? el('p', { tekst }) : null);
}

function toonKiesfout(regels) {
  kiesmelding.textContent = '';
  if (!regels.length) return;
  const vak = el('div', { class: 'melding melding--let-op', style: 'margin-top:18px' },
    el('strong', { tekst: 'Deze bestanden hebben aandacht nodig' }));
  const lijst = el('ul', { style: 'margin:8px 0 0; padding-left:18px' });
  for (const regel of regels) lijst.append(el('li', { tekst: regel }));
  vak.append(lijst);
  kiesmelding.append(vak);
}

function verwijderBestand(sleutel) {
  const plek = gekozen.findIndex((r) => r.sleutel === sleutel);
  if (plek < 0) return;
  const [regel] = gekozen.splice(plek, 1);
  URL.revokeObjectURL(regel.url);
  toonBestanden();
}

function bestandKaartje(regel) {
  const rij = el('li', { class: 'bestand' });

  const duim = el(regel.soort === 'pdf' ? 'a' : 'button', { class: 'bestand__duim' });
  if (regel.soort === 'pdf') {
    duim.href = regel.url;
    duim.target = '_blank';
    duim.rel = 'noopener noreferrer';
    duim.setAttribute('aria-label', `Open ${regel.bestand.name} in een nieuw tabblad`);
    duim.textContent = 'PDF';
    duim.append(el('span', { tekst: 'Open' }));
  } else {
    duim.type = 'button';
    duim.setAttribute('aria-label', `Bekijk ${regel.bestand.name}`);
    const beeld = el('img', { alt: '', src: regel.url });
    duim.append(beeld, el('span', { tekst: 'Bekijk' }));
    duim.addEventListener('click', () => window.open(regel.url, '_blank', 'noopener'));
    // Lukt de miniatuur niet - heic op een android-telefoon - dan blijft het
    // bestand bruikbaar; alleen het plaatje valt weg.
    beeld.addEventListener('error', () => {
      duim.textContent = 'FOTO';
      duim.disabled = true;
      duim.setAttribute('aria-label', 'Foto gekozen; voorvertoning niet beschikbaar op dit apparaat');
    });
  }

  const weg = el('button', { type: 'button', class: 'bestand__weg', tekst: 'Verwijder',
    'aria-label': `Verwijder ${regel.bestand.name}` });
  weg.addEventListener('click', () => verwijderBestand(regel.sleutel));

  rij.append(duim,
    el('div', {},
      el('p', { class: 'bestand__naam', tekst: regel.bestand.name }),
      el('p', { class: 'bestand__over',
        tekst: `${regel.soort === 'pdf' ? 'PDF' : 'Foto'}, ${leesbaarFormaat(regel.bestand.size)}` })),
    weg);
  return rij;
}

function toonBestanden() {
  bestandenlijst.replaceChildren(...gekozen.map(bestandKaartje));
}

function voegBestandenToe(bestanden) {
  const fouten = [];
  const sleutels = new Set(gekozen.map((r) => r.sleutel));
  let teveel = 0;
  let nieuw = 0;

  for (const bestand of gekozenBestanden(bestanden, Infinity)) {
    const soort = soortVan(bestand);
    if (!soort) {
      fouten.push(`${bestand.name}: kies een foto of pdf. Dit bestandstype kunnen we niet lezen.`);
      continue;
    }
    const sleutel = sleutelVan(bestand);
    if (sleutels.has(sleutel)) continue;
    if (gekozen.length >= MAX_BRIEVEN) { teveel += 1; continue; }
    const bron = soort === 'pdf' ? new Blob([bestand], { type: 'application/pdf' }) : bestand;
    gekozen.push({ bestand, sleutel, soort, url: URL.createObjectURL(bron) });
    sleutels.add(sleutel);
    nieuw += 1;
  }

  if (teveel) fouten.push(`Er passen ${MAX_BRIEVEN} brieven in één controle; de rest is niet toegevoegd.`);
  toonKiesfout(fouten);
  toonBestanden();
  return nieuw;
}

bij('knop-kiezen').addEventListener('click', () => invoerveld.click());
invoerveld.addEventListener('change', () => {
  const erbij = voegBestandenToe(invoerveld.files);
  invoerveld.value = '';
  // "Na je keuze gaan we direct verder": wie een brief kiest, wil hem laten
  // lezen. Nog een knop ertussen is een stap die niets toevoegt.
  if (erbij > 0) leesDeBrieven();
});

let sleepdiepte = 0;
kiesvak.addEventListener('dragenter', (e) => {
  e.preventDefault(); sleepdiepte += 1; kiesvak.classList.add('sleep');
});
kiesvak.addEventListener('dragover', (e) => {
  e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
});
kiesvak.addEventListener('dragleave', (e) => {
  e.preventDefault(); sleepdiepte = Math.max(0, sleepdiepte - 1);
  if (!sleepdiepte) kiesvak.classList.remove('sleep');
});
kiesvak.addEventListener('drop', (e) => {
  e.preventDefault(); sleepdiepte = 0; kiesvak.classList.remove('sleep');
  if (e.dataTransfer && voegBestandenToe(e.dataTransfer.files) > 0) leesDeBrieven();
});

// "Een brief toevoegen" op de aanvulschermen brengt je terug naar de keuze én
// opent meteen de kiezer: dat is waar de knop om vraagt.
for (const knop of document.querySelectorAll('[data-erbij]')) {
  knop.addEventListener('click', () => { toon('kiezen'); invoerveld.click(); });
}

bij('knop-opnieuw').addEventListener('click', () => leesDeBrieven());

// -------------------------------------------------- de brieven lezen ----

function herbereken() {
  zaak.rapport = berekenDwangsom(zaak.invoer);
}

function pasDossierToe(data) {
  if (!gemeten.has('funnel-brief')) { gemeten.add('funnel-brief'); meet('funnel-brief'); }
  zaak.brief = data.brief;
  zaak.verlengbrief = data.verlengbrief || null;
  zaak.brieven = data.alleBrieven || [];
  zaak.gelezenBrieven = data.brieven || [];
  zaak.brievenOpmerkingen = data.opmerkingen || [];
  zaak.herkenning = data.herkenning || {};
  zaak.invoer = data.invoer || {};
  if (!zaak.invoer.bestuursorgaan && ingang.instantie) zaak.invoer.bestuursorgaan = ingang.instantie;
  zaak.rapport = berekenDwangsom(zaak.invoer);
  // Wat uit de brieven zelf blijkt, hoeft straks niet meer gevraagd te worden.
  zaak.uitBrieven = {
    verdaagd: Boolean(zaak.invoer.verdaagd),
    ingebrekeGesteld: Boolean(zaak.invoer.ingebrekeGesteld),
    besluitGenomen: Boolean(zaak.invoer.besluitGenomen),
  };
}

/** Welk scherm hoort bij wat wij net gelezen hebben? */
function naHetLezen() {
  const r = zaak.rapport;
  if (zaak.invoer.besluitGenomen && !zaak.invoer.ingebrekeGesteld) {
    return 'beslissing-binnen';
  }
  if (!r || r.onvolledig) {
    const wat = bij('meerinfo-wat');
    wat.textContent = (r && r.samenvatting)
      || 'Heb je na deze brief een nieuwe datum of beslissing gekregen?';
    return 'meer-info';
  }
  return 'aanvullen';
}

async function leesDeBrieven() {
  if (gekozen.length === 0) { toon('kiezen'); return; }
  toon('lezen');
  const stand = bij('lezen-stand');
  const foto = gekozen.some((r) => r.soort !== 'pdf');
  stand.textContent = gekozen.length > 1 ? 'Wij lezen je brieven…' : 'Wij lezen je brief…';
  let traag = null;
  if (foto) {
    traag = setTimeout(() => {
      stand.textContent = `${stand.textContent} Een foto duurt wat langer dan een pdf.`;
    }, 6000);
  }

  try {
    const ladingen = [];
    for (const regel of gekozen) ladingen.push(await alsLading(regel.bestand));
    const data = await leesBrieven(ladingen, {
      bijVoortgang: (klaar, totaal) => {
        stand.textContent = totaal > 1
          ? `Wij lezen je brieven… (${Math.min(klaar + 1, totaal)} van ${totaal})`
          : 'Wij lezen je brief…';
      },
    });
    pasDossierToe(data);
    toonWatWijLazen();
    toon(naHetLezen());
  } catch (fout) {
    // Een foto die niet te lezen is, is iets anders dan een storing: in het
    // eerste geval kan de bezoeker er zelf iets aan doen, in het tweede niet.
    const beeldfout = ['onleesbaar-beeld', 'afbeelding', 'heic', 'formaat'].includes(fout.soort);
    if (beeldfout) {
      bij('onleesbaar-onder').textContent = fout.message;
      if (fout.hint) bij('onleesbaar-hint').textContent = fout.hint;
      toon('onleesbaar');
    } else {
      bij('storing-onder').textContent = `${fout.message} Je bestanden staan er nog.`;
      toon('storing');
    }
  } finally {
    clearTimeout(traag);
  }
}

// ----------------------------------------------------- 2. aanvullen ------

/** Wat al uit de brieven bleek: geen vraag maar een bevestiging. */
function uitJeBrieven(tekst) {
  return el('div', { class: 'melding melding--info', style: 'margin-top:14px' },
    el('strong', { tekst: '✓ Dit stond al in je brief' }), el('p', { tekst }));
}

/** Eén ja/nee-vraag, of met eigen antwoorden. */
function vraag(tekst, naam, huidigAntwoord, bijKeuze, uitleg, opties) {
  const keuzes = opties || [{ label: 'Nee', waarde: false }, { label: 'Ja', waarde: true }];
  const vak = el('div', { class: 'veld', style: 'margin-top:20px' },
    el('span', { class: 'veld__kop', tekst }));
  if (uitleg) vak.append(el('p', { class: 'veld__hulp', tekst: uitleg }));
  const rij = el('div', { class: 'keuzes keuzes--rij' });
  for (const keuze of keuzes) {
    const knop = el('button', {
      type: 'button',
      class: `knop knop--keuze${keuze.waarde === huidigAntwoord ? ' knop--keuze-aan' : ''}`,
      tekst: keuze.label,
    });
    knop.addEventListener('click', () => bijKeuze(keuze.waarde));
    rij.append(knop);
  }
  vak.append(rij);
  return vak;
}

/** Wat wij uit de brieven haalden, op één rij. */
function toonWatWijLazen() {
  const vak = bij('uitbrief');
  vak.textContent = '';
  const orgaan = orgaanNaam();
  const zaaktype = zoekZaaktype(zaak.invoer.zaaktype);
  const einddatum = datumTekst(
    (zaak.rapport && zaak.rapport.beslistermijn && zaak.rapport.beslistermijn.einddatum)
    || zaak.invoer.termijnEinddatum,
  );

  const lijst = el('dl', { class: 'samenvatting' });
  const regel = (kop, waarde) => {
    if (!waarde) return;
    lijst.append(el('div', {}, el('dt', { tekst: kop }), el('dd', { tekst: waarde })));
  };
  regel('Instantie', orgaan);
  regel('Soort zaak', zaaktype ? zaaktype.label : '');
  regel('Uiterste beslisdatum volgens je brief', einddatum);
  regel('Aantal brieven gelezen', zaak.brieven.length ? String(zaak.brieven.length) : '');
  if (lijst.children.length) vak.append(lijst);

  for (const opmerking of zaak.brievenOpmerkingen) {
    vak.append(melding('let-op', opmerking.kop || 'Let op', opmerking.tekst || ''));
  }
}

/** De vragen die de uitkomst nog kunnen omgooien. */
function tekenAanvulvragen() {
  const vak = bij('aanvullen');
  vak.textContent = '';
  const orgaan = orgaanNaam();

  vak.append(vraag('Heb je inmiddels een beslissing ontvangen?', 'beslissing',
    zaak.invoer.besluitGenomen, (ja) => {
      zaak.invoer.besluitGenomen = ja;
      if (!ja) zaak.invoer.besluitDatum = '';
      else if (!zaak.invoer.besluitDatum) zaak.invoer.besluitDatum = zaak.herkenning.briefdatum || '';
      herbereken();
      tekenAanvulvragen();
    }));

  if (!zaak.invoer.besluitGenomen && zaak.uitBrieven.verdaagd) {
    vak.append(uitJeBrieven(`${metHoofdletter(orgaan)} heeft de beslisdatum verzet naar `
      + `${datumTekst(zaak.invoer.verdagingEinddatum || zaak.invoer.termijnEinddatum)}.`));
  } else if (!zaak.invoer.besluitGenomen) {
    vak.append(vraag(`Heeft ${orgaan} daarna laten weten meer tijd nodig te hebben?`, 'verlenging',
      zaak.invoer.verdaagd, (ja) => {
        zaak.invoer.verdaagd = ja;
        if (!ja) {
          zaak.invoer.verdagingEinddatum = '';
          zaak.invoer.termijnEinddatum = zaak.herkenning.beslisdatum || '';
        }
        herbereken();
        tekenAanvulvragen();
      }));
    if (zaak.invoer.verdaagd && !zaak.verlengbrief) {
      vak.append(el('div', { class: 'melding melding--info', style: 'margin-top:12px' },
        el('strong', {}, 'Voeg die brief erbij'),
        el('p', {}, 'Daarin staat de nieuwe datum. Zonder die brief rekenen wij met de oude.')));
      const knop = el('button', { type: 'button', class: 'knop knop--zacht knop--klein',
        style: 'margin-top:10px' }, 'Brief toevoegen');
      knop.addEventListener('click', () => { toon('kiezen'); invoerveld.click(); });
      vak.append(knop);
    }
  }

  if (!zaak.invoer.besluitGenomen && zaak.uitBrieven.ingebrekeGesteld) {
    vak.append(uitJeBrieven('Je hebt zelf al gemeld dat je wacht'
      + `${zaak.invoer.ingebrekestellingDatum ? `, op ${datumTekst(zaak.invoer.ingebrekestellingDatum)}` : ''}. `
      + 'Dat hoef je dus niet nog een keer te doen.'));
  } else if (!zaak.invoer.besluitGenomen) {
    // Bewust niet "aangemaand": dat woord kent bijna niemand. En bewust een
    // derde antwoord: iemand kan best iets gestuurd hebben zonder te weten of
    // dat juridisch als melding telt. Dat beoordelen wij, niet hij.
    vak.append(vraag(`Heb je ${orgaan} al een brief of bericht gestuurd omdat je te lang wacht?`,
      'igs', zaak.invoer.igsOnzeker ? 'onzeker' : zaak.invoer.ingebrekeGesteld, (ja) => {
        zaak.invoer.ingebrekeGesteld = ja === true;
        zaak.invoer.igsOnzeker = ja === 'onzeker';
        if (!ja) zaak.invoer.ingebrekestellingDatum = '';
        if (!ja || zaak.invoer.ingebrekestellingDatum) herbereken();
        tekenAanvulvragen();
      },
      'Je hoeft niet te weten of dat juridisch als officiële melding telt; dat zoeken wij uit.',
      [{ label: 'Nee', waarde: false }, { label: 'Ja', waarde: true },
        { label: 'Weet ik niet', waarde: 'onzeker' }]));

    if (zaak.invoer.igsOnzeker) {
      vak.append(el('div', { class: 'melding melding--info', style: 'margin-top:12px' },
        el('strong', {}, 'Geen probleem, dat zoeken wij uit'),
        el('p', {}, 'Voeg die brief of e-mail toe aan je dossier, dan controleren wij of hij als '
          + 'melding kan gelden. Zo niet, dan versturen wij alsnog een nieuwe.')));
    }
    if (zaak.invoer.ingebrekeGesteld) {
      const datumvak = el('div', { class: 'veld', style: 'margin-top:14px' },
        el('label', { for: 'igs-datum' }, 'Wanneer heb je die verstuurd?'));
      const veld = el('input', { type: 'date', id: 'igs-datum' });
      veld.value = zaak.invoer.ingebrekestellingDatum || '';
      veld.addEventListener('change', () => {
        zaak.invoer.ingebrekestellingDatum = veld.value;
        herbereken();
        tekenAanvulvragen();
      });
      datumvak.append(veld,
        el('p', { class: 'veld__hulp', style: 'margin-top:6px' },
          'Weet je de datum niet meer? Kies dan hierboven "Weet ik niet"; wij zoeken het uit.'),
        el('p', { class: 'veld__fout verborgen', 'data-fout': 'igs-datum' }));
      vak.append(datumvak);
    }
  }
}

bij('knop-naar-uitslag').addEventListener('click', () => {
  if (zaak.invoer.ingebrekeGesteld && !zaak.invoer.ingebrekestellingDatum) {
    zetFout('igs-datum', 'Vul de datum in, of kies "Weet ik niet".');
    return;
  }
  herbereken();
  if (zaak.rapport && zaak.rapport.onvolledig) {
    bij('meerinfo-wat').textContent = zaak.rapport.samenvatting
      || 'Heb je na deze brief een nieuwe datum of beslissing gekregen?';
    toon('meer-info');
    return;
  }
  tekenUitslag();
  toon('uitslag');
});

// ------------------------------------------------------ 3. je uitslag ----

/**
 * De zin uit de brief waarin de datum staat.
 *
 * Wij vertellen de bezoeker dat zijn brief gelezen is; dat is overtuigender
 * als hij zijn eigen zin terugziet dan als wij alleen een datum noemen. Staat
 * de zin er niet in - een gescande brief levert soms rommelige tekst - dan
 * laten wij het citaat gewoon weg in plaats van iets te verzinnen.
 */
function citaatUitBrief(tekst, datumISO) {
  const datum = parseDatum(datumISO);
  if (!datum || !tekst) return null;
  const geschreven = toonDatum(datum);
  const plek = tekst.indexOf(geschreven);
  if (plek < 0) return null;
  const begin = Math.max(0, tekst.lastIndexOf('.', plek) + 1);
  const eind = tekst.indexOf('.', plek + geschreven.length);
  const zin = tekst.slice(begin, eind < 0 ? plek + geschreven.length + 60 : eind + 1)
    .replace(/\s+/g, ' ').trim();
  if (zin.length < geschreven.length + 8 || zin.length > 240) return null;
  return { zin, datum: geschreven };
}

function tekenUitslag() {
  const vak = bij('uitslag');
  vak.textContent = '';
  const r = zaak.rapport;
  const orgaan = orgaanNaam();
  const kaartvak = bij('kaart');
  kaartvak.classList.add('kaartblad--uitslag');

  if (!r) {
    vak.append(
      el('p', { class: 'bovenkop', tekst: 'Je uitslag' }),
      el('h1', {}, 'Wij konden er niet genoeg uithalen'),
      el('p', {}, 'Uit deze brief halen wij te weinig om nu al te rekenen. Beantwoord een paar '
        + 'korte vragen, dan kijken wij alsnog mee.'));
    const knoppen = el('div', { class: 'knoprij' },
      el('a', { class: 'knop knop--primair', href: '/aanvraag-klassiek' }, 'Vragen beantwoorden'));
    vak.append(knoppen);
    return;
  }

  const einddatum = datumTekst(r.beslistermijn ? r.beslistermijn.einddatum : zaak.invoer.termijnEinddatum);
  const teLaat = r.uitkomst === UITKOMST.RECHT
    || r.uitkomst === UITKOMST.INGEBREKESTELLING_NODIG
    || r.uitkomst === UITKOMST.HERSTELTERMIJN_LOOPT;
  const opgebouwd = r.berekening && r.berekening.dagen > 0 ? euro(r.berekening.totaal) : null;

  let titel;
  if (r.uitkomst === UITKOMST.GEEN_RECHT) titel = 'Hier kunnen wij niets mee claimen';
  else if (r.uitkomst === UITKOMST.TERMIJN_LOOPT) titel = `${metHoofdletter(orgaan)} heeft nog tijd om te beslissen`;
  else if (opgebouwd) titel = `${metHoofdletter(orgaan)} is te laat: er staat ${opgebouwd} open`;
  else titel = `${metHoofdletter(orgaan)} lijkt te laat`;

  vak.append(el('p', { class: 'bovenkop', tekst: 'Je uitslag' }), el('h1', { tekst: titel }));

  if (teLaat) {
    vak.append(el('p', {}, einddatum
      ? `De datum uit je brief is voorbij. Je wacht nog steeds op een beslissing.`
      : 'De beslistermijn lijkt verstreken. Je wacht nog steeds op een beslissing.'));
  } else if (r.uitkomst === UITKOMST.TERMIJN_LOOPT) {
    vak.append(el('p', {}, `${metHoofdletter(orgaan)} is nog niet te laat. Je hoeft nu niets te doen.`));
  }

  // Het citaat uit de eigen brief, als wij de zin kunnen terugvinden.
  const bron = zaak.brief && zaak.brief.tekst;
  const citaat = citaatUitBrief(bron, r.beslistermijn ? r.beslistermijn.einddatum : zaak.invoer.termijnEinddatum);
  if (citaat) {
    const zaaktype = zoekZaaktype(zaak.invoer.zaaktype);
    const blok = el('div', { class: 'briefcitaat' },
      el('p', { class: 'bovenkop',
        tekst: `Uit je brief${zaaktype ? `: ${zaaktype.label}` : ''}` }));
    const quote = el('blockquote');
    const stukken = citaat.zin.split(citaat.datum);
    quote.append(document.createTextNode(`“${stukken[0]}`));
    quote.append(el('mark', { tekst: citaat.datum }));
    quote.append(document.createTextNode(`${stukken.slice(1).join(citaat.datum)}”`));
    blok.append(quote);
    if (zaak.brief && zaak.brief.bestandsnaam) {
      blok.append(el('p', { tekst: `Gelezen uit ${zaak.brief.bestandsnaam}.` }));
    }
    vak.append(blok);
  }

  // De twee feiten naast elkaar. Dit is het moment waarop iemand moet zien dat
  // wij zijn brief echt gelezen hebben.
  if (einddatum) {
    const dagen = r.beslistermijn ? verschilDagen(parseDatum(r.beslistermijn.einddatum), vandaag()) : 0;
    const situatie = zaak.invoer.besluitGenomen
      ? 'Beslissing ontvangen'
      : (dagen > 0 ? `${dagen} ${dagen === 1 ? 'dag' : 'dagen'} langer dan in je brief`
        : dagen === 0 ? 'Vandaag is de laatste dag' : 'Nog geen beslissing');
    vak.append(el('dl', { class: 'feiten' },
      el('div', {}, el('dt', { tekst: 'Datum in de brief' }), el('dd', { tekst: einddatum })),
      el('div', {}, el('dt', { tekst: 'Jouw situatie' }), el('dd', { tekst: situatie }))));
  }

  if (opgebouwd) {
    vak.append(el('p', { class: 'blok blok--geld' },
      el('strong', { tekst: `Er staat op dit moment ${opgebouwd} open.` }),
      'Dat bedrag loopt op zolang er geen beslissing is, tot het wettelijke maximum.'));
  }

  // --- wat kun je nu doen -------------------------------------------------
  if (teLaat) {
    // De conclusie herhaalt wat de bezoeker zélf heeft aangeleverd, in zijn
    // eigen woorden. Dat de termijn verstreken is, wist hij al vanaf de kop;
    // dat hij daarom nú iets kan doen, is de conclusie waar hij op wacht.
    const kortezaak = zaakInEenZin();
    const blok = el('div', { class: 'blok blok--info' },
      el('strong', { style: 'display:block; margin-bottom:8px',
        tekst: `Je kunt nu in actie komen${kortezaak ? ` met ${kortezaak}` : ''}` }));
    if (einddatum) {
      blok.append(el('p', { style: 'margin:0 0 8px',
        tekst: `Volgens je brief had ${orgaan} uiterlijk ${einddatum} moeten beslissen.` }));
    }
    const nogNiets = [];
    if (!zaak.invoer.besluitGenomen) nogNiets.push('nog geen beslissing');
    if (!zaak.invoer.verdaagd) nogNiets.push('geen nieuwe datum');
    if (nogNiets.length) {
      blok.append(el('p', { style: 'margin:0 0 8px',
        tekst: `Je gaf aan dat je ${nogNiets.join(' en ')} van ${orgaan} hebt ontvangen.` }));
    }
    blok.append(el('p', { style: 'margin:0', tekst: zaak.invoer.ingebrekeGesteld
      ? `Je hebt ${orgaan} zelf al laten weten dat je wacht; wij nemen die melding over.`
      : `Daarom kunnen wij ${orgaan} nu officieel laten weten dat je nog steeds wacht.` }));
    vak.append(blok);

    vak.append(el('h2', {}, 'Wat kun je nu doen?'));
    vak.append(el('p', { style: 'margin-top:6px' },
      `Je kunt ${orgaan} officieel laten weten dat je nog op een beslissing wacht. Dat heet een `
      + 'melding te late beslissing. Wij kunnen die voor je regelen.'));
    vak.append(el('p', { class: 'blok blok--info' },
      'Een melding betekent niet dat je zeker geld krijgt. Of een vergoeding mogelijk is, hangt '
      + `af van jouw situatie en de reactie van ${orgaan}.`));
    vak.append(el('div', { class: 'knoprij' },
      knopNaar('Bekijk onze hulp', 'hulp', 'primair'),
      knopNaar('Ik wil het zelf regelen', 'zelf', 'zacht')));
  } else if (r.uitkomst === UITKOMST.TERMIJN_LOOPT) {
    vak.append(el('div', { class: 'blok blok--info' },
      el('strong', { style: 'display:block; margin-bottom:6px', tekst: 'Uiterste beslisdatum' }),
      el('div', { style: 'font-size:1.3rem; font-weight:800; margin-bottom:8px', tekst: einddatum || 'nog onbekend' }),
      el('span', {}, 'Is er daarna nog geen beslissing? Controleer je situatie dan opnieuw, ook als '
        + 'je intussen een nieuwe brief krijgt.')));
    vak.append(el('div', { class: 'knoprij' },
      knopNaar('Laat het ons bijhouden', 'hulp', 'primair'),
      knopNaar('Ik wil het zelf regelen', 'zelf', 'zacht')));
  } else {
    for (const blokkade of r.blokkades || []) {
      vak.append(melding('let-op', blokkade.titel, blokkade.uitleg));
    }
    vak.append(el('p', { class: 'blok blok--info' },
      'Een behandelaar kan er met een menselijk oog naar kijken. Dat kost je niets.'));
    vak.append(el('div', { class: 'knoprij' },
      knopNaar('Laat een mens meekijken', 'hulp', 'primair'),
      knopNaar('Ik wil het zelf regelen', 'zelf', 'zacht')));
  }
}

function knopNaar(tekst, scherm, soort) {
  const knop = el('button', { type: 'button', class: `knop knop--${soort}`, tekst });
  knop.addEventListener('click', () => toon(scherm));
  return knop;
}

// ---------------------------------------------- opdracht 1. je keuze -----

/**
 * Het rekenvoorbeeld bij de kosten.
 *
 * Het bedrag komt uit deze zaak als wij het weten, en anders is het een rond
 * voorbeeldbedrag dat ook zo benoemd wordt. Het percentage komt uit
 * `tarief.js`, nooit uit deze tekst: staat hier 20% terwijl de voorwaarden 25%
 * zeggen, dan is dat een onjuiste prijsvermelding.
 */
function kostenblok({ compact = false } = {}) {
  const t = tarief(INSTELLINGEN);
  const orgaan = orgaanNaam();
  const blok = el('div', { class: 'blok blok--geld' });

  // Eerst wat de klant nú betaalt. Dat is de vraag waarmee hij hier zit, en
  // het antwoord is niets.
  blok.append(el('strong', { class: 'kostenblok__nu', tekst: 'Je betaalt nu niets.' }));

  if (!t.bekend) {
    blok.append(el('span', {}, 'Krijg je een vergoeding voor het wachten? Dan hoor je eerst '
      + 'precies wat onze hulp kost. Je gaat nooit ergens aan vast zonder dat je het bedrag kent.'));
    return blok;
  }

  // De twee gevallen als vraag met antwoord. Een tabel met bedragen leest als
  // een rekening; dit moet lezen als een afspraak.
  const geval = (vraagtekst, antwoord) => el('p', { class: 'kostengeval', style: 'margin-top:14px' },
    el('span', { style: 'display:block; color:var(--tekst-zacht)', tekst: vraagtekst }),
    el('strong', { tekst: antwoord }));

  blok.append(geval(`Krijg je uiteindelijk geen vergoeding van ${orgaan}?`,
    'Dan betaal je ons niets, ook niet voor het werk dat we al hebben gedaan.'));
  blok.append(geval(`Krijg je wél een vergoeding omdat ${orgaan} te laat is?`,
    t.soort === 'percentage'
      ? `Dan rekenen wij ${t.percentage}% van die vergoeding voor het behandelen van je zaak, `
        + 'pas als het geld op je rekening staat.'
      : `Dan rekenen wij ${tariefKort(t)} voor het behandelen van je zaak, pas als het geld `
        + 'op je rekening staat.'));

  const echtBedrag = zaak.rapport && zaak.rapport.berekening && zaak.rapport.berekening.dagen > 0
    ? zaak.rapport.berekening.totaal : 0;
  const voorbeeld = echtBedrag || 500;
  const splitsing = tariefSplitsing(t, voorbeeld);

  if (!compact && splitsing) {
    blok.append(el('p', { style: 'font-size:.94rem; margin:18px 0 0',
      tekst: echtBedrag ? 'Bij het bedrag dat nu openstaat' : `Rekenvoorbeeld bij ${euroTekst(voorbeeld)}` }));
    blok.append(el('div', { class: 'verdeling' },
      el('div', { class: 'verdeling__jij', tekst: `${euroTekst(splitsing.overhoudt)} voor jou` }),
      el('div', { class: 'verdeling__ons', tekst: `${euroTekst(splitsing.vergoeding)} voor onze hulp` }),
      el('div', { class: 'verdeelbalk', 'aria-hidden': 'true' },
        el('span', { style: `flex:${splitsing.overhoudt}` }),
        el('span', { style: `flex:${splitsing.vergoeding}` })),
      el('p', { class: 'verdeling__voetnoot',
        tekst: echtBedrag
          ? 'Het bedrag loopt nog op. Wij rekenen niets over je uitkering.'
          : 'Rekenvoorbeeld, geen voorspelling. Wij rekenen niets over je uitkering.' })));
  }

  // Waar het geld heen gaat. Dit is de vraag die mensen niet stellen maar wel
  // hebben: krijgt dit bedrijf mijn vergoeding onder zich?
  blok.append(el('p', { class: 'kostenblok__slot', style: 'font-size:.94rem; margin-top:16px' },
    `Een eventuele vergoeding wordt door ${orgaan} rechtstreeks aan jou betaald. `
    + 'Wij ontvangen jouw vergoeding niet.'));
  return blok;
}

/**
 * Wat wij aanbieden, hangt af van waar de zaak staat.
 *
 * "Wij regelen nu de melding" is bij een termijn die nog loopt gewoon onwaar,
 * en bij een onvolledige of geblokkeerde uitslag is nog helemaal niet
 * vastgesteld dát er een melding moet. Eén vaste zin zou hier dus een belofte
 * doen die wij op dat moment niet nakomen. De terugvaloptie is daarom bewust
 * de neutrale zin en niet die melding.
 */
function watWijDoenBij(uitkomst, orgaan) {
  return {
    [UITKOMST.INGEBREKESTELLING_NODIG]: `Wil je dat wij ${orgaan} officieel laten weten dat je nog `
      + 'op een beslissing wacht? Wij regelen nu de melding en houden daarna het vervolg bij.',
    [UITKOMST.RECHT]: `Wij eisen de vergoeding bij ${orgaan} op en nemen het vervolg van je zaak `
      + 'voor je uit handen.',
    [UITKOMST.HERSTELTERMIJN_LOOPT]: `Wij nemen de lopende procedure van je over en bewaken de `
      + `termijn die voor ${orgaan} loopt.`,
    [UITKOMST.TERMIJN_LOOPT]: `Wij houden de datum in de gaten waarop ${orgaan} moet beslissen, en `
      + 'versturen de melding zodra die voorbij is.',
  }[uitkomst]
    || `Wij nemen je zaak in behandeling, zoeken uit welke stap er nodig is en nemen het vervolg `
      + 'voor je uit handen.';
}

function tekenHulp() {
  const orgaan = orgaanNaam();
  bij('hulp-onder').textContent = watWijDoenBij((zaak.rapport || {}).uitkomst, orgaan);
  bij('hulp-volgen').textContent = `We houden bij wanneer ${orgaan} moet reageren en laten je `
    + 'weten wat de volgende stap is.';
  const vak = bij('hulp-kosten');
  vak.textContent = '';
  vak.append(kostenblok());
}

function tekenZelf() {
  const orgaan = orgaanNaam();
  bij('zelf-onder').textContent = 'Bewaar je brieven en controleer welke datum voor jouw situatie '
    + `geldt. Is ${orgaan} te laat, dan kun je zelf schriftelijk melden dat je nog wacht.`;
  bij('zelf-uitleg').textContent = `Zet in die brief of e-mail om welke aanvraag het gaat, dat je `
    + 'nog geen beslissing hebt ontvangen, en vraag om alsnog te beslissen. Bewaar het '
    + 'verzendbewijs: dat bepaalt vanaf welke dag een vergoeding kan gaan lopen.';
}

bij('knop-regel').addEventListener('click', () => toon('gegevens'));

// -------------------------------------------- opdracht 2. je gegevens ---

/** Velden waarover de server klaagde; die tonen wij daarna altijd. */
const geforceerdeVelden = new Set();

function tekenGegevens() {
  const vak = bij('gegevensvelden');
  vak.textContent = '';
  const velden = teVragenVelden({
    herkenning: zaak.herkenning,
    contact: zaak.contact,
    bestuursorgaan: zaak.invoer.bestuursorgaan,
    geforceerd: [...geforceerdeVelden],
  });

  for (const veld of velden) {
    const rij = el('div', { class: 'veld', style: 'margin-top:20px' },
      el('label', { for: `veld-${veld.id}` }, veld.label,
        veld.verplicht ? null : el('span', { class: 'subtiel', tekst: ' (optioneel)' })));
    const invoer = el('input', { type: veld.type, id: `veld-${veld.id}`, maxlength: '160' });
    invoer.value = zaak.contact[veld.id] !== undefined ? zaak.contact[veld.id] : (veld.waarde || '');
    zaak.contact[veld.id] = invoer.value;
    invoer.addEventListener('input', () => {
      zaak.contact[veld.id] = invoer.value;
      zetFout(veld.id, '');
    });
    rij.append(invoer);
    if (veld.hulp) rij.append(el('p', { class: 'veld__hulp', tekst: veld.hulp }));
    rij.append(el('p', { class: 'veld__fout verborgen', 'data-fout': veld.id }));
    vak.append(rij);
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function valideerGegevens() {
  let ok = true;
  const naam = String(zaak.contact.naam || '').trim();
  if (naam.length < 2) { zetFout('naam', 'Vul je naam in.'); ok = false; }
  const email = String(zaak.contact.email || '').trim();
  if (!EMAIL.test(email)) { zetFout('email', 'Vul een geldig e-mailadres in.'); ok = false; }
  if (!ok) {
    const eerste = document.querySelector('[data-fout]:not(.verborgen)');
    if (eerste) eerste.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return ok;
}

bij('knop-naar-toestemming').addEventListener('click', () => {
  if (valideerGegevens()) toon('toestemming');
});

// -------------------------------------------- opdracht 3. toestemming ---

function tekenToestemming() {
  const orgaan = orgaanNaam();
  const zaaktype = zoekZaaktype(zaak.invoer.zaaktype);
  const t = tarief(INSTELLINGEN);

  const lijst = bij('samenvatting');
  lijst.textContent = '';
  const regel = (kop, ...waarde) => {
    lijst.append(el('div', {}, el('dt', { tekst: kop }), el('dd', {}, ...waarde)));
  };
  regel('Jouw gegevens', [zaak.contact.naam, zaak.contact.email].filter(Boolean).join(', '));
  regel('Je zaak', [zaaktype ? zaaktype.label : 'je aanvraag', `bij ${orgaan}`].join(' ')
    + (zaak.contact.kenmerk ? `, kenmerk ${zaak.contact.kenmerk}` : ''));
  regel('Onze hulp', `De melding voor deze zaak maken en versturen. Daarna de reactie en termijn `
    + `van ${orgaan} bijhouden.`);
  regel('Grenzen van je toestemming',
    'Geen wijziging van je aanvraag of bezwaar. Geen toestemming voor andere zaken.');

  const kosten = bij('toestemming-kosten');
  kosten.textContent = '';
  kosten.append(kostenblok({ compact: true }));

  // De machtigingstekst: waar zet je precies je handtekening onder?
  // Deze angst is op de landingspagina al beantwoord, maar erover lezen is
  // iets anders dan je handtekening zetten. Hier komt hij terug.
  const machtiging = bij('machtigingtekst');
  machtiging.textContent = '';
  machtiging.append(
    el('span', { class: 'blok blok--info', style: 'display:block; margin-bottom:16px' },
      el('strong', { style: 'display:block; margin-bottom:6px',
        tekst: 'Dit gaat alleen over het wachten op je beslissing' }),
      `Met deze stap vragen wij ${orgaan} om een beslissing te nemen. `
      + 'Wij veranderen daarmee niets aan wat je hebt aangevraagd.'),
    el('span', {}, 'Ik, ', el('strong', { tekst: zaak.contact.naam || 'ondergetekende' }),
      ', machtig NuBeslist om mij te vertegenwoordigen bij ', el('strong', { tekst: orgaan }),
      ' in de procedure over ', el('strong', { tekst: zaaktype ? zaaktype.label : 'mijn aanvraag' }),
      '. Dat geldt alleen voor deze ene procedure over de te late beslissing; wij mogen daarmee '
      + 'geen andere zaken van je behandelen.'));

  // De regel bij het vinkje herhaalt de afspraak zakelijk. Daar bevestigt de
  // klant hem, dus daar telt ondubbelzinnigheid boven een prettige zin.
  const wat = t.bekend
    ? (t.soort === 'percentage' ? `${t.percentage}% daarvan` : tariefKort(t))
    : 'wat wij vooraf met je afspreken';
  bij('akkoord-tekst').textContent = 'Ik geef NuBeslist toestemming om de melding voor deze zaak'
    + ' te regelen en ga akkoord met de voorwaarden.'
    + ` Ik betaal alleen als ik een vergoeding voor het wachten krijg: ${wat},`
    + ' pas als dat geld binnen is.';
}

// ------------------------------------------------------ handtekening ----

const canvas = bij('handtekening');
const vakje = bij('handtekeningvak');
const penseel = canvas.getContext('2d');
let tekent = false;
let getekend = false;

function penPositie(gebeurtenis) {
  const kader = canvas.getBoundingClientRect();
  return {
    x: (gebeurtenis.clientX - kader.left) * (canvas.width / kader.width),
    y: (gebeurtenis.clientY - kader.top) * (canvas.height / kader.height),
  };
}

penseel.lineWidth = 3;
penseel.lineCap = 'round';
penseel.lineJoin = 'round';
penseel.strokeStyle = '#16202e';

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  tekent = true;
  penseel.beginPath();
  const punt = penPositie(e);
  penseel.moveTo(punt.x, punt.y);
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!tekent) return;
  e.preventDefault();
  const punt = penPositie(e);
  penseel.lineTo(punt.x, punt.y);
  penseel.stroke();
  if (!getekend) {
    getekend = true;
    vakje.classList.add('getekend');
    zetFout('handtekening', '');
  }
});
for (const eind of ['pointerup', 'pointercancel']) {
  canvas.addEventListener(eind, () => { tekent = false; });
}
bij('knop-wissen').addEventListener('click', () => {
  penseel.clearRect(0, 0, canvas.width, canvas.height);
  getekend = false;
  vakje.classList.remove('getekend');
});

// --------------------------------------------------------- indienen -----

async function verzend() {
  const foutVak = bij('indien-fout');
  foutVak.textContent = '';
  let ok = true;
  if (!getekend) { zetFout('handtekening', 'Zet hier je handtekening.'); ok = false; }
  if (!bij('akkoord').checked) { zetFout('akkoord', 'Zet een vinkje om de opdracht te geven.'); ok = false; }
  if (!ok) return;

  zaak.handtekening = { afbeelding: canvas.toDataURL('image/png'), gezetOp: new Date().toISOString() };

  const knop = bij('knop-indienen');
  knop.disabled = true;
  knop.textContent = 'Bezig met versturen…';
  try {
    const h = zaak.herkenning;
    // Alleen wat wij nu weten. Adres, geboortedatum, burgerservicenummer en
    // rekeningnummer vragen wij hier niet; die vult de aanvrager later aan in
    // zijn dossier. Wat wél uit de brief kwam, sturen wij mee.
    const contact = {
      naam: zaak.contact.naam || h.naam || '',
      email: zaak.contact.email || '',
      kenmerk: zaak.contact.kenmerk || h.kenmerk || '',
      machtiging: true,
      akkoordVoorwaarden: true,
    };

    const antwoord = await fetch('/api/aanvragen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoer: zaak.invoer,
        contact,
        brief: zaak.brief,
        verlengbrief: zaak.verlengbrief,
        brieven: zaak.brieven,
        controleSleutel,
        handtekening: zaak.handtekening,
        herkomst: 'briefupload',
      }),
    });
    const data = await antwoord.json().catch(() => ({}));
    if (!antwoord.ok) {
      const velden = data.velden && typeof data.velden === 'object' ? data.velden : null;
      if (velden && Object.keys(velden).length > 0) {
        // Klaagt de server over de datum van de melding, dan is die alleen op
        // het aanvulscherm te herstellen. Anders horen de velden bij de
        // gegevens; breng de bezoeker daarheen in plaats van hem met een
        // melding te laten zitten over iets wat hij niet ziet.
        const opAanvullen = ['ingebrekestellingDatum', 'basisdatum', 'zaaktype', 'besluitDatum'];
        const aanvulveld = Object.keys(velden).find((id) => opAanvullen.includes(id));
        if (aanvulveld) {
          toon('aanvullen');
          zetFout('igs-datum', velden[aanvulveld]);
          return;
        }
        for (const id of Object.keys(velden)) geforceerdeVelden.add(id);
        toon('gegevens');
        for (const [id, tekst] of Object.entries(velden)) zetFout(id, tekst);
        return;
      }
      foutVak.append(melding('fout', data.fout || 'Versturen is niet gelukt',
        'Probeer het nog een keer. Lukt het weer niet, neem dan contact met ons op.'));
      return;
    }
    meet('aanvraag');
    zaak.referentie = data.referentie || (data.aanvraag && data.aanvraag.referentie) || '';
    zaak.dossier = data.aanvraag || null;
    tekenBevestiging();
    toon('bevestiging');
  } catch (err) {
    console.error('[funnel] versturen mislukt:', err);
    foutVak.append(melding('fout', 'Er ging iets mis',
      'Je opdracht is mogelijk wel ontvangen. Neem contact op als je geen bevestiging krijgt.'));
  } finally {
    knop.disabled = false;
    knop.textContent = 'Opdracht bevestigen';
  }
}

bij('knop-indienen').addEventListener('click', verzend);

// -------------------------------------------- na 1. de bevestiging ------

function tekenBevestiging() {
  const orgaan = orgaanNaam();
  const uiterlijk = uiterlijkOp(2);
  // Een datum en geen "binnen twee werkdagen": dat laatste laat de klant zelf
  // rekenen, en op vrijdag rekent hij verkeerd.
  bij('bevestiging-onder').textContent = 'Je opdracht is bij ons binnen. Er is nog niets naar '
    + `${orgaan} verstuurd. Uiterlijk ${uiterlijk} hoor je van ons.`;
  bij('bevestiging-uitleg').textContent = `Eerst controleren we de gegevens en maken we de `
    + `melding: ${volgendeStapInGewoneTaal((zaak.rapport || {}).vervolg, orgaan).toLowerCase()}. `
    + 'Je ziet apart wanneer die is verstuurd.';
  bij('referentie').textContent = zaak.referentie || '';

  // Wat wij later nog nodig hebben, zeggen wij nú - niet pas in een mailtje.
  const vak = bij('bevestiging-aanvullen');
  vak.textContent = '';
  const nog = ontbrekendeDossiergegevens();
  if (nog.length) {
    vak.append(el('div', { class: 'blok blok--info' },
      el('strong', { style: 'display:block; margin-bottom:8px', tekst: 'Straks vragen wij nog' }),
      el('span', {}, `${nog.join(', ')}. Dat hebben wij nodig om de melding te kunnen versturen. `
        + 'Je vult het in je eigen dossier aan; wij laten je weten wanneer.')));
  }
}

/**
 * Welke gegevens later nog nodig zijn.
 *
 * Wij vragen ze niet meer in de funnel, maar dat mag niet betekenen dat de
 * aanvrager er pas achter komt als hij een mailtje krijgt. Hier staat wat er
 * nog komt, met de reden erbij.
 */
function ontbrekendeDossiergegevens() {
  const nog = [];
  const r = zaak.rapport || {};
  const teLaat = r.uitkomst === UITKOMST.RECHT
    || r.uitkomst === UITKOMST.INGEBREKESTELLING_NODIG
    || r.uitkomst === UITKOMST.HERSTELTERMIJN_LOOPT;
  if (!teLaat) return nog;
  nog.push('je adres en geboortedatum voor op de stukken');
  if (zaak.invoer.bestuursorgaan && zaak.invoer.bestuursorgaan !== 'overig') {
    nog.push('het burgerservicenummer waarmee de instantie je zaak terugvindt');
  }
  nog.push('het rekeningnummer waarop een vergoeding wordt uitbetaald');
  return nog;
}

// --------------------------------------------- na 2. de voortgang -------

const VOORTGANGSTAPPEN = [
  ['Opdracht ontvangen', 'Eerst komt je opdracht bij NuBeslist binnen.'],
  ['Gegevens controleren', 'Als iets ontbreekt, krijg je een gerichte vraag.'],
  ['Melding verzonden', 'Na verzending zie je hier de datum en een kopie.'],
  ['Reactie volgen', 'Daarna zie je of de instantie heeft gereageerd en wat er volgt.'],
];

function tekenVoortgang() {
  const orgaan = orgaanNaam();
  bij('voortgang-onder').textContent = 'Je ziet hier wie aan zet is en wat er gebeurd is.';
  bij('voortgang-wie').textContent = 'NuBeslist';
  bij('voortgang-status').textContent = 'Status: gegevens controleren.';
  bij('voortgang-jij').textContent = ontbrekendeDossiergegevens().length
    ? 'Jouw actie: straks een paar gegevens aanvullen in je dossier.'
    : 'Jouw actie: nu niets.';

  const stappen = bij('voortgang-stappen');
  stappen.textContent = '';
  for (const [kop, uitleg] of VOORTGANGSTAPPEN) {
    stappen.append(el('li', {}, el('b', { tekst: kop }),
      el('span', { tekst: uitleg.replace('de instantie', orgaan) })));
  }

  const kosten = bij('kostenafspraak-binnen');
  kosten.textContent = '';
  kosten.append(kostenblok({ compact: true }));

  // "Vanaf hier regelen wij het" leidt tot "dan hoef ik niets te doen", en dat
  // klopt op één ding na: post die rechtstreeks naar de klant gaat. Zonder
  // deze zin belandt een verlengingsbrief in een la in plaats van in de zaak.
  const zelf = bij('voortgang-zelf');
  zelf.textContent = '';
  zelf.append(el('div', { class: 'blok blok--info' },
    el('strong', { style: 'display:block; margin-bottom:6px', tekst: 'Wat moet jij nu doen? Niets.' }),
    el('span', {}, `Krijg je ondertussen een nieuwe brief, e-mail of beslissing van ${orgaan}? `
      + 'Zet die dan in je dossier. Wij kijken wat dat voor jouw zaak betekent.')));

  const knoppen = bij('voortgang-knoppen');
  knoppen.textContent = '';
  knoppen.append(el('a', { class: 'knop knop--primair', href: '/mijn' }, 'Naar mijn dossier'));
  knoppen.append(el('a', { class: 'knop knop--zacht', href: '/' }, 'Terug naar de website'));
  if (zaak.contact.email) {
    knoppen.append(el('p', { class: 'verdeling__voetnoot', style: 'width:100%; margin-top:4px' },
      `Wij hebben een link gestuurd naar ${zaak.contact.email}. Daarmee kom je er altijd weer in, `
      + 'zonder wachtwoord.'));
  }
}

// --------------------------------------------------------- opstarten ----

/** Wat er getekend moet worden zodra een scherm in beeld komt. */
const VOORBEREID = {
  aanvullen: tekenAanvulvragen,
  uitslag: tekenUitslag,
  hulp: tekenHulp,
  zelf: tekenZelf,
  gegevens: tekenGegevens,
  toestemming: tekenToestemming,
  voortgang: tekenVoortgang,
};

/** De instantie uit de url benoemen, zodat er nergens "de instantie" staat. */
function zetIngangstekst() {
  if (!ingang.instantie) return;
  const orgaan = labelBestuursorgaan(ingang.instantie);
  if (!orgaan) return;
  bij('kiezen-onder').textContent = `Kies de brief waarin staat wanneer ${orgaan} beslist. `
    + 'Je mag meerdere brieven of pagina’s toevoegen.';
  document.title = `Laat je ${orgaan}-brief bekijken · NuBeslist`;
}

bij('kiesvak-grens').textContent = `Een foto of pdf is genoeg. Je kunt er maximaal `
  + `${MAX_BRIEVEN} kiezen.`;

/**
 * De brieven die op de campagnelanding al gelezen zijn.
 *
 * Die pagina leest ze daar zelf en zet alleen het resultaat klaar - geen
 * bestanden, want die passen niet in de opslag van een tabblad. Eén keer:
 * daarna is het weg, zodat een pagina die terugveert niet opnieuw begint.
 */
function overgedragenBrieven() {
  try {
    const ruw = sessionStorage.getItem('nubeslist:brieven');
    if (!ruw) return [];
    sessionStorage.removeItem('nubeslist:brieven');
    const gelezen = JSON.parse(ruw);
    return Array.isArray(gelezen) ? gelezen.filter((b) => b && b.herkenning && b.brief) : [];
  } catch {
    return [];
  }
}

zetIngangstekst();

const meegekomen = overgedragenBrieven();
if (meegekomen.length > 0) {
  toon('lezen');
  bij('lezen-stand').textContent = meegekomen.length > 1
    ? 'Wij zetten je brieven op een rij…' : 'Wij lezen je brief…';
  // Even laten staan: wie net "controleer mijn brief" heeft geklikt, moet
  // kunnen zien dát er iets met zijn brief gebeurt.
  setTimeout(() => {
    pasDossierToe(combineer(meegekomen.slice(0, MAX_BRIEVEN)));
    toonWatWijLazen();
    toon(naHetLezen());
  }, meegekomen.length > 1 ? 1100 : 700);
} else {
  toon('kiezen');
}

// Een voorbeeldbrief om mee te proberen, zonder eerst iets te moeten zoeken.
bij('knop-voorbeeldbrief').addEventListener('click', async () => {
  const knop = bij('knop-voorbeeldbrief');
  knop.disabled = true;
  try {
    const antwoord = await fetch('/voorbeelden/uwv-wia-ontvangstbevestiging.pdf');
    if (!antwoord.ok) throw new Error('niet gevonden');
    const blob = await antwoord.blob();
    const bestand = new File([blob], 'voorbeeld-uwv-brief.pdf', { type: 'application/pdf' });
    if (voegBestandenToe([bestand]) > 0) leesDeBrieven();
  } catch {
    toonKiesfout(['De voorbeeldbrief kon niet worden geladen. Kies zelf een bestand.']);
  } finally {
    knop.disabled = false;
  }
});

// De geplakte tekst, voor wie zijn brief niet digitaal heeft.
bij('knop-plak').addEventListener('click', async () => {
  const tekst = bij('plaktekst').value.trim();
  if (tekst.length < 40) {
    toonKiesfout(['Plak wat meer tekst, inclusief de datum waarop je een beslissing zou krijgen.']);
    return;
  }
  toon('lezen');
  bij('lezen-stand').textContent = 'Wij lezen je tekst…';
  try {
    const data = await leesBrieven([{ bestandsnaam: 'geplakte tekst', mediaType: '', tekst }]);
    pasDossierToe(data);
    toonWatWijLazen();
    toon(naHetLezen());
  } catch (fout) {
    bij('storing-onder').textContent = `${fout.message} Je tekst staat er nog.`;
    toon('storing');
  }
});
