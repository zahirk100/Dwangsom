/**
 * nubeslist.nl - webserver.
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

import { Store, STATUSSEN, SOORTEN, isGeldigeStatus, labelVoorStatus, labelVoorSoort, LOSSE_BAKKEN } from './src/store.js';
import { kiesOpslag } from './src/opslag.js';
import { sessieSleutel } from './src/sessie.js';
import {
  Gebruikers, ROLLEN, ROL_KLANT, COOKIE_MEDEWERKER, COOKIE_KLANT, cookieRegel,
  naarBuiten, isMedewerker, magWijzigen, magBeheren,
  SESSIEDUUR_MS, KLANTSESSIEDUUR_MS,
} from './src/gebruikers.js';
import { verstuur } from './src/mail.js';
import {
  MAX_UPLOAD_BYTES, Snelheidsbegrenzer, clientIp, leesJsonBody, parseCookies,
  serveerBestand, stuurFout, stuurHtml, stuurJson, stuurTekst,
} from './src/http-util.js';
import { machtigingContext, machtigingHtml } from './src/machtiging.js';
import { organisatiegegevens, ontbrekendeOrganisatiegegevens } from './src/organisatie.js';
import { valideerAanvraag, valideerBijwerking } from './src/validatie.js';
import { berekenDwangsom } from './public/shared/dwangsom.js';
import { parseDatum } from './public/shared/datum.js';
import { bepaalDossiereisen, dossierStatus, stukkenVanKlant, magUploaden, NIEUWE_POST } from './public/shared/dossier.js';
import { herkenBrief, herkendeVelden, naarInvoer } from './src/briefherkenning.js';
import { leesBrief } from './src/brieflezer.js';
import { BESTUURSORGANEN, ZAAKTYPEN } from './public/shared/catalogus.js';
import { claimBrief, ingebrekestellingBrief, briefBestandsnaam } from './public/shared/brief.js';
import { campagnePaden } from './public/shared/campagnes.js';

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

/**
 * Harde grens per aangeleverd bestand, in base64-tekens. Drie megabyte is
 * ruim voor een gescande brief en blijft binnen wat een Redis-waarde aankan.
 * Gaan de dossiers straks naar echte bestandsopslag, dan mag dit omhoog.
 */
const MAX_BESTAND_BASE64 = 4 * 1024 * 1024;

/**
 * De sleutel waarmee de sessiecookies worden ondertekend.
 *
 * Staat SESSIE_GEHEIM niet ingesteld, dan verzint elke instantie er zelf een.
 * Lokaal is dat prima. Serverloos betekent het dat iedereen bij elke deploy
 * en soms tussendoor wordt uitgelogd, want de volgende instantie heeft een
 * andere sleutel. Daarom hoort SESSIE_GEHEIM erin vóór livegang; de
 * beheerpagina zegt dat ook.
 */
export const sessiegeheimOntbreekt = !process.env.SESSIE_GEHEIM;
const SLEUTEL = sessieSleutel(process.env);

const opslag = kiesOpslag({ dataDir: DATA_DIR });
const store = new Store({ opslag });
const gebruikers = new Gebruikers({ opslag, sleutel: SLEUTEL });

/**
 * Het adres waarop de applicatie naar buiten bereikbaar is. Nodig voor de
 * links in e-mail: daar kan geen relatief pad in.
 */
function siteUrl(req) {
  if (process.env.SITE_URL) return String(process.env.SITE_URL).replace(/\/+$/, '');
  const host = (req && req.headers && req.headers.host) || `localhost:${POORT}`;
  const schema = req && overHttps(req) ? 'https' : 'http';
  return `${schema}://${host}`;
}

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

/**
 * Wie is dit? Geeft de medewerker terug die bij het cookie hoort, of null.
 *
 * Met BEHEER_OPEN=1 staat de deur open en doen we alsof er een beheerder is.
 * Dat is puur om te kunnen proefdraaien; de omgeving waarschuwt erover en het
 * mag nooit aan staan als er echte dossiers in zitten.
 */
async function huidigeMedewerker(req) {
  if (BEHEER_OPEN) {
    return { id: 'open', email: 'testmodus', naam: 'Testmodus', rol: 'beheerder', actief: true };
  }
  const cookie = parseCookies(req.headers.cookie)[COOKIE_MEDEWERKER];
  const sessie = await gebruikers.uitCookie(cookie);
  if (!sessie || !isMedewerker(sessie.gebruiker)) return null;
  // Zonder ingestelde tweede factor kom je niet verder dan het instelscherm.
  if (!sessie.gebruiker.totpBevestigdOp) return null;
  return sessie.gebruiker;
}

/** De aanvrager achter het klantcookie. */
/**
 * De aanvrager achter het klantcookie.
 *
 * Bewust geen eis dat de rol `klant` is. Iemand kan allebei zijn: een
 * medewerker die zelf te lang op een beslissing wacht, of - en zo kwam het aan
 * het licht - degene die de eerste beheerder aanmaakte en daarna met hetzelfde
 * e-mailadres een testaanvraag deed. Zijn zaak werd aan zijn bestaande account
 * gehangen, de inloglink maakte een sessie voor dat account, en het portaal
 * wees hem af op zijn rol. Zonder foutmelding, alsof de link stuk was.
 *
 * Veilig, want dit cookie wordt alleen uitgegeven na een inloglink naar dat
 * e-mailadres, en het portaal toont uitsluitend dossiers die aan deze
 * gebruiker hangen. Het geeft geen toegang tot de beheeromgeving: daar hoort
 * een eigen cookie bij, mét tweede factor.
 */
