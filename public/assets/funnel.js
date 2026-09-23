/**
 * De brief is de intake.
 *
 * De aanvrager uploadt een brief, wij lezen eruit wat nodig is, rekenen uit
 * of de instantie te laat is en laten dat meteen zien. Pas daarna vragen wij
 * gegevens, en alleen wat nog ontbreekt. Eén scherm met een machtiging sluit
 * het af.
 */

import { berekenDwangsom, euro, UITKOMST, TARIEF as WET_TARIEF } from '/shared/dwangsom.js';
import { parseDatum, toonDatum, vandaag, verschilDagen } from '/shared/datum.js';
import { BESTUURSORGANEN, labelBestuursorgaan, vraagtBsn, zoekZaaktype } from '/shared/catalogus.js';
import { bsnKlopt, ibanKlopt, normaliseerBsn, normaliseerIban } from '/shared/identiteit.js';
import { teVragenVelden } from '/shared/funnelvragen.js';
import { tarief, tariefZin, tariefVoorbeeld, tariefKort, tariefSplitsing, euroTekst } from '/shared/tarief.js';
import { meet } from '/assets/meting.js';

/**
 * De fasen die de bezoeker ziet. Niet "stap 7 van 12", maar waar hij is in
 * zijn eigen zaak. De laatste fase is wat wij daarna doen.
 */
const FASEN = [
  { stap: 1, label: 'Brief' },
  { stap: 2, label: 'Jouw uitslag' },
  { stap: 3, label: 'Gegevens' },
  { stap: 4, label: 'Akkoord' },
  { stap: 5, label: 'Wij regelen het' },
];

const TOTAAL = FASEN.length;

/**
 * Instellingen die in de omgeving staan en niet in de pagina kunnen: het
 * tarief. Eén keer ophalen bij het opstarten; stap 4 komt pas veel later, dus
 * hij is altijd binnen voordat hij nodig is.
 */
const INSTELLINGEN = {};
fetch('/api/instellingen')
  .then((a) => a.json())
  .then((d) => Object.assign(INSTELLINGEN, d))
  .catch(() => {});

/**
 * Kwam iemand via een advertentie, dan staat zijn instantie al in de url.
 * Dan hoort er nergens meer "de instantie" te staan, maar gewoon UWV.
 */
const ingang = (() => {
  const params = new URLSearchParams(location.search);
  const instantie = params.get('instantie') || '';
  const zaak = params.get('zaak') || '';
  const geldig = BESTUURSORGANEN.some((b) => b.id === instantie);
  return {
    instantie: geldig ? instantie : '',
    zaak: zaak && zoekZaaktype(zaak) ? zaak : '',
  };
})();

/** De naam van de instantie zoals die in een lopende zin past. */
function instantieInEenZin(id) {
  return { gemeente: 'je gemeente', svb: 'de SVB', belastingdienst: 'de Belastingdienst',
    anders: 'de instantie' }[id] || (id ? labelBestuursorgaan(id) : 'de instantie');
}
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

/**
 * Wat er uit de brief kwam, als lijstje met vinkjes.
 *
 * Dit is het eerste bewijs dat wij de brief echt hebben gelezen, en het kost
 * niets: de herkenning is al gedaan. Een spinner die verdwijnt laat dat niet
 * zien; deze regels wel.
 */
