/**
 * Sessies zonder serverstatus.
 *
 * Op een serverloos platform draait elke request mogelijk op een andere
 * instantie, dus een lijstje met tokens in het geheugen werkt daar niet: de
 * beheerder zou willekeurig uitgelogd raken. Daarom is het cookie zelf het
 * bewijs: een vervaltijd met een HMAC-handtekening eroverheen.
 *
 * De sleutel komt uit SESSIE_GEHEIM, of anders uit het beheerwachtwoord.
 * Wijzigt het wachtwoord, dan vervallen alle lopende sessies. Dat is precies
 * wat je wilt.
 */

import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSIEDUUR_MS = 8 * 60 * 60 * 1000;
const COOKIE_NAAM = 'dh_sessie';

export function sessieSleutel(env = process.env) {
  const geheim = env.SESSIE_GEHEIM || env.BEHEER_WACHTWOORD;
  if (geheim) return createHash('sha256').update(`dwangsomhulp:${geheim}`).digest();
  // Geen geheim ingesteld: alleen zinvol lokaal, en dan is een verse sleutel
  // per start juist netjes.
  return randomBytes(32);
}

function handtekening(sleutel, gegevens) {
  return createHmac('sha256', sleutel).update(gegevens).digest('base64url');
}

export function maakToken(sleutel, nu = Date.now(), duurMs = SESSIEDUUR_MS) {
  const verlooptOp = nu + duurMs;
  return `${verlooptOp}.${handtekening(sleutel, String(verlooptOp))}`;
}

export function tokenIsGeldig(sleutel, token, nu = Date.now()) {
  if (typeof token !== 'string') return false;
  const scheiding = token.indexOf('.');
  if (scheiding <= 0) return false;
  const verlooptOp = Number(token.slice(0, scheiding));
  const meegestuurd = token.slice(scheiding + 1);
  if (!Number.isFinite(verlooptOp) || verlooptOp < nu) return false;

  const verwacht = Buffer.from(handtekening(sleutel, String(verlooptOp)));
  const gekregen = Buffer.from(meegestuurd);
  if (verwacht.length !== gekregen.length) {
    timingSafeEqual(verwacht, verwacht);
    return false;
  }
  return timingSafeEqual(verwacht, gekregen);
}

export function sessieCookie(token, { verwijder = false, veilig = false } = {}) {
  const delen = [
    `${COOKIE_NAAM}=${verwijder ? '' : token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    verwijder ? 'Max-Age=0' : `Max-Age=${Math.floor(SESSIEDUUR_MS / 1000)}`,
  ];
  if (veilig) delen.push('Secure');
  return delen.join('; ');
}

export { COOKIE_NAAM };
