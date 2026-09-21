/**
 * Ingang voor Vercel. Deze ene serverloze functie vangt alles onder /api/ op
 * en geeft het door aan dezelfde router die `node server.js` lokaal gebruikt.
 * De pagina's en assets worden door Vercel zelf als statische bestanden
 * geserveerd; die komen hier dus niet langs.
 */

import { apiHandler, foutAfhandeling } from '../server.js';

/**
 * Het platform zet de segmenten van de catch-all route in req.query.pad. Dat
 * is de betrouwbaarste bron voor het gevraagde pad, want req.url kan bij een
 * rewrite het pad van de functie zelf bevatten. De querystring uit req.url
 * blijft behouden.
 */
function bepaalPad(req) {
  const segmenten = req.query && req.query.pad;
  const lijst = Array.isArray(segmenten) ? segmenten : (segmenten ? [segmenten] : []);
  if (lijst.length === 0) return typeof req.url === 'string' ? req.url : '/api/';

  const vraagteken = typeof req.url === 'string' ? req.url.indexOf('?') : -1;
  const zoekdeel = vraagteken === -1 ? '' : req.url.slice(vraagteken);
  return `/api/${lijst.map(encodeURIComponent).join('/')}${zoekdeel}`;
}

export default async function handler(req, res) {
  try {
    req.url = bepaalPad(req);
    await apiHandler(req, res);
  } catch (err) {
    foutAfhandeling(err, req, res);
  }
}
