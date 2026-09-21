/**
 * Catalogus van zaaktypen met hun standaard beslistermijn.
 *
 * De dwangsomregeling zelf (Awb art. 4:17 e.v.) is landelijk en identiek voor
 * UWV, gemeente en elk ander bestuursorgaan. Wat per zaaktype verschilt is
 * alleen de *beslistermijn*. Die staat hier als standaardwaarde.
 *
 * Belangrijk: de datum die het bestuursorgaan zelf noemt in de
 * ontvangstbevestiging gaat altijd voor op deze standaardwaarde. De wizard
 * vraagt daar expliciet naar; deze tabel is de terugvaloptie.
 *
 * `zekerheid`:
 *   'wettelijk' - termijn staat met zoveel woorden in de wet
 *   'restnorm'  - geen bijzondere wettelijke termijn; Awb art. 4:13 lid 2
 *                 (redelijke termijn, in ieder geval acht weken)
 */

export const TERMIJN_VANAF = {
  AANVRAAG: 'aanvraag',          // termijn loopt vanaf ontvangst van de aanvraag
  BEZWAARTERMIJN: 'bezwaartermijn', // termijn loopt vanaf einde van de bezwaartermijn
};

export const ZAAKTYPEN = [
  // ---------------------------------------------------------------- UWV ----
  {
    id: 'uwv-wia',
    bestuursorgaan: 'uwv',
    label: 'WIA-uitkering aanvragen of beoordelen',
    groep: 'Arbeidsongeschiktheid',
    termijnDagen: 56,
    termijnVanaf: TERMIJN_VANAF.AANVRAAG,
    zekerheid: 'restnorm',
    grondslag: 'Awb art. 4:13 lid 2 (acht weken)',
    toelichting: 'UWV noemt in de ontvangstbevestiging vaak een eigen datum. Die datum telt.',
  },
  {
    id: 'uwv-wajong',
    bestuursorgaan: 'uwv',
    label: 'Wajong aanvragen of beoordelen',
    groep: 'Arbeidsongeschiktheid',
    termijnDagen: 56,
    termijnVanaf: TERMIJN_VANAF.AANVRAAG,
    zekerheid: 'restnorm',
    grondslag: 'Awb art. 4:13 lid 2 (acht weken)',
    toelichting: 'Bij een medische en arbeidskundige beoordeling noemt UWV soms een langere termijn.',
  },
  {
    id: 'uwv-ww',
    bestuursorgaan: 'uwv',
    label: 'WW-uitkering aanvragen',
    groep: 'Werkloosheid',
    termijnDagen: 56,
    termijnVanaf: TERMIJN_VANAF.AANVRAAG,
    zekerheid: 'restnorm',
    grondslag: 'Awb art. 4:13 lid 2 (acht weken)',
    toelichting: 'UWV streeft zelf naar vier weken; wettelijk geldt de termijn uit de ontvangstbevestiging of acht weken.',
  },
  {
    id: 'uwv-zw',
    bestuursorgaan: 'uwv',
    label: 'Ziektewet-uitkering aanvragen',
    groep: 'Ziekte',
    termijnDagen: 56,
    termijnVanaf: TERMIJN_VANAF.AANVRAAG,
    zekerheid: 'restnorm',
    grondslag: 'Awb art. 4:13 lid 2 (acht weken)',
    toelichting: '',
  },
  {
    id: 'uwv-herbeoordeling',
    bestuursorgaan: 'uwv',
    label: 'Herbeoordeling of wijziging van een lopende uitkering',
    groep: 'Arbeidsongeschiktheid',
    termijnDagen: 56,
    termijnVanaf: TERMIJN_VANAF.AANVRAAG,
    zekerheid: 'restnorm',
    grondslag: 'Awb art. 4:13 lid 2 (acht weken)',
    toelichting: 'Alleen als u er zelf om heeft gevraagd. Een herbeoordeling op initiatief van UWV is geen aanvraag.',
  },
  {
    id: 'uwv-bezwaar',
    bestuursorgaan: 'uwv',
    label: 'Bezwaar tegen een beslissing van UWV',
    groep: 'Bezwaar',
    termijnDagen: 42,
    termijnVanaf: TERMIJN_VANAF.BEZWAARTERMIJN,
    zekerheid: 'wettelijk',
    grondslag: 'Awb art. 7:10 lid 1 (zes weken na afloop van de bezwaartermijn)',
    toelichting: 'De beslistermijn begint pas te lopen na afloop van de bezwaartermijn van zes weken.',
    verdagingDagen: 42,
  },

  // ----------------------------------------------------------- Gemeente ----
  {
    id: 'gem-bijstand',
    bestuursorgaan: 'gemeente',
    label: 'Bijstandsuitkering aanvragen (Participatiewet)',
    groep: 'Inkomen',
    termijnDagen: 56,
    termijnVanaf: TERMIJN_VANAF.AANVRAAG,
    zekerheid: 'wettelijk',
    grondslag: 'Awb art. 4:13 lid 2 (acht weken)',
    toelichting: 'Let op: een voorschot binnen vier weken is iets anders dan het besluit op uw aanvraag.',
  },
  {
    id: 'gem-bijzondere-bijstand',
    bestuursorgaan: 'gemeente',
    label: 'Bijzondere bijstand of individuele inkomenstoeslag',
    groep: 'Inkomen',
    termijnDagen: 56,
    termijnVanaf: TERMIJN_VANAF.AANVRAAG,
    zekerheid: 'restnorm',
    grondslag: 'Awb art. 4:13 lid 2 (acht weken)',
    toelichting: 'Sommige gemeenten hanteren in hun verordening een kortere termijn.',
  },
  {
    id: 'gem-wmo',
    bestuursorgaan: 'gemeente',
    label: 'Wmo-maatwerkvoorziening (hulp, vervoer, woningaanpassing)',
    groep: 'Zorg en ondersteuning',
    termijnDagen: 56,
    termijnVanaf: TERMIJN_VANAF.AANVRAAG,
    zekerheid: 'wettelijk',
    grondslag: 'Wmo 2015 art. 2.3.2 en 2.3.5 (zes weken onderzoek + twee weken beslissen)',
    toelichting: 'De teller begint bij uw melding; de formele aanvraag volgt meestal na het onderzoek.',
  },
  {
    id: 'gem-jeugdwet',
    bestuursorgaan: 'gemeente',
    label: 'Jeugdhulp aanvragen (Jeugdwet)',
    groep: 'Zorg en ondersteuning',
    termijnDagen: 56,
    termijnVanaf: TERMIJN_VANAF.AANVRAAG,
    zekerheid: 'restnorm',
    grondslag: 'Awb art. 4:13 lid 2 (acht weken)',
    toelichting: '',
  },
  {
    id: 'gem-schuldhulp',
    bestuursorgaan: 'gemeente',
    label: 'Schuldhulpverlening aanvragen',
    groep: 'Inkomen',
    termijnDagen: 56,
    termijnVanaf: TERMIJN_VANAF.AANVRAAG,
    zekerheid: 'wettelijk',
    grondslag: 'Wet gemeentelijke schuldhulpverlening art. 4a (acht weken na het eerste gesprek)',
    toelichting: 'De termijn loopt vanaf het eerste gesprek over uw hulpvraag, niet vanaf uw melding.',
  },
  {
    id: 'gem-parkeervergunning',
    bestuursorgaan: 'gemeente',
    label: 'Vergunning, ontheffing of subsidie van de gemeente',
    groep: 'Vergunningen',
    termijnDagen: 56,
    termijnVanaf: TERMIJN_VANAF.AANVRAAG,
    zekerheid: 'restnorm',
    grondslag: 'Awb art. 4:13 lid 2 (acht weken)',
    toelichting: 'Bij omgevingsvergunningen geldt vaak een eigen termijn uit de Omgevingswet.',
  },
  {
    id: 'gem-bezwaar',
    bestuursorgaan: 'gemeente',
    label: 'Bezwaar tegen een beslissing van de gemeente',
    groep: 'Bezwaar',
    termijnDagen: 42,
    termijnVanaf: TERMIJN_VANAF.BEZWAARTERMIJN,
    zekerheid: 'wettelijk',
    grondslag: 'Awb art. 7:10 lid 1 (zes weken, of twaalf weken met adviescommissie)',
    toelichting: 'Schakelt de gemeente een bezwaarschriftencommissie in, dan is de termijn twaalf weken.',
    verdagingDagen: 42,
    vraagAdviescommissie: true,
    termijnMetAdviescommissieDagen: 84,
  },

  // ------------------------------------------------------------------ DUO ---
  {
    id: 'duo-studiefinanciering',
    bestuursorgaan: 'duo',
    label: 'Studiefinanciering of studieschuld',
    groep: 'Onderwijs',
    termijnDagen: 56,
    termijnVanaf: TERMIJN_VANAF.AANVRAAG,
    zekerheid: 'restnorm',
    grondslag: 'Awb art. 4:13 lid 2 (acht weken)',
    toelichting: 'DUO noemt in de ontvangstbevestiging meestal zelf een datum. Die telt.',
  },
  {
    id: 'duo-bezwaar',
    bestuursorgaan: 'duo',
    label: 'Bezwaar tegen een beslissing van DUO',
    groep: 'Bezwaar',
    termijnDagen: 42,
    termijnVanaf: TERMIJN_VANAF.BEZWAARTERMIJN,
    zekerheid: 'wettelijk',
    grondslag: 'Awb art. 7:10 lid 1 (zes weken, of twaalf weken met adviescommissie)',
    toelichting: '',
    verdagingDagen: 42,
    vraagAdviescommissie: true,
    termijnMetAdviescommissieDagen: 84,
  },

  // ------------------------------------------------------------------ SVB ---
  {
    id: 'svb-aow',
    bestuursorgaan: 'svb',
    label: 'AOW, kinderbijslag of nabestaandenuitkering',
    groep: 'Sociale verzekeringen',
    termijnDagen: 56,
    termijnVanaf: TERMIJN_VANAF.AANVRAAG,
    zekerheid: 'restnorm',
    grondslag: 'Awb art. 4:13 lid 2 (acht weken)',
    toelichting: '',
  },
  {
    id: 'svb-bezwaar',
    bestuursorgaan: 'svb',
    label: 'Bezwaar tegen een beslissing van de SVB',
    groep: 'Bezwaar',
    termijnDagen: 42,
    termijnVanaf: TERMIJN_VANAF.BEZWAARTERMIJN,
    zekerheid: 'wettelijk',
    grondslag: 'Awb art. 7:10 lid 1 (zes weken, of twaalf weken met adviescommissie)',
    toelichting: '',
    verdagingDagen: 42,
    vraagAdviescommissie: true,
    termijnMetAdviescommissieDagen: 84,
  },

  // -------------------------------------------------------- Belastingdienst --
  {
    id: 'bel-toeslag',
    bestuursorgaan: 'belastingdienst',
    label: 'Toeslag aanvragen of wijzigen',
    groep: 'Toeslagen',
    termijnDagen: 56,
    termijnVanaf: TERMIJN_VANAF.AANVRAAG,
    zekerheid: 'restnorm',
    grondslag: 'Awb art. 4:13 lid 2 (acht weken)',
    toelichting: 'Voor toeslagen gelden soms eigen termijnen; de datum uit de brief gaat voor.',
  },
  {
    id: 'bel-bezwaar',
    bestuursorgaan: 'belastingdienst',
    label: 'Bezwaar bij de Belastingdienst of Toeslagen',
    groep: 'Bezwaar',
    termijnDagen: 42,
    termijnVanaf: TERMIJN_VANAF.BEZWAARTERMIJN,
    zekerheid: 'wettelijk',
    grondslag: 'Awb art. 7:10 lid 1 (zes weken)',
    toelichting: '',
    verdagingDagen: 42,
  },

  // -------------------------------------------------------------- Overig ---
  {
    id: 'overig-aanvraag',
    bestuursorgaan: 'anders',
    label: 'Andere aanvraag bij een bestuursorgaan',
    groep: 'Overig',
    termijnDagen: 56,
    termijnVanaf: TERMIJN_VANAF.AANVRAAG,
    zekerheid: 'restnorm',
    grondslag: 'Awb art. 4:13 lid 2 (acht weken)',
    toelichting: 'Bijvoorbeeld SVB, Belastingdienst/Toeslagen, waterschap of provincie.',
  },
  {
    id: 'overig-bezwaar',
    bestuursorgaan: 'anders',
    label: 'Bezwaar bij een ander bestuursorgaan',
    groep: 'Bezwaar',
    termijnDagen: 42,
    termijnVanaf: TERMIJN_VANAF.BEZWAARTERMIJN,
    zekerheid: 'wettelijk',
    grondslag: 'Awb art. 7:10 lid 1 (zes weken, of twaalf weken met adviescommissie)',
    toelichting: '',
    verdagingDagen: 42,
    vraagAdviescommissie: true,
    termijnMetAdviescommissieDagen: 84,
  },
];

