/**
 * Het merk in beeld: het woordmerk voor in de pagina en het monogram als icoon.
 *
 * Het woordmerk is tekst en geen plaatje. Dat laadt niets, het kleurt mee met
 * de pagina waar het in staat, en het blijft scherp op elk scherm. Het blauwe
 * puntje erachter is het accent uit het logo.
 */

import { MERKNAAM } from '../public/shared/merk.js';

export { MERKNAAM };

/**
 * Het woordmerk.
 * @param {{klasse?: string}} [opties] extra klasse, bijvoorbeeld voor de voetregel
 */
export function woordmerk({ klasse = '' } = {}) {
  return `<span class="merk__woord${klasse ? ` ${klasse}` : ''}">${MERKNAAM}`
    + '<span class="merk__punt" aria-hidden="true"></span></span>';
}

/** Het woordmerk als link naar de startpagina, voor in de balk. */
export function merklink() {
  return `<a class="merk" href="/" aria-label="${MERKNAAM}, naar de startpagina">${woordmerk()}</a>`;
}

/**
 * Het monogram: de N in een diepblauw vlak, met het lichtblauwe punt.
 *
 * Alleen voor plekken waar een vierkant icoon hoort - het tabblad, de
 * telefoonknop, een gedeelde link. In de pagina zelf staat het woordmerk.
 */
export const MONOGRAM = `<svg class="merk__teken" viewBox="0 0 1000 1000" role="img" aria-label="${MERKNAAM}">
        <rect width="1000" height="1000" rx="220" fill="#0b1250"/>
        <path d="M226.7 770V230h130.37L593.9 559.4V230h124.2v540H593.9L350.9 431.34V770z" fill="#fff"/>
        <circle cx="782" cy="276" r="46" fill="#4fb3f6"/>
      </svg>`;
