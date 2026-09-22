/**
 * Aanvraagwizard. Rekent live mee met dezelfde module die de server gebruikt,
 * zodat de klant ziet wat wij zien.
 */

import { berekenDwangsom, euro, UITKOMST, DOSSIERSOORT } from '/shared/dwangsom.js';
import { parseDatum, toonDatum } from '/shared/datum.js';
import { BESTUURSORGANEN, zaaktypenVoor, zoekZaaktype } from '/shared/catalogus.js';
import { bepaalDossiereisen, stukkenVanKlant } from '/shared/dossier.js';

const TOTAAL_STAPPEN = 8;
const OPSLAG_SLEUTEL = 'nubeslist-wizard';

const form = document.getElementById('wizard');
const voortgang = document.getElementById('voortgang');
const stapTeller = document.getElementById('stap-teller');
const stapHint = document.getElementById('stap-hint');
const knopTerug = document.getElementById('knop-terug');
const knopVerder = document.getElementById('knop-verder');
const navigatie = document.getElementById('navigatie');
const uitkomstVak = document.getElementById('uitkomst');

let stap = 1;
let rapport = null;
let referentie = null;

const STAP_HINTS = {
  1: 'Soort aanvraag',
  2: 'Termijnen',
  3: 'Ingebrekestelling',
  4: 'Controle',
  5: 'Je uitkomst',
  6: 'Je gegevens',
  7: 'Benodigde stukken',
  8: 'Bevestiging',
};

// ------------------------------------------------------------- hulpjes ----

function el(tag, attrs = {}, ...kinderen) {
  const knoop = document.createElement(tag);
  for (const [sleutel, waarde] of Object.entries(attrs)) {
    if (waarde === null || waarde === undefined || waarde === false) continue;
    if (sleutel === 'class') knoop.className = waarde;
    else if (sleutel === 'tekst') knoop.textContent = waarde;
    else knoop.setAttribute(sleutel, waarde);
  }
  for (const kind of kinderen.flat()) {
    if (kind === null || kind === undefined || kind === false) continue;
    knoop.append(typeof kind === 'string' ? document.createTextNode(kind) : kind);
  }
  return knoop;
}

const waarde = (naam) => {
  const veld = form.elements[naam];
  if (!veld) return '';
  if (veld instanceof RadioNodeList || (veld.length && !veld.tagName)) {
    const aangevinkt = [...veld].find((v) => v.checked);
    return aangevinkt ? aangevinkt.value : '';
  }
  if (veld.type === 'checkbox') return veld.checked;
  return veld.value;
};

const isJa = (naam) => waarde(naam) === 'ja';

function toonVeld(sleutel, zichtbaar) {
  for (const knoop of form.querySelectorAll(`[data-toon-als="${sleutel}"]`)) {
    knoop.classList.toggle('verborgen', !zichtbaar);
  }
}

function zetFout(naam, melding) {
  const knoop = form.querySelector(`[data-fout="${naam}"]`);
  if (!knoop) return;
  knoop.textContent = melding || '';
  knoop.classList.toggle('verborgen', !melding);
}

function wisFouten() {
  for (const knoop of form.querySelectorAll('[data-fout]')) {
    knoop.textContent = '';
    knoop.classList.add('verborgen');
  }
}

// -------------------------------------------------------------- invoer ----

function leesInvoer() {
  const bijzonder = waarde('bijzonder');
  return {
    bestuursorgaan: waarde('bestuursorgaan'),
    organisatienaam: waarde('organisatienaam'),
    zaaktype: waarde('zaaktype'),
    basisdatum: waarde('basisdatum'),
    adviescommissie: isJa('adviescommissie'),
    termijnBekend: isJa('termijnBekend'),
    termijnEinddatum: waarde('termijnEinddatum'),
    verdaagd: isJa('verdaagd'),
    verdagingEinddatum: waarde('verdagingEinddatum'),
    opschortingDagen: Number(waarde('opschortingDagen') || 0),
    ingebrekeGesteld: isJa('ingebrekeGesteld'),
    ingebrekestellingDatum: waarde('ingebrekestellingDatum'),
    besluitGenomen: isJa('besluitGenomen'),
    besluitDatum: waarde('besluitDatum'),
    geenBelanghebbende: waarde('belanghebbende') === 'nee',
    buitenBehandeling: isJa('buitenBehandeling'),
    wooVerzoek: bijzonder === 'woo',
    asielzaak: bijzonder === 'asiel',
  };
}

