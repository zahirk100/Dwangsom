/**
 * Wat hebben wij nodig om deze zaak te kunnen behandelen?
 *
 * Welke gegevens en stukken nodig zijn, verschilt per zaak: bij een bezwaar
 * hoort het primaire besluit erbij, bij een al verstuurde ingebrekestelling
 * het verzendbewijs, en willen wij namens iemand optreden dan is een
 * machtiging nodig met de gegevens die daarop moeten staan.
 *
 * Door dat vooraf uit te rekenen vraagt het formulier alleen wat er in deze
 * zaak toe doet, en ziet de beheerder meteen wat er nog ontbreekt in plaats
 * van er achteraf achteraan te moeten bellen.
 */

import { TERMIJN_VANAF, vraagtBsn, zoekZaaktype } from './catalogus.js';
import { DOSSIERSOORT } from './dwangsom.js';

/** Contactvelden die het formulier kent, met hun vaste label. */
export const CONTACTVELDEN = {
  naam: 'Naam',
  email: 'E-mailadres',
  telefoon: 'Telefoonnummer',
  adres: 'Adres',
  postcode: 'Postcode',
  woonplaats: 'Woonplaats',
  geboortedatum: 'Geboortedatum',
  bsn: 'Burgerservicenummer',
  iban: 'IBAN',
  kenmerk: 'Kenmerk of zaaknummer',
};

function veld(id, verplicht, reden) {
  return { id, label: CONTACTVELDEN[id] || id, verplicht, reden };
}

function stuk(id, label, { uitleg = '', verplicht = true, door = 'klant' } = {}) {
  return { id, label, uitleg, verplicht, door };
}

/**
 * @param {{invoer?: object, contact?: object, rapport?: object}} dossier
 * @returns {{gegevens: Array, stukken: Array}}
 */
