/**
 * Het document is de intake.
 *
 * Uit de tekst van een brief halen wij wat wij nodig hebben: van welke
 * instantie hij komt, waar de zaak over gaat, wie de aanvrager is en - het
 * belangrijkste - welke datum de instantie zelf noemt als uiterste
 * beslisdatum. Die datum gaat altijd voor op onze eigen standaardtermijnen.
 *
 * Dit is bewust regelgebaseerd: patronen die in dit soort brieven vast
 * terugkomen. Wat niet wordt herkend, wordt niet geraden maar aan de
 * aanvrager gevraagd. Elk veld draagt daarom hoe zeker wij zijn.
 */

const MAANDEN = {
  januari: 0, februari: 1, maart: 2, april: 3, mei: 4, juni: 5,
  juli: 6, augustus: 7, september: 8, oktober: 9, november: 10, december: 11,
};

const MAANDPATROON = Object.keys(MAANDEN).join('|');
const DATUM = new RegExp(`(\\d{1,2})\\s+(${MAANDPATROON})\\s+(\\d{4})`, 'i');
const DATUM_GLOBAAL = new RegExp(DATUM.source, 'gi');

/** '14 september 2026' -> '2026-09-14' */
function naarIso(match) {
  if (!match) return null;
  const dag = Number(match[1]);
  const maand = MAANDEN[match[2].toLowerCase()];
  const jaar = Number(match[3]);
  if (maand === undefined || !Number.isFinite(dag) || dag < 1 || dag > 31) return null;
  return `${jaar}-${String(maand + 1).padStart(2, '0')}-${String(dag).padStart(2, '0')}`;
}

/** Zoekt een datum in de buurt van een kernwoord, binnen dezelfde zin of de volgende regel. */
function datumBij(tekst, kernwoord) {
  const patroon = new RegExp(`${kernwoord}[^.]{0,160}?${DATUM.source}`, 'i');
  const match = patroon.exec(tekst);
  return match ? naarIso([match[0], match[1], match[2], match[3]]) : null;
}

/** Alle datums die bij een kernwoord horen, op volgorde van voorkomen. */
function datumsBij(tekst, kernwoord) {
  const patroon = new RegExp(`${kernwoord}[^.]{0,160}?${DATUM.source}`, 'gi');
  return [...tekst.matchAll(patroon)]
    .map((m) => naarIso([m[0], m[1], m[2], m[3]]))
    .filter(Boolean);
}

/** Een datum die vóór het kernwoord staat: "Op 4 mei 2026 hebben wij uw aanvraag ontvangen." */
function datumVoor(tekst, kernwoord) {
  const patroon = new RegExp(`${DATUM.source}[^.]{0,120}?${kernwoord}`, 'i');
  const match = patroon.exec(tekst);
  return match ? naarIso([match[0], match[1], match[2], match[3]]) : null;
}

const INSTANTIES = [
  { id: 'uwv', patroon: /\bUWV\b/i, naam: 'UWV' },
  { id: 'duo', patroon: /\bDUO\b|Dienst Uitvoering Onderwijs/i, naam: 'DUO' },
  { id: 'svb', patroon: /\bSVB\b|Sociale Verzekeringsbank/i, naam: 'SVB' },
  { id: 'belastingdienst', patroon: /Belastingdienst|\bToeslagen\b/i, naam: 'Belastingdienst' },
  { id: 'gemeente', patroon: /\bgemeente\b/i, naam: 'Gemeente' },
];

const ZAAKTYPEN = [
  // Let op: "u kunt bezwaar maken" staat onderaan elke beslissing. Daarom
  // alleen aanslaan op formuleringen die over een lopend bezwaar gaan.
  {
    patroon: /bezwaarschrift|op uw bezwaar|uw bezwaar van|beslissing op bezwaar/i,
    bijInstantie: { uwv: 'uwv-bezwaar', gemeente: 'gem-bezwaar' },
    standaard: 'overig-bezwaar',
  },
  { patroon: /\bWIA\b|WGA-uitkering|IVA-uitkering/i, standaard: 'uwv-wia' },
  { patroon: /\bWajong\b/i, standaard: 'uwv-wajong' },
  { patroon: /\bWW-uitkering\b|\bWW\b/i, standaard: 'uwv-ww' },
  { patroon: /Ziektewet/i, standaard: 'uwv-zw' },
  { patroon: /bijstand|Participatiewet/i, standaard: 'gem-bijstand' },
  { patroon: /\bWmo\b|maatwerkvoorziening/i, standaard: 'gem-wmo' },
  { patroon: /jeugdhulp|Jeugdwet/i, standaard: 'gem-jeugdwet' },
  { patroon: /schuldhulp/i, standaard: 'gem-schuldhulp' },
  { patroon: /studiefinanciering|studieschuld/i, standaard: 'duo-studiefinanciering' },
  { patroon: /\bAOW\b|kinderbijslag|\bAKW\b/i, standaard: 'svb-aow' },
  { patroon: /toeslag/i, standaard: 'bel-toeslag' },
];

