/**
 * Welke velden vraagt de funnel nog?
 *
 * Uitgangspunt is: nooit twee keer vragen wat al uit de brief kwam. Maar wat
 * uit een brief komt, kan fout zijn - een nummer bij het woord
 * "burgerservicenummer" is niet altijd een burgerservicenummer. Wordt een
 * gelezen waarde afgekeurd, dan moet het veld alsnog verschijnen; anders
 * krijgt de aanvrager een foutmelding over iets dat hij niet kan zien.
 *
 * Die regel staat hier apart zodat hij getest kan worden zonder browser.
 */

import { bsnKlopt, ibanKlopt } from './identiteit.js';
import { vraagtBsn, labelBestuursorgaan } from './catalogus.js';

/**
 * @param {{herkenning?: object, contact?: object, bestuursorgaan?: string, geforceerd?: Array<string>}} zaak
 * @returns {Array<{id: string, label: string, type: string, verplicht: boolean, hulp?: string}>}
 */
export function teVragenVelden({ herkenning = {}, contact = {}, bestuursorgaan = '', geforceerd = [] } = {}) {
  const afgedwongen = new Set(geforceerd);
  // Bij de gevoelige velden hoort de naam van de instantie: "nodig om je bij
  // UWV te identificeren" is een reden, "vraagt de instantie" is een frase.
  const orgaan = bestuursorgaan ? labelBestuursorgaan(bestuursorgaan) : 'de instantie';
  const waardeVan = (id) => String(contact[id] || herkenning[id] || '').trim();
  const ontbreekt = (id) => waardeVan(id) === '' || afgedwongen.has(id);

  const velden = [];
  const eenvoudig = [
    ['naam', 'Je naam'],
    ['adres', 'Straat en huisnummer'],
    ['postcode', 'Postcode'],
    ['woonplaats', 'Woonplaats'],
  ];
  for (const [id, label] of eenvoudig) {
    if (ontbreekt(id)) velden.push({ id, label, type: 'text', verplicht: true });
  }

  velden.push({
    id: 'geboortedatum', label: 'Geboortedatum', type: 'date', verplicht: true,
    hulp: `Staat op de machtiging, zodat ${orgaan} je kan herkennen.`,
  });

  if (vraagtBsn(bestuursorgaan)) {
    const gelezen = waardeVan('bsn');
    const onbruikbaar = gelezen !== '' && !bsnKlopt(gelezen);
    if (gelezen === '' || onbruikbaar || afgedwongen.has('bsn')) {
      velden.push({
        id: 'bsn', label: 'Burgerservicenummer', type: 'text', verplicht: true,
        hulp: onbruikbaar
          ? 'Wij lazen een nummer uit je brief dat geen geldig burgerservicenummer is. Vul het hier in.'
          : `Nodig om je bij ${orgaan} correct te identificeren.`,
        // Hier neemt de weerstand toe; dan hoort er te staan wat wij ermee doen.
        slot: 'Beveiligd verwerkt. Je burgerservicenummer staat nooit in een e-mail.',
      });
    }
  }

  const gelezenIban = waardeVan('iban');
  velden.push({
    id: 'iban', label: 'IBAN', type: 'text', verplicht: true,
    hulp: gelezenIban !== '' && !ibanKlopt(gelezenIban)
      ? 'Het rekeningnummer uit je brief klopt niet. Vul het hier in.'
      : `Een eventuele vergoeding wordt door ${orgaan} rechtstreeks aan jou uitbetaald.`,
    slot: 'Wij ontvangen jouw vergoeding niet; het geld komt op jouw rekening binnen.',
  });
  velden.push({
    id: 'email', label: 'E-mailadres', type: 'email', verplicht: true,
    hulp: 'Hierop houden wij je op de hoogte.',
  });
  velden.push({ id: 'telefoon', label: 'Telefoonnummer', type: 'tel', verplicht: false });

  return velden;
}
