/**
 * De losse campagnelanding voor UWV.
 *
 * Deze pagina staat bewust náást de site en niet erin. Een advertentiepagina
 * heeft één taak - de bezoeker die op een advertentie klikte door één verhaal
 * heen leiden - en elke afleiding kost conversie. Daarom:
 *
 *   - **Geen sitenavigatie.** Geen "Hoe het werkt", geen "Kosten", geen menu.
 *     Elke link in de balk is een uitgang, en een advertentieklik die de site
 *     in wandelt is betaald verkeer dat niets oplevert.
 *   - **Eigen css, in de pagina zelf.** Geen `stijl.css`, geen `landing.css`.
 *     Verandert er iets aan de vormgeving van de site, dan verandert er niets
 *     aan een pagina waar geld achter staat. Dat scheelt ook een extra
 *     verzoek, en snelheid is hier direct geld.
 *   - **Eén bestemming.** Alle knoppen gaan naar dezelfde plek, met dezelfde
 *     herkomst erachter, zodat in de cijfers terug te zien is wat deze pagina
 *     doet.
 *
 * Het tarief komt uit `tarief.js`, dezelfde bron als de funnel, de machtiging
 * en de voorwaarden. Dat is geen netheid maar noodzaak: een advertentiepagina
 * die 10% belooft terwijl de funnel 25% afrekent, is een onjuiste
 * prijsvermelding. Door het uit één plek te halen kan dat niet ontstaan.
 *
 * De psychologische volgorde van de pagina:
 *   herkenning -> ik kan iets doen -> er kan geld tegenover staan ->
 *   is het veilig voor mijn zaak? -> helpt het? -> geldt het voor mij? ->
 *   zij regelen het -> wat kost het? -> actie.
 */

import { tarief, tariefSplitsing } from '../public/shared/tarief.js';
import { TARIEF } from '../public/shared/dwangsom.js';
import { organisatiegegevens } from './organisatie.js';

const SITE = 'https://nubeslist.nl';

/** Het pad van deze pagina, zonder .html. */
export const CAMPAGNE_PAD = '/uwv-te-laat';

/** Waar de knoppen heen gaan. `bron` staat in de url zodat dit meetbaar is. */
const BESTEMMING = '/aanvraag?instantie=uwv&amp;bron=uwv-te-laat';

