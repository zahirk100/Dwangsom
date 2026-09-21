/**
 * Rekenmodule dwangsom bij niet tijdig beslissen.
 *
 * Wettelijk kader: Algemene wet bestuursrecht, afdeling 4.1.3.2 (art. 4:17
 * t/m 4:20). Via art. 7:14 geldt dezelfde regeling voor beslissingen op
 * bezwaar. De regeling is landelijk: UWV, gemeente en ieder ander
 * bestuursorgaan vallen eronder.
 *
 * Stappen waar deze module op rekent:
 *   1. Er is een aanvraag (of bezwaarschrift) ingediend.
 *   2. De beslistermijn is verstreken.
 *   3. De aanvrager heeft het bestuursorgaan schriftelijk in gebreke gesteld.
 *   4. Het bestuursorgaan krijgt daarna twee weken om alsnog te beslissen.
 *   5. Gebeurt dat niet, dan loopt de dwangsom, maximaal 42 dagen.
 *
 * Deze module wordt zowel in de browser als op de server uitgevoerd. De
 * server rekent bij indiening altijd opnieuw; clientinvoer is nooit leidend.
 */

import { formatDatum, parseDatum, plusDagen, toonDatum, vandaag, verschilDagen } from './datum.js';
import { TERMIJN_VANAF, zoekZaaktype } from './catalogus.js';

/**
 * Tarief van art. 4:17 lid 2 Awb.
 * De tranches tellen op tot precies het wettelijk maximum:
 * 14 x 23 + 14 x 35 + 14 x 45 = 1442.
 */
export const TARIEF = {
  tranches: [
    { dagen: 14, perDag: 23 },
    { dagen: 14, perDag: 35 },
    { dagen: 14, perDag: 45 },
  ],
  maxDagen: 42,
  maxBedrag: 1442,
  grondslag: 'Awb art. 4:17 lid 2',
};

/** Aantal dagen dat het bestuursorgaan na de ingebrekestelling krijgt (art. 4:17 lid 3). */
export const HERSTELTERMIJN_DAGEN = 14;

/** Na hoeveel dagen een ingebrekestelling in beginsel als 'onredelijk laat' geldt (art. 4:17 lid 6 sub a). */
export const ONREDELIJK_LAAT_DAGEN = 365;

/**
 * Wat voor dossier een uitkomst oplevert. De aanvrager die nog niet kan
 * claimen wordt niet weggestuurd: die doet een vooraanmelding, en wij
 * bewaken de datum waarop er iets moet gebeuren.
 */
export const DOSSIERSOORT = {
  AANVRAAG: 'aanvraag',            // er is iets te vorderen, nu
  VOORAANMELDING: 'vooraanmelding', // nog niet, maar de klok loopt
  BEOORDELING: 'beoordeling',       // waarschijnlijk geen recht; wij kijken mee
};

export const UITKOMST = {
  GEEN_RECHT: 'geen-recht',
  TERMIJN_LOOPT: 'termijn-loopt',
  INGEBREKESTELLING_NODIG: 'ingebrekestelling-nodig',
  HERSTELTERMIJN_LOOPT: 'hersteltermijn-loopt',
  RECHT: 'recht',
};

/**
 * Bedrag over een aantal dwangsomdagen, opgesplitst per tranche.
 * @param {number} dagen
 * @returns {{totaal:number, tranches:Array<{nummer:number,dagen:number,perDag:number,bedrag:number}>}}
 */
export function bedragOverDagen(dagen) {
  let resterend = Math.max(0, Math.min(Math.floor(dagen), TARIEF.maxDagen));
  let totaal = 0;
  const tranches = [];
  TARIEF.tranches.forEach((tranche, i) => {
    const inDezeTranche = Math.min(resterend, tranche.dagen);
    if (inDezeTranche > 0) {
      const bedrag = inDezeTranche * tranche.perDag;
      tranches.push({ nummer: i + 1, dagen: inDezeTranche, perDag: tranche.perDag, bedrag });
      totaal += bedrag;
      resterend -= inDezeTranche;
    }
  });
  return { totaal: Math.min(totaal, TARIEF.maxBedrag), tranches };
}

