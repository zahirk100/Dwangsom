/**
 * Datumhulpjes. Alle datums worden als UTC-middernacht bewaard, zodat
 * zomertijd nooit een dag kan schelen in de dagentelling.
 */

const DAG_MS = 24 * 60 * 60 * 1000;

const MAANDEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

/** 'YYYY-MM-DD' -> timestamp (UTC-middernacht), of null bij ongeldige invoer. */
export function parseDatum(waarde) {
  if (typeof waarde !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(waarde.trim());
  if (!m) return null;
  const jaar = Number(m[1]);
  const maand = Number(m[2]);
  const dag = Number(m[3]);
  const ms = Date.UTC(jaar, maand - 1, dag);
  const d = new Date(ms);
  // Vangt 2025-02-30 en soortgelijke rolovers af.
  if (d.getUTCFullYear() !== jaar || d.getUTCMonth() !== maand - 1 || d.getUTCDate() !== dag) {
    return null;
  }
  return ms;
}

/** timestamp -> 'YYYY-MM-DD'. */
export function formatDatum(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/** timestamp -> '3 maart 2026'. */
export function toonDatum(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '–';
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MAANDEN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function plusDagen(ms, aantal) {
  return ms + aantal * DAG_MS;
}

/** Aantal hele dagen tussen twee datums (b - a). */
export function verschilDagen(a, b) {
  return Math.round((b - a) / DAG_MS);
}

/** Vandaag als UTC-middernacht. */
export function vandaag(nu = new Date()) {
  return Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), nu.getUTCDate());
}

export { DAG_MS };
