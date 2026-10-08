/**
 * De contactpagina.
 *
 * Wie hierheen komt heeft meestal één van drie dingen: een vraag vóórdat hij
 * zijn brief uploadt, een lopende zaak waar hij iets over wil weten, of een
 * klacht. Die drie staan hier in die volgorde, met per geval de snelste weg.
 *
 * Alles wat hier staat komt uit de omgeving. Een contactpagina met een
 * verzonnen telefoonnummer of een WhatsApp-knop naar een nummer dat geen
 * WhatsApp heeft is erger dan geen contactpagina: dan belt iemand met een
 * probleem naar de leegte. Wat niet is ingevuld, wordt weggelaten - en staat
 * er helemaal niets, dan zegt de pagina dat eerlijk in plaats van een lege
 * kaart te tonen.
 */

import { organisatiegegevens, whatsappLink, whatsappLeesbaar } from './organisatie.js';
import { merklink, woordmerk, MERKNAAM } from './merk.js';
import { organisatieSchema, siteSchema, kruimelSchema, metSchema } from './seo.js';
import { KENNISLINKS } from './kennispagina.js';
import { siteBasis } from './site.js';

const SITE = siteBasis();

export const CONTACT_PAD = '/contact';

function veilig(tekst) {
  return String(tekst ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ICONEN = {
  praat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.5-4.3A8.5 8.5 0 1 1 20.5 11.6z"/><path d="M9 8.5c.3 2.6 2.4 5 5.5 6l1.3-1.3-2-1-.9.8a5 5 0 0 1-2.3-2.3l.8-.9-1-2z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6 8.5 7 8.5-7"/></svg>`,
  telefoon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3z"/></svg>`,
  dossier: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>`,
};

/** Eén manier om ons te bereiken. */
function kanaal({ icoon, kop, regel, href, actie, extern = false }) {
  const link = href
    ? `<a class="kanaal__actie" href="${href}"${extern ? ' target="_blank" rel="noopener"' : ''}>${veilig(actie)}</a>`
    : '';
  return `      <li class="kanaal">
        <span class="kanaal__icoon">${ICONEN[icoon]}</span>
        <div>
          <h3>${veilig(kop)}</h3>
          <p>${regel}</p>
          ${link}
        </div>
      </li>`;
}

/**
 * @param {object} env
 * @returns {string} de volledige html van /contact
 */
export function contactHtml(env = process.env) {
  const bedrijf = organisatiegegevens(env);
  const waLink = whatsappLink('Hoi, ik heb een vraag over mijn brief', env);
  const waNummer = whatsappLeesbaar(env);
  const titel = 'Contact opnemen met NuBeslist';
  const omschrijving = 'Een vraag over je brief, over een lopende zaak of over onze kosten? '
    + 'Zo bereik je ons, en dit zijn onze bedrijfsgegevens.';

  const kanalen = [];
  if (waLink) {
    kanalen.push(kanaal({
      icoon: 'praat',
      kop: `WhatsApp ${veilig(waNummer)}`,
      regel: 'De snelste manier. Je krijgt antwoord van een mens, geen chatbot. '
        + 'Je kunt ook een foto van je brief sturen.',
      href: waLink,
      actie: 'Stel je vraag via WhatsApp',
      extern: true,
    }));
  }
  if (bedrijf.email) {
    kanalen.push(kanaal({
      icoon: 'mail',
      kop: 'E-mail',
      regel: 'Heb je een brief of een kenmerk bij de hand? Stuur hem mee, dan kunnen wij meteen '
        + 'kijken. Zet je burgerservicenummer er niet in; dat hoeft niet en e-mail is er niet '
        + 'veilig genoeg voor.',
      href: `mailto:${veilig(bedrijf.email)}`,
      actie: bedrijf.email,
    }));
  }
  if (bedrijf.telefoon) {
    kanalen.push(kanaal({
      icoon: 'telefoon',
      kop: 'Telefoon',
      regel: 'Liever even bellen? Dat kan op werkdagen.',
      href: `tel:${String(bedrijf.telefoon).replace(/[^0-9+]/g, '')}`,
      actie: bedrijf.telefoon,
    }));
  }
  kanalen.push(kanaal({
    icoon: 'dossier',
    kop: 'Heb je al een zaak bij ons?',
    regel: 'In je eigen dossier zie je wat de stand van zaken is, welke datums er lopen en wat '
      + 'wij als laatste hebben gedaan. Vaak staat je antwoord daar al.',
    href: '/mijn',
    actie: 'Naar mijn dossier',
  }));

  const gegevens = [
    ['Naam', bedrijf.naam],
    ['Adres', [bedrijf.adres, bedrijf.postcodePlaats].filter(Boolean).join(', ')],
    ['KvK-nummer', bedrijf.kvk],
    ['E-mail', bedrijf.email],
    ['Telefoon', bedrijf.telefoon],
  ].filter(([, waarde]) => waarde);

  const url = `${SITE}${CONTACT_PAD}`;
  const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${veilig(titel)}</title>
<meta name="description" content="${veilig(omschrijving)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#ffffff">
<meta name="robots" content="index, follow">

<meta property="og:type" content="website">
<meta property="og:site_name" content="NuBeslist">
<meta property="og:locale" content="nl_NL">
<meta property="og:url" content="${url}">
<meta property="og:title" content="Contact">
<meta property="og:description" content="${veilig(omschrijving)}">
<meta property="og:image" content="${SITE}/deelkaart.png">
<meta name="twitter:card" content="summary_large_image">

<link rel="icon" href="/merk.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icoon-180.png">
<link rel="stylesheet" href="/assets/stijl.css">
<style>
  .artikel { max-width: 740px; margin: 0 auto; padding: 40px 16px 80px; }
  .artikel h2 { margin-top: 44px; }
  .inleiding { font-size: 1.08rem; color: var(--tekst-zacht); max-width: 60ch; }
  .kanalen { list-style: none; padding: 0; margin: 28px 0 0; display: grid; gap: 14px; }
  .kanaal {
    display: flex; gap: 16px; align-items: flex-start;
    padding: 20px 22px; border-radius: var(--radius);
    background: var(--vlak); border: 1px solid var(--rand); box-shadow: var(--schaduw-klein);
  }
  .kanaal__icoon {
    flex: none; width: 42px; height: 42px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    background: var(--blauw-50); color: var(--blauw-600);
  }
  .kanaal__icoon svg { width: 22px; height: 22px; }
  .kanaal h3 { margin: 0 0 4px; font-size: 1.06rem; }
  .kanaal p { margin: 0; color: var(--tekst-zacht); font-size: .96rem; }
  .kanaal__actie { display: inline-block; margin-top: 10px; font-weight: 640; }
  .tijd {
    margin: 26px 0 0; padding: 16px 20px; border-radius: var(--radius);
    background: var(--blauw-50); border: 1px solid var(--blauw-100);
  }
  .tijd p { margin: 0; }
  .gegevens { width: 100%; border-collapse: collapse; margin: 16px 0 0; font-size: .96rem; }
  .gegevens th {
    text-align: left; font-weight: 560; color: var(--tekst-zacht);
    padding: 11px 16px 11px 0; border-top: 1px solid var(--rand); white-space: nowrap;
    vertical-align: top;
  }
  .gegevens td { padding: 11px 0; border-top: 1px solid var(--rand); }
  .gegevens tr:first-child th, .gegevens tr:first-child td { border-top: 0; }
  .doe { margin: 44px 0 0; padding: 24px; border-radius: var(--radius); background: var(--blauw-50); border: 1px solid var(--blauw-100); }
  .doe p:last-of-type { margin-bottom: 18px; }
  @media (max-width: 520px) {
    .kanaal { padding: 18px; gap: 14px; }
    .gegevens, .gegevens tbody, .gegevens tr, .gegevens th, .gegevens td { display: block; width: 100%; }
    .gegevens th { border-top: 1px solid var(--rand); padding: 12px 0 0; }
    .gegevens td { border-top: 0; padding: 2px 0 12px; }
  }
</style>
</head>
<body>

<header class="balk">
  <div class="omhulsel balk__inhoud">
    ${merklink()}
    <nav id="balk-nav">
      <a class="nav-secundair" href="/hoe-werkt-het">Hoe het werkt</a>
      <a class="nav-secundair" href="/beslistermijn">Beslistermijnen</a>
      <a class="nav-secundair" href="/mijn">Mijn dossier</a>
      <a class="nav-secundair" href="/contact">Contact</a>
      <a class="knop knop--primair knop--klein" href="/aanvraag">Controleer mijn brief</a>
    </nav>
  </div>
</header>

<main class="artikel">
  <h1>Contact</h1>
  <p class="inleiding">Een vraag over een brief, over een zaak die loopt of over wat onze hulp
     kost? Stel hem gerust. Je hoeft geen klant te zijn om iets te vragen.</p>

  <ul class="kanalen">
${kanalen.join('\n')}
  </ul>

  <div class="tijd">
    <p><strong>We reageren op werkdagen binnen 1 werkdag.</strong> Is je beslistermijn bijna om
       of heb je net een brief gekregen waar een datum in staat? Zeg dat er dan bij, dan kijken
       wij er met voorrang naar.</p>
  </div>

  <h2>Een klacht of iets dat misging</h2>
  <p>Ben je niet tevreden over hoe wij je zaak hebben behandeld, laat het ons dan weten
     ${bedrijf.email ? `via <a href="mailto:${veilig(bedrijf.email)}">${veilig(bedrijf.email)}</a>` : 'via de weg hierboven'}.
     Schrijf erbij om welke zaak het gaat en wat er volgens jou fout is gegaan. Je krijgt een
     inhoudelijke reactie; komen we er samen niet uit, dan kun je je wenden tot de rechter.</p>

  <h2>Wij zijn niet UWV, DUO, de SVB of je gemeente</h2>
  <p>NuBeslist is een particuliere dienstverlener. Gaat je vraag over je aanvraag, je uitkering
     of je bezwaar zelf, dan moet je bij de instantie zijn die daarover gaat - wij kunnen daar niet
     in kijken. Gaat je vraag erover dat er <em>niet</em> wordt beslist, dan zijn wij aan zet.</p>

  <h2>Bedrijfsgegevens</h2>
${gegevens.length
    ? `  <table class="gegevens"><tbody>
${gegevens.map(([label, waarde]) => `    <tr><th scope="row">${veilig(label)}</th><td>${veilig(waarde)}</td></tr>`).join('\n')}
  </tbody></table>`
    : '  <p>Onze bedrijfsgegevens staan in de algemene voorwaarden.</p>'}

  <div class="doe">
    <p><strong>Weet je nog niet of je iets kunt doen?</strong></p>
    <p>Upload de brief waarin staat wanneer je een beslissing kon verwachten. Wij zoeken de datum
       voor je op en zeggen wat je nu kunt doen. Dat kost niets en je zit nergens aan vast.</p>
    <a class="knop knop--primair" href="/aanvraag">Controleer mijn brief</a>
  </div>
</main>

<footer class="voet">
  <div class="omhulsel">
    <div class="voet__merk">${woordmerk()}</div>
    <p>NuBeslist is een particuliere dienstverlener en geen overheidsinstantie. Wij zijn niet
       verbonden aan UWV, DUO, de SVB, een gemeente of een ander bestuursorgaan.</p>
    <ul class="voet__links">
      <li><a href="/">Startpagina</a></li>
      <li><a href="/aanvraag">Controle starten</a></li>
${KENNISLINKS.map((k) => `      <li><a href="${k.pad}">${veilig(k.naam)}</a></li>`).join('\n')}
      <li><a href="/contact">Contact</a></li>
      <li><a href="/privacy">Privacy</a></li>
      <li><a href="/voorwaarden">Voorwaarden</a></li>
    </ul>
  </div>
</footer>

<script type="module" src="/assets/meting.js"></script>
<script type="module" src="/assets/toestemming.js"></script>
<!-- Telt hetzelfde bezoek zonder javascript, als controle op het script hierboven. -->
<img src="/api/tel" alt="" width="1" height="1" aria-hidden="true" style="position:absolute;width:1px;height:1px;left:-9999px;top:0">
<script type="module" src="/assets/menu.js"></script>
</body>
</html>
`;

  return metSchema(html, [
    organisatieSchema(bedrijf),
    siteSchema(),
    kruimelSchema([
      { naam: 'NuBeslist', pad: '/' },
      { naam: 'Contact', pad: CONTACT_PAD },
    ]),
  ]);
}

/** Het bestand dat scripts/maak-paginas.mjs schrijft. */
export function contactpaginas(env = process.env) {
  return [{ bestand: 'contact.html', pad: CONTACT_PAD, html: contactHtml(env) }];
}