function leesContact() {
  return {
    naam: waarde('naam'),
    email: waarde('email'),
    telefoon: waarde('telefoon'),
    adres: waarde('adres'),
    postcode: waarde('postcode'),
    woonplaats: waarde('woonplaats'),
    geboortedatum: waarde('geboortedatum'),
    kenmerk: waarde('kenmerk'),
    toelichting: waarde('toelichting'),
    machtiging: Boolean(waarde('machtiging')),
    akkoordVoorwaarden: Boolean(waarde('akkoordVoorwaarden')),
  };
}

// ------------------------------------------------------- opbouw stap 1 ----

function bouwBestuursorganen() {
  const houder = document.getElementById('keuze-bestuursorgaan');
  for (const orgaan of BESTUURSORGANEN) {
    houder.append(
      el('label', { class: 'keuze' },
        el('input', { type: 'radio', name: 'bestuursorgaan', value: orgaan.id }),
        el('span', { class: 'keuze__tekst' }, orgaan.label,
          el('span', { class: 'keuze__uitleg', tekst: orgaan.omschrijving })),
      ),
    );
  }
}

function vulZaaktypen() {
  const select = document.getElementById('zaaktype');
  const gekozen = select.value;
  const orgaan = waarde('bestuursorgaan');
  select.textContent = '';
  if (!orgaan) return;
  select.append(el('option', { value: '' }, 'Maak een keuze…'));
  const types = zaaktypenVoor(orgaan);
  const groepen = [...new Set(types.map((t) => t.groep))];
  for (const groep of groepen) {
    const optgroup = el('optgroup', { label: groep });
    for (const type of types.filter((t) => t.groep === groep)) {
      optgroup.append(el('option', { value: type.id }, type.label));
    }
    select.append(optgroup);
  }
  if ([...select.options].some((o) => o.value === gekozen)) select.value = gekozen;
}

// ------------------------------------------------ conditionele velden ----

function werkVeldenBij() {
  const orgaan = waarde('bestuursorgaan');
  const zaaktype = zoekZaaktype(waarde('zaaktype'));

  toonVeld('bestuursorgaan', Boolean(orgaan));
  toonVeld('organisatienaam', orgaan === 'gemeente' || orgaan === 'anders');
  toonVeld('adviescommissie', Boolean(zaaktype && zaaktype.vraagAdviescommissie));
  toonVeld('termijnEinddatum', isJa('termijnBekend'));
  toonVeld('verdagingEinddatum', isJa('verdaagd'));
  toonVeld('ingebrekestellingDatum', isJa('ingebrekeGesteld'));
  toonVeld('besluitDatum', isJa('besluitGenomen'));

  const toelichting = document.getElementById('zaaktype-toelichting');
  toelichting.textContent = zaaktype
    ? [zaaktype.toelichting, `Standaardtermijn: ${zaaktype.grondslag}.`].filter(Boolean).join(' ')
    : '';

  const label = document.getElementById('basisdatum-label');
  const hulp = document.getElementById('basisdatum-hulp');
  if (zaaktype && zaaktype.termijnVanaf === 'bezwaartermijn') {
    label.textContent = 'Datum van het besluit waartegen je bezwaar maakte';
    hulp.textContent = 'De beslistermijn voor je bezwaar begint pas na afloop van de bezwaartermijn van zes weken.';
  } else {
    label.textContent = 'Datum van je aanvraag';
    hulp.textContent = 'De datum waarop de organisatie je aanvraag heeft ontvangen.';
  }

  const naamVeld = document.getElementById('organisatienaam');
  if (naamVeld && !naamVeld.value && orgaan === 'gemeente') naamVeld.placeholder = 'Bijvoorbeeld: Gemeente Amersfoort';
}

