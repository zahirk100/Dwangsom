/**
 * De brief is de intake.
 *
 * De aanvrager uploadt een brief, wij lezen eruit wat nodig is, rekenen uit
 * of de instantie te laat is en laten dat meteen zien. Pas daarna vragen wij
 * gegevens, en alleen wat nog ontbreekt. Eén scherm met een machtiging sluit
 * het af.
 */

import { berekenDwangsom, euro, UITKOMST, DOSSIERSOORT } from '/shared/dwangsom.js';
import { parseDatum, toonDatum, vandaag, verschilDagen } from '/shared/datum.js';
import { labelBestuursorgaan, vraagtBsn, zoekZaaktype } from '/shared/catalogus.js';
import { bsnKlopt, ibanKlopt, normaliseerBsn, normaliseerIban } from '/shared/identiteit.js';
import { teVragenVelden } from '/shared/funnelvragen.js';

const TOTAAL = 5;
const form = document.getElementById('funnel');
const bollen = document.getElementById('bollen');
const navigatie = document.getElementById('navigatie');
const knopVerder = document.getElementById('knop-verder');
const knopTerug = document.getElementById('knop-terug');

let stap = 1;
const zaak = {
  brief: null,
  verlengbrief: null,
  herkenning: null,
  invoer: null,
  rapport: null,
  contact: {},
  handtekening: null,
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

function melding(soort, titel, tekst) {
  return el('div', { class: `melding melding--${soort}` },
    el('strong', { tekst: titel }), tekst ? el('p', { tekst }) : null);
}

function zetFout(naam, tekst) {
  const knoop = form.querySelector(`[data-fout="${naam}"]`);
  if (!knoop) return;
  knoop.textContent = tekst || '';
  knoop.classList.toggle('verborgen', !tekst);
}

function datumTekst(iso) {
  const ms = parseDatum(iso);
  return ms === null ? null : toonDatum(ms);
}

// -------------------------------------------------------------- stap 1 ----

const dropzone = document.getElementById('dropzone');
const bestandInvoer = document.getElementById('bestand');
const uploadMelding = document.getElementById('upload-melding');

function toonBezig(tekst) {
  uploadMelding.textContent = '';
  uploadMelding.append(el('div', { class: 'bezig' }, el('div', { class: 'tolletje' }), el('span', { tekst })));
}

async function alsBase64(bestand) {
  const buffer = await bestand.arrayBuffer();
  let binair = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binair += String.fromCharCode(bytes[i]);
  return btoa(binair);
}

async function stuurBrief(payload, { tweede = false } = {}) {
  const antwoord = await fetch('/api/brief', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await antwoord.json().catch(() => ({}));
  if (!antwoord.ok) {
    const err = new Error(data.fout || 'Wij konden deze brief niet lezen.');
    err.hint = data.hint;
    throw err;
  }
  if (tweede) return data;

  zaak.brief = data.brief;
  zaak.herkenning = data.herkenning;
  zaak.invoer = data.invoer;
  zaak.rapport = data.rapport;
  return data;
}

async function verwerkBestand(bestand) {
  if (!bestand) return;
  toonBezig('Wij lezen uw brief…');
  try {
    await stuurBrief({
      bestandsnaam: bestand.name,
      mediaType: bestand.type,
      data: await alsBase64(bestand),
    });
    uploadMelding.textContent = '';
    gaNaar(2);
  } catch (err) {
    uploadMelding.textContent = '';
    uploadMelding.append(melding('let-op', err.message, err.hint || ''));
    uploadMelding.append(el('p', { class: 'fijndruk', style: 'text-align:left; margin-top:10px' },
      'U kunt de tekst van uw brief ook hieronder plakken, of ',
      el('a', { href: '/aanvraag-klassiek' }, 'de vragen zelf beantwoorden'), '.'));
  }
}

dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('sleep'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('sleep'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('sleep');
  verwerkBestand(e.dataTransfer.files[0]);
});
bestandInvoer.addEventListener('change', () => verwerkBestand(bestandInvoer.files[0]));

document.getElementById('knop-plak').addEventListener('click', async () => {
  const tekst = document.getElementById('plaktekst').value.trim();
  if (tekst.length < 40) {
    uploadMelding.textContent = '';
    uploadMelding.append(melding('let-op', 'Er staat te weinig tekst', 'Plak de hele brief, inclusief de datum waarop u een beslissing zou krijgen.'));
    return;
  }
  toonBezig('Wij lezen uw tekst…');
  try {
    await stuurBrief({ tekst });
    uploadMelding.textContent = '';
    gaNaar(2);
  } catch (err) {
    uploadMelding.textContent = '';
    uploadMelding.append(melding('let-op', err.message, err.hint || ''));
  }
});

// -------------------------------------------------------------- stap 2 ----

/** Opnieuw rekenen na een antwoord van de aanvrager. */
function herbereken() {
  zaak.rapport = zaak.invoer.zaaktype && zaak.invoer.basisdatum ? berekenDwangsom(zaak.invoer) : null;
}

function rendereUitslag() {
  const vak = document.getElementById('uitslag');
  vak.textContent = '';
  const r = zaak.rapport;
  const orgaan = zaak.invoer.organisatienaam || labelBestuursorgaan(zaak.invoer.bestuursorgaan) || 'de instantie';
  const einddatum = datumTekst(r && r.beslistermijn ? r.beslistermijn.einddatum : zaak.invoer.termijnEinddatum);

  // Ontbreekt er nog iets, dan blijft de vorige uitkomst staan en vragen wij
  // alleen het ontbrekende; het scherm springt niet naar iets anders.
  if (r && r.onvolledig) {
    vak.append(el('div', { class: 'melding melding--info' },
      el('strong', { tekst: r.kop }),
      el('p', { tekst: r.samenvatting })));
    navigatie.classList.add('verborgen');
    return;
  }

  if (!r) {
    vak.append(el('div', { class: 'uitslag' },
      el('div', { class: 'uitslag__icoon', tekst: '🔍' }),
      el('h2', {}, 'Wij konden er niet genoeg uithalen'),
      el('p', {}, 'Uit deze brief halen wij te weinig om nu al te rekenen. Beantwoord een paar korte vragen, dan kijken wij alsnog mee.')));
    vak.append(el('div', { style: 'margin-top:20px; text-align:center' },
      el('a', { class: 'knop knop--primair', href: '/aanvraag-klassiek' }, 'Vragen beantwoorden →')));
    navigatie.classList.add('verborgen');
    return;
  }

  const teLaat = r.uitkomst === UITKOMST.RECHT
    || r.uitkomst === UITKOMST.INGEBREKESTELLING_NODIG
    || r.uitkomst === UITKOMST.HERSTELTERMIJN_LOOPT;

  const icoon = { [UITKOMST.RECHT]: '🎉', [UITKOMST.INGEBREKESTELLING_NODIG]: '⏰',
    [UITKOMST.HERSTELTERMIJN_LOOPT]: '⏳', [UITKOMST.TERMIJN_LOOPT]: '🕐',
    [UITKOMST.GEEN_RECHT]: 'ℹ️' }[r.uitkomst] || 'ℹ️';

  const opgebouwd = r.berekening && r.berekening.dagen > 0 ? euro(r.berekening.totaal) : null;

  let titel;
  if (r.uitkomst === UITKOMST.GEEN_RECHT) titel = 'Hier kunnen wij niets mee claimen';
  else if (r.uitkomst === UITKOMST.TERMIJN_LOOPT) titel = `${orgaan} heeft nog even de tijd`;
  else if (opgebouwd) titel = `${orgaan} is te laat: er staat ${opgebouwd} open`;
  else titel = `Het lijkt erop dat ${orgaan} te laat is`;

  vak.append(el('div', { class: 'uitslag' },
    el('div', { class: 'uitslag__icoon', tekst: icoon }),
    el('h2', { tekst: titel })));

  if (einddatum) {
    const dagen = r.beslistermijn ? verschilDagen(parseDatum(r.beslistermijn.einddatum), vandaag()) : 0;
    vak.append(el('div', { class: 'feit' },
      el('div', {}, 'Volgens uw brief had ', el('strong', { tekst: orgaan }),
        ' uiterlijk ', el('strong', { tekst: einddatum }), ' moeten beslissen.'),
      dagen > 0
        ? el('div', { style: 'margin-top:6px' }, `Dat is ${dagen} ${dagen === 1 ? 'dag' : 'dagen'} geleden.`)
        : el('div', { style: 'margin-top:6px' }, `Dat is over ${-dagen} ${dagen === -1 ? 'dag' : 'dagen'}.`)));
  }

  // Twee korte vragen die de uitkomst kunnen omgooien.
  vak.append(vraag('Heeft u inmiddels een beslissing ontvangen?', 'beslissing',
    zaak.invoer.besluitGenomen, (ja) => {
      zaak.invoer.besluitGenomen = ja;
      if (!ja) zaak.invoer.besluitDatum = '';
      else if (!zaak.invoer.besluitDatum) zaak.invoer.besluitDatum = zaak.herkenning.briefdatum || '';
      herbereken();
      rendereUitslag();
    }));

  if (!zaak.invoer.besluitGenomen) {
    vak.append(vraag('Heeft u daarna een brief gehad dat er meer tijd nodig is?', 'verlenging',
      zaak.invoer.verdaagd, (ja) => {
        zaak.invoer.verdaagd = ja;
        if (ja) toonTweedeUpload(vak);
        else {
          zaak.invoer.verdagingEinddatum = '';
          zaak.invoer.termijnEinddatum = zaak.herkenning.beslisdatum || '';
          herbereken();
          rendereUitslag();
        }
      }));
  }

  if (zaak.invoer.verdaagd && !zaak.verlengbrief && !zaak.invoer.besluitGenomen) {
    toonTweedeUpload(vak, true);
  }

  // Wie zelf al heeft aangemaand, loopt al een dwangsom op. Dat is precies de
  // situatie waarin er nu geld te halen valt, dus die vraag hoort hier - maar
  // alleen als de termijn ook echt voorbij is, anders is hij verwarrend.
  if (teLaat && !zaak.invoer.besluitGenomen) {
    vak.append(vraag('Heeft u de organisatie zelf al schriftelijk aangemaand?', 'igs',
      zaak.invoer.ingebrekeGesteld, (ja) => {
        zaak.invoer.ingebrekeGesteld = ja;
        if (!ja) zaak.invoer.ingebrekestellingDatum = '';
        // Pas herrekenen als de datum er is; anders is de invoer onvolledig
        // en zou het scherm omslaan naar een uitkomst die nergens op slaat.
        if (!ja || zaak.invoer.ingebrekestellingDatum) herbereken();
        rendereUitslag();
      }, 'Een brief of e-mail waarin u om een beslissing vroeg. Vanaf dan gaat de dwangsom lopen.'));

    if (zaak.invoer.ingebrekeGesteld) {
      const datumvak = el('div', { class: 'veld', style: 'margin-top:12px' },
        el('label', { for: 'igs-datum' }, 'Wanneer heeft u die verstuurd?'));
      const invoerveld = el('input', { type: 'date', id: 'igs-datum' });
      invoerveld.value = zaak.invoer.ingebrekestellingDatum || '';
      invoerveld.addEventListener('change', () => {
        zaak.invoer.ingebrekestellingDatum = invoerveld.value;
        herbereken();
        rendereUitslag();
      });
      datumvak.append(invoerveld);
      vak.append(datumvak);
    }
  }

  const bedrag = opgebouwd;
  if (teLaat) {
    vak.append(el('div', { class: 'melding melding--goed', style: 'margin-top:20px' },
      el('strong', {}, 'Wij kunnen dit voor u regelen'),
      el('p', {}, bedrag
        ? `Er staat nu ${bedrag} open. Wij dienen de melding namens u in en volgen de procedure.`
        : 'Wij dienen de melding te late beslissing namens u in en volgen de procedure. U hoeft zelf niets te doen.')));
    knopVerder.textContent = 'Regel het voor mij →';
    navigatie.classList.remove('verborgen');
  } else if (r.uitkomst === UITKOMST.TERMIJN_LOOPT) {
    vak.append(el('div', { class: 'melding melding--info', style: 'margin-top:20px' },
      el('strong', {}, 'Wij houden het voor u in de gaten'),
      el('p', {}, 'Meld u nu aan. Wordt de datum overschreden, dan komen wij automatisch in actie zonder dat u eraan hoeft te denken.')));
    knopVerder.textContent = 'Houd dit voor mij bij →';
    navigatie.classList.remove('verborgen');
  } else {
    for (const blokkade of r.blokkades) {
      vak.append(el('div', { class: 'melding melding--let-op', style: 'margin-top:16px' },
        el('strong', { tekst: blokkade.titel }), el('p', { tekst: blokkade.uitleg })));
    }
    vak.append(el('div', { class: 'melding melding--info', style: 'margin-top:16px' },
      el('strong', {}, 'Toch laten bekijken?'),
      el('p', {}, 'Een behandelaar kan er met een menselijk oog naar kijken. Dat kost u niets.')));
    knopVerder.textContent = 'Laat een mens meekijken →';
    navigatie.classList.remove('verborgen');
  }

  knopTerug.classList.remove('verborgen');
}

function vraag(tekst, naam, huidig, bijKeuze, uitleg) {
  const blok = el('div', { class: 'vraagblok' }, el('span', { tekst }),
    uitleg ? el('p', { class: 'veld__hulp', style: 'margin:-4px 0 8px', tekst: uitleg }) : null);
  const keuzes = el('div', { class: 'keuzes keuzes--twee' });
  for (const optie of [{ label: 'Nee', waarde: false }, { label: 'Ja', waarde: true }]) {
    const invoerveld = el('input', { type: 'radio', name: `vraag-${naam}` });
    invoerveld.checked = huidig === optie.waarde;
    invoerveld.addEventListener('change', () => bijKeuze(optie.waarde));
    keuzes.append(el('label', { class: 'keuze' }, invoerveld, el('span', { class: 'keuze__tekst', tekst: optie.label })));
  }
  blok.append(keuzes);
  return blok;
}

function toonTweedeUpload(vak, direct = false) {
  const houder = el('div', { class: 'melding melding--info', style: 'margin-top:14px' },
    el('strong', {}, 'Upload ook die brief'),
    el('p', {}, 'Dan rekenen wij met de nieuwe datum in plaats van de oude.'));
  const invoerveld = el('input', { type: 'file', accept: '.pdf,.txt,application/pdf,text/plain' });
  invoerveld.addEventListener('change', async () => {
    const bestand = invoerveld.files[0];
    if (!bestand) return;
    houder.append(el('div', { class: 'bezig', style: 'margin-top:10px' }, el('div', { class: 'tolletje' }), el('span', {}, 'Bezig…')));
    try {
      const data = await stuurBrief({
        bestandsnaam: bestand.name, mediaType: bestand.type, data: await alsBase64(bestand),
      }, { tweede: true });
      zaak.verlengbrief = data.brief;
      if (data.herkenning.beslisdatum) {
        zaak.invoer.termijnEinddatum = data.herkenning.beslisdatum;
        zaak.invoer.verdagingEinddatum = data.herkenning.beslisdatum;
        zaak.invoer.termijnBekend = true;
      }
      zaak.invoer.verdaagd = true;
      herbereken();
      rendereUitslag();
    } catch (err) {
      houder.append(melding('let-op', err.message, err.hint || ''));
    }
  });
  houder.append(invoerveld);
  if (direct) houder.append(el('p', { class: 'fijndruk', style: 'text-align:left' },
    'Heeft u die brief niet bij de hand? Ga verder; wij vragen hem later op.'));
  vak.append(houder);
}

// -------------------------------------------------------------- stap 3 ----

let aanpasmodus = false;

const UIT_BRIEF_VELDEN = [
  { id: 'naam', label: 'Naam' },
  { id: 'adres', label: 'Adres' },
  { id: 'postcode', label: 'Postcode' },
  { id: 'woonplaats', label: 'Woonplaats' },
  { id: 'bsn', label: 'Burgerservicenummer' },
  { id: 'kenmerk', label: 'Kenmerk' },
];

/**
 * Velden die wij normaal niet vragen omdat ze al bekend zijn, maar die toch
 * op het scherm moeten komen: omdat de waarde niet blijkt te kloppen, of
 * omdat de server erover klaagde. Anders kan de aanvrager een fout niet
 * herstellen die hij niet ziet.
 */
const geforceerdeVelden = new Set();

function rendereControle() {
  const vak = document.getElementById('uitbrief');
  vak.textContent = '';
  const h = zaak.herkenning;
  const zaaktype = zoekZaaktype(zaak.invoer.zaaktype);

  if (!aanpasmodus) {
    // Wat hieronder alsnog gevraagd wordt, hoort hier niet nog eens te staan.
    const wordtGevraagd = new Set(ontbrekendeVelden().map((v) => v.id));
    const lijst = el('dl', {});
    for (const veld of UIT_BRIEF_VELDEN) {
      if (wordtGevraagd.has(veld.id)) continue;
      if (!zaak.contact[veld.id] && !h[veld.id]) continue;
      lijst.append(el('div', {},
        el('dt', { tekst: veld.label }),
        el('dd', { tekst: zaak.contact[veld.id] || h[veld.id] })));
    }
    lijst.append(el('div', {},
      el('dt', {}, 'Zaak'),
      el('dd', { tekst: zaaktype ? zaaktype.label : 'Onbekend' })));
    lijst.append(el('div', {},
      el('dt', {}, 'Instantie'),
      el('dd', { tekst: zaak.invoer.organisatienaam || labelBestuursorgaan(zaak.invoer.bestuursorgaan) })));
    if (zaak.invoer.termijnEinddatum) {
      lijst.append(el('div', {},
        el('dt', {}, 'Uiterste beslisdatum'),
        el('dd', { tekst: datumTekst(zaak.invoer.termijnEinddatum) })));
    }

    const kaart = el('div', { class: 'kaartje' }, el('div', { class: 'uit-brief', tekst: 'uit uw brief' }), lijst);
    vak.append(kaart);
    const knop = el('button', { class: 'knop knop--stil knop--klein', type: 'button', style: 'margin-top:10px' }, 'Iets aanpassen');
    knop.addEventListener('click', () => { aanpasmodus = true; rendereControle(); });
    vak.append(knop);
    return;
  }

  for (const veld of UIT_BRIEF_VELDEN) {
    vak.append(tekstveld(veld.id, veld.label, zaak.contact[veld.id] || h[veld.id] || ''));
  }
  vak.append(tekstveld('organisatienaam', 'Instantie', zaak.invoer.organisatienaam || '', (waarde) => {
    zaak.invoer.organisatienaam = waarde;
  }));
  vak.append(datumveld('termijnEinddatum', 'Uiterste beslisdatum uit de brief', zaak.invoer.termijnEinddatum || '', (waarde) => {
    zaak.invoer.termijnEinddatum = waarde;
    zaak.invoer.termijnBekend = Boolean(waarde);
    herbereken();
  }));
  const klaar = el('button', { class: 'knop knop--zacht knop--klein', type: 'button' }, 'Klaar met aanpassen');
  klaar.addEventListener('click', () => { aanpasmodus = false; rendereControle(); });
  vak.append(klaar);
}

function tekstveld(id, label, waarde, bijWijziging) {
  const invoerveld = el('input', { type: 'text', id: `veld-${id}`, value: waarde, maxlength: '120' });
  invoerveld.value = waarde;
  invoerveld.addEventListener('input', () => {
    if (bijWijziging) bijWijziging(invoerveld.value);
    else zaak.contact[id] = invoerveld.value;
  });
  return el('div', { class: 'veld' }, el('label', { for: `veld-${id}`, tekst: label }), invoerveld,
    el('p', { class: 'veld__fout verborgen', 'data-fout': id }));
}

function datumveld(id, label, waarde, bijWijziging) {
  const invoerveld = el('input', { type: 'date', id: `veld-${id}` });
  invoerveld.value = waarde;
  invoerveld.addEventListener('change', () => bijWijziging(invoerveld.value));
  return el('div', { class: 'veld' }, el('label', { for: `veld-${id}`, tekst: label }), invoerveld);
}

/** Alleen wat nog niet bekend is - de regel zelf staat in shared/funnelvragen.js. */
function ontbrekendeVelden() {
  return teVragenVelden({
    herkenning: zaak.herkenning || {},
    contact: zaak.contact,
    bestuursorgaan: zaak.invoer ? zaak.invoer.bestuursorgaan : '',
    geforceerd: [...geforceerdeVelden],
  });
}

function rendereAanvullen() {
  const vak = document.getElementById('aanvullen');
  vak.textContent = '';
  vak.append(el('h2', { style: 'font-size:1.05rem; margin-bottom:4px' }, 'Nog dit van u'),
    el('p', { class: 'onder', style: 'margin-bottom:18px' }, 'De rest hebben wij al uit uw brief.'));

  for (const veld of ontbrekendeVelden()) {
    const invoerveld = el('input', {
      type: veld.type, id: `in-${veld.id}`, maxlength: '120',
      autocomplete: { email: 'email', telefoon: 'tel', naam: 'name', adres: 'street-address',
        postcode: 'postal-code', woonplaats: 'address-level2' }[veld.id] || 'off',
    });
    invoerveld.value = zaak.contact[veld.id] || (zaak.herkenning[veld.id] || '');
    invoerveld.addEventListener('input', () => { zaak.contact[veld.id] = invoerveld.value; });
    vak.append(el('div', { class: 'veld' },
      el('label', { for: `in-${veld.id}` }, veld.label,
        veld.verplicht ? null : el('span', { class: 'subtiel', tekst: ' (optioneel)' })),
      veld.hulp ? el('p', { class: 'veld__hulp', tekst: veld.hulp }) : null,
      invoerveld,
      el('p', { class: 'veld__fout verborgen', 'data-fout': veld.id })));
  }
}

function valideerControle() {
  let ok = true;
  const h = zaak.herkenning;
  for (const veld of ontbrekendeVelden()) {
    const waarde = String(zaak.contact[veld.id] || h[veld.id] || '').trim();
    zetFout(veld.id, '');
    if (veld.verplicht && waarde.length < 2) { zetFout(veld.id, `${veld.label} is nog leeg.`); ok = false; continue; }
    if (veld.id === 'email' && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(waarde)) {
      zetFout('email', 'Vul een geldig e-mailadres in.'); ok = false;
    }
    if (veld.id === 'bsn' && !bsnKlopt(waarde)) {
      zetFout('bsn', 'Dit burgerservicenummer klopt niet. Controleer de cijfers.'); ok = false;
    }
    if (veld.id === 'iban' && !ibanKlopt(waarde)) {
      zetFout('iban', 'Dit IBAN klopt niet. Controleer het rekeningnummer.'); ok = false;
    }
  }
  if (!ok) {
    const eerste = form.querySelector('[data-fout]:not(.verborgen)');
    if (eerste) eerste.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return ok;
}

// -------------------------------------------------------------- stap 4 ----

function rendereMachtiging() {
  const zaaktype = zoekZaaktype(zaak.invoer.zaaktype);
  const orgaan = zaak.invoer.organisatienaam || labelBestuursorgaan(zaak.invoer.bestuursorgaan);
  const naam = zaak.contact.naam || zaak.herkenning.naam || 'ondergetekende';
  const vak = document.getElementById('machtigingtekst');
  vak.textContent = '';
  vak.append(
    el('p', { style: 'margin:0 0 10px' }, 'Ik, ', el('strong', { tekst: naam }),
      ', machtig Dwangsomhulp om mij te vertegenwoordigen bij ',
      el('strong', { tekst: orgaan }), ' in de procedure over ',
      el('strong', { tekst: zaaktype ? zaaktype.label : 'mijn aanvraag' }), '.'),
    el('p', { style: 'margin:0' }, 'Dwangsomhulp mag namens mij de benodigde stukken indienen, de '
      + 'procedure voeren en correspondentie ontvangen. Een toegekende vergoeding wordt '
      + 'rechtstreeks aan mij uitbetaald.'),
  );
}

const canvas = document.getElementById('handtekening');
const vakje = document.getElementById('handtekeningvak');
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

function startLijn(gebeurtenis) {
  gebeurtenis.preventDefault();
  tekent = true;
  penseel.beginPath();
  const punt = penPositie(gebeurtenis);
  penseel.moveTo(punt.x, punt.y);
  canvas.setPointerCapture(gebeurtenis.pointerId);
}

function trekLijn(gebeurtenis) {
  if (!tekent) return;
  gebeurtenis.preventDefault();
  const punt = penPositie(gebeurtenis);
  penseel.lineTo(punt.x, punt.y);
  penseel.stroke();
  if (!getekend) { getekend = true; vakje.classList.add('getekend'); zetFout('handtekening', ''); }
}

function stopLijn() { tekent = false; }

penseel.lineWidth = 3;
penseel.lineCap = 'round';
penseel.lineJoin = 'round';
penseel.strokeStyle = '#16202e';
canvas.addEventListener('pointerdown', startLijn);
canvas.addEventListener('pointermove', trekLijn);
canvas.addEventListener('pointerup', stopLijn);
canvas.addEventListener('pointercancel', stopLijn);

document.getElementById('knop-wissen').addEventListener('click', () => {
  penseel.clearRect(0, 0, canvas.width, canvas.height);
  getekend = false;
  vakje.classList.remove('getekend');
});

// ------------------------------------------------------------- indienen ---

async function verzend() {
  const foutVak = document.getElementById('indien-fout');
  foutVak.textContent = '';
  let ok = true;
  if (!getekend) { zetFout('handtekening', 'Zet hier uw handtekening.'); ok = false; }
  if (!document.getElementById('akkoord').checked) { zetFout('akkoord', 'Zet een vinkje om te machtigen.'); ok = false; }
  if (!ok) return;

  zaak.handtekening = { afbeelding: canvas.toDataURL('image/png'), gezetOp: new Date().toISOString() };

  knopVerder.disabled = true;
  knopVerder.textContent = 'Bezig met indienen…';
  try {
    const h = zaak.herkenning;
    const contact = {
      naam: zaak.contact.naam || h.naam || '',
      adres: zaak.contact.adres || h.adres || '',
      postcode: zaak.contact.postcode || h.postcode || '',
      woonplaats: zaak.contact.woonplaats || h.woonplaats || '',
      kenmerk: zaak.contact.kenmerk || h.kenmerk || '',
      geboortedatum: zaak.contact.geboortedatum || '',
      bsn: normaliseerBsn(zaak.contact.bsn || h.bsn || ''),
      iban: normaliseerIban(zaak.contact.iban || ''),
      email: zaak.contact.email || '',
      telefoon: zaak.contact.telefoon || '',
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
        handtekening: zaak.handtekening,
        herkomst: 'briefupload',
      }),
    });
    const data = await antwoord.json().catch(() => ({}));
    if (!antwoord.ok) {
      // Klaagt de server over een veld, breng de aanvrager dan terug naar dat
      // veld in plaats van hem met een melding te laten zitten.
      const velden = data.velden && typeof data.velden === 'object' ? data.velden : null;
      if (velden && Object.keys(velden).length > 0) {
        for (const id of Object.keys(velden)) geforceerdeVelden.add(id);
        gaNaar(3);
        for (const [id, tekst] of Object.entries(velden)) zetFout(id, tekst);
        const eerste = form.querySelector('[data-fout]:not(.verborgen)');
        if (eerste) eerste.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      foutVak.append(melding('fout', data.fout || 'Indienen is niet gelukt', ''));
      return;
    }
    rendereKlaar(data);
    gaNaar(5);
  } catch (err) {
    console.error('[funnel] indienen mislukt:', err);
    foutVak.append(melding('fout', 'Er ging iets mis',
      `Uw aanmelding is mogelijk wel ontvangen. Neem contact op als u geen bevestiging krijgt. (${err && err.message ? err.message : err})`));
  } finally {
    knopVerder.disabled = false;
    knopVerder.textContent = 'Machtigen en indienen →';
  }
}

function rendereKlaar(data) {
  const orgaan = zaak.invoer.organisatienaam || labelBestuursorgaan(zaak.invoer.bestuursorgaan);
  const vooraanmelding = data.soort === DOSSIERSOORT.VOORAANMELDING;
  document.getElementById('referentie').textContent = data.referentie;
  document.getElementById('klaar-titel').textContent = 'Gelukt. Vanaf hier regelen wij het.';
  document.getElementById('klaar-tekst').textContent = vooraanmelding
    ? `Wij bewaken de termijn bij ${orgaan} en komen in actie zodra dat kan.`
    : `Wij dienen de melding bij ${orgaan} in en volgen de procedure.`;

  const stappen = [
    { tekst: 'Melding voorbereiden', onder: 'Uw gegevens en uw brief zijn binnen', staat: 'klaar' },
    { tekst: `Indienen bij ${orgaan}`, onder: vooraanmelding ? 'Zodra de termijn is verstreken' : 'Binnen twee werkdagen', staat: vooraanmelding ? 'wacht' : 'bezig' },
    { tekst: 'Reactietermijn volgen', onder: 'Wij bewaken de data voor u', staat: 'wacht' },
    { tekst: 'Vergoeding controleren', onder: 'Wij rekenen na wat u toekomt', staat: 'wacht' },
  ];
  const lijst = document.getElementById('tracker');
  lijst.textContent = '';
  for (const s of stappen) {
    lijst.append(el('li', { 'data-staat': s.staat },
      el('span', { class: 'tracker__merk', tekst: s.staat === 'klaar' ? '✓' : (s.staat === 'bezig' ? '→' : '·') }),
      el('span', { class: 'tracker__tekst' }, s.tekst, el('span', { tekst: s.onder }))));
  }
  navigatie.classList.add('verborgen');
}

// ------------------------------------------------------------ navigatie ---

function gaNaar(nummer) {
  stap = Math.max(1, Math.min(TOTAAL, nummer));
  for (const sectie of form.querySelectorAll('.stap')) {
    sectie.classList.toggle('verborgen', Number(sectie.dataset.stap) !== stap);
  }
  if (stap === 2) rendereUitslag();
  if (stap === 3) { rendereControle(); rendereAanvullen(); }
  if (stap === 4) rendereMachtiging();

  bollen.textContent = '';
  for (let i = 1; i <= TOTAAL; i += 1) bollen.append(el('span', { class: i <= stap ? 'actief' : '' }));

  navigatie.classList.toggle('verborgen', stap === 1 || stap === TOTAAL);
  knopTerug.classList.toggle('verborgen', stap <= 2);
  if (stap === 3) knopVerder.textContent = 'Naar de machtiging →';
  if (stap === 4) knopVerder.textContent = 'Machtigen en indienen →';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

knopVerder.addEventListener('click', () => {
  if (stap === 2) return gaNaar(3);
  if (stap === 3) return valideerControle() ? gaNaar(4) : undefined;
  if (stap === 4) return void verzend();
  return gaNaar(stap + 1);
});
knopTerug.addEventListener('click', () => gaNaar(stap - 1));
form.addEventListener('submit', (e) => e.preventDefault());

gaNaar(1);
