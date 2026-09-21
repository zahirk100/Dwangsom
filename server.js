/**
 * Dwangsomhulp - webserver.
 *
 * Draait zonder externe afhankelijkheden: `node server.js`.
 * Publiek deel  : landingspagina en aanvraagwizard.
 * Beheerdeel    : overzicht van binnengekomen aanvragen, achter een wachtwoord.
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';

import { Store, STATUSSEN, isGeldigeStatus, labelVoorStatus } from './src/store.js';
import {
  Snelheidsbegrenzer, clientIp, leesJsonBody, parseCookies,
  serveerBestand, stuurFout, stuurJson, stuurTekst,
} from './src/http-util.js';
import { valideerAanvraag } from './src/validatie.js';
import { berekenDwangsom } from './shared/dwangsom.js';
import { BESTUURSORGANEN, ZAAKTYPEN } from './shared/catalogus.js';
import { claimBrief, ingebrekestellingBrief, briefBestandsnaam } from './shared/brief.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PUBLIEK = path.join(HIER, 'public');
const GEDEELD = path.join(HIER, 'shared');

const POORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(HIER, 'data');
const VEILIGE_COOKIE = process.env.SECURE_COOKIES === '1';
const SESSIEDUUR_MS = 8 * 60 * 60 * 1000;

let beheerWachtwoord = process.env.BEHEER_WACHTWOORD || '';
let wachtwoordGegenereerd = false;
if (!beheerWachtwoord) {
  beheerWachtwoord = randomBytes(9).toString('base64url');
  wachtwoordGegenereerd = true;
}

const store = new Store(DATA_DIR);
const sessies = new Map();

const indienBegrenzer = new Snelheidsbegrenzer({ max: 20, vensterMs: 60 * 60 * 1000 });
const loginBegrenzer = new Snelheidsbegrenzer({ max: 8, vensterMs: 15 * 60 * 1000 });

// ---------------------------------------------------------------- sessies --

function maakSessie() {
  const token = randomBytes(32).toString('hex');
  sessies.set(token, { aangemaaktOp: Date.now(), verlooptOp: Date.now() + SESSIEDUUR_MS });
  return token;
}

function geldigeSessie(req) {
  const token = parseCookies(req.headers.cookie).dh_sessie;
  if (!token) return null;
  const sessie = sessies.get(token);
  if (!sessie) return null;
  if (Date.now() > sessie.verlooptOp) {
    sessies.delete(token);
    return null;
  }
  return { token, ...sessie };
}

function sessieCookie(token, verwijder = false) {
  const delen = [
    `dh_sessie=${verwijder ? '' : token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    verwijder ? 'Max-Age=0' : `Max-Age=${Math.floor(SESSIEDUUR_MS / 1000)}`,
  ];
  if (VEILIGE_COOKIE) delen.push('Secure');
  return delen.join('; ');
}

function wachtwoordKlopt(ingevoerd) {
  const a = Buffer.from(String(ingevoerd || ''));
  const b = Buffer.from(beheerWachtwoord);
  if (a.length !== b.length) {
    // Toch vergelijken, zodat de duur niet verraadt of de lengte klopt.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

// ----------------------------------------------------------------- routes --

async function publiekeApi(req, res, url) {
  if (url.pathname === '/api/catalogus' && req.method === 'GET') {
    return stuurJson(res, 200, { bestuursorganen: BESTUURSORGANEN, zaaktypen: ZAAKTYPEN });
  }

  if (url.pathname === '/api/berekening' && req.method === 'POST') {
    const body = await leesJsonBody(req);
    const rapport = berekenDwangsom(body.invoer || body);
    return stuurJson(res, 200, { rapport });
  }

  if (url.pathname === '/api/aanvragen' && req.method === 'POST') {
    const limiet = indienBegrenzer.controleer(clientIp(req));
    if (!limiet.toegestaan) {
      return stuurFout(res, 429, 'Te veel aanvragen vanaf dit adres. Probeer het later opnieuw.');
    }
    const body = await leesJsonBody(req);
    const { geldig, fouten, invoer, contact } = valideerAanvraag(body);
    if (!geldig) {
      return stuurJson(res, 422, { fout: 'De aanvraag is niet compleet.', velden: fouten });
    }
    // De server rekent zelf; wat de browser meestuurt is alleen voorbeeld.
    const rapport = berekenDwangsom(invoer);
    const aanvraag = await store.nieuweAanvraag({
      invoer,
      contact,
      rapport,
      meta: {
        ingediendVia: 'webformulier',
        userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
      },
    });
    return stuurJson(res, 201, {
      referentie: aanvraag.referentie,
      status: aanvraag.status,
      rapport,
    });
  }

  return false;
}

async function beheerApi(req, res, url) {
  if (url.pathname === '/api/beheer/login' && req.method === 'POST') {
    const ip = clientIp(req);
    const limiet = loginBegrenzer.controleer(ip);
    if (!limiet.toegestaan) {
      return stuurFout(res, 429, `Te veel inlogpogingen. Probeer het over ${limiet.wachtSeconden} seconden opnieuw.`);
    }
    const body = await leesJsonBody(req);
    if (!wachtwoordKlopt(body.wachtwoord)) {
      return stuurFout(res, 401, 'Onjuist wachtwoord.');
    }
    loginBegrenzer.herstel(ip);
    const token = maakSessie();
    return stuurJson(res, 200, { ingelogd: true }, { 'Set-Cookie': sessieCookie(token) });
  }

  if (url.pathname === '/api/beheer/sessie' && req.method === 'GET') {
    return stuurJson(res, 200, { ingelogd: Boolean(geldigeSessie(req)) });
  }

  if (url.pathname === '/api/beheer/logout' && req.method === 'POST') {
    const sessie = geldigeSessie(req);
    if (sessie) sessies.delete(sessie.token);
    return stuurJson(res, 200, { ingelogd: false }, { 'Set-Cookie': sessieCookie('', true) });
  }

  // Alles hierna vereist een sessie.
  if (!url.pathname.startsWith('/api/beheer/')) return false;
  if (!geldigeSessie(req)) {
    return stuurFout(res, 401, 'Niet ingelogd.');
  }

  if (url.pathname === '/api/beheer/aanvragen' && req.method === 'GET') {
    const aanvragen = store.lijst({
      status: url.searchParams.get('status'),
      zoek: url.searchParams.get('zoek'),
      bestuursorgaan: url.searchParams.get('bestuursorgaan'),
    });
    return stuurJson(res, 200, {
      aanvragen: aanvragen.map(samenvatting),
      statussen: STATUSSEN,
      statistieken: store.statistieken(),
    });
  }

  if (url.pathname === '/api/beheer/export.csv' && req.method === 'GET') {
    const rijen = store.lijst({ status: url.searchParams.get('status') });
    return stuurTekst(res, 200, naarCsv(rijen), {
      'Content-Disposition': 'attachment; filename="dwangsom-aanvragen.csv"',
    });
  }

  const detail = /^\/api\/beheer\/aanvragen\/([A-Za-z0-9-]+)(\/[a-z]+)?$/.exec(url.pathname);
  if (detail) {
    const aanvraag = store.vind(detail[1]);
    if (!aanvraag) return stuurFout(res, 404, 'Aanvraag niet gevonden.');
    const subpad = detail[2];

    if (!subpad && req.method === 'GET') {
      return stuurJson(res, 200, { aanvraag, statussen: STATUSSEN });
    }

    if (!subpad && req.method === 'PATCH') {
      const body = await leesJsonBody(req);
      if (!isGeldigeStatus(body.status)) return stuurFout(res, 400, 'Onbekende status.');
      const bijgewerkt = await store.wijzigStatus(aanvraag.id, body.status, 'beheerder');
      return stuurJson(res, 200, { aanvraag: bijgewerkt });
    }

    if (subpad === '/notities' && req.method === 'POST') {
      const body = await leesJsonBody(req);
      const tekst = String(body.tekst || '').trim().slice(0, 2000);
      if (!tekst) return stuurFout(res, 400, 'Notitie is leeg.');
      const bijgewerkt = await store.voegNotitieToe(aanvraag.id, tekst, 'beheerder');
      return stuurJson(res, 200, { aanvraag: bijgewerkt });
    }

    if (subpad === '/herbereken' && req.method === 'POST') {
      const body = await leesJsonBody(req);
      const invoer = { ...aanvraag.invoer, ...(body.invoer || {}) };
      const rapport = berekenDwangsom(invoer);
      const bijgewerkt = await store.werkRapportBij(aanvraag.id, {
        invoer,
        rapport,
        door: 'beheerder',
        toelichting: body.toelichting || 'Berekening opnieuw uitgevoerd door de beheerder.',
      });
      return stuurJson(res, 200, { aanvraag: bijgewerkt });
    }

    if (subpad === '/brief' && req.method === 'GET') {
      const soort = url.searchParams.get('soort') === 'claim' ? 'claim' : 'ingebrekestelling';
      const maker = soort === 'claim' ? claimBrief : ingebrekestellingBrief;
      const tekst = maker({ invoer: aanvraag.invoer, contact: aanvraag.contact, rapport: aanvraag.rapport });
      return stuurTekst(res, 200, tekst, {
        'Content-Disposition': `attachment; filename="${briefBestandsnaam(soort, aanvraag.referentie)}"`,
      });
    }
  }

  return false;
}

function samenvatting(a) {
  const b = a.rapport && a.rapport.berekening;
  return {
    id: a.id,
    referentie: a.referentie,
    status: a.status,
    statusLabel: labelVoorStatus(a.status),
    aangemaaktOp: a.aangemaaktOp,
    gewijzigdOp: a.gewijzigdOp,
    naam: a.contact.naam,
    email: a.contact.email,
    woonplaats: a.contact.woonplaats,
    bestuursorgaan: a.invoer.bestuursorgaan,
    organisatienaam: a.invoer.organisatienaam,
    zaaktype: a.rapport && a.rapport.zaaktype ? a.rapport.zaaktype.label : a.invoer.zaaktype,
    uitkomst: a.rapport ? a.rapport.uitkomst : null,
    kop: a.rapport ? a.rapport.kop : '',
    bedrag: b ? b.totaal : 0,
    dagen: b ? b.dagen : 0,
    doorlopend: b ? Boolean(b.doorlopend) : false,
    notities: a.notities.length,
  };
}

function csvVeld(waarde) {
  const s = waarde === null || waarde === undefined ? '' : String(waarde);
  // Voorkomt formule-injectie bij openen in een spreadsheet.
  const veilig = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${veilig.replace(/"/g, '""')}"`;
}

function naarCsv(aanvragen) {
  const kop = [
    'referentie', 'status', 'ontvangen op', 'naam', 'e-mail', 'telefoon', 'woonplaats',
    'bestuursorgaan', 'organisatie', 'zaaktype', 'uitkomst', 'dagen', 'bedrag',
    'eerste dwangsomdag', 'einde beslistermijn', 'ingebrekestelling',
  ];
  const regels = [kop.map(csvVeld).join(';')];
  for (const a of aanvragen) {
    const b = (a.rapport && a.rapport.berekening) || {};
    regels.push([
      a.referentie,
      labelVoorStatus(a.status),
      a.aangemaaktOp,
      a.contact.naam,
      a.contact.email,
      a.contact.telefoon,
      a.contact.woonplaats,
      a.invoer.bestuursorgaan,
      a.invoer.organisatienaam,
      a.rapport && a.rapport.zaaktype ? a.rapport.zaaktype.label : a.invoer.zaaktype,
      a.rapport ? a.rapport.uitkomst : '',
      b.dagen || 0,
      (b.totaal || 0).toFixed(2).replace('.', ','),
      b.eersteDag || '',
      a.rapport && a.rapport.beslistermijn ? a.rapport.beslistermijn.einddatum : '',
      a.invoer.ingebrekestellingDatum || '',
    ].map(csvVeld).join(';'));
  }
  return '﻿' + regels.join('\r\n');
}

// ---------------------------------------------------------------- pagina's --

const PAGINAS = {
  '/': 'index.html',
  '/aanvraag': 'aanvraag.html',
  '/beheer': 'beheer.html',
  '/hoe-werkt-het': 'hoe-werkt-het.html',
};

async function verwerk(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');

  if (url.pathname.startsWith('/api/')) {
    const afgehandeld = (await beheerApi(req, res, url)) ?? false;
    if (afgehandeld !== false) return;
    const publiek = (await publiekeApi(req, res, url)) ?? false;
    if (publiek !== false) return;
    return stuurFout(res, 404, 'Onbekend API-pad.');
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return stuurFout(res, 405, 'Methode niet toegestaan.');
  }

  const pagina = PAGINAS[url.pathname.replace(/\/+$/, '') || '/'];
  if (pagina) {
    const ok = await serveerBestand(res, PUBLIEK, pagina);
    if (ok) return;
  }

  if (url.pathname.startsWith('/shared/')) {
    const ok = await serveerBestand(res, GEDEELD, url.pathname.slice('/shared/'.length));
    if (ok) return;
  }

  if (await serveerBestand(res, PUBLIEK, url.pathname)) return;

  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><meta charset="utf-8"><title>Niet gevonden</title>'
    + '<p style="font:16px system-ui;padding:2rem">Deze pagina bestaat niet. <a href="/">Terug naar de startpagina</a>.</p>');
}

const server = http.createServer((req, res) => {
  verwerk(req, res).catch((err) => {
    const code = err.statuscode || 500;
    if (code >= 500) console.error('[server]', err);
    if (!res.headersSent) stuurFout(res, code, err.statuscode ? err.message : 'Er ging iets mis op de server.');
    else res.end();
  });
});

export async function start(poort = POORT) {
  await store.init();
  await new Promise((resolve) => server.listen(poort, resolve));
  const adres = server.address();
  console.log(`\n  Dwangsomhulp draait op http://localhost:${adres.port}`);
  console.log(`  Beheeromgeving:        http://localhost:${adres.port}/beheer`);
  if (wachtwoordGegenereerd) {
    console.log(`  Beheerwachtwoord (gegenereerd): ${beheerWachtwoord}`);
    console.log('  Zet BEHEER_WACHTWOORD in de omgeving om een vast wachtwoord te gebruiken.\n');
  } else {
    console.log('  Beheerwachtwoord: uit BEHEER_WACHTWOORD.\n');
  }
  return server;
}

export { server, store };

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    console.error('Starten mislukt:', err);
    process.exit(1);
  });
}
