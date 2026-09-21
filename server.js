/**
 * Dwangsomhulp - webserver.
 *
 * Draait op twee manieren:
 *   - `node server.js` op een gewone server of lokaal;
 *   - als serverloze functie op Vercel, via api/[...pad].js, die `apiHandler`
 *     hergebruikt. Statische bestanden worden daar door het platform zelf
 *     geserveerd.
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';

import { Store, STATUSSEN, SOORTEN, isGeldigeStatus, labelVoorStatus, labelVoorSoort } from './src/store.js';
import { kiesOpslag } from './src/opslag.js';
import { maakToken, tokenIsGeldig, sessieCookie, sessieSleutel, COOKIE_NAAM } from './src/sessie.js';
import {
  MAX_UPLOAD_BYTES, Snelheidsbegrenzer, clientIp, leesJsonBody, parseCookies,
  serveerBestand, stuurFout, stuurHtml, stuurJson, stuurTekst,
} from './src/http-util.js';
import { machtigingContext, machtigingHtml } from './src/machtiging.js';
import { organisatiegegevens, ontbrekendeOrganisatiegegevens } from './src/organisatie.js';
import { valideerAanvraag, valideerBijwerking } from './src/validatie.js';
import { berekenDwangsom } from './public/shared/dwangsom.js';
import { parseDatum } from './public/shared/datum.js';
import { bepaalDossiereisen, dossierStatus } from './public/shared/dossier.js';
import { herkenBrief, herkendeVelden, naarInvoer } from './src/briefherkenning.js';
import { leesBrief } from './src/brieflezer.js';
import { BESTUURSORGANEN, ZAAKTYPEN } from './public/shared/catalogus.js';
import { claimBrief, ingebrekestellingBrief, briefBestandsnaam } from './public/shared/brief.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PUBLIEK = path.join(HIER, 'public');

const POORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(HIER, 'data');
const OP_VERCEL = Boolean(process.env.VERCEL);

/**
 * Testschakelaar: met BEHEER_OPEN=1 is de beheeromgeving zonder wachtwoord
 * bereikbaar. Bedoeld om te kunnen proefdraaien; de omgeving laat er een
 * duidelijke waarschuwing bij zien. Vóór livegang haal je de variabele weg,
 * meer is er niet voor nodig.
 */
const BEHEER_OPEN = process.env.BEHEER_OPEN === '1';

/**
 * Welke funnel staat op /aanvraag? De nieuwe (brief uploaden) is standaard;
 * met FUNNEL=klassiek staat de oude vragenwizard daar weer. Beide blijven
 * altijd bereikbaar op hun eigen adres, zodat terugschakelen niets kost.
 */
const FUNNEL = process.env.FUNNEL === 'klassiek' ? 'klassiek' : 'nieuw';

let beheerWachtwoord = process.env.BEHEER_WACHTWOORD || '';
export const wachtwoordGegenereerd = !beheerWachtwoord;
if (!beheerWachtwoord) beheerWachtwoord = randomBytes(9).toString('base64url');

/**
 * Zonder BEHEER_WACHTWOORD verzint elke instantie een eigen wachtwoord. Lokaal
 * is dat prima: er is één proces en het wachtwoord komt in beeld bij het
 * starten. Serverloos is het onbruikbaar - elke instantie zou een ander
 * wachtwoord en een andere sessiesleutel hebben. Dan is inloggen niet stuk,
 * maar onmogelijk, en dat moet de beheerpagina eerlijk kunnen zeggen.
 */
const beheerOnbruikbaar = wachtwoordGegenereerd && OP_VERCEL && !BEHEER_OPEN;

const SLEUTEL = sessieSleutel({ ...process.env, BEHEER_WACHTWOORD: beheerWachtwoord });

const opslag = kiesOpslag({ dataDir: DATA_DIR });
const store = new Store({ opslag });

/** Init gebeurt één keer, ook als er tien requests tegelijk binnenkomen. */
let initBelofte = null;
function gereed() {
  if (!initBelofte) initBelofte = store.init();
  return initBelofte;
}