function toonGelezen(herkenning) {
  const gevonden = [];
  if (herkenning.organisatienaam || herkenning.bestuursorgaan) {
    gevonden.push(`${herkenning.organisatienaam || labelBestuursorgaan(herkenning.bestuursorgaan)} herkend`);
  }
  if (herkenning.zaaktype) {
    const zaaktype = zoekZaaktype(herkenning.zaaktype);
    gevonden.push(`${zaaktype ? zaaktype.label : 'Soort zaak'} gevonden`);
  }
  if (herkenning.beslisdatum) gevonden.push('Uiterste beslisdatum gevonden');
  if (herkenning.naam) gevonden.push('Je gegevens overgenomen');
  if (gevonden.length === 0) return;

  uploadMelding.textContent = '';
  const lijst = el('ul', { class: 'gelezen' });
  for (const regel of gevonden) {
    lijst.append(el('li', {}, el('span', { class: 'gelezen__vink', tekst: '\u2713' }),
      el('span', { tekst: regel })));
  }
  uploadMelding.append(lijst);
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
  toonBezig('Wij lezen je brief…');
  try {
    const data = await stuurBrief({
      bestandsnaam: bestand.name,
      mediaType: bestand.type,
      data: await alsBase64(bestand),
    });
    // Eerst laten zien wát wij eruit haalden, dan pas doorspringen. Die halve
    // seconde is het moment waarop iemand denkt: ze hebben mijn brief gelezen.
    toonGelezen(data.herkenning || {});
    await new Promise((klaar) => setTimeout(klaar, 700));
    uploadMelding.textContent = '';
    gaNaar(2);
  } catch (err) {
    uploadMelding.textContent = '';
    uploadMelding.append(melding('let-op', err.message, err.hint || ''));
    uploadMelding.append(el('p', { class: 'fijndruk', style: 'text-align:left; margin-top:10px' },
      'Je kunt de tekst van je brief ook hieronder plakken, of ',
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
    uploadMelding.append(melding('let-op', 'Er staat te weinig tekst', 'Plak de hele brief, inclusief de datum waarop je een beslissing zou krijgen.'));
    return;
  }
  toonBezig('Wij lezen je tekst…');
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

/**
 * "met jouw WIA-beslissing" erachter, als wij dat uit de brief hebben gehaald.
 * Alles wat we al weten, gebruiken we: dat is het verschil tussen een uitslag
 * over een instantie en een uitslag over jouw zaak.
 */
function zaakErbij() {
  const zaaktype = zoekZaaktype(zaak.invoer && zaak.invoer.zaaktype);
  if (!zaaktype) return '';
  const kort = { 'uwv-wia': 'je WIA-beslissing', 'uwv-ww': 'je WW-aanvraag',
    'uwv-wajong': 'je Wajong-beslissing', 'uwv-zw': 'je Ziektewet-uitkering',
    'uwv-bezwaar': 'je bezwaar', 'gem-bijstand': 'je bijstandsaanvraag',
    'gem-wmo': 'je Wmo-aanvraag', 'gem-jeugdwet': 'je aanvraag voor jeugdhulp',
    'gem-schuldhulp': 'je aanvraag voor schuldhulp', 'gem-bezwaar': 'je bezwaar',
    'duo-studiefinanciering': 'je studiefinanciering', 'svb-aow': 'je AOW-aanvraag',
    'bel-toeslag': 'je toeslag' }[zaaktype.id];
  return kort ? ` met ${kort}` : '';
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
  else titel = `Het lijkt erop dat ${orgaan} te laat is${zaakErbij()}`;

  vak.append(el('div', { class: 'uitslag' },
    el('div', { class: 'uitslag__icoon', tekst: icoon }),
    el('h2', { tekst: titel })));

  if (einddatum) {
    const dagen = r.beslistermijn ? verschilDagen(parseDatum(r.beslistermijn.einddatum), vandaag()) : 0;
    // Bij een datum die nog moet komen is "had moeten beslissen" onzin, en juist
    // op dit scherm moet de bezoeker merken dat wij zijn brief echt gelezen hebben.
    vak.append(el('div', { class: 'feit' },
      dagen > 0
        ? el('div', {}, 'Volgens je brief had ', el('strong', { tekst: orgaan }),
          ' uiterlijk ', el('strong', { tekst: einddatum }), ' moeten beslissen.')
        : el('div', {}, 'Volgens je brief moet ', el('strong', { tekst: orgaan }),
          ' uiterlijk ', el('strong', { tekst: einddatum }), ' beslissen.'),
      dagen > 0
        ? el('div', { style: 'margin-top:6px' }, `Dat is ${dagen} ${dagen === 1 ? 'dag' : 'dagen'} geleden.`)
        : el('div', { style: 'margin-top:6px' }, dagen === 0
          ? 'Dat is vandaag.'
          : `Dat is over ${-dagen} ${dagen === -1 ? 'dag' : 'dagen'}.`)));
  }

  // Twee korte vragen die de uitkomst kunnen omgooien.
  vak.append(vraag('Heb je inmiddels een beslissing ontvangen?', 'beslissing',
    zaak.invoer.besluitGenomen, (ja) => {
      zaak.invoer.besluitGenomen = ja;
      if (!ja) zaak.invoer.besluitDatum = '';
      else if (!zaak.invoer.besluitDatum) zaak.invoer.besluitDatum = zaak.herkenning.briefdatum || '';
      herbereken();
      rendereUitslag();
    }));

  if (!zaak.invoer.besluitGenomen) {
    vak.append(vraag(`Heeft ${orgaan} daarna laten weten dat zij meer tijd nodig hebben?`, 'verlenging',
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
    // Bewust niet "aangemaand": dat woord kent bijna niemand. En bewust een
    // derde antwoord: iemand kan best iets gestuurd hebben zonder te weten of
    // dat juridisch als melding telt. Dat laten wij beoordelen, niet hem.
    vak.append(vraag(`Heb je ${orgaan} al officieel laten weten dat de beslistermijn voorbij is?`,
      'igs', zaak.invoer.ingebrekeGesteld, (ja) => {
        zaak.invoer.ingebrekeGesteld = ja === true;
        zaak.invoer.igsOnzeker = ja === 'onzeker';
        if (!ja) zaak.invoer.ingebrekestellingDatum = '';
        // Pas herrekenen als de datum er is; anders is de invoer onvolledig
        // en zou het scherm omslaan naar een uitkomst die nergens op slaat.
        if (!ja || zaak.invoer.ingebrekestellingDatum) herbereken();
        rendereUitslag();
      },
      'Bijvoorbeeld met een melding te late beslissing of een ingebrekestelling.',
      [{ label: 'Nee', waarde: false }, { label: 'Ja', waarde: true },
        { label: 'Weet ik niet', waarde: 'onzeker' }]));

    if (zaak.invoer.igsOnzeker) {
      vak.append(el('div', { class: 'melding melding--info', style: 'margin-top:12px' },
        el('strong', {}, 'Geen probleem, dat zoeken wij uit'),
        el('p', {}, 'Stuur die brief of e-mail mee in je dossier, dan controleren wij of hij als '
          + 'melding kan gelden. Zo niet, dan versturen wij alsnog een nieuwe.')));
    }

    if (zaak.invoer.ingebrekeGesteld) {
      const datumvak = el('div', { class: 'veld', style: 'margin-top:12px' },
        el('label', { for: 'igs-datum' }, 'Wanneer heb je die verstuurd?'));
      const invoerveld = el('input', { type: 'date', id: 'igs-datum' });
      invoerveld.value = zaak.invoer.ingebrekestellingDatum || '';
      invoerveld.addEventListener('change', () => {
        zaak.invoer.ingebrekestellingDatum = invoerveld.value;
        herbereken();
        rendereUitslag();
      });
      datumvak.append(invoerveld,
        el('p', { class: 'veld__hulp', style: 'margin-top:6px' },
          'Weet je de datum niet meer? Kies dan hierboven "Weet ik niet"; wij zoeken het uit.'),
        el('p', { class: 'veld__fout verborgen', 'data-fout': 'igs-datum' }));
      vak.append(datumvak);
    }
  }

  const bedrag = opgebouwd;
  if (teLaat) {
    // Dit is het conversiemoment. Niet één zin, maar een opsomming van wat wij
    // precies overnemen: dat is waar iemand ja op zegt.
    const lijst = el('ul', { class: 'wijdoen' });
    for (const regel of [
      `de formele melding aan ${orgaan}`,
      'het versturen en het bewaren van het verzendbewijs',
      'het bewaken van de vervolgtermijn',
      'het controleren en vorderen van een eventuele dwangsom',
    ]) {
      lijst.append(el('li', {}, el('span', { class: 'wijdoen__vink', tekst: '\u2713' }),
        el('span', { tekst: regel })));
    }
    vak.append(el('div', { class: 'melding melding--goed', style: 'margin-top:20px' },
      el('strong', {}, 'Goed nieuws: we kunnen je hierbij helpen'),
      el('p', {}, bedrag
        ? `Op basis van wat je hebt ingevuld is de beslistermijn van ${orgaan} verstreken en staat `
          + `er nu ${bedrag} open. Ga je door, dan regelen wij:`
        : `Op basis van wat je hebt ingevuld lijkt de beslistermijn van ${orgaan} verstreken. `
          + 'Ga je door, dan regelen wij:'),
      lijst,
      el('p', { class: 'wijdoen__slot' }, 'Jij hoeft de procedure niet zelf bij te houden.')));
    knopVerder.textContent = 'Ja, regel dit voor mij →';
    navigatie.classList.remove('verborgen');
  } else if (r.uitkomst === UITKOMST.TERMIJN_LOOPT) {
    // Nog niet te laat is geen afwijzing maar een afspraak voor later.
    const einde = r.beslistermijn ? datumTekst(r.beslistermijn.einddatum) : '';
    vak.append(el('div', { class: 'melding melding--info', style: 'margin-top:20px' },
      el('strong', {}, `${orgaan} is nog niet te laat`),
      el('p', {}, einde
        ? `Volgens je brief loopt de beslistermijn af op ${einde}. Je hoeft nu niets te doen.`
        : 'De beslistermijn loopt nog. Je hoeft nu niets te doen.'),
      el('p', {}, 'Wil je dat wij het voor je bijhouden en in actie komen zodra dat kan? Dan hoef '
        + 'je er zelf niet aan te denken.')));
    knopVerder.textContent = 'Ja, houd dit voor mij bij →';
    navigatie.classList.remove('verborgen');
  } else {
    for (const blokkade of r.blokkades) {
      vak.append(el('div', { class: 'melding melding--let-op', style: 'margin-top:16px' },
        el('strong', { tekst: blokkade.titel }), el('p', { tekst: blokkade.uitleg })));
    }
    vak.append(el('div', { class: 'melding melding--info', style: 'margin-top:16px' },
      el('strong', {}, 'Toch laten bekijken?'),
      el('p', {}, 'Een behandelaar kan er met een menselijk oog naar kijken. Dat kost je niets.')));
    knopVerder.textContent = 'Laat een mens meekijken →';
    navigatie.classList.remove('verborgen');
  }

  knopTerug.classList.remove('verborgen');
}

function vraag(tekst, naam, huidig, bijKeuze, uitleg, opties) {
  const blok = el('div', { class: 'vraagblok' }, el('span', { tekst }),
    uitleg ? el('p', { class: 'veld__hulp', style: 'margin:-4px 0 8px', tekst: uitleg }) : null);
  const keuzes = el('div', { class: 'keuzes keuzes--twee' });
  for (const optie of opties || [{ label: 'Nee', waarde: false }, { label: 'Ja', waarde: true }]) {
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
    'Heb je die brief niet bij de hand? Ga verder; wij vragen hem later op.'));
  vak.append(houder);
}

// -------------------------------------------------------------- stap 3 ----

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

/**
 * "Klopt dit?" - wat wij uit de brief haalden.
 *
 * Eerder opende "Iets aanpassen" het hele formulier weer: elf velden, terwijl
 * er meestal één postcode fout is. Nu is elke regel zelf aan te klikken en
 * verandert alleen die ene regel in een invoerveld. Dat is het verschil tussen
 * "controleren" en "toch weer invullen".
 */
function rendereControle() {
  const vak = document.getElementById('uitbrief');
  vak.textContent = '';
  const h = zaak.herkenning;
  const zaaktype = zoekZaaktype(zaak.invoer.zaaktype);
  const wordtGevraagd = new Set(ontbrekendeVelden().map((v) => v.id));

  // Elke regel: waar hij vandaan komt, hoe hij heet en waar hij heen gaat.
  const regels = [];
  for (const veld of UIT_BRIEF_VELDEN) {
    if (wordtGevraagd.has(veld.id)) continue;
    if (!zaak.contact[veld.id] && !h[veld.id]) continue;
    regels.push({
      id: veld.id, label: veld.label, soort: 'text',
      waarde: zaak.contact[veld.id] || h[veld.id],
      zet: (waarde) => { zaak.contact[veld.id] = waarde; },
    });
  }
  regels.push({
    id: 'organisatienaam', label: 'Instantie', soort: 'text',
    waarde: zaak.invoer.organisatienaam || labelBestuursorgaan(zaak.invoer.bestuursorgaan),
    zet: (waarde) => { zaak.invoer.organisatienaam = waarde; },
  });
  // De zaak zelf is een keuze uit de catalogus, geen vrije tekst: die laten
  // wij hier zien maar niet bewerken.
  regels.push({ id: 'zaak', label: 'Zaak', waarde: zaaktype ? zaaktype.label : 'Onbekend', vast: true });
  if (zaak.invoer.termijnEinddatum) {
    regels.push({
      id: 'termijnEinddatum', label: 'Uiterste beslisdatum', soort: 'date',
      waarde: zaak.invoer.termijnEinddatum,
      toon: datumTekst(zaak.invoer.termijnEinddatum),
      zet: (waarde) => {
        zaak.invoer.termijnEinddatum = waarde;
        zaak.invoer.termijnBekend = Boolean(waarde);
        herbereken();
      },
    });
  }

  const lijst = el('dl', {});
  for (const regel of regels) lijst.append(controleregel(regel));
  vak.append(el('div', { class: 'kaartje' },
    el('div', { class: 'uit-brief', tekst: 'automatisch uit je brief gehaald' }), lijst));
  vak.append(el('p', { class: 'veld__hulp', style: 'margin-top:10px' },
    'Klopt er iets niet? Klik op die regel om hem aan te passen.'));
}

/** Eén regel die in zichzelf bewerkbaar is. */
function controleregel({ id, label, waarde, toon, soort, zet, vast }) {
  const rij = el('div', { class: vast ? 'controleregel controleregel--vast' : 'controleregel' },
    el('dt', { tekst: label }));

  if (vast) {
    rij.append(el('dd', { tekst: waarde }));
    return rij;
  }

  const knop = el('button', { class: 'controleregel__waarde', type: 'button' },
    el('span', { tekst: toon || waarde }),
    el('span', { class: 'controleregel__pen', 'aria-hidden': 'true', tekst: '\u270E' }));
  knop.setAttribute('aria-label', `${label} aanpassen`);

  const dd = el('dd', {}, knop);
  knop.addEventListener('click', () => {
    const invoerveld = el('input', {
      type: soort === 'date' ? 'date' : 'text', id: `veld-${id}`, maxlength: '120',
    });
    invoerveld.value = waarde;
    const bewaar = () => {
      if (soort !== 'date' && invoerveld.value.trim() === '') return; // leeg is geen correctie
      zet(soort === 'date' ? invoerveld.value : invoerveld.value.trim());
      rendereControle();
    };
    invoerveld.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); bewaar(); }
      if (e.key === 'Escape') rendereControle();
    });
    invoerveld.addEventListener('blur', bewaar);
    dd.textContent = '';
    dd.append(invoerveld, el('p', { class: 'veld__fout verborgen', 'data-fout': id }));
    invoerveld.focus();
    if (soort !== 'date') invoerveld.select();
  });

  rij.append(dd);
  return rij;
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
    el('p', { class: 'onder', style: 'margin-bottom:18px' }, 'De rest hebben wij al uit je brief.'));

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
      // Bij het burgerservicenummer en het rekeningnummer hoort er onder het
      // veld te staan wat wij ermee doen. Daar haakt iemand anders af.
      veld.slot ? el('p', { class: 'veld__slot' },
        el('span', { class: 'veld__slot-teken', 'aria-hidden': 'true', tekst: '\u{1F512}' }),
        el('span', { tekst: veld.slot })) : null,
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

