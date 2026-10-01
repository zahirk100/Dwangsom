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
 * Hetzelfde geldt voor de bedragen per dag, het maximum en de hersteltermijn:
 * die staan in `dwangsom.js`, niet in deze tekst - en ook niet in de
 * tekeningen, die de getallen daarom binnenkrijgen in plaats van ze te
 * bevatten.
 *
 * De volgorde van de pagina volgt de vragen die iemand stelt:
 *   herkenning -> wat kan ik doen -> raakt dit mijn zaak -> met wie heb ik te
 *   maken -> upload -> wat kost het -> vragen.
 *
 * Het uploadvak hier is echt. De brieven worden op deze pagina gelezen (zie
 * `assets/campagne.js`), en naar de funnel reist alleen de uitkomst.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tarief } from '../public/shared/tarief.js';
import { TARIEF, HERSTELTERMIJN_DAGEN } from '../public/shared/dwangsom.js';
import { organisatiegegevens } from './organisatie.js';
import { MERKNAAM } from './merk.js';
import {
  HERKENNING, MELDING, UITKOMST_BESLISSING, UITKOMST_VERGOEDING, GERUSTSTELLING,
  BRIEFMERK, UPLOADBEELD, GRATIS, VRAGEN, kalender, prijsring,
} from './campagnebeeld.js';
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
 * Het prijsblok in woorden en in de ring.
 *
 * Staat er geen tarief in de omgeving, dan noemt deze pagina géén getal - ook
 * niet in de tekening. Een verzonnen percentage op de pagina waar iemand
 * besluit door te gaan is erger dan geen percentage; dat is dezelfde afspraak
 * als in de funnel.
 *
 * `ring` is wat er in de cirkel komt te staan en `deel` hoeveel van de cirkel
 * gevuld wordt. Bij een vast bedrag is er geen deel van een geheel, dus blijft
 * de ring leeg en staat het bedrag erin.
 */
function prijsblok(t) {
  if (!t.bekend) {
    return {
      kop: 'Je hoort vooraf wat het kost',
      intro: 'Laat je ons het vervolg met UWV regelen? Dan hoor je eerst precies wat dat kost. '
        + 'Je gaat nooit ergens aan vast zonder dat je het bedrag kent.',
      ring: '',
      deel: 0,
      onder: 'Je hoort vooraf wat onze vergoeding is.',
      betaling: 'Je hoort het bedrag voordat je iets tekent.',
    };
  }
  const vast = t.soort === 'vast';
  return {
    kop: 'Je betaalt alleen als UWV jou betaalt voor het wachten',
    intro: 'Wij regelen de melding en volgen het vervolg. Je betaalt niets vooraf. '
      + 'We verdienen alleen als jij door de verdere vertraging een vergoeding krijgt.',
    ring: vast ? `€ ${duizend(t.bedrag)}` : `${t.percentage}%`,
    deel: vast ? 0 : t.percentage,
    onder: vast ? 'per toegekende zaak' : 'van je ontvangen vergoeding',
    betaling: 'Eerst betaalt UWV de vergoeding rechtstreeks aan jou. Pas daarna betaal je ons.',
  };
}

/**
 * De vormgeving. Eén blok, in de pagina zelf.
 *
 * De volgorde is: kleuren en basis, dan de balk, dan de secties van boven
 * naar beneden, dan de breekpunten, en helemaal onderaan het blok dat de
 * illustraties en de kleurvlakken erin zet. Dat laatste blok komt bewust ná
 * de breekpunten van het eerste: het overschrijft ze, in plaats van ertegenin
 * te werken. De pagina wordt op vier breedtes bekeken (320, 390, 834 en 1280).
 */
