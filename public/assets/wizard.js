/**
 * Aanvraagwizard. Rekent live mee met dezelfde module die de server gebruikt,
 * zodat de klant ziet wat wij zien.
 */

import { berekenDwangsom, euro, UITKOMST } from '/shared/dwangsom.js';
import { parseDatum, toonDatum } from '/shared/datum.js';
import { BESTUURSORGANEN, zaaktypenVoor, zoekZaaktype } from '/shared/catalogus.js';
import { ingebrekestellingBrief, claimBrief } from '/shared/brief.js';

const TOTAAL_STAPPEN = 7;
const OPSLAG_SLEUTEL = 'dwangsomhulp-wizard';

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
  5: 'Uw uitkomst',
  6: 'Uw gegevens',
  7: 'Bevestiging',
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
    label.textContent = 'Datum van het besluit waartegen u bezwaar maakte';
    hulp.textContent = 'De beslistermijn voor uw bezwaar begint pas na afloop van de bezwaartermijn van zes weken.';
  } else {
    label.textContent = 'Datum van uw aanvraag';
    hulp.textContent = 'De datum waarop de organisatie uw aanvraag heeft ontvangen.';
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
    if (!invoer.bestuursorgaan) { zetFout('bestuursorgaan', 'Kies bij welke organisatie u de aanvraag heeft ingediend.'); ok = false; }
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
    if (contact.naam.trim().length < 2) { zetFout('naam', 'Vul uw naam in.'); ok = false; }
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(contact.email)) { zetFout('email', 'Vul een geldig e-mailadres in.'); ok = false; }
    if (!contact.akkoordVoorwaarden) { zetFout('akkoordVoorwaarden', 'Zet een vinkje om de aanvraag te kunnen indienen.'); ok = false; }
  }

  if (!ok) {
    const eerste = form.querySelector('[data-fout]:not(.verborgen)');
    if (eerste) eerste.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return ok;
}

// ------------------------------------------------------- uitkomst-stap ----

const ICONEN = {
  [UITKOMST.RECHT]: '🎉',
  [UITKOMST.HERSTELTERMIJN_LOOPT]: '⏳',
  [UITKOMST.INGEBREKESTELLING_NODIG]: '✉️',
  [UITKOMST.TERMIJN_LOOPT]: '🕐',
  [UITKOMST.GEEN_RECHT]: 'ℹ️',
};