/** Op welke dag is het maximum van 42 dagen bereikt, gerekend vanaf de eerste dwangsomdag? */
export function laatsteDwangsomdag(eersteDag) {
  return plusDagen(eersteDag, TARIEF.maxDagen - 1);
}

function blokkade(code, titel, uitleg) {
  return { code, titel, uitleg };
}

function normaliseerInvoer(ruw = {}) {
  const zaaktype = zoekZaaktype(ruw.zaaktype);
  return {
    bestuursorgaan: typeof ruw.bestuursorgaan === 'string' ? ruw.bestuursorgaan : (zaaktype ? zaaktype.bestuursorgaan : ''),
    organisatienaam: typeof ruw.organisatienaam === 'string' ? ruw.organisatienaam.trim().slice(0, 120) : '',
    zaaktype: zaaktype ? zaaktype.id : '',
    basisdatum: parseDatum(ruw.basisdatum),
    adviescommissie: Boolean(ruw.adviescommissie),
    termijnBekend: Boolean(ruw.termijnBekend),
    termijnEinddatum: parseDatum(ruw.termijnEinddatum),
    verdaagd: Boolean(ruw.verdaagd),
    verdagingEinddatum: parseDatum(ruw.verdagingEinddatum),
    opschortingDagen: Number.isFinite(Number(ruw.opschortingDagen))
      ? Math.max(0, Math.min(365, Math.round(Number(ruw.opschortingDagen))))
      : 0,
    ingebrekeGesteld: Boolean(ruw.ingebrekeGesteld),
    ingebrekestellingDatum: parseDatum(ruw.ingebrekestellingDatum),
    besluitGenomen: Boolean(ruw.besluitGenomen),
    besluitDatum: parseDatum(ruw.besluitDatum),
    geenBelanghebbende: Boolean(ruw.geenBelanghebbende),
    buitenBehandeling: Boolean(ruw.buitenBehandeling),
    wooVerzoek: Boolean(ruw.wooVerzoek),
    asielzaak: Boolean(ruw.asielzaak),
    peildatum: parseDatum(ruw.peildatum) ?? vandaag(),
  };
}

/**
 * Hoofdfunctie. Geeft een volledig rapport terug: uitkomst, tijdlijn, bedrag
 * en wat er vervolgens moet gebeuren.
 */
export function berekenDwangsom(ruweInvoer = {}) {
  const rapport = bepaalRapport(ruweInvoer);
  rapport.vervolg = bepaalVervolg(rapport);
  return rapport;
}

/**
 * Vertaalt de uitkomst naar het soort dossier en de datum die bewaakt moet
 * worden. Dat is wat de beheeromgeving nodig heeft om te weten wanneer er
 * actie nodig is, en wat de aanvrager te zien krijgt als knop.
 */