export const BESTUURSORGANEN = [
  { id: 'uwv', label: 'UWV', omschrijving: 'WIA, Wajong, WW, Ziektewet' },
  { id: 'gemeente', label: 'Gemeente', omschrijving: 'Bijstand, Wmo, jeugdhulp, vergunningen' },
  { id: 'duo', label: 'DUO', omschrijving: 'Studiefinanciering en studieschuld' },
  { id: 'svb', label: 'SVB', omschrijving: 'AOW, kinderbijslag, nabestaandenuitkering' },
  { id: 'belastingdienst', label: 'Belastingdienst', omschrijving: 'Toeslagen en aanslagen' },
  { id: 'anders', label: 'Ander bestuursorgaan', omschrijving: 'Provincie, waterschap, ander orgaan' },
];

/** Instanties die om een burgerservicenummer vragen bij een machtiging. */
const VRAAGT_BSN = new Set(['uwv', 'gemeente', 'duo', 'svb', 'belastingdienst']);

export function vraagtBsn(bestuursorgaanId) {
  return VRAAGT_BSN.has(bestuursorgaanId);
}

const INDEX = new Map(ZAAKTYPEN.map((z) => [z.id, z]));

export function zoekZaaktype(id) {
  return INDEX.get(id) || null;
}

export function zaaktypenVoor(bestuursorgaanId) {
  return ZAAKTYPEN.filter((z) => z.bestuursorgaan === bestuursorgaanId);
}

export function labelBestuursorgaan(id) {
  const b = BESTUURSORGANEN.find((x) => x.id === id);
  return b ? b.label : 'Bestuursorgaan';
}