/**
 * Wat wij na de ondertekening gaan doen, toegespitst op deze zaak. Dit is het
 * verschil tussen "jullie vullen een formulier in" en "jullie nemen het over".
 */
function rendereActieplan() {
  const vak = document.getElementById('actieplan');
  if (!vak) return;
  vak.textContent = '';
  const naam = instantieInEenZin(zaak.invoer.bestuursorgaan);
  const r = zaak.rapport || {};
  const alAangemaand = Boolean(zaak.invoer.ingebrekeGesteld);
  const nogInTermijn = r.uitkomst === UITKOMST.TERMIJN_LOOPT;

  const stappen = nogInTermijn
    ? [
      ['Nu', `Wij leggen je zaak vast en zetten de datum waarop ${naam} moet beslissen in de gaten.`],
      ['Daarna', `Beslist ${naam} niet op tijd, dan versturen wij de melding zonder dat je eraan hoeft te denken.`],
      ['Blijft een beslissing uit?', 'Dan controleren wij of er een dwangsom ontstaat en welk bedrag bij jouw situatie hoort.'],
    ]
    : [
      ['Nu', alAangemaand
        ? `Wij nemen je aanmaning over en houden de termijn bij die voor ${naam} is gaan lopen.`
        : `Wij regelen de formele melding dat ${naam} te laat is.`],
      ['Daarna', `Wij bewaken de twee weken die ${naam} daarna nog heeft om te beslissen.`],
      ['Blijft een beslissing uit?', 'Dan controleren wij of er een dwangsom ontstaat en welk bedrag bij jouw situatie hoort.'],
    ];

  const lijst = el('ol', {});
  for (const [wanneer, wat] of stappen) {
    lijst.append(el('li', {},
      el('span', { class: 'actieplan__wanneer', tekst: wanneer }),
      el('span', { class: 'actieplan__wat', tekst: wat })));
  }
  vak.append(el('div', { class: 'actieplan' },
    el('h2', { tekst: 'Dit gaan we nu voor je doen' }),
    lijst,
    el('p', { class: 'actieplan__slot', tekst: 'Je hoeft de procedure niet zelf bij te houden.' })));
}