function bepaalVervolg(rapport) {
  const leeg = { soort: null, kanNuIndienen: false, actiedatum: null, actieLabel: '', actieUitleg: '' };
  if (rapport.onvolledig || !rapport.uitkomst) return leeg;

  const berekening = rapport.berekening;
  const eindeTermijn = rapport.beslistermijn ? parseDatum(rapport.beslistermijn.einddatum) : null;

  switch (rapport.uitkomst) {
    case UITKOMST.RECHT:
      // Er valt nu iets te vorderen, dus dit dossier is vandaag aan de beurt.
      return {
        soort: DOSSIERSOORT.AANVRAAG,
        kanNuIndienen: true,
        actiedatum: formatDatum(rapport.invoer.peildatum),
        actieLabel: 'Dwangsom vorderen',
        actieUitleg: berekening && berekening.doorlopend
          ? `Het bedrag loopt nog op tot ${toonDatum(parseDatum(berekening.maximumOp))}; eerder vorderen kan wel.`
          : 'Het bedrag staat vast en kan gevorderd worden.',
      };

    case UITKOMST.HERSTELTERMIJN_LOOPT:
      return {
        soort: DOSSIERSOORT.VOORAANMELDING,
        kanNuIndienen: false,
        actiedatum: berekening ? berekening.eersteDag : null,
        actieLabel: 'Eerste dwangsomdag',
        actieUitleg: 'Vanaf deze dag telt de dwangsom en kunnen wij vorderen.',
      };

    case UITKOMST.INGEBREKESTELLING_NODIG:
      return {
        soort: DOSSIERSOORT.VOORAANMELDING,
        kanNuIndienen: false,
        actiedatum: formatDatum(rapport.invoer.peildatum),
        actieLabel: 'Ingebrekestelling versturen',
        actieUitleg: 'De beslistermijn is verstreken; dit kan direct.',
      };

    case UITKOMST.TERMIJN_LOOPT:
      return {
        soort: DOSSIERSOORT.VOORAANMELDING,
        kanNuIndienen: false,
        actiedatum: eindeTermijn ? formatDatum(plusDagen(eindeTermijn, 1)) : null,
        actieLabel: 'Beslistermijn verstreken',
        actieUitleg: 'Vanaf deze dag kan het bestuursorgaan in gebreke worden gesteld.',
      };

    default:
      return {
        soort: DOSSIERSOORT.BEOORDELING,
        kanNuIndienen: false,
        actiedatum: null,
        actieLabel: 'Handmatig beoordelen',
        actieUitleg: 'De automatische toets ziet geen recht; een mens kijkt ernaar.',
      };
  }
}

