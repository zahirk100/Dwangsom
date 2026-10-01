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
    naam: env.BEDRIJF_NAAM || 'NuBeslist',
    adres: env.BEDRIJF_ADRES || ONBEKEND,
    postcodePlaats: env.BEDRIJF_POSTCODE_PLAATS || ONBEKEND,
    kvk: env.BEDRIJF_KVK || ONBEKEND,
    email: env.BEDRIJF_EMAIL || ONBEKEND,
    telefoon: env.BEDRIJF_TELEFOON || ONBEKEND,
    whatsapp: whatsappNummer(env),
  };
}

/**
 * Het WhatsApp-nummer, in de vorm die wa.me verwacht: landcode zonder plus en
 * zonder nul ervoor. Een Nederlands nummer dat met 06 begint, wordt dus 316...
 *
 * Met een vaste waarde eronder, net als de merknaam. Dit is het nummer van de
 * WhatsApp Business van NuBeslist; een andere gebruiker van deze applicatie
 * zet er WHATSAPP_NUMMER voor in de plaats. Zonder die vaste waarde zou een
 * vergeten omgevingsvariabele de knop stilletjes van de site halen, en dat is
 * precies het kanaal waar mensen op binnenkomen.
 */
export function whatsappNummer(env = process.env) {
  const ruw = String(env.WHATSAPP_NUMMER || '0628227291').replace(/[^0-9]/g, '');
  if (!ruw) return '';
  if (ruw.startsWith('31')) return ruw;
  return `31${ruw.replace(/^0+/, '')}`;
}

/**
 * De link naar een WhatsApp-gesprek, met het eerste bericht er alvast in.
 *
 * Dat eerste bericht is geen opsmuk: wie op zo'n knop drukt, staat anders voor
 * een leeg veld en moet zelf bedenken hoe hij begint. Een halve zin die al
 * klaarstaat scheelt precies die drempel, en wij weten meteen waar het over
 * gaat.
 */
export function whatsappLink(bericht = '', env = process.env) {
  const nummer = whatsappNummer(env);
  if (!nummer) return '';
  return bericht
    ? `https://wa.me/${nummer}?text=${encodeURIComponent(bericht)}`
    : `https://wa.me/${nummer}`;
}

/** Hoe het nummer eruitziet voor een mens: 06 28 22 72 91. */
export function whatsappLeesbaar(env = process.env) {
  const nummer = whatsappNummer(env);
  if (!nummer.startsWith('31')) return nummer;
  const binnenland = `0${nummer.slice(2)}`;
  return binnenland.replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5');
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
