/**
 * De hostnaam waar de site onder staat, op één plek.
 *
 * Dit stond in vijf bestanden los ingetypt, en dat was niet alleen lelijk: de
 * canonical, de sitemap en de og:url wezen naar nubeslist.nl terwijl Google
 * www.nubeslist.nl indexeert en rankt. Wij vertellen Google dan "de echte
 * versie staat hier", Google haalt die op en krijgt een omleiding. In Search
 * Console komt dat terug als "Pagina met omleiding" en "Fout met omleiding",
 * en de pagina's die het betreft worden niet opgenomen.
 *
 * Welke van de twee de echte is, bepaalt de hosting en niet deze code. Daarom
 * staat hij in een omgevingsvariabele: zet SITE_URL op precies de vorm waar de
 * site op uitkomt - inclusief https, zonder slash aan het eind - en alles
 * volgt.
 */

/*
 * www, want dat is het domein waar de site op uitkomt (Vercel) en wat Google
 * indexeert en rankt: 97 van de 100 vertoningen staan op www. De canonical, de
 * sitemap en de og:url wezen naar de versie zónder www, en dat is precies de
 * tegenstrijdigheid waar Search Console over klaagde.
 */
const STANDAARD = 'https://www.nubeslist.nl';

/** Zonder slash aan het eind, want overal plakken wij er zelf een pad achter. */
export function siteBasis(env = process.env) {
  const ruw = String(env.SITE_URL || STANDAARD).trim();
  const schoon = ruw.replace(/\/+$/, '');
  return /^https?:\/\/[^/\s]+$/.test(schoon) ? schoon : STANDAARD;
}

/** De hostnaam zelf, voor waar alleen de naam past. */
export function siteNaam(env = process.env) {
  return siteBasis(env).replace(/^https?:\/\//, '');
}

/**
 * Wanneer de inhoud van de site voor het laatst echt veranderd is.
 *
 * Dit stond op "vandaag", opnieuw bij elke build. Google ziet dan zevenentwintig
 * pagina's die elke dag wijzigen terwijl er niets verandert, leert die datum te
 * negeren, en besteedt zijn crawlbudget - op een nieuw domein toch al karig -
 * aan pagina's die het niet nodig hebben.
 *
 * Daarom met de hand. Verander je de tekst van een pagina, zet deze datum dan
 * mee. Een datum die blijft staan is niet erg; een datum die elke dag opschuift
 * terwijl er niets gebeurt, is een signaal dat je kwijtraakt.
 */
export const INHOUD_GEWIJZIGD = '2026-10-08';