async function huidigeKlant(req) {
  const cookie = parseCookies(req.headers.cookie)[COOKIE_KLANT];
  const sessie = await gebruikers.uitCookie(cookie);
  if (!sessie || sessie.gebruiker.actief === false) return null;
  return sessie.gebruiker;
}

/** Wanneer deze instantie is opgestart; samen met de commit zegt dat genoeg. */
const GESTART_OP = new Date().toISOString();

// ----------------------------------------------------------------- routes --

async function publiekeApi(req, res, url) {
  if (url.pathname === '/api/versie' && req.method === 'GET') {
    // Zodat in één oogopslag te zien is welke versie er echt draait. Zonder
    // dit blijft "ik zie geen verandering" giswerk tussen cache, branch en
    // een mislukte deploy.
    //
    // Dit antwoord gaat als no-store de deur uit, dus het komt altijd van de
    // draaiende server en nooit uit een cache. Dat maakt het het enige
    // betrouwbare antwoord op de vraag "staat mijn wijziging er nu op?": zie
    // je hier je nieuwe commit maar op het scherm de oude pagina, dan zit het
    // in je browser en niet in de deploy.
    return stuurJson(res, 200, {
      commit: String(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'lokaal',
      branch: process.env.VERCEL_GIT_COMMIT_REF || 'lokaal',
      funnel: FUNNEL,
      opslag: opslag.soort,
      // Het belangrijkste vinkje van de hele productieomgeving: onthoudt hij
      // het na een nieuwe deploy?
      opslagDuurzaam: opslag.duurzaam,
      beheerOpen: BEHEER_OPEN,
      // Zonder dit geheim verzint elke serverloze instantie zijn eigen sleutel
      // voor de sessiecookies. Dan maakt instantie A een sessie die instantie B
      // niet herkent, en kom je na het inloggen meteen weer op het inlogscherm.
      // Lokaal valt dat nooit op, want daar is er één proces.
      sessiegeheim: !sessiegeheimOntbreekt,
      gestartOp: GESTART_OP,
      tijd: new Date().toISOString(),
    });
  }

  /**
   * Wat de browser moet weten maar niet zelf kan bepalen: het tarief. Dat
   * staat in de omgeving, en de funnel is een statisch bestand.
   */
  if (url.pathname === '/api/instellingen' && req.method === 'GET') {
    return stuurJson(res, 200, {
      TARIEF_PERCENTAGE: process.env.TARIEF_PERCENTAGE || '',
      TARIEF_VAST: process.env.TARIEF_VAST || '',
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

    // De funnel blijft anoniem: er wordt hier een account op het opgegeven
    // e-mailadres gemaakt, maar de aanvrager hoeft niets in te stellen. Hij
    // komt binnen via de link in zijn bevestigingsmail.
    let klant = null;
    try {
      klant = await gebruikers.vindOfMaakKlant({ email: contact.email, naam: contact.naam });
    } catch (err) {
      // Een account is mooi meegenomen, maar de aanvraag gaat voor.
      console.error('[funnel] account aanmaken mislukt:', err.message);
    }

    const aanvraag = await store.nieuweAanvraag({
      invoer,
      contact,
      rapport,
      stukken,
      brief,
      verlengbrief,
      handtekening,
      gebruikerId: klant ? klant.id : null,
      meta: {
        ingediendVia: herkomst,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
      },
    });

    if (klant) {
      const token = await gebruikers.maakKoppeling(klant.id, 'magic');
      await verstuur({
        aan: klant.email,
        sjabloon: 'welkom',
        gegevens: {
          naam: contact.naam,
          referentie: aanvraag.referentie,
          uitkomst: rapport && rapport.kop,
          url: `${siteUrl(req)}/mijn?t=${encodeURIComponent(token)}`,
        },
      });
    }
    // Naar kantoor, zodat niemand in de beheeromgeving hoeft te gaan kijken
    // om te weten dat er werk binnen is.
    if (process.env.KANTOOR_EMAIL) {
      await verstuur({
        aan: process.env.KANTOOR_EMAIL,
        sjabloon: 'nieuwDossier',
        gegevens: {
          referentie: aanvraag.referentie,
          instantie: invoer.organisatienaam || invoer.bestuursorgaan,
          uitkomst: (rapport && rapport.kop) || 'onbekend',
          url: `${siteUrl(req)}/beheer`,
        },
      });
    }

    return stuurJson(res, 201, {
      referentie: aanvraag.referentie,
      status: aanvraag.status,
      soort: aanvraag.soort,
      portaal: Boolean(klant),
      rapport,
    });
  }

  return false;
}

/**
 * Het klantportaal.
 *
 * Alles hier gaat over precies één persoon: degene achter het klantcookie.
 * Elke route zoekt zijn dossiers op via `vanGebruiker`, nooit op een id uit
 * de url. Daarmee kan er geen dossier van een ander tevoorschijn komen, ook
 * niet als iemand met de adresbalk speelt.
 */
async function klantApi(req, res, url) {
  // Inloggen met een eenmalige koppeling uit de e-mail.
  if (url.pathname === '/api/mijn/koppeling' && req.method === 'POST') {
    const body = await leesJsonBody(req);
    const gebruiker = await gebruikers.verzilverKoppeling(body.token, 'magic');
    if (!gebruiker) {
      return stuurFout(res, 400, 'Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.');
    }
    await gebruikers.noteerAanmelding(gebruiker.id);
    const cookie = await gebruikers.maakSessie(gebruiker, {
      ip: clientIp(req), userAgent: req.headers['user-agent'],
    });
    return stuurJson(res, 200, { ingelogd: true }, {
      'Set-Cookie': cookieRegel(COOKIE_KLANT, cookie, {
        veilig: veiligeCookie(req), duurMs: KLANTSESSIEDUUR_MS,
      }),
    });
  }

  // Een nieuwe link aanvragen.
  if (url.pathname === '/api/mijn/link' && req.method === 'POST') {
    const ip = clientIp(req);
    const limiet = loginBegrenzer.controleer(ip);
    if (!limiet.toegestaan) {
      return stuurFout(res, 429, `Te veel aanvragen. Probeer het over ${limiet.wachtSeconden} seconden opnieuw.`);
    }
    const body = await leesJsonBody(req);
    const gebruiker = await gebruikers.vindOpEmail(body.email);
    // Altijd hetzelfde antwoord, ook als dit adres niet bestaat: anders is
    // hiermee uit te vragen wie er klant is.
    if (gebruiker && gebruiker.rol === ROL_KLANT && gebruiker.actief !== false) {
      const token = await gebruikers.maakKoppeling(gebruiker.id, 'magic');
      await verstuur({
        aan: gebruiker.email,
        sjabloon: 'inloglink',
        gegevens: { url: `${siteUrl(req)}/mijn?t=${encodeURIComponent(token)}` },
      });
    }
    return stuurJson(res, 200, { verstuurd: true });
  }

  if (url.pathname === '/api/mijn/uitloggen' && req.method === 'POST') {
    await gebruikers.beeindigSessie(parseCookies(req.headers.cookie)[COOKIE_KLANT]);
    return stuurJson(res, 200, { ingelogd: false }, {
      'Set-Cookie': cookieRegel(COOKIE_KLANT, '', { verwijder: true, veilig: veiligeCookie(req) }),
    });
  }

  // Ben ik ingelogd? Bewust 200 met een vlag, geen 401: dit is een vraag,
  // geen mislukte poging, en een 401 zou in elke browserconsole als fout
  // verschijnen terwijl er niets aan de hand is.
  if (url.pathname === '/api/mijn/sessie' && req.method === 'GET') {
    const klant = await huidigeKlant(req);
    // `ingelogd: false` zei niet wáárom, en dat is precies het verschil tussen
    // twee heel andere storingen: een browser die het cookie niet bewaart of
    // niet meestuurt, en een server die het cookie wel krijgt maar niet
    // herkent. Zonder dat onderscheid is zoeken gissen.
    const cookie = parseCookies(req.headers.cookie)[COOKIE_KLANT];
    return stuurJson(res, 200, {
      ingelogd: Boolean(klant),
      reden: klant ? 'goed' : (cookie ? 'niet-herkend' : 'geen-cookie'),
      // Eén laag dieper, alleen als het cookie er wél is en toch niet wordt
      // geaccepteerd. Dat is het punt waar het zoeken anders stilvalt.
      detail: klant || !cookie ? '' : await gebruikers.waaromGeenSessie(cookie),
    });
  }

  if (!url.pathname.startsWith('/api/mijn/')) return false;

  const klant = await huidigeKlant(req);
  if (!klant) return stuurFout(res, 401, 'Niet ingelogd.');

  if (url.pathname === '/api/mijn/dossiers' && req.method === 'GET') {
    const dossiers = await store.vanGebruiker(klant.id);
    return stuurJson(res, 200, {
      gebruiker: { naam: klant.naam, email: klant.email },
      dossiers: dossiers.map(voorKlant),
    });
  }

  // De aanvrager vult zelf aan wat er nog ontbreekt. Bewust een korte lijst:
  // zijn adres en telefoonnummer mag hij wijzigen, zijn BSN en IBAN niet.
  // Die corrigeert een behandelaar, na contact.
  const aanvullen = /^\/api\/mijn\/dossiers\/([A-Za-z0-9-]+)\/gegevens$/.exec(url.pathname);
  if (aanvullen && req.method === 'POST') {
    const dossiers = await store.vanGebruiker(klant.id);
    const dossier = dossiers.find((d) => d.id === aanvullen[1]);
    if (!dossier) return stuurFout(res, 404, 'Onbekend dossier.');

    const body = await leesJsonBody(req);
    const toegestaan = ['naam', 'telefoon', 'adres', 'postcode', 'woonplaats', 'geboortedatum'];
    const contact = {};
    for (const veld of toegestaan) {
      if (veld in body) contact[veld] = String(body[veld] ?? '').trim().slice(0, 160);
    }
    const { contact: schoon, fouten, gewijzigd } = valideerBijwerking(dossier, { contact });
    if (Object.keys(fouten).length > 0) {
      return stuurJson(res, 422, { fout: 'Deze gegevens kloppen niet.', velden: fouten });
    }
    const bijgewerkt = await store.werkDossierBij(dossier.id, {
      contact: schoon,
      door: 'de aanvrager',
      toelichting: gewijzigd.length ? `Aanvrager vulde aan: ${gewijzigd.join(', ')}.` : '',
      gewijzigd,
    });
    return stuurJson(res, 200, { dossier: voorKlant(bijgewerkt) });
  }

  // Een eerder aangeleverd bestand terugkijken.
  const bestandPad = /^\/api\/mijn\/dossiers\/([A-Za-z0-9-]+)\/bestanden\/([A-Za-z0-9-]+)$/
    .exec(url.pathname);
  if (bestandPad && req.method === 'GET') {
    const dossiers = await store.vanGebruiker(klant.id);
    const dossier = dossiers.find((d) => d.id === bestandPad[1]);
    if (!dossier) return stuurFout(res, 404, 'Onbekend dossier.');
    const bestand = await store.vindBestand(dossier.id, bestandPad[2]);
    if (!bestand) return stuurFout(res, 404, 'Onbekend bestand.');
    return stuurBestandInhoud(res, bestand);
  }

  // Een gevraagd stuk aanleveren.
  const stukPad = /^\/api\/mijn\/dossiers\/([A-Za-z0-9-]+)\/stuk$/.exec(url.pathname);
  if (stukPad && req.method === 'POST') {
    const dossiers = await store.vanGebruiker(klant.id);
    const dossier = dossiers.find((d) => d.id === stukPad[1]);
    if (!dossier) return stuurFout(res, 404, 'Onbekend dossier.');

    const body = await leesJsonBody(req, MAX_UPLOAD_BYTES);
    // Alleen stukken die in deze zaak ook echt gevraagd worden.
    const gevraagd = new Set(magUploaden(dossier));
    if (!gevraagd.has(String(body.stukId))) {
      return stuurFout(res, 400, 'Dit stuk wordt in deze zaak niet gevraagd.');
    }
    const data = String(body.data || '');
    if (!data) return stuurFout(res, 400, 'Er is geen bestand meegestuurd.');
    if (data.length > MAX_BESTAND_BASE64) {
      return stuurFout(res, 413, 'Dit bestand is groter dan 3 MB. Stuur een kleinere versie.');
    }

    const bijgewerkt = await store.voegBestandToe(dossier.id, {
      stukId: body.stukId,
      bestandsnaam: body.bestandsnaam,
      mediaType: body.mediaType,
      data,
      door: 'klant',
    });
    return stuurJson(res, 200, { dossier: voorKlant(bijgewerkt) });
  }

  return false;
}

/**
 * Hetzelfde dossier, maar zonder de base64 van de bijlagen.
 *
 * Die staan voorlopig in het dossier zelf; ze meesturen zou betekenen dat
 * elke keer dat een behandelaar een dossier opent, er megabytes over de lijn
 * gaan die hij niet gebruikt. De metagegevens blijven, de inhoud komt via de
 * downloadroute.
 */
function zonderBestandsinhoud(aanvraag) {
  if (!aanvraag || !Array.isArray(aanvraag.bestanden)) return aanvraag;
  return {
    ...aanvraag,
    bestanden: aanvraag.bestanden.map(({ data, ...rest }) => ({ ...rest, bytes: Math.round((data || '').length * 0.75) })),
  };
}

/** Een opgeslagen bestand teruggeven als download. */
function stuurBestandInhoud(res, bestand) {
  const lijf = Buffer.from(bestand.data, 'base64');
  res.writeHead(200, {
    'Content-Type': bestand.mediaType || 'application/octet-stream',
    'Content-Length': lijf.length,
    // Altijd als download, nooit inline: een geüpload bestand in het domein
    // laten renderen is een onnodig risico.
    'Content-Disposition': `attachment; filename="${bestand.bestandsnaam.replace(/["\\]/g, '')}"`,
    'Cache-Control': 'private, no-store',
  });
  res.end(lijf);
  return true;
}

/**
 * Wat een dossier naar de klant mag meenemen.
 *
 * Hier zit de belangrijkste beveiliging van het portaal: een lijst met wat er
 * wél uit mag, in plaats van een lijst met wat eruit moet. Interne notities,
 * de historie, het burgerservicenummer en de behandelaarsvelden komen er zo
 * nooit in terecht, ook niet als er later een veld bijkomt.
 */
function voorKlant(a) {
  const contact = a.contact || {};
  const eisen = bepaalDossiereisen(a);
  return {
    id: a.id,
    referentie: a.referentie,
    status: a.status,
    statusLabel: labelVoorStatus(a.status),
    aangemaaktOp: a.aangemaaktOp,
    invoer: {
      bestuursorgaan: a.invoer.bestuursorgaan,
      organisatienaam: a.invoer.organisatienaam,
      zaaktype: a.invoer.zaaktype,
      basisdatum: a.invoer.basisdatum,
      ingebrekeGesteld: Boolean(a.invoer.ingebrekeGesteld),
      ingebrekestellingDatum: a.invoer.ingebrekestellingDatum || '',
      besluitGenomen: Boolean(a.invoer.besluitGenomen),
      besluitDatum: a.invoer.besluitDatum || '',
    },
    rapport: a.rapport
      ? {
        uitkomst: a.rapport.uitkomst,
        kop: a.rapport.kop,
        samenvatting: a.rapport.samenvatting,
        beslistermijn: a.rapport.beslistermijn,
        berekening: a.rapport.berekening,
        vervolg: a.rapport.vervolg,
      }
      : null,
    afhandeling: a.afhandeling
      ? {
        bedragToegekend: a.afhandeling.bedragToegekend,
        beschikkingOp: a.afhandeling.beschikkingOp,
        uitbetaaldOp: a.afhandeling.uitbetaaldOp,
      }
      : null,
    contact: {
      naam: contact.naam || '',
      email: contact.email || '',
      telefoon: contact.telefoon || '',
      adres: contact.adres || '',
      postcode: contact.postcode || '',
      woonplaats: contact.woonplaats || '',
      geboortedatum: contact.geboortedatum || '',
      // Bewust gemaskeerd: het portaal hoeft het nooit voluit te tonen.
      bsnBekend: Boolean(contact.bsn),
      ibanBekend: Boolean(contact.iban),
    },
    ontbreekt: eisen.gegevens
      .filter((g) => g.verplicht && !String(contact[g.id] || '').trim())
      .map((g) => ({ id: g.id, label: g.label, reden: g.reden })),
    // Welke stukken deze zaak nodig heeft, en wat er al binnen is. Per
    // zaaktype anders; die regel staat in shared/dossier.js.
    stukken: stukkenVanKlant(a).map((stuk) => ({
      id: stuk.id,
      label: stuk.label,
      uitleg: stuk.uitleg,
      verplicht: stuk.verplicht,
      binnen: Boolean((a.stukken || {})[stuk.id]),
      bestanden: (a.bestanden || [])
        .filter((b) => b.stukId === stuk.id)
        .map((b) => ({ id: b.id, bestandsnaam: b.bestandsnaam, aangemaaktOp: b.aangemaaktOp })),
    })),
    // Post die de aanvrager zelf van de instantie kreeg en bij ons neerlegde.
    nieuwePost: (a.bestanden || [])
      .filter((b) => b.stukId === NIEUWE_POST)
      .map((b) => ({ id: b.id, bestandsnaam: b.bestandsnaam, aangemaaktOp: b.aangemaaktOp })),
    machtigingGetekend: Boolean(a.machtiging && a.machtiging.ondertekendOp),
  };
}

async function beheerApi(req, res, url) {
  // ------------------------------------------------------------ inloggen --

  if (url.pathname === '/api/beheer/sessie' && req.method === 'GET') {
    const medewerker = await huidigeMedewerker(req);
    // Wie wel een geldig cookie heeft maar nog geen tweede factor, moet dat
    // eerst instellen. Dat is een aparte staat, geen fout.
    const halve = medewerker ? null : await gebruikers.uitCookie(
      parseCookies(req.headers.cookie)[COOKIE_MEDEWERKER],
    );
    return stuurJson(res, 200, {
      ingelogd: Boolean(medewerker),
      open: BEHEER_OPEN,
      gebruiker: naarBuiten(medewerker),
      tweefactorNodig: Boolean(halve && isMedewerker(halve.gebruiker) && !halve.gebruiker.totpBevestigdOp),
      eersteStart: await gebruikers.isLeeg(),
      rollen: ROLLEN,
      serverloos: OP_VERCEL,
      opslagDuurzaam: opslag.duurzaam,
    });
  }

  /** De allereerste beheerder, zolang er nog geen enkele medewerker is. */
  if (url.pathname === '/api/beheer/eerste-beheerder' && req.method === 'POST') {
    if (!(await gebruikers.isLeeg())) return stuurFout(res, 409, 'Er is al een beheerder ingesteld.');
    const body = await leesJsonBody(req);
    try {
      const gebruiker = await gebruikers.maakEersteBeheerder({
        email: body.email, naam: body.naam, wachtwoord: body.wachtwoord,
      });
      const cookie = await gebruikers.maakSessie(gebruiker, {
        ip: clientIp(req), userAgent: req.headers['user-agent'],
      });
      return stuurJson(res, 201, { gebruiker: naarBuiten(gebruiker) }, {
        'Set-Cookie': cookieRegel(COOKIE_MEDEWERKER, cookie, { veilig: veiligeCookie(req) }),
      });
    } catch (err) {
      return stuurFout(res, 400, err.message);
    }
  }

  if (url.pathname === '/api/beheer/login' && req.method === 'POST') {
    if (BEHEER_OPEN) return stuurJson(res, 200, { ingelogd: true, open: true });
    const ip = clientIp(req);
    const limiet = loginBegrenzer.controleer(ip);
    if (!limiet.toegestaan) {
      return stuurFout(res, 429, `Te veel inlogpogingen. Probeer het over ${limiet.wachtSeconden} seconden opnieuw.`);
    }
    const body = await leesJsonBody(req);
    const uitslag = await gebruikers.controleerWachtwoord(body.email, body.wachtwoord);
    if (uitslag.fout) return stuurFout(res, 401, uitslag.fout);

    const gebruiker = uitslag.gebruiker;
    // Heeft hij tweefactor aan staan, dan moet de code er nu bij.
    if (gebruiker.totpBevestigdOp) {
      if (!body.code) return stuurJson(res, 200, { tweefactorNodig: true });
      if (!(await gebruikers.controleerTweedeFactor(gebruiker, body.code))) {
        return stuurJson(res, 401, { fout: 'Die code klopt niet.', tweefactorNodig: true });
      }
    }
    loginBegrenzer.herstel(ip);
    await gebruikers.noteerAanmelding(gebruiker.id);
    const cookie = await gebruikers.maakSessie(gebruiker, {
      ip, userAgent: req.headers['user-agent'],
    });
    return stuurJson(res, 200, {
      ingelogd: true,
      gebruiker: naarBuiten(gebruiker),
      // Nog geen tweede factor? Dan komt hij binnen op het instelscherm.
      tweefactorInstellen: !gebruiker.totpBevestigdOp,
    }, { 'Set-Cookie': cookieRegel(COOKIE_MEDEWERKER, cookie, { veilig: veiligeCookie(req) }) });
  }

  if (url.pathname === '/api/beheer/logout' && req.method === 'POST') {
    await gebruikers.beeindigSessie(parseCookies(req.headers.cookie)[COOKIE_MEDEWERKER]);
    return stuurJson(res, 200, { ingelogd: false }, {
      'Set-Cookie': cookieRegel(COOKIE_MEDEWERKER, '', { verwijder: true, veilig: veiligeCookie(req) }),
    });
  }

  /** Een uitnodiging inwisselen: wachtwoord kiezen en meteen ingelogd zijn. */
  if (url.pathname === '/api/beheer/uitnodiging' && req.method === 'POST') {
    const body = await leesJsonBody(req);
    const gebruiker = await gebruikers.verzilverKoppeling(body.token, 'uitnodiging');
    if (!gebruiker) return stuurFout(res, 400, 'Deze uitnodiging is verlopen of al gebruikt.');
    try {
      await gebruikers.zetWachtwoord(gebruiker.id, body.wachtwoord);
    } catch (err) {
      return stuurFout(res, 400, err.message);
    }
    const cookie = await gebruikers.maakSessie(gebruiker, {
      ip: clientIp(req), userAgent: req.headers['user-agent'],
    });
    return stuurJson(res, 200, { gebruiker: naarBuiten(gebruiker), tweefactorInstellen: true }, {
      'Set-Cookie': cookieRegel(COOKIE_MEDEWERKER, cookie, { veilig: veiligeCookie(req) }),
    });
  }

  // ------------------------------------------------- tweefactor instellen --
  // Hiervoor is een halve sessie genoeg: je bent wel wie je zegt, maar je
  // komt pas bij de dossiers zodra de tweede factor staat.

  if (url.pathname.startsWith('/api/beheer/tweefactor')) {
    if (BEHEER_OPEN) return stuurFout(res, 400, 'In testmodus is tweefactor niet van toepassing.');
    const sessie = await gebruikers.uitCookie(parseCookies(req.headers.cookie)[COOKIE_MEDEWERKER]);
    if (!sessie || !isMedewerker(sessie.gebruiker)) return stuurFout(res, 401, 'Niet ingelogd.');

    if (url.pathname === '/api/beheer/tweefactor/start' && req.method === 'POST') {
      const { geheim, url: otpauth } = await gebruikers.begingTweefactor(sessie.gebruiker.id);
      return stuurJson(res, 200, { geheim, otpauth });
    }
    if (url.pathname === '/api/beheer/tweefactor/bevestig' && req.method === 'POST') {
      const body = await leesJsonBody(req);
      try {
        const herstelcodes = await gebruikers.bevestigTweefactor(sessie.gebruiker.id, body.code);
        return stuurJson(res, 200, { herstelcodes });
      } catch (err) {
        return stuurFout(res, 400, err.message);
      }
    }
    return false;
  }

  if (!url.pathname.startsWith('/api/beheer/')) return false;

  // --------------------------------------------------------- vanaf hier ---
  // Alles hieronder vereist een volwaardige sessie: medewerker, actief, met
  // tweede factor.
  const ik = await huidigeMedewerker(req);
  if (!ik) return stuurFout(res, 401, 'Niet ingelogd.');

  /** Voor alles wat iets verandert. Een meekijker mag alleen lezen. */
  const magNietWijzigen = () => (magWijzigen(ik)
    ? null
    : stuurFout(res, 403, 'Je account mag alleen meekijken, niet wijzigen.'));

  // ----------------------------------------------------- medewerkers ------

  if (url.pathname === '/api/beheer/medewerkers' && req.method === 'GET') {
    if (!magBeheren(ik)) return stuurFout(res, 403, 'Alleen een beheerder kan accounts bekijken.');
    return stuurJson(res, 200, {
      medewerkers: (await gebruikers.medewerkers()).map(naarBuiten),
      rollen: ROLLEN,
      ik: naarBuiten(ik),
    });
  }

  if (url.pathname === '/api/beheer/medewerkers' && req.method === 'POST') {
    if (!magBeheren(ik)) return stuurFout(res, 403, 'Alleen een beheerder kan accounts aanmaken.');
    const body = await leesJsonBody(req);
    try {
      const { gebruiker, uitnodiging } = await gebruikers.nodigMedewerkerUit({
        email: body.email, naam: body.naam, rol: body.rol, door: ik.id,
      });
      const link = `${siteUrl(req)}/beheer?uitnodiging=${encodeURIComponent(uitnodiging)}`;
      const mail = await verstuur({
        aan: gebruiker.email,
        sjabloon: 'uitnodiging',
        gegevens: { naam: gebruiker.naam, rol: gebruiker.rol, url: link, door: ik.naam || ik.email },
      });
      return stuurJson(res, 201, {
        medewerker: naarBuiten(gebruiker),
        // Gaat er geen mail de deur uit, dan moet de beheerder de link zelf
        // kunnen doorgeven. Anders staat er een account dat niemand kan openen.
        uitnodigingslink: mail.soort === 'logboek' || !mail.gelukt ? link : null,
        mail,
      });
    } catch (err) {
      return stuurFout(res, 400, err.message);
    }
  }

  const medewerkerPad = /^\/api\/beheer\/medewerkers\/([A-Za-z0-9-]+)$/.exec(url.pathname);
  if (medewerkerPad && req.method === 'PATCH') {
    if (!magBeheren(ik)) return stuurFout(res, 403, 'Alleen een beheerder kan accounts wijzigen.');
    const body = await leesJsonBody(req);
    try {
      let gebruiker;
      if (typeof body.rol === 'string') gebruiker = await gebruikers.wijzigRol(medewerkerPad[1], body.rol, ik.id);
      if (typeof body.actief === 'boolean') {
        gebruiker = await gebruikers.zetActief(medewerkerPad[1], body.actief, ik.id);
      }
      if (!gebruiker) return stuurFout(res, 400, 'Niets om te wijzigen.');
      return stuurJson(res, 200, { medewerker: naarBuiten(gebruiker) });
    } catch (err) {
      return stuurFout(res, 400, err.message);
    }
  }

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

  const detail = /^\/api\/beheer\/aanvragen\/([A-Za-z0-9-]+)((?:\/[a-z]+)(?:\/[A-Za-z0-9-]+)?)?$/
    .exec(url.pathname);
  if (detail) {
    const aanvraag = await store.vind(detail[1]);
    if (!aanvraag) return stuurFout(res, 404, 'Aanvraag niet gevonden.');
    const subpad = detail[2];

    if (!subpad && req.method === 'GET') {
      return stuurJson(res, 200, {
        aanvraag: zonderBestandsinhoud(aanvraag),
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
      const nee = magNietWijzigen(); if (nee) return nee;
      const body = await leesJsonBody(req);
      if (!isGeldigeStatus(body.status)) return stuurFout(res, 400, 'Onbekende status.');
      return stuurJson(res, 200, { aanvraag: zonderBestandsinhoud(await store.wijzigStatus(aanvraag.id, body.status, ik.naam || ik.email)) });
    }

    if (subpad === '/notities' && req.method === 'POST') {
      const nee = magNietWijzigen(); if (nee) return nee;
      const body = await leesJsonBody(req);
      const tekst = String(body.tekst || '').trim().slice(0, 2000);
      if (!tekst) return stuurFout(res, 400, 'Notitie is leeg.');
      return stuurJson(res, 200, { aanvraag: zonderBestandsinhoud(await store.voegNotitieToe(aanvraag.id, tekst, ik.naam || ik.email)) });
    }

    // Wat de aanvrager zelf aanleverde, hier terug te lezen. Zonder deze route
    // komt zijn upload in een la die niemand opent, en dat is erger dan geen
    // uploadknop.
    const bestandPad = /^\/bestanden\/([A-Za-z0-9-]+)$/.exec(subpad || '');
    if (bestandPad && req.method === 'GET') {
      // Via de store: de metagegevens staan in het dossier, de bytes in een
      // eigen rij.
      const bestand = await store.vindBestand(aanvraag.id, bestandPad[1]);
      if (!bestand) return stuurFout(res, 404, 'Onbekend bestand.');
      return stuurBestandInhoud(res, bestand);
    }

    if (subpad === '/machtiging' && req.method === 'GET') {
      return stuurHtml(res, 200, machtigingHtml(aanvraag, organisatiegegevens()));
    }

    if (subpad === '/machtiging' && req.method === 'POST') {
      const nee = magNietWijzigen(); if (nee) return nee;
      const body = await leesJsonBody(req);
      const bijgewerkt = await store.werkMachtigingBij(aanvraag.id, body.actie, ik.naam || ik.email);
      if (!bijgewerkt) return stuurFout(res, 400, 'Onbekende actie voor de machtiging.');
      return stuurJson(res, 200, { aanvraag: zonderBestandsinhoud(bijgewerkt) });
    }

    if (subpad === '/stukken' && req.method === 'POST') {
      const nee = magNietWijzigen(); if (nee) return nee;
      const body = await leesJsonBody(req);
      const ingestuurd = (body && typeof body.stukken === 'object' && body.stukken) || {};
      const toegestaan = new Set(bepaalDossiereisen(aanvraag).stukken.map((stuk) => stuk.id));
      const stukken = Object.fromEntries(
        Object.entries(ingestuurd).filter(([id]) => toegestaan.has(id)).map(([id, aan]) => [id, Boolean(aan)]),
      );
      return stuurJson(res, 200, { aanvraag: zonderBestandsinhoud(await store.werkStukkenBij(aanvraag.id, stukken, ik.naam || ik.email)) });
    }

    if (subpad === '/bijwerken' && req.method === 'POST') {
      const nee = magNietWijzigen(); if (nee) return nee;
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
        door: ik.naam || ik.email,
        toelichting: typeof body.toelichting === 'string' ? body.toelichting.slice(0, 300) : '',
        gewijzigd,
      });
      return stuurJson(res, 200, { aanvraag: zonderBestandsinhoud(bijgewerkt), eisen: bepaalDossiereisen(bijgewerkt) });
    }

    if (subpad === '/afhandeling' && req.method === 'POST') {
      const nee = magNietWijzigen(); if (nee) return nee;
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
        aanvraag: zonderBestandsinhoud(await store.legAfhandelingVast(aanvraag.id, afhandeling, ik.naam || ik.email)),
      });
    }

    if (subpad === '/herbereken' && req.method === 'POST') {
      const nee = magNietWijzigen(); if (nee) return nee;
      const body = await leesJsonBody(req);
      const invoer = { ...aanvraag.invoer, ...(body.invoer || {}) };
      const bijgewerkt = await store.werkRapportBij(aanvraag.id, {
        invoer,
        rapport: berekenDwangsom(invoer),
        door: ik.naam || ik.email,
        toelichting: body.toelichting || 'Berekening opnieuw uitgevoerd.',
      });
      return stuurJson(res, 200, { aanvraag: zonderBestandsinhoud(bijgewerkt) });
    }

    const bestandId = /^\/bestanden\/([A-Za-z0-9-]+)$/.exec(subpad || '');
    if (bestandId && req.method === 'GET') {
      const bestand = await store.vindBestand(aanvraag.id, bestandId[1]);
      if (!bestand) return stuurFout(res, 404, 'Onbekend bestand.');
      return stuurBestandInhoud(res, bestand);
    }

    if (subpad === '/brief' && req.method === 'GET') {
      const soort = url.searchParams.get('soort') === 'claim' ? 'claim' : 'ingebrekestelling';
      const maker = soort === 'claim' ? claimBrief : ingebrekestellingBrief;
      const tekst = maker({ invoer: aanvraag.invoer, contact: aanvraag.contact, rapport: aanvraag.rapport });
      return stuurTekst(res, 200, tekst, {
        'Content-Disposition': `attachment; filename="${briefBestandsnaam(soort, aanvraag.referentie)}"`,
      });
    }

    // Dezelfde brief, maar dan blijvend in het dossier. Een brief die alleen
    // in de map Downloads van een behandelaar staat, is voor het dossier niet
    // verstuurd.
    if (subpad === '/brief' && req.method === 'POST') {
      const nee = magNietWijzigen(); if (nee) return nee;
      const body = await leesJsonBody(req);
      const soort = body.soort === 'claim' ? 'claim' : 'ingebrekestelling';
      const maker = soort === 'claim' ? claimBrief : ingebrekestellingBrief;
      const tekst = maker({ invoer: aanvraag.invoer, contact: aanvraag.contact, rapport: aanvraag.rapport });
      const bijgewerkt = await store.voegBestandToe(aanvraag.id, {
        stukId: 'correspondentie',
        bestandsnaam: briefBestandsnaam(soort, aanvraag.referentie),
        mediaType: 'text/plain; charset=utf-8',
        data: Buffer.from(tekst, 'utf8').toString('base64'),
        door: ik.naam || ik.email,
        toelichting: soort === 'claim' ? 'Dwangsomclaim, door ons opgesteld' : 'Ingebrekestelling, door ons opgesteld',
      });
      return stuurJson(res, 200, { aanvraag: zonderBestandsinhoud(bijgewerkt) });
    }

    // Zelf een stuk aan het dossier toevoegen: een ontvangen brief, een
    // verzendbewijs, een e-mailwisseling.
    if (subpad === '/bestanden' && req.method === 'POST') {
      const nee = magNietWijzigen(); if (nee) return nee;
      const body = await leesJsonBody(req, MAX_UPLOAD_BYTES);
      const data = String(body.data || '');
      if (!data) return stuurFout(res, 400, 'Er is geen bestand meegestuurd.');
      if (data.length > MAX_BESTAND_BASE64) {
        return stuurFout(res, 413, 'Dit bestand is groter dan 3 MB. Stuur een kleinere versie.');
      }
      // De behandelaar mag bij elk stuk van deze zaak iets hangen, plus in de
      // twee losse bakken. Een verzonnen stukId hoort er niet in te komen.
      const toegestaan = new Set([
        ...bepaalDossiereisen(aanvraag).stukken.map((stuk) => stuk.id),
        ...LOSSE_BAKKEN,
      ]);
      const stukId = String(body.stukId || 'correspondentie');
      if (!toegestaan.has(stukId)) return stuurFout(res, 400, 'Dit stuk hoort niet bij deze zaak.');

      const bijgewerkt = await store.voegBestandToe(aanvraag.id, {
        stukId,
        bestandsnaam: body.bestandsnaam,
        mediaType: body.mediaType,
        data,
        door: ik.naam || ik.email,
        toelichting: body.toelichting,
      });
      return stuurJson(res, 200, { aanvraag: zonderBestandsinhoud(bijgewerkt) });
    }

    if (bestandPad && req.method === 'DELETE') {
      const nee = magNietWijzigen(); if (nee) return nee;
      const bijgewerkt = await store.verwijderBestand(aanvraag.id, bestandPad[1], ik.naam || ik.email);
      if (!bijgewerkt) return stuurFout(res, 404, 'Onbekend bestand.');
      return stuurJson(res, 200, { aanvraag: zonderBestandsinhoud(bijgewerkt) });
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
  if ((await klantApi(req, res, url)) !== false) return;
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
  '/mijn': 'mijn.html',
  '/hoe-werkt-het': 'hoe-werkt-het.html',
  '/privacy': 'privacy.html',
  '/voorwaarden': 'voorwaarden.html',
  // Elke advertentie-ingang is een echt bestand, gemaakt door
  // scripts/maak-paginas.mjs. Hier alleen het pad zonder .html erbij, zodat
  // lokaal hetzelfde werkt als cleanUrls op Vercel.
  ...Object.fromEntries(campagnePaden().map((pad) => [pad, `${pad.slice(1)}.html`])),
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
  console.log(`\n  nubeslist.nl draait op http://localhost:${port}`);
  console.log(`  Beheeromgeving:        http://localhost:${port}/beheer`);
  console.log(`  Opslag:                ${opslag.omschrijving}`);
  console.log(`  Funnel op /aanvraag:   ${FUNNEL} (klassieke wizard: /aanvraag-klassiek)`);
  if (!opslag.duurzaam) {
    console.log('  LET OP: aanvragen worden niet duurzaam bewaard. Stel KV_REST_API_URL en');
    console.log('          KV_REST_API_TOKEN in, of draai op een server met een eigen schijf.');
  }
  console.log(`  Klantportaal:          http://localhost:${port}/mijn`);
  if (BEHEER_OPEN) {
    console.log('  LET OP: BEHEER_OPEN=1, de beheeromgeving is zonder inloggen bereikbaar.');
  } else if (await gebruikers.isLeeg()) {
    console.log('  Nog geen medewerkers: open /beheer om de eerste beheerder aan te maken.');
  }
  if (sessiegeheimOntbreekt) {
    console.log('  LET OP: geen SESSIE_GEHEIM ingesteld; iedereen wordt bij een herstart uitgelogd.');
  }
  console.log('');
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
