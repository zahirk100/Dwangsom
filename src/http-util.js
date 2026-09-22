/** Kleine helpers voor de HTTP-laag: geen framework, wel nette bouwstenen. */

import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  // Zonder deze regel serveert de sitemap als application/octet-stream en
  // weigert Search Console hem te lezen.
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export const MAX_BODY_BYTES = 64 * 1024;
/** Een geüploade brief mag groter zijn: een pdf van een paar pagina's in base64. */
export const MAX_UPLOAD_BYTES = 9 * 1024 * 1024;

export function stuurJson(res, statuscode, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(statuscode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
  return true;
}

export function stuurTekst(res, statuscode, tekst, extraHeaders = {}) {
  const body = Buffer.from(tekst, 'utf8');
  res.writeHead(statuscode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
  return true;
}

export function stuurHtml(res, statuscode, html, extraHeaders = {}) {
  const body = Buffer.from(html, 'utf8');
  res.writeHead(statuscode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    ...extraHeaders,
  });
  res.end(body);
  return true;
}

export function stuurFout(res, statuscode, melding, details) {
  return stuurJson(res, statuscode, { fout: melding, details: details || undefined });
}

export async function leesJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  // Serverloze platforms (Vercel) lezen de body zelf al en zetten die op
  // req.body; de stream is dan leeg. Daarom eerst daar kijken.
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    try {
      return JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body));
    } catch {
      const err = new Error('Ongeldige JSON in het verzoek.');
      err.statuscode = 400;
      throw err;
    }
  }

  const stukken = [];
  let lengte = 0;
  for await (const stuk of req) {
    lengte += stuk.length;
    if (lengte > maxBytes) {
      const err = new Error('Verzoek is te groot.');
      err.statuscode = 413;
      throw err;
    }
    stukken.push(stuk);
  }
  if (lengte === 0) return {};
  try {
    return JSON.parse(Buffer.concat(stukken).toString('utf8'));
  } catch {
    const err = new Error('Ongeldige JSON in het verzoek.');
    err.statuscode = 400;
    throw err;
  }
}

/**
 * Serveert een bestand uit een toegestane map. Pad wordt genormaliseerd en
 * gecontroleerd, zodat ../ nooit buiten de map kan wijzen.
 */
export async function serveerBestand(res, wortel, relatiefPad, { cacheSeconden = 0 } = {}) {
  const schoon = path.normalize(decodeURIComponent(relatiefPad)).replace(/^(\.\.[/\\])+/, '');
  const volledig = path.join(wortel, schoon);
  if (!volledig.startsWith(path.resolve(wortel) + path.sep) && volledig !== path.resolve(wortel)) {
    return false;
  }
  let stat;
  try {
    stat = await fs.stat(volledig);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const type = MIME[path.extname(volledig).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': cacheSeconden > 0 ? `public, max-age=${cacheSeconden}` : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  await new Promise((resolve, reject) => {
    const stroom = createReadStream(volledig);
    stroom.on('error', reject);
    stroom.on('end', resolve);
    stroom.pipe(res);
  });
  return true;
}

export function parseCookies(header) {
  const uit = {};
  if (!header) return uit;
  for (const deel of header.split(';')) {
    const index = deel.indexOf('=');
    if (index === -1) continue;
    const naam = deel.slice(0, index).trim();
    const waarde = deel.slice(index + 1).trim();
    if (naam) uit[naam] = decodeURIComponent(waarde);
  }
  return uit;
}

/** Eenvoudige teller per IP binnen een tijdvenster. */
export class Snelheidsbegrenzer {
  constructor({ max, vensterMs }) {
    this.max = max;
    this.vensterMs = vensterMs;
    this.tellers = new Map();
  }

  controleer(sleutel) {
    const nu = Date.now();
    const bestaand = this.tellers.get(sleutel);
    if (!bestaand || nu > bestaand.reset) {
      this.tellers.set(sleutel, { aantal: 1, reset: nu + this.vensterMs });
      this.opruimen(nu);
      return { toegestaan: true, resterend: this.max - 1 };
    }
    bestaand.aantal += 1;
    if (bestaand.aantal > this.max) {
      return { toegestaan: false, wachtSeconden: Math.ceil((bestaand.reset - nu) / 1000) };
    }
    return { toegestaan: true, resterend: this.max - bestaand.aantal };
  }

  herstel(sleutel) {
    this.tellers.delete(sleutel);
  }

  opruimen(nu = Date.now()) {
    if (this.tellers.size < 500) return;
    for (const [sleutel, waarde] of this.tellers) {
      if (nu > waarde.reset) this.tellers.delete(sleutel);
    }
  }
}

export function clientIp(req) {
  return req.socket.remoteAddress || 'onbekend';
}
