/**
 * Validatie van wat de aanvrager instuurt. De server vertrouwt de client niet
 * en rekent zelf uit welke velden in deze zaak verplicht zijn.
 */

import { parseDatum, vandaag } from '../public/shared/datum.js';
import { zoekZaaktype } from '../public/shared/catalogus.js';
import { berekenDwangsom } from '../public/shared/dwangsom.js';
import { bepaalDossiereisen, stukkenVanKlant } from '../public/shared/dossier.js';

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
  if (!contact.akkoordVoorwaarden) {
    fouten.akkoordVoorwaarden = 'U moet akkoord gaan om de aanvraag in te dienen.';
  }

  // Alleen aanvinken wat in deze zaak gevraagd is; onbekende sleutels negeren.
  const gevraagd = stukkenVanKlant({ invoer, contact, rapport });
  const ingestuurd = (body && typeof body.stukken === 'object' && body.stukken) || {};
  const stukken = Object.fromEntries(gevraagd.map((s) => [s.id, Boolean(ingestuurd[s.id])]));

  return { geldig: Object.keys(fouten).length === 0, fouten, invoer, contact, stukken, rapport };
}