const CSS = `
:root{--navy:#0B1250;--body:#46527D;--muted:#59658B;--line:#DCE5F2;--tint:#F3F7FD;--tint2:#EAF1FC;--teal:#087F72;--tealh:#06685E;--tealbg:#E4F5F2;--amber:#8B530A;--amberbg:#FFF4E3}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:92px}
body{margin:0;background:#fff;color:var(--navy);font:18px/1.6 Figtree,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4,p{margin:0}h1,h2,h3,h4{line-height:1.16;letter-spacing:-.02em}
h1{font-size:clamp(36px,4.1vw,54px);font-weight:800}h2{font-size:clamp(30px,3.2vw,40px);font-weight:800}h3{font-size:22px;font-weight:700;line-height:1.3}h4{font-size:18px}
a{color:var(--navy);text-underline-offset:4px;text-decoration-color:#8994B4}a:hover{text-decoration-color:currentColor}
button,input{font:inherit}button,a,summary{-webkit-tap-highlight-color:transparent}button{cursor:pointer}svg{flex:none;vertical-align:middle}
[hidden]{display:none!important}img{max-width:100%}.nw{white-space:nowrap}.mb,.mobo,.mob,.lbl-s{display:none}.dt,.desk{display:inline}
a:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid #1D75BE;outline-offset:4px}main:focus,section:focus,[tabindex="-1"]:focus{outline:none}
.wrap{max-width:1120px;padding:0 24px;margin:auto}.band{padding:88px 0}.tint{background:var(--tint)}
.eyebrow{font-size:14px;line-height:1.4;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--teal);margin-bottom:14px}
.lead{font-size:20px;color:var(--body);margin-top:18px;max-width:640px}.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:56px;padding:16px 24px;border:0;border-radius:12px;background:var(--teal);color:#fff;text-decoration:none;font-weight:700;font-size:18px;line-height:1.4;transition:background .15s}
.btn:hover{background:var(--tealh)}.skip-link{position:fixed;z-index:100;top:8px;left:12px;transform:translateY(-180%);padding:12px 18px;background:#fff;font-weight:700;border:2px solid var(--navy);border-radius:8px}.skip-link:focus{transform:none}
/* Eén vaste navigatie, met compacte bediening voordat labels klem komen. */
header{position:sticky;top:0;z-index:50;background:#fff;box-shadow:0 1px 0 var(--line)}header.scrolled{box-shadow:0 1px 0 var(--line),0 6px 18px #0B12500B}
.hin{max-width:1240px;margin:auto;height:76px;padding:0 24px;display:grid;grid-template-columns:145px minmax(0,1fr) 256px;gap:16px;align-items:center}.logo{display:block;height:28px;width:auto}
nav{display:flex;justify-content:center;gap:22px;font-size:15px;font-weight:600}nav a{position:relative;white-space:nowrap;text-decoration:none;padding:12px 0}nav a.active::after{content:"";position:absolute;left:0;right:0;bottom:5px;height:2px;background:var(--teal)}nav a:hover{color:var(--teal)}
.slot{display:flex;justify-content:flex-end}.hbtn{font-size:14px;border-radius:30px;min-height:44px;padding:11px 15px;white-space:nowrap;visibility:hidden;opacity:0}header.cta .hbtn{visibility:visible;opacity:1}.mbtn{display:flex;flex-direction:column;justify-content:center;align-items:center;gap:1px;width:48px;height:48px;border:0;background:none;color:var(--navy);font-size:11px;font-weight:700;line-height:1.1}
body.dialog-open{overflow:hidden}dialog::backdrop{background:#0B125066;backdrop-filter:blur(2px)}dialog{color:var(--navy);font:inherit}
.sheet{position:fixed;inset:0 0 auto;margin:0 auto;max-width:640px;width:100%;max-height:calc(100dvh - 12px);overflow:auto;border:0;border-radius:0 0 22px 22px;padding:0 20px 22px;background:#fff}.sheet:not([open]){display:none}.sheet .top{height:68px;display:flex;justify-content:space-between;align-items:center}.sheet ul{list-style:none;margin:0 0 20px;padding:0}.sheet li a{display:flex;align-items:center;justify-content:space-between;min-height:54px;padding:13px 4px;border-bottom:1px solid var(--line);font-size:17px;font-weight:600;text-decoration:none}.sheet .btn{width:100%;font-size:17px}.indep{display:flex;align-items:flex-start;gap:8px;font-size:14px;line-height:1.5;color:var(--muted)}.indep svg{margin-top:2px}.sheet .indep{justify-content:center;margin-top:16px}
/* De hero: één brief, met direct daaronder de interpretatie. */
.hero{padding:64px 0 70px;background:linear-gradient(180deg,#F3F7FD,#fff)}.hgrid{display:grid;grid-template-columns:1.12fr .88fr;grid-template-areas:"text example" "reassurance example" "route route";column-gap:64px;row-gap:0;align-items:center}.htext{grid-area:text}.hero .sub{font-size:27px;font-weight:700;line-height:1.3;margin-top:16px}.hero .lead{margin-top:18px}.hero .btn{margin-top:26px}.checks{list-style:none;display:flex;flex-wrap:wrap;gap:7px 20px;margin:16px 0 0;padding:0;font-size:15px;color:var(--body)}.checks li{display:flex;gap:6px;align-items:center}.checks svg{width:17px;height:17px}.hind{grid-area:reassurance;margin-top:14px}.hero-route{grid-area:route;font-size:15px;margin-top:28px}.hero-route a{display:inline-block;max-width:680px;padding:5px 0}
.result{grid-area:example;min-width:0;padding:0;background:none;border:0;box-shadow:none;align-self:center}.rtop{margin-bottom:14px}.tag{font-size:13px;font-weight:700;letter-spacing:.065em;text-transform:uppercase;color:var(--muted)}
.letter-example{position:relative;background:#fff;border:1px solid #D5DFEC;border-radius:3px 3px 0 0;padding:28px 26px 30px;box-shadow:0 9px 22px #0B125009}.letter-example::after{content:"";position:absolute;left:7px;right:7px;bottom:-5px;height:4px;background:#fff;border:1px solid #D5DFEC;border-top:0;z-index:0}.letter-label{display:flex;flex-wrap:wrap;justify-content:space-between;gap:5px 14px;font-size:13px;color:var(--muted);padding-bottom:16px;border-bottom:1px solid var(--line)}.letter-label strong{font-weight:600;color:var(--navy)}.letter-example blockquote{margin:22px 0 0;font-size:22px;line-height:1.55;font-weight:600}.letter-example mark{color:var(--navy);background:#FBE3B9;white-space:nowrap;padding:1px 3px;box-decoration-break:clone}
.example-reading{padding:25px 18px 16px;margin-left:16px;border-left:2px solid #D1DCEC}.example-reading span{display:block;font-size:13px;color:var(--muted);line-height:1.4}.example-reading strong{display:block;font-size:18px;line-height:1.4;margin-top:4px}.status{display:flex;align-items:center;gap:10px;padding:14px 18px;background:var(--amberbg);border:1px solid #EBD4B2;border-radius:10px;color:var(--amber);font-size:21px;font-weight:800;line-height:1.3}
/* Herkenning is een rustige vraaggroep met één duidelijk antwoord. */
.two{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:start}.qs{list-style:none;margin:0;padding:0}.qs li{display:flex;align-items:flex-start;gap:12px;padding:14px 0;border-top:1px solid var(--line);font-size:18px;line-height:1.45;color:var(--body)}.qs li:last-child{border-bottom:1px solid var(--line)}.qs .n{flex:none;display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#E7EDF7;color:var(--muted);font-size:13px;font-weight:700}
.relief{display:flex;align-items:flex-start;gap:12px;padding:24px;margin-top:24px;background:var(--tealbg);border-radius:14px}.ric{flex:none;display:flex;padding-top:3px}.ric svg{width:25px;height:25px}.relief h3{font-size:25px;font-weight:800}.relief p{font-size:17px;margin-top:10px;color:var(--body)}
/* Tijdlijn en vertakking: de twee uitkomsten zijn alternatieven. */
.process-context{max-width:760px;color:var(--body);margin-top:18px}.process-main{list-style:none;margin:38px 0 0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:50px;position:relative}.process-main li{position:relative;min-width:0;padding:24px 26px;border-radius:14px;background:var(--tint)}.process-main li:first-child{border-left:3px solid #67B7AC;background:#F0F8F6}.process-main li:first-child::after{content:"→";position:absolute;right:-36px;top:50%;transform:translateY(-50%);font-size:26px;color:var(--muted)}.actor{display:block;font-size:14px;font-weight:600;color:#156E62;margin-bottom:12px;line-height:1.45}.actor.uwv{color:var(--body)}.process-main p{font-size:17px;color:var(--body);margin-top:8px}.wait-heading{display:flex;gap:16px;align-items:center}.wait-heading .duration{display:block;white-space:nowrap;font-size:36px;font-weight:800;letter-spacing:-.035em}.wait-heading .duration-note{font-size:20px;line-height:1.25;font-weight:700;max-width:160px}
.branch-title{position:relative;text-align:center;margin:34px 0 26px;font-size:15px;font-weight:600;color:var(--body)}.branch-title::before{content:"";position:absolute;left:75%;top:-34px;height:23px;border-left:2px solid #CFDBED}
.process-outcomes{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:50px;padding-top:20px}.process-outcomes::before{content:"";position:absolute;top:0;left:25%;right:25%;height:20px;border-top:2px solid #CFDBED;border-left:2px solid #CFDBED;border-right:2px solid #CFDBED}.outcome{padding:22px 26px;border-top:3px solid #D2E0F3;background:#F7F9FD;border-radius:0 0 12px 12px}.outcome.money{background:#FFF7EB;border-top-color:#EACBA0}.outcome-label{display:block;color:var(--body);font-size:14px;line-height:1.4;margin-bottom:10px}.outcome h3{font-size:23px}.outcome p{font-size:17px;color:var(--body);margin-top:10px}.outcome p strong{color:var(--navy);white-space:nowrap}.outcome-or{position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);font-size:14px;color:var(--muted);font-style:normal}
details.calc{margin-top:28px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}summary{cursor:pointer}summary::-webkit-details-marker{display:none}.calc summary,.hint summary{list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px;font-weight:600;line-height:1.45;padding:18px 0}.calc summary{font-size:17px}.chev{display:flex;flex:none;transition:transform .2s}details[open]>summary .chev{transform:rotate(180deg)}.calcbody{padding:0 0 22px;font-size:16px;color:var(--body)}.calcbody table{border-collapse:collapse;width:100%;max-width:530px;margin:16px 0}.calcbody td{border-bottom:1px solid var(--line);padding:9px 4px}.calcbody td:last-child{text-align:right;color:var(--navy);font-weight:700}
/* Het antwoord krijgt meer nadruk dan de angst. */
.safety-question{font-size:18px;color:var(--body);margin-bottom:16px}#gevolgen h2{max-width:820px;font-size:clamp(31px,3.4vw,43px)}.safe-explanation{max-width:770px;margin-top:22px;color:var(--body);font-size:19px}.safe-explanation strong{font-weight:600;color:var(--navy)}.safety-moments{display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:38px}.safety-now,.safety-next{padding:20px 0 0;border-top:2px solid #C9D9ED}.safety-now{border-color:#78BCAF}.phase-label{display:block;font-size:14px;font-weight:600;color:var(--body);margin-bottom:10px}.safety-moments h3{font-size:24px}.safety-moments p{font-size:17px;color:var(--body);margin-top:10px;max-width:440px}.safe-right{font-size:16px;color:var(--body);margin-top:30px;max-width:780px}
/* Controleerbare identiteit, contact en gegevens in één organisatieblok. */
.over-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:64px;row-gap:30px;grid-template-areas:"intro organization" "why organization";align-items:start}.over-intro{grid-area:intro}.organization{grid-area:organization;min-width:0;border-top:3px solid var(--navy);background:#F6F8FC;padding:26px 28px;border-radius:0 0 14px 14px}.organization>h3{font-size:27px}.organization p{font-size:16px;color:var(--body);margin-top:10px}.org-data{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:22px 0 8px}.org-data dt{font-size:13px;color:var(--muted)}.org-data dd{font-size:19px;font-weight:700;margin:2px 0 0}.kvklink{display:inline-flex;align-items:center;gap:7px;min-height:40px;font-size:15px;font-weight:600}.org-contact,.org-privacy{border-top:1px solid var(--line);padding-top:20px;margin-top:18px}.org-contact h4,.org-privacy h4{font-size:18px}.org-contact .clink{display:inline-flex;align-items:center;gap:8px;min-height:44px;margin-top:5px;font-size:17px;font-weight:600}.org-contact p.small{font-size:14px;margin-top:0}.org-privacy a{display:inline-block;font-size:15px;font-weight:600;padding:5px 0}
.why{grid-area:why;padding-left:20px;border-left:2px solid var(--line);max-width:530px}.why h3{font-size:19px}.why p{font-size:17px;color:var(--body);margin-top:9px}.why p.strong{color:var(--navy);font-weight:600}.bridge{display:grid;grid-template-columns:1fr 1fr;gap:64px;margin-top:44px;padding-top:28px;border-top:1px solid var(--line)}.bstep{display:flex;align-items:flex-start;gap:12px}.bn{display:flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;background:#EDF3FA;border-radius:50%;font-size:14px;font-weight:700}.bstep h3{font-size:19px}.bstep p{font-size:16px;color:var(--body);margin-top:7px}
/* Upload: instructie en hulp bij de keuze, status bij de bestanden. */
.upgrid{display:grid;grid-template-columns:1fr 1fr;column-gap:64px;row-gap:24px;grid-template-areas:"top panel" "routes panel";align-items:start}.uptop{grid-area:top}.promise{display:flex;align-items:flex-start;gap:10px;font-size:18px;font-weight:700;margin-top:24px}.promise svg{margin-top:4px;color:var(--teal)}.cost-route{grid-area:routes;align-self:start;font-size:16px;line-height:1.5}.cost-route a{display:inline-block;padding:5px 0;max-width:400px}
.upload-panel{grid-area:panel;min-width:0;background:#fff;border:1px solid #C9D8EB;border-radius:18px;box-shadow:0 12px 30px #0B12500A;overflow:hidden}.upload-phase{display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px 12px;padding:14px 22px;background:#EAF1FC;font-size:13px}.upload-body{padding:26px 24px}.upload-body h3{font-size:25px;line-height:1.25}.upload-instruction{font-size:16px;color:var(--body);margin-top:10px}.hint{margin-top:8px}.hint summary{padding:12px 0;font-size:15px;text-decoration:underline;text-decoration-color:#9AA5BE;text-underline-offset:3px}.hint p{font-size:15px;color:var(--body);margin:0 0 16px}
.selected-files{list-style:none;padding:0;margin:18px 0 0;display:grid;gap:12px}.selected-files:empty{display:none}.file-card{display:grid;grid-template-columns:60px minmax(0,1fr);gap:8px 12px;align-items:start;padding:12px;border:1px solid #D7E1EF;border-radius:10px;background:#FAFBFD}.file-preview{display:flex;grid-row:1/3;align-items:center;justify-content:center;position:relative;width:60px;height:82px;overflow:hidden;border:1px solid #C8D5E6;border-radius:5px;background:#fff;color:var(--navy);padding:0;text-decoration:none;font-size:13px;font-weight:700}.file-preview img{display:block;width:100%;height:100%;object-fit:contain}.preview-label{position:absolute;bottom:0;left:0;right:0;background:var(--navy);color:#fff;font-size:11px;text-align:center;padding:2px}.file-preview:disabled{cursor:default}.file-detail{min-width:0}.file-name{font-size:15px;line-height:1.4;overflow-wrap:anywhere;font-weight:600}.file-meta{font-size:13px;line-height:1.4;color:var(--muted);margin-top:5px}.file-remove{grid-column:2;justify-self:start;min-height:44px;min-width:44px;padding:8px 11px;border:1px solid #D0DAE9;border-radius:7px;background:#fff;color:var(--navy);font-size:13px;font-weight:600}
.selection-status{font-size:14px;line-height:1.5;color:var(--body);margin-top:12px}.selection-status:empty{display:none}.upload-choose,.upload-start{margin-top:18px;width:100%;font-size:17px;padding:16px}.upload-panel.has .upload-choose{background:#fff;border:1px solid #B5CDC9;color:#0B635A;font-size:16px;margin-top:12px;padding:12px}.upload-panel.has .upload-choose:hover{background:#F0F8F6}.upload-panel.has .upload-instruction,.upload-panel.has .upload-format{display:none}.upload-format{font-size:14px;color:var(--muted);margin-top:12px}.upload-panel.over{outline:3px solid var(--teal);outline-offset:3px}.upload-panel.over .upload-body{background:#F4FBF9}.file-error{margin-top:16px;padding:12px 14px;border-left:3px solid #A33333;background:#FFF3F3;color:#8B2525;font-size:14px}.file-error p{font-weight:700}.file-error ul{margin:6px 0 0;padding-left:18px}.file-error li{overflow-wrap:anywhere}.file-error li+li{margin-top:6px}
.later{margin-top:18px;color:var(--body);font-size:15px}.later summary{padding:10px 0;min-height:44px;color:var(--navy);font-weight:600;line-height:1.5}.later p{margin-top:8px}.upload-reassurance{padding:18px 24px 20px;border-top:1px solid var(--line);background:#FBFCFE}.upload-reassurance ul{display:flex;flex-wrap:wrap;gap:6px 20px;list-style:none;margin:0;padding:0;font-size:14px;font-weight:600}.upload-reassurance li::before{content:"✓";margin-right:7px;color:#0B635A}.upload-reassurance p{font-size:14px;color:var(--body);margin-top:10px}.upload-reassurance a{font-weight:600}
/* Kosten blijven open zichtbaar; de overige vragen hebben een eigen ingang. */
.pricing{scroll-margin-top:16px}.pricing-grid{display:grid;grid-template-columns:.72fr 1.28fr;align-items:start;gap:44px;margin-top:32px}.cost-free{padding:26px;background:var(--tint);border-top:3px solid #C8D9EF;border-radius:0 0 14px 14px}.cost-free h3{font-size:22px}.cost-free>strong{display:block;font-size:44px;line-height:1.2;letter-spacing:-.03em;margin-top:16px}.cost-free p{font-size:17px;color:var(--body);margin-top:12px}.cost-follow{min-width:0;padding:2px 0 0}.cost-scope{font-size:14px;font-weight:600;color:var(--body);margin-bottom:10px}.cost-follow h3{font-size:27px;line-height:1.2}.cost-follow>p:not(.cost-scope){font-size:16px;color:var(--body);margin-top:12px}.cost-summary{margin:22px 0 0}.cost-summary>div{display:grid;grid-template-columns:minmax(0,1fr) minmax(130px,.65fr);align-items:start;gap:20px;padding:20px 0;border-top:1px solid var(--line)}.cost-summary dt{font-size:17px;font-weight:600;line-height:1.4}.cost-summary dt span{display:block;font-size:14px;font-weight:400;color:var(--body);margin-top:6px}.cost-summary dd{margin:0;text-align:right;font-size:27px;font-weight:800;line-height:1.2}.cost-summary dd span{display:block;font-size:14px;font-weight:600;line-height:1.4;margin-top:5px}.cost-summary .fee-row{padding:20px;background:#FFF4E3;border:1px solid #EDD9B9;border-radius:12px}.cost-follow>.cost-payment{margin-top:16px!important}.cost-follow>.cost-none{font-weight:700;color:var(--navy)!important;margin-top:6px!important}.cost-follow>.cost-help{padding-top:14px;border-top:1px solid var(--line);margin-top:18px!important;font-size:15px!important}
.faq{max-width:820px;margin:80px auto 0;scroll-margin-top:16px}.faq h2{margin-bottom:28px}.q{border-bottom:1px solid var(--line)}.q:first-of-type{border-top:1px solid var(--line)}.q summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:22px 4px;font-size:19px;font-weight:600;line-height:1.4}.q[open]>summary{font-weight:700}.a{padding:0 4px 24px;color:var(--body);font-size:17px}.a p+p{margin-top:12px}.a a{font-weight:600}.end{margin-top:64px;padding:30px 32px;border-radius:16px;background:var(--tealbg)}.endin{display:grid;grid-template-columns:1fr auto;grid-template-areas:"heading action" "copy action" "alt alt";gap:8px 32px;align-items:center}.end h2{grid-area:heading;font-size:27px}.end p{grid-area:copy;font-size:16px;color:var(--body)}.end .btn{grid-area:action;font-size:17px}.end p.alt{grid-area:alt;margin-top:8px;font-size:15px}
/* Verificatie aan het einde van de pagina. */
footer{padding:62px 0 0;background:var(--navy);color:#E3E9F8;font-size:15px}.fin{max-width:1240px;padding:0 24px;margin:auto}.fgrid{display:grid;grid-template-columns:1.15fr 1fr 1fr 1.05fr;gap:38px}.brand img{display:block;height:28px;width:auto;max-width:100%}.brand p{margin-top:22px;max-width:280px;line-height:1.6;color:#CBD4ED}.fgrid h4{font-size:17px;color:#fff;margin-bottom:18px}.fi{display:flex;align-items:flex-start;gap:9px;color:#D5DDF2;margin-top:10px;font-size:15px}.fi svg{width:18px;height:18px;margin-top:3px}.fgrid a{color:#D5DDF2;text-decoration-color:#8293BE}.flink{display:inline-flex;align-items:center;gap:7px;font-size:14px;margin-top:14px;min-height:36px}.fl{list-style:none;padding:0;margin:0}.fl a{display:inline-block;min-height:36px;padding:5px 0;line-height:1.5}.fbar{display:flex;justify-content:space-between;gap:20px;margin-top:44px;padding:24px 0;border-top:1px solid #394174;font-size:14px}.fbar a{color:#D5DDF2}footer a:focus-visible{outline-color:#fff}
/* Dezelfde rustige dialoog voor gegevens, foto en demonstratiestatus. */
.info-dialog{border:0;border-radius:18px;padding:0;max-height:calc(100dvh - 48px);width:min(660px,calc(100% - 40px));max-width:none;box-shadow:0 24px 80px #0B125033;overflow:auto}.dialog-head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding:24px;border-bottom:1px solid var(--line);position:sticky;top:0;background:#fff;z-index:1}.dialog-head h2{font-size:25px;line-height:1.25;overflow-wrap:anywhere}.dialog-close{flex:none;min-height:44px;padding:10px 13px;border:1px solid #C5D3E8;border-radius:8px;background:#fff;color:var(--navy);font-size:15px;font-weight:600}.dialog-body{padding:24px;color:var(--body);font-size:17px}.dialog-body p+p{margin-top:16px}.dialog-body .a{padding:0}.dialog-body .btn{margin-top:22px}.preview-image{display:block;max-width:100%;height:auto;margin:auto}
@media(max-width:1120px){.hin{grid-template-columns:1fr auto;height:68px}nav,.slot{display:none}.mob{display:flex;align-items:center;gap:12px}.hbtn{font-size:15px}.fgrid{grid-template-columns:1fr 1fr;gap:36px 48px}}
@media(max-width:960px){.band{padding:72px 0}.hero{padding:44px 0 58px}.hgrid{grid-template-columns:1fr 1fr;column-gap:32px}.hero h1{font-size:38px}.hero .sub{font-size:24px}.hero .lead{font-size:18px}.hero .btn{font-size:17px;padding:16px 18px}.hero .checks{font-size:14px;gap:8px 16px}.two{gap:36px}.over-grid{column-gap:36px}.organization{padding:24px 22px}.bridge{gap:36px}.upgrid{grid-template-columns:1fr;grid-template-areas:"top" "panel" "routes";gap:26px;max-width:760px}.uptop .lead{max-width:610px}.upload-panel{width:100%}.upload-phase{font-size:14px}.upload-body{padding:26px}.upload-reassurance{padding:20px 26px}.file-card{grid-template-columns:62px minmax(0,1fr) auto;align-items:center}.file-preview{grid-row:auto}.file-remove{grid-column:3}.cost-route{margin-top:0}.pricing-grid{gap:28px;grid-template-columns:.75fr 1.25fr}.cost-follow h3{font-size:25px}.cost-summary>div{grid-template-columns:1fr;gap:12px}.cost-summary dd{text-align:left}.cost-summary dd span{display:inline;font-size:14px;margin-left:6px}}
@media(max-width:820px){.hgrid{grid-template-columns:1fr;grid-template-areas:"text" "reassurance" "example" "route";max-width:680px}.hero h1{font-size:42px}.hero .result{max-width:540px;width:100%;margin-top:32px}.hero-route{margin-top:24px}.two{grid-template-columns:1fr;gap:28px;max-width:720px}.two .lead{max-width:560px}.over-grid{grid-template-columns:1fr;grid-template-areas:"intro" "organization" "why";row-gap:30px}.over-grid .lead{max-width:650px}.organization{max-width:none;padding:26px 28px}.organization>p{max-width:600px}.why{max-width:650px}.process-main{gap:36px}.process-main li{padding:22px}.process-main li:first-child::after{right:-28px;font-size:23px}.wait-heading{display:block}.wait-heading .duration{font-size:36px}.wait-heading .duration-note{display:block;max-width:none;margin-top:5px}.process-outcomes{gap:36px}.outcome{padding:22px}.safety-moments{gap:30px}.pricing-grid{grid-template-columns:1fr;gap:30px}.cost-free{display:grid;grid-template-columns:1fr auto;gap:8px 20px;padding:22px}.cost-free>strong{margin:0;font-size:35px}.cost-free p{grid-column:1/-1;margin:0}.cost-summary>div{grid-template-columns:minmax(0,1fr) minmax(130px,.6fr)}.cost-summary dd{text-align:right}.cost-summary dd span{display:block;margin-left:0}.endin{grid-template-columns:1fr;grid-template-areas:"heading" "copy" "action" "alt";gap:10px}.end .btn{justify-self:start;margin-top:8px}.end p.alt{margin-top:0}}
@media(max-width:620px){html{scroll-padding-top:80px}body{font-size:17px}.wrap,.fin{padding-left:22px;padding-right:22px}.band{padding:56px 0}h2{font-size:30px;line-height:1.15}h3{font-size:21px}.lead{font-size:18px;line-height:1.6;margin-top:16px}.eyebrow{font-size:13px;margin-bottom:12px}.dt,.desk{display:none}.mb,.mobo{display:inline}.hin{height:64px;padding:0 16px;gap:8px}.logo{height:25px}.mob{gap:5px}.mob .hbtn{font-size:13px;padding:10px 12px}.mbtn{width:44px}.hero{padding:34px 0 46px}.hero h1{font-size:34px;line-height:1.1}.hero .sub{font-size:23px;margin-top:14px}.hero .lead{margin-top:16px}.hero .btn{width:100%;font-size:17px;min-height:56px;margin-top:24px}.checks{font-size:13px!important;gap:7px 12px!important;margin-top:14px}.checks li{gap:5px}.checks svg{width:15px;height:15px}.hind{margin-top:13px}.hero .indep{font-size:13px;line-height:1.55}.hero .result{margin-top:28px}.rtop{margin-bottom:11px}.tag{font-size:12px}.letter-example{padding:20px 20px 22px}.letter-label{font-size:12px;padding-bottom:12px}.letter-example blockquote{font-size:20px;margin-top:17px}.example-reading{padding:21px 16px 14px;margin-left:14px}.example-reading strong{font-size:17px}.example-reading span{font-size:12px}.status{font-size:20px;padding:14px 16px}.hero-route{font-size:14px;margin-top:21px}.two{gap:24px}.qs li{font-size:17px;padding:13px 0;gap:10px}.qs .n{width:22px;height:22px;font-size:12px}.relief{display:block;padding:22px;margin-top:24px}.ric{margin-bottom:8px;padding:0}.ric svg{width:24px;height:24px}.relief h3{font-size:25px}.relief p{font-size:16px;margin-top:10px}
.process-context{font-size:17px;margin-top:16px}.process-main{grid-template-columns:1fr;gap:26px;margin:28px 0 0 13px;padding-left:27px;border-left:2px solid #CFDBED}.process-main li{padding:0;background:none;border:0;border-radius:0}.process-main li:first-child{border:0;background:none}.process-main li::before{content:"";position:absolute;left:-36px;top:4px;width:14px;height:14px;background:#fff;border:2px solid #8DADC9;border-radius:50%}.process-main li:first-child::before{border-color:var(--teal)}.process-main li:first-child::after{display:none}.actor{font-size:13px;margin-bottom:8px}.process-main h3{font-size:22px}.process-main p{font-size:16px}.process-main .wait-step{background:var(--tint);padding:18px;border-radius:12px;margin-left:-2px}.process-main .wait-step::before{left:-34px;top:22px}.wait-heading{display:block}.wait-heading .duration{font-size:38px}.wait-heading .duration-note{font-size:18px;margin-top:1px}.branch-title{text-align:left;margin:25px 0 18px 42px;font-size:14px}.branch-title::before{left:-29px;top:-25px;height:44px}.process-outcomes{grid-template-columns:1fr;gap:30px;margin-left:13px;padding:0 0 0 27px}.process-outcomes::before{left:0;right:auto;top:-19px;width:2px;height:auto;bottom:30px;border:0;background:#CFDBED}.outcome{position:relative;padding:18px;border:0;border-radius:10px}.outcome::before{content:"";position:absolute;top:28px;left:-27px;width:27px;height:2px;background:#CFDBED}.outcome h3{font-size:21px}.outcome p{font-size:16px;margin-top:8px}.outcome-label{font-size:13px;margin-bottom:8px}.outcome-or{position:static;display:block;transform:none;margin:-25px 0;z-index:1;line-height:20px;font-size:13px;padding-left:18px}.process-outcomes .outcome:last-child::after{content:"";position:absolute;left:-29px;top:30px;bottom:0;width:4px;background:#fff}.calc{margin-top:26px!important}.calc summary{font-size:16px;padding:17px 0}.calcbody{font-size:15px}.safety-question{font-size:16px;margin-bottom:13px}#gevolgen h2{font-size:32px}.safe-explanation{font-size:17px;margin-top:20px}.safety-moments{grid-template-columns:1fr;gap:24px;margin-top:28px}.safety-now,.safety-next{padding-top:18px}.phase-label{font-size:13px;margin-bottom:8px}.safety-moments h3{font-size:22px}.safety-moments p{font-size:16px;margin-top:8px}.safe-right{font-size:15px;margin-top:26px}.over-grid{row-gap:27px}.organization{padding:22px}.organization>h3{font-size:25px}.org-data{gap:10px;margin-top:18px}.org-data dd{font-size:18px}.org-contact,.org-privacy{padding-top:18px;margin-top:16px}.organization p{font-size:15px}.org-privacy a,.kvklink{font-size:14px}.org-contact h4,.org-privacy h4{font-size:17px}.org-contact .clink{font-size:16px}.why{padding-left:16px}.why h3{font-size:18px}.why p{font-size:16px}.bridge{grid-template-columns:1fr;gap:22px;margin-top:30px;padding-top:24px}.bstep h3{font-size:18px}.bstep p{font-size:15px;margin-top:5px}.bn{width:26px;height:26px;font-size:13px}.promise{font-size:17px;gap:8px;margin-top:20px}.upgrid{gap:26px}.upload-phase{font-size:13px;padding:12px 18px}.upload-body{padding:22px 18px}.upload-body h3{font-size:23px}.upload-instruction{font-size:16px}.hint summary{font-size:14px}.hint p{font-size:15px}.upload-choose,.upload-start{font-size:16px;padding:15px 12px}.upload-reassurance{padding:17px 18px}.file-card{grid-template-columns:52px minmax(0,1fr);gap:8px 10px;padding:10px;align-items:start}.file-preview{grid-row:1/3;width:52px;height:74px}.file-remove{grid-column:2}.file-name{font-size:14px}.file-meta{font-size:13px}.cost-route{font-size:15px}.cost-free{padding:20px;gap:8px 12px}.cost-free h3{font-size:20px}.cost-free>strong{font-size:31px}.cost-free p{font-size:16px}.cost-follow h3{font-size:25px}.cost-summary>div{grid-template-columns:1fr;gap:10px;padding:18px 0}.cost-summary dd{text-align:left;font-size:27px}.cost-summary dd span{display:inline;font-size:14px;margin-left:6px}.cost-summary .fee-row{padding:18px}.cost-summary dt{font-size:17px}.faq{margin-top:58px}.faq h2{margin-bottom:24px}.q summary{font-size:17px;padding:20px 0;gap:14px}.a{font-size:16px;padding:0 0 22px}.end{margin-top:46px;padding:26px 22px}.end h2{font-size:26px}.end .btn{width:100%;font-size:16px;padding:15px 12px}.end p{font-size:16px}.fgrid{grid-template-columns:1fr;gap:30px}.brand p{max-width:340px;margin-top:18px}.fgrid h4{margin-bottom:13px}.fi{margin-top:8px}.fbar{font-size:13px;gap:14px;margin-top:32px;padding:22px 0}.fbar a{white-space:nowrap}footer{padding-top:44px}.info-dialog{width:calc(100% - 24px);max-height:calc(100dvh - 24px);border-radius:16px}.dialog-head{padding:18px;gap:12px}.dialog-head h2{font-size:21px}.dialog-close{font-size:14px;padding:10px}.dialog-body{padding:18px;font-size:16px}.dialog-body .a{font-size:16px}}
@media(max-width:370px){.wrap,.fin{padding-left:18px;padding-right:18px}.hin{padding:0 12px;gap:4px}.logo{height:23px}.mob{gap:2px}.mob .hbtn{font-size:12px;padding:10px}.lbl-l{display:none}.lbl-s{display:inline}.hero h1{font-size:31px}.hero .sub{font-size:21px}.hero .btn{font-size:16px;padding-left:12px;padding-right:12px}.checks{gap:6px 10px!important;font-size:12px!important}.checks svg{width:14px;height:14px}.letter-example{padding:18px 16px}.letter-example blockquote{font-size:19px}.status{font-size:19px}.relief{padding:20px}.process-main{padding-left:23px;margin-left:10px}.process-main li::before{left:-32px}.process-main .wait-step::before{left:-30px}.process-outcomes{padding-left:23px;margin-left:10px}.outcome::before{left:-23px;width:23px}.process-outcomes .outcome:last-child::after{left:-25px}.branch-title{margin-left:35px}.branch-title::before{left:-25px}.organization{padding:20px 18px}.upload-phase{padding:12px 16px}.upload-body{padding:20px 16px}.upload-body h3{font-size:22px}.upload-choose{font-size:15px}.cost-free{padding:18px}.end{padding:24px 18px}.end .btn{font-size:15px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation:none!important;transition:none!important}}


/* Visuals en kleur — 29 september 2026 */
.sr-only{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.scene-svg{display:block;width:100%;height:auto}.hero,.band,footer{isolation:isolate}
/* Papier, telefoon en betekenis staan direct in beeld. */
.hero{position:relative;background:#fff;padding:50px 0 66px;overflow:hidden}.hero::before{content:"";position:absolute;width:52%;height:75%;right:0;top:0;background:#EAF3FF;border-radius:0 0 0 150px;z-index:-1}.hgrid{grid-template-columns:1.08fr 1fr;grid-template-areas:"heading visual" "text visual" "reassurance visual" "route visual";column-gap:62px;align-items:start;row-gap:0}.hero-heading{grid-area:heading;align-self:end;padding-bottom:22px}.hero h1{font-size:clamp(38px,4vw,52px);line-height:1.1}.hero .sub{position:relative;font-size:26px;margin-top:18px}.hero .sub::after{content:"";display:block;width:72px;height:4px;border-radius:4px;background:#55B9A4;margin-top:14px}.hero .lead{margin-top:0;font-size:19px}.hero .btn{margin-top:24px}.hero .checks{font-size:14px;gap:7px 16px}.hero .hind{margin-top:18px;align-self:start}.hero-route{grid-area:route;margin-top:22px;max-width:420px;line-height:1.5}.hero-photo{grid-area:photo;margin:0;min-width:0;height:350px;border-radius:20px 20px 4px 20px;overflow:hidden;box-shadow:0 16px 42px #143E6919}.hero-photo img{display:block;width:100%;height:100%;object-fit:cover;object-position:58% 50%}.hero .result{margin:-42px 20px 0 24px;padding:19px 21px 18px;background:#fff;border:1px solid #D9E5F2;border-radius:12px;box-shadow:0 14px 36px #172B5017;position:relative;z-index:1;width:auto;align-self:start}.hero .rtop{margin-bottom:10px}.hero .tag{font-size:11px;color:#506386;letter-spacing:.065em}.hero .letter-example{padding:0;border:0;background:none;box-shadow:none}.hero .letter-example::after{display:none}.hero .letter-label{padding:0 0 9px;font-size:11px;border-color:#D7E3F1;gap:4px 12px}.hero .letter-example blockquote{font-size:18px;line-height:1.45;margin-top:10px}.hero .letter-example mark{background:#FCE1AC}.hero .example-reading{padding:10px 0 10px 12px;margin:10px 0 0;border-left:2px solid #BCD1EB}.hero .example-reading span{font-size:11px}.hero .example-reading strong{font-size:15px;margin-top:3px}.hero .status{font-size:18px;padding:11px 13px;background:#FFF1D8;border-color:#F0D09D;gap:9px}.hero .status svg{width:21px;height:21px}
/* De herkenningssectie heeft een eigen beeld, geen extra interfacekaart. */
#herken{background:#EDF5FF}.recognition-visual{width:min(350px,86%);margin:26px auto -8px 10px}.recognition-layout{align-items:center}.qs li{border-color:#C7D9EF}.qs .n{background:#D4E5FB;color:#315A8B}.relief{background:#CFEDE2;box-shadow:none;border-radius:18px}.relief h3{color:#12394B}.relief p{color:#375764}.relief .ric svg{stroke:#137B69}
/* Kalender en documenten nemen een deel van het uitlegwerk over. */
#hoe{background:#fff}.process-main{margin-top:36px;align-items:stretch;gap:50px}.process-main li{min-height:240px}.process-main .send-step{display:grid;grid-template-columns:130px minmax(0,1fr);column-gap:20px;align-content:center;border:0;background:#E3F4EC;padding:28px 26px;border-radius:18px}.send-visual{grid-row:1/4;align-self:center;max-width:150px}.send-step .actor,.send-step h3,.send-step p{grid-column:2}.send-step .actor{margin-bottom:8px}.send-step p{font-size:16px;margin-top:10px}.process-main .wait-step{display:grid;grid-template-columns:150px minmax(0,1fr);column-gap:18px;align-content:center;padding:26px;border-radius:18px;background:#DEEAFE}.wait-step .actor{grid-column:1/-1;margin-bottom:16px}.calendar-visual{grid-column:1;grid-row:2/4;align-self:center}.calendar-svg{display:block;width:100%;height:auto}.wait-heading{grid-column:2;align-self:end;display:block}.wait-heading .duration-note{font-size:21px;max-width:none;line-height:1.3}.wait-step>p{grid-column:2;font-size:16px;align-self:start;margin-top:10px}.actor.uwv{color:#355C8A}.branch-title::before{border-color:#9BBADC}.process-outcomes::before{border-color:#9BBADC}.outcome{display:grid;grid-template-columns:86px minmax(0,1fr);column-gap:18px;padding:24px;border-color:#6C94C6;background:#EDF4FF}.outcome-art{display:block;width:86px;height:86px;grid-row:1/4;align-self:center}.outcome-label,.outcome h3,.outcome p{grid-column:2}.outcome h3{font-size:23px}.outcome p{font-size:16px}.outcome.money{background:#FFF0D8;border-color:#DDA653}.outcome-or{color:#536A85}.calc summary{color:#274E7F}
/* Eén krachtige rustige kleurwissel: het geruststellende antwoord. */
#gevolgen{background:#101C50;color:#fff;position:relative;overflow:hidden}#gevolgen::after{content:"";position:absolute;width:380px;height:380px;border-radius:50%;background:#17285E;right:-185px;bottom:-170px;z-index:-1}.safety-top{display:grid;grid-template-columns:1fr 285px;gap:56px;align-items:center}.safety-question{color:#BBD3EF;font-size:17px}#gevolgen h2{color:#fff;max-width:730px;font-size:42px;line-height:1.14}.safe-explanation{color:#D5E3F6;font-size:18px;max-width:680px}.safe-explanation strong{color:#E1FFF2}.safety-visual{width:285px}.safety-moments{margin-top:34px;gap:48px}.safety-now,.safety-next{border-color:#466391;padding-top:23px}.safety-now{border-color:#65BBA5}.phase-label{color:#BAD4EE}.safety-moments h3{color:#fff}.safety-moments p{color:#D5E3F6}.safe-right{color:#C1D8EF;font-size:16px}
/* Een herkenbare afzender: merkvlak plus echte bedrijfsgegevens. */
.over-grid{row-gap:30px;column-gap:56px}.organization{padding:0 26px 26px;background:#fff;border:1px solid #C5D8EF;border-top:0;border-radius:16px;box-shadow:0 14px 35px #1D40610A;overflow:hidden}.organization-brand{display:flex;align-items:center;gap:15px;background:#142455;color:#fff;margin:0 -26px;padding:22px 23px}.brand-document{width:57px;height:62px;flex:none}.organization-brand h3{font-size:28px;color:#fff}.organization-brand p{color:#DCE9FC;font-size:14px;line-height:1.5;max-width:265px;margin-top:6px}.organization>.organization-country{font-size:14px;color:#50627E;margin-top:21px}.org-data{margin-top:13px;margin-bottom:7px}.org-data dt{color:#526483}.org-data dd{font-size:21px}.org-contact,.org-privacy{border-color:#CDDCEE}.org-contact .clink{color:#164D7E}.bridge{border-color:#CEE0F0}.bn{background:#D8EFE7;color:#145746}.why{border-color:#A7C9E7}
/* Een herkenbaar werkvlak, met foto/pdf als twee concrete opties. */
#upload{background:#E0F3EB;position:relative;overflow:hidden}#upload::before{content:"";position:absolute;left:-160px;bottom:-200px;width:550px;height:550px;background:#D1EBDF;border-radius:50%;z-index:-1}.upload-visual{width:min(370px,90%);margin:30px 0 0}.upgrid{column-gap:56px;grid-template-areas:"top panel" "routes panel";row-gap:18px}.promise{color:#175B51}.upload-panel{border:1px solid #97C5B4;box-shadow:0 18px 40px #244E4410}.upload-phase{background:#C5E6D8;color:#154B43;border-bottom:1px solid #AFCFBD}.upload-reassurance{background:#F1FAF5;border-color:#CFE5D9}.upload-choose{box-shadow:0 5px 12px #0D7F7217}.upload-panel.has .upload-choose{box-shadow:none}.upload-panel.has .upload-phase{background:#BBDCCF}.file-card{background:#F8FCFA;border-color:#C1DDD0}.file-preview{border-color:#9EBDAE}.selection-status{color:#305D50}
/* De bedragen blijven navy; crème en de verhouding geven context. */
.cost-free{position:relative;background:#DCF2E8;border:0;border-radius:17px;padding:28px;display:grid;grid-template-columns:1fr 93px;column-gap:10px}.free-art{grid-column:2;grid-row:1/4;width:93px;height:100px;align-self:center}.cost-free h3{grid-column:1;font-size:21px}.cost-free>strong{grid-column:1;font-size:45px;margin-top:14px}.cost-free>p{grid-column:1/-1;max-width:290px;margin-top:14px;color:#35564D}.cost-summary .fee-row{background:#FFF0D8;border-color:#EAC995}.cost-summary .fee-row dt{align-self:center}.cost-summary .fee-amount{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}.fee-ring{display:block;width:100px;height:100px}.cost-summary .fee-amount>span{display:block;font-size:14px;margin:0;max-width:160px}.pricing-grid{grid-template-columns:.73fr 1.27fr;gap:46px}.cost-follow h3{font-size:27px}
/* Vragen krijgen een herkenbare ingang, met een rustige vraaglijst. */
.faq{display:grid;grid-template-columns:.73fr 1.27fr;gap:46px;max-width:none;margin-top:80px;align-items:start}.faq-heading{min-width:0}.faq-art{display:block;width:130px;height:auto;margin-bottom:18px}.faq-heading h2{max-width:350px;font-size:34px}.faq-heading .eyebrow{color:#355F94}.faq-list{min-width:0}.q summary{font-size:18px}.q{border-color:#C6D9F0}.q[open]>summary{color:#214E85}.end{display:flex;align-items:center;gap:28px;background:#D2EFE3;padding:30px 36px}.end-visual{width:115px;flex:none}.endin{flex:1;min-width:0;grid-template-columns:1fr auto;gap:8px 25px}.end h2{font-size:25px}.end .btn{font-size:16px;padding:15px 20px}footer{border-top:5px solid #5385B9}
@media(max-width:1120px){.hgrid{column-gap:34px}.hero-photo{height:330px}.hero .result{margin-left:14px;margin-right:10px}.hero h1{font-size:42px}.hero .sub{font-size:24px}.process-main .send-step{grid-template-columns:96px minmax(0,1fr);gap:15px;padding:22px}.process-main .wait-step{grid-template-columns:130px minmax(0,1fr);gap:12px;padding:22px}.process-main h3{font-size:21px}.outcome{grid-template-columns:64px minmax(0,1fr);gap:14px;padding:22px}.outcome-art{width:64px;height:70px}.outcome h3{font-size:21px}.safety-top{grid-template-columns:1fr 240px;gap:30px}.safety-visual{width:240px}#gevolgen h2{font-size:38px}.pricing-grid,.faq{gap:32px}.end{gap:20px;padding:28px}.end-visual{width:85px}.endin{grid-template-columns:1fr;grid-template-areas:"heading" "copy" "action" "alt"}.end .btn{justify-self:start;margin-top:8px}}
@media(max-width:960px){.hero{padding-top:38px}.hero-heading{padding-bottom:18px}.hero h1{font-size:38px}.hero .lead{font-size:18px}.hero .sub::after{margin-top:11px}.hero .result{padding:16px;margin-top:-20px}.hero .letter-example blockquote{font-size:17px}.hero .checks{font-size:13px}.process-main .send-step{display:block;text-align:left}.send-visual{width:116px;margin-bottom:13px}.process-main .wait-step{display:block}.wait-step .actor{margin-bottom:8px}.calendar-visual{width:160px;margin:0 0 0 -5px}.wait-heading .duration-note{font-size:21px;margin-top:0}.wait-step>p{margin-top:8px}.outcome{display:block}.outcome-art{width:80px;height:80px;margin-bottom:8px}.safety-top{grid-template-columns:1fr 200px;gap:20px}.safety-visual{width:200px}#gevolgen h2{font-size:35px}.upgrid{grid-template-columns:1fr;grid-template-areas:"top" "panel" "routes";max-width:760px;gap:26px}.uptop{position:relative;padding-right:210px}.uptop h2{max-width:460px}.uptop .lead{font-size:18px}.upload-visual{position:absolute;width:195px;right:0;bottom:0;margin:0}.uptop .promise{font-size:17px}.cost-free{padding:24px;grid-template-columns:1fr 74px}.free-art{width:74px;height:88px}.cost-free h3{font-size:20px}.cost-free>strong{font-size:39px}.cost-summary .fee-amount{align-items:flex-start;flex-direction:row;gap:15px}.cost-summary .fee-amount>span{align-self:center;text-align:left}.fee-ring{width:84px;height:84px}.faq{grid-template-columns:.7fr 1.3fr}.faq-heading h2{font-size:30px}.q summary{font-size:17px}}
@media(max-width:820px){.hgrid{max-width:740px;grid-template-columns:1fr 1fr;grid-template-areas:"heading visual" "text visual" "reassurance visual" "route visual";column-gap:26px}.hero h1{font-size:34px}.hero .sub{font-size:22px}.hero .lead{font-size:17px}.hero .btn{width:100%;padding:15px 12px;font-size:16px}.hero .result{max-width:none;width:auto;margin:-26px 0 0 -6px;padding:15px}.hero-photo{height:370px;object-position:center}.hero .letter-label{flex-direction:column;gap:0}.hero .letter-example blockquote{font-size:16px}.hero .example-reading strong{font-size:14px}.hero .status{font-size:17px;padding:10px}.hero .tag{font-size:10px}.hero .indep{font-size:13px}.hero-route{font-size:14px}.recognition-layout{grid-template-columns:1fr 1fr;max-width:740px;gap:28px}.recognition-visual{width:95%;margin-top:25px;margin-left:0}.relief{padding:22px;display:block}.relief .ric{margin-bottom:7px}.relief h3{font-size:24px}.qs li{font-size:17px}.over-grid{grid-template-columns:1fr;grid-template-areas:"intro" "organization" "why"}.organization-brand p{max-width:none}.organization{padding:0 28px 26px}.organization-brand{margin:0 -28px;padding:24px 27px}.safety-top{grid-template-columns:1fr 165px}.safety-visual{width:165px}.pricing-grid{grid-template-columns:1fr;gap:30px}.cost-free{grid-template-columns:1fr 110px;max-width:none}.cost-free h3{font-size:23px}.free-art{width:110px;height:110px}.cost-free>p{max-width:100%;grid-column:1;margin-top:8px}.cost-summary .fee-amount{align-items:center;flex-direction:column;gap:2px}.cost-summary .fee-amount>span{text-align:center}.fee-ring{width:94px;height:94px}.faq{grid-template-columns:1fr;gap:4px}.faq-heading{position:relative;padding-right:140px}.faq-heading h2{max-width:520px;font-size:34px}.faq-art{position:absolute;right:0;top:-6px;width:100px}.endin{grid-template-columns:1fr}.end-visual{width:100px}}
@media(max-width:620px){.hero{padding:28px 0 46px}.hero::before{top:170px;right:-70px;width:95%;height:280px;border-radius:100px 0 0 100px}.hgrid{grid-template-columns:1fr;grid-template-areas:"heading" "photo" "text" "reassurance" "example" "route";column-gap:0;max-width:500px}.hero-heading{padding-bottom:19px}.hero h1{font-size:34px;line-height:1.08}.hero .sub{font-size:22px;margin-top:12px}.hero .sub::after{display:none}.hero-photo{height:177px;border-radius:13px;margin:0 0 21px;box-shadow:0 9px 25px #122C5514}.hero-photo img{object-position:55% 53%}.hero .lead{font-size:17px;line-height:1.55}.hero .btn{font-size:17px;margin-top:19px;min-height:54px}.hero .checks{font-size:13px!important;gap:6px 12px!important;margin-top:12px}.hero .hind{margin-top:12px}.hero .indep{font-size:12px;line-height:1.5}.hero .result{width:100%;margin:25px 0 0;padding:18px 20px;box-shadow:none;background:#F5F9FF;border-color:#D0E0F2}.hero .tag{font-size:11px}.hero .letter-label{flex-direction:row;gap:7px;font-size:11px}.hero .letter-example blockquote{font-size:18px;line-height:1.45}.hero .example-reading{margin-top:10px;padding-top:7px;padding-bottom:7px}.hero .example-reading span{font-size:11px}.hero .example-reading strong{font-size:15px}.hero .status{font-size:18px;padding:11px 12px;background:#FFF0D6}.hero-route{font-size:14px;margin-top:20px;max-width:none}.recognition-layout{grid-template-columns:1fr;gap:22px}.recognition-visual{width:240px;max-width:80%;margin:22px auto -3px}.recognition-layout .lead{max-width:370px}.relief{padding:22px;border-radius:16px}.qs li{font-size:17px}.process-main{margin-top:28px;gap:25px;margin-left:12px;padding-left:24px}.process-main li{min-height:0}.process-main .send-step{display:grid;grid-template-columns:78px minmax(0,1fr);column-gap:13px;background:none;border-radius:0;padding:0}.send-visual{width:78px;grid-row:2/4;margin:0;align-self:start}.send-step .actor{grid-column:1/-1}.send-step h3,.send-step p{grid-column:2}.send-step h3{font-size:20px}.send-step p{font-size:15px;line-height:1.55}.process-main li::before{left:-33px}.process-main .wait-step{display:grid;grid-template-columns:110px minmax(0,1fr);column-gap:11px;row-gap:0;background:#DEEAFE;padding:16px;border-radius:13px;margin-left:0}.process-main .wait-step::before{left:-33px;top:21px}.wait-step .actor{grid-column:1/-1;font-size:12px;margin-bottom:8px}.calendar-visual{grid-column:1;grid-row:2/4;width:110px;margin:0}.wait-heading{grid-column:2;align-self:end}.wait-heading .duration-note{font-size:17px;line-height:1.25}.wait-step>p{grid-column:2;font-size:14px;line-height:1.4;margin-top:5px;align-self:start}.branch-title{margin:23px 0 16px 39px}.branch-title::before{left:-27px;top:-23px}.process-outcomes{margin-left:12px;padding-left:24px;gap:28px}.process-outcomes::before{background:#A6BFDE}.outcome{display:block;padding:18px;background:#EAF3FF;border-radius:12px}.outcome-art{width:65px;height:65px;margin:0 0 9px}.outcome-label{font-size:13px}.outcome h3{font-size:22px}.outcome p{font-size:16px}.outcome::before{left:-24px;width:24px;background:#A6BFDE}.process-outcomes .outcome:last-child::after{left:-26px}.outcome-or{margin:-24px 0}.outcome.money{background:#FFEDD0}.calc summary{font-size:16px}.safety-top{display:block}.safety-question{font-size:16px;line-height:1.5;margin-bottom:13px}#gevolgen h2{font-size:32px}.safe-explanation{font-size:17px;margin-top:19px}.safety-visual{width:185px;margin:20px auto -2px}.safety-moments{margin-top:23px;gap:25px}.safety-now,.safety-next{padding-top:20px}.phase-label{font-size:13px}.safety-moments h3{font-size:23px}.safety-moments p{font-size:16px}.safe-right{font-size:15px;margin-top:26px}.organization{padding:0 21px 22px;border-radius:14px}.organization-brand{margin:0 -21px;padding:19px 19px;gap:11px}.brand-document{width:47px;height:55px}.organization-brand h3{font-size:26px}.organization-brand p{font-size:13px}.org-data dd{font-size:19px}.organization>.organization-country{font-size:13px;margin-top:19px}.uptop{padding-right:0}.uptop .lead{font-size:18px}.upload-visual{position:static;width:205px;margin:19px auto -7px}.upgrid{gap:23px}.upload-panel{border-radius:16px}.upload-phase{padding:12px 17px}.upload-body{padding:22px 18px}.cost-free{grid-template-columns:1fr 88px;padding:22px;column-gap:12px}.free-art{width:88px;height:98px}.cost-free h3{font-size:21px}.cost-free>strong{font-size:40px;line-height:1.1;margin-top:13px}.cost-free>p{grid-column:1/-1;font-size:16px;margin-top:12px}.cost-follow h3{font-size:25px}.cost-summary .fee-row{padding:18px}.cost-summary .fee-amount{flex-direction:row;align-items:center;gap:13px}.fee-ring{width:85px;height:85px;flex:none}.cost-summary .fee-amount>span{text-align:left;font-size:15px;max-width:160px}.faq{margin-top:62px;gap:0}.faq-heading{padding-right:79px}.faq-heading h2{font-size:29px;margin-bottom:26px}.faq-art{width:69px;top:5px;right:-1px}.faq-heading .eyebrow{font-size:12px;letter-spacing:.04em}.q summary{font-size:17px}.end{display:block;padding:24px 22px;margin-top:44px}.end-visual{width:82px;margin-bottom:12px}.endin{display:grid;grid-template-columns:1fr;gap:10px}.end h2{font-size:27px}.end .btn{font-size:16px;padding:15px 10px}.end p.alt{margin-top:0}}
@media(max-width:370px){.hero{padding-top:23px}.hero h1{font-size:30px;line-height:1.08}.hero .sub{font-size:20px}.hero-heading{padding-bottom:17px}.hero-photo{height:148px;margin-bottom:18px}.hero .lead{font-size:16px}.hero .btn{font-size:16px;margin-top:18px}.hero .checks{font-size:12px!important;gap:5px 10px!important}.hero .result{padding:16px}.hero .letter-example blockquote{font-size:17px}.hero .letter-label{font-size:10px}.hero .status{font-size:17px}.recognition-visual{width:215px}.process-main{margin-left:9px;padding-left:21px}.process-main li::before{left:-30px}.process-main .wait-step::before{left:-30px}.process-main .send-step{grid-template-columns:64px minmax(0,1fr);column-gap:11px}.send-visual{width:64px}.send-step h3{font-size:19px}.process-main .wait-step{grid-template-columns:1fr;padding:16px;row-gap:0}.calendar-visual{grid-row:auto;grid-column:1;width:137px;margin:0 auto 3px}.wait-heading,.wait-step>p{grid-column:1}.wait-heading .duration-note{font-size:19px;text-align:center}.wait-step>p{font-size:15px;text-align:center;margin-top:8px}.branch-title{margin-left:34px;font-size:13px}.branch-title::before{left:-25px}.process-outcomes{margin-left:9px;padding-left:21px}.outcome::before{left:-21px;width:21px}.process-outcomes .outcome:last-child::after{left:-23px}.outcome h3{font-size:21px}.organization{padding-left:18px;padding-right:18px}.organization-brand{margin-left:-18px;margin-right:-18px;padding:18px 16px}.brand-document{width:41px;height:49px}.organization-brand h3{font-size:24px}.organization-brand p{font-size:12px}.cost-free{grid-template-columns:1fr 74px;padding:20px;gap:8px}.free-art{width:74px;height:86px}.cost-free h3{font-size:20px}.cost-free>strong{font-size:37px}.faq-heading{padding-right:57px}.faq-art{width:54px;top:10px}.faq-heading h2{font-size:27px}.end{padding:23px 19px}.end .btn{font-size:15px}}

.hero-media{grid-area:visual;min-width:0;align-self:start}.hero-media .result{grid-area:auto}
@media(max-width:620px){.hero-media{display:contents}.hero-media .result{grid-area:example}.process-main .send-step{row-gap:0}}

`;