/** Ontvangstbevestiging, verlenging of een genomen beslissing? */
function bepaalSoort(tekst) {
  if (/meer tijd nodig|verleng(en|d|t)?\s+(wij\s+)?de\s+beslistermijn|beslistermijn\s+(is\s+)?verlengd|uitstel/i.test(tekst)) {
    return 'verlenging';
  }
  if (/(hebben|is er)\s+(een\s+)?beslissing\s+genomen|betreft:\s*beslissing|wij hebben besloten|toegekend per|afgewezen/i.test(tekst)) {
    return 'beslissing';
  }
  if (/ontvang(st|en)|hebben wij uw (aanvraag|bezwaarschrift)/i.test(tekst)) {
    return 'ontvangstbevestiging';
  }
  return 'onbekend';
}

function zoekNaam(regels) {
  for (let i = 0; i < regels.length; i += 1) {
    const match = /^(?:de\s+heer|mevrouw|dhr\.?|mevr\.?|mw\.?)\s+(.{2,60})$/i.exec(regels[i].trim());
    if (match) return { naam: match[1].trim(), regel: i };
  }
  for (let i = 0; i < regels.length; i += 1) {
    const match = /^geachte\s+(?:heer|mevrouw)\s+([A-Z][^,]{1,40}),/i.exec(regels[i].trim());
    if (match) return { naam: match[1].trim(), regel: -1 };
  }
  return { naam: null, regel: -1 };
}

/** Het adresblok staat direct onder de naam van de geadresseerde. */
function zoekAdres(regels, naamRegel) {
  if (naamRegel < 0) return { adres: null, postcode: null, woonplaats: null };
  for (let i = naamRegel + 1; i < Math.min(naamRegel + 4, regels.length); i += 1) {
    const postcodeMatch = /^(\d{4}\s?[A-Z]{2})\s+(.{2,40})$/.exec(regels[i].trim());
    if (postcodeMatch) {
      const straat = regels[i - 1] && regels[i - 1].trim() !== '' && i - 1 > naamRegel
        ? regels[i - 1].trim() : null;
      return {
        adres: straat,
        postcode: postcodeMatch[1].trim(),
        woonplaats: postcodeMatch[2].trim(),
      };
    }
  }
  return { adres: null, postcode: null, woonplaats: null };
}

function zoekKenmerk(tekst) {
  const match = /(?:ons kenmerk|uw kenmerk|zaaknummer|kenmerk|dossiernummer)\s*[:\-]\s*([^\n]{2,60})/i.exec(tekst);
  return match ? match[1].trim() : null;
}

function zoekBsn(tekst) {
  const match = /(?:burgerservicenummer|\bbsn\b)\s*[:\-]?\s*(\d{8,9})/i.exec(tekst);
  return match ? match[1] : null;
}

