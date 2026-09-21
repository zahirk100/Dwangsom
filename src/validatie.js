/** Validatie van wat de aanvrager instuurt. De server vertrouwt de client niet. */

import { parseDatum } from '../shared/datum.js';
import { zoekZaaktype } from '../shared/catalogus.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function tekst(waarde, maxLengte) {
  if (typeof waarde !== 'string') return '';
  return waarde.trim().slice(0, maxLengte);
}

export function valideerAanvraag(body) {
  const fouten = {};
  const invoerIn = body && typeof body.invoer === 'object' && body.invoer ? body.invoer : {};
  const contactIn = body && typeof body.contact === 'object' && body.contact ? body.contact : {};

  const zaaktype = zoekZaaktype(invoerIn.zaaktype);
  if (!zaaktype) fouten.zaaktype = 'Kies het soort aanvraag.';
  if (!parseDatum(invoerIn.basisdatum)) fouten.basisdatum = 'Vul een geldige datum in (jjjj-mm-dd).';
  if (invoerIn.ingebrekeGesteld && !parseDatum(invoerIn.ingebrekestellingDatum)) {
    fouten.ingebrekestellingDatum = 'Vul de datum van de ingebrekestelling in.';
  }
  if (invoerIn.besluitGenomen && !parseDatum(invoerIn.besluitDatum)) {
    fouten.besluitDatum = 'Vul de datum van het besluit in.';
  }

  const naam = tekst(contactIn.naam, 120);
  if (naam.length < 2) fouten.naam = 'Vul uw naam in.';
  const email = tekst(contactIn.email, 160);
  if (!EMAIL.test(email)) fouten.email = 'Vul een geldig e-mailadres in.';
  if (!contactIn.akkoordVoorwaarden) fouten.akkoordVoorwaarden = 'U moet akkoord gaan om de aanvraag in te dienen.';

  const invoer = {
    bestuursorgaan: tekst(invoerIn.bestuursorgaan, 40),
    organisatienaam: tekst(invoerIn.organisatienaam, 120),
    zaaktype: zaaktype ? zaaktype.id : '',
    basisdatum: tekst(invoerIn.basisdatum, 10),
    adviescommissie: Boolean(invoerIn.adviescommissie),
    termijnBekend: Boolean(invoerIn.termijnBekend),
    termijnEinddatum: tekst(invoerIn.termijnEinddatum, 10),
    verdaagd: Boolean(invoerIn.verdaagd),
    verdagingEinddatum: tekst(invoerIn.verdagingEinddatum, 10),
    opschortingDagen: Number.isFinite(Number(invoerIn.opschortingDagen))
      ? Math.max(0, Math.min(365, Math.round(Number(invoerIn.opschortingDagen))))
      : 0,
    ingebrekeGesteld: Boolean(invoerIn.ingebrekeGesteld),
    ingebrekestellingDatum: tekst(invoerIn.ingebrekestellingDatum, 10),
    besluitGenomen: Boolean(invoerIn.besluitGenomen),
    besluitDatum: tekst(invoerIn.besluitDatum, 10),
    geenBelanghebbende: Boolean(invoerIn.geenBelanghebbende),
    buitenBehandeling: Boolean(invoerIn.buitenBehandeling),
    wooVerzoek: Boolean(invoerIn.wooVerzoek),
    asielzaak: Boolean(invoerIn.asielzaak),
  };

  const contact = {
    naam,
    email,
    telefoon: tekst(contactIn.telefoon, 40),
    adres: tekst(contactIn.adres, 120),
    postcode: tekst(contactIn.postcode, 12),
    woonplaats: tekst(contactIn.woonplaats, 80),
    geboortedatum: tekst(contactIn.geboortedatum, 10),
    kenmerk: tekst(contactIn.kenmerk, 60),
    toelichting: tekst(contactIn.toelichting, 2000),
    machtiging: Boolean(contactIn.machtiging),
    akkoordVoorwaarden: Boolean(contactIn.akkoordVoorwaarden),
  };

  return { geldig: Object.keys(fouten).length === 0, fouten, invoer, contact };
}