// ---------------------------------------------------------- validatie ----

function valideerStap(nummer) {
  wisFouten();
  const invoer = leesInvoer();
  let ok = true;

  if (nummer === 1) {
    if (!invoer.bestuursorgaan) { zetFout('bestuursorgaan', 'Kies bij welke organisatie je de aanvraag heeft ingediend.'); ok = false; }
    if (!invoer.zaaktype) { zetFout('zaaktype', 'Kies het soort aanvraag.'); ok = false; }
  }

  if (nummer === 2) {
    const basis = parseDatum(invoer.basisdatum);
    if (!basis) { zetFout('basisdatum', 'Vul een datum in.'); ok = false; }
    else if (basis > Date.now()) { zetFout('basisdatum', 'Deze datum ligt in de toekomst.'); ok = false; }
    if (invoer.termijnBekend && !parseDatum(invoer.termijnEinddatum)) {
      zetFout('termijnEinddatum', 'Vul de datum in die de organisatie heeft genoemd.'); ok = false;
    }
  }

  if (nummer === 3) {
    if (invoer.ingebrekeGesteld && !parseDatum(invoer.ingebrekestellingDatum)) {
      zetFout('ingebrekestellingDatum', 'Vul de datum van de ingebrekestelling in.'); ok = false;
    }
    if (invoer.besluitGenomen && !parseDatum(invoer.besluitDatum)) {
      zetFout('besluitDatum', 'Vul de datum van het besluit in.'); ok = false;
    }
  }

  if (nummer === 6) {
    const contact = leesContact();
    const eisen = bepaalDossiereisen({ invoer, contact, rapport });
    for (const gegeven of eisen.gegevens) {
      if (!gegeven.verplicht) continue;
      const waarde = String(contact[gegeven.id] || '').trim();
      if (waarde.length < 2) {
        zetFout(gegeven.id, `${gegeven.label} is nodig: ${gegeven.reden.toLowerCase()}`);
        ok = false;
      }
    }
    if (contact.email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(contact.email)) {
      zetFout('email', 'Vul een geldig e-mailadres in.'); ok = false;
    }
    if (!contact.akkoordVoorwaarden) {
      zetFout('akkoordVoorwaarden', 'Zet een vinkje om verder te kunnen.'); ok = false;
    }
  }

  if (!ok) {
    const eerste = form.querySelector('[data-fout]:not(.verborgen)');
    if (eerste) eerste.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return ok;
}

// ------------------------------------------------------- uitkomst-stap ----

const ICONEN = {
  [UITKOMST.RECHT]: '\je{1F389}',
  [UITKOMST.HERSTELTERMIJN_LOOPT]: '\je{23F3}',
  [UITKOMST.INGEBREKESTELLING_NODIG]: '\je{2709}\je{FE0F}',
  [UITKOMST.TERMIJN_LOOPT]: '\je{1F550}',
  [UITKOMST.GEEN_RECHT]: '\je{2139}\je{FE0F}',
};

/**
 * Wat wij doen, per uitkomst. Bewust geen stappenplan waarmee iemand het
 * zelf zou kunnen: de aanvrager ziet wat hij eraan heeft en wat wij
 * overnemen, niet hoe wij het doen.
 */
const WAT_WIJ_DOEN = {
  [UITKOMST.RECHT]: [
    'Wij controleren je gegevens en de opgebouwde dagen.',
    'Wij vorderen de dwangsom bij de organisatie en bewaken de betaaltermijn.',
    'Blijft het besluit uit, dan zetten wij de volgende stap voor je.',
  ],
  [UITKOMST.HERSTELTERMIJN_LOOPT]: [
    'Wij noteren je zaak en houden de lopende termijn in de gaten.',
    'Komt er geen besluit, dan komen wij op de eerste dag zelf in actie.',
    'Je hoeft in de tussentijd niets te doen.',
  ],
  [UITKOMST.INGEBREKESTELLING_NODIG]: [
    'Wij stellen de vereiste brief op en versturen die namens je, met bewijs.',
    'Daarna bewaken wij de termijn die de organisatie krijgt.',
    'Wordt er niet beslist, dan vorderen wij de dwangsom voor je.',
  ],
  [UITKOMST.TERMIJN_LOOPT]: [
    'Wij leggen je zaak vast en bewaken de datum waarop de termijn afloopt.',
    'Zodra dat mag, komen wij namens je in actie.',
    'Je krijgt bericht zodra er iets verandert.',
  ],
  [UITKOMST.GEEN_RECHT]: [
    'Een van onze behandelaars kijkt naar je situatie.',
    'Is er een andere route, dan laten wij je weten welke.',
  ],
};

function rendereUitkomst() {
  rapport = berekenDwangsom(leesInvoer());
  uitkomstVak.textContent = '';

  uitkomstVak.append(
    el('div', { class: 'uitkomstkop' },
      el('span', { class: 'uitkomstkop__icoon', tekst: ICONEN[rapport.uitkomst] || '\je{2139}\je{FE0F}' }),
      el('div', {}, el('h2', { style: 'margin-bottom:4px', tekst: rapport.kop })),
    ),
    el('p', { class: 'subtiel', tekst: rapport.samenvatting }),
  );

  const b = rapport.berekening;
  if (b && b.dagen > 0) {
    uitkomstVak.append(
      el('div', { class: 'melding melding--goed', style: 'margin-top:18px' },
        el('div', { style: 'font-size:.85rem; font-weight:640', tekst: b.doorlopend ? 'Tot nu toe opgebouwd' : 'Opgebouwde dwangsom' }),
        el('div', { class: 'groot-bedrag', tekst: euro(b.totaal) }),
        el('div', { style: 'font-size:.88rem', tekst: `${b.dagen} ${b.dagen === 1 ? 'dag' : 'dagen'} sinds ${toonDatum(parseDatum(b.eersteDag))}` }),
      ),
    );
    if (b.doorlopend) {
      uitkomstVak.append(el('p', { class: 'subtiel', style: 'margin-top:10px',
        tekst: `Zolang er geen besluit komt, loopt dit op tot maximaal ${euro(b.maximumBedrag)}.` }));
    }
  } else if (rapport.uitkomst !== UITKOMST.GEEN_RECHT) {
    uitkomstVak.append(
      el('div', { class: 'melding melding--info', style: 'margin-top:18px' },
        el('strong', {}, 'Nog niet te vorderen, wel vast te leggen'),
        el('p', {}, `Je zaak kan oplopen tot ${euro(1442)}. Meld je nu aan, dan bewaken wij de `
          + 'termijnen en komen wij in actie zodra dat kan.')),
    );
  }

  for (const blokkade of rapport.blokkades) {
    uitkomstVak.append(
      el('div', { class: 'melding melding--let-op', style: 'margin-top:14px' },
        el('strong', { tekst: blokkade.titel }), el('p', { tekst: blokkade.uitleg })),
    );
  }
  for (const w of rapport.waarschuwingen) {
    uitkomstVak.append(
      el('div', { class: 'melding melding--let-op', style: 'margin-top:14px' },
        el('strong', { tekst: w.titel }), el('p', { tekst: w.uitleg })),
    );
  }

  // Alleen de data uit de eigen zaak, zonder de rekenregels erachter.
  const tijdlijn = (rapport.tijdlijn || []).filter((punt) => punt.sleutel !== 'bezwaartermijn');
  if (tijdlijn.length) {
    uitkomstVak.append(el('div', { class: 'blok-titel', tekst: 'Je zaak in data' }));
    uitkomstVak.append(el('ul', { class: 'tijdlijn' },
      tijdlijn.map((punt) => el('li', { 'data-status': punt.status },
        el('div', { class: 'tijdlijn__datum', tekst: toonDatum(parseDatum(punt.datum)) }),
        el('div', { class: 'tijdlijn__label', tekst: punt.label }),
      )),
    ));
  }

  const watWijDoen = WAT_WIJ_DOEN[rapport.uitkomst] || [];
  if (watWijDoen.length) {
    uitkomstVak.append(el('div', { class: 'blok-titel', tekst: 'Wat wij voor je doen' }));
    uitkomstVak.append(el('ul', { class: 'stappenlijst', style: 'list-style:none; padding-left:0' },
      watWijDoen.map((regel) => el('li', { style: 'display:flex; gap:9px' },
        el('span', { class: 'vink', tekst: '\je2713', style: 'color:var(--groen-600); font-weight:800' }),
        el('span', { tekst: regel }),
      ))));
  }

  knopVerder.textContent = knoptekst();
}

/** De knop heet naar wat er werkelijk gebeurt bij indienen. */
function knoptekst() {
  const soort = rapport && rapport.vervolg ? rapport.vervolg.soort : null;
  if (soort === DOSSIERSOORT.VOORAANMELDING) return 'Vooraanmelding doen \je2192';
  if (soort === DOSSIERSOORT.BEOORDELING) return 'Toch laten beoordelen \je2192';
  return 'Aanvraag indienen \je2192';
}

/**
 * Zet per veld of het in deze zaak verplicht is, met de reden erbij. Zo vult
 * de aanvrager alleen in wat wij echt nodig hebben, en weet hij waarom.
 */
function rendereGegevensvragen() {
  const eisen = bepaalDossiereisen({ invoer: leesInvoer(), contact: leesContact(), rapport });
  const soort = rapport && rapport.vervolg ? rapport.vervolg.soort : null;

  document.getElementById('gegevens-intro').textContent = soort === DOSSIERSOORT.VOORAANMELDING
    ? 'Voor een vooraanmelding hebben wij weinig nodig. Zodra wij namens je gaan optreden, vragen wij de rest op.'
    : 'Wij vragen alleen wat wij voor deze zaak nodig hebben om namens je op te treden.';

  for (const gegeven of eisen.gegevens) {
    const vak = form.querySelector(`[data-veld="${gegeven.id}"]`);
    if (!vak) continue;
    const merk = vak.querySelector('.veld__vereist');
    if (merk) {
      merk.textContent = gegeven.verplicht ? '' : '(optioneel)';
      merk.className = gegeven.verplicht ? 'veld__vereist' : 'veld__vereist subtiel';
    }
    const reden = vak.querySelector('.veld__reden');
    if (reden) reden.textContent = gegeven.reden || '';
    const invoerveld = vak.querySelector('input, textarea');
    if (invoerveld) invoerveld.required = gegeven.verplicht;
  }
}

/** Stap 7: de stukken die bij dit type zaak horen. */
function rendereStukken() {
  const houder = document.getElementById('stukkenlijst');
  houder.textContent = '';
  const invoer = leesInvoer();
  const contact = leesContact();
  const eisen = bepaalDossiereisen({ invoer, contact, rapport });
  const vanKlant = stukkenVanKlant({ invoer, contact, rapport });
  const vanOns = eisen.stukken.filter((stuk) => stuk.door === 'wij');

  houder.append(el('div', { class: 'keuzes' },
    vanKlant.map((stuk) => el('label', { class: 'keuze' },
      el('input', { type: 'checkbox', name: `stuk-${stuk.id}`, 'data-stuk': stuk.id }),
      el('span', { class: 'keuze__tekst' },
        stuk.label,
        stuk.verplicht ? '' : ' (indien je dit heeft)',
        el('span', { class: 'keuze__uitleg', tekst: stuk.uitleg }),
      ),
    )),
  ));

  if (vanOns.length) {
    houder.append(el('div', { class: 'blok-titel', tekst: 'Dat regelen wij' }));
    houder.append(el('ul', { class: 'stappenlijst', style: 'list-style:none; padding-left:0' },
      vanOns.map((stuk) => el('li', { style: 'display:flex; gap:9px; margin-bottom:8px' },
        el('span', { tekst: '\je2713', style: 'color:var(--groen-600); font-weight:800' }),
        el('span', {}, el('strong', { tekst: stuk.label }),
          el('span', { class: 'keuze__uitleg', tekst: stuk.uitleg })),
      ))));
  }

  houder.append(el('p', { class: 'subtiel', style: 'margin-top:16px',
    tekst: 'Niets aangevinkt? Ook goed. Wij vragen de ontbrekende stukken bij je op, '
      + 'of halen ze zo nodig zelf bij de organisatie op.' }));
}

function leesStukken() {
  const uit = {};
  for (const vak of form.querySelectorAll('[data-stuk]')) uit[vak.dataset.stuk] = vak.checked;
  return uit;
}

// ------------------------------------------------------------ indienen ----

async function verzend() {
  const foutVak = document.getElementById('indien-fout');
  foutVak.textContent = '';
  knopVerder.disabled = true;
  knopVerder.textContent = 'Bezig met indienen…';
  try {
    const antwoord = await fetch('/api/aanvragen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoer: leesInvoer(), contact: leesContact(), stukken: leesStukken() }),
    });
    const data = await antwoord.json().catch(() => ({}));
    if (!antwoord.ok) {
      const velden = data.velden ? Object.values(data.velden).join(' ') : '';
      foutVak.append(el('div', { class: 'melding melding--fout' },
        el('strong', {}, 'Indienen is niet gelukt'),
        el('p', { tekst: [data.fout || 'Probeer het later opnieuw.', velden].filter(Boolean).join(' ') })));
      return;
    }
    referentie = data.referentie;
    rapport = data.rapport || rapport;
    document.getElementById('referentienummer').textContent = referentie;
    rendereBevestiging(data.soort);
    sessionStorage.removeItem(OPSLAG_SLEUTEL);
    gaNaar(8);
  } catch (err) {
    console.error('[wizard] versturen mislukt:', err);
    const netwerk = err instanceof TypeError;
    foutVak.append(el('div', { class: 'melding melding--fout' },
      el('strong', {}, netwerk ? 'Geen verbinding' : 'Er ging iets mis'),
      el('p', { tekst: netwerk
        ? 'Wij konden je aanvraag niet versturen. Controleer je internetverbinding en probeer het opnieuw.'
        : `Je aanvraag is mogelijk wel ontvangen. Neem contact op als je geen bevestiging krijgt. (${err && err.message ? err.message : err})` })));
  } finally {
    knopVerder.disabled = false;
    knopVerder.textContent = 'Versturen →';
  }
}

