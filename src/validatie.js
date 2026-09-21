/**
 * Validatie van wat de aanvrager instuurt. De server vertrouwt de client niet
 * en rekent zelf uit welke velden in deze zaak verplicht zijn.
 */

import { parseDatum, vandaag } from '../public/shared/datum.js';
import { zoekZaaktype } from '../public/shared/catalogus.js';
import { berekenDwangsom } from '../public/shared/dwangsom.js';
import { bepaalDossiereisen, stukkenVanKlant } from '../public/shared/dossier.js';
import { bsnKlopt, ibanKlopt, normaliseerBsn, normaliseerIban } from '../public/shared/identiteit.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function tekst(waarde, maxLengte) {
  if (typeof waarde !== 'string') return '';
  return waarde.trim().slice(0, maxLengte);
}

function normaliseerInvoer(ruw = {}) {
  const zaaktype = zoekZaaktype(ruw.zaaktype);
  return {
    bestuursorgaan: tekst(ruw.bestuursorgaan, 40),
    organisatienaam: tekst(ruw.organisatienaam, 120),
    zaaktype: zaaktype ? zaaktype.id : '',
    basisdatum: tekst(ruw.basisdatum, 10),
    adviescommissie: Boolean(ruw.adviescommissie),
    termijnBekend: Boolean(ruw.termijnBekend),
    termijnEinddatum: tekst(ruw.termijnEinddatum, 10),
    verdaagd: Boolean(ruw.verdaagd),
    verdagingEinddatum: tekst(ruw.verdagingEinddatum, 10),
    opschortingDagen: Number.isFinite(Number(ruw.opschortingDagen))
      ? Math.max(0, Math.min(365, Math.round(Number(ruw.opschortingDagen))))
      : 0,
    ingebrekeGesteld: Boolean(ruw.ingebrekeGesteld),
    ingebrekestellingDatum: tekst(ruw.ingebrekestellingDatum, 10),
    besluitGenomen: Boolean(ruw.besluitGenomen),
    besluitDatum: tekst(ruw.besluitDatum, 10),
    geenBelanghebbende: Boolean(ruw.geenBelanghebbende),
    buitenBehandeling: Boolean(ruw.buitenBehandeling),
    wooVerzoek: Boolean(ruw.wooVerzoek),
    asielzaak: Boolean(ruw.asielzaak),
  };
}

function normaliseerContact(ruw = {}) {
  return {
    naam: tekst(ruw.naam, 120),
    email: tekst(ruw.email, 160),
    telefoon: tekst(ruw.telefoon, 40),
    adres: tekst(ruw.adres, 120),
    postcode: tekst(ruw.postcode, 12),
    woonplaats: tekst(ruw.woonplaats, 80),
    geboortedatum: tekst(ruw.geboortedatum, 10),
    kenmerk: tekst(ruw.kenmerk, 60),
    bsn: normaliseerBsn(tekst(ruw.bsn, 12)),
    iban: normaliseerIban(tekst(ruw.iban, 40)),
    toelichting: tekst(ruw.toelichting, 2000),
    machtiging: Boolean(ruw.machtiging),
    akkoordVoorwaarden: Boolean(ruw.akkoordVoorwaarden),
  };
}