/** De zaak zoals wij die nu kennen, met zoveel woorden voorgelegd. */
function rendereJouwZaak() {
  const vak = document.getElementById('jouwzaak');
  if (!vak) return;
  vak.textContent = '';
  const zaaktype = zoekZaaktype(zaak.invoer.zaaktype);
  const orgaan = zaak.invoer.organisatienaam || labelBestuursorgaan(zaak.invoer.bestuursorgaan);
  const r = zaak.rapport || {};
  const vervolg = r.vervolg || {};
  const einde = r.beslistermijn ? parseDatum(r.beslistermijn.einddatum) : null;

  const rijen = [
    ['Instantie', orgaan],
    ['Procedure', zaaktype ? zaaktype.label : 'Aanvraag'],
    ['Beslistermijn volgens brief', einde ? toonDatum(einde) : 'niet uit de brief te halen'],
    ['Beslissing ontvangen', zaak.invoer.besluitGenomen ? 'Ja' : 'Nee'],
    ['Volgende stap', vervolg.actieLabel || 'Beoordelen door een behandelaar'],
  ];
  const lijst = el('dl', {});
  for (const [naam, waarde] of rijen) {
    lijst.append(el('div', {}, el('dt', { tekst: naam }), el('dd', { tekst: waarde })));
  }
  vak.append(el('div', { class: 'jouwzaak' }, el('h2', { tekst: 'Jouw zaak' }), lijst));
}