function rendereUitkomst() {
  rapport = berekenDwangsom(leesInvoer());
  uitkomstVak.textContent = '';

  uitkomstVak.append(
    el('div', { class: 'uitkomstkop' },
      el('span', { class: 'uitkomstkop__icoon', tekst: ICONEN[rapport.uitkomst] || 'ℹ️' }),
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
        el('div', { style: 'font-size:.88rem', tekst: `${b.dagen} ${b.dagen === 1 ? 'dag' : 'dagen'} · van ${toonDatum(parseDatum(b.eersteDag))}${b.laatsteDag ? ` t/m ${toonDatum(parseDatum(b.laatsteDag))}` : ''}` }),
      ),
    );

    const tabel = el('table', { class: 'opbouwtabel' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Periode'), el('th', {}, 'Dagen'), el('th', {}, 'Per dag'), el('th', {}, 'Bedrag'))),
      el('tbody', {},
        b.opbouw.map((t) => el('tr', {},
          el('td', { tekst: `${toonDatum(parseDatum(t.van))} – ${toonDatum(parseDatum(t.tot))}` }),
          el('td', { tekst: String(t.dagen) }),
          el('td', { tekst: euro(t.perDag) }),
          el('td', { class: 'bedrag', tekst: euro(t.bedrag) }),
        )),
        el('tr', { class: 'totaal' },
          el('td', { colspan: '3' }, 'Totaal'),
          el('td', { class: 'bedrag', tekst: euro(b.totaal) })),
      ),
    );
    uitkomstVak.append(el('div', { class: 'blok-titel', tekst: 'Opbouw van het bedrag' }), tabel);

    if (b.doorlopend) {
      uitkomstVak.append(el('p', { class: 'subtiel', style: 'margin-top:10px',
        tekst: `Zolang er geen besluit komt, loopt het bedrag op tot ${euro(b.maximumBedrag)} op ${toonDatum(parseDatum(b.maximumOp))}.` }));
    }
  }

  if (rapport.vooruitblik) {
    const v = rapport.vooruitblik;
    uitkomstVak.append(
      el('div', { class: 'melding melding--info', style: 'margin-top:18px' },
        el('strong', {}, 'Wat u kunt opbouwen'),
        el('p', { tekst: `Wordt de ingebrekestelling op ${toonDatum(parseDatum(v.ingebrekestellingOp))} ontvangen, dan heeft de organisatie tot en met ${toonDatum(parseDatum(v.laatsteHersteldag))} de tijd. Blijft een besluit uit, dan telt de dwangsom vanaf ${toonDatum(parseDatum(v.eersteDag))} en bereikt die ${euro(v.maximumBedrag)} op ${toonDatum(parseDatum(v.maximumOp))}.` }),
      ),
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

  if (rapport.tijdlijn && rapport.tijdlijn.length) {
    uitkomstVak.append(el('div', { class: 'blok-titel', tekst: 'Tijdlijn van uw zaak' }));
    uitkomstVak.append(el('ul', { class: 'tijdlijn' },
      rapport.tijdlijn.map((punt) => el('li', { 'data-status': punt.status },
        el('div', { class: 'tijdlijn__datum', tekst: toonDatum(parseDatum(punt.datum)) }),
        el('div', { class: 'tijdlijn__label', tekst: punt.label }),
        punt.toelichting ? el('div', { class: 'tijdlijn__toelichting', tekst: punt.toelichting }) : null,
      )),
    ));
  }

  if (rapport.volgendeStappen && rapport.volgendeStappen.length) {
    uitkomstVak.append(el('div', { class: 'blok-titel', tekst: 'Wat is de volgende stap?' }));
    uitkomstVak.append(el('ol', { class: 'stappenlijst' },
      rapport.volgendeStappen.map((s) => el('li', { tekst: s }))));
  }

  const knopBrief = el('button', { type: 'button', class: 'knop knop--zacht knop--klein' }, '⬇ Conceptbrief downloaden');
  knopBrief.addEventListener('click', () => downloadBrief());
  uitkomstVak.append(el('div', { style: 'margin-top:22px' }, knopBrief));

  knopVerder.textContent = rapport.uitkomst === UITKOMST.GEEN_RECHT
    ? 'Toch laten beoordelen →'
    : 'Aanvraag indienen →';
}

function downloadBrief() {
  const invoer = leesInvoer();
  const contact = leesContact();
  const claimen = rapport && rapport.uitkomst === UITKOMST.RECHT;
  const tekst = claimen
    ? claimBrief({ invoer, contact, rapport })
    : ingebrekestellingBrief({ invoer, contact, rapport });
  const blob = new Blob([tekst], { type: 'text/plain;charset=utf-8' });
  const link = el('a', { href: URL.createObjectURL(blob), download: claimen ? 'dwangsom-claim.txt' : 'ingebrekestelling.txt' });
  document.body.append(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
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
      body: JSON.stringify({ invoer: leesInvoer(), contact: leesContact() }),
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
    sessionStorage.removeItem(OPSLAG_SLEUTEL);
    gaNaar(7);
  } catch {
    foutVak.append(el('div', { class: 'melding melding--fout' },
      el('strong', {}, 'Geen verbinding'),
      el('p', {}, 'Wij konden uw aanvraag niet versturen. Controleer uw internetverbinding en probeer het opnieuw.')));
  } finally {
    knopVerder.disabled = false;
    knopVerder.textContent = 'Aanvraag indienen →';
  }
}

// ---------------------------------------------------------- navigatie ----

function gaNaar(nummer) {
  stap = Math.max(1, Math.min(TOTAAL_STAPPEN, nummer));
  for (const sectie of form.querySelectorAll('.stap')) {
    sectie.classList.toggle('verborgen', Number(sectie.dataset.stap) !== stap);
  }
  if (stap === 5) rendereUitkomst();

  voortgang.textContent = '';
  for (let i = 1; i <= TOTAAL_STAPPEN; i += 1) {
    voortgang.append(el('span', { class: i <= stap ? 'actief' : '' }));
  }
  stapTeller.textContent = `Stap ${stap} van ${TOTAAL_STAPPEN}`;
  stapHint.textContent = STAP_HINTS[stap] || '';

  knopTerug.classList.toggle('verborgen', stap === 1 || stap === 7);
  navigatie.classList.toggle('verborgen', stap === 7);
  if (stap === 6) knopVerder.textContent = 'Aanvraag indienen →';
  else if (stap !== 5) knopVerder.textContent = 'Volgende →';

  window.scrollTo({ top: 0, behavior: 'smooth' });
  bewaarConcept();
}

knopVerder.addEventListener('click', () => {
  if (!valideerStap(stap)) return;
  if (stap === 6) return void verzend();
  gaNaar(stap + 1);
});
knopTerug.addEventListener('click', () => gaNaar(stap - 1));

document.getElementById('download-brief-bevestiging').addEventListener('click', downloadBrief);

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
  return data.stap && data.stap < 7 ? data.stap : 1;
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
