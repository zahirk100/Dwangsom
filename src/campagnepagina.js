/**
 * De losse campagnelanding voor UWV.
 *
 * Deze pagina staat bewust náást de site en niet erin. Een advertentiepagina
 * heeft één taak - de bezoeker die op een advertentie klikte door één verhaal
 * heen leiden - en elke afleiding kost conversie. Daarom:
 *
 *   - **Geen sitenavigatie.** De menubalk springt naar plekken op deze pagina
 *     zelf en nergens anders heen. Een advertentieklik die de site in wandelt
 *     is betaald verkeer dat niets oplevert.
 *   - **Eigen css, in de pagina zelf.** Geen `stijl.css`, geen `landing.css`.
 *     Verandert er iets aan de vormgeving van de site, dan verandert er niets
 *     aan een pagina waar geld achter staat. Dat scheelt ook een extra
 *     verzoek, en snelheid is hier direct geld.
 *   - **Eén bestemming.** Elke knop en elk bestand gaan naar dezelfde plek,
 *     met dezelfde herkomst erachter, zodat in de cijfers terug te zien is
 *     wat deze pagina doet.
 *
 * Het tarief komt uit `tarief.js`, dezelfde bron als de funnel, de machtiging
 * en de voorwaarden. Dat is geen netheid maar noodzaak: een advertentiepagina
 * die 20% belooft terwijl de funnel 25% afrekent, is een onjuiste
 * prijsvermelding. Door het uit één plek te halen kan dat niet ontstaan.
 * Hetzelfde geldt voor de bedragen per dag en het maximum: die staan in
 * `dwangsom.js`, niet in deze tekst.
 *
 * De volgorde van de pagina volgt de vragen die iemand stelt:
 *   herkenning -> wat kan ik doen -> raakt dit mijn zaak -> met wie heb ik te
 *   maken -> upload -> wat kost het -> actie.
 *
 * Het uploadvak hier is echt. Wat de bezoeker kiest gaat mee naar de funnel
 * (via sessionStorage, zie `assets/funnel.js`), zodat hij zijn brief niet
 * twee keer hoeft te zoeken.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tarief } from '../public/shared/tarief.js';
import { TARIEF, HERSTELTERMIJN_DAGEN } from '../public/shared/dwangsom.js';
import { organisatiegegevens } from './organisatie.js';
import { organisatieSchema, siteSchema, faqSchema, kruimelSchema, dienstSchema, metSchema } from './seo.js';

const SITE = 'https://nubeslist.nl';
const HIER = path.dirname(fileURLToPath(import.meta.url));

/** Het pad van deze pagina, zonder .html. */
export const CAMPAGNE_PAD = '/uwv-te-laat';

/**
 * Waar de knoppen heen gaan.
 *
 * `van` en niet `bron`: `bron` is het kanaal waar de bezoeker vandaan komt
 * (meta, google, organisch) en `van` is de pagina waar hij op klikte. Die
 * twee door elkaar halen kostte precies wat je niet wilt kwijtraken - er
 * stond eerst `bron=uwv-te-laat`, en daarmee viel elke advertentieklik in de
 * cijfers onder "overig" in plaats van onder "meta".
 *
 * Het kanaal zelf wordt door assets/meting.js aan deze link toegevoegd,
 * zodat het de hop van landingspagina naar funnel overleeft.
 */
const BESTEMMING = '/aanvraag?instantie=uwv&amp;van=uwv-te-laat';

/** Dezelfde bestemming, maar bruikbaar in javascript (zonder html-escape). */
const BESTEMMING_JS = '/aanvraag?instantie=uwv&van=uwv-te-laat';

