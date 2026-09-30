/**
 * Welke velden vraagt de funnel nog?
 *
 * Het antwoord is: zo weinig mogelijk. Wie zijn brief heeft laten lezen, weet
 * nog niet of wij iets voor hem kunnen betekenen. Hem op dat moment zijn
 * adres, geboortedatum, burgerservicenummer en rekeningnummer laten intypen is
 * vragen om af te haken - en het zet een bijzonder persoonsgegeven in onze
 * opslag van iemand die misschien nooit klant wordt.
 *
 * Wat er nodig is om de zaak echt in te dienen, vragen wij daarom pas in het
 * dossier, als wij de zaak hebben nagelopen en er iets te doen valt. Zie
 * `bepaalDossiereisen` in dossier.js: dat blijft onverkort gelden, en wat
 * ontbreekt staat in het dossier én in de beheeromgeving.
 *
 * Hier blijft over wat wij nu écht nodig hebben: een naam om de opdracht op te
 * zetten, een e-mailadres om iets te kunnen laten weten, en - als de bezoeker
 * het bij de hand heeft - het kenmerk waarmee de instantie de zaak terugvindt.
 *
 * Nooit twee keer vragen wat al uit de brief kwam blijft de regel; wat de
 * brief opleverde staat er alvast in.
 *
 * Deze regel staat hier apart zodat hij getest kan worden zonder browser.
 */

import { labelBestuursorgaan } from './catalogus.js';

/**
 * @param {{herkenning?: object, contact?: object, bestuursorgaan?: string, geforceerd?: Array<string>}} zaak
 * @returns {Array<{id: string, label: string, type: string, verplicht: boolean, hulp?: string}>}
 */
export function teVragenVelden({ herkenning = {}, contact = {}, bestuursorgaan = '', geforceerd = [] } = {}) {
  const afgedwongen = new Set(geforceerd);
  const orgaan = bestuursorgaan ? labelBestuursorgaan(bestuursorgaan) : 'de instantie';
  const waardeVan = (id) => String(contact[id] || herkenning[id] || '').trim();

  const velden = [
    { id: 'naam', label: 'Naam', type: 'text', verplicht: true },
    {
      id: 'email', label: 'E-mailadres', type: 'email', verplicht: true,
      hulp: 'Voor berichten over je zaak.',
    },
    {
      id: 'kenmerk', label: `Kenmerk op je ${orgaan}-brief`, type: 'text', verplicht: false,
      hulp: `Heb je het niet bij de hand? Laat het leeg; wij zoeken het later met je uit.`,
    },
  ];

  // Een gelezen waarde die is afgekeurd hoort alsnog gevraagd te worden, want
  // anders krijgt de aanvrager een foutmelding over iets dat hij niet ziet.
  for (const veld of velden) {
    if (afgedwongen.has(veld.id)) veld.verplicht = true;
    veld.waarde = waardeVan(veld.id);
  }
  return velden;
}

/**
 * Wat wij hier met opzet niet vragen.
 *
 * Staat hier zodat het een gecontroleerde keuze blijft in plaats van iets dat
 * ooit is weggehaald. Deze velden komen uit `bepaalDossiereisen` en worden in
 * het dossier gevraagd, niet in de funnel.
 */
export const NIET_IN_DE_FUNNEL = ['adres', 'postcode', 'woonplaats', 'geboortedatum', 'bsn', 'iban'];
