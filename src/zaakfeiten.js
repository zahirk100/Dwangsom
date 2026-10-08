/**
 * Wat er op een zaakpagina staat en nergens anders.
 *
 * De aanleiding is een meting, geen smaak. Search Console liet zien dat
 * eenentwintig pagina's wel gevonden maar niet opgenomen waren, en toen
 * /uwv-wia en /jeugdhulp naast elkaar gelegd werden bleken 499 van de 531
 * regels letterlijk gelijk. Dat is geen twintig pagina's maar één pagina in
 * twintig jasjes, en Google neemt daar terecht maar één van op.
 *
 * Wat deze module toevoegt is geen vulling. Het is wat per soort zaak écht
 * verschilt en wat wij al wisten maar niet lieten zien: de beslistermijn, waar
 * die vandaan komt, vanaf welk moment hij loopt, en een voorbeeld dat met
 * precies die termijn is doorgerekend.
 *
 * Twee regels bij het schrijven hiervan. Alles komt uit de catalogus of uit de
 * rekenmotor; er wordt geen wet bedacht die er niet staat. En het voorbeeld
 * rekent met vaste datums, zodat de pagina niet bij elke build verandert - een
 * tekst die elke dag anders is, is voor Google een tekst om te negeren.
 */

import { zoekZaaktype, labelBestuursorgaan, TERMIJN_VANAF } from '../public/shared/catalogus.js';
import { berekenDwangsom, euro, TARIEF, HERSTELTERMIJN_DAGEN } from '../public/shared/dwangsom.js';
import { parseDatum, toonDatum, plusDagen } from '../public/shared/datum.js';

/**
 * De datums van het rekenvoorbeeld.
 *
 * Vast, en met opzet. Zouden ze met vandaag meebewegen, dan verandert de tekst
 * van dertien pagina's elke dag zonder dat er iets gebeurt.
 */
const VOORBEELD_START = '2026-03-02';

/**
 * Hoeveel dagen het in het voorbeeld daarna stil blijft.
 *
 * Verschillende lengtes, en dat is geen opsmuk. Niet elke zaak loopt tot het
 * maximum, en een pagina die alleen het hoogste bedrag laat zien wekt een
 * verwachting die vaker niet dan wel uitkomt. Met een korter voorbeeld zie je
 * bovendien dat het bedrag met de tijd meegroeit.
 */
const STILTES = [14, 21, 30, TARIEF.maxDagen];

/**
 * Een vaste, maar per zaaksoort verschillende keuze.
 *
 * Zouden alle dertien pagina's hetzelfde voorbeeld met dezelfde datums tonen,
 * dan hebben wij dertien pagina's gemaakt die op dat punt weer identiek zijn -
 * precies het probleem dat deze module moet oplossen. De keuze hangt aan de
 * naam van de zaaksoort, dus hij ligt vast en verschuift niet bij een build.
 */
function keuze(sleutel, aantal) {
  let som = 0;
  for (let i = 0; i < sleutel.length; i += 1) som += sleutel.charCodeAt(i);
  return som % aantal;
}