function veilig(tekst) {
  return String(tekst ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** '1442' -> '1.442' */
function duizend(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Het lettertype van de vormgeving is Figtree. De bestanden horen in
 * `public/assets/` te staan als `figtree-400.woff2` tot en met
 * `figtree-800.woff2`. Staan ze er niet, dan wordt er ook geen @font-face
 * geschreven: dan valt de pagina terug op het systeemlettertype in plaats van
 * vier verzoeken te doen die 404 opleveren.
 */
const GEWICHTEN = [400, 600, 700, 800];

function lettertype() {
  const map = path.join(HIER, '..', 'public', 'assets');
  const regels = GEWICHTEN
    .filter((gewicht) => fs.existsSync(path.join(map, `figtree-${gewicht}.woff2`)))
    .map((gewicht) => `@font-face{font-family:Figtree;font-weight:${gewicht};font-display:swap;`
      + `src:url(/assets/figtree-${gewicht}.woff2) format('woff2')}`);
  return regels.join('\n');
}

/**
 * Het prijsblok in woorden.
 *
 * Staat er geen tarief in de omgeving, dan noemt deze pagina géén getal. Een
 * verzonnen percentage op de pagina waar iemand besluit door te gaan is erger
 * dan geen percentage; dat is dezelfde afspraak als in de funnel.
 */
function prijsblok(t) {
  if (!t.bekend) {
    return {
      kop: 'Je hoort vooraf wat het kost',
      intro: 'Laat je ons het vervolg met UWV regelen? Dan hoor je eerst precies wat dat kost. '
        + 'Je gaat nooit ergens aan vast zonder dat je het bedrag kent.',
      label: '',
      prijs: 'Je hoort het vooraf',
      punten: [
        'De controle van je brief is altijd gratis.',
        'Wat onze hulp kost, hoor je voordat je iets tekent.',
      ],
    };
  }
  const vast = t.soort === 'vast';
  return {
    kop: 'Je betaalt alleen als UWV jou betaalt voor het wachten',
    intro: 'Laat je ons het vervolg met UWV regelen? Dan betaal je niets vooraf. '
      + 'We verdienen alleen als jij door de verdere vertraging een vergoeding krijgt.',
    label: 'Onze prijs',
    prijs: vast ? `€ ${duizend(t.bedrag)}` : `${t.percentage}% van die vergoeding`,
    punten: [
      '<b>Eerst</b> betaalt UWV de vergoeding rechtstreeks aan jou.',
      '<b>Pas daarna</b> betaal je NuBeslist.',
      'Krijg je geen vergoeding? Dan betaal je ons ook niets.',
    ],
  };
}

/**
 * De vormgeving. Eén blok, in de pagina zelf.
 *
 * De volgorde is: kleuren en basis, dan de balk, dan de secties van boven
 * naar beneden, dan de breekpunten. De pagina wordt op vier breedtes bekeken
 * (320, 390, 834 en 1280), en de mobiele regels staan bewust achteraan zodat
 * ze het gedrag op een klein scherm overnemen in plaats van ertegenin te
 * werken.
 */
const CSS = `
:root{--navy:#0B1250;--body:#3F4A7A;--muted:#6B769F;--line:#E3E9F5;--tint:#F3F7FD;--tint2:#EAF1FC;--teal:#0E9486;--tealh:#0B7F73;--tealbg:#E4F5F2;--amber:#B86A00;--amberbg:#FFF4E3;--green:#1F7A4D;--greenbg:#E9F6EE}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:80px}
body{margin:0;background:#fff;font-family:Figtree,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--navy);font-size:18px;line-height:1.6;-webkit-font-smoothing:antialiased}
h1,h2,h3{margin:0;line-height:1.12;letter-spacing:-.015em;text-wrap:balance}
h1{font-size:clamp(34px,5vw,56px);font-weight:800}
h2{font-size:clamp(28px,3.4vw,40px);font-weight:800}
h3{font-size:20px;font-weight:700;line-height:1.3}
p{margin:0}
a{color:var(--navy);text-decoration-color:rgba(11,18,80,.35);text-underline-offset:3px}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
.band{padding:96px 0}
.band.tint{background:var(--tint)}
.eyebrow{font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--teal);margin-bottom:14px}
.lead{font-size:20px;color:var(--body);margin-top:16px;max-width:640px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;background:var(--teal);color:#fff;font-weight:700;border-radius:14px;text-decoration:none;font-size:19px;padding:18px 28px;border:0;cursor:pointer;font-family:inherit;transition:background .15s}
.btn:hover{background:var(--tealh)}
.btn:focus-visible,a:focus-visible,summary:focus-visible,button:focus-visible{outline:3px solid #7FD3C8;outline-offset:3px}
.nw{white-space:nowrap}
/* merk */
.merk{display:inline-flex;align-items:baseline;font-weight:800;font-size:23px;letter-spacing:-.02em;color:var(--navy);text-decoration:none;line-height:1}
.merk__punt{width:7px;height:7px;border-radius:50%;background:#4FB3F6;margin-left:3px;align-self:flex-start;margin-top:2px}
footer .merk{color:#fff;font-size:24px;margin-bottom:18px}
/* HEADER */
header{position:sticky;top:0;z-index:50;background:#fff;box-shadow:0 1px 0 var(--line);transition:box-shadow .2s}
header.scrolled{box-shadow:0 1px 0 var(--line),0 8px 24px rgba(11,18,80,.06)}
.hin{max-width:1120px;margin:0 auto;height:72px;display:grid;grid-template-columns:200px 1fr 290px;align-items:center;padding:0 24px;transition:height .2s}
header.scrolled .hin{height:64px}
nav{display:flex;justify-content:center;gap:30px;font-size:16px;font-weight:600}
nav a{color:var(--navy);text-decoration:none;padding:8px 0;position:relative}
nav a:hover{color:var(--teal)}
nav a.active::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;border-radius:2px;background:var(--teal)}
.slot{display:flex;justify-content:flex-end}
.hbtn{font-size:15px;padding:11px 18px;border-radius:999px;opacity:0;visibility:hidden;transform:translateY(-4px);transition:opacity .2s,transform .2s,visibility .2s}
header.cta .hbtn{opacity:1;visibility:visible;transform:none}
.mob{display:none;align-items:center;gap:4px}
.mbtn{background:none;border:0;display:flex;flex-direction:column;align-items:center;gap:1px;width:48px;height:48px;justify-content:center;color:var(--navy);font:700 11px inherit;font-family:inherit;cursor:pointer}
.ov{position:fixed;inset:0;background:rgba(11,18,80,.35);backdrop-filter:blur(3px);z-index:60;display:none}
.sheet{position:fixed;left:0;right:0;top:0;background:#fff;border-radius:0 0 24px 24px;padding:0 16px 22px;z-index:61;display:none}
.open .ov,.open .sheet{display:block}
.sheet .top{height:60px;display:flex;align-items:center;justify-content:space-between}
.sheet ul{list-style:none;margin:0 0 16px;padding:0}
.sheet li a{display:flex;justify-content:space-between;align-items:center;padding:15px 4px;border-bottom:1px solid var(--line);font-size:17px;font-weight:600;color:var(--navy);text-decoration:none}
.sheet .btn{width:100%;font-size:17px}
.indep{display:flex;gap:8px;align-items:center;font-size:15px;color:var(--muted)}
.sheet .indep{justify-content:center;margin-top:14px}
/* HERO */
.hero{background:linear-gradient(180deg,var(--tint) 0%,#fff 100%);padding:72px 0 88px}
.hero h1{font-size:clamp(32px,3.9vw,48px)}
.hgrid{display:grid;grid-template-columns:1.05fr .95fr;column-gap:48px;grid-template-areas:"text card" "ind card";align-items:center}
.htext{grid-area:text;align-self:end}.hind{grid-area:ind;align-self:start}.result{grid-area:card}
.hero .sub{font-size:clamp(22px,2.4vw,28px);font-weight:700;margin-top:14px}
.hero .lead{margin-top:18px}
.hero .btn{margin-top:30px;min-width:380px}
.checks{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:18px;font-size:16px;color:var(--body);list-style:none;padding:0}
.checks li{display:flex;gap:8px;align-items:center}
.hind .indep{margin-top:30px;padding-top:18px;border-top:1px solid var(--line);display:inline-flex;font-weight:600;color:var(--body)}
.result{background:#fff;border-radius:24px;box-shadow:0 30px 70px rgba(11,18,80,.12),0 0 0 1px var(--line);padding:30px 32px}
.result .tag{display:inline-block;font-size:13px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--navy);background:var(--tint);border-radius:8px;padding:6px 10px;margin-bottom:8px}
.rtop{margin-bottom:22px}
.rsub{display:block;font-size:15px;color:var(--body)}
.flow{list-style:none;margin:0;padding:0 0 0 22px;position:relative}
.flow::before{content:"";position:absolute;left:5px;top:8px;bottom:8px;width:2px;background:var(--line)}
.flow li{position:relative;padding:0 0 18px}
.flow li::before{content:"";position:absolute;left:-22px;top:6px;width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid #C7D3EA}
.flow span{display:block;font-size:14px;color:#56628F;line-height:1.3}
.flow b{display:block;font-size:18px;line-height:1.35;margin-top:2px}
.flow li.c b{font-size:17px;font-weight:600}
.flow li.d b{font-size:22px;font-weight:800}
.flow li.w b{font-size:26px;font-weight:800;line-height:1.25}
.flow li.w em{display:block;font-style:normal;font-size:15px;color:var(--body);margin-top:2px}
.flow li.w::before{border-color:var(--amber);background:var(--amberbg)}
.status{margin-top:4px;background:var(--amberbg);color:var(--amber);border-radius:14px;padding:16px 18px;font-weight:800;display:flex;gap:12px;align-items:center;font-size:22px;letter-spacing:-.01em}
.result .foot{font-size:14px;color:var(--muted);margin-top:14px}
/* HERKENNING */
.two{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:start}
.qs{list-style:none;margin:0;padding:0}
.qs li{display:flex;gap:16px;align-items:flex-start;padding:14px 0;border-top:1px solid #E6EBF4;font-size:18px;font-weight:500;color:var(--body);line-height:1.35}
.qs li:last-child{border-bottom:1px solid #E6EBF4}
.qs .n{flex:none;width:24px;height:24px;border-radius:50%;background:#EEF1F7;color:#7A84A8;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:3px}
.relief{position:relative;margin-top:44px;padding:28px 30px;background:var(--tealbg);border-radius:18px;box-shadow:0 14px 36px rgba(14,148,134,.14)}
.relief::before{content:"";position:absolute;left:37px;top:-34px;width:2px;height:26px;background:#9FD6CD}
.relief .ric{display:flex;width:48px;height:48px;margin-bottom:12px}
.relief h3{font-size:28px;font-weight:800;line-height:1.15;color:#08574F}
.relief p{font-size:17px;margin-top:10px;max-width:34em;color:#1C5F57}
.band.tight-b{padding-bottom:64px}.band.tight-t{padding-top:64px}
.band.loose-b{padding-bottom:112px}.band.loose-t{padding-top:112px}
/* STAPPEN */
.steps{list-style:none;margin:48px 0 0;padding:0;display:grid;grid-template-columns:repeat(4,1fr);position:relative}
.steps::before{content:"";position:absolute;left:24px;right:24px;top:22px;height:3px;background:linear-gradient(90deg,#D9E2F2 0 25%,#0E9486 25% 50%,#C9D8F2 50% 75%,#F2D6AC 75%)}
.steps li{position:relative;padding-right:28px}
.dot{width:48px;height:48px;border-radius:50%;background:#fff;border:1px solid var(--line);color:var(--navy);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;position:relative;z-index:1;margin-bottom:20px}
.steps li.start .dot{background:#E8EDF7;border-color:#E8EDF7}
.steps li.us .dot{background:var(--teal);border-color:var(--teal);color:#fff}
.steps li.wait .dot{background:var(--tint2);border-color:#C9D8F2}
.steps li.money .dot{background:var(--amberbg);border-color:#F2D6AC;color:var(--amber)}
.steps li.money h3{color:#8A5000}
.steps h3{margin-bottom:8px}
.steps p{font-size:16px;color:#56628F}
.note{margin-top:12px;font-size:15px;font-weight:600;border-radius:10px;padding:10px 12px;line-height:1.45}
.note.t{background:var(--tealbg);color:#0B6B61}.note.b{background:var(--tint2);color:var(--navy)}
.steps li.us .note.t{background:var(--teal);color:#fff;font-size:16px;font-weight:700;padding:12px 14px 12px 44px;position:relative;box-shadow:0 8px 20px rgba(14,148,134,.22)}
.steps li.us .note.t::before{content:"";position:absolute;left:13px;top:50%;margin-top:-10px;width:20px;height:20px;border-radius:50%;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230E9486' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5'/%3E%3C/svg%3E") center/13px no-repeat}
details.calc{margin-top:44px;border:1px solid var(--line);border-radius:16px;background:#fff}
details.calc summary{list-style:none;cursor:pointer;padding:18px 22px;font-weight:700;color:var(--teal);display:flex;justify-content:space-between;align-items:center}
details.calc summary::-webkit-details-marker{display:none}
details.calc[open] summary .chev{transform:rotate(180deg)}
.calcbody{padding:0 22px 22px;color:var(--body);font-size:16px}
.calcbody table{border-collapse:collapse;margin:12px 0;width:100%;max-width:520px}
.calcbody td{padding:8px 0;border-bottom:1px solid var(--line)}
.calcbody td:last-child{text-align:right;font-weight:700;color:var(--navy)}
/* GEVOLGEN */
.gans{max-width:760px}
.gans .ack{display:block;font-size:17px;color:#56628F}
.gans .answer{display:block;margin-top:12px;font-size:clamp(26px,2.6vw,32px);line-height:1.18;font-weight:800;color:var(--navy);padding-left:18px;border-left:5px solid var(--teal)}
.safe{display:grid;grid-template-columns:1.15fr 1fr;gap:48px;margin-top:40px;align-items:start}
.skey{background:#fff;border-radius:24px;padding:32px;box-shadow:0 0 0 1px var(--line),0 20px 50px rgba(11,18,80,.08)}
.skh{display:flex;gap:12px;align-items:center;margin-bottom:8px}
.skey .ic{width:40px;height:40px;border-radius:12px;background:var(--tealbg);display:flex;align-items:center;justify-content:center}
.skey h3{font-size:16px;color:#56628F;font-weight:600}
.skey .big{font-size:clamp(26px,2.6vw,32px);font-weight:800;color:var(--navy);line-height:1.15;margin:6px 0 14px}
.skey p:not(.big){font-size:17px;color:var(--body);line-height:1.6}
.sside .fact{padding:0 0 10px;margin-bottom:26px}
.sside .fact h3{font-size:17px;font-weight:700;margin-bottom:8px}
.sside .fact p{font-size:16px;line-height:1.6;color:#56628F;max-width:34em}
/* OVER */
.isle1 .why{margin-top:28px;padding:4px 0 4px 20px;border-left:2px solid #D9E2F2;max-width:820px}
.isle1 .why h3{font-size:17px}
.isle1 .why p{color:#56628F;margin-top:8px}
.isle1 .why p.strong{color:var(--navy);font-weight:600;margin-top:12px}
.trio{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:20px;margin-top:40px;align-items:start}
.card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:26px;min-width:0}
.card h3{margin-bottom:10px}
.card p{font-size:16px;color:var(--body)}
.card.id{border:0;box-shadow:0 0 0 1px var(--line),0 16px 40px rgba(11,18,80,.08)}
.card.id>p{font-size:15px;color:#56628F}
.card.soft h3{display:flex;gap:12px;align-items:center}
.card.soft h3::before{content:"";flex:none;width:38px;height:38px;border-radius:50%;background:var(--tint2) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230B1250' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='5' y='11' width='14' height='10' rx='2'/%3E%3Cpath d='M8 11V8a4 4 0 0 1 8 0v3'/%3E%3C/svg%3E") center/18px no-repeat}
#contact h3::before{background:var(--tealbg) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230E9486' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.6A8 8 0 1 1 21 12z'/%3E%3C/svg%3E") center/18px no-repeat}
.card.soft>p{font-size:15px;color:#56628F}
.kvk{margin-top:18px;background:var(--tint2);border-radius:14px;padding:16px;display:grid;gap:8px}
.kvkrow{display:grid;grid-template-columns:20px 1fr auto;gap:10px;align-items:center;font-size:15px}
.kvkrow span{color:var(--body)}
.kvkrow b{font-size:18px;font-weight:800;color:var(--navy)}
.kvklink{margin-top:4px;font-weight:700;font-size:15px;display:inline-flex;gap:6px;align-items:center}
.clink{display:flex;align-items:center;gap:10px;margin-top:12px;padding:12px 14px;border-radius:12px;text-decoration:none;font-size:16px;background:#fff;border:1px solid var(--line);color:var(--navy);font-weight:600}
.clink:hover{border-color:#C9D6EE}
.small{font-size:14px;color:var(--muted);margin-top:10px}
.trows{margin-top:28px;background:#fff;border-radius:18px;box-shadow:0 0 0 1px var(--line)}
.trow{display:flex;gap:14px;align-items:center;padding:16px;text-decoration:none;color:#56628F;font-size:14.5px;line-height:1.4}
.trow+.trow{border-top:1px solid var(--line)}
.trow span{flex:1}
.trow b{display:block;color:var(--navy);font-size:16.5px;margin-bottom:2px}
.trow svg{flex:none}
.trow>svg:first-child{width:38px;height:38px;padding:9px;border-radius:50%;background:var(--tint2)}
.bridge{margin-top:40px;background:var(--tealbg);border-radius:22px;padding:26px 28px;display:grid;grid-template-columns:1fr auto 1fr;gap:24px;align-items:start}
.bstep{display:flex;gap:14px;align-items:flex-start}
.bn{flex:none;width:38px;height:38px;border-radius:50%;background:#fff;color:var(--teal);font-weight:800;font-size:17px;display:flex;align-items:center;justify-content:center}
.bstep h3{color:#08574F;margin-bottom:4px;font-size:18px}
.bstep p{font-size:15px;color:#1C5F57}
.barrow{color:var(--teal);margin-top:6px}
/* UPLOAD */
.upgrid{display:grid;grid-template-columns:.8fr 1.2fr;column-gap:64px;grid-template-areas:"top drop" "bot drop";align-items:start}
.uptop{grid-area:top;align-self:end}.upbot{grid-area:bot}.upgrid .drop{grid-area:drop;align-self:center}
.promise{display:flex;gap:10px;align-items:center;margin-top:22px;font-size:20px;font-weight:700;color:var(--navy)}
details.hint{margin-top:28px}
details.hint summary{list-style:none;cursor:pointer;display:flex;gap:10px;align-items:center;font-weight:700;font-size:17px;color:var(--navy)}
details.hint summary::-webkit-details-marker{display:none}
details.hint[open] .chev{transform:rotate(180deg)}
details.hint p{font-size:16px;color:var(--body);margin-top:8px;padding-left:14px;border-left:3px solid var(--line)}
.drop{background:#fff;border:1.5px solid #CFE0F2;border-radius:28px;box-shadow:0 30px 70px rgba(11,18,80,.10);overflow:hidden;text-align:center}
.micro{list-style:none;margin:0;padding:14px 20px;display:flex;justify-content:center;gap:10px 22px;flex-wrap:wrap;background:var(--tint);border-bottom:1px solid var(--line);font-size:14px;font-weight:600;color:var(--muted)}
.micro li{display:flex;gap:8px;align-items:center}
.micro span{width:22px;height:22px;border-radius:50%;background:#fff;border:1px solid #D3DDEE;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--navy)}
.micro li.on{color:var(--navy)}
.micro li.on span{background:var(--teal);border-color:var(--teal);color:#fff}
.micro li.done span{background:var(--tealbg);border-color:var(--tealbg);color:var(--teal)}
.dropin{margin:24px 28px 0;padding:32px 28px;border:2px dashed #C7D6EE;border-radius:20px;transition:border-color .15s,background .15s}
.drop.over .dropin{border-color:var(--teal);background:#F4FBFA}
.drop h3{font-size:26px;margin-top:14px}
.drop .or{color:var(--muted);font-size:16px;margin-top:4px}
.drop .btn{margin-top:22px;width:100%;font-size:19px;padding:18px 24px}
.drop .fmt{font-size:15px;color:var(--muted);margin-top:12px;text-wrap:balance}
.files{list-style:none;padding:0;margin:16px 0 0;text-align:left;font-size:15px}
.files li{display:flex;gap:8px;align-items:center;justify-content:space-between;font-weight:600;background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-top:6px}
.files .fn{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.files .ok{color:var(--teal);font-weight:800}
.go{display:none}
.drop.has .go{display:flex}
.pick .n1{display:none}
.drop.has .pick{background:none;color:var(--teal);padding:10px;font-size:16px;margin-top:8px;width:auto}
.drop.has .pick .n0{display:none}
.drop.has .pick .n1{display:inline}
.drop.has .or,.drop.has .fmt{display:none}
.drop.has .dropin{border-style:solid;border-color:#BFE3DD;background:#FAFDFD;display:flex;flex-direction:column;align-items:stretch}
.drop.has .dropin>svg{align-self:center}
.drop.has .files{order:1}.drop.has .go{order:2}.drop.has .pick{order:3;align-self:center}.drop.has .melding{order:4}.drop.has .next{order:5}
.melding{margin-top:12px;font-size:15px;border-radius:10px;padding:10px 12px;text-align:left}
.melding--bezig{background:var(--tealbg);color:#0B6B61}
.melding--fout{background:var(--amberbg);color:#8A5000}
.assure{list-style:none;padding:18px 0 0;margin:20px 28px 0;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;justify-content:center;gap:8px 20px;font-size:15px;font-weight:600;color:var(--navy)}
.assure li{display:flex;gap:7px;align-items:flex-start;text-align:left}
.assure svg,.priv svg{flex:none;margin-top:2px}
.priv{display:flex;gap:8px;align-items:center;justify-content:center;font-size:14px;color:var(--muted);margin:10px 28px 24px}
.next{font-size:14px;color:var(--body);margin-top:10px;display:none}
/* FAQ */
.faq{max-width:820px;margin:0 auto}
.faq .lead{margin-left:0}
#vragen .faq>h2{font-size:clamp(24px,2.6vw,32px)}
.q{border-bottom:1px solid var(--line)}
.q:first-of-type{border-top:1px solid var(--line)}
.q summary{list-style:none;cursor:pointer;padding:22px 4px;font-size:19px;font-weight:700;display:flex;justify-content:space-between;gap:16px;align-items:center}
.q summary::-webkit-details-marker{display:none}
.q[open] summary .chev{transform:rotate(180deg)}
.chev{flex:none;transition:transform .2s}
.a{padding:0 4px 26px;color:var(--body);font-size:17px}
.a p+p{margin-top:12px}
.a a{font-weight:600}
/* kosten */
.cost h3.big{font-size:clamp(24px,3vw,30px);font-weight:800;color:var(--navy);line-height:1.15}
.cost .intro{margin-top:10px}
.svc{margin-top:22px;background:var(--tint);border-radius:16px;padding:20px 22px}
.svc h4{margin:0 0 10px;font-size:17px;color:var(--navy)}
.svc ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.svc li{display:flex;gap:10px;align-items:flex-start;font-size:16px;color:var(--body)}
.svc li svg{flex:none;margin-top:3px}
.svc li b{color:var(--navy);font-weight:700}
.svc .pill{margin-top:12px;display:inline-block;background:#fff;border-radius:999px;padding:6px 14px;font-weight:700;font-size:15px;color:var(--navy)}
.split{text-align:center;margin:18px 0 12px;font-size:16px;color:var(--navy)}
.opts{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.opt{border-radius:16px;padding:24px 26px}
.opt.g{background:var(--greenbg)}.opt.o{background:#FCEFDB}
.opt h4{margin:0;font-size:17px;color:var(--navy)}
.opt .d{font-size:16px;margin-top:4px;color:var(--body)}
.opt .price{font-size:38px;letter-spacing:-.01em;font-weight:800;color:var(--green);margin-top:14px;line-height:1.1}
.opt .lbl{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:14px}
.opt .price2{font-size:26px;font-weight:800;color:var(--navy);line-height:1.15}
.opt ul{list-style:none;margin:18px 0 0;padding:16px 0 0;border-top:1px solid rgba(184,106,0,.2);display:grid;gap:12px;font-size:16px;line-height:1.45}
.opt ul li{display:flex;gap:8px;align-items:flex-start}
.opt ul li svg{flex:none;margin-top:3px}
.opt ul b{color:var(--navy)}
.of{display:none}
.end{margin-top:72px}
.endin{background:linear-gradient(180deg,var(--tint) 0%,#fff 100%);border-radius:28px;padding:40px 24px;text-align:center}
.endic{display:inline-flex;width:56px;height:56px;border-radius:16px;background:var(--tealbg);align-items:center;justify-content:center;margin-bottom:14px}
.end h2{font-size:clamp(22px,2.4vw,28px)}
.end p{color:var(--body);margin-top:10px}
.end .btn{margin-top:24px}
.end .alt{margin-top:18px;font-size:16px;color:var(--body)}
.end .alt a{font-weight:700;color:var(--navy)}
/* FOOTER */
footer{background:var(--navy);color:#fff}
.fin{max-width:1120px;margin:0 auto;padding:64px 24px 0}
.fgrid{display:grid;grid-template-columns:1.25fr 1fr 1fr 1fr;gap:40px;padding-bottom:40px}
footer h4{margin:0 0 18px;font-size:15px;font-weight:700;height:22px;display:flex;align-items:flex-end}
.brand p{color:#D5DBF5;font-size:16px;line-height:1.55;max-width:320px}
.fi{display:flex;align-items:center;gap:12px;margin:0 0 14px;color:#E8ECFA;font-size:15px;text-decoration:none}
a.fi:hover{text-decoration:underline}
.flink{color:#9CC4FF;text-decoration:none;font-size:15px;display:inline-flex;gap:6px;align-items:center;border-bottom:1px solid rgba(156,196,255,.45)}
.fl{list-style:none;margin:0;padding:0}
.fl li{margin:0 0 14px}
.fl a{font-size:15px;color:#E8ECFA;text-decoration:none}
.fl a:hover{text-decoration:underline}
.fbar{border-top:1px solid rgba(255,255,255,.14);display:flex;justify-content:space-between;padding:20px 0 26px;font-size:14px;color:#AEB7DE}
/* RESPONSIVE */
.mb,.mbb,.micro-m,.svc-m{display:none}
@media (max-width:960px){
 .hin{grid-template-columns:1fr auto;height:60px!important;padding:0 16px}
 nav,.slot{display:none}.mob{display:flex}
 .merk{font-size:19px}
 .band{padding:64px 0}.hero{padding:40px 0 56px}
 .hgrid{grid-template-columns:1fr;grid-template-areas:"text" "card" "ind";row-gap:28px}
 .hind .indep{margin-top:0;padding-top:0;border:0}
 .two{grid-template-columns:1fr;gap:36px}
 .hero .btn,.end .btn{min-width:0;width:100%;font-size:17px;padding:16px 18px}
 .result{padding:24px 22px}
 .flow li.d b{font-size:20px}.flow li.w b{font-size:21px}.status{font-size:20px}
 .steps{grid-template-columns:1fr;margin-top:32px}
 .steps::before{left:23px;right:auto;top:24px;bottom:40px;width:3px;height:auto;background:linear-gradient(#D9E2F2 0 18%,#0E9486 18% 46%,#C9D8F2 46% 72%,#F2D6AC 72%)}
 .steps li{display:grid;grid-template-columns:48px 1fr;column-gap:18px;padding:0 0 26px}
 .steps li .dot{grid-row:span 4;margin:0}
 .safe{grid-template-columns:1fr;gap:28px}.skey{padding:24px 22px}
 .trio{grid-template-columns:1fr;gap:28px}
 .bridge{grid-template-columns:1fr;gap:12px;padding:22px}
 .barrow{transform:rotate(90deg);justify-self:start;margin-left:8px}
 .upgrid{grid-template-columns:1fr;grid-template-areas:"top" "drop" "bot";row-gap:28px}
 .assure{flex-direction:column;align-items:flex-start;padding-left:4px}
 .priv{justify-content:flex-start;text-align:left}
 .upbot details.hint{margin-top:0}
 .dropin{margin:18px 16px 0;padding:24px 16px}.drop .assure{margin:18px 20px 0}.drop .priv{margin:10px 20px 20px}
 .micro{font-size:12.5px;gap:6px 10px;padding:12px 8px;flex-wrap:nowrap}.micro span{width:20px;height:20px;flex:none}
 .opts{grid-template-columns:1fr}.opt .price{font-size:32px}.opt .price2{font-size:22px}
 .band.loose-b{padding-bottom:80px}.band.loose-t{padding-top:80px}
 .band.tight-b{padding-bottom:48px}.band.tight-t{padding-top:48px}
 .end{margin-top:48px}.endin{padding:32px 18px}
 .fgrid{grid-template-columns:1fr;gap:0}
 .fgrid>div{padding:14px 0;border-top:1px solid rgba(255,255,255,.12)}
 .fgrid>.brand{border:0;padding-top:0}
 .c-contact{order:1}.c-bedrijf{order:2}.c-info{order:3}
 .fin{padding:28px 20px 0}.fbar{flex-direction:column;gap:6px}
 .desk{display:none}
}
@media (min-width:961px){.mobo{display:none}}
@media (max-width:620px){
 body{font-size:17px;line-height:1.55}
 .wrap,.hin,.fin{padding-left:20px;padding-right:20px}
 .dt,.dtb{display:none!important}
 .mb{display:inline}.mbb{display:block}
 h2{font-size:27px;line-height:1.12}h3{font-size:18px;line-height:1.25}
 .lead{font-size:17px;line-height:1.5;margin-top:12px}
 .eyebrow{font-size:13px;margin-bottom:10px}
 .hero{padding:28px 0 52px}
 #herken{padding:48px 0 44px}#hoe{padding:44px 0 56px}#gevolgen{padding:56px 0 64px}
 #over{padding:64px 0 40px}#upload{padding:40px 0 64px}#vragen{padding:56px 0 56px}
 .hero h1{font-size:32px;line-height:1.08;letter-spacing:-.02em;max-width:330px}
 .hero .sub{margin-top:8px;font-size:21px}
 .hero .lead{margin-top:16px}.hero .btn{margin-top:22px}
 .checks{gap:6px 16px;margin-top:14px;font-size:15px}.checks svg{width:18px;height:18px}
 .hgrid{row-gap:24px}
 .result{padding:20px 20px 18px}.rsub{display:none}.rtop{margin-bottom:16px}
 .flow li{padding-bottom:14px}
 .flow li.c b{font-size:16px}.flow li.d b{font-size:20px}.flow li.w b{font-size:24px}
 .status{font-size:19px;padding:14px 16px}
 .result .foot{margin-top:10px}
 .hind .indep{font-size:14px;font-weight:600;margin-top:-6px}
 #herken .two{gap:18px}
 .qs li{font-size:16px;padding:10px 0}
 .qs .n{width:22px;height:22px;font-size:12px}
 .relief{margin-top:34px;padding:22px 20px;border-radius:16px;box-shadow:0 12px 30px rgba(14,148,134,.14)}
 .relief::before{left:31px;top:-26px;height:20px}
 .relief .ric{width:44px;height:44px;margin-bottom:10px}
 .relief .ric svg{width:44px;height:44px}
 .relief h3{font-size:24px}.relief p{font-size:16px;margin-top:8px}
 .steps{margin-top:22px}
 .steps h3{font-size:18px;margin-bottom:4px}
 .steps p{font-size:15px;line-height:1.45}
 .note{font-size:14px;padding:8px 10px;margin-top:8px}
 .steps li.us .note.t{font-size:16px;padding:12px 14px 12px 42px}
 details.calc{margin-top:20px}details.calc summary{padding:16px 18px}
 .calcbody{padding:0 18px 18px;font-size:15px}
 #gevolgen h2{font-size:25px}
 .gans{margin-top:14px}
 .gans .ack{font-size:15px}
 .gans .answer{margin-top:10px;font-size:23px;line-height:1.2;padding-left:14px;border-left-width:4px}
 .safe{margin-top:26px}
 .skey{padding:22px 20px;border-radius:20px}
 .skey .ic{width:34px;height:34px;border-radius:10px}
 .skey .ic svg{width:20px;height:20px}
 .skey h3{font-size:15px}.skey .big{font-size:25px;margin:4px 0 10px}
 .skey p:not(.big){font-size:16px}
 .sside{padding-top:6px}
 .sside .fact{padding:0 0 22px 30px;margin-bottom:0;position:relative}
 .sside .fact::before{content:"";position:absolute;left:0;top:3px;width:20px;height:20px;border-radius:50%;background:#E8EDF7 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230B1250' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 12.5 3 3 7-7'/%3E%3C/svg%3E") center/13px no-repeat}
 .sside .fact h3{font-size:17px;margin-bottom:6px}
 .sside .fact p{font-size:16px}
 .isle1 .why{margin-top:22px;padding:4px 0 4px 16px}
 .isle1 .why h3{font-size:16px}.isle1 .why p{font-size:16px}
 .trio{margin-top:30px}
 .card.id{padding:22px 20px}.card.id h3{font-size:19px}
 .kvk{margin-top:14px}.kvkrow span{font-size:14.5px}.kvkrow b{font-size:17px}
 /* Op 320px past "Ingeschreven bij de KvK  78229197" niet op één regel; dan
    zet de waarde zich onder het label in plaats van de kaart op te rekken. */
 .kvkrow{grid-template-columns:20px 1fr;row-gap:2px}
 .kvkrow b{grid-column:2;text-align:left}
 .trows{margin-top:28px}
 .bridge{margin-top:30px;padding:22px 20px}
 .bn{width:36px;height:36px;font-size:17px}
 .bstep h3{font-size:18px}.bstep p{font-size:15px}
 .micro-m{display:block;margin:0;padding:12px 18px;background:var(--tint);border-bottom:1px solid var(--line);font-size:14px;color:var(--body);text-align:left}
 .micro-m b{color:var(--navy)}
 .dropin{margin:0;border:0;padding:22px 18px 4px;border-radius:0;background:none!important}
 .drop>.dropin>svg{display:none}
 .drop h3{font-size:22px;margin-top:0}
 .drop .btn{font-size:16px;padding:16px 10px;white-space:nowrap;margin-top:16px}
 .drop .fmt{font-size:14px;margin-top:10px}
 .next{display:block}
 .drop .assure{margin:14px 18px 0;padding-top:14px;flex-direction:row;flex-wrap:wrap;justify-content:flex-start;gap:6px 14px;font-size:14px}
 .drop .assure svg{width:18px;height:18px}
 .drop .priv{margin:8px 18px 18px;font-size:13px}
 details.hint{margin-top:16px}details.hint summary{font-size:16px}
 .upgrid{row-gap:20px}
 .promise{font-size:17px;margin-top:14px}
 .svc-m{display:block;margin-top:16px;background:var(--tint);border-radius:14px;padding:14px 16px;font-size:16px;color:var(--body)}
 .svc-m b{color:var(--navy);display:block;margin-top:4px}
 .split{margin:16px 0 10px;font-size:15px}
 .opts{gap:0}
 .of{display:flex;align-items:center;gap:12px;margin:10px 0;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
 .of::before,.of::after{content:"";flex:1;height:1px;background:var(--line)}
 .opt{padding:20px}.opt .price{font-size:32px}.opt .price2{font-size:22px}
 .cost h3.big{font-size:23px}
 .q summary{font-size:17px;padding:18px 2px}
 .a{font-size:16px}
 #vragen .faq>h2{font-size:24px}
 .end h2{font-size:22px}.endic{width:48px;height:48px;margin-bottom:10px}
 .endin{padding:28px 18px}
 .sheet{padding:0 20px 22px}
 .fgrid>div{padding:14px 0}.fi{margin-bottom:10px}.fl li{margin-bottom:10px}
}
@media (max-width:374px){
 .hero .btn,.end .btn{font-size:16px;padding:15px 10px;gap:8px;white-space:nowrap}
 .hero .btn svg,.end .btn svg{width:18px;height:18px;flex:none}
 .drop .btn{font-size:15px;padding-left:6px;padding-right:6px}
 .opt .price2{font-size:20px}
 .kvklink{font-size:14px}
}
`;

/* De iconen. Eén keer beschreven, overal hergebruikt. */
const ico = {
  upload: (kleur = '#fff') => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4m0 0-4 4m4-4 4 4"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>`,
  vink: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0B1250" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#E8EDF7" stroke="none"/><path d="m7.5 12.5 3 3 6-6.5"/></svg>`,
  vinkTeal: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0E9486" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#E4F5F2" stroke="none"/><path d="m7.5 12.5 3 3 6-6.5"/></svg>`,
  vinkRand: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B1250" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.5 2.5 5-5.5"/></svg>`,
  schild: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B769F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/></svg>`,
  klok: (kleur, maat = 22) => `<svg width="${maat}" height="${maat}" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  chevron: `<span class="chev"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B1250" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>`,
  pijl: (kleur = '#0B1250', maat = 18) => `<svg width="${maat}" height="${maat}" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`,
  slot: (kleur) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  mail: (kleur) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6 8.5 7 8.5-7"/></svg>`,
  praat: (kleur) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.5-4.3A8.5 8.5 0 1 1 20.5 11.6z"/><path d="M9 8.5c.3 2.6 2.4 5 5.5 6l1.3-1.3-2-1-.9.8a5 5 0 0 1-2.3-2.3l.8-.9-1-2z"/></svg>`,
  pand: (kleur) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2m2 0h2M9 11h2m2 0h2M9 15h2m2 0h2M10 21v-3h4v3"/></svg>`,
  speld: (kleur) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`,
  extern: (kleur) => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6m0-6-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>`,
  brief: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B1250" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>`,
  grootvink: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#0E9486" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#fff" stroke="none"/><path d="m7 12.5 3.2 3.2 6.8-7"/></svg>`,
  hand: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0E9486" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11V5a1.5 1.5 0 0 1 3 0v5m0-1a1.5 1.5 0 0 1 3 0v1m0 0a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.7 14a1.5 1.5 0 0 1 2.4-1.8L9 15"/></svg>`,
  wolk: `<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#0E9486" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8"/><path d="M12 12v8m0-8-3 3m3-3 3 3"/></svg>`,
  pijlRechts: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0E9486" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>`,
};

/** Het woordmerk. Tekst, geen plaatje: dan kleurt het mee en laadt het niets. */
const MERK = '<span class="merk">NuBeslist<span class="merk__punt" aria-hidden="true"></span></span>';

/** Eén uitklapbare vraag. De samenvatting is één zin, ook op mobiel: hij gaat
 *  als FAQ-vraag mee naar zoekmachines, en twee varianten achter elkaar
 *  leveren daar een onleesbare vraag op. */
function vraag(v, antwoorden) {
  return `   <details class="q"><summary>${veilig(v)} ${ico.chevron}</summary><div class="a">
${antwoorden.map((r) => `    <p>${r}</p>`).join('\n')}
   </div></details>`;
}

/** '14' -> '2 weken'; een rest blijft gewoon dagen. */
function weken(dagen) {
  return dagen % 7 === 0 ? `${dagen / 7} weken` : `${dagen} dagen`;
}

/** De tabel met de wettelijke bedragen, uit dwangsom.js en niet uit deze tekst. */
function tranchetabel() {
  let vanaf = 1;
  const rijen = TARIEF.tranches.map((tranche) => {
    const tot = vanaf + tranche.dagen - 1;
    const regel = `<tr><td><span class="dt">Dag ${vanaf} tot en met ${tot}</span>`
      + `<span class="mb">Dag ${vanaf}–${tot}</span></td><td>€ ${tranche.perDag} per dag</td></tr>`;
    vanaf = tot + 1;
    return regel;
  });
  rijen.push(`<tr><td>Maximaal</td><td>€ ${duizend(TARIEF.maxBedrag)}</td></tr>`);
  return rijen.join('');
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
  const hersteltermijn = weken(HERSTELTERMIJN_DAGEN);
  const maxDuur = weken(TARIEF.maxDagen);
  const jaar = new Date().getFullYear();

  const titel = 'Wacht je al lang op een beslissing van UWV? Laat het niet bij wachten';
  const omschrijving = 'Upload je UWV-brief. Wij zoeken gratis uit of UWV al had moeten beslissen '
    + `en wat je nu kunt doen. Blijft een beslissing uit, dan kan je vergoeding oplopen tot € ${maximum}.`;

  // Contact. Wat niet is ingevuld, wordt niet getoond: liever geen knop dan
  // een knop die nergens heen gaat of naar een nummer dat geen WhatsApp heeft.
  const whatsapp = String(env.WHATSAPP_NUMMER || '').replace(/[^0-9]/g, '');
  const waLink = whatsapp ? `https://wa.me/${whatsapp}` : '';
  const email = bedrijf.email;
  const kvkLink = bedrijf.kvk
    ? `https://www.kvk.nl/zoeken/?source=all&amp;q=${encodeURIComponent(bedrijf.kvk)}`
    : '';

  const waKnop = waLink
    ? `<a class="clink" href="${waLink}" target="_blank" rel="noopener">${ico.praat('#0E9486')} Stel je vraag via WhatsApp</a>`
    : '';
  const mailKnop = email
    ? `<a class="clink" href="mailto:${veilig(email)}">${ico.mail('#0B1250')} ${veilig(email)}</a>`
    : '';
  const contactRegel = waLink
    ? `<a href="${waLink}" target="_blank" rel="noopener">Stel je vraag via WhatsApp</a>${email ? ` of mail naar <a href="mailto:${veilig(email)}">${veilig(email)}</a>` : ''}`
    : (email ? `Mail naar <a href="mailto:${veilig(email)}">${veilig(email)}</a>` : '');

  const pagina = `<!doctype html>
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
${lettertype()}
${CSS}</style>
</head>
<body>

<header id="hdr"><div class="hin">
 <a href="#top" aria-label="NuBeslist, naar boven">${MERK}</a>
 <nav aria-label="Op deze pagina"><a href="#hoe" data-t="hoe">Hoe het werkt</a><a href="#kosten" data-t="vragen">Wat kost het?</a><a href="#over" data-t="over">Over NuBeslist</a><a href="#vragen" data-t="vragen">Vragen</a><a href="#contact" data-t="over">Contact</a></nav>
 <div class="slot"><a class="btn hbtn" href="#upload">${ico.upload()} Controleer mijn UWV-brief</a></div>
 <div class="mob"><a class="btn hbtn" href="#upload">Brief controleren</a><button class="mbtn" id="openm" aria-label="Menu openen" aria-expanded="false"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0B1250" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>Menu</span></button></div>
</div></header>
<div class="ov" id="ov"></div>
<div class="sheet" role="dialog" aria-label="Menu"><div class="top">${MERK}<button class="mbtn" id="closem" aria-label="Menu sluiten"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0B1250" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg><span>Sluit</span></button></div>
<ul><li><a href="#hoe">Hoe het werkt ${ico.pijl()}</a></li><li><a href="#kosten">Wat kost het? ${ico.pijl()}</a></li><li><a href="#over">Over NuBeslist ${ico.pijl()}</a></li><li><a href="#vragen">Vragen ${ico.pijl()}</a></li><li><a href="#contact">Contact ${ico.pijl()}</a></li></ul>
<a class="btn" href="#upload">${ico.upload()} Controleer mijn UWV-brief</a><div class="indep">${ico.schild} NuBeslist is onafhankelijk van UWV</div></div>

<main>
<!-- 1 HERO -->
<section class="hero" id="top"><div class="wrap hgrid">
 <div class="htext">
  <h1>Wacht je al lang op een beslissing van UWV?</h1>
  <p class="sub">Laat het niet bij wachten.</p>
  <p class="lead">Upload je UWV-brief. Wij zoeken gratis uit of UWV inmiddels had moeten beslissen en wat je nu kunt doen.</p>
  <a class="btn" id="herobtn" href="#upload">${ico.upload()} Controleer mijn UWV-brief</a>
  <ul class="checks"><li>${ico.vink} <span class="dt">Gratis controle</span><span class="mb">Gratis</span></li><li>${ico.vink} <span class="dt">Binnen een minuut duidelijkheid</span><span class="mb">Binnen een minuut</span></li><li>${ico.vink} <span class="dt">Je zit nergens aan vast</span><span class="mb">Nergens aan vast</span></li></ul>
 </div>
 <div class="hind"><div class="indep">${ico.schild} NuBeslist is onafhankelijk van UWV</div></div>
 <div class="result" aria-label="Voorbeeld van je uitslag">
  <div class="rtop"><span class="tag">Voorbeeld van je uitslag</span><span class="rsub">Dit zie je binnen een minuut na je gratis controle</span></div>
  <ol class="flow">
   <li class="c"><span>Je aanvraag bij UWV</span><b>WIA-uitkering</b></li>
   <li class="d"><span>Datum in je brief</span><b>14 september</b></li>
   <li class="w"><span>Je wacht inmiddels</span><b>10 dagen langer</b><em>dan in je brief staat</em></li>
  </ol>
  <div class="status">${ico.klok('#B86A00')} UWV lijkt te laat</div>
  <p class="foot">Dit is een voorbeeld. Daarna zie je ook wat je nu kunt doen.</p>
 </div>
</div></section>

<!-- 2 HERKENNING -->
<section class="band tint tight-b" id="herken"><div class="wrap two">
 <div>
  <div class="eyebrow">Herken je dit?</div>
  <h2>Weet je niet waar je aan toe bent?</h2>
  <p class="lead">Misschien zegt UWV dat het druk is. Of de datum in je brief is al voorbij. Dan wil je vooral weten:</p>
 </div>
 <div>
  <ul class="qs"><li><span class="n">?</span>Had UWV inmiddels moeten beslissen?</li><li><span class="n">?</span>Kan ik daar iets tegen doen?</li><li><span class="n">?</span>Heeft dat gevolgen voor mijn aanvraag of bezwaar?</li></ul>
  <div class="relief"><span class="ric">${ico.grootvink}</span><div><h3>Dat hoef je niet zelf uit te zoeken.</h3><p>Meerdere brieven gekregen of heeft UWV de datum veranderd? Wij zoeken uit wanneer UWV uiterlijk had moeten beslissen.</p></div></div>
 </div>
</div></section>

<!-- 3 HOE HET WERKT -->
<section class="band tight-t" id="hoe"><div class="wrap">
 <div class="eyebrow">Als UWV te laat is</div>
 <h2>Wat kun je doen als UWV te laat is?</h2>
 <p class="lead">Als UWV inmiddels had moeten beslissen, kun je daar iets tegen doen. Zo werkt dat:</p>
 <ol class="steps">
  <li class="start"><div class="dot">${ico.brief}</div><h3>UWV had al moeten beslissen</h3><p>De datum in je brief is voorbij.</p></li>
  <li class="us"><div class="dot">1</div><h3><span class="dt">UWV officieel laten weten dat je wacht</span><span class="mb">UWV laten weten dat je wacht</span></h3><div class="note t">Wij regelen de melding voor je.</div></li>
  <li class="wait"><div class="dot">2</div><h3>UWV krijgt nog ${hersteltermijn}</h3><p>Om alsnog een beslissing te nemen.</p><div class="note b">Beslist UWV? Dan heb je eindelijk duidelijkheid.</div></li>
  <li class="money"><div class="dot">3</div><h3>Nog steeds geen beslissing?</h3><p>Dan kun je recht krijgen op een vergoeding.</p><div class="note t"><span class="dt">Wij houden voor je bij wanneer je vergoeding begint en hoeveel die oploopt.</span><span class="mb">Wij houden bij wanneer je vergoeding begint en hoeveel die oploopt.</span></div></li>
 </ol>
 <details class="calc"><summary>Bekijk hoe de vergoeding wordt berekend ${ico.chevron}</summary>
  <div class="calcbody"><p>Beslist UWV niet binnen ${hersteltermijn} na de melding? Dan loopt de wettelijke vergoeding per dag op, maximaal ${maxDuur} lang:</p>
  <table>${tranchetabel()}</table>
  <p>Na de controle rekenen we uit wat dit voor jouw situatie betekent.</p></div></details>
</div></section>

<!-- 4 GEVOLGEN -->
<section class="band tint loose-b" id="gevolgen"><div class="wrap">
 <h2>Heeft dit gevolgen voor je aanvraag of bezwaar?</h2>
 <p class="lead gans"><span class="ack">Een begrijpelijke vraag.</span> <span class="answer">Je aanvraag of bezwaar blijft gewoon hetzelfde.</span></p>
 <div class="safe">
  <div class="skey"><div class="skh"><div class="ic">${ico.hand}</div><h3>Jij houdt zelf de controle.</h3></div><p class="big">We sturen nog niets <span class="nw">naar UWV.</span></p><p>Eerst controleren we alleen je brief. Pas als jij kiest om verder te gaan, regelen wij de melding voor je.</p></div>
  <div class="sside">
   <div class="fact"><h3>Je aanvraag of bezwaar verandert hierdoor niet.</h3><p>De melding gaat alleen over het feit dat je nog op een beslissing wacht. Je verandert hiermee niet wat je hebt aangevraagd of waar je bezwaar over gaat.</p></div>
   <div class="fact"><h3>Het is je goed recht.</h3><p>Als UWV te laat is, mag je officieel laten weten dat je nog wacht. Daarmee vraag je UWV alleen om alsnog een beslissing te nemen. Je hoeft hiervoor niet naar de rechter.</p></div>
  </div>
 </div>
</div></section>

<!-- 5 OVER -->
<section class="band loose-t tight-b" id="over"><div class="wrap">
 <div class="eyebrow">Over NuBeslist</div>
 <h2>Je geeft ons niet zomaar een <span class="nw">UWV-brief</span></h2>
 <p class="lead">Op je brief staan persoonlijke gegevens, en het gaat om iets wat belangrijk voor je is. Dan wil je weten met wie je te maken hebt.</p>
 <div class="isle1">
  <div class="why"><h3>Waarom NuBeslist er is</h3><p><span class="dt">Wachten op een beslissing is al vervelend genoeg. Dan zou je niet ook nog zelf hoeven uitzoeken welke brief belangrijk is, welke datum geldt en wat je vervolgens kunt doen.</span><span class="mb">Wachten is al vervelend genoeg. Daarom zoeken wij uit welke datum geldt en wat je kunt doen.</span></p><p class="strong"><span class="dt">Daarom is NuBeslist er: om dat voor je uit te zoeken en, als jij dat wilt, het vervolg te regelen.</span><span class="mb">Wil je verder? Dan kunnen wij het vervolg voor je regelen.</span></p></div>
 </div>
 <div class="trio">
  <div class="card id"><h3>Wie is NuBeslist?</h3><p>NuBeslist is een onafhankelijk Nederlands bedrijf. We zijn geen onderdeel van UWV of de overheid.</p>
   ${bedrijf.kvk || bedrijf.postcodePlaats ? `<div class="kvk">${bedrijf.kvk ? `<div class="kvkrow">${ico.pand('#6B769F')} <span>Ingeschreven bij de KvK</span><b>${veilig(bedrijf.kvk)}</b></div>` : ''}${bedrijf.postcodePlaats ? `<div class="kvkrow">${ico.speld('#6B769F')} <span>Vestiging</span><b>${veilig(bedrijf.postcodePlaats)}</b></div>` : ''}${kvkLink ? `
   <a class="kvklink" href="${kvkLink}" target="_blank" rel="noopener">Controleer onze inschrijving zelf ${ico.extern('#0B1250')}</a>` : ''}</div>` : ''}</div>
  <div class="card soft dtb"><h3>Waarvoor gebruiken we je brief?</h3><p>We gebruiken je brief om je situatie te controleren: wanneer UWV uiterlijk had moeten beslissen en wat dat voor jouw situatie betekent.</p>
   <p style="margin-top:14px"><a href="/privacy" target="_blank" rel="noopener">Bekijk hoe we met je gegevens omgaan</a></p></div>
  <div class="card soft dtb" id="contact"><h3>Je kunt ons bereiken</h3><p>Heb je een vraag of wil je ergens over overleggen? Neem gerust contact met ons op.</p>
   ${waKnop}${mailKnop}<p class="small">We reageren op werkdagen binnen 1 werkdag.</p></div>
 </div>
 <div class="trows mbb">
  <a class="trow" href="/privacy" target="_blank" rel="noopener">${ico.slot('#0B1250')}<span><b>Wat gebeurt er met mijn brief?</b>We gebruiken hem alleen voor je controle.</span>${ico.pijl()}</a>
  ${waLink ? `<a class="trow" href="${waLink}" target="_blank" rel="noopener">${ico.praat('#0E9486')}<span><b>Heb je een vraag?</b>Stel hem via WhatsApp. We reageren binnen 1 werkdag.</span>${ico.pijl()}</a>` : (email ? `<a class="trow" href="mailto:${veilig(email)}">${ico.mail('#0B1250')}<span><b>Heb je een vraag?</b>Mail ons. We reageren binnen 1 werkdag.</span>${ico.pijl()}</a>` : '')}
 </div>
 <div class="bridge">
  <div class="bstep"><span class="bn">1</span><div><h3>Eerst controleren</h3><p>Je uploadt je brief voor een gratis controle en ziet je persoonlijke uitslag.</p></div></div>
  <div class="barrow">${ico.pijlRechts}</div>
  <div class="bstep"><span class="bn">2</span><div><h3>Daarna beslis jij</h3><p>Blijkt dat je in actie kunt komen? Dan zie je wat wij voor je kunnen regelen en wat dat kost. Pas dan kies je of je verdergaat.</p></div></div>
 </div>
</div></section>

<!-- 6 UPLOAD -->
<section class="band tint tight-t" id="upload"><div class="wrap upgrid">
 <div class="uptop">
  <h2>Laat ons je <span class="nw">UWV-brief</span> controleren</h2>
  <p class="lead">Upload je brief. Wij kijken wanneer UWV uiterlijk had moeten beslissen en of die datum al voorbij is.</p>
  <p class="promise">${ico.klok('#0E9486')} <span>Binnen een minuut weet je waar je staat.</span></p>
 </div>
 <div class="upbot">
  <details class="hint" id="hint"><summary>Weet je niet welke brief je nodig hebt? ${ico.chevron}</summary><p>Upload de brief die je hebt, bijvoorbeeld de ontvangstbevestiging of de brief waarin UWV meer tijd vraagt. Heb je meerdere brieven over dezelfde aanvraag of hetzelfde bezwaar? Dan kun je ze ook samen uploaden.</p></details>
 </div>
 <div class="drop" id="drop">
  <p class="micro-m mb">Stap 1 van 3 · <b>Upload je brief</b></p>
  <ol class="micro dtb"><li class="on"><span>1</span>Upload je brief</li><li><span>2</span>Wij lezen de datum</li><li><span>3</span>Jij ziet waar je staat</li></ol>
  <div class="dropin">
   ${ico.wolk}
   <h3 id="droph">Upload je <span class="nw">UWV-brief</span></h3>
   <p class="or desk">Sleep je brief hierheen of</p>
   <label class="btn pick" for="file"><span class="n0"><span class="desk">${ico.upload()} Kies een bestand</span><span class="mobo">Maak een foto of kies een bestand</span></span><span class="n1">+ Nog een brief toevoegen</span></label>
   <input id="file" type="file" accept="image/*,.pdf,application/pdf,.txt,text/plain" multiple hidden>
   <p class="fmt">Een foto of pdf is genoeg · meerdere brieven mogen</p>
   <ul class="files" id="files"></ul>
   <button class="btn go" type="button" id="go">Controleer mijn brief</button>
   <p class="next mb">Daarna lezen wij de datum en zie jij waar je staat.</p>
   <p class="melding" id="melding" hidden></p>
  </div>
  <ul class="assure"><li>${ico.vink} <span class="dt">Gratis controle</span><span class="mb">Gratis</span></li><li>${ico.vink} <span class="dt">Je zit nergens aan vast</span><span class="mb">Nergens aan vast</span></li><li>${ico.vink} <span class="dt">Niets naar UWV zonder jouw toestemming</span><span class="mb">Niets naar UWV zonder toestemming</span></li></ul>
  <p class="priv">${ico.slot('#0E9486')} <span class="dt">We gebruiken je brief alleen om je situatie te controleren.</span><span class="mb">We gebruiken je brief alleen voor de controle.</span></p>
 </div>
</div></section>

<!-- 7 VRAGEN -->
<section class="band" id="vragen"><div class="wrap">
 <div class="faq">
 <div class="eyebrow">Veelgestelde vragen</div>
 <h2>Nog iets wat je wilt weten?</h2>
 <p class="lead" style="margin-bottom:36px">Heb je nog een vraag voordat je je brief laat controleren? Misschien staat je antwoord hieronder.</p>

 <details class="q" id="kosten" open><summary>Wat kost het? ${ico.chevron}</summary><div class="a cost">
  <h3 class="big">${veilig(prijs.kop)}</h3>
  <p class="intro">${prijs.intro}</p>
  <p class="svc-m mb">Wij regelen de melding en houden het vervolg voor je bij. <b>Jij hoeft hier niet zelf achteraan.</b></p>
  <div class="svc dtb"><h4>Dit regelen wij voor je</h4><ul>
   <li>${ico.vinkTeal} <span>We <b>stellen de melding</b> op.</span></li>
   <li>${ico.vinkTeal} <span>We zorgen dat deze <b>bij UWV</b> terechtkomt.</span></li>
   <li>${ico.vinkTeal} <span>We <b>houden de termijn bij</b> en kijken wat er gebeurt.</span></li></ul>
   <span class="pill">Jij hoeft hier niet zelf achteraan.</span></div>
  <p class="split">Na onze melding heeft UWV nog <b>${hersteltermijn}</b> om te beslissen.</p>
  <div class="opts">
   <div class="opt g"><h4>UWV beslist binnen ${hersteltermijn}</h4><p class="d">Je hebt eindelijk je beslissing.</p><div class="price">Je betaalt € 0</div><p class="d" style="margin-top:6px">Ook al hebben wij het vervolg voor je geregeld.</p></div>
   <div class="of" aria-hidden="true"><span>of</span></div>
   <div class="opt o"><h4>UWV beslist niet binnen ${hersteltermijn}</h4><p class="d">Dan kan UWV je een wettelijke vergoeding moeten betalen, voor iedere extra dag dat je wacht.</p>${prijs.label ? `<div class="lbl">${veilig(prijs.label)}</div>` : ''}<div class="price2">${veilig(prijs.prijs)}</div>
    <ul>${prijs.punten.map((p) => `<li>${ico.vinkRand} <span>${p}</span></li>`).join('')}</ul></div>
  </div></div></details>

${vraag('Wat regelen jullie dan voor mij?', [
    'Blijkt dat UWV te laat is? Dan kunnen wij het vervolg voor je overnemen.',
    'We stellen de melding voor je op en zorgen dat die bij UWV terechtkomt. Daarna houden we bij wanneer UWV moet reageren en wat er vervolgens gebeurt.',
    'Krijg je nieuwe post van UWV over deze zaak? Dan kijken we wat die voor jouw situatie betekent. Blijft een beslissing uit, dan houden we ook bij of er een vergoeding ontstaat en hoeveel.',
    'Zo hoef jij dit niet zelf uit te zoeken of bij te houden.',
  ])}
${vraag('Kan ik dit ook zelf regelen?', [
    'Ja. Je bent niet verplicht om NuBeslist in te schakelen. Als UWV te laat is, kun je UWV ook zelf schriftelijk laten weten dat je nog op een beslissing wacht.',
    'Wil je dat liever aan ons overlaten? Dan regelen wij het vervolg voor je en houden we bij wat er daarna gebeurt.',
  ])}
${vraag('Hoeveel tijd heeft UWV na de melding?', [
    `Nadat UWV de melding heeft ontvangen, krijgt UWV nog ${hersteltermijn} om te beslissen.`,
    `Is er daarna nog geen beslissing? Dan begint de wettelijke vergoeding te lopen. De vergoeding loopt per dag op, maximaal ${maxDuur} lang.`,
    'Of UWV daardoor ook echt sneller beslist, kunnen wij niet garanderen. Wel dat de termijn gaat lopen en dat wij bijhouden wat er gebeurt.',
    'Wij houden die termijnen voor je bij.',
  ])}
${vraag('Ik heb UWV zelf al laten weten dat ik wacht. Wat nu?', [
    'Stuur die brief of e-mail dan ook mee. Wat je al aan UWV hebt gestuurd, kan belangrijk zijn voor wat er nu moet gebeuren.',
    'Wij kijken eerst wat dit voor jouw situatie betekent en of er nog iets nodig is.',
  ])}
${vraag('De datum in mijn brief is nog niet voorbij. Kan ik mijn brief toch laten controleren?', [
    'Ja. Upload je brief gerust. Wij kijken welke datum voor jouw situatie geldt en of UWV al had moeten beslissen.',
    'Is UWV nog niet te laat? Dan zie je vanaf welke datum dat wel zo is. Dat baseren we op de brief of brieven die je ons stuurt.',
  ])}
${vraag('Zit ik ergens aan vast als ik mijn brief upload?', [
    'Nee. Met het uploaden van je brief laat je ons eerst alleen je situatie controleren. We sturen dan nog niets naar UWV.',
    'Blijkt dat je iets kunt doen? Dan leggen we eerst uit wat er voor jouw situatie geldt, wat wij voor je kunnen regelen en wat dat kost. Pas daarna kies je of je verder wilt.',
  ])}
${vraag('Wat gebeurt er met mijn brief nadat ik hem upload?', [
    'We gebruiken je brief om je situatie te controleren en je persoonlijke uitslag te maken.',
    'In onze privacyverklaring lees je welke gegevens we verwerken, waarom we dat doen, hoe lang we ze bewaren en welke rechten je hebt.',
    '<a href="/privacy" target="_blank" rel="noopener">Bekijk hoe we met je gegevens omgaan →</a>',
  ])}
 </div>

 <div class="end">
  <div class="endin">
  <span class="endic">${ico.upload('#0E9486')}</span>
  <h2>Klaar om te weten waar je staat?</h2>
  <p>Laat je UWV-brief gratis controleren. Je zit nergens aan vast.</p>
  <a class="btn" href="#upload">${ico.upload()} Controleer mijn UWV-brief</a>
  ${contactRegel ? `<p class="alt">Nog een vraag? ${contactRegel}</p>` : ''}
  </div>
 </div>
</div></section>
</main>

<footer><div class="fin"><div class="fgrid">
 <div class="brand">${MERK}<p>NuBeslist is een onafhankelijk Nederlands bedrijf. We zijn geen onderdeel van UWV of de overheid.</p></div>
 <div class="c-bedrijf"><h4>Bedrijfsgegevens</h4>${bedrijf.kvk ? `<div class="fi">${ico.pand('#C9D3F2')} KvK ${veilig(bedrijf.kvk)}</div>` : ''}${bedrijf.postcodePlaats ? `<div class="fi">${ico.speld('#C9D3F2')} ${veilig(bedrijf.postcodePlaats)}</div>` : ''}${kvkLink ? `<a class="flink" href="${kvkLink}" target="_blank" rel="noopener">Bekijk onze KvK-inschrijving ${ico.extern('#9CC4FF')}</a>` : ''}</div>
 <div class="c-contact"><h4>Contact</h4>${waLink ? `<a class="fi" href="${waLink}" target="_blank" rel="noopener">${ico.praat('#C9D3F2')} Stel je vraag via WhatsApp</a>` : ''}${email ? `<a class="fi" href="mailto:${veilig(email)}">${ico.mail('#C9D3F2')} ${veilig(email)}</a>` : ''}<div class="fi" style="color:#AEB7DE">We reageren op werkdagen binnen 1 werkdag.</div></div>
 <div class="c-info"><h4>Informatie</h4><ul class="fl"><li><a href="/privacy" target="_blank" rel="noopener">Privacyverklaring</a></li><li><a href="/voorwaarden" target="_blank" rel="noopener">Algemene voorwaarden</a></li></ul></div>
</div><div class="fbar"><div>© ${jaar} NuBeslist</div></div></div></footer>

<a id="verder" href="${BESTEMMING}" hidden aria-hidden="true" tabindex="-1">Verder</a>

<script type="module" src="/assets/meting.js"></script>
<script src="/assets/campagne.js" defer></script>

</body>
</html>
`;

  const url = `${SITE}${CAMPAGNE_PAD}`;
  return metSchema(pagina, [
    organisatieSchema(bedrijf),
    siteSchema(),
    // De vragen op deze pagina staan zichtbaar op het scherm, dus mogen ze
    // ook als FAQPage mee. Ze worden uit de pagina zelf gelezen.
    faqSchema(pagina, url),
    kruimelSchema([
      { naam: 'nubeslist.nl', pad: '/' },
      { naam: 'UWV te laat', pad: CAMPAGNE_PAD },
    ]),
    dienstSchema({
      url,
      naam: 'Dwangsom bij een te late beslissing van UWV',
      omschrijving,
      instantie: 'UWV',
    }),
  ]);
}

/** Het bestand dat scripts/maak-paginas.mjs schrijft. */
export function campagnepaginas(env = process.env) {
  return [{ bestand: `${CAMPAGNE_PAD.slice(1)}.html`, html: campagneHtml(env) }];
}
