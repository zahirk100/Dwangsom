/**
 * Eén intakeflow, veel ingangen.
 *
 * Iemand die op een WIA-advertentie klikt, hoort niet op een algemene
 * homepage te landen met "de instantie" en "een aanvraag". Hij hoort te lezen
 * dat het over zijn WIA-beslissing van UWV gaat. Daarom staat hier per
 * ingang de tekst van de landingspagina, met daarachter altijd dezelfde
 * flow: brief uploaden, uitslag, machtiging.
 *
 * `slug` is het pad. scripts/maak-paginas.mjs schrijft er een echt html-bestand
 * van, zodat elke ingang zijn eigen titel, omschrijving en h1 in de bron heeft.
 * Dat is precies wat een advertentie en een zoekmachine nodig hebben.
 *
 * `instantie` en `zaak` worden doorgegeven aan de funnel, zodat ook daar
 * "Laten we kijken of UWV te laat is" staat en niet "het bestuursorgaan".
 *
 * `kort` is de linktekst in het overzicht "waar wacht je op". Die staat er
 * met zoveel woorden bij; hem uit de kop knippen levert kromme zinnen op.
 */

/** De algemene ingang: de homepage. */
export const ALGEMEEN = {
  slug: '',
  instantie: '',
  zaak: '',
  titel: 'nubeslist.nl, wacht je te lang op een beslissing?',
  omschrijving: 'Wacht je op een beslissing van UWV, DUO of je gemeente? Upload je brief en '
    + 'krijg binnen een minuut duidelijkheid over jouw situatie. Wij controleren of de '
    + 'beslistermijn is verstreken en regelen wat daarna nodig is.',
  kop: 'Wacht je te lang op een beslissing?',
  onder: 'Wij controleren of de beslistermijn is verstreken en regelen wat daarna nodig is.',
  lead: 'Wacht je op UWV, DUO of je gemeente? Upload je brief en krijg binnen een minuut '
    + 'duidelijkheid over jouw situatie.',
  knop: 'Controleer mijn brief',
  uploadkop: 'Laten we kijken of de instantie te laat is',
  uploadtekst: 'Upload de brief waarin staat wanneer je een beslissing kunt verwachten. '
    + 'Wij zoeken de relevante datum voor je op.',
};

/**
 * De specifieke ingangen. Elke regel is een advertentie waard: één instantie,
 * één procedure, één zorg.
 */