function bepaalRapport(ruweInvoer = {}) {
  const invoer = normaliseerInvoer(ruweInvoer);
  const zaaktype = zoekZaaktype(invoer.zaaktype);
  const waarschuwingen = [];
  const blokkades = [];
  const tijdlijn = [];
  const peildatum = invoer.peildatum;

  const rapport = {
    invoer: { ...invoer, ...datumsAlsTekst(invoer) },
    zaaktype: zaaktype
      ? { id: zaaktype.id, label: zaaktype.label, grondslag: zaaktype.grondslag, zekerheid: zaaktype.zekerheid }
      : null,
    uitkomst: UITKOMST.GEEN_RECHT,
    kop: '',
    samenvatting: '',
    blokkades,
    waarschuwingen,
    tijdlijn,
    berekening: null,
    volgendeStappen: [],
    tarief: TARIEF,
  };

  // --- Stap 0: kan er überhaupt gerekend worden? --------------------------
  if (!zaaktype) {
    rapport.kop = 'Kies eerst een soort aanvraag';
    rapport.samenvatting = 'Zonder soort aanvraag kan de beslistermijn niet worden bepaald.';
    rapport.onvolledig = true;
    return rapport;
  }
  if (!invoer.basisdatum) {
    rapport.kop = 'Vul eerst de datum van uw aanvraag in';
    rapport.samenvatting = 'De beslistermijn wordt vanaf die datum geteld.';
    rapport.onvolledig = true;
    return rapport;
  }
  if (invoer.basisdatum > peildatum) {
    rapport.kop = 'Datum ligt in de toekomst';
    rapport.samenvatting = 'Controleer de ingevulde datum.';
    rapport.onvolledig = true;
    return rapport;
  }

  // --- Stap 1: harde uitsluitingen ---------------------------------------
  if (invoer.wooVerzoek) {
    blokkades.push(blokkade(
      'woo',
      'Bij een Woo-verzoek geldt geen dwangsom',
      'Sinds 1 mei 2022 is de dwangsomregeling uitgesloten voor verzoeken op grond van de Wet open overheid. U kunt wel direct beroep instellen bij de rechtbank wegens niet tijdig beslissen.',
    ));
  }
  if (invoer.asielzaak) {
    blokkades.push(blokkade(
      'asiel',
      'Bij asielaanvragen geldt geen dwangsom',
      'Voor asielaanvragen is de dwangsomregeling uitgeschakeld. De route loopt via beroep bij niet tijdig beslissen bij de rechtbank.',
    ));
  }
  if (invoer.geenBelanghebbende) {
    blokkades.push(blokkade(
      'belanghebbende',
      'Alleen de aanvrager of belanghebbende heeft recht op een dwangsom',
      'Art. 4:17 lid 6 sub b Awb sluit de dwangsom uit als u geen belanghebbende bent bij het besluit.',
    ));
  }
  if (invoer.buitenBehandeling) {
    blokkades.push(blokkade(
      'buiten-behandeling',
      'De aanvraag is buiten behandeling gesteld',
      'Een besluit om de aanvraag niet te behandelen (art. 4:5 Awb) is ook een besluit. Daarmee is op tijd beslist. Wel kunt u tegen dat besluit bezwaar maken.',
    ));
  }

  if (blokkades.length > 0) {
    rapport.uitkomst = UITKOMST.GEEN_RECHT;
    rapport.kop = 'Waarschijnlijk geen recht op een dwangsom';
    rapport.samenvatting = blokkades[0].titel + '.';
    rapport.volgendeStappen = [
      'U kunt uw situatie alsnog laten beoordelen; wij kijken of er een andere route is, bijvoorbeeld beroep bij niet tijdig beslissen.',
    ];
    return rapport;
  }

  // --- Stap 2: einde beslistermijn ---------------------------------------
  const termijn = bepaalBeslistermijn(invoer, zaaktype);
  const eindeTermijn = termijn.einddatum;
  rapport.beslistermijn = {
    einddatum: formatDatum(eindeTermijn),
    bron: termijn.bron,
    uitleg: termijn.uitleg,
    startdatum: formatDatum(termijn.startdatum),
  };

  tijdlijn.push({
    sleutel: 'aanvraag',
    label: zaaktype.termijnVanaf === TERMIJN_VANAF.BEZWAARTERMIJN
      ? 'Datum van het besluit waartegen u bezwaar maakte'
      : 'Aanvraag ontvangen',
    datum: formatDatum(invoer.basisdatum),
    status: 'gehaald',
  });
  if (zaaktype.termijnVanaf === TERMIJN_VANAF.BEZWAARTERMIJN) {
    tijdlijn.push({
      sleutel: 'bezwaartermijn',
      label: 'Einde bezwaartermijn (zes weken)',
      datum: formatDatum(termijn.startdatum),
      status: termijn.startdatum <= peildatum ? 'gehaald' : 'toekomst',
    });
  }
  tijdlijn.push({
    sleutel: 'beslistermijn',
    label: 'Einde beslistermijn',
    datum: formatDatum(eindeTermijn),
    toelichting: termijn.uitleg,
    status: eindeTermijn < peildatum ? 'gehaald' : 'toekomst',
  });

  if (invoer.besluitGenomen && invoer.besluitDatum && invoer.besluitDatum <= eindeTermijn) {
    rapport.uitkomst = UITKOMST.GEEN_RECHT;
    rapport.kop = 'Er is binnen de beslistermijn beslist';
    rapport.samenvatting = `Het besluit van ${toonDatum(invoer.besluitDatum)} viel binnen de termijn die liep tot en met ${toonDatum(eindeTermijn)}. Dan is geen dwangsom verschuldigd.`;
    blokkades.push(blokkade('op-tijd', 'Op tijd beslist', 'Er is beslist binnen de beslistermijn.'));
    return rapport;
  }

  if (eindeTermijn >= peildatum) {
    const resterend = verschilDagen(peildatum, eindeTermijn) + 1;
    rapport.uitkomst = UITKOMST.TERMIJN_LOOPT;
    rapport.kop = 'De beslistermijn loopt nog';
    rapport.samenvatting = `Het bestuursorgaan heeft nog tot en met ${toonDatum(eindeTermijn)} de tijd (${resterend} ${resterend === 1 ? 'dag' : 'dagen'}). Pas daarna kunt u in gebreke stellen.`;
    rapport.vooruitblik = vooruitblikVanafIngebrekestelling(plusDagen(eindeTermijn, 1));
    rapport.volgendeStappen = [
      `Wacht tot ${toonDatum(eindeTermijn)}.`,
      'Is er dan nog geen besluit? Stel het bestuursorgaan schriftelijk in gebreke.',
      'Wij kunnen die ingebrekestelling voor u opstellen en versturen.',
    ];
    return rapport;
  }

  const dagenTeLaat = verschilDagen(eindeTermijn, peildatum);

  // --- Stap 3: ingebrekestelling -----------------------------------------
  if (!invoer.ingebrekeGesteld) {
    const fictieveIgs = peildatum;
    rapport.uitkomst = UITKOMST.INGEBREKESTELLING_NODIG;
    rapport.kop = 'De termijn is verstreken: stel eerst in gebreke';
    rapport.samenvatting = `De beslistermijn is op ${toonDatum(eindeTermijn)} verstreken, ${dagenTeLaat} ${dagenTeLaat === 1 ? 'dag' : 'dagen'} geleden. De dwangsom gaat pas lopen nadat u het bestuursorgaan schriftelijk in gebreke heeft gesteld en er daarna twee weken zijn verstreken.`;
    rapport.vooruitblik = vooruitblikVanafIngebrekestelling(fictieveIgs);
    rapport.volgendeStappen = [
      'Stel het bestuursorgaan schriftelijk in gebreke. Bewaar het bewijs van verzending.',
      'Het bestuursorgaan krijgt daarna twee weken om alsnog te beslissen.',
      'Blijft een besluit uit, dan loopt de dwangsom automatisch op tot maximaal € 1.442.',
      'Dien uw aanvraag bij ons in: wij stellen de ingebrekestelling op, versturen die en bewaken de termijnen.',
    ];
    if (dagenTeLaat > ONREDELIJK_LAAT_DAGEN) {
      waarschuwingen.push({
        code: 'onredelijk-laat',
        titel: 'Let op: mogelijk te lang gewacht',
        uitleg: 'De beslistermijn is meer dan een jaar geleden verstreken. Een ingebrekestelling die onredelijk laat komt, geeft volgens art. 4:17 lid 6 sub a Awb geen recht op een dwangsom. Wacht daarom niet langer.',
      });
    }
    return rapport;
  }

  if (!invoer.ingebrekestellingDatum) {
    rapport.kop = 'Vul de datum van de ingebrekestelling in';
    rapport.samenvatting = 'Zonder die datum kan de dwangsom niet worden berekend.';
    rapport.onvolledig = true;
    return rapport;
  }

  if (invoer.ingebrekestellingDatum <= eindeTermijn) {
    waarschuwingen.push({
      code: 'prematuur',
      titel: 'Ingebrekestelling mogelijk te vroeg verstuurd',
      uitleg: `U heeft in gebreke gesteld op ${toonDatum(invoer.ingebrekestellingDatum)}, terwijl de beslistermijn liep tot en met ${toonDatum(eindeTermijn)}. Een ingebrekestelling vóór het einde van de termijn is prematuur en telt meestal niet mee. In de berekening hieronder rekenen wij daarom vanaf het einde van de beslistermijn. Veilig is om opnieuw in gebreke te stellen.`,
    });
  }

  if (verschilDagen(eindeTermijn, invoer.ingebrekestellingDatum) > ONREDELIJK_LAAT_DAGEN) {
    waarschuwingen.push({
      code: 'onredelijk-laat',
      titel: 'Ingebrekestelling mogelijk onredelijk laat',
      uitleg: 'Er zit meer dan een jaar tussen het einde van de beslistermijn en uw ingebrekestelling. Het bestuursorgaan kan zich beroepen op art. 4:17 lid 6 sub a Awb. Een beoordeling door ons is dan extra zinvol.',
    });
  }

  // Art. 4:17 lid 3: de twee weken gaan pas lopen als zowel de beslistermijn
  // is verstreken als de ingebrekestelling is ontvangen.
  const startHerstel = Math.max(eindeTermijn, invoer.ingebrekestellingDatum);
  const laatsteHersteldag = plusDagen(startHerstel, HERSTELTERMIJN_DAGEN);
  const eersteDag = plusDagen(startHerstel, HERSTELTERMIJN_DAGEN + 1);
  const uiterlijkLaatsteDag = laatsteDwangsomdag(eersteDag);

  tijdlijn.push({
    sleutel: 'ingebrekestelling',
    label: 'Ingebrekestelling ontvangen',
    datum: formatDatum(invoer.ingebrekestellingDatum),
    status: 'gehaald',
  });
  tijdlijn.push({
    sleutel: 'herstel',
    label: 'Laatste dag om alsnog te beslissen',
    datum: formatDatum(laatsteHersteldag),
    toelichting: 'Twee weken na de ingebrekestelling (art. 4:17 lid 3 Awb).',
    status: laatsteHersteldag < peildatum ? 'gehaald' : 'toekomst',
  });
  tijdlijn.push({
    sleutel: 'eerste-dwangsomdag',
    label: 'Eerste dag waarover dwangsom verschuldigd is',
    datum: formatDatum(eersteDag),
    status: eersteDag <= peildatum ? 'gehaald' : 'toekomst',
  });
  tijdlijn.push({
    sleutel: 'maximum',
    label: 'Maximum van 42 dagen bereikt',
    datum: formatDatum(uiterlijkLaatsteDag),
    toelichting: `Daarna loopt de dwangsom niet verder op dan € ${TARIEF.maxBedrag.toLocaleString('nl-NL')}.`,
    status: uiterlijkLaatsteDag < peildatum ? 'gehaald' : 'toekomst',
  });

  if (invoer.besluitGenomen && invoer.besluitDatum) {
    tijdlijn.push({
      sleutel: 'besluit',
      label: 'Besluit genomen',
      datum: formatDatum(invoer.besluitDatum),
      status: 'gehaald',
    });
    if (invoer.besluitDatum <= laatsteHersteldag) {
      rapport.uitkomst = UITKOMST.GEEN_RECHT;
      rapport.kop = 'Alsnog beslist binnen twee weken';
      rapport.samenvatting = `Het besluit van ${toonDatum(invoer.besluitDatum)} viel binnen de twee weken na uw ingebrekestelling. Dan is geen dwangsom verschuldigd (art. 4:17 lid 3 Awb).`;
      blokkades.push(blokkade('binnen-herstel', 'Binnen de hersteltermijn beslist', 'Het bestuursorgaan heeft de gelegenheid benut die de ingebrekestelling gaf.'));
      return rapport;
    }
  }

  if (peildatum < eersteDag) {
    const resterend = verschilDagen(peildatum, laatsteHersteldag) + 1;
    rapport.uitkomst = UITKOMST.HERSTELTERMIJN_LOOPT;
    rapport.kop = 'De twee weken na uw ingebrekestelling lopen nog';
    rapport.samenvatting = `Het bestuursorgaan heeft nog tot en met ${toonDatum(laatsteHersteldag)} om te beslissen (${resterend} ${resterend === 1 ? 'dag' : 'dagen'}). Komt er geen besluit, dan is vanaf ${toonDatum(eersteDag)} een dwangsom verschuldigd.`;
    rapport.berekening = maakBerekening({ eersteDag, laatsteDag: null, dagen: 0, doorlopend: true, uiterlijkLaatsteDag });
    rapport.vooruitblik = {
      eersteDag: formatDatum(eersteDag),
      maximumOp: formatDatum(uiterlijkLaatsteDag),
      maximumBedrag: TARIEF.maxBedrag,
    };
    rapport.volgendeStappen = [
      `Noteer ${toonDatum(eersteDag)}: vanaf die dag telt de dwangsom.`,
      'Dien uw aanvraag nu alvast bij ons in, dan bewaken wij de datum en claimen wij direct.',
    ];
    return rapport;
  }

  // --- Stap 4: bedrag ----------------------------------------------------
  const einddatumTelling = invoer.besluitGenomen && invoer.besluitDatum
    ? Math.min(plusDagen(invoer.besluitDatum, -1), uiterlijkLaatsteDag)
    : Math.min(peildatum, uiterlijkLaatsteDag);
  const dagen = Math.max(0, verschilDagen(eersteDag, einddatumTelling) + 1);
  const doorlopend = !invoer.besluitGenomen && einddatumTelling < uiterlijkLaatsteDag;

  rapport.uitkomst = UITKOMST.RECHT;
  rapport.berekening = maakBerekening({
    eersteDag,
    laatsteDag: einddatumTelling,
    dagen,
    doorlopend,
    uiterlijkLaatsteDag,
  });

  const bedragTekst = euro(rapport.berekening.totaal);
  rapport.kop = `Mogelijk recht op ${bedragTekst}`;
  rapport.samenvatting = doorlopend
    ? `Op ${toonDatum(peildatum)} staat de teller op ${dagen} ${dagen === 1 ? 'dag' : 'dagen'}: ${bedragTekst}. Zolang er geen besluit komt, loopt dit op tot maximaal ${euro(TARIEF.maxBedrag)} op ${toonDatum(uiterlijkLaatsteDag)}.`
    : `Het bestuursorgaan is een dwangsom verschuldigd van ${bedragTekst}, berekend over ${dagen} ${dagen === 1 ? 'dag' : 'dagen'}.`;

  rapport.volgendeStappen = [
    'Dien uw aanvraag bij ons in. Wij controleren de stukken en de data.',
    'Wij vorderen de dwangsom bij het bestuursorgaan; het moet de hoogte binnen twee weken bij beschikking vaststellen (art. 4:18 Awb).',
    'Blijft het besluit uit, dan kunnen wij beroep instellen bij de rechtbank wegens niet tijdig beslissen (art. 6:12 Awb).',
  ];

  if (invoer.opschortingDagen > 0) {
    waarschuwingen.push({
      code: 'opschorting',
      titel: 'Opschorting meegerekend',
      uitleg: `Er is ${invoer.opschortingDagen} ${invoer.opschortingDagen === 1 ? 'dag' : 'dagen'} opschorting meegerekend (art. 4:15 Awb). Verschilt dat met wat het bestuursorgaan zegt, dan verschuift de hele berekening mee.`,
    });
  }

  return rapport;
}

