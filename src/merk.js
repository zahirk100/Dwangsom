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
export const MONOGRAM = `<svg class="merk__teken" viewBox="0 0 64 64" role="img" aria-label="${MERKNAAM}">
        <rect width="64" height="64" rx="14" fill="#0b1250"/>
        <path d="M19 46V18h7l12 16.5V18h7v28h-7L26 29.5V46z" fill="#fff"/>
        <circle cx="50.5" cy="17.5" r="3.4" fill="#4fb3f6"/>
      </svg>`;