export const CAMPAGNES = [
  // ------------------------------------------------------------------ UWV --
  {
    slug: 'uwv', instantie: 'uwv', zaak: '',
    kort: 'elke beslissing van UWV',
    kop: 'Wacht je te lang op een beslissing van UWV?',
    onder: 'Wij controleren of UWV over de beslistermijn heen is en regelen wat daarna nodig is.',
    lead: 'Upload de brief van UWV waarin staat wanneer je een beslissing kon verwachten. '
      + 'Binnen een minuut weet je of UWV te laat is.',
    knop: 'Upload mijn UWV-brief',
    titel: 'UWV te laat met je beslissing? Controleer de beslistermijn',
    omschrijving: 'Wacht je nog op een beslissing van UWV over je WIA, WW, Wajong of Ziektewet? '
      + 'Upload je brief en nubeslist.nl controleert of de beslistermijn is verstreken.',
  },
  {
    slug: 'uwv-wia', instantie: 'uwv', zaak: 'uwv-wia',
    kort: 'je WIA-beslissing',
    kop: 'Wacht je te lang op je WIA-beslissing?',
    onder: 'Wij controleren of UWV over de beslistermijn heen is en regelen wat daarna nodig is.',
    lead: 'Upload de brief van UWV waarin staat wanneer je een beslissing kon verwachten. '
      + 'nubeslist.nl controleert de datum voor je.',
    knop: 'Upload mijn UWV-brief',
    titel: 'Wacht je nog steeds op je WIA-beslissing van UWV?',
    omschrijving: 'UWV moet binnen een bepaalde termijn op je WIA-aanvraag beslissen. Upload je '
      + 'brief en nubeslist.nl controleert of die termijn voorbij is en wat je volgende stap is.',
  },
  {
    slug: 'uwv-ww', instantie: 'uwv', zaak: 'uwv-ww',
    kort: 'je WW-uitkering',
    kop: 'Wacht je te lang op je WW-uitkering?',
    onder: 'Wij controleren of UWV over de beslistermijn heen is en regelen wat daarna nodig is.',
    lead: 'Upload de brief van UWV over je WW-aanvraag. Wij zoeken de uiterste beslisdatum '
      + 'voor je op.',
    knop: 'Upload mijn UWV-brief',
    titel: 'Geen beslissing over je WW-aanvraag? Controleer de termijn',
    omschrijving: 'Wacht je al weken op een beslissing over je WW-uitkering? Upload je brief van '
      + 'UWV en nubeslist.nl controleert of de beslistermijn is verstreken.',
  },
  {
    slug: 'uwv-wajong', instantie: 'uwv', zaak: 'uwv-wajong',
    kort: 'je Wajong-beslissing',
    kop: 'Wacht je te lang op je Wajong-beslissing?',
    onder: 'Wij controleren of UWV over de beslistermijn heen is en regelen wat daarna nodig is.',
    lead: 'Upload de brief van UWV over je Wajong-aanvraag. Wij zoeken de relevante datum '
      + 'voor je op.',
    knop: 'Upload mijn UWV-brief',
    titel: 'Wacht je nog op je Wajong-beslissing van UWV?',
    omschrijving: 'UWV moet binnen een bepaalde termijn op je Wajong-aanvraag beslissen. Upload '
      + 'je brief en nubeslist.nl controleert of die termijn voorbij is.',
  },
  {
    slug: 'uwv-ziektewet', instantie: 'uwv', zaak: 'uwv-zw',
    kort: 'je Ziektewet-uitkering',
    kop: 'Wacht je te lang op je Ziektewet-beslissing?',
    onder: 'Wij controleren of UWV over de beslistermijn heen is en regelen wat daarna nodig is.',
    lead: 'Upload de brief van UWV over je Ziektewet-uitkering. Wij zoeken de uiterste '
      + 'beslisdatum voor je op.',
    knop: 'Upload mijn UWV-brief',
    titel: 'Geen beslissing over je Ziektewet-uitkering?',
    omschrijving: 'Wacht je te lang op een beslissing van UWV over je Ziektewet-uitkering? '
      + 'Upload je brief en nubeslist.nl controleert de beslistermijn.',
  },
  {
    slug: 'uwv-bezwaar', instantie: 'uwv', zaak: 'uwv-bezwaar',
    kort: 'je bezwaar bij UWV',
    kop: 'Wacht je te lang op de beslissing over je UWV-bezwaar?',
    onder: 'Wij controleren of de beslistermijn op je bezwaar is verstreken en regelen wat daarna nodig is.',
    lead: 'Upload de brief van UWV over je bezwaarschrift. Wij zoeken uit tot wanneer UWV de '
      + 'tijd had.',
    knop: 'Upload mijn UWV-brief',
    titel: 'UWV beslist niet op je bezwaar? Controleer de termijn',
    omschrijving: 'Op een bezwaarschrift moet UWV binnen zes weken beslissen, of twaalf weken met '
      + 'een adviescommissie. Upload je brief en nubeslist.nl controleert of die termijn voorbij is.',
  },

  // ------------------------------------------------------------- gemeente --
  {
    slug: 'gemeente', instantie: 'gemeente', zaak: '',
    kort: 'elke beslissing van je gemeente',
    kop: 'Wacht je te lang op een beslissing van je gemeente?',
    onder: 'Wij controleren of je gemeente over de beslistermijn heen is en regelen wat daarna nodig is.',
    lead: 'Upload de brief van je gemeente waarin staat wanneer je een beslissing kon '
      + 'verwachten. Binnen een minuut weet je waar je staat.',
    knop: 'Upload mijn gemeentebrief',
    titel: 'Gemeente te laat met je beslissing? Controleer de termijn',
    omschrijving: 'Wacht je op je gemeente voor bijstand, Wmo, jeugdhulp of een vergunning? '
      + 'Upload je brief en nubeslist.nl controleert of de beslistermijn is verstreken.',
  },
  {
    slug: 'bijstand', instantie: 'gemeente', zaak: 'gem-bijstand',
    kort: 'je bijstandsuitkering',
    kop: 'Wacht je te lang op je bijstandsuitkering?',
    onder: 'Wij controleren of je gemeente over de beslistermijn heen is en regelen wat daarna nodig is.',
    lead: 'Upload de brief van je gemeente over je bijstandsaanvraag. Wij zoeken de uiterste '
      + 'beslisdatum voor je op.',
    knop: 'Upload mijn gemeentebrief',
    titel: 'Geen beslissing op je bijstandsaanvraag? Controleer de termijn',
    omschrijving: 'Op een aanvraag voor bijstand moet de gemeente binnen acht weken beslissen. '
      + 'Upload je brief en nubeslist.nl controleert of die termijn voorbij is.',
  },
  {
    slug: 'wmo', instantie: 'gemeente', zaak: 'gem-wmo',
    kort: 'je Wmo-aanvraag',
    kop: 'Wacht je te lang op je Wmo-beslissing?',
    onder: 'Wij controleren of je gemeente over de beslistermijn heen is en regelen wat daarna nodig is.',
    lead: 'Upload de brief van je gemeente over je Wmo-aanvraag. Wij zoeken de relevante '
      + 'datum voor je op.',
    knop: 'Upload mijn gemeentebrief',
    titel: 'Wacht je nog op je Wmo-beslissing van de gemeente?',
    omschrijving: 'Voor een Wmo-maatwerkvoorziening geldt zes weken onderzoek en daarna twee weken '
      + 'om te beslissen. Upload je brief en nubeslist.nl controleert of die termijn voorbij is.',
  },
  {
    slug: 'jeugdhulp', instantie: 'gemeente', zaak: 'gem-jeugdwet',
    kort: 'je aanvraag voor jeugdhulp',
    kop: 'Wacht je te lang op een beslissing over jeugdhulp?',
    onder: 'Wij controleren of je gemeente over de beslistermijn heen is en regelen wat daarna nodig is.',
    lead: 'Upload de brief van je gemeente over de aanvraag voor jeugdhulp. Wij zoeken de '
      + 'uiterste beslisdatum voor je op.',
    knop: 'Upload mijn gemeentebrief',
    titel: 'Geen beslissing over jeugdhulp? Controleer de termijn',
    omschrijving: 'Wacht je te lang op een beslissing van je gemeente over jeugdhulp? Upload je '
      + 'brief en nubeslist.nl controleert of de beslistermijn is verstreken.',
  },
  {
    slug: 'schuldhulp', instantie: 'gemeente', zaak: 'gem-schuldhulp',
    kort: 'je schuldhulpverlening',
    kop: 'Wacht je te lang op schuldhulpverlening?',
    onder: 'Wij controleren of je gemeente over de beslistermijn heen is en regelen wat daarna nodig is.',
    lead: 'Upload de brief van je gemeente over je aanvraag voor schuldhulp. Wij zoeken de '
      + 'relevante datum voor je op.',
    knop: 'Upload mijn gemeentebrief',
    titel: 'Geen beslissing over je schuldhulpverlening?',
    omschrijving: 'De gemeente moet binnen acht weken beslissen op een aanvraag voor '
      + 'schuldhulpverlening. Upload je brief en nubeslist.nl controleert die termijn.',
  },
  {
    slug: 'gemeente-bezwaar', instantie: 'gemeente', zaak: 'gem-bezwaar',
    kort: 'je bezwaar bij de gemeente',
    kop: 'Wacht je te lang op de beslissing over je bezwaar bij de gemeente?',
    onder: 'Wij controleren of de beslistermijn op je bezwaar is verstreken en regelen wat daarna nodig is.',
    lead: 'Upload de brief van je gemeente over je bezwaarschrift. Wij zoeken uit tot wanneer '
      + 'de gemeente de tijd had.',
    knop: 'Upload mijn gemeentebrief',
    titel: 'Gemeente beslist niet op je bezwaar? Controleer de termijn',
    omschrijving: 'Op een bezwaarschrift moet de gemeente binnen zes weken beslissen, of twaalf '
      + 'weken met een adviescommissie. Upload je brief en nubeslist.nl controleert die termijn.',
  },

  // ------------------------------------------------------------------ DUO --
  {
    slug: 'duo', instantie: 'duo', zaak: '',
    kort: 'elke beslissing van DUO',
    kop: 'Wacht je nog op een beslissing van DUO?',
    onder: 'Wij controleren of DUO over de beslistermijn heen is en regelen wat daarna nodig is.',
    lead: 'Upload de brief van DUO waarin staat wanneer je een beslissing kon verwachten. '
      + 'Binnen een minuut weet je waar je staat.',
    knop: 'Upload mijn DUO-brief',
    titel: 'DUO te laat met je beslissing? Controleer de termijn',
    omschrijving: 'Wacht je op DUO voor je studiefinanciering of een beslissing op je bezwaar? '
      + 'Upload je brief en nubeslist.nl controleert of de beslistermijn is verstreken.',
  },
  {
    slug: 'studiefinanciering', instantie: 'duo', zaak: 'duo-studiefinanciering',
    kort: 'je studiefinanciering',
    kop: 'Wacht je te lang op je studiefinanciering?',
    onder: 'Wij controleren of DUO over de beslistermijn heen is en regelen wat daarna nodig is.',
    lead: 'Upload de brief van DUO over je aanvraag. Wij zoeken de uiterste beslisdatum voor '
      + 'je op.',
    knop: 'Upload mijn DUO-brief',
    titel: 'Geen beslissing over je studiefinanciering?',
    omschrijving: 'DUO moet binnen een bepaalde termijn op je aanvraag beslissen. Upload je brief '
      + 'en nubeslist.nl controleert of die termijn voorbij is.',
  },

  // ------------------------------------------------------------------ SVB --
  {
    slug: 'svb', instantie: 'svb', zaak: '',
    kort: 'elke beslissing van de SVB',
    kop: 'Wacht je nog op een beslissing van de SVB?',
    onder: 'Wij controleren of de SVB over de beslistermijn heen is en regelen wat daarna nodig is.',
    lead: 'Upload de brief van de SVB waarin staat wanneer je een beslissing kon verwachten. '
      + 'Binnen een minuut weet je waar je staat.',
    knop: 'Upload mijn SVB-brief',
    titel: 'SVB te laat met je beslissing? Controleer de termijn',
    omschrijving: 'Wacht je op de SVB voor je AOW, kinderbijslag of nabestaandenuitkering? '
      + 'Upload je brief en nubeslist.nl controleert of de beslistermijn is verstreken.',
  },
  {
    slug: 'aow', instantie: 'svb', zaak: 'svb-aow',
    kort: 'je AOW-aanvraag',
    kop: 'Wacht je te lang op je AOW-beslissing?',
    onder: 'Wij controleren of de SVB over de beslistermijn heen is en regelen wat daarna nodig is.',
    lead: 'Upload de brief van de SVB over je AOW-aanvraag. Wij zoeken de relevante datum '
      + 'voor je op.',
    knop: 'Upload mijn SVB-brief',
    titel: 'Geen beslissing over je AOW-aanvraag?',
    omschrijving: 'De SVB moet binnen een bepaalde termijn op je AOW-aanvraag beslissen. Upload '
      + 'je brief en nubeslist.nl controleert of die termijn voorbij is.',
  },

  // -------------------------------------------------------- belastingdienst --
  {
    slug: 'toeslagen', instantie: 'belastingdienst', zaak: 'bel-toeslag',
    kort: 'een beslissing over je toeslag',
    kop: 'Wacht je te lang op een beslissing over je toeslag?',
    onder: 'Wij controleren of de Belastingdienst over de beslistermijn heen is en regelen wat daarna nodig is.',
    lead: 'Upload de brief over je toeslag waarin staat wanneer je een beslissing kon '
      + 'verwachten. Wij zoeken de datum voor je op.',
    knop: 'Upload mijn brief',
    titel: 'Geen beslissing over je toeslag? Controleer de termijn',
    omschrijving: 'Wacht je te lang op een beslissing over huurtoeslag, zorgtoeslag of '
      + 'kinderopvangtoeslag? Upload je brief en nubeslist.nl controleert de beslistermijn.',
  },
];

/** Alle ingangen, de homepage voorop. */
export function alleIngangen() {
  return [ALGEMEEN, ...CAMPAGNES];
}

/**
 * De ingang bij een pad. `/uwv-wia` geeft de WIA-campagne, `/` de homepage.
 * @param {string} pad
 */
export function ingangVoor(pad) {
  const slug = String(pad || '').replace(/^\/+|\/+$/g, '').replace(/\.html$/, '');
  if (!slug) return ALGEMEEN;
  return CAMPAGNES.find((c) => c.slug === slug) || null;
}

/** De paden die naast de gewone pagina's bestaan, voor de router en de tests. */
export function campagnePaden() {
  return CAMPAGNES.map((c) => `/${c.slug}`);
}
