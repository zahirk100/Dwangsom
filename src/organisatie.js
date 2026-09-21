/**
 * Onze eigen gegevens, zoals ze op een machtiging en op uitgaande stukken
 * horen te staan. Uit de omgeving, want ze verschillen per gebruiker van deze
 * applicatie en horen niet in de broncode.
 *
 * Wat niet is ingevuld, wordt zichtbaar als een invulveld getoond: liever een
 * duidelijk gat in het document dan een verzonnen adres of KvK-nummer.
 */

const ONBEKEND = '';

export function organisatiegegevens(env = process.env) {
  return {
    naam: env.BEDRIJF_NAAM || 'nubeslist.nl',
    adres: env.BEDRIJF_ADRES || ONBEKEND,
    postcodePlaats: env.BEDRIJF_POSTCODE_PLAATS || ONBEKEND,
    kvk: env.BEDRIJF_KVK || ONBEKEND,
    email: env.BEDRIJF_EMAIL || ONBEKEND,
    telefoon: env.BEDRIJF_TELEFOON || ONBEKEND,
  };
}

/** Welke van onze eigen gegevens nog ontbreken. */
export function ontbrekendeOrganisatiegegevens(env = process.env) {
  const gegevens = organisatiegegevens(env);
  const labels = {
    adres: 'BEDRIJF_ADRES',
    postcodePlaats: 'BEDRIJF_POSTCODE_PLAATS',
    kvk: 'BEDRIJF_KVK',
    email: 'BEDRIJF_EMAIL',
  };
  return Object.entries(labels)
    .filter(([sleutel]) => !gegevens[sleutel])
    .map(([, variabele]) => variabele);
}
