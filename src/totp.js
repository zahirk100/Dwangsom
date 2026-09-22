/**
 * Tweefactor met een authenticator-app (RFC 6238, TOTP).
 *
 * Een medewerker scant één keer een QR-code en voert daarna elke keer een
 * code van zes cijfers in. De rekenkant is klein genoeg om hem hier te doen:
 * HMAC-SHA1 over het tijdvak, en daar zes cijfers uit knippen. node:crypto
 * kan dat allemaal, dus er is geen bibliotheek voor nodig.
 *
 * Er zit bewust geen sms in. Een sms-code is te onderscheppen en kost geld;
 * een app is gratis en veiliger.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TIJDVAK_SECONDEN = 30;
const CIJFERS = 6;
/** Eén tijdvak speling naar voren en naar achteren, voor een scheve klok. */
const SPELING = 1;

const BASIS32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Bytes naar base32, want dat is wat authenticator-apps verwachten. */
export function naarBasis32(bytes) {
  let bits = 0;
  let waarde = 0;
  let uit = '';
  for (const byte of bytes) {
    waarde = (waarde << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      uit += BASIS32[(waarde >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) uit += BASIS32[(waarde << (5 - bits)) & 31];
  return uit;
}

/** Base32 terug naar bytes. Spaties en padding worden genegeerd. */
export function vanBasis32(tekst) {
  const schoon = String(tekst || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let waarde = 0;
  const bytes = [];
  for (const teken of schoon) {
    const index = BASIS32.indexOf(teken);
    if (index === -1) continue;
    waarde = (waarde << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((waarde >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Een vers geheim voor één medewerker. */
export function nieuwGeheim() {
  return naarBasis32(randomBytes(20));
}

/**
 * De code die op dit moment geldig is.
 * @param {string} geheim base32
 * @param {number} nu milliseconden sinds 1970
 */
export function codeVoor(geheim, nu = Date.now()) {
  return codeVoorTijdvak(vanBasis32(geheim), Math.floor(nu / 1000 / TIJDVAK_SECONDEN));
}

function codeVoorTijdvak(sleutel, tijdvak) {
  const teller = Buffer.alloc(8);
  // Een tijdvak past ruim in 32 bits tot ver na het jaar 4000.
  teller.writeUInt32BE(Math.floor(tijdvak / 2 ** 32), 0);
  teller.writeUInt32BE(tijdvak >>> 0, 4);

  const hash = createHmac('sha1', sleutel).update(teller).digest();
  // Dynamische truncatie: de laatste vier bits wijzen aan waar je knipt.
  const begin = hash[hash.length - 1] & 0x0f;
  const getal = ((hash[begin] & 0x7f) << 24)
    | (hash[begin + 1] << 16)
    | (hash[begin + 2] << 8)
    | hash[begin + 3];
  return String(getal % 10 ** CIJFERS).padStart(CIJFERS, '0');
}

/**
 * Klopt de ingevoerde code?
 *
 * Vergelijkt in vaste tijd en accepteert één tijdvak speling, zodat een
 * telefoon die een halve minuut voor of achter loopt geen probleem is.
 *
 * @param {string} geheim base32
 * @param {string} ingevoerd wat de medewerker intypte
 * @param {number} nu
 */
export function codeKlopt(geheim, ingevoerd, nu = Date.now()) {
  const schoon = String(ingevoerd || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(schoon) || !geheim) return false;

  const sleutel = vanBasis32(geheim);
  if (sleutel.length === 0) return false;
  const huidig = Math.floor(nu / 1000 / TIJDVAK_SECONDEN);

  let goed = false;
  for (let stap = -SPELING; stap <= SPELING; stap += 1) {
    const verwacht = Buffer.from(codeVoorTijdvak(sleutel, huidig + stap));
    const gekregen = Buffer.from(schoon);
    // Altijd alle tijdvakken doorlopen, ook na een treffer: stoppen bij de
    // eerste match maakt de antwoordtijd afhankelijk van de code.
    if (verwacht.length === gekregen.length && timingSafeEqual(verwacht, gekregen)) goed = true;
  }
  return goed;
}

/**
 * De tekst achter de QR-code die de authenticator-app inleest.
 * @param {{geheim: string, email: string, uitgever?: string}} gegevens
 */
export function otpauthUrl({ geheim, email, uitgever = 'nubeslist.nl' }) {
  const naam = encodeURIComponent(`${uitgever}:${email}`);
  const vragen = new URLSearchParams({
    secret: geheim,
    issuer: uitgever,
    algorithm: 'SHA1',
    digits: String(CIJFERS),
    period: String(TIJDVAK_SECONDEN),
  });
  return `otpauth://totp/${naam}?${vragen.toString()}`;
}

/**
 * Herstelcodes, voor als de telefoon kwijt is.
 *
 * Ze worden gehasht opgeslagen, precies zoals een wachtwoord, en zijn
 * eenmalig. Zonder deze codes is een kwijtgeraakte telefoon een verloren
 * account, en dat wil je bij een beheeromgeving niet.
 */
export function nieuweHerstelcodes(aantal = 8) {
  return Array.from({ length: aantal }, () => {
    const ruw = randomBytes(5).toString('hex').toUpperCase();
    return `${ruw.slice(0, 5)}-${ruw.slice(5)}`;
  });
}