function zoekGemeente(tekst) {
  // Brieven schrijven zowel "Gemeente Zwolle" als "de gemeente Zwolle", en de
  // naam kan uit meer woorden bestaan. Eerst de samengestelde vormen zoeken en
  // pas daarna een los woord; anders wordt de regel eronder ("Afdeling Werk en
  // Inkomen") als deel van de naam gelezen. Geen \s in de patronen, want dat
  // zou over de regelovergang heen stappen.
  const samengesteld = /[Gg]emeente[^\S\n]+((?:Den|Sint)[^\S\n]+[A-Z][\w'-]+|'s-[A-Z][\w'-]+|[A-Z][\w'-]+[^\S\n]+(?:aan|op)[^\S\n]+(?:den[^\S\n]+|de[^\S\n]+)?[A-Z][\w'-]+)/;
  const enkel = /[Gg]emeente[^\S\n]+([A-Z][\w'-]+)/;

  const match = samengesteld.exec(tekst) || enkel.exec(tekst);
  return match ? `Gemeente ${match[1].replace(/\s+/g, ' ').trim()}` : null;
}

/**
 * @param {string} ruweTekst
 * @returns {object} herkende velden met per veld hoe zeker wij zijn
 */
export function herkenBrief(ruweTekst) {
  const tekst = String(ruweTekst || '').replace(/\r/g, '');
  const regels = tekst.split('\n').map((r) => r.trim());
  const zekerheid = {};
  const noteer = (veld, waarde, niveau) => {
    if (waarde) zekerheid[veld] = niveau;
    return waarde;
  };

  if (tekst.trim().length < 40) {
    return { leesbaar: false, reden: 'Er staat te weinig tekst in dit bestand om iets te herkennen.', zekerheid };
  }

  const instantie = INSTANTIES.find((i) => i.patroon.test(tekst)) || null;
  const bestuursorgaan = instantie ? instantie.id : null;

  let zaaktype = null;
  for (const kandidaat of ZAAKTYPEN) {
    if (!kandidaat.patroon.test(tekst)) continue;
    zaaktype = (kandidaat.bijInstantie && kandidaat.bijInstantie[bestuursorgaan]) || kandidaat.standaard;
    break;
  }

  const soort = bepaalSoort(tekst);
  const { naam, regel } = zoekNaam(regels);
  const adresgegevens = zoekAdres(regels, regel);

  // De uiterste beslisdatum is het belangrijkste gegeven uit de brief. Een
  // verlengingsbrief noemt eerst de oude en dan de nieuwe datum; dan telt de
  // laatste, want dat is de termijn die nu geldt.
  const uiterlijkDatums = datumsBij(tekst, 'uiterlijk');
  const beslisdatum = (soort === 'verlenging'
    ? uiterlijkDatums.at(-1)
    : uiterlijkDatums[0])
    || datumBij(tekst, 'dat betekent dat u')
    || datumBij(tekst, 'beslissing\\s+(?:van ons\\s+)?(?:voor|op)');

  const aanvraagdatum = datumBij(tekst, '(?:aanvraag|bezwaarschrift)[^.]{0,80}?ontvangen op')
    || datumBij(tekst, 'ontvangen op')
    || datumVoor(tekst, 'hebben wij uw (?:aanvraag|bezwaarschrift)')
    || datumVoor(tekst, '(?:aanvraag|bezwaarschrift)[^.]{0,60}?ontvangen');

  const briefdatumMatch = /datum\s*[:\-]?\s*(\d{1,2}\s+\w+\s+\d{4})/i.exec(tekst);
  const briefdatum = briefdatumMatch
    ? naarIso(DATUM.exec(briefdatumMatch[1]))
    : naarIso(DATUM_GLOBAAL.exec(tekst));

  const organisatienaam = bestuursorgaan === 'gemeente'
    ? zoekGemeente(tekst)
    : (instantie ? instantie.naam : null);

  return {
    leesbaar: true,
    soortBrief: soort,
    bestuursorgaan: noteer('bestuursorgaan', bestuursorgaan, instantie ? 'hoog' : 'laag'),
    organisatienaam: noteer('organisatienaam', organisatienaam, 'hoog'),
    zaaktype: noteer('zaaktype', zaaktype, zaaktype ? 'hoog' : 'laag'),
    naam: noteer('naam', naam, regel >= 0 ? 'hoog' : 'laag'),
    adres: noteer('adres', adresgegevens.adres, 'hoog'),
    postcode: noteer('postcode', adresgegevens.postcode, 'hoog'),
    woonplaats: noteer('woonplaats', adresgegevens.woonplaats, 'hoog'),
    kenmerk: noteer('kenmerk', zoekKenmerk(tekst), 'hoog'),
    bsn: noteer('bsn', zoekBsn(tekst), 'hoog'),
    beslisdatum: noteer('beslisdatum', beslisdatum, 'hoog'),
    aanvraagdatum: noteer('aanvraagdatum', aanvraagdatum, 'hoog'),
    briefdatum: noteer('briefdatum', briefdatum, 'laag'),
    zekerheid,
  };
}

/**
 * Zet de herkende brief om in invoer voor de rekenkern.
 *
 * De datum die de instantie zelf noemt is leidend; onze standaardtermijnen
 * zijn alleen de terugval als de brief er geen noemt. Een verlengingsbrief
 * schuift die datum op, een beslissing sluit de zaak.
 */
export function naarInvoer(herkenning = {}) {
  const verlengd = herkenning.soortBrief === 'verlenging';
  const beslist = herkenning.soortBrief === 'beslissing';

  return {
    bestuursorgaan: herkenning.bestuursorgaan || '',
    organisatienaam: herkenning.organisatienaam || '',
    zaaktype: herkenning.zaaktype || '',
    basisdatum: herkenning.aanvraagdatum || herkenning.briefdatum || '',
    termijnBekend: Boolean(herkenning.beslisdatum),
    termijnEinddatum: herkenning.beslisdatum || '',
    verdaagd: verlengd,
    verdagingEinddatum: verlengd ? (herkenning.beslisdatum || '') : '',
    besluitGenomen: beslist,
    besluitDatum: beslist ? (herkenning.briefdatum || '') : '',
  };
}

/** Wat is er herkend en wat niet - voor de uitleg aan de aanvrager. */
export function herkendeVelden(herkenning) {
  const belangrijk = ['bestuursorgaan', 'zaaktype', 'beslisdatum', 'naam', 'kenmerk'];
  return {
    gevonden: belangrijk.filter((veld) => herkenning[veld]),
    ontbreekt: belangrijk.filter((veld) => !herkenning[veld]),
  };
}