function maakBerekening({ eersteDag, laatsteDag, dagen, doorlopend, uiterlijkLaatsteDag }) {
  const { totaal, tranches } = bedragOverDagen(dagen);
  const opbouw = tranches.map((t) => {
    const startOffset = TARIEF.tranches
      .slice(0, t.nummer - 1)
      .reduce((som, x) => som + x.dagen, 0);
    return {
      ...t,
      van: formatDatum(plusDagen(eersteDag, startOffset)),
      tot: formatDatum(plusDagen(eersteDag, startOffset + t.dagen - 1)),
    };
  });
  return {
    eersteDag: formatDatum(eersteDag),
    laatsteDag: laatsteDag === null ? null : formatDatum(laatsteDag),
    dagen,
    totaal,
    opbouw,
    doorlopend,
    maximumBereikt: dagen >= TARIEF.maxDagen,
    maximumOp: formatDatum(uiterlijkLaatsteDag),
    maximumBedrag: TARIEF.maxBedrag,
  };
}

/** Wat kan iemand opbouwen als vandaag in gebreke wordt gesteld? */
function vooruitblikVanafIngebrekestelling(igsDatum) {
  const eersteDag = plusDagen(igsDatum, HERSTELTERMIJN_DAGEN + 1);
  return {
    ingebrekestellingOp: formatDatum(igsDatum),
    laatsteHersteldag: formatDatum(plusDagen(igsDatum, HERSTELTERMIJN_DAGEN)),
    eersteDag: formatDatum(eersteDag),
    maximumOp: formatDatum(laatsteDwangsomdag(eersteDag)),
    maximumBedrag: TARIEF.maxBedrag,
  };
}