const indienBegrenzer = new Snelheidsbegrenzer({ max: 20, vensterMs: 60 * 60 * 1000 });
const briefBegrenzer = new Snelheidsbegrenzer({ max: 40, vensterMs: 60 * 60 * 1000 });
const loginBegrenzer = new Snelheidsbegrenzer({ max: 8, vensterMs: 15 * 60 * 1000 });

// ---------------------------------------------------------------- sessie --

function overHttps(req) {
  return OP_VERCEL || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function veiligeCookie(req) {
  return process.env.SECURE_COOKIES === '1' || overHttps(req);
}

function ingelogd(req) {
  if (BEHEER_OPEN) return true;
  return tokenIsGeldig(SLEUTEL, parseCookies(req.headers.cookie)[COOKIE_NAAM]);
}

function wachtwoordKlopt(ingevoerd) {
  const gekregen = Buffer.from(String(ingevoerd || ''));
  const verwacht = Buffer.from(beheerWachtwoord);
  if (gekregen.length !== verwacht.length) {
    // Toch vergelijken, zodat de duur niet verraadt of de lengte klopt.
    timingSafeEqual(verwacht, verwacht);
    return false;
  }
  return timingSafeEqual(gekregen, verwacht);
}

// ----------------------------------------------------------------- routes --

async function publiekeApi(req, res, url) {
  if (url.pathname === '/api/versie' && req.method === 'GET') {
    // Zodat in één oogopslag te zien is welke versie er echt draait. Zonder
    // dit blijft "ik zie geen verandering" giswerk tussen cache, branch en
    // een mislukte deploy.
    return stuurJson(res, 200, {
      commit: String(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'lokaal',
      branch: process.env.VERCEL_GIT_COMMIT_REF || 'lokaal',
      funnel: FUNNEL,
      opslag: opslag.soort,
      beheerOpen: BEHEER_OPEN,
      tijd: new Date().toISOString(),
    });
  }

  if (url.pathname === '/api/catalogus' && req.method === 'GET') {
    return stuurJson(res, 200, { bestuursorganen: BESTUURSORGANEN, zaaktypen: ZAAKTYPEN });
  }

  if (url.pathname === '/api/berekening' && req.method === 'POST') {
    const body = await leesJsonBody(req);
    return stuurJson(res, 200, { rapport: berekenDwangsom(body.invoer || body) });
  }

  if (url.pathname === '/api/brief' && req.method === 'POST') {
    const limiet = briefBegrenzer.controleer(clientIp(req));
    if (!limiet.toegestaan) {
      return stuurFout(res, 429, 'Te veel brieven vanaf dit adres. Probeer het later opnieuw.');
    }
    const body = await leesJsonBody(req, MAX_UPLOAD_BYTES);
    const gelezen = leesBrief(body);
    if (!gelezen.gelukt) {
      return stuurJson(res, 422, { fout: gelezen.reden, soort: gelezen.soort, hint: gelezen.hint });
    }

    const herkenning = herkenBrief(gelezen.tekst);
    if (!herkenning.leesbaar) {
      return stuurJson(res, 422, { fout: herkenning.reden });
    }

    const invoer = naarInvoer(herkenning);
    // Alleen rekenen als er genoeg uit de brief kwam; anders vraagt de funnel
    // het ontbrekende alsnog.
    const rapport = invoer.zaaktype && invoer.basisdatum ? berekenDwangsom(invoer) : null;

    return stuurJson(res, 200, {
      herkenning,
      velden: herkendeVelden(herkenning),
      invoer,
      rapport,
      brief: {
        bron: gelezen.bron,
        bestandsnaam: String(body.bestandsnaam || '').slice(0, 120),
        tekens: gelezen.tekst.length,
        tekst: gelezen.tekst,
      },
    });
  }

  if (url.pathname === '/api/aanvragen' && req.method === 'POST') {
    const limiet = indienBegrenzer.controleer(clientIp(req));
    if (!limiet.toegestaan) {
      return stuurFout(res, 429, 'Te veel aanvragen vanaf dit adres. Probeer het later opnieuw.');
    }
    const body = await leesJsonBody(req);
    const gevalideerd = valideerAanvraag(body);
    if (!gevalideerd.geldig) {
      return stuurJson(res, 422, { fout: 'De aanvraag is niet compleet.', velden: gevalideerd.fouten });
    }
    const { invoer, contact, stukken, rapport, brief, verlengbrief, handtekening, herkomst } = gevalideerd;
    const aanvraag = await store.nieuweAanvraag({
      invoer,
      contact,
      rapport,
      stukken,
      brief,
      verlengbrief,
      handtekening,
      meta: {
        ingediendVia: herkomst,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
      },
    });
    return stuurJson(res, 201, {
      referentie: aanvraag.referentie,
      status: aanvraag.status,
      soort: aanvraag.soort,
      rapport,
    });
  }

  return false;
}

async function beheerApi(req, res, url) {
  if (url.pathname === '/api/beheer/login' && req.method === 'POST') {
    if (BEHEER_OPEN) return stuurJson(res, 200, { ingelogd: true, open: true });
    const ip = clientIp(req);
    const limiet = loginBegrenzer.controleer(ip);
    if (!limiet.toegestaan) {
      return stuurFout(res, 429, `Te veel inlogpogingen. Probeer het over ${limiet.wachtSeconden} seconden opnieuw.`);
    }
    if (beheerOnbruikbaar) {
      return stuurFout(res, 503, 'Er is nog geen beheerwachtwoord ingesteld voor deze omgeving.');
    }
    const body = await leesJsonBody(req);
    if (!wachtwoordKlopt(body.wachtwoord)) return stuurFout(res, 401, 'Onjuist wachtwoord.');
    loginBegrenzer.herstel(ip);
    const cookie = sessieCookie(maakToken(SLEUTEL), { veilig: veiligeCookie(req) });
    return stuurJson(res, 200, { ingelogd: true }, { 'Set-Cookie': cookie });
  }

  if (url.pathname === '/api/beheer/sessie' && req.method === 'GET') {
    return stuurJson(res, 200, {
      ingelogd: ingelogd(req),
      open: BEHEER_OPEN,
      wachtwoordIngesteld: !wachtwoordGegenereerd,
      serverloos: OP_VERCEL,
      instelbaar: beheerOnbruikbaar && !BEHEER_OPEN,
    });
  }

  if (url.pathname === '/api/beheer/logout' && req.method === 'POST') {
    const cookie = sessieCookie('', { verwijder: true, veilig: veiligeCookie(req) });
    return stuurJson(res, 200, { ingelogd: false }, { 'Set-Cookie': cookie });
  }

  if (!url.pathname.startsWith('/api/beheer/')) return false;
  if (!ingelogd(req)) return stuurFout(res, 401, 'Niet ingelogd.');

  if (url.pathname === '/api/beheer/aanvragen' && req.method === 'GET') {
    const aanvragen = await store.lijst({
      status: url.searchParams.get('status'),
      zoek: url.searchParams.get('zoek'),
      bestuursorgaan: url.searchParams.get('bestuursorgaan'),
      soort: url.searchParams.get('soort'),
      actie: url.searchParams.get('actie'),
    });
    return stuurJson(res, 200, {
      aanvragen: aanvragen.map(samenvatting),
      statussen: STATUSSEN,
      soorten: SOORTEN,
      statistieken: await store.statistieken(),
      opslag: { soort: opslag.soort, duurzaam: opslag.duurzaam, omschrijving: opslag.omschrijving },
      open: BEHEER_OPEN,
    });
  }

  if (url.pathname === '/api/beheer/export.csv' && req.method === 'GET') {
    const rijen = await store.lijst({ status: url.searchParams.get('status') });
    return stuurTekst(res, 200, naarCsv(rijen), {
      'Content-Disposition': 'attachment; filename="dwangsom-aanvragen.csv"',
    });
  }

  const detail = /^\/api\/beheer\/aanvragen\/([A-Za-z0-9-]+)(\/[a-z]+)?$/.exec(url.pathname);
  if (detail) {
    const aanvraag = await store.vind(detail[1]);
    if (!aanvraag) return stuurFout(res, 404, 'Aanvraag niet gevonden.');
    const subpad = detail[2];

    if (!subpad && req.method === 'GET') {
      return stuurJson(res, 200, {
        aanvraag,
        statussen: STATUSSEN,
        soorten: SOORTEN,
        eisen: bepaalDossiereisen(aanvraag),
        machtiging: {
          ...(aanvraag.machtiging || {}),
          ontbrekendeGegevens: machtigingContext(aanvraag, organisatiegegevens()).ontbreekt,
          ontbrekendeOrganisatiegegevens: ontbrekendeOrganisatiegegevens(),
        },
      });
    }

    if (!subpad && req.method === 'PATCH') {
      const body = await leesJsonBody(req);
      if (!isGeldigeStatus(body.status)) return stuurFout(res, 400, 'Onbekende status.');
      return stuurJson(res, 200, { aanvraag: await store.wijzigStatus(aanvraag.id, body.status, 'beheerder') });
    }

    if (subpad === '/notities' && req.method === 'POST') {
      const body = await leesJsonBody(req);
      const tekst = String(body.tekst || '').trim().slice(0, 2000);
      if (!tekst) return stuurFout(res, 400, 'Notitie is leeg.');
      return stuurJson(res, 200, { aanvraag: await store.voegNotitieToe(aanvraag.id, tekst, 'beheerder') });
    }

    if (subpad === '/machtiging' && req.method === 'GET') {
      return stuurHtml(res, 200, machtigingHtml(aanvraag, organisatiegegevens()));
    }

    if (subpad === '/machtiging' && req.method === 'POST') {
      const body = await leesJsonBody(req);
      const bijgewerkt = await store.werkMachtigingBij(aanvraag.id, body.actie, 'beheerder');
      if (!bijgewerkt) return stuurFout(res, 400, 'Onbekende actie voor de machtiging.');
      return stuurJson(res, 200, { aanvraag: bijgewerkt });
    }

    if (subpad === '/stukken' && req.method === 'POST') {
      const body = await leesJsonBody(req);
      const ingestuurd = (body && typeof body.stukken === 'object' && body.stukken) || {};
      const toegestaan = new Set(bepaalDossiereisen(aanvraag).stukken.map((stuk) => stuk.id));
      const stukken = Object.fromEntries(
        Object.entries(ingestuurd).filter(([id]) => toegestaan.has(id)).map(([id, aan]) => [id, Boolean(aan)]),
      );
      return stuurJson(res, 200, { aanvraag: await store.werkStukkenBij(aanvraag.id, stukken, 'beheerder') });
    }

    if (subpad === '/bijwerken' && req.method === 'POST') {
      const body = await leesJsonBody(req);
      const { contact, invoer, fouten, gewijzigd } = valideerBijwerking(aanvraag, body);
      if (Object.keys(fouten).length > 0) {
        return stuurJson(res, 422, { fout: 'Deze gegevens kloppen niet.', velden: fouten });
      }
      const nieuweInvoer = { ...aanvraag.invoer, ...invoer };
      const bijgewerkt = await store.werkDossierBij(aanvraag.id, {
        contact,
        invoer: nieuweInvoer,
        rapport: berekenDwangsom(nieuweInvoer),
        door: 'beheerder',
        toelichting: typeof body.toelichting === 'string' ? body.toelichting.slice(0, 300) : '',
        gewijzigd,
      });
      return stuurJson(res, 200, { aanvraag: bijgewerkt, eisen: bepaalDossiereisen(bijgewerkt) });
    }

    if (subpad === '/afhandeling' && req.method === 'POST') {
      const body = await leesJsonBody(req);
      const bedrag = Number(body.bedragToegekend);
      const afhandeling = {
        bedragToegekend: Number.isFinite(bedrag) && bedrag >= 0 ? Math.round(bedrag * 100) / 100 : null,
        beschikkingOp: parseDatum(body.beschikkingOp) ? String(body.beschikkingOp) : '',
        uitbetaaldOp: parseDatum(body.uitbetaaldOp) ? String(body.uitbetaaldOp) : '',
        toelichting: typeof body.toelichting === 'string' ? body.toelichting.trim().slice(0, 1000) : '',
        status: isGeldigeStatus(body.status) ? body.status : null,
      };
      return stuurJson(res, 200, {
        aanvraag: await store.legAfhandelingVast(aanvraag.id, afhandeling, 'beheerder'),
      });
    }

    if (subpad === '/herbereken' && req.method === 'POST') {
      const body = await leesJsonBody(req);
      const invoer = { ...aanvraag.invoer, ...(body.invoer || {}) };
      const bijgewerkt = await store.werkRapportBij(aanvraag.id, {
        invoer,
        rapport: berekenDwangsom(invoer),
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
  const vervolg = (a.rapport && a.rapport.vervolg) || {};
  const status = dossierStatus(a);
  return {
    id: a.id,
    referentie: a.referentie,
    soort: a.soort || 'beoordeling',
    soortLabel: labelVoorSoort(a.soort),
    actiedatum: a.actiedatum || null,
    actieLabel: vervolg.actieLabel || '',
    stukkenOntbreken: status.ontbreekt.length,
    dossierCompleet: status.compleet,
    gegevensOntbreken: bepaalDossiereisen(a).gegevens
      .filter((g) => g.verplicht && !String((a.contact || {})[g.id] || '').trim()).length,
    bedragToegekend: a.afhandeling && Number.isFinite(a.afhandeling.bedragToegekend)
      ? a.afhandeling.bedragToegekend : null,
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

function csvVeld(input) {
  const s = input === null || input === undefined ? '' : String(input);
  // Voorkomt formule-injectie bij openen in een spreadsheet.
  const veilig = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${veilig.replace(/"/g, '""')}"`;
}

function naarCsv(aanvragen) {
  const kop = [
    'referentie', 'soort', 'status', 'actiedatum', 'ontvangen op', 'naam', 'e-mail', 'telefoon',
    'woonplaats', 'bestuursorgaan', 'organisatie', 'zaaktype', 'uitkomst', 'dagen', 'bedrag',
    'eerste dwangsomdag', 'einde beslistermijn', 'ingebrekestelling', 'stukken ontbreken',
    'toegekend bedrag', 'beschikking op', 'uitbetaald op',
  ];
  const regels = [kop.map(csvVeld).join(';')];
  for (const a of aanvragen) {
    const b = (a.rapport && a.rapport.berekening) || {};
    regels.push([
      a.referentie,
      labelVoorSoort(a.soort),
      labelVoorStatus(a.status),
      a.actiedatum || '',
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
      dossierStatus(a).ontbreekt.map((stuk) => stuk.label).join(' | '),
      a.afhandeling && Number.isFinite(a.afhandeling.bedragToegekend)
        ? a.afhandeling.bedragToegekend.toFixed(2).replace('.', ',') : '',
      (a.afhandeling && a.afhandeling.beschikkingOp) || '',
      (a.afhandeling && a.afhandeling.uitbetaaldOp) || '',
    ].map(csvVeld).join(';'));
  }
  return '﻿' + regels.join('\r\n');
}

// ------------------------------------------------------------- afhandeling --

function standaardHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
}

/** Alleen de API. Dit is wat de serverloze functie op Vercel aanroept. */
export async function apiHandler(req, res) {
  await gereed();
  standaardHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if ((await beheerApi(req, res, url)) !== false) return;
  if ((await publiekeApi(req, res, url)) !== false) return;
  stuurFout(res, 404, 'Onbekend API-pad.');
}

/**
 * Let op: op Vercel gaat het bestandssysteem vóór deze functie. Een pagina
 * die hier een andere kant op wordt gestuurd, mag dus géén gelijknamig
 * bestand in public/ hebben - anders serveert het platform dat bestand en
 * komt deze tabel nooit aan bod. Daarom heet de klassieke wizard
 * aanvraag-klassiek.html: /aanvraag zelf heeft geen eigen bestand en wordt
 * altijd hier beslist.
 */
const PAGINAS = {
  '/': 'index.html',
  '/start': 'start.html',
  '/aanvraag': FUNNEL === 'klassiek' ? 'aanvraag-klassiek.html' : 'start.html',
  '/aanvraag-nieuw': 'start.html',
  '/aanvraag-klassiek': 'aanvraag-klassiek.html',
  '/beheer': 'beheer.html',
  '/hoe-werkt-het': 'hoe-werkt-het.html',
};

/** API plus statische bestanden: de complete applicatie op één poort. */
async function verwerk(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return apiHandler(req, res);

  standaardHeaders(res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return stuurFout(res, 405, 'Methode niet toegestaan.');
  }

  // De gedeelde modules staan in public/shared/, zodat de browser ze net als
  // elk ander bestand ophaalt en er geen bouwstap nodig is om ze te kopieren.
  const pagina = PAGINAS[url.pathname.replace(/\/+$/, '') || '/'];
  if (pagina && await serveerBestand(res, PUBLIEK, pagina)) return;
  if (await serveerBestand(res, PUBLIEK, url.pathname)) return;

  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><meta charset="utf-8"><title>Niet gevonden</title>'
    + '<p style="font:16px system-ui;padding:2rem">Deze pagina bestaat niet. <a href="/">Terug naar de startpagina</a>.</p>');
}

export function foutAfhandeling(err, req, res) {
  const code = err.statuscode || 500;
  if (code >= 500) console.error('[server]', err);
  if (!res.headersSent) stuurFout(res, code, err.statuscode ? err.message : 'Er ging iets mis op de server.');
  else res.end();
}

const server = http.createServer((req, res) => {
  verwerk(req, res).catch((err) => foutAfhandeling(err, req, res));
});

export async function start(poort = POORT) {
  await gereed();
  await new Promise((resolve) => server.listen(poort, resolve));
  const { port } = server.address();
  console.log(`\n  Dwangsomhulp draait op http://localhost:${port}`);
  console.log(`  Beheeromgeving:        http://localhost:${port}/beheer`);
  console.log(`  Opslag:                ${opslag.omschrijving}`);
  console.log(`  Funnel op /aanvraag:   ${FUNNEL} (klassieke wizard: /aanvraag-klassiek)`);
  if (!opslag.duurzaam) {
    console.log('  LET OP: aanvragen worden niet duurzaam bewaard. Stel KV_REST_API_URL en');
    console.log('          KV_REST_API_TOKEN in, of draai op een server met een eigen schijf.');
  }
  if (BEHEER_OPEN) {
    console.log('  LET OP: BEHEER_OPEN=1, de beheeromgeving is zonder wachtwoord bereikbaar.\n');
  } else if (wachtwoordGegenereerd) {
    console.log(`  Beheerwachtwoord (gegenereerd): ${beheerWachtwoord}`);
    console.log('  Zet BEHEER_WACHTWOORD in de omgeving om een vast wachtwoord te gebruiken.\n');
  } else {
    console.log('  Beheerwachtwoord: uit BEHEER_WACHTWOORD.\n');
  }
  return server;
}

export { server, store, opslag, verwerk, PAGINAS, FUNNEL };

/**
 * Default export voor platforms die deze module zelf laden en er de
 * applicatie uit halen, zoals Vercel. Die verwachten "een functie of een
 * server"; zonder default export weigert de runtime de module met
 * "Invalid export found in module ... The default export must be a function
 * or server" en faalt elk verzoek, ook dat naar de startpagina.
 *
 * De handler doet hetzelfde als de lokale server: pagina's en API via
 * dezelfde router.
 */
export default async function handler(req, res) {
  try {
    await verwerk(req, res);
  } catch (err) {
    foutAfhandeling(err, req, res);
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    console.error('Starten mislukt:', err);
    process.exit(1);
  });
}