export function valideerAanvraag(body) {
  const fouten = {};
  const invoer = normaliseerInvoer(body && body.invoer);
  const contact = normaliseerContact(body && body.contact);

  if (!invoer.zaaktype) fouten.zaaktype = 'Kies het soort aanvraag.';
  const basisdatum = parseDatum(invoer.basisdatum);
  if (!basisdatum) {
    fouten.basisdatum = 'Vul een geldige datum in (jjjj-mm-dd).';
  } else if (basisdatum > vandaag()) {
    fouten.basisdatum = 'Deze datum ligt in de toekomst; controleer wat u heeft ingevuld.';
  }
  if (invoer.ingebrekeGesteld && !parseDatum(invoer.ingebrekestellingDatum)) {
    fouten.ingebrekestellingDatum = 'Vul de datum van de ingebrekestelling in.';
  }
  if (invoer.besluitGenomen && !parseDatum(invoer.besluitDatum)) {
    fouten.besluitDatum = 'Vul de datum van het besluit in.';
  }

  // De server rekent zelf; wat de browser meestuurt is nooit leidend.
  const rapport = berekenDwangsom(invoer);
  // Kan er niet gerekend worden, dan is het dossier stuurloos: geen soort,
  // geen datum om te bewaken. Dan hoort het niet opgeslagen te worden.
  if (rapport.onvolledig && !fouten.basisdatum && !fouten.zaaktype) {
    fouten.basisdatum = rapport.samenvatting || 'De gegevens zijn niet compleet.';
  }

  // Welke velden verplicht zijn, hangt af van deze zaak: wie een machtiging
  // wil of al kan vorderen, heeft een adres nodig voor de brieven.
  const eisen = bepaalDossiereisen({ invoer, contact, rapport });
  for (const gegeven of eisen.gegevens) {
    if (!gegeven.verplicht) continue;
    const waarde = contact[gegeven.id];
    if (typeof waarde === 'string' && waarde.trim().length >= 2) continue;
    fouten[gegeven.id] = `${gegeven.label} is nodig: ${gegeven.reden.toLowerCase()}`;
  }
  if (contact.email && !EMAIL.test(contact.email)) {
    fouten.email = 'Vul een geldig e-mailadres in.';
  }
  if (contact.geboortedatum && !parseDatum(contact.geboortedatum)) {
    fouten.geboortedatum = 'Vul de geboortedatum in als jjjj-mm-dd.';
  }
  // Een typefout in deze twee kost weken, dus meteen narekenen.
  if (contact.bsn && !bsnKlopt(contact.bsn)) {
    fouten.bsn = 'Dit burgerservicenummer klopt niet. Controleer de cijfers.';
  }
  if (contact.iban && !ibanKlopt(contact.iban)) {
    fouten.iban = 'Dit IBAN klopt niet. Controleer het rekeningnummer.';
  }
  if (!contact.akkoordVoorwaarden) {
    fouten.akkoordVoorwaarden = 'U moet akkoord gaan om de aanvraag in te dienen.';
  }

  // Alleen aanvinken wat in deze zaak gevraagd is; onbekende sleutels negeren.
  const gevraagd = stukkenVanKlant({ invoer, contact, rapport });
  const ingestuurd = (body && typeof body.stukken === 'object' && body.stukken) || {};
  const stukken = Object.fromEntries(gevraagd.map((s) => [s.id, Boolean(ingestuurd[s.id])]));

  // De brief en de handtekening komen uit de nieuwe funnel; de klassieke
  // wizard stuurt ze niet mee en dat mag.
  const brief = normaliseerBrief(body && body.brief);
  const verlengbrief = normaliseerBrief(body && body.verlengbrief);
  const handtekening = normaliseerHandtekening(body && body.handtekening);
  const herkomst = tekst(body && body.herkomst, 40) || 'formulier';

  return {
    geldig: Object.keys(fouten).length === 0,
    fouten, invoer, contact, stukken, rapport, brief, verlengbrief, handtekening, herkomst,
  };
}

const MAX_BRIEFTEKST = 60000;
const MAX_HANDTEKENING = 400 * 1024;

function normaliseerBrief(ruw) {
  if (!ruw || typeof ruw !== 'object') return null;
  const inhoud = tekst(ruw.tekst, MAX_BRIEFTEKST);
  if (!inhoud) return null;
  return {
    bron: tekst(ruw.bron, 20),
    bestandsnaam: tekst(ruw.bestandsnaam, 120),
    tekens: inhoud.length,
    tekst: inhoud,
    ontvangenOp: new Date().toISOString(),
  };
}

function normaliseerHandtekening(ruw) {
  if (!ruw || typeof ruw !== 'object') return null;
  const afbeelding = String(ruw.afbeelding || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(afbeelding)) return null;
  if (afbeelding.length > MAX_HANDTEKENING) return null;
  return {
    afbeelding,
    gezetOp: parseDatum(String(ruw.gezetOp || '').slice(0, 10)) ? ruw.gezetOp : new Date().toISOString(),
  };
}