function veilig(tekst) {
  return String(tekst ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** '1442' -> '1.442' */
function duizend(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 1081.5 -> '1.081,50'. Met duizendtalpunt, anders leest een bedrag als 1081,50 niet. */
function centen(n) {
  const [heel, deel] = n.toFixed(2).split('.');
  return `${duizend(Number(heel))},${deel}`;
}

/**
 * Het prijsblok in woorden.
 *
 * Staat er geen tarief in de omgeving, dan noemt deze pagina géén getal. Een
 * verzonnen percentage op de pagina waar iemand besluit te tekenen is erger
 * dan geen percentage; dat is dezelfde afspraak als in de funnel.
 */
function prijsblok(t) {
  const maximum = TARIEF.maxBedrag;
  if (!t.bekend) {
    return {
      kop: 'Eerst controleren kost niets',
      kort: 'Je hoort vooraf wat onze hulp kost',
      regels: [
        'Je UWV-brief laten controleren is gratis.',
        'Besluit je daarna dat wij het regelen, dan hoor je vooraf precies wat dat kost. '
          + 'Je gaat nooit ergens aan vast zonder dat je het bedrag kent.',
      ],
      voorbeeld: null,
      bullet: 'Je hoort vooraf wat het kost',
    };
  }
  const vast = t.soort === 'vast';
  const label = vast ? `€ ${duizend(t.bedrag)}` : `${t.percentage}%`;
  const duizendSplit = tariefSplitsing(t, 1000);
  const maxSplit = tariefSplitsing(t, maximum);
  return {
    kop: 'Eerst controleren kost niets',
    kort: vast
      ? `Geen vergoeding is € 0. Wel een vergoeding: € ${duizend(t.bedrag)}`
      : `Geen vergoeding is € 0. Wel een vergoeding: ${t.percentage}%`,
    label,
    regels: [
      'Je UWV-brief laten controleren is gratis.',
      vast
        ? `Kies je daarna voor onze hulp, dan betaal je € ${duizend(t.bedrag)} - en alleen als er ook echt een vergoeding komt.`
        : `Kies je daarna voor onze hulp, dan betaal je ${t.percentage}% van de vergoeding die je ontvangt - en alleen als die er komt.`,
    ],
    voorbeeld: duizendSplit && maxSplit ? { duizendSplit, maxSplit, maximum } : null,
    bullet: vast
      ? `Alleen bij een vergoeding betaal je € ${duizend(t.bedrag)}`
      : `Alleen bij een vergoeding betaal je ${t.percentage}%`,
  };
}

const MERK = `<svg class="merk__teken" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs><linearGradient id="merkverloop" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#3b7ad4"/><stop offset="1" stop-color="#1c3a6e"/>
      </linearGradient></defs>
      <rect width="64" height="64" rx="16" fill="url(#merkverloop)"/>
      <path d="M40.8 19.4A18 18 0 1 0 50 33.5" fill="none" stroke="#fff" stroke-width="4.2"
            stroke-linecap="round" opacity=".48"/>
      <path d="M22.5 33.2 30.8 41.5 51 18.5" fill="none" stroke="#fff" stroke-width="6.2"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

const VINK = `<svg class="vink" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor"
      stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5 8 14.5 16 5.5"/></svg>`;

/** Eén vraag in de uitklapbare veelgestelde vragen. */
function vraag(v, a) {
  return `      <details class="vraag">
        <summary>${veilig(v)}</summary>
        <div class="vraag__antwoord">
${a.map((r) => `          <p>${r}</p>`).join('\n')}
        </div>
      </details>`;
}

/**
 * De veelgestelde vragen.
 *
 * Bewust ná de rest van de pagina en ingeklapt: dit zijn bezwaren, en een
 * bezwaar dat de bezoeker nog niet had moet je niet als eerste introduceren.
 * Wie hem wél heeft, zoekt hem hier op.
 *
 * Twee van deze antwoorden zijn met opzet terughoudend. "Gaat UWV dan sneller
 * beslissen" en "kan dit gevolgen hebben voor mijn zaak" zijn precies de twee
 * waar een wervende tekst een belofte zou doen die niemand kan waarmaken.
 */
function vragen(t, prijs) {
  const maximum = TARIEF.maxBedrag;
  const lijst = [
    ['Kan dit gevolgen hebben voor mijn WIA, Wajong, WW of bezwaar?', [
      'De melding gaat over het <strong>uitblijven van een beslissing</strong>. Dat is iets anders '
        + 'dan bezwaar maken tegen de inhoud van je aanvraag of beoordeling.',
      'Loopt er een bezwaar, dan blijft UWV dat bezwaar inhoudelijk behandelen.',
      'Voordat wij iets namens jou versturen, controleren we eerst je situatie en laten we je zien '
        + 'waarvoor je toestemming geeft.',
    ]],
    ['Zorgt een melding ervoor dat UWV sneller beslist?', [
      '<strong>Dat kunnen wij niet garanderen.</strong>',
      'Met de melding laat je UWV officieel weten dat je te lang wacht. UWV krijgt daarna nog twee '
        + 'weken om alsnog te beslissen. Blijft een beslissing uit, dan kan een vergoeding gaan oplopen.',
      'Wij beloven dus niet wannéér UWV beslist. Wij zorgen er wel voor dat je niet blijft wachten '
        + 'zonder dat de volgende stap gezet is.',
    ]],
    ['Hoe weet ik of UWV te laat is?', [
      'Dat hoef je niet zelf uit te zoeken.',
      'In een brief van UWV staat vaak wanneer je een beslissing kunt verwachten. Upload die brief, '
        + 'dan zoeken wij de datum op die voor jouw zaak geldt.',
      'Heb je daarna een brief gekregen waarin UWV zegt dat het langer duurt? Upload die dan ook.',
    ]],
    ['UWV zegt dat het druk is. Wat betekent dat voor mij?', [
      'Dat UWV het druk heeft, zegt nog niets over wat er voor jouw zaak geldt.',
      'Wij kijken naar de brieven die jij van UWV hebt gekregen en naar de datum waarop je volgens '
        + 'die brieven een beslissing kon verwachten. Zo hoef jij niet uit te zoeken welke termijn op '
        + 'jouw zaak van toepassing is.',
    ]],
    ['UWV heeft laten weten meer tijd nodig te hebben. Wat nu?', [
      'Dan kan de datum waarop UWV moet beslissen zijn opgeschoven.',
      'Upload ook die brief. Wij kijken wat de nieuwe datum voor jouw situatie betekent. Je hoeft zelf '
        + 'niet te bepalen of UWV de termijn heeft verdaagd of opgeschort.',
    ]],
    ['Kan ik een vergoeding krijgen als UWV te laat blijft?', [
      'Dat kan, maar het hangt van je situatie af.',
      'Is UWV te laat, dan kun je dat officieel melden. UWV krijgt daarna nog twee weken. Komt er dan '
        + 'nog steeds geen beslissing, dan kan een wettelijke vergoeding gaan lopen.',
      'Wij controleren eerst of dit voor jouw zaak geldt. Daar zit geen kosten aan vast.',
    ]],
    ['Hoe hoog kan de vergoeding worden?', [
      `De vergoeding kan oplopen tot maximaal <strong>€ ${duizend(maximum)}</strong>.`,
      `Na de extra twee weken loopt hij maximaal ${TARIEF.maxDagen} dagen op: eerst € ${TARIEF.tranches[0].perDag} `
        + `per dag, daarna € ${TARIEF.tranches[1].perDag} en vervolgens € ${TARIEF.tranches[2].perDag} per dag.`,
      'Je hoeft dat zelf niet uit te rekenen; wij houden het bedrag voor je bij. Deze wettelijke '
        + 'vergoeding heet officieel een <em>dwangsom</em>.',
    ]],
    ['Ik heb UWV zelf al een brief of e-mail gestuurd.', [
      'Stuur dan niet zomaar opnieuw iets.',
      'Upload eerst wat je al hebt gestuurd. Wij kijken wat erin staat en of er nog een volgende stap '
        + 'nodig is. Weet je niet of het al voldoende was, dan zoeken wij dat voor je uit.',
    ]],
    ['Welke UWV-brief moet ik uploaden?', [
      'Bij voorkeur de brief waarin UWV aangeeft wanneer je een beslissing kunt verwachten.',
      'Heb je daarna nog een brief gekregen waarin staat dat het langer duurt? Upload die ook.',
      'Kun je de juiste brief niet vinden? Upload de brief die je hebt, dan kijken wij mee.',
    ]],
    ['De datum in mijn brief is nog niet voorbij. Wat dan?', [
      'Dan lijkt UWV op basis van die datum nog niet te laat, en hoef je op dit moment waarschijnlijk '
        + 'nog niets te doen.',
      'Wij laten je wel zien welke datum voor jouw zaak belangrijk is, en houden hem voor je in de '
        + 'gaten. Zodra die datum voorbij is, krijg je vanzelf bericht van ons.',
    ]],
    ['Kan ik dit ook zelf regelen?', [
      '<strong>Ja.</strong> Je bent niet verplicht ons in te schakelen; je kunt een te late beslissing '
        + 'ook zelf bij UWV melden.',
      'Wil je het liever niet zelf uitzoeken en bijhouden, dan kunnen wij het voor je regelen. Wil je '
        + 'eerst alleen weten of het voor jou geldt: je brief laten controleren is gratis.',
    ]],
    ['Krijgen jullie mijn vergoeding van UWV?', [
      '<strong>Nee.</strong> Een toegekende vergoeding wordt rechtstreeks aan jou overgemaakt; die komt '
        + 'niet eerst bij ons binnen.',
      t.bekend
        ? `Ontvang je een vergoeding, dan brengen wij ${t.soort === 'vast' ? `€ ${duizend(t.bedrag)}` : `${t.percentage}%`} in rekening. Ontvang je er geen, dan kost onze hulp je niets.`
        : 'Wat onze hulp kost, hoor je vooraf. Ontvang je geen vergoeding, dan kost het je niets.',
    ]],
    ['Wat gebeurt er met mijn BSN en andere gegevens?', [
      'Wij vragen alleen de gegevens die nodig zijn om je zaak te controleren en te behandelen, en bij '
        + 'elk gegeven staat waarom we het nodig hebben.',
      'Voordat wij iets namens jou doen, zie je precies waarvoor je toestemming geeft. '
        + `Meer hierover staat in onze <a href="/privacy">privacyverklaring</a> en `
        + `<a href="/voorwaarden">voorwaarden</a>.`,
    ]],
  ];
  if (t.bekend) {
    lijst.splice(11, 0, ['Wat kost het?', [
      'Je UWV-brief laten controleren is gratis.',
      prijs.regels[1],
      'Ontvang je geen vergoeding, dan betaal je ons niets.',
    ]]);
  }
  return lijst.map(([v, a]) => vraag(v, a)).join('\n');
}

/**
 * @param {object} env omgevingsvariabelen, voor het tarief en de bedrijfsgegevens
 * @returns {string} de volledige html van de campagnepagina
 */
export function campagneHtml(env = process.env) {
  const t = tarief(env);
  const prijs = prijsblok(t);
  const bedrijf = organisatiegegevens(env);
  const maximum = duizend(TARIEF.maxBedrag);
  const titel = 'Wacht je al lang op een beslissing van UWV? Laat het niet bij wachten';
  const omschrijving = 'Upload je UWV-brief. Wij zoeken gratis uit of UWV al had moeten beslissen '
    + `en wat je nu kunt doen. Blijft een beslissing uit, dan kan je vergoeding oplopen tot € ${maximum}.`;

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${veilig(titel)}</title>
<meta name="description" content="${veilig(omschrijving)}">
<link rel="canonical" href="${SITE}${CAMPAGNE_PAD}">
<meta name="theme-color" content="#ffffff">
<meta name="robots" content="index, follow">

<meta property="og:type" content="website">
<meta property="og:site_name" content="nubeslist.nl">
<meta property="og:locale" content="nl_NL">
<meta property="og:url" content="${SITE}${CAMPAGNE_PAD}">
<meta property="og:title" content="Wacht je al lang op een beslissing van UWV?">
<meta property="og:description" content="${veilig(omschrijving)}">
<meta property="og:image" content="${SITE}/advertenties/uwv-deelkaart.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Wacht je al lang op een beslissing van UWV?">
<meta name="twitter:description" content="${veilig(omschrijving)}">
<meta name="twitter:image" content="${SITE}/advertenties/uwv-deelkaart.png">

<link rel="icon" href="/merk.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icoon-180.png">

<style>
/*
  Alles staat in de pagina. Deze landing hoort bij een advertentie en moet
  daarom twee dingen: meteen laden, en niet meeveranderen als iemand aan de
  vormgeving van de site werkt.
*/
:root {
  --blauw-50: #f2f7fe; --blauw-100: #dfeafb; --blauw-500: #3b7ad4;
  --blauw-600: #24509a; --blauw-700: #1c3a6e;
  --groen-50: #eefaf3; --groen-100: #d4f0e0; --groen-600: #15784a;
  --oranje-50: #fff7ed; --oranje-100: #ffe8cc; --oranje-700: #9a4a05;
  --tekst: #14213a; --tekst-zacht: #57657f; --tekst-licht: #8a95a8;
  --rand: #e2e9f4; --vlak: #ffffff; --achtergrond: #f7fafd;
  --radius: 14px;
  --schaduw: 0 1px 2px rgba(20,33,58,.05), 0 8px 24px rgba(20,33,58,.06);
  --breedte: 1080px;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
body {
  margin: 0; background: var(--vlak); color: var(--tekst);
  font: 16px/1.62 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
img, svg { max-width: 100%; }
h1, h2, h3 { line-height: 1.2; color: var(--tekst); margin: 0 0 14px; letter-spacing: -.015em; }
h1 { font-size: clamp(1.85rem, 5.4vw, 3rem); }
h2 { font-size: clamp(1.4rem, 3.6vw, 2rem); }
h3 { font-size: 1.08rem; }
p { margin: 0 0 15px; }
a { color: var(--blauw-600); }
.omhulsel { width: 100%; max-width: var(--breedte); margin: 0 auto; padding: 0 16px; }
.smal { max-width: 720px; }

/* De balk draagt alleen het merk. Geen menu: elke link is hier een uitgang. */
.balk { border-bottom: 1px solid var(--rand); background: var(--vlak); }
.balk__inhoud { display: flex; align-items: center; justify-content: space-between; gap: 12px; height: 62px; }
.merk { display: inline-flex; align-items: center; gap: 9px; text-decoration: none; color: var(--tekst); font-weight: 700; }
.merk__teken { width: 30px; height: 30px; border-radius: 9px; }
.merk__punt { color: var(--blauw-600); }

section { padding: clamp(40px, 7vw, 68px) 0; }
.grijs { background: var(--achtergrond); }
.kolomkop {
  font-size: .76rem; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
  color: var(--tekst-licht); margin: 0 0 12px;
}

/* ------------------------------------------------------------------ hero -- */
.hero { padding-top: clamp(32px, 6vw, 56px); background:
  radial-gradient(1100px 380px at 50% -140px, var(--blauw-50), transparent); }
.hero__lead { font-size: clamp(1.02rem, 2.3vw, 1.2rem); color: var(--tekst-zacht); max-width: 46ch; }
.hero__onder { font-size: clamp(1.05rem, 2.4vw, 1.25rem); color: var(--tekst-zacht); font-weight: 600; margin: -6px 0 18px; }
.knop {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 15px 26px; border-radius: 11px; border: 1px solid transparent;
  font-size: 1.02rem; font-weight: 700; text-decoration: none; cursor: pointer;
  transition: transform .08s, box-shadow .15s, background .15s;
}
.knop--primair { background: var(--blauw-600); color: #fff; box-shadow: var(--schaduw); }
.knop--primair:hover { background: var(--blauw-700); }
.knop--primair:active { transform: translateY(1px); }
.knop--groot { padding: 17px 32px; font-size: 1.08rem; }
.knop--zacht { background: var(--vlak); color: var(--blauw-600); border-color: var(--rand); }
/*
  Rechtsboven stond een grijs label "Gratis controle". Dat is de plek waar
  iedereen een knop verwacht, dus werd erop geklikt en gebeurde er niets. Nu
  is het er ook echt een, naar dezelfde plek als de rest van de pagina: geen
  uitgang, maar een extra ingang naar de funnel die altijd in beeld is.

  Deze regels staan met opzet ná .knop: anders wint de ruime padding daarvan
  en wordt de knop hoger dan de balk waar hij in moet passen.
*/
.knop--balk { padding: 8px 15px; font-size: .86rem; border-radius: 9px; white-space: nowrap; }
.knop__kort { display: none; }
@media (max-width: 480px) {
  /* Op een smal scherm past "Controleer mijn brief" niet naast het merk. */
  .knop__lang { display: none; }
  .knop__kort { display: inline; }
  .knop--balk { padding: 8px 12px; font-size: .82rem; }
}
.hero__knoppen { display: flex; flex-wrap: wrap; gap: 12px; margin: 20px 0 16px; }
.geruststelling { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px 20px; }
.geruststelling li { display: flex; align-items: center; gap: 7px; font-size: .92rem; color: var(--tekst-zacht); }
.vink { width: 17px; height: 17px; flex: none; color: var(--groen-600); }
.hero__bedrag {
  margin: 22px 0 0; padding: 14px 16px; border-radius: var(--radius);
  background: var(--groen-50); border: 1px solid var(--groen-100);
  font-size: .96rem; color: var(--tekst-zacht);
}
.hero__bedrag strong { color: var(--tekst); }

/* --------------------------------------------------------------- vragen -- */
.zorgen { list-style: none; margin: 0 0 18px; padding: 0; display: grid; gap: 9px; }
.zorgen li {
  padding: 13px 16px; border-radius: 11px; background: var(--vlak);
  border: 1px solid var(--rand); font-weight: 600; color: var(--tekst);
}

/* ----------------------------------------------------------------- stap -- */
.stappen { list-style: none; margin: 24px 0 0; padding: 0; display: grid; gap: 12px; counter-reset: stap; }
@media (min-width: 860px) { .stappen { grid-template-columns: repeat(4, 1fr); } }
.stappen li {
  position: relative; padding: 18px 18px 18px 18px; border-radius: var(--radius);
  background: var(--vlak); border: 1px solid var(--rand); counter-increment: stap;
}
.stappen li::before {
  content: counter(stap); display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; margin-bottom: 9px; border-radius: 8px;
  background: var(--blauw-100); color: var(--blauw-600); font-size: .84rem; font-weight: 800;
}
.stappen strong { display: block; margin-bottom: 3px; }
.stappen span { font-size: .92rem; color: var(--tekst-zacht); }

/* ---------------------------------------------------------------- bedrag -- */
.bedragkaart {
  background: var(--vlak); border: 1px solid var(--rand); border-radius: 18px;
  padding: clamp(22px, 4vw, 34px); box-shadow: var(--schaduw);
}
.bedraggroot {
  font-size: clamp(2.4rem, 8vw, 3.6rem); font-weight: 800; letter-spacing: -.03em;
  color: var(--blauw-700); line-height: 1; margin: 0 0 10px;
}
.tranches { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 7px; }
.tranches li { display: flex; justify-content: space-between; gap: 14px; padding: 9px 0; border-top: 1px solid var(--rand); font-size: .94rem; }
.tranches li span:last-child { font-weight: 700; }

/* ------------------------------------------------------------- voorbeeld -- */
.voorbeeldkaart {
  background: var(--vlak); border: 1px solid var(--rand); border-radius: 18px;
  overflow: hidden; box-shadow: var(--schaduw); max-width: 460px;
}
.voorbeeldkaart__merkje {
  display: block; padding: 7px 16px; background: var(--blauw-50);
  border-bottom: 1px solid var(--rand);
  font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--blauw-600);
}
.voorbeeldkaart__lijf { padding: 20px; }
.voorbeeldkaart__kop { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--groen-600); font-size: .92rem; margin-bottom: 10px; }
.voorbeeldkaart h3 { margin-bottom: 14px; }
.regels { display: grid; gap: 0; margin: 0 0 16px; }
.regels div { display: flex; justify-content: space-between; gap: 14px; padding: 10px 0; border-top: 1px solid var(--rand); font-size: .93rem; }
.regels div span:first-child { color: var(--tekst-zacht); }
.regels div span:last-child { font-weight: 700; text-align: right; }
.uitkomstbalk {
  padding: 12px 14px; border-radius: 11px; background: var(--oranje-50);
  border: 1px solid var(--oranje-100); color: var(--oranje-700); font-weight: 700; font-size: .94rem;
}
.uitkomstbalk--rustig { background: var(--groen-50); border-color: var(--groen-100); color: var(--groen-600); }

/* ---------------------------------------------------------------- prijs -- */
.prijsrij { display: grid; gap: 12px; margin: 22px 0; }
@media (min-width: 720px) { .prijsrij { grid-template-columns: 1fr 1fr; } }
.prijsvak { padding: 20px; border-radius: var(--radius); border: 1px solid var(--rand); background: var(--vlak); }
.prijsvak--uit { background: var(--groen-50); border-color: var(--groen-100); }
.prijsvak__getal { font-size: 2.1rem; font-weight: 800; letter-spacing: -.02em; margin-bottom: 4px; }
.prijsvak__getal--nul { color: var(--groen-600); }
.prijsvak__getal--fee { color: var(--blauw-600); }
.rekenvoorbeeld { margin: 0; border: 1px solid var(--rand); border-radius: var(--radius); overflow: hidden; }
.rekenvoorbeeld div { display: flex; justify-content: space-between; gap: 14px; padding: 12px 16px; font-size: .95rem; border-top: 1px solid var(--rand); }
.rekenvoorbeeld div:first-child { border-top: 0; }
.rekenvoorbeeld div:last-child { background: var(--groen-50); font-weight: 700; }

/* ----------------------------------------------------------------- tabel -- */
.verdeling { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: .95rem; }
.verdeling th { text-align: left; padding: 11px 12px; background: var(--blauw-50); color: var(--blauw-600); font-size: .78rem; text-transform: uppercase; letter-spacing: .07em; }
.verdeling td { padding: 11px 12px; border-top: 1px solid var(--rand); vertical-align: top; }
.verdeling td:first-child { color: var(--tekst-zacht); width: 46%; }

/* ----------------------------------------------------------------- vraag -- */
.vraag { border: 1px solid var(--rand); border-radius: var(--radius); background: var(--vlak); margin-bottom: 9px; }
.vraag summary {
  cursor: pointer; padding: 15px 18px; font-weight: 700; list-style: none;
  display: flex; justify-content: space-between; gap: 14px; align-items: flex-start;
}
.vraag summary::-webkit-details-marker { display: none; }
.vraag summary::after { content: "+"; color: var(--blauw-600); font-size: 1.3rem; line-height: 1; flex: none; }
.vraag[open] summary::after { content: "\\2212"; }
.vraag__antwoord { padding: 0 18px 4px; color: var(--tekst-zacht); }
.vraag__antwoord p:last-child { margin-bottom: 15px; }

/* --------------------------------------------------------------- afsluit -- */
.slotblok { background: var(--blauw-700); color: #fff; }
.slotblok h2, .slotblok strong { color: #fff; }
.slotblok p { color: #cfdcf0; }
.slotblok .knop--primair { background: #fff; color: var(--blauw-700); }
.slotblok .knop--primair:hover { background: var(--blauw-50); }
.slotblok .geruststelling li { color: #cfdcf0; }
.slotblok .vink { color: #7fd8a6; }
.voet { padding: 26px 0 34px; font-size: .84rem; color: var(--tekst-licht); border-top: 1px solid var(--rand); }
.voet a { color: var(--tekst-zacht); }
.voet p { margin: 0 0 7px; }
</style>
</head>
<body>

<header class="balk">
  <div class="omhulsel balk__inhoud">
    <span class="merk">
      ${MERK}
      <span>nubeslist<span class="merk__punt">.nl</span></span>
    </span>
    <a class="knop knop--primair knop--balk" href="${BESTEMMING}">
      <span class="knop__lang">Controleer mijn brief</span>
      <span class="knop__kort">Controleer brief</span>
    </a>
  </div>
</header>

<main>

<!-- 1. Herkenning en actie, zonder dat er juridische kennis nodig is. -->
<section class="hero">
  <div class="omhulsel smal">
    <h1>Wacht je al lang op een beslissing van UWV?</h1>
    <p class="hero__onder">Laat het niet bij wachten.</p>
    <p class="hero__lead">Upload je UWV-brief. Wij zoeken gratis uit of UWV al had moeten
      beslissen en wat je nu kunt doen.</p>
    <div class="hero__knoppen">
      <a class="knop knop--primair knop--groot" href="${BESTEMMING}">Controleer mijn UWV-brief</a>
      <a class="knop knop--zacht" href="#werkwijze">Eerst lezen hoe het werkt</a>
    </div>
    <ul class="geruststelling">
      <li>${VINK} Gratis controle</li>
      <li>${VINK} Binnen een minuut duidelijkheid</li>
      <li>${VINK} Je zit nergens aan vast</li>
    </ul>
    <p class="hero__bedrag">Blijft een beslissing daarna uit? Dan kan je vergoeding oplopen
      tot <strong>€ ${maximum}</strong>.</p>
  </div>
</section>

<!-- 2. "Dit zijn precies mijn vragen." -->
<section class="grijs">
  <div class="omhulsel smal">
    <h2>Al weken of maanden aan het wachten?</h2>
    <p>Misschien heeft UWV gezegd dat het druk is. Of heb je een brief gekregen waarin stond
      wanneer je een beslissing kon verwachten, en is die datum inmiddels voorbij.</p>
    <p>Dan vraag je je waarschijnlijk af:</p>
    <ul class="zorgen">
      <li>Had UWV inmiddels moeten beslissen?</li>
      <li>Kan ik hier iets tegen doen?</li>
      <li>Kan dit gevolgen hebben voor mijn aanvraag of bezwaar?</li>
      <li>Zorgt zo'n melding ervoor dat UWV sneller beslist?</li>
      <li>En kan ik een vergoeding krijgen als UWV te laat blijft?</li>
    </ul>
    <p>Dat hoef je niet allemaal zelf uit te zoeken. Wij controleren jouw situatie aan de hand
      van je UWV-brief.</p>
  </div>
</section>

<!-- 3. Ontdekking: je hoeft niet te blijven wachten. -->
<section id="werkwijze">
  <div class="omhulsel smal">
    <p class="kolomkop">Wat er kan gebeuren</p>
    <h2>UWV te laat? Dan kun je in actie komen.</h2>
    <p>Als UWV al had moeten beslissen, kun je UWV officieel laten weten dat je nog op een
      beslissing wacht. UWV krijgt daarna nog twee weken om alsnog te beslissen. Blijft een
      beslissing uit, dan kan je vergoeding gaan oplopen.</p>
    <ol class="stappen">
      <li><strong>UWV is te laat</strong><span>De datum waarop UWV had moeten beslissen is voorbij.</span></li>
      <li><strong>Wij melden het</strong><span>UWV hoort officieel dat je nog wacht.</span></li>
      <li><strong>Twee weken</strong><span>UWV krijgt nog twee weken om te beslissen.</span></li>
      <li><strong>Nog niets?</strong><span>Dan kan er een vergoeding gaan lopen.</span></li>
    </ol>
    <p style="margin-top:18px;font-size:.9rem;color:var(--tekst-licht)">Zo'n officiële melding
      heet ook wel een <em>melding te late beslissing</em> of <em>ingebrekestelling</em>.</p>
  </div>
</section>

<!-- 4. De financiële trigger, zonder te suggereren dat iedereen het maximum krijgt. -->
<section class="grijs">
  <div class="omhulsel smal">
    <div class="bedragkaart">
      <p class="kolomkop">De wettelijke vergoeding</p>
      <p class="bedraggroot">tot € ${maximum}</p>
      <p>Blijft UWV na die extra twee weken nog steeds te laat? Dan kan er elke dag een
        vergoeding bijkomen, tot dit maximum.</p>
      <p><strong>Of dat voor jou geldt, hangt af van jouw situatie.</strong> Daarom controleren
        we eerst je brief.</p>
      <details class="vraag" style="margin-top:16px">
        <summary>Hoe wordt de vergoeding berekend?</summary>
        <div class="vraag__antwoord">
          <ul class="tranches">
${TARIEF.tranches.map((tr, i) => `            <li><span>${i === 0 ? 'De eerste' : i === 1 ? 'De volgende' : 'De laatste'} ${tr.dagen} dagen</span><span>€ ${tr.perDag} per dag</span></li>`).join('\n')}
            <li><span>Na ${TARIEF.maxDagen} dagen, maximaal</span><span>€ ${maximum}</span></li>
          </ul>
          <p style="margin-top:14px">Deze wettelijke vergoeding heet officieel een <em>dwangsom</em>.</p>
        </div>
      </details>
      <div class="hero__knoppen" style="margin-bottom:0">
        <a class="knop knop--primair" href="${BESTEMMING}">Controleer gratis mijn UWV-brief</a>
      </div>
    </div>
  </div>
</section>

<!-- 5. De grootste angst: breng ik mijn zaak in gevaar? -->
<section>
  <div class="omhulsel smal">
    <p class="kolomkop">De vraag die de meeste mensen tegenhoudt</p>
    <h2>Kan dit gevolgen hebben voor mijn aanvraag of bezwaar?</h2>
    <p>Het kan spannend voelen om UWV officieel te laten weten dat je te lang wacht.</p>
    <p>De melding gaat over het <strong>uitblijven van een beslissing</strong>. Dat is iets
      anders dan bezwaar maken tegen de inhoud van je WIA-, Wajong-, WW- of andere UWV-zaak.
      Loopt er een bezwaar, dan blijft UWV dat bezwaar inhoudelijk behandelen.</p>
    <p>Wij controleren eerst je situatie voordat we iets namens jou versturen. En je ziet
      precies waarvoor je toestemming geeft.</p>

    <h2 style="margin-top:36px">Gaat UWV hierdoor sneller beslissen?</h2>
    <p><strong>Dat kunnen wij niet garanderen.</strong></p>
    <p>Met de melding laat je UWV officieel weten dat je te lang wacht. UWV krijgt daarna nog
      twee weken om alsnog te beslissen. Blijft een beslissing uit, dan kan een vergoeding gaan
      oplopen.</p>
    <p>Wij beloven dus niet wannéér UWV beslist. Wij zorgen er wel voor dat je niet alleen maar
      blijft wachten zonder dat de volgende stap gezet is.</p>
  </div>
</section>

<!-- 6. Het product: je hoeft het zelf niet te weten. -->
<section class="grijs">
  <div class="omhulsel smal">
    <h2>Geen idee of UWV al te laat is?</h2>
    <p>Hoeft ook niet. Upload de brief die je van UWV hebt gekregen, dan zoeken wij voor je uit:</p>
    <ul class="geruststelling" style="display:grid;gap:9px;margin-bottom:20px">
      <li>${VINK} waarop je precies wacht</li>
      <li>${VINK} wanneer UWV volgens je brief had moeten beslissen</li>
      <li>${VINK} of UWV daarna heeft laten weten meer tijd nodig te hebben</li>
      <li>${VINK} of je nu iets kunt doen</li>
    </ul>
    <div class="hero__knoppen">
      <a class="knop knop--primair knop--groot" href="${BESTEMMING}">Upload mijn UWV-brief</a>
    </div>
    <p style="font-size:.9rem;color:var(--tekst-licht)">Pdf, foto of screenshot. Weet je niet
      welke brief je nodig hebt? Upload de brief die je hebt, dan kijken wij mee.</p>
    <p class="hero__bedrag" style="background:var(--blauw-50);border-color:var(--blauw-100)">
      <strong>Alleen je brief uploaden? Dan sturen wij nog niets naar UWV.</strong>
      Je beslist zelf of je daarna verder wilt.</p>
  </div>
</section>

<!-- 7. Laat zien wat er dan gebeurt. Uitdrukkelijk een voorbeeld, geen echt dossier. -->
<section>
  <div class="omhulsel smal">
    <p class="kolomkop">Wat je te zien krijgt</p>
    <h2>Binnen een minuut weet je waar je staat</h2>
    <p>Geen formulier met juridische termijnen die je zelf moet uitrekenen. Je krijgt een
      antwoord over jouw zaak.</p>
    <div class="voorbeeldkaart" style="margin-top:22px">
      <span class="voorbeeldkaart__merkje">Voorbeeld</span>
      <div class="voorbeeldkaart__lijf">
        <p class="voorbeeldkaart__kop">${VINK} We hebben je UWV-brief gelezen</p>
        <h3>Het lijkt erop dat UWV te laat is met je WIA-beslissing</h3>
        <div class="regels">
          <div><span>Jouw zaak</span><span>WIA-aanvraag</span></div>
          <div><span>UWV zou beslissen op</span><span>14 september</span></div>
          <div><span>Vandaag</span><span>22 september</span></div>
        </div>
        <p class="uitkomstbalk">Je wacht 8 dagen langer dan in je brief staat</p>
      </div>
    </div>
  </div>
</section>

<!-- 8. Wat wij doen als je doorgaat. -->
<section class="grijs">
  <div class="omhulsel smal">
    <h2>En als je wilt dat wij het regelen?</h2>
    <p>Dan hoef je de procedure niet zelf uit te zoeken of bij te houden.</p>
    <ol class="stappen" style="grid-template-columns:1fr">
      <li><strong>Wij melden het bij UWV</strong><span>Wij bereiden de melding voor en dienen
        hem namens jou in.</span></li>
      <li><strong>Wij houden de datum bij</strong><span>UWV krijgt daarna twee weken. Wij houden
        bij wanneer die periode voorbij is.</span></li>
      <li><strong>Nog steeds geen beslissing?</strong><span>Dan controleren we of je vergoeding
        begint op te lopen en welk bedrag bij jouw situatie hoort.</span></li>
      <li><strong>Je hoort het van ons</strong><span>Je krijgt vanzelf bericht als er iets
        verandert. Krijg je zelf post van UWV, dan voeg je die toe aan je dossier.</span></li>
    </ol>

    <div class="voorbeeldkaart" style="margin-top:26px">
      <span class="voorbeeldkaart__merkje">Voorbeeld van je dossier</span>
      <div class="voorbeeldkaart__lijf">
        <h3 style="margin-bottom:12px">Je WIA-zaak bij UWV</h3>
        <div class="regels">
          <div><span>Melding verstuurd</span><span>22 september</span></div>
          <div><span>UWV kan beslissen tot</span><span>6 oktober</span></div>
          <div><span>Status</span><span>Wij wachten op UWV</span></div>
        </div>
        <p class="uitkomstbalk uitkomstbalk--rustig">Wat moet jij nu doen? Niets. Wij houden de
          datum voor je bij.</p>
      </div>
    </div>
  </div>
</section>

<!-- 9. De prijs, pas nadat duidelijk is wat je ervoor krijgt. -->
<section id="kosten">
  <div class="omhulsel smal">
    <p class="kolomkop">Wat het kost</p>
    <h2>${veilig(prijs.kop)}</h2>
    <p>${prijs.regels[0]}</p>
${t.bekend ? `    <div class="prijsrij">
      <div class="prijsvak prijsvak--uit">
        <p class="prijsvak__getal prijsvak__getal--nul">€ 0</p>
        <p style="margin:0;color:var(--tekst-zacht)"><strong>Geen vergoeding?</strong><br>Dan betaal je ons niets.</p>
      </div>
      <div class="prijsvak">
        <p class="prijsvak__getal prijsvak__getal--fee">${veilig(prijs.label)}</p>
        <p style="margin:0;color:var(--tekst-zacht)"><strong>Wel een vergoeding?</strong><br>Alleen dan betaal je ${t.soort === 'vast' ? 'dit bedrag' : 'dit deel van de vergoeding die je ontvangt'}.</p>
      </div>
    </div>` : `    <p>${prijs.regels[1]}</p>`}
${prijs.voorbeeld ? `    <p class="kolomkop" style="margin-top:26px">Rekenvoorbeeld</p>
    <div class="rekenvoorbeeld">
      <div><span>UWV betaalt jou</span><span>€ ${duizend(prijs.voorbeeld.duizendSplit.bedrag)},00</span></div>
      <div><span>Onze vergoeding</span><span>€ ${centen(prijs.voorbeeld.duizendSplit.vergoeding)}</span></div>
      <div><span>Jij houdt over</span><span>€ ${centen(prijs.voorbeeld.duizendSplit.overhoudt)}</span></div>
    </div>
    <p style="margin-top:12px;font-size:.93rem;color:var(--tekst-zacht)">Bij de maximale
      vergoeding van € ${duizend(prijs.voorbeeld.maximum)} is onze vergoeding
      € ${centen(prijs.voorbeeld.maxSplit.vergoeding)} en houd jij
      € ${centen(prijs.voorbeeld.maxSplit.overhoudt)} over.</p>` : ''}
    <p class="hero__bedrag" style="margin-top:22px"><strong>De vergoeding wordt door UWV
      rechtstreeks aan jou overgemaakt.</strong> Hij komt niet eerst bij ons binnen.</p>
    <p style="margin-top:16px">Geen onverwachte rekening: je weet vooraf waar je aan toe bent.</p>
  </div>
</section>

<!-- 10. Wie doet wat. -->
<section class="grijs">
  <div class="omhulsel smal">
    <h2>Dit doe jij, dit doen wij</h2>
    <table class="verdeling">
      <thead><tr><th>Jij</th><th>nubeslist.nl</th></tr></thead>
      <tbody>
        <tr><td>Uploadt je UWV-brief</td><td>Leest en controleert je situatie</td></tr>
        <tr><td>Controleert of je gegevens kloppen</td><td>Zoekt uit wat je nu kunt doen</td></tr>
        <tr><td>Geeft toestemming als je door wilt</td><td>Regelt de melding bij UWV</td></tr>
        <tr><td>Uploadt nieuwe post van UWV</td><td>Houdt de belangrijke datums bij</td></tr>
        <tr><td></td><td>Volgt of er een vergoeding ontstaat</td></tr>
        <tr><td></td><td>Houdt je op de hoogte</td></tr>
      </tbody>
    </table>
    <p style="margin-top:16px">Vanaf het moment dat je ons inschakelt, hoef je de procedure niet
      meer zelf bij te houden.</p>
  </div>
</section>

<!-- 11. De bezwaren, ingeklapt: wie ze niet heeft, wordt er niet aan herinnerd. -->
<section>
  <div class="omhulsel smal">
    <p class="kolomkop">Veelgestelde vragen</p>
    <h2>Vragen die mensen ons stellen</h2>
    <div style="margin-top:20px">
${vragen(t, prijs)}
    </div>
  </div>
</section>

<!-- 12. Terug naar waarom iemand hier kwam. -->
<section class="slotblok">
  <div class="omhulsel smal">
    <h2>Al lang genoeg gewacht op UWV?</h2>
    <p style="font-size:1.08rem">Je hoeft niet zelf uit te zoeken wanneer UWV had moeten
      beslissen of welke regels voor jouw situatie gelden. Upload je UWV-brief, dan zoeken wij
      gratis uit of je nu iets kunt doen.</p>
    <div class="hero__knoppen">
      <a class="knop knop--primair knop--groot" href="${BESTEMMING}">Controleer mijn UWV-brief</a>
    </div>
    <ul class="geruststelling">
      <li>${VINK} Gratis controle</li>
      <li>${VINK} Je zit nergens aan vast</li>
      <li>${VINK} Geen vergoeding is € 0</li>
      <li>${VINK} ${veilig(prijs.bullet)}</li>
    </ul>
    <p style="margin-top:18px;font-size:.92rem">Alleen je brief uploaden? Dan sturen wij nog
      niets naar UWV.</p>
  </div>
</section>

</main>

<footer class="voet">
  <div class="omhulsel smal">
    <p><strong>nubeslist.nl</strong> is een particuliere dienstverlener en geen
      overheidsinstantie. Wij zijn niet verbonden aan UWV.</p>
    <p>De uitkomst op je scherm is een inschatting op basis van wat je aanlevert en geen
      juridisch advies.</p>
    <p><a href="/voorwaarden">Voorwaarden</a> &middot; <a href="/privacy">Privacy</a>
      ${bedrijf.email && bedrijf.email !== 'nog niet ingevuld' ? `&middot; <a href="mailto:${veilig(bedrijf.email)}">${veilig(bedrijf.email)}</a>` : ''}</p>
  </div>
</footer>

</body>
</html>
`;
}

/** Het bestand dat scripts/maak-paginas.mjs schrijft. */
export function campagnepaginas(env = process.env) {
  return [{ bestand: `${CAMPAGNE_PAD.slice(1)}.html`, html: campagneHtml(env) }];
}