/**
 * De bevestiging zegt wat er werkelijk is gebeurd. Een vooraanmelding is geen
 * ingediende aanvraag, en de datum die wij bewaken hoort de aanvrager te zien
 * zodat hij weet dat hij er zelf niet op hoeft te letten.
 */
function rendereBevestiging(soort) {
  const titel = document.getElementById('bevestiging-titel');
  const tekst = document.getElementById('bevestiging-tekst');
  const extra = document.getElementById('bevestiging-extra');
  extra.textContent = '';

  if (soort === DOSSIERSOORT.VOORAANMELDING) {
    titel.textContent = 'Je vooraanmelding staat genoteerd';
    tekst.textContent = 'Wij bewaken vanaf nu de termijn in je zaak en nemen contact op zodra er iets moet gebeuren.';
    const actiedatum = rapport && rapport.vervolg ? rapport.vervolg.actiedatum : null;
    if (actiedatum) {
      extra.append(el('div', { class: 'melding melding--info', style: 'margin-top:18px; text-align:left' },
        el('strong', {}, 'Wij letten op deze datum'),
        el('p', { tekst: `${toonDatum(parseDatum(actiedatum))} \je2014 vanaf dan kunnen wij in je zaak optreden. `
          + 'Je hoeft die datum niet zelf in de gaten te houden.' })));
    }
  } else if (soort === DOSSIERSOORT.BEOORDELING) {
    titel.textContent = 'Je zaak is aangemeld voor beoordeling';
    tekst.textContent = 'Een behandelaar kijkt naar je situatie en laat je weten of er een route is.';
  } else {
    titel.textContent = 'Je aanvraag is ontvangen';
    tekst.textContent = 'Wij nemen binnen twee werkdagen contact met je op via het opgegeven e-mailadres.';
  }
}

