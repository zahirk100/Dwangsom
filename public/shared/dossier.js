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
import { DOSSIERSOORT, UITKOMST } from './dwangsom.js';

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
 * Post die de instantie rechtstreeks aan de aanvrager stuurt.
 *
 * Dit is geen gevraagd stuk maar een open bak, en hij is er vooral voor ons:
 * krijgt iemand alsnog een besluit of een verlengingsbrief, dan horen wij dat
 * nu pas als hij belt. Eén knop in zijn dossier lost dat op.
 */
export const NIEUWE_POST = 'nieuwe-post';

/**
 * @param {{invoer?: object, contact?: object, rapport?: object}} dossier
 * @returns {{gegevens: Array, stukken: Array}}
 */
export function bepaalDossiereisen({ invoer = {}, contact = {}, rapport = {} } = {}) {
  const zaaktype = zoekZaaktype(invoer.zaaktype);
  const soort = rapport.vervolg ? rapport.vervolg.soort : null;
  const isBezwaar = Boolean(zaaktype && zaaktype.termijnVanaf === TERMIJN_VANAF.BEZWAARTERMIJN);
  const machtiging = Boolean(contact.machtiging);
  // Treden wij nu namens iemand op? Dan hebben wij de gegevens nodig die op de
  // brieven en de machtiging komen.
  //
  // Dit hing eerder aan het soort dossier, en dat klopte niet: een zaak waarin
  // de termijn al verstreken is, heet intern een vooraanmelding, maar wij
  // sturen er wel degelijk een ingebrekestelling in. Zonder naam, adres en
  // burgerservicenummer kan die brief niet de deur uit, en de machtiging stond
  // niet eens in de stukkenlijst terwijl hij al getekend was. Alleen bij een
  // termijn die nog loopt gebeurt er echt nog niets.
  //
  // Zonder machtiging sturen wij niets, dus dan vragen wij ook niets extra's:
  // dat dossier is een vraag, geen opdracht.
  const nuIetsTeDoen = rapport.uitkomst === UITKOMST.INGEBREKESTELLING_NODIG
    || rapport.uitkomst === UITKOMST.HERSTELTERMIJN_LOOPT;
  const treedtOp = soort === DOSSIERSOORT.AANVRAAG || (machtiging && nuIetsTeDoen);
  const briefNodig = treedtOp;

  const gegevens = [
    veld('naam', true, 'Staat op alle stukken die wij indienen.'),
    veld('email', true, 'Hierop houden wij de aanvrager op de hoogte.'),
    // Bewust niet verplicht: niet iedereen wil een nummer afgeven, en het is
    // geen voorwaarde om de zaak te kunnen indienen.
    veld('telefoon', false, briefNodig
      ? 'Handig bij een lopende termijn: dan is de aanvrager snel te bereiken.'
      : 'Handig als wij iets willen navragen.'),
    veld('adres', briefNodig, 'Wordt als afzender op de brieven gezet.'),
    veld('postcode', briefNodig, 'Hoort bij het adres op de brieven.'),
    veld('woonplaats', briefNodig, 'Hoort bij het adres op de brieven.'),
    veld('geboortedatum', treedtOp && machtiging, treedtOp && machtiging
      ? 'Staat op de machtiging, zodat het bestuursorgaan de aanvrager kan herkennen.'
      : 'Vragen wij pas als wij namens de aanvrager gaan optreden.'),
    // Zonder deze twee kan een zaak niet worden ingediend of uitbetaald.
    // Ze horen daarom in het overzicht van wat ontbreekt, niet pas op het
    // moment dat de behandelaar de machtiging opent.
    veld('bsn', treedtOp && machtiging && vraagtBsn(invoer.bestuursorgaan),
      'Staat op de machtiging; het bestuursorgaan vindt de zaak daarmee terug.'),
    veld('iban', treedtOp, 'Hierop wordt een toegekende vergoeding uitbetaald.'),
    veld('kenmerk', false, invoer.bestuursorgaan === 'uwv'
      ? 'Het kenmerk of klantnummer uit de brief van UWV; daarmee is de zaak direct terug te vinden.'
      : 'Het zaaknummer uit de ontvangstbevestiging; daarmee is de zaak direct terug te vinden.'),
  ];

  const stukken = [];

  if (isBezwaar) {
    stukken.push(stuk('primair-besluit', 'Het besluit waartegen bezwaar is gemaakt',
      { uitleg: 'Daaruit blijkt vanaf wanneer de bezwaartermijn liep.' }));
    stukken.push(stuk('bezwaarschrift', 'Het bezwaarschrift en het verzendbewijs',
      { uitleg: 'Bijvoorbeeld de ontvangstbevestiging of het verzendbewijs van de post.' }));
  } else {
    stukken.push(stuk('ontvangstbevestiging', 'Bewijs van de aanvraag',
      { uitleg: 'De ontvangstbevestiging, of een ander bewijs van de aanvraagdatum.' }));
  }

  if (invoer.termijnBekend) {
    stukken.push(stuk('termijnbrief', 'De brief met de uiterste beslisdatum',
      { uitleg: 'Daarin noemt het bestuursorgaan zelf de uiterste beslisdatum.', verplicht: false }));
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
      doorOns ? 'De ingebrekestelling die wij verstuurden' : 'De eigen ingebrekestelling van de aanvrager',
      {
        door: doorOns ? 'wij' : 'klant',
        uitleg: doorOns
          ? 'Wij stelden zelf in gebreke; de brief zit in dit dossier.'
          : 'De brief of e-mail waarin de aanvrager om een besluit vroeg.',
      }));
    stukken.push(stuk('verzendbewijs', 'Het verzendbewijs van die ingebrekestelling',
      {
        door: doorOns ? 'wij' : 'klant',
        uitleg: 'Dit is het belangrijkste bewijsstuk: het bepaalt vanaf welke dag de dwangsom telt.',
      }));
  }
  if (invoer.besluitGenomen) {
    stukken.push(stuk('besluit', 'Het besluit dat inmiddels is ontvangen',
      { uitleg: 'Daarmee stellen wij vast tot welke dag de dwangsom is opgelopen.' }));
  }

  if (machtiging && treedtOp) {
    stukken.push(stuk('machtiging', 'Een ondertekende machtiging',
      { uitleg: 'Die stellen wij op en sturen wij toe; de aanvrager zet alleen een handtekening.', door: 'wij' }));
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

/** Wat de aanvrager mag uploaden: de gevraagde stukken plus nieuwe post. */
export function magUploaden(dossier) {
  return [...stukkenVanKlant(dossier).map((s) => s.id), NIEUWE_POST];
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