/**
 * Wat het kost, vlak voordat iemand tekent.
 *
 * Bewust hier en niet alleen in de voorwaarden: "geen vergoeding, geen kosten"
 * roept juist de vraag op wat je dán betaalt. Die vraag onbeantwoord laten op
 * het scherm waar je je handtekening zet, kost meer vertrouwen dan het getal
 * zelf ooit kan kosten.
 */
/**
 * Wat de klant ons betaalt, vlak voordat hij tekent.
 *
 * Hier stond een lijst met uitkomsten en bedragen door elkaar: "Geen dwangsom
 * toegekend - € 0". Een scherm eerder staat "mogelijk recht op € 1.442", dus
 * dat las als "jij krijgt nul". Elke regel gaat nu onmiskenbaar over onze
 * rekening, en erboven staat dat het dwangsombedrag zelf altijd naar de klant
 * gaat.
 *
 * En het rekent door met het bedrag van déze zaak. Een percentage zegt mensen
 * weinig; "van € 1.442 houd jij € 1.081 over" zegt alles.
 */
function rendereKosten() {
  const vak = document.getElementById('kostenblok');
  if (!vak) return;
  vak.textContent = '';
  const t = tarief(INSTELLINGEN);

  const lijst = el('ul', { class: 'kostenlijst' },
    el('li', {}, el('span', { tekst: 'Voor de controle die je net deed' }),
      el('strong', { tekst: 'je betaalt niets' })),
    el('li', {}, el('span', { tekst: 'Als er géén dwangsom wordt toegekend' }),
      el('strong', { tekst: 'je betaalt niets' })),
    el('li', { class: 'kostenlijst__wel' },
      el('span', { tekst: 'Als er wél een dwangsom wordt toegekend' }),
      el('strong', { tekst: tariefKort(t) })));

  const blok = el('div', { class: 'kostenblok' },
    el('h2', { tekst: 'Wat het je kost' }),
    el('p', { class: 'kostenblok__kop' },
      'Hieronder staat wat jij ',
      el('em', {}, 'ons'),
      ' betaalt. De dwangsom zelf wordt altijd rechtstreeks aan jou uitbetaald; '
      + 'wij krijgen dat geld niet in handen.'),
    lijst);

  if (!t.bekend) blok.append(el('p', { class: 'kostenblok__zin', tekst: tariefZin(t) }));

  const som = kostenSom(t);
  if (som) blok.append(som);
  else {
    const voorbeeld = tariefVoorbeeld(t);
    if (voorbeeld) blok.append(el('p', { class: 'kostenblok__voorbeeld', tekst: voorbeeld }));
  }
  vak.append(blok);
}

