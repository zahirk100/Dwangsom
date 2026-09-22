/**
 * Inloggen in de beheeromgeving vanuit een test.
 *
 * Sinds de accounts er zijn, is inloggen geen wachtwoordje meer maar een
 * eerste beheerder aanmaken plus tweefactor instellen. Dat hoort niet in elke
 * test opnieuw te staan, dus staat het hier.
 */
import { codeVoor } from '../src/totp.js';

export const TEST_WACHTWOORD = 'een-heel-lang-testwachtwoord';

/**
 * Maakt de eerste beheerder aan, zet tweefactor aan en geeft het cookie terug.
 * @param {string} basisUrl
 * @returns {Promise<{cookie: string, metCookie: object, email: string}>}
 */
export async function logInAlsBeheerder(basisUrl, { email = 'test@nubeslist.nl' } = {}) {
  const roep = (pad, body, cookie) => fetch(basisUrl + pad, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

  const aangemaakt = await roep('/api/beheer/eerste-beheerder', {
    email, naam: 'Test Beheerder', wachtwoord: TEST_WACHTWOORD,
  });
  if (!aangemaakt.ok) {
    throw new Error(`Eerste beheerder aanmaken mislukt: ${await aangemaakt.text()}`);
  }
  const cookie = aangemaakt.headers.getSetCookie()[0].split(';')[0];

  // Zonder tweede factor kom je niet bij de dossiers.
  const start = await (await roep('/api/beheer/tweefactor/start', {}, cookie)).json();
  const bevestigd = await roep('/api/beheer/tweefactor/bevestig', { code: codeVoor(start.geheim) }, cookie);
  if (!bevestigd.ok) throw new Error(`Tweefactor bevestigen mislukt: ${await bevestigd.text()}`);

  return { cookie, metCookie: { headers: { cookie } }, email, geheim: start.geheim };
}