/* De iconen. Eén keer beschreven, overal hergebruikt. */
const ico = {
  upload: (kleur = '#fff') => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4m0 0-4 4m4-4 4 4"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>`,
  vink: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0B1250" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#E8EDF7" stroke="none"/><path d="m7.5 12.5 3 3 6-6.5"/></svg>`,
  vinkje: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`,
  schild: (kleur = '#6B769F') => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/></svg>`,
  klok: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  chevron: `<span class="chev"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B1250" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>`,
  chevronKlein: `<span class="chev"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>`,
  pijl: (kleur = '#0B1250', maat = 18) => `<svg width="${maat}" height="${maat}" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`,
  document: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>`,
  mail: (kleur) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6 8.5 7 8.5-7"/></svg>`,
  praat: (kleur) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.5-4.3A8.5 8.5 0 1 1 20.5 11.6z"/><path d="M9 8.5c.3 2.6 2.4 5 5.5 6l1.3-1.3-2-1-.9.8a5 5 0 0 1-2.3-2.3l.8-.9-1-2z"/></svg>`,
  pand: (kleur) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2m2 0h2M9 11h2m2 0h2M9 15h2m2 0h2M10 21v-3h4v3"/></svg>`,
  speld: (kleur) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`,
  extern: (kleur) => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6m0-6-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>`,
  grootvink: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#0E9486" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#fff" stroke="none"/><path d="m7 12.5 3.2 3.2 6.8-7"/></svg>`,
  hamburger: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0B1250" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  kruis: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0B1250" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
};