function veilig(tekst) {
  return String(tekst === null || tekst === undefined ? '' : tekst)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Hoe de zaaksoort in een lopende zin heet.
 *
 * Het label uit de catalogus staat in een keuzelijst en leest daar prima, maar
 * in een zin niet: "hoelang mag UWV over wia-uitkering aanvragen of beoordelen
 * doen" is geen Nederlands. Daarom hier een korte omschrijving per soort, met
 * lidwoord, zoals je het zou zeggen.
 */
const ONDERWERP = {
  'uwv-wia': 'een WIA-aanvraag',
  'uwv-wajong': 'een Wajong-aanvraag',
  'uwv-ww': 'een WW-aanvraag',
  'uwv-zw': 'een Ziektewet-aanvraag',
  'uwv-herbeoordeling': 'een herbeoordeling',
  'uwv-bezwaar': 'een bezwaar',
  'gem-bijstand': 'een bijstandsaanvraag',
  'gem-bijzondere-bijstand': 'een aanvraag voor bijzondere bijstand',
  'gem-wmo': 'een Wmo-aanvraag',
  'gem-jeugdwet': 'een aanvraag voor jeugdhulp',
  'gem-schuldhulp': 'een aanvraag voor schuldhulpverlening',
  'gem-parkeervergunning': 'een vergunningaanvraag',
  'gem-bezwaar': 'een bezwaar',
  'duo-studiefinanciering': 'een aanvraag voor studiefinanciering',
  'svb-aow': 'een AOW-aanvraag',
  'bel-toeslag': 'een toeslagaanvraag',
};

/** Hoe de instantie in een zin heet: "je gemeente", niet "Gemeente". */
function instantieInEenZin(id) {
  return { gemeente: 'je gemeente', svb: 'de SVB', belastingdienst: 'de Belastingdienst' }[id]
    || labelBestuursorgaan(id);
}

/** 56 dagen leest als acht weken; 42 als zes. Een rest blijft gewoon dagen. */
function inWeken(dagen) {
  return dagen % 7 === 0 ? `${dagen / 7} weken` : `${dagen} dagen`;
}

/**
 * Alles wat deze zaak anders maakt dan de andere, inclusief een voorbeeld dat
 * met zijn eigen termijn is doorgerekend.
 *
 * @returns {null|object} null voor een pagina zonder eigen zaaksoort
 */
export function zaakFeiten(ingang = {}) {
  const zaaktype = ingang.zaak ? zoekZaaktype(ingang.zaak) : null;
  if (!zaaktype) return null;

  const instantie = instantieInEenZin(zaaktype.bestuursorgaan);
  const onderwerp = ONDERWERP[zaaktype.id] || `een ${zaaktype.label.toLowerCase().replace(/\s*\([^)]*\)/g, '')}`;
  const naBezwaar = zaaktype.termijnVanaf === TERMIJN_VANAF.BEZWAARTERMIJN;

  /*
   * Hetzelfde pad als een echte zaak: aanvraag, termijn voorbij, in gebreke
   * gesteld, en dan loopt de teller. In twee stappen, want wanneer de termijn
   * afloopt kan de motor beter uitrekenen dan wij: bij een bezwaar begint hij
   * pas ná de bezwaartermijn, en dan ligt het einde twaalf weken verderop in
   * plaats van zes. Eerst zelf tellen leverde een voorbeeld op waarin de
   * ingebrekestelling vóór het einde van de termijn lag.
   */
  const start = toISO(plusDagen(parseDatum(VOORBEELD_START), keuze(zaaktype.id, 26)));
  const wachtNaTermijn = 3 + keuze(`${zaaktype.id}-igs`, 12);
  const stilte = STILTES[keuze(`${zaaktype.id}-stil`, STILTES.length)];
  const basis = {
    bestuursorgaan: zaaktype.bestuursorgaan,
    zaaktype: zaaktype.id,
    basisdatum: start,
  };
  const zonder = berekenDwangsom(basis);
  const eindeTermijn = zonder.beslistermijn ? parseDatum(zonder.beslistermijn.einddatum) : null;
  if (eindeTermijn === null) return null;

  const ingebreke = toISO(plusDagen(eindeTermijn, wachtNaTermijn));
  // De peildatum bepaalt hoelang het daarna stil blijft, en daarmee het bedrag.
  const rapport = berekenDwangsom({
    ...basis,
    ingebrekeGesteld: true,
    ingebrekestellingDatum: ingebreke,
    peildatum: toISO(plusDagen(parseDatum(ingebreke), HERSTELTERMIJN_DAGEN + stilte)),
  });

  const einde = rapport.beslistermijn ? rapport.beslistermijn.einddatum : null;
  const b = rapport.berekening;

  return {
    zaaktype,
    instantie,
    onderwerp,
    naBezwaar,
    termijnDagen: zaaktype.termijnDagen,
    termijnTekst: inWeken(zaaktype.termijnDagen),
    grondslag: zaaktype.grondslag,
    wettelijk: zaaktype.zekerheid === 'wettelijk',
    toelichting: String(zaaktype.toelichting || '').trim(),
    voorbeeld: {
      aanvraag: toonDatum(parseDatum(start)),
      einde: einde ? toonDatum(parseDatum(einde)) : null,
      ingebreke: toonDatum(parseDatum(ingebreke)),
      eersteDag: b && b.eersteDag ? toonDatum(parseDatum(b.eersteDag)) : null,
      dagen: b ? b.dagen : 0,
      bedrag: b ? euro(b.totaal) : null,
    },
  };
}

function toISO(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Het blok met de termijn, de grondslag en het rekenvoorbeeld.
 *
 * Staat hoog op de pagina: wie zoekt op "hoelang mag UWV over mijn WIA doen"
 * wil dat antwoord zien, niet eerst drie schermen over ons.
 */
export function feitenSectie(ingang = {}) {
  const f = zaakFeiten(ingang);
  if (!f) return '';
  const v = f.voorbeeld;
  const onderwerp = veilig(f.onderwerp);

  const vanafZin = f.naBezwaar
    ? `De termijn begint pas te lopen ná afloop van de bezwaartermijn van zes weken, en dus niet
       op de dag dat je je bezwaarschrift verstuurt.`
    : `De termijn begint te lopen op de dag dat ${veilig(f.instantie)} je aanvraag ontvangt.`;

  const grondslagZin = f.wettelijk
    ? `Die termijn staat met zoveel woorden in de wet: ${veilig(f.grondslag)}.`
    : `Voor dit soort aanvragen staat geen eigen termijn in de wet. Dan geldt de redelijke
       termijn, en die is in ieder geval acht weken: ${veilig(f.grondslag)}.`;

  const voorbeeldRegels = v.einde && v.eersteDag && v.bedrag ? `
      <ol class="voorbeeldlijst">
        <li>Je dient de aanvraag in op <strong>${veilig(v.aanvraag)}</strong>.</li>
        <li>${veilig(f.instantie)} moet dan uiterlijk <strong>${veilig(v.einde)}</strong> beslissen.</li>
        <li>Blijft het stil, dan stel je bijvoorbeeld op <strong>${veilig(v.ingebreke)}</strong>
            in gebreke. Daarna heeft ${veilig(f.instantie)} nog ${HERSTELTERMIJN_DAGEN} dagen.</li>
        <li>Komt er dan nog niets, dan loopt de dwangsom vanaf
            <strong>${veilig(v.eersteDag)}</strong>.</li>
        <li>Blijft het daarna ${v.dagen} dagen stil, dan staat er
            <strong>${veilig(v.bedrag)}</strong>.</li>
      </ol>` : '';

  return `
  <!-- ============================================ de zaak zelf: wat hier anders is -->
  <section class="blok" id="termijn">
    <div class="omhulsel">
      <div class="sectiekop">
        <h2>Hoelang mag ${veilig(f.instantie)} over ${onderwerp} doen?</h2>
        <p>Dit is de termijn waar jouw zaak op staat of valt. Staat er een datum in je eigen
           brief, dan telt die datum altijd vóór op de standaardtermijn hieronder.</p>
      </div>

      <div class="termijnkaart">
        <p class="termijnkaart__getal">${veilig(f.termijnTekst)}</p>
        <p class="termijnkaart__onder">standaardtermijn voor ${onderwerp}</p>
      </div>

      <p>${vanafZin}</p>
      <p>${grondslagZin}</p>
      ${f.toelichting ? `<p class="let-op-regel">${veilig(f.toelichting)}</p>` : ''}

      <h3>Een voorbeeld met deze termijn</h3>
      <p>Zo loopt het als ${veilig(f.instantie)} niets van zich laat horen:</p>
      ${voorbeeldRegels}
      <p class="wetnoot-regel">De bedragen komen uit ${veilig(TARIEF.grondslag)} en zijn voor
         elke instantie gelijk; alleen de beslistermijn verschilt per soort aanvraag.</p>
    </div>
  </section>
`;
}

/**
 * Vragen waarvan het antwoord per zaaksoort verschilt.
 *
 * Ze staan vóór de algemene vragen, want dit is waar iemand op zoekt. En ze
 * gaan door dezelfde opmaak als de rest, zodat ze ook in het FAQ-schema komen
 * dat uit de pagina wordt gelezen.
 */
export function zaakVragen(ingang = {}) {
  const f = zaakFeiten(ingang);
  if (!f) return [];
  const onderwerp = f.onderwerp;
  const v = f.voorbeeld;

  const vragen = [
    {
      // Niet letterlijk dezelfde zin als de kop hierboven; dan staat hij
      // twee keer woordelijk op de pagina.
      vraag: `Wat is de beslistermijn voor ${onderwerp}?`,
      antwoord: f.wettelijk
        ? `De standaardtermijn is ${f.termijnTekst}, en die staat in ${f.grondslag}. `
          + `${f.naBezwaar ? 'Hij begint te lopen na afloop van de bezwaartermijn van zes weken. '
            : `Hij begint op de dag dat ${f.instantie} je aanvraag ontvangt. `}`
          + 'Staat er in je eigen brief een andere datum, dan telt die datum.'
        : `Voor ${onderwerp} staat geen eigen termijn in de wet. Dan geldt de redelijke termijn van `
          + `${f.grondslag}, dus ${f.termijnTekst}. Noemt ${f.instantie} in je ontvangstbevestiging `
          + 'zelf een datum, dan is dat de datum waaraan zij gehouden zijn.',
    },
    {
      vraag: `In mijn brief staat een andere datum dan ${f.termijnTekst}. Wat telt er dan?`,
      antwoord: `De datum uit je brief. Noemt ${f.instantie} zelf een moment waarop je een `
        + 'beslissing kunt verwachten, dan is dat de termijn waaraan zij zich hebben verbonden. '
        + `De ${f.termijnTekst} hierboven is de terugvaloptie voor als er geen datum genoemd is.`,
    },
  ];

  if (v.einde && v.bedrag) {
    vragen.push({
      vraag: `Wat levert het op als ${f.instantie} te laat is met ${onderwerp}?`,
      antwoord: `Dat hangt af van hoelang het daarna nog duurt, niet van hoelang je al wacht. `
        + `In het voorbeeld hierboven - aanvraag op ${v.aanvraag}, in gebreke gesteld op `
        + `${v.ingebreke} - loopt de dwangsom vanaf ${v.eersteDag} en staat er na ${v.dagen} `
        + `dagen ${v.bedrag}. Meer dan ${euro(TARIEF.maxBedrag)} wordt het nooit.`,
    });
  }

  if (f.naBezwaar) {
    vragen.push({
      vraag: 'Vanaf wanneer telt de termijn bij een bezwaar precies?',
      antwoord: 'Niet vanaf de dag dat je bezwaar maakt. Eerst loopt de bezwaartermijn van zes '
        + 'weken na het besluit; pas daarna begint de termijn om op je bezwaar te beslissen. '
        + 'Daarom vragen wij naar de datum van het besluit waartegen je bezwaar maakte, en niet '
        + 'naar de datum van je bezwaarschrift.',
    });
  }

  return vragen;
}