export function bepaalDossiereisen({ invoer = {}, contact = {}, rapport = {} } = {}) {
  const zaaktype = zoekZaaktype(invoer.zaaktype);
  const soort = rapport.vervolg ? rapport.vervolg.soort : null;
  const isBezwaar = Boolean(zaaktype && zaaktype.termijnVanaf === TERMIJN_VANAF.BEZWAARTERMIJN);
  const machtiging = Boolean(contact.machtiging);
  // Alleen als wij nu al namens iemand gaan optreden, hebben wij de gegevens
  // nodig die op de brieven en de machtiging komen. Bij een vooraanmelding
  // gebeurt er nog niets, dus vragen wij niet meer dan contactgegevens; de
  // rest halen wij op zodra de zaak in behandeling gaat.
  const treedtOp = soort === DOSSIERSOORT.AANVRAAG;
  const briefNodig = treedtOp;

  const gegevens = [
    veld('naam', true, 'Staat op alle stukken die wij indienen.'),
    veld('email', true, 'Hierop houden wij u op de hoogte.'),
    // Bewust niet verplicht: niet iedereen wil een nummer afgeven, en het is
    // geen voorwaarde om de zaak te kunnen indienen.
    veld('telefoon', false, briefNodig
      ? 'Handig bij een lopende termijn, dan kunnen wij u snel bereiken.'
      : 'Handig als wij iets willen navragen.'),
    veld('adres', briefNodig, 'Wordt als afzender op de brieven gezet.'),
    veld('postcode', briefNodig, 'Hoort bij het adres op de brieven.'),
    veld('woonplaats', briefNodig, 'Hoort bij het adres op de brieven.'),
    veld('geboortedatum', treedtOp && machtiging, treedtOp && machtiging
      ? 'Staat op de machtiging, zodat het bestuursorgaan u kan herkennen.'
      : 'Vragen wij pas als wij namens u gaan optreden.'),
    // Zonder deze twee kan een zaak niet worden ingediend of uitbetaald.
    // Ze horen daarom in het overzicht van wat ontbreekt, niet pas op het
    // moment dat de behandelaar de machtiging opent.
    veld('bsn', treedtOp && machtiging && vraagtBsn(invoer.bestuursorgaan),
      'Staat op de machtiging; het bestuursorgaan vindt de zaak daarmee terug.'),
    veld('iban', treedtOp, 'Hierop wordt een toegekende vergoeding uitbetaald.'),
    veld('kenmerk', false, invoer.bestuursorgaan === 'uwv'
      ? 'Het kenmerk of klantnummer uit de brief van UWV; daarmee vindt men uw zaak direct terug.'
      : 'Het zaaknummer uit de ontvangstbevestiging; daarmee vindt men uw zaak direct terug.'),
  ];

  const stukken = [];

  if (isBezwaar) {
    stukken.push(stuk('primair-besluit', 'Het besluit waartegen u bezwaar maakte',
      { uitleg: 'Daaruit blijkt vanaf wanneer de bezwaartermijn liep.' }));
    stukken.push(stuk('bezwaarschrift', 'Uw bezwaarschrift en het verzendbewijs',
      { uitleg: 'Bijvoorbeeld de ontvangstbevestiging of het verzendbewijs van de post.' }));
  } else {
    stukken.push(stuk('ontvangstbevestiging', 'Bewijs van uw aanvraag',
      { uitleg: 'De ontvangstbevestiging, of een ander bewijs van de datum waarop u aanvroeg.' }));
  }

  if (invoer.termijnBekend) {
    stukken.push(stuk('termijnbrief', 'De brief met de uiterste beslisdatum',
      { uitleg: 'Daarin noemt het bestuursorgaan zelf wanneer u een besluit krijgt.', verplicht: false }));
  }
  if (invoer.verdaagd) {
    stukken.push(stuk('verdagingsbrief', 'De brief waarin de beslissing is uitgesteld',
      { uitleg: 'Bepaalt tot wanneer het bestuursorgaan de tijd heeft.' }));
  }
  if (Number(invoer.opschortingDagen) > 0) {
    stukken.push(stuk('opschortingsbrief', 'De brief waarin om aanvullende gegevens is gevraagd',
      { uitleg: 'Daarmee controleren wij hoeveel dagen de termijn heeft stilgestaan.', verplicht: false }));
  }
  if (invoer.ingebrekeGesteld) {
    // Hebben wij zelf in gebreke gesteld, dan zit dit stuk al in ons eigen
    // dossier. Het dan bij de aanvrager opvragen is precies het onnodige
    // mailtje dat we willen voorkomen.
    const doorOns = Boolean(invoer.ingebrekestellingDoorOns);
    stukken.push(stuk('ingebrekestelling',
      doorOns ? 'De ingebrekestelling die wij verstuurden' : 'Uw ingebrekestelling',
      {
        door: doorOns ? 'wij' : 'klant',
        uitleg: doorOns
          ? 'Wij stelden zelf in gebreke; de brief zit in dit dossier.'
          : 'De brief of e-mail waarin u om een besluit vroeg.',
      }));
    stukken.push(stuk('verzendbewijs', 'Het verzendbewijs van die ingebrekestelling',
      {
        door: doorOns ? 'wij' : 'klant',
        uitleg: 'Dit is het belangrijkste bewijsstuk: het bepaalt vanaf welke dag de dwangsom telt.',
      }));
  }
  if (invoer.besluitGenomen) {
    stukken.push(stuk('besluit', 'Het besluit dat u inmiddels heeft ontvangen',
      { uitleg: 'Daarmee stellen wij vast tot welke dag de dwangsom is opgelopen.' }));
  }

  if (machtiging && treedtOp) {
    stukken.push(stuk('machtiging', 'Een ondertekende machtiging',
      { uitleg: 'Die stellen wij op en sturen wij u toe; u zet alleen uw handtekening.', door: 'wij' }));
  }

  return { gegevens, stukken };
}

/** De velden die in deze zaak echt ingevuld moeten worden. */
export function verplichteVelden(dossier) {
  return bepaalDossiereisen(dossier).gegevens.filter((g) => g.verplicht).map((g) => g.id);
}

/** Wat de aanvrager zelf moet aanleveren. */
export function stukkenVanKlant(dossier) {
  return bepaalDossiereisen(dossier).stukken.filter((s) => s.door === 'klant');
}

/**
 * Vergelijkt de aangevinkte stukken met wat nodig is.
 * @returns {{ontbreekt: Array, aanwezig: Array, compleet: boolean}}
 */
export function dossierStatus({ invoer, contact, rapport, stukken = {} }) {
  const nodig = stukkenVanKlant({ invoer, contact, rapport });
  const aanwezig = nodig.filter((s) => stukken[s.id]);
  const ontbreekt = nodig.filter((s) => !stukken[s.id]);
  return {
    aanwezig,
    ontbreekt,
    compleet: ontbreekt.filter((s) => s.verplicht).length === 0,
  };
}