/**
 * Het woordmerk als plaatje.
 *
 * Hier wél een `<img>` en geen tekst, anders dan op de rest van de site: het
 * merk is hier uitgeschreven in vormen, zodat het op elke breedte precies
 * hetzelfde staat en niet meebeweegt met het lettertype dat toevallig al
 * geladen is. `width` en `height` staan erbij zodat de balk niet verspringt
 * terwijl het laadt.
 */
function woordmerk({ wit = false, hoogte = 28 } = {}) {
  const breedte = Math.round((hoogte * 4445) / 1000);
  return `<img class="logo" src="/assets/woordmerk${wit ? '-wit' : ''}.svg" alt="${MERKNAAM}"`
    + ` width="${breedte}" height="${hoogte}">`;
}

/** Eén uitklapbare vraag. De samenvatting is één zin, ook op mobiel: hij gaat
 *  als FAQ-vraag mee naar zoekmachines, en twee varianten achter elkaar
 *  leveren daar een onleesbare vraag op. */
function vraag(v, antwoorden, kenmerk = '') {
  return `   <details class="q"${kenmerk ? ` id="${kenmerk}"` : ''}><summary>${veilig(v)} ${ico.chevron}</summary><div class="a">
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
  const omschrijving = 'Maak een foto of upload je UWV-brief. Wij controleren gratis of UWV al had '
    + `moeten beslissen en wat je nu kunt doen. Blijft een beslissing uit, dan kan je vergoeding oplopen tot € ${maximum}.`;

  // Contact. Wat niet is ingevuld, wordt niet getoond: liever geen knop dan
  // een knop die nergens heen gaat of naar een nummer dat geen WhatsApp heeft.
  const whatsapp = String(env.WHATSAPP_NUMMER || '').replace(/[^0-9]/g, '');
  const waLink = whatsapp ? `https://wa.me/${whatsapp}` : '';
  const email = bedrijf.email;
  const kvkLink = bedrijf.kvk
    ? `https://www.kvk.nl/zoeken/?source=all&amp;q=${encodeURIComponent(bedrijf.kvk)}`
    : '';

  // Elk kanaal op een eigen regel: `.clink` is een inline-flex, en twee naast
  // elkaar lezen als één zin ("WhatsApp info@nubeslist.nl").
  const mailLink = email
    ? `<div><a class="clink" href="mailto:${veilig(email)}">${veilig(email)}</a></div>`
    : '';
  const waRegel = waLink
    ? `<div><a class="clink" href="${waLink}" target="_blank" rel="noopener">Stel je vraag via WhatsApp</a></div>`
    : '';
  const contactRegel = waLink
    ? `<a href="${waLink}" target="_blank" rel="noopener">Stel je vraag via WhatsApp</a>${email ? ` of <a href="mailto:${veilig(email)}">mail ons</a>` : ''}`
    : (email ? `<a href="mailto:${veilig(email)}">Mail ons</a>` : '');

  // De regel onder de kop in de balk en het menu. Eén keer beschreven.
  const knopTekst = `${ico.upload()} Controleer mijn UWV-brief`;
  const onafhankelijk = `${ico.schild()} <span>NuBeslist is onafhankelijk van UWV.</span>`;

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
<meta property="og:site_name" content="NuBeslist">
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
<link rel="preload" as="image" href="/assets/uwv-brief-foto.webp" fetchpriority="high">

<style>
${lettertype()}
${CSS}</style>
</head>
<body>
<a class="skip-link" href="#main-content">Direct naar de inhoud</a>

<header id="hdr"><div class="hin">
 <a href="#top" aria-label="${MERKNAAM}, naar boven">${woordmerk()}</a>
 <nav aria-label="Op deze pagina"><a href="#hoe" data-t="hoe">Hoe het werkt</a><a href="#kosten" data-t="kosten">Wat kost het?</a><a href="#over" data-t="over">Over ${MERKNAAM}</a><a href="#vragen" data-t="vragen">Vragen</a><a href="#contact" data-t="contact">Contact</a></nav>
 <div class="slot"><a class="btn hbtn" href="#upload">${knopTekst}</a></div>
 <div class="mob"><a class="btn hbtn" href="#upload"><span class="lbl-l">Brief controleren</span><span class="lbl-s">Controleren</span></a><button class="mbtn" id="openm" aria-controls="menu-dialog" aria-haspopup="dialog" aria-label="Menu openen" aria-expanded="false">${ico.hamburger}<span>Menu</span></button></div>
</div></header>

<dialog class="sheet" id="menu-dialog" aria-label="Menu">
 <div class="top">${woordmerk({ hoogte: 25 })}<button class="mbtn" id="closem" data-close-dialog aria-label="Menu sluiten">${ico.kruis}<span>Sluit</span></button></div>
 <ul><li><a href="#hoe">Hoe het werkt ${ico.pijl()}</a></li><li><a href="#kosten">Wat kost het? ${ico.pijl()}</a></li><li><a href="#over">Over ${MERKNAAM} ${ico.pijl()}</a></li><li><a href="#vragen">Vragen ${ico.pijl()}</a></li><li><a href="#contact">Contact ${ico.pijl()}</a></li></ul>
 <a class="btn" href="#upload">${knopTekst}</a>
 <div class="indep">${onafhankelijk}</div>
</dialog>

<main id="main-content" tabindex="-1">
<!-- 1 HERO -->
<section class="hero" id="top"><div class="wrap hgrid">
 <div class="hero-heading">
  <h1>Wacht je al lang op een beslissing van UWV?</h1>
  <p class="sub">Laat het niet bij wachten.</p>
 </div>
 <div class="htext">
  <p class="lead">Maak een foto of upload je UWV-brief. Wij controleren of UWV te laat is en wat je kunt doen.</p>
  <a class="btn" id="herobtn" href="#upload">${knopTekst}</a>
  <ul class="checks"><li>${ico.vink} <span class="dt">Gratis controle</span><span class="mb">Gratis</span></li><li>${ico.vink} <span class="dt">Een foto of pdf is genoeg</span><span class="mb">Foto of pdf</span></li><li>${ico.vink} <span class="dt">Je zit nergens aan vast</span><span class="mb">Nergens aan vast</span></li></ul>
 </div>
 <div class="hind"><div class="indep">${ico.schild()} <span>Onafhankelijk van UWV.<br>Bij de gratis controle sturen we niets naar UWV.</span></div></div>
 <div class="hero-media">
  <figure class="hero-photo"><img src="/assets/uwv-brief-foto.webp" alt="Een brief op de keukentafel wordt met een telefoon gefotografeerd." width="1536" height="1024" fetchpriority="high" decoding="sync"></figure>
  <div class="result" aria-label="Voorbeeld van een briefcontrole">
   <div class="rtop"><span class="tag">Voorbeeld van je uitslag</span></div>
   <div class="letter-example">
    <div class="letter-label"><strong>Uit een voorbeeldbrief</strong><span>WIA-aanvraag</span></div>
    <blockquote>“We nemen uiterlijk op <mark>14 september</mark> een beslissing.”</blockquote>
   </div>
   <div class="example-reading"><span>De situatie in dit voorbeeld</span><strong>10 dagen later: nog geen beslissing</strong></div>
   <div class="status">${ico.klok} UWV lijkt te laat</div>
  </div>
 </div>
 <p class="hero-route"><a href="#hoe">Bekijk wat je kunt doen en wanneer een vergoeding mogelijk is <span aria-hidden="true">→</span></a></p>
</div></section>

<!-- 2 HERKENNING -->
<section class="band tint tight-b" id="herken"><div class="wrap two recognition-layout">
 <div>
  <div class="eyebrow">Herken je dit?</div>
  <h2>Weet je niet waar je aan toe bent?</h2>
  <p class="lead">UWV zegt dat het druk is. Of je wacht langer dan in je brief staat.</p>
  <div class="recognition-visual">${HERKENNING}</div>
 </div>
 <div>
  <ul class="qs"><li><span class="n">?</span>Had UWV al moeten beslissen?</li><li><span class="n">?</span>Kan ik iets doen?</li><li><span class="n">?</span>Heeft dat gevolgen voor mijn aanvraag of bezwaar?</li></ul>
  <div class="relief"><span class="ric">${ico.grootvink}</span><div><h3>Dat hoef je niet zelf uit te zoeken.</h3><p>Meerdere brieven of een nieuwe datum? Wij zoeken uit wanneer UWV uiterlijk had moeten beslissen.</p></div></div>
 </div>
</div></section>

<!-- 3 HOE HET WERKT -->
<section class="band tight-t" id="hoe"><div class="wrap">
 <h2>Wat kun je doen als UWV te laat is?</h2>
 <p class="process-context">Blijkt uit de controle dat UWV te laat is? Dan kun je officieel om een beslissing vragen. Wij kunnen dat voor je regelen.</p>
 <ol class="process-main" aria-label="Wat er na een melding gebeurt">
  <li class="send-step">
   <div class="send-visual">${MELDING}</div>
   <span class="actor">${MERKNAAM} · als jij verder wilt</span>
   <h3>Een officiële melding bij UWV</h3>
   <p>Wij stellen de melding op en sturen die voor je naar UWV.</p>
  </li>
  <li class="wait-step">
   <span class="actor uwv">UWV · na ontvangst van de melding</span>
   <div class="calendar-visual">${kalender(hersteltermijn)}</div>
   <h3 class="wait-heading"><span class="sr-only">${hersteltermijn} </span><span class="duration-note">extra om te beslissen</span></h3>
   <p>Wij houden deze termijn voor je bij.</p>
  </li>
 </ol>
 <p class="branch-title" id="outcomes-title">Daarna zijn er twee mogelijkheden</p>
 <div class="process-outcomes" role="group" aria-labelledby="outcomes-title">
  <div class="outcome">${UITKOMST_BESLISSING}<span class="outcome-label">UWV beslist binnen die ${hersteltermijn}</span><h3>Eindelijk je beslissing</h3><p>Je weet waar je aan toe bent. Ook voor ons werk betaal je dan niets.</p></div>
  <span class="outcome-or" aria-hidden="true">of</span>
  <div class="outcome money">${UITKOMST_VERGOEDING}<span class="outcome-label">UWV beslist nog niet</span><h3>Een vergoeding kan gaan lopen</h3><p>Die kan oplopen tot <strong>€ ${maximum}</strong>. Wij houden bij wanneer die begint en hoeveel die oploopt.</p></div>
 </div>
 <details class="calc"><summary>Hoe wordt de vergoeding berekend? ${ico.chevron}</summary>
  <div class="calcbody"><p>Nog geen beslissing ${hersteltermijn} na een geldige melding? Dan kan de wettelijke vergoeding dagelijks oplopen, maximaal ${maxDuur}:</p>
  <table>${tranchetabel()}</table>
  <p>Na de controle rekenen we dit voor jouw situatie uit.</p></div></details>
</div></section>

<!-- 4 GEVOLGEN -->
<section class="band loose-b" id="gevolgen"><div class="wrap">
 <div class="safety-top">
  <div class="safety-intro">
   <p class="safety-question">Heeft dit gevolgen voor je aanvraag of bezwaar?</p>
   <h2>Je aanvraag of bezwaar blijft hetzelfde.</h2>
   <p class="safe-explanation">Een melding gaat <strong>alleen over het feit dat je nog op een beslissing wacht</strong>. Wat je aanvraagt of waartegen je bezwaar maakt, verandert niet.</p>
  </div>
  <div class="safety-visual">${GERUSTSTELLING}</div>
 </div>
 <div class="safety-moments">
  <div class="safety-now"><span class="phase-label">Bij de gratis briefcontrole</span><h3>Er gaat niets naar UWV.</h3><p>Je laat eerst je brief bekijken. Je kiest daarmee nog niet voor een melding.</p></div>
  <div class="safety-next"><span class="phase-label">Alleen als jij verder wilt</span><h3>Jij kiest of wij de melding regelen.</h3><p>Eerst zie je wat wij kunnen doen en wat dat kost. Pas daarna geef je toestemming.</p></div>
 </div>
 <p class="safe-right">Is UWV te laat? Dan mag je officieel om een beslissing vragen. Voor deze melding hoef je niet naar de rechter.</p>
</div></section>

<!-- 5 OVER -->
<section class="band" id="over"><div class="wrap">
 <div class="over-grid">
  <div class="over-intro">
   <div class="eyebrow">Over ${MERKNAAM}</div>
   <h2>Je geeft ons niet zomaar een <span class="nw">UWV-brief</span></h2>
   <p class="lead">Je brief bevat persoonlijke gegevens en gaat over iets belangrijks. Daarom wil je weten wie wij zijn.</p>
  </div>
  <div class="organization" aria-labelledby="organization-title">
   <div class="organization-brand">${BRIEFMERK}<div><h3 id="organization-title">${MERKNAAM}</h3><p>Onafhankelijk van UWV en de overheid.</p></div></div>
   <p class="organization-country">${MERKNAAM} is een Nederlands bedrijf en geen onderdeel van UWV of de overheid.</p>
${bedrijf.kvk || bedrijf.postcodePlaats ? `   <dl class="org-data">${bedrijf.kvk ? `<div><dt>KvK-nummer</dt><dd>${veilig(bedrijf.kvk)}</dd></div>` : ''}${bedrijf.postcodePlaats ? `<div><dt>Vestiging</dt><dd>${veilig(bedrijf.postcodePlaats)}</dd></div>` : ''}</dl>` : ''}
${kvkLink ? `   <a class="kvklink" href="${kvkLink}" target="_blank" rel="noopener">Bekijk onze KvK-inschrijving <span aria-hidden="true">↗</span></a>` : ''}
   <div class="org-contact" id="contact">
    <h4>Je kunt ons bereiken</h4>
    <p>Een vraag of iets overleggen? Neem gerust contact op.</p>
${waRegel ? `    ${waRegel}` : ''}
${mailLink ? `    ${mailLink}` : ''}
    <p class="small">We reageren op werkdagen binnen 1 werkdag.</p>
   </div>
   <div class="org-privacy">
    <h4>Waarvoor gebruiken we je brief?</h4>
    <p>We controleren wanneer UWV uiterlijk had moeten beslissen en wat dit voor jou betekent.</p>
    <a href="/privacy" target="_blank" rel="noopener">Lees hoe we met je gegevens omgaan</a>
   </div>
  </div>
  <div class="why">
   <h3>Waarom ${MERKNAAM} er is</h3>
   <p>Wachten is al vervelend genoeg. Wij zoeken uit welke brief belangrijk is, welke datum geldt en wat je kunt doen.</p>
   <p class="strong">Wil je verder? Dan kunnen wij het vervolg regelen.</p>
  </div>
 </div>
 <div class="bridge">
  <div class="bstep"><span class="bn" aria-hidden="true">1</span><div><h3>Eerst controleren</h3><p>Je krijgt eerst een gratis, persoonlijke uitslag over je UWV-brief.</p></div></div>
  <div class="bstep"><span class="bn" aria-hidden="true">2</span><div><h3>Daarna beslis jij</h3><p>Na je uitslag zie je welke hulp mogelijk is en wat die kost. Jij kiest of je verdergaat.</p></div></div>
 </div>
</div></section>

<!-- 6 UPLOAD -->
<section class="band tint tight-t" id="upload"><div class="wrap upgrid">
 <div class="uptop">
  <h2>Laat je <span class="nw">UWV-brief</span> controleren</h2>
  <p class="lead">Wij controleren wanneer UWV uiterlijk had moeten beslissen en of die datum voorbij is.</p>
  <p class="promise">${ico.vinkje}<span>Eerst je uitslag. Daarna beslis jij.</span></p>
  <div class="upload-visual">${UPLOADBEELD}</div>
 </div>

 <div class="upload-panel" id="drop">
  <p class="upload-phase"><strong>Gratis briefcontrole</strong><span id="selection-phase">Eerst jouw brief kiezen</span></p>
  <div class="upload-body">
   <h3 id="droph">Kies je UWV-brief</h3>
   <p class="upload-instruction">De brief over wanneer UWV beslist. Je hoeft de juiste datum niet zelf uit te zoeken.</p>
   <details class="hint" id="hint"><summary>Welke brief kun je gebruiken? ${ico.chevronKlein}</summary>
    <p>Kies bijvoorbeeld de ontvangstbevestiging of een brief waarin UWV meer tijd vraagt. Meerdere pagina’s of brieven over dezelfde aanvraag of hetzelfde bezwaar mogen samen. Heb je al gemeld dat UWV te laat is? Kies die brief of e-mail dan ook.</p></details>
   <noscript><p class="upload-format">Zet JavaScript aan om je brief hier te laten controleren.</p></noscript>
   <ul class="selected-files" id="files" aria-label="Gekozen bestanden"></ul>
   <div class="file-error" id="file-error" role="alert" hidden><p>Deze bestanden hebben aandacht nodig:</p><ul id="file-errors"></ul></div>
   <p class="selection-status" id="file-status" role="status" aria-live="polite" aria-atomic="true"></p>
   <button class="btn upload-start" type="button" id="go" hidden>Controleer mijn brief</button>
   <button class="btn upload-choose" type="button" id="pick" aria-controls="file" aria-describedby="file-format file-error">
    <span id="pick-empty"><span class="desk">${ico.document} Kies een foto of pdf</span><span class="mobo">Maak een foto of kies een bestand</span></span>
    <span id="pick-more" hidden>+ Nog een brief of pagina toevoegen</span></button>
   <input id="file" type="file" accept="image/*,application/pdf,.pdf,.heic,.heif" multiple hidden>
   <p class="upload-format" id="file-format">Een foto of pdf is genoeg · tot 5 bestanden<span class="desk"> · slepen kan ook</span></p>
   <details class="later" id="later"><summary>Ik heb mijn brief nu niet bij de hand</summary>
    <p>Bewaar deze pagina en pak je brief erbij wanneer het jou uitkomt. Een foto of pdf is genoeg.</p>
    <p><a href="${CAMPAGNE_PAD}">nubeslist.nl${CAMPAGNE_PAD}</a></p></details>
  </div>
  <div class="upload-reassurance">
   <ul><li>Gratis controle</li><li>Nergens aan vast</li></ul>
   <p>Bij de gratis controle gaat niets naar UWV.</p>
   <p><a href="/privacy" target="_blank" rel="noopener">Wat gebeurt er met mijn brief?</a></p>
  </div>
 </div>
 <p class="cost-route"><a href="#kosten">Bekijk de kosten als je het vervolg laat regelen <span aria-hidden="true">→</span></a></p>
</div></section>

<!-- 7 KOSTEN EN VRAGEN -->
<section class="band" id="prijzen"><div class="wrap">
 <div class="pricing" id="kosten" aria-labelledby="price-title">
  <div class="eyebrow">Gratis controle, zelf kiezen</div>
  <h2 id="price-title">Wat kost het?</h2>
  <div class="pricing-grid">
   <div class="cost-free">${GRATIS}<h3>Je brief laten controleren</h3><strong>€ 0</strong><p>Je krijgt eerst je uitslag. Je zit nergens aan vast.</p></div>
   <div class="cost-follow">
    <p class="cost-scope">Als je ons het vervolg laat regelen</p>
    <h3>${veilig(prijs.kop)}</h3>
    <p>${prijs.intro}</p>
    <dl class="cost-summary">
     <div><dt>UWV beslist binnen ${hersteltermijn}<span>Na ontvangst van de melding.</span></dt><dd>€ 0<span>Ook voor ons werk.</span></dd></div>
     <div class="fee-row"><dt>Je ontvangt een vergoeding voor het wachten<span>Als UWV na die ${hersteltermijn} nog niet beslist.</span></dt><dd class="fee-amount">${prijs.ring ? prijsring(prijs.ring, prijs.deel) : ''}<span><span class="prijs sr-only">${veilig(prijs.ring)}</span>${prijs.ring ? ' ' : ''}${veilig(prijs.onder)}</span></dd></div>
    </dl>
    <p class="cost-payment">${prijs.betaling}</p>
    <p class="cost-none">Geen vergoeding? Dan betaal je niets.</p>
    <p class="cost-help">Je kunt de melding ook zelf doen. ${MERKNAAM} inschakelen is niet verplicht.</p>
   </div>
  </div>
 </div>

 <div class="faq" id="vragen">
  <div class="faq-heading">${VRAGEN}<div class="eyebrow">Veelgestelde vragen</div><h2>Nog iets wat je wilt weten?</h2></div>
  <div class="faq-list">
${vraag('Wat regelen jullie dan voor mij?', [
    'Is UWV te laat? Dan kunnen wij de melding opstellen en indienen, de termijn volgen en nieuwe UWV-post over je zaak beoordelen.',
    'Blijft een beslissing uit? Dan houden we bij of je een vergoeding krijgt en hoeveel.',
    'Jij hoeft dit niet zelf uit te zoeken of bij te houden.',
  ])}
${vraag('Kan ik dit ook zelf regelen?', [
    `Ja. Is UWV te laat, dan kun je zelf schriftelijk melden dat je nog wacht. ${MERKNAAM} inschakelen is niet verplicht.`,
    'Liever hulp? Dan regelen wij de melding en houden we het vervolg bij.',
  ])}
${vraag('Hoeveel tijd heeft UWV na de melding?', [
    `Na ontvangst van een geldige melding krijgt UWV nog ${hersteltermijn} om te beslissen.`,
    `Nog geen beslissing? Dan kan de wettelijke vergoeding per dag oplopen, maximaal ${maxDuur}. Wij houden dit bij.`,
    'Of UWV daardoor ook echt sneller beslist, kunnen wij niet garanderen. Wel dat de termijn gaat lopen en dat wij bijhouden wat er gebeurt.',
  ])}
${vraag('Ik heb UWV al laten weten dat ik wacht. Wat nu?', [
    'Upload ook een foto of pdf van je eerdere brief of e-mail. Wij controleren of je al een geldige melding hebt gedaan en wat je nu kunt doen.',
  ])}
${vraag('De datum in mijn brief is nog niet voorbij. Kan ik toch controleren?', [
    'Ja. We controleren welke datum geldt en of UWV te laat is.',
    'Is UWV nog niet te laat? Dan zie je vanaf wanneer dat wel zo is, op basis van je brief of brieven.',
  ])}
${vraag('Zit ik ergens aan vast na de upload?', [
    'Nee. Je krijgt alleen een gratis controle. We sturen niets naar UWV.',
    'Kun je iets doen? Dan zie je eerst wat dit voor jou betekent, wat wij kunnen regelen en wat het kost. Daarna beslis jij.',
  ])}
${vraag('Wat gebeurt er met mijn brief?', [
    'Bij een briefcontrole gebruiken we je brief om je situatie te bekijken en een persoonlijke uitslag te maken. Bij de gratis controle sturen we niets naar UWV.',
    'In onze privacyverklaring lees je welke gegevens we verwerken, waarom we dat doen, hoe lang we ze bewaren en welke rechten je hebt.',
    '<a href="/privacy" target="_blank" rel="noopener">Bekijk hoe we met je gegevens omgaan →</a>',
  ], 'gegevens')}
  </div>
 </div>

 <div class="end">
  <div class="end-visual">${MELDING}</div>
  <div class="endin">
   <h2>Je UWV-brief laten controleren?</h2>
   <p>Gratis controle. Je zit nergens aan vast.</p>
   <a class="btn" href="#upload">${knopTekst}</a>
${contactRegel ? `   <p class="alt">Nog een vraag? ${contactRegel}.</p>` : ''}
  </div>
 </div>
</div></section>
</main>

<footer><div class="fin"><div class="fgrid">
 <div class="brand">${woordmerk({ wit: true })}<p>${MERKNAAM} is een onafhankelijk Nederlands bedrijf. We zijn geen onderdeel van UWV of de overheid.</p></div>
 <div class="c-bedrijf"><h4>Bedrijfsgegevens</h4>${bedrijf.kvk ? `<div class="fi">${ico.pand('#C9D3F2')} KvK ${veilig(bedrijf.kvk)}</div>` : ''}${bedrijf.postcodePlaats ? `<div class="fi">${ico.speld('#C9D3F2')} ${veilig(bedrijf.postcodePlaats)}</div>` : ''}${kvkLink ? `<a class="flink" href="${kvkLink}" target="_blank" rel="noopener">Bekijk onze KvK-inschrijving ${ico.extern('#9CC4FF')}</a>` : ''}</div>
 <div class="c-contact"><h4>Contact</h4>${waLink ? `<a class="fi" href="${waLink}" target="_blank" rel="noopener">${ico.praat('#C9D3F2')} Stel je vraag via WhatsApp</a>` : ''}${email ? `<a class="fi" href="mailto:${veilig(email)}">${ico.mail('#C9D3F2')} ${veilig(email)}</a>` : ''}<div class="fi" style="color:#AEB7DE">We reageren op werkdagen binnen 1 werkdag.</div></div>
 <div class="c-info"><h4>Informatie</h4><ul class="fl"><li><a href="/privacy" target="_blank" rel="noopener">Privacyverklaring</a></li><li><a href="/voorwaarden" target="_blank" rel="noopener">Algemene voorwaarden</a></li><li><a href="#kosten">Kosten van onze hulp</a></li></ul></div>
</div><div class="fbar"><div>© ${jaar} ${MERKNAAM}</div><div><a href="#top">Terug naar boven ↑</a></div></div></div></footer>

<dialog class="info-dialog" id="file-preview-dialog" aria-labelledby="file-preview-title">
 <div class="dialog-head"><h2 id="file-preview-title">Je gekozen foto</h2><button class="dialog-close" type="button" data-close-dialog>Sluiten</button></div>
 <div class="dialog-body" id="file-preview-body"></div>
</dialog>

<a id="verder" href="${BESTEMMING}" hidden aria-hidden="true" tabindex="-1">Verder</a>

<script type="module" src="/assets/meting.js"></script>
<script type="module" src="/assets/toestemming.js"></script>
<!-- Telt hetzelfde bezoek zonder javascript, als controle op het script hierboven. -->
<img src="/api/tel" alt="" width="1" height="1" aria-hidden="true" style="position:absolute;width:1px;height:1px;left:-9999px;top:0">
<script type="module" src="/assets/campagne.js"></script>

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
      { naam: MERKNAAM, pad: '/' },
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