// ---------------------------------------------------------- navigatie ----

function gaNaar(nummer) {
  stap = Math.max(1, Math.min(TOTAAL_STAPPEN, nummer));
  for (const sectie of form.querySelectorAll('.stap')) {
    sectie.classList.toggle('verborgen', Number(sectie.dataset.stap) !== stap);
  }
  if (stap === 5) rendereUitkomst();
  if (stap === 6) rendereGegevensvragen();
  if (stap === 7) rendereStukken();

  voortgang.textContent = '';
  for (let i = 1; i <= TOTAAL_STAPPEN; i += 1) {
    voortgang.append(el('span', { class: i <= stap ? 'actief' : '' }));
  }
  stapTeller.textContent = `Stap ${stap} van ${TOTAAL_STAPPEN}`;
  stapHint.textContent = STAP_HINTS[stap] || '';

  knopTerug.classList.toggle('verborgen', stap === 1 || stap === TOTAAL_STAPPEN);
  navigatie.classList.toggle('verborgen', stap === TOTAAL_STAPPEN);
  if (stap === 5) knopVerder.textContent = knoptekst();
  else if (stap === 7) knopVerder.textContent = 'Versturen →';
  else knopVerder.textContent = 'Volgende →';

  window.scrollTo({ top: 0, behavior: 'smooth' });
  bewaarConcept();
}