function bepaalBeslistermijn(invoer, zaaktype) {
  if (invoer.termijnBekend && invoer.termijnEinddatum) {
    let einddatum = invoer.termijnEinddatum;
    let uitleg = 'Datum die het bestuursorgaan zelf heeft genoemd.';
    if (invoer.verdaagd && invoer.verdagingEinddatum && invoer.verdagingEinddatum > einddatum) {
      einddatum = invoer.verdagingEinddatum;
      uitleg = 'Datum uit de verdagingsbrief van het bestuursorgaan.';
    }
    if (invoer.opschortingDagen > 0) {
      einddatum = plusDagen(einddatum, invoer.opschortingDagen);
      uitleg += ` Verlengd met ${invoer.opschortingDagen} dagen opschorting (art. 4:15 Awb).`;
    }
    return { einddatum, startdatum: invoer.basisdatum, bron: 'opgave-bestuursorgaan', uitleg };
  }

  const startdatum = zaaktype.termijnVanaf === TERMIJN_VANAF.BEZWAARTERMIJN
    ? plusDagen(invoer.basisdatum, 42)
    : invoer.basisdatum;

  let dagen = zaaktype.termijnDagen;
  let uitleg = `Standaardtermijn: ${weken(dagen)}. ${zaaktype.grondslag}.`;
  if (zaaktype.vraagAdviescommissie && invoer.adviescommissie && zaaktype.termijnMetAdviescommissieDagen) {
    dagen = zaaktype.termijnMetAdviescommissieDagen;
    uitleg = `Termijn met adviescommissie: ${weken(dagen)}. ${zaaktype.grondslag}.`;
  }

  let einddatum = plusDagen(startdatum, dagen);
  if (invoer.verdaagd) {
    if (invoer.verdagingEinddatum && invoer.verdagingEinddatum > einddatum) {
      einddatum = invoer.verdagingEinddatum;
      uitleg += ' Verdaagd tot de datum uit de verdagingsbrief.';
    } else if (zaaktype.verdagingDagen) {
      einddatum = plusDagen(einddatum, zaaktype.verdagingDagen);
      uitleg += ` Verdaagd met ${weken(zaaktype.verdagingDagen)} (art. 7:10 lid 3 Awb).`;
    }
  }
  if (invoer.opschortingDagen > 0) {
    einddatum = plusDagen(einddatum, invoer.opschortingDagen);
    uitleg += ` Verlengd met ${invoer.opschortingDagen} dagen opschorting (art. 4:15 Awb).`;
  }
  return { einddatum, startdatum, bron: 'standaardtermijn', uitleg };
}

function weken(dagen) {
  return dagen % 7 === 0 ? `${dagen / 7} weken` : `${dagen} dagen`;
}

function datumsAlsTekst(invoer) {
  const velden = ['basisdatum', 'termijnEinddatum', 'verdagingEinddatum', 'ingebrekestellingDatum', 'besluitDatum', 'peildatum'];
  const uit = {};
  for (const veld of velden) {
    uit[veld] = formatDatum(invoer[veld]);
  }
  return uit;
}

export function euro(bedrag) {
  return `€ ${Number(bedrag).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
