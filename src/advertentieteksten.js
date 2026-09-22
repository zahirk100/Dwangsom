/**
 * De advertentieteksten voor de UWV-campagne.
 *
 * Waarom in code en niet in een document? Om twee redenen.
 *
 * De eerste is dat advertentieplatforms harde tekenlimieten hebben. Een kop
 * van 31 tekens wordt bij Google geweigerd, en dat merk je pas als je hem
 * probeert te plaatsen. Hier staat een toets op (test/advertentieteksten.test.js).
 *
 * De tweede is belangrijker. Een advertentie die "10%" zegt terwijl de funnel
 * 25% afrekent, is een onjuiste prijsvermelding aan een consument. Het bedrag
 * komt hier daarom uit `tarief.js`, dezelfde bron als de landingspagina, de
 * funnel en de machtiging. Zo kan de advertentie de site niet tegenspreken.
 *
 * Wat hier bewust NIET staat: dat UWV sneller gaat beslissen, dat een melding
 * nooit gevolgen heeft, of dat de bezoeker € 1.442 krijgt. Dat zijn de drie
 * beloftes die een advertentietekst wil doen en die niemand kan waarmaken.
 */

import { TARIEF } from '../public/shared/dwangsom.js';
import { tarief } from '../public/shared/tarief.js';

/** De tekenlimieten van de platforms, voor zover ze hard zijn. */
export const LIMIETEN = {
  googleKop: 30,
  googleOmschrijving: 90,
  googlePad: 15,
  metaKop: 40,
  metaOmschrijving: 30,
};

const MAX = String(TARIEF.maxBedrag).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Het tarief in één woord, of niets als er geen tarief is ingesteld. */
function tariefKort(env) {
  const t = tarief(env);
  if (!t.bekend) return '';
  return t.soort === 'vast' ? `€ ${t.bedrag}` : `${t.percentage}%`;
}

/**
 * @param {object} env
 * @returns {{google: object, meta: object, zoekwoorden: object}}
 */
export function advertentieteksten(env = process.env) {
  const fee = tariefKort(env);
  // Zonder ingesteld tarief noemen we geen bedrag, net als op de site.
  const prijsregel = fee
    ? `Geen vergoeding is € 0. Wel een vergoeding: ${fee}.`
    : 'Je hoort vooraf wat onze hulp kost.';

  return {
    google: {
      // Responsive search ad. Google draait zelf combinaties, dus elke kop
      // moet los van de andere kunnen staan.
      koppen: [
        'Wacht je lang op UWV?',
        'UWV te laat met beslissen?',
        'Nog geen beslissing van UWV',
        'UWV beslist maar niet',
        'Controleer je UWV-brief',
        'Gratis check van je brief',
        'Binnen 1 minuut duidelijk',
        `Vergoeding tot € ${MAX}`,
        'Is UWV over de termijn?',
        'Wij regelen de melding',
        'Je zit nergens aan vast',
        'Geen vergoeding? Dan € 0',
        'Wacht niet langer af',
        'Upload je UWV-brief',
        'Wij houden de datums bij',
      ],
      omschrijvingen: [
        'Upload je UWV-brief. Wij zoeken gratis uit of UWV al had moeten beslissen.',
        `Blijft een beslissing uit, dan kan je wettelijke vergoeding oplopen tot € ${MAX}.`,
        'Wij melden het bij UWV, houden de datums bij en laten je weten wat er gebeurt.',
        prijsregel + ' De controle is altijd gratis.',
      ],
      paden: ['uwv-te-laat', 'gratis-check'],
    },

    meta: {
      // Eén advertentie per boodschap, met dezelfde id als het beeld uit
      // scripts/maak-advertenties.mjs.
      advertenties: [
        {
          id: 'herkenning',
          tekst: 'Wacht je al weken of maanden op een beslissing van UWV?\n\n'
            + 'Misschien heeft UWV gezegd dat het druk is. Of stond er een datum in je brief '
            + 'die inmiddels voorbij is.\n\n'
            + 'Upload je UWV-brief. Wij zoeken gratis uit of UWV al had moeten beslissen en '
            + 'wat je nu kunt doen.',
          kop: 'Gratis controle van je UWV-brief',
          omschrijving: 'Binnen 1 minuut duidelijk',
          knop: 'Meer informatie',
        },
        {
          id: 'bedrag',
          tekst: 'Is UWV te laat met je beslissing?\n\n'
            + 'Dan kun je UWV officieel laten weten dat je nog wacht. Blijft een beslissing '
            + `daarna uit, dan kan je wettelijke vergoeding oplopen tot € ${MAX}.\n\n`
            + 'Of dat voor jou geldt, hangt af van je situatie. Wij controleren je brief gratis.',
          kop: `Wettelijke vergoeding tot € ${MAX}`,
          omschrijving: 'Controle is gratis',
          knop: 'Meer informatie',
        },
        {
          id: 'geruststelling',
          tekst: 'Bang dat je je WIA, Wajong of bezwaar in gevaar brengt door aan de bel te trekken?\n\n'
            + 'Een melding gaat over het uitblijven van een beslissing. Dat is iets anders dan '
            + 'bezwaar maken tegen de inhoud van je zaak. Loopt er een bezwaar, dan blijft UWV '
            + 'dat gewoon behandelen.\n\n'
            + 'Wij controleren eerst je situatie voordat we iets namens jou versturen.',
          kop: 'Geen bezwaar, alleen een melding',
          omschrijving: 'Je zit nergens aan vast',
          knop: 'Meer informatie',
        },
        {
          id: 'eenvoud',
          tekst: 'Geen idee of UWV al te laat is met jouw beslissing?\n\n'
            + 'Hoeft ook niet. Upload de brief die je hebt, dan zoeken wij de datum op die '
            + 'voor jouw zaak geldt.\n\n'
            + 'Alleen je brief uploaden? Dan sturen wij nog niets naar UWV.',
          kop: 'Wij zoeken de datum voor je op',
          omschrijving: 'Gratis, geen verplichting',
          knop: 'Meer informatie',
        },
      ],
    },

    /**
     * Zoekwoorden. Bewust twee groepen: mensen die al weten dat er een
     * dwangsom bestaat zijn zeldzaam en duur, mensen die "uwv duurt lang"
     * typen zijn de echte doelgroep.
     */
    zoekwoorden: {
      probleem: [
        'uwv duurt lang', 'uwv beslist niet', 'hoelang duurt wia aanvraag',
        'uwv reageert niet', 'wachten op beslissing uwv', 'uwv te laat beslissing',
        'uwv beslistermijn', 'wia beslissing duurt lang', 'uwv geen reactie',
        'hoe lang mag uwv erover doen',
      ],
      oplossing: [
        'ingebrekestelling uwv', 'dwangsom uwv', 'uwv in gebreke stellen',
        'dwangsom niet tijdig beslissen', 'ingebrekestelling niet tijdig beslissen',
        'formulier ingebrekestelling uwv',
      ],
      uitsluiten: [
        'gratis', 'zelf', 'voorbeeldbrief', 'template', 'vacature', 'inloggen',
        'mijn uwv', 'telefoonnummer uwv', 'wetten.nl', 'jurisprudentie',
      ],
    },
  };
}