knopVerder.addEventListener('click', () => {
  if (!valideerStap(stap)) return;
  if (stap === 7) return void verzend();
  gaNaar(stap + 1);
});
knopTerug.addEventListener('click', () => gaNaar(stap - 1));

// ------------------------------------------------ concept in de browser ---

function bewaarConcept() {
  try {
    const data = { stap, velden: {} };
    for (const veld of form.elements) {
      if (!veld.name) continue;
      if (veld.type === 'radio') { if (veld.checked) data.velden[veld.name] = veld.value; }
      else if (veld.type === 'checkbox') data.velden[veld.name] = veld.checked;
      else data.velden[veld.name] = veld.value;
    }
    sessionStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(data));
  } catch { /* privémodus: dan gewoon niet bewaren */ }
}

function herstelConcept() {
  let data;
  try {
    data = JSON.parse(sessionStorage.getItem(OPSLAG_SLEUTEL) || 'null');
  } catch { return null; }
  if (!data || !data.velden) return null;
  // Eerst het bestuursorgaan, want daar hangt de lijst met zaaktypen aan.
  const orgaan = data.velden.bestuursorgaan;
  if (orgaan) {
    const radio = [...form.elements.bestuursorgaan || []].find((r) => r.value === orgaan);
    if (radio) radio.checked = true;
    vulZaaktypen();
  }
  for (const [naam, opgeslagen] of Object.entries(data.velden)) {
    const veld = form.elements[naam];
    if (!veld) continue;
    if (veld instanceof RadioNodeList) {
      const radio = [...veld].find((r) => r.value === opgeslagen);
      if (radio) radio.checked = true;
    } else if (veld.type === 'checkbox') {
      veld.checked = Boolean(opgeslagen);
    } else if (veld.tagName !== 'FIELDSET') {
      veld.value = opgeslagen;
    }
  }
  return data.stap && data.stap < TOTAAL_STAPPEN ? data.stap : 1;
}

// ------------------------------------------------------------- opstart ----

bouwBestuursorganen();
form.addEventListener('change', (gebeurtenis) => {
  if (gebeurtenis.target.name === 'bestuursorgaan') vulZaaktypen();
  werkVeldenBij();
  bewaarConcept();
});
form.addEventListener('input', bewaarConcept);
form.addEventListener('submit', (e) => e.preventDefault());

const herstelde = herstelConcept();
werkVeldenBij();
gaNaar(herstelde || 1);
