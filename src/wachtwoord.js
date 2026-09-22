/**
 * Wachtwoorden bewaren zonder ze te bewaren.
 *
 * Wat hier de deur uit gaat is `scrypt$<n>$<r>$<p>$<zout>$<sleutel>`. scrypt
 * zit in node:crypto en is bewust traag en geheugenvretend: een gestolen
 * database laat zich daarmee niet in een middag doorrekenen. De parameters
 * staan in de hash zelf, zodat ze later verhoogd kunnen worden zonder dat de
 * oude wachtwoorden ongeldig worden.
 *
 * Voor de aanvrager is er geen wachtwoord. Die logt in met een e-mailkoppeling
 * (zie src/gebruikers.js); dit is alleen voor medewerkers.
 */

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Kosten. N=16384 met r=8 kost ongeveer 16 MB en een paar honderd milliseconden
 * op een gemiddelde serverloze instantie. Hoger is veiliger maar geeft op
 * Vercel kans op een time-out bij het inloggen.
 */
const KOSTEN = { N: 16384, r: 8, p: 1 };
const SLEUTELLENGTE = 32;
const ZOUTLENGTE = 16;

/** Minimale eisen. Lengte doet meer dan tekensoorten, dus daar zit de eis. */
export const MINIMALE_LENGTE = 12;

function afleiden(wachtwoord, zout, kosten) {
  return new Promise((klaar, mislukt) => {
    scrypt(
      Buffer.from(String(wachtwoord), 'utf8'),
      zout,
      SLEUTELLENGTE,
      { N: kosten.N, r: kosten.r, p: kosten.p, maxmem: 256 * 1024 * 1024 },
      (err, sleutel) => (err ? mislukt(err) : klaar(sleutel)),
    );
  });
}

/**
 * @param {string} wachtwoord
 * @returns {Promise<string>} de hash zoals die de opslag in gaat
 */
export async function hashWachtwoord(wachtwoord) {
  const zout = randomBytes(ZOUTLENGTE);
  const sleutel = await afleiden(wachtwoord, zout, KOSTEN);
  return ['scrypt', KOSTEN.N, KOSTEN.r, KOSTEN.p,
    zout.toString('base64url'), sleutel.toString('base64url')].join('$');
}

/**
 * Controleert een wachtwoord tegen een opgeslagen hash.
 *
 * Vergelijkt in vaste tijd, zodat het aantal kloppende beginletters niet uit
 * de antwoordtijd is af te leiden.
 *
 * @param {string} wachtwoord
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function wachtwoordKlopt(wachtwoord, hash) {
  if (typeof hash !== 'string' || typeof wachtwoord !== 'string') return false;
  const delen = hash.split('$');
  if (delen.length !== 6 || delen[0] !== 'scrypt') return false;

  const [, n, r, p, zoutB64, sleutelB64] = delen;
  const kosten = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isInteger(kosten.N) || !Number.isInteger(kosten.r) || !Number.isInteger(kosten.p)) return false;
  // Een hash met onzinnig hoge kosten zou het proces laten hangen.
  if (kosten.N > 1 << 20 || kosten.r > 32 || kosten.p > 16) return false;

  let verwacht;
  let gekregen;
  try {
    verwacht = Buffer.from(sleutelB64, 'base64url');
    gekregen = await afleiden(wachtwoord, Buffer.from(zoutB64, 'base64url'), kosten);
  } catch {
    return false;
  }
  if (verwacht.length !== gekregen.length) return false;
  return timingSafeEqual(verwacht, gekregen);
}

/**
 * Is dit wachtwoord goed genoeg om te accepteren?
 * @returns {string} lege tekst als het klopt, anders de reden
 */
export function keurWachtwoord(wachtwoord) {
  const waarde = String(wachtwoord || '');
  if (waarde.length < MINIMALE_LENGTE) {
    return `Kies een wachtwoord van minstens ${MINIMALE_LENGTE} tekens.`;
  }
  if (waarde.length > 200) return 'Dat wachtwoord is te lang.';
  // Eén herhaald teken haalt de lengte-eis wel, maar stelt niets voor.
  if (new Set(waarde).size < 5) return 'Gebruik wat meer verschillende tekens.';
  return '';
}