/**
 * De som met het bedrag van deze zaak erin.
 *
 * Welk bedrag dat is, hangt ervan af waar de zaak staat. Loopt er al een
 * dwangsom, dan is dat het opgebouwde bedrag. Moet de melding nog de deur uit,
 * dan is er nog geen bedrag en rekenen wij met het wettelijk maximum - met
 * zoveel woorden erbij dat dat het maximum is, want anders belooft dit iets.
 */
function kostenSom(t) {
  const r = zaak.rapport || {};
  const berekening = r.berekening || {};
  const lopend = Number(berekening.totaal) > 0 ? Number(berekening.totaal) : 0;
  const bedrag = lopend || WET_TARIEF.maxBedrag;
  const split = tariefSplitsing(t, bedrag);
  if (!split) return null;

  const uitleg = lopend
    ? (berekening.doorlopend
      ? `Er staat nu ${euroTekst(bedrag)} open, en dat loopt nog op. Bij dit bedrag:`
      : `Er staat ${euroTekst(bedrag)} open. Daarvan:`)
    : `Er is nog geen bedrag: dat ontstaat pas als ${instantieInEenZin(zaak.invoer.bestuursorgaan)} `
      + `ook na onze melding niet beslist. Loopt het op tot het wettelijk maximum van `
      + `${euroTekst(bedrag)}, dan:`;

  return el('div', { class: 'kostensom' },
    el('p', { class: 'kostensom__uitleg', tekst: uitleg }),
    el('div', { class: 'kostensom__rij' },
      el('span', { tekst: 'Toegekende dwangsom' }),
      el('strong', { tekst: euroTekst(split.bedrag) })),
    el('div', { class: 'kostensom__rij kostensom__rij--af' },
      el('span', { tekst: t.soort === 'percentage' ? `Onze vergoeding (${t.percentage}%)` : 'Onze vergoeding' }),
      el('strong', { tekst: `\u2212 ${euroTekst(split.vergoeding)}` })),
    el('div', { class: 'kostensom__rij kostensom__rij--uit' },
      el('span', { tekst: 'Jij houdt over' }),
      el('strong', { tekst: euroTekst(split.overhoudt) })));
}