/**
 * Wat de beheerder zelf bijwerkt aan een lopend dossier.
 *
 * Bedoeld om niet voor elk ontbrekend gegeven de aanvrager te hoeven mailen:
 * wat telefonisch of uit de stukken bekend wordt, gaat hier direct in. Alleen
 * velden die ook echt meegestuurd zijn worden aangeraakt, zodat een
 * gedeeltelijke wijziging de rest niet leegmaakt.
 */
const BIJ_TE_WERKEN_CONTACT = [
  'naam', 'email', 'telefoon', 'adres', 'postcode', 'woonplaats',
  'geboortedatum', 'bsn', 'iban', 'kenmerk', 'toelichting',
];

const BIJ_TE_WERKEN_INVOER = [
  'organisatienaam', 'basisdatum', 'termijnBekend', 'termijnEinddatum',
  'verdaagd', 'verdagingEinddatum', 'opschortingDagen',
  'ingebrekeGesteld', 'ingebrekestellingDatum', 'ingebrekestellingDoorOns',
  'besluitGenomen', 'besluitDatum',
];

export function valideerBijwerking(aanvraag = {}, body = {}) {
  const fouten = {};
  const contact = {};
  const invoer = {};
  const gewijzigd = [];
  const ruweContact = (body && typeof body.contact === 'object' && body.contact) || {};
  const ruweInvoer = (body && typeof body.invoer === 'object' && body.invoer) || {};

  for (const veld of BIJ_TE_WERKEN_CONTACT) {
    if (!(veld in ruweContact)) continue;
    let waarde = tekst(ruweContact[veld], veld === 'toelichting' ? 2000 : 160);
    if (veld === 'bsn') waarde = normaliseerBsn(waarde);
    if (veld === 'iban') waarde = normaliseerIban(waarde);
    if (String((aanvraag.contact || {})[veld] || '') !== waarde) gewijzigd.push(veld);
    contact[veld] = waarde;
  }

  if (contact.email && !EMAIL.test(contact.email)) fouten.email = 'Dit e-mailadres klopt niet.';
  if (contact.bsn && !bsnKlopt(contact.bsn)) fouten.bsn = 'Dit burgerservicenummer klopt niet.';
  if (contact.iban && !ibanKlopt(contact.iban)) fouten.iban = 'Dit IBAN klopt niet.';
  if (contact.geboortedatum && !parseDatum(contact.geboortedatum)) {
    fouten.geboortedatum = 'Vul de geboortedatum in als jjjj-mm-dd.';
  }

  for (const veld of BIJ_TE_WERKEN_INVOER) {
    if (!(veld in ruweInvoer)) continue;
    const huidig = (aanvraag.invoer || {})[veld];
    if (['termijnBekend', 'verdaagd', 'ingebrekeGesteld', 'ingebrekestellingDoorOns', 'besluitGenomen'].includes(veld)) {
      invoer[veld] = Boolean(ruweInvoer[veld]);
    } else if (veld === 'opschortingDagen') {
      const dagen = Number(ruweInvoer[veld]);
      invoer[veld] = Number.isFinite(dagen) ? Math.max(0, Math.min(365, Math.round(dagen))) : 0;
    } else {
      invoer[veld] = tekst(ruweInvoer[veld], 120);
    }
    if (String(huidig ?? '') !== String(invoer[veld])) gewijzigd.push(veld);
  }

  // Een datum die bij een aangevinkt veld hoort, moet er ook echt zijn.
  const samen = { ...(aanvraag.invoer || {}), ...invoer };
  if (samen.ingebrekeGesteld && !parseDatum(samen.ingebrekestellingDatum)) {
    fouten.ingebrekestellingDatum = 'Vul de datum van de ingebrekestelling in.';
  }
  if (samen.besluitGenomen && !parseDatum(samen.besluitDatum)) {
    fouten.besluitDatum = 'Vul de datum van het besluit in.';
  }

  return { contact, invoer, fouten, gewijzigd };
}