function rendereMachtiging() {
  const zaaktype = zoekZaaktype(zaak.invoer.zaaktype);
  const orgaan = zaak.invoer.organisatienaam || labelBestuursorgaan(zaak.invoer.bestuursorgaan);
  const naam = zaak.contact.naam || zaak.herkenning.naam || 'ondergetekende';
  const vak = document.getElementById('machtigingtekst');
  vak.textContent = '';
  vak.append(
    el('p', { class: 'machtiging__uitleg' },
      el('strong', {}, 'Waar geef je toestemming voor? '),
      `Met deze machtiging mogen wij alleen handelen in deze ene procedure over de te late `
      + `beslissing van ${orgaan}. Wij mogen daarmee geen andere zaken van je behandelen.`),
    el('p', { style: 'margin:0 0 10px' }, 'Ik, ', el('strong', { tekst: naam }),
      ', machtig nubeslist.nl om mij te vertegenwoordigen bij ',
      el('strong', { tekst: orgaan }), ' in de procedure over ',
      el('strong', { tekst: zaaktype ? zaaktype.label : 'mijn aanvraag' }), '.'),
    el('p', { style: 'margin:0' }, 'nubeslist.nl mag namens mij de benodigde stukken indienen, de '
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
  if (!getekend) {
    getekend = true;
    vakje.classList.add('getekend');
    zetFout('handtekening', '');
    // Meteen bevestigen dat het gelukt is; anders blijft het gissen of die
    // krabbel wel is aangekomen.
    const uitleg = document.getElementById('handtekening-uitleg');
    if (uitleg) {
      const nu = new Date();
      uitleg.classList.add('handtekening-gezet');
      uitleg.textContent = `\u2713 Handtekening toegevoegd op ${nu.toLocaleDateString('nl-NL')} `
        + `om ${nu.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`;
    }
  }
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
  if (!getekend) { zetFout('handtekening', 'Zet hier je handtekening.'); ok = false; }
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
        // Deze twee horen bij de vraag op het uitslagscherm; daar staat ook het
        // enige veld waarin ze te herstellen zijn.
        const opUitslag = ['ingebrekestellingDatum', 'basisdatum'];
        const uitslagveld = Object.keys(velden).find((id) => opUitslag.includes(id));
        if (uitslagveld) {
          gaNaar(2);
          zetFout('igs-datum', velden[uitslagveld]);
          const veld = document.getElementById('igs-datum');
          if (veld) veld.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return;
        }
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
    meet('aanvraag');
    rendereKlaar(data);
    gaNaar(5);
  } catch (err) {
    console.error('[funnel] indienen mislukt:', err);
    foutVak.append(melding('fout', 'Er ging iets mis',
      `Je aanmelding is mogelijk wel ontvangen. Neem contact op als je geen bevestiging krijgt. (${err && err.message ? err.message : err})`));
  } finally {
    knopVerder.disabled = false;
    knopVerder.textContent = 'Machtigen en indienen →';
  }
}

function rendereKlaar(data) {
  const orgaan = zaak.invoer.organisatienaam || labelBestuursorgaan(zaak.invoer.bestuursorgaan);
  document.getElementById('referentie').textContent = data.referentie;
  document.getElementById('klaar-titel').textContent = 'Gelukt. Vanaf hier regelen wij het.';
  document.getElementById('klaar-tekst').textContent = {
    [UITKOMST.TERMIJN_LOOPT]: `Wij bewaken de termijn bij ${orgaan} en komen in actie zodra die voorbij is.`,
    [UITKOMST.HERSTELTERMIJN_LOOPT]: `Wij bewaken de twee weken die ${orgaan} nog heeft en volgen de procedure.`,
    [UITKOMST.RECHT]: `Wij eisen de dwangsom bij ${orgaan} op en volgen de procedure.`,
    [UITKOMST.INGEBREKESTELLING_NODIG]: `Wij melden bij ${orgaan} dat de termijn voorbij is en volgen de procedure.`,
  }[(zaak.rapport || {}).uitkomst] || `Wij nemen je zaak bij ${orgaan} in behandeling en laten van ons horen.`;

  // De staat moet kloppen met wat er twee schermen terug is vastgesteld. Bij
  // een verstreken termijn "wachten tot de termijn verstrijkt" tonen is
  // verwarrend: die is net verstreken.
  const uitkomst = (zaak.rapport || {}).uitkomst;
  const stappen = [
    { tekst: 'Je zaak is aangemaakt', onder: 'Je brief en je gegevens zijn binnen', staat: 'klaar' },
    { tekst: 'Machtiging ontvangen', onder: 'Ondertekend en vastgelegd', staat: 'klaar' },
  ];
  if (uitkomst === UITKOMST.TERMIJN_LOOPT) {
    // Het enige geval waarin wij echt op de klok wachten.
    stappen.push(
      { tekst: `Termijn van ${orgaan} bewaken`, onder: 'Wij houden de datum in de gaten', staat: 'bezig' },
      { tekst: 'Melding versturen', onder: 'Zodra de termijn is verstreken', staat: 'wacht' },
    );
  } else if (uitkomst === UITKOMST.HERSTELTERMIJN_LOOPT) {
    stappen.push(
      { tekst: 'Melding is al verstuurd', onder: 'Wij nemen de procedure over', staat: 'klaar' },
      { tekst: 'Vervolgtermijn bewaken', onder: `${orgaan} heeft nog twee weken`, staat: 'bezig' },
    );
  } else if (uitkomst === UITKOMST.RECHT) {
    stappen.push(
      { tekst: 'Dwangsom opeisen', onder: `Wij stellen de vordering aan ${orgaan} nu op`, staat: 'bezig' },
      { tekst: `Indienen bij ${orgaan}`, onder: 'Binnen twee werkdagen', staat: 'wacht' },
    );
  } else if (uitkomst === UITKOMST.INGEBREKESTELLING_NODIG) {
    // De termijn is al voorbij. Hier niet zeggen dat wij op die termijn
    // wachten: dat is precies wat twee schermen terug is weerlegd.
    stappen.push(
      { tekst: 'Melding voorbereiden', onder: `De termijn van ${orgaan} is voorbij; wij stellen de brief nu op`, staat: 'bezig' },
      { tekst: `Indienen bij ${orgaan}`, onder: 'Binnen twee werkdagen', staat: 'wacht' },
    );
  } else {
    stappen.push(
      { tekst: 'Een behandelaar kijkt ernaar', onder: 'Wij zoeken uit wat er in jouw geval mogelijk is', staat: 'bezig' },
      { tekst: 'Je hoort van ons', onder: 'Binnen twee werkdagen', staat: 'wacht' },
    );
  }
  stappen.push(uitkomst === UITKOMST.RECHT
    ? { tekst: 'Uitbetaling volgen', onder: 'Wij rekenen na wat jou toekomt', staat: 'wacht' }
    : { tekst: 'Eventuele dwangsom volgen', onder: 'Wij rekenen na wat jou toekomt', staat: 'wacht' });
  const lijst = document.getElementById('tracker');
  lijst.textContent = '';
  for (const s of stappen) {
    lijst.append(el('li', { 'data-staat': s.staat },
      el('span', { class: 'tracker__merk', tekst: s.staat === 'klaar' ? '✓' : (s.staat === 'bezig' ? '→' : '○') }),
      el('span', { class: 'tracker__tekst' }, s.tekst, el('span', { tekst: s.onder }))));
  }
  // De klant heeft zojuist zijn zaak uit handen gegeven. Wat hij nu wil is
  // zijn dossier zien, niet terug naar de homepage.
  const knoppen = document.getElementById('klaar-knoppen');
  if (knoppen) {
    knoppen.textContent = '';
    knoppen.append(
      el('a', { class: 'knop knop--primair knop--groot', href: '/mijn' }, 'Bekijk mijn dossier'),
      el('p', { class: 'fijndruk', style: 'margin:12px 0 0' },
        `Wij hebben een link gestuurd naar ${zaak.contact.email || 'je e-mailadres'}. `
        + 'Daarmee kom je er altijd weer in, zonder wachtwoord.'),
      el('p', { style: 'margin:14px 0 0' },
        el('a', { class: 'nav-secundair', href: '/' }, 'Terug naar nubeslist.nl')),
    );
  }
  navigatie.classList.add('verborgen');
}

// ------------------------------------------------------------ navigatie ---

/**
 * Welke stap welke meting oplevert.
 *
 * Alleen de eerste keer dat een stap wordt bereikt telt mee. Wie terugloopt
 * en opnieuw doorklikt, zou anders drie keer als "uitslag gezien" in de
 * cijfers staan, en dan lijkt de trechter beter dan hij is.
 */
const MEETSTAP = { 2: 'funnel-uitslag', 3: 'funnel-gegevens', 4: 'funnel-akkoord' };
const gemeten = new Set();

function gaNaar(nummer) {
  stap = Math.max(1, Math.min(TOTAAL, nummer));
  const gebeurtenis = MEETSTAP[stap];
  if (gebeurtenis && !gemeten.has(gebeurtenis)) {
    gemeten.add(gebeurtenis);
    meet(gebeurtenis);
  }
  for (const sectie of form.querySelectorAll('.stap')) {
    sectie.classList.toggle('verborgen', Number(sectie.dataset.stap) !== stap);
  }
  if (stap === 2) rendereUitslag();
  if (stap === 3) { rendereControle(); rendereAanvullen(); }
  if (stap === 4) { rendereActieplan(); rendereJouwZaak(); rendereKosten(); rendereMachtiging(); }

  bollen.textContent = '';
  for (const fase of FASEN) {
    const staat = fase.stap < stap ? 'klaar' : (fase.stap === stap ? 'bezig' : 'straks');
    bollen.append(el('span', { class: `fasebalk__fase fasebalk__fase--${staat}` },
      el('span', { class: 'fasebalk__merk', tekst: staat === 'klaar' ? '\u2713' : String(fase.stap) }),
      el('span', { class: 'fasebalk__label', tekst: fase.label })));
  }

  navigatie.classList.toggle('verborgen', stap === 1 || stap === TOTAAL);
  knopTerug.classList.toggle('verborgen', stap <= 2);
  if (stap === 3) knopVerder.textContent = 'Naar de machtiging →';
  if (stap === 4) knopVerder.textContent = 'Machtigen en indienen →';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Zei iemand dat hij al gemeld heeft, dan moet de datum erbij: zonder die
 * datum weigert de server de aanvraag. Dat mocht niet pas na het zetten van
 * de handtekening blijken.
 */
function valideerUitslag() {
  if (!zaak.invoer.ingebrekeGesteld || zaak.invoer.ingebrekestellingDatum) {
    zetFout('igs-datum', '');
    return true;
  }
  zetFout('igs-datum', 'Vul de datum in waarop je dat hebt verstuurd. Zonder die datum kunnen '
    + 'wij de dwangsom niet berekenen.');
  const veld = document.getElementById('igs-datum');
  if (veld) { veld.scrollIntoView({ block: 'center', behavior: 'smooth' }); veld.focus(); }
  return false;
}

knopVerder.addEventListener('click', () => {
  if (stap === 2) return valideerUitslag() ? gaNaar(3) : undefined;
  if (stap === 3) return valideerControle() ? gaNaar(4) : undefined;
  if (stap === 4) return void verzend();
  return gaNaar(stap + 1);
});
knopTerug.addEventListener('click', () => gaNaar(stap - 1));
form.addEventListener('submit', (e) => e.preventDefault());

/**
 * De eerste zin moet de zaak van de bezoeker zijn. Kwam hij van de
 * WIA-advertentie, dan staat hier UWV en niet "de instantie".
 */
function zetIngangstekst() {
  if (!ingang.instantie) return;
  const naam = instantieInEenZin(ingang.instantie);
  const kop = document.getElementById('stap1-kop');
  const onder = document.getElementById('stap1-onder');
  const knop = document.getElementById('dropzone-titel');
  if (kop) kop.textContent = `Laten we kijken of ${naam} te laat is`;
  if (onder) {
    // Het label uit de catalogus is een werkwoordzin ("WIA-uitkering aanvragen
    // of beoordelen") en past niet in deze zin; bovendien mag WIA geen kleine
    // letters krijgen. Dus hier alleen de instantie, de procedure komt later.
    onder.textContent = `Upload de brief van ${naam} waarin staat wanneer je een beslissing kon `
      + 'verwachten. Wij zoeken de relevante datum voor je op.';
  }
  if (knop) {
    const kort = { uwv: 'UWV-brief', duo: 'DUO-brief', svb: 'SVB-brief',
      gemeente: 'gemeentebrief' }[ingang.instantie] || 'brief';
    knop.textContent = `Kies mijn ${kort}`;
  }
}

zetIngangstekst();
gaNaar(1);
// De funnel is geopend. Het bezoek zelf wordt al geteld doordat meting.js
// wordt geladen; dit zegt dat iemand ook echt aan de aanvraag begint.
meet('funnel-start');
