/**
 * De kennispagina's.
 *
 * Dit zijn geen campagnepagina's. Een campagnepagina spreekt iemand aan die
 * al weet dat hij wacht; deze pagina's beantwoorden een vraag die iemand
 * intypt voordat hij weet dat wij bestaan. Dat is ander verkeer, en het is de
 * grootste ontbrekende groep: wie "ingebrekestelling" of "hoelang mag UWV
 * erover doen" zoekt, kwam nergens bij ons uit.
 *
 * Twee regels waar deze pagina's zich aan houden.
 *
 * **De inhoud komt uit de rekenmodule, niet uit de tekst.** De bedragen, de
 * termijnen per zaaktype en de uitsluitingen staan in `dwangsom.js` en
 * `catalogus.js`. Die worden hier gelezen. Een uitlegpagina die € 1.442
 * noemt terwijl de rekenmodule iets anders doet, is erger dan geen
 * uitlegpagina: hij wekt vertrouwen dat hij niet waarmaakt.
 *
 * **Ze beantwoorden de vraag ook als je onze dienst niet afneemt.** Een
 * pagina die de vraag half beantwoordt om je naar een formulier te duwen,
 * wordt door bezoekers én door Google herkend. De knop staat er, maar onderaan.
 */

import { TARIEF, UITKOMST } from '../public/shared/dwangsom.js';
import { ZAAKTYPEN, BESTUURSORGANEN, labelBestuursorgaan } from '../public/shared/catalogus.js';
import { organisatiegegevens } from './organisatie.js';
import { organisatieSchema, siteSchema, faqSchema, kruimelSchema, metSchema } from './seo.js';

const SITE = 'https://nubeslist.nl';

function veilig(tekst) {
  return String(tekst ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const duizend = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** 56 -> "acht weken". Leesbaarder dan "56 dagen" in een lopende zin. */
function inWeken(dagen) {
  const weken = dagen / 7;
  const woorden = ['nul', 'een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht',
    'negen', 'tien', 'elf', 'twaalf'];
  if (Number.isInteger(weken) && weken < woorden.length) return `${woorden[weken]} weken`;
  return `${dagen} dagen`;
}

const MERKTEKEN = `<svg class="merk__teken" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <defs><linearGradient id="merkverloop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#3b7ad4"/><stop offset="1" stop-color="#1c3a6e"/>
        </linearGradient></defs>
        <rect width="64" height="64" rx="16" fill="url(#merkverloop)"/>
        <path d="M40.8 19.4A18 18 0 1 0 50 33.5" fill="none" stroke="#fff" stroke-width="4.2"
              stroke-linecap="round" opacity=".48"/>
        <path d="M22.5 33.2 30.8 41.5 51 18.5" fill="none" stroke="#fff" stroke-width="6.2"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

/**
 * De vaste voetregel met de kennislinks erin.
 *
 * Deze links staan op élke pagina, ook op de campagnepagina's. Dat is niet
 * alleen service aan de bezoeker: interne links zijn hoe een zoekmachine een
 * nieuwe pagina vindt en hoe hij inschat waar die pagina over gaat.
 */
export const KENNISLINKS = [
  { pad: '/hoe-werkt-het', naam: 'Hoe de regeling werkt' },
  { pad: '/ingebrekestelling', naam: 'Wat is een ingebrekestelling?' },
  { pad: '/beslistermijn', naam: 'Hoelang mag een instantie erover doen?' },
  { pad: '/dwangsom-berekenen', naam: 'Hoe wordt de dwangsom berekend?' },
];

/** Eén uitklapbare vraag. */
function vraag(v, regels) {
  return `      <details class="vraag">
        <summary>${veilig(v)}</summary>
${regels.map((r) => `        <p>${r}</p>`).join('\n')}
      </details>`;
}

/** De gedeelde schil: kop, balk, voet. Gelijk aan hoe-werkt-het.html. */
function schil({ pad, titel, omschrijving, h1, wetnoot, lijf, kruimels }) {
  const url = `${SITE}${pad}`;
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${veilig(titel)}</title>
<meta name="description" content="${veilig(omschrijving)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#ffffff">
<meta name="robots" content="index, follow">

<meta property="og:type" content="article">
<meta property="og:site_name" content="nubeslist.nl">
<meta property="og:locale" content="nl_NL">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${veilig(h1)}">
<meta property="og:description" content="${veilig(omschrijving)}">
<meta property="og:image" content="${SITE}/deelkaart.png">
<meta name="twitter:card" content="summary_large_image">

<link rel="icon" href="/merk.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icoon-180.png">
<link rel="stylesheet" href="/assets/stijl.css">
<style>
  .artikel { max-width: 740px; margin: 0 auto; padding: 40px 16px 80px; }
  .artikel h2 { margin-top: 42px; }
  .artikel h3 { margin-top: 26px; font-size: 1.05rem; }
  .artikel p, .artikel li { color: var(--tekst); }
  .artikel ul, .artikel ol { padding-left: 22px; }
  .artikel li { margin-bottom: 8px; }
  .wetnoot { font-size: .86rem; color: var(--tekst-zacht); }
  .kader {
    padding: 18px 20px; margin: 24px 0; border-radius: var(--radius);
    background: var(--blauw-50); border: 1px solid var(--blauw-100);
  }
  .kader p:last-child { margin-bottom: 0; }
  .kader--let-op { background: var(--oranje-50); border-color: var(--oranje-100); }
  .tabel { width: 100%; border-collapse: collapse; margin: 22px 0; font-size: .94rem; }
  .tabel th {
    text-align: left; font-size: .76rem; text-transform: uppercase; letter-spacing: .06em;
    color: var(--tekst-zacht); padding: 0 10px 9px 0; border-bottom: 1px solid var(--rand);
  }
  .tabel td { padding: 10px 10px 10px 0; border-top: 1px solid var(--rand); vertical-align: top; }
  .tabel td:last-child, .tabel th:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .tabel tbody tr:first-child td { border-top: 0; }
  .vraag { border: 1px solid var(--rand); border-radius: var(--radius); margin-bottom: 9px; background: var(--vlak); }
  .vraag summary { cursor: pointer; padding: 14px 18px; font-weight: 700; }
  .vraag p { padding: 0 18px; margin: 0 0 14px; color: var(--tekst-zacht); }
  .verder { margin: 34px 0 0; padding: 20px; border-radius: var(--radius); border: 1px solid var(--rand); }
  .verder ul { list-style: none; padding: 0; margin: 10px 0 0; }
  .verder li { margin-bottom: 7px; }
  .doe { margin: 34px 0 0; padding: 24px; border-radius: var(--radius); background: var(--blauw-50); border: 1px solid var(--blauw-100); }
  .doe p:last-of-type { margin-bottom: 18px; }
  /*
    Een tabel met vier kolommen past niet op een telefoon. De kolom "Duur"
    staat al in de periode ("dag 1 tot en met 14"), dus die kan als eerste
    weg. Onder 420px valt ook de optelkolom weg; het maximum staat in de zin
    onder de tabel, dus er gaat geen informatie verloren.
  */
  @media (max-width: 560px) {
    .tabel { font-size: .88rem; }
    .tabel th:nth-child(2), .tabel td:nth-child(2) { display: none; }
  }
  @media (max-width: 420px) {
    .tabel--vier th:nth-child(4), .tabel--vier td:nth-child(4) { display: none; }
  }
</style>
</head>
<body>

<header class="balk">
  <div class="omhulsel balk__inhoud">
    <a class="merk" href="/" aria-label="nubeslist.nl, naar de startpagina">
      ${MERKTEKEN}
      <span class="merk__naam">nubeslist<span class="merk__punt">.nl</span></span>
    </a>
    <nav id="balk-nav">
      <a class="nav-secundair" href="/hoe-werkt-het">Hoe het werkt</a>
      <a class="nav-secundair" href="/beslistermijn">Beslistermijnen</a>
      <a class="nav-secundair" href="/mijn">Mijn dossier</a>
      <a class="knop knop--primair knop--klein" href="/aanvraag">Controleer mijn brief</a>
    </nav>
  </div>
</header>

<main class="artikel">
  <h1>${h1}</h1>
  <p class="wetnoot">${wetnoot}</p>
${lijf}

  <div class="doe">
    <p><strong>Wil je weten of dit voor jouw zaak geldt?</strong></p>
    <p>Upload de brief waarin staat wanneer je een beslissing kon verwachten. Wij zoeken de
       datum voor je op en zeggen wat je nu kunt doen. Dat kost niets en je zit nergens aan vast.</p>
    <a class="knop knop--primair" href="/aanvraag">Controleer mijn brief</a>
  </div>

  <div class="verder">
    <strong>Verder lezen</strong>
    <ul>
${KENNISLINKS.filter((k) => k.pad !== pad).map((k) => `      <li><a href="${k.pad}">${veilig(k.naam)}</a></li>`).join('\n')}
    </ul>
  </div>
</main>

<footer class="voet">
  <div class="omhulsel">
    <div class="voet__merk">${MERKTEKEN}<span>nubeslist.nl</span></div>
    <p>nubeslist.nl is een particuliere dienstverlener en geen overheidsinstantie. Wij zijn niet
       verbonden aan UWV, DUO, de SVB, een gemeente of een ander bestuursorgaan.</p>
    <p>Deze pagina is algemene uitleg en geen juridisch advies. Aan de inhoud kunnen geen rechten
       worden ontleend.</p>
    <ul class="voet__links">
      <li><a href="/">Startpagina</a></li>
      <li><a href="/aanvraag">Controle starten</a></li>
${KENNISLINKS.map((k) => `      <li><a href="${k.pad}">${veilig(k.naam)}</a></li>`).join('\n')}
      <li><a href="/privacy">Privacy</a></li>
      <li><a href="/voorwaarden">Voorwaarden</a></li>
    </ul>
  </div>
</footer>

<script type="module" src="/assets/menu.js"></script>
</body>
</html>
`;
}

/** Bouwt een pagina en hangt er de gestructureerde gegevens aan. */
function maak(opties, env) {
  const html = schil(opties);
  const url = `${SITE}${opties.pad}`;
  return metSchema(html, [
    organisatieSchema(organisatiegegevens(env)),
    siteSchema(),
    faqSchema(html, url),
    kruimelSchema([{ naam: 'nubeslist.nl', pad: '/' }, { naam: opties.kruimel, pad: opties.pad }]),
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      '@id': `${url}#artikel`,
      headline: opties.h1,
      description: opties.omschrijving,
      inLanguage: 'nl-NL',
      isAccessibleForFree: true,
      publisher: { '@id': `${SITE}/#organisatie` },
      mainEntityOfPage: url,
    },
  ]);
}

// ------------------------------------------------------- ingebrekestelling ---

function ingebrekestelling(env) {
  const lijf = `
  <p>Een <strong>ingebrekestelling</strong> is een brief waarin je een bestuursorgaan laat weten
     dat de beslistermijn voorbij is en dat je alsnog een besluit wilt. Het is geen klacht en geen
     bezwaar: je zegt niet dat het besluit verkeerd is, je zegt dat er nog geen besluit is.</p>

  <p>Die brief is bovendien een voorwaarde. <strong>Zonder ingebrekestelling ontstaat er nooit een
     dwangsom</strong>, hoe lang je ook wacht. Dat is precies waar de meeste mensen op vastlopen:
     ze wachten maanden, bellen een paar keer, en beginnen pas te tellen vanaf het moment dat ze
     eindelijk die brief sturen.</p>

  <h2>Wanneer kun je in gebreke stellen?</h2>
  <p>Als de beslistermijn voorbij is. Niet eerder. Een ingebrekestelling die te vroeg wordt
     verstuurd telt niet mee en je moet hem dan opnieuw sturen.</p>
  <p>Welke termijn voor jouw zaak geldt, staat meestal in de ontvangstbevestiging van je aanvraag.
     Staat er geen datum in, dan geldt de wettelijke termijn voor dat soort aanvraag. Op
     <a href="/beslistermijn">de pagina over beslistermijnen</a> staat een overzicht per soort zaak.</p>

  <h2>Wat gebeurt er nadat je hem verstuurt?</h2>
  <ol>
    <li>Het bestuursorgaan krijgt <strong>twee weken</strong> om alsnog te beslissen.</li>
    <li>Komt er binnen die twee weken een besluit, dan is de zaak klaar en is er geen dwangsom.</li>
    <li>Komt er niets, dan gaat vanaf de dag daarna een dwangsom lopen, voor elke dag dat het
        besluit uitblijft, tot maximaal ${TARIEF.maxDagen} dagen.</li>
  </ol>
  <p class="wetnoot">Die twee weken staan in artikel 4:17 lid 3 van de Algemene wet bestuursrecht.</p>

  <h2>Wat moet erin staan?</h2>
  <p>De wet stelt geen vormvereisten, maar een bruikbare ingebrekestelling bevat in elk geval:</p>
  <ul>
    <li>je naam, adres en het kenmerk of zaaknummer;</li>
    <li>om welke aanvraag of welk bezwaar het gaat, en wanneer je die hebt ingediend;</li>
    <li>dat de beslistermijn is verstreken, met de datum erbij;</li>
    <li>dat je het bestuursorgaan <strong>in gebreke stelt</strong> en alsnog een besluit vraagt;</li>
    <li>dat je aanspraak maakt op een dwangsom als er niet binnen twee weken wordt beslist.</li>
  </ul>
  <div class="kader">
    <p><strong>Het woord zelf maakt uit.</strong> Een e-mail met "wanneer hoor ik nu eindelijk
       iets?" is begrijpelijk, maar het is geen ingebrekestelling. Zet er met zoveel woorden in dat
       je het bestuursorgaan in gebreke stelt.</p>
  </div>

  <h2>Kan dit gevolgen hebben voor je aanvraag of bezwaar?</h2>
  <p>De ingebrekestelling gaat over het <strong>uitblijven van een beslissing</strong> en niet over
     de inhoud van je zaak. Loopt er een bezwaar, dan blijft dat bezwaar gewoon inhoudelijk
     behandeld worden.</p>
  <p>Het is wel een formele stap, en daarmee een stap die vastligt. Twijfel je of hij in jouw
     situatie verstandig is, leg hem dan eerst voor aan een jurist of het Juridisch Loket.</p>

  <h2>Wanneer levert het geen dwangsom op?</h2>
  <p>In een aantal gevallen is de regeling uitgesloten. De belangrijkste:</p>
  <ul>
    <li><strong>Woo-verzoeken.</strong> Sinds 1 mei 2022 geldt de dwangsomregeling niet voor
        verzoeken op grond van de Wet open overheid. Beroep bij de rechtbank wegens niet tijdig
        beslissen kan wel.</li>
    <li><strong>Asielaanvragen.</strong> Ook daar is de dwangsom uitgeschakeld; de route loopt via
        de rechtbank.</li>
    <li><strong>Geen belanghebbende.</strong> Alleen de aanvrager of een belanghebbende kan
        aanspraak maken (art. 4:17 lid 6 sub b Awb).</li>
    <li><strong>De aanvraag is buiten behandeling gesteld.</strong> Zo'n besluit is ook een besluit;
        daarmee is op tijd beslist. Tegen dat besluit kun je wel bezwaar maken.</li>
    <li><strong>Onredelijk laat in gebreke gesteld.</strong> Wie jaren wacht en dan pas een brief
        stuurt, kan die aanspraak verliezen.</li>
  </ul>

  <h2>Veelgestelde vragen</h2>
${vraag('Moet een ingebrekestelling per post of mag het per e-mail?', [
    'Dat hangt van het bestuursorgaan af. Veel instanties accepteren digitale post alleen via een '
    + 'eigen formulier of berichtenbox, en een e-mail aan een algemeen adres telt dan niet.',
    'Kies je toch voor e-mail, vraag dan om een ontvangstbevestiging. Je moet later kunnen aantonen '
    + 'wanneer de brief is aangekomen, want vanaf dat moment gaan de twee weken lopen.',
  ])}
${vraag('Ik heb al een keer gebeld of gemaild. Telt dat ook?', [
    'Meestal niet. Een telefoontje laat geen spoor na, en een vraag naar de stand van zaken is iets '
    + 'anders dan een ingebrekestelling.',
    'Heb je wel iets schriftelijk gestuurd, bewaar dat dan. Soms is zo\'n bericht alsnog als '
    + 'ingebrekestelling aan te merken, en dan tellen de twee weken vanaf dat moment.',
  ])}
${vraag('Moet ik een bepaald formulier gebruiken?', [
    'Nee, de wet schrijft geen formulier voor. Sommige instanties bieden er een aan, en dat is '
    + 'vaak de makkelijkste weg omdat je dan zeker weet dat de brief op de juiste plek aankomt.',
  ])}
${vraag('Hoeveel kan het opleveren?', [
    `De eerste ${TARIEF.tranches[0].dagen} dagen &euro; ${TARIEF.tranches[0].perDag} per dag, de `
    + `volgende ${TARIEF.tranches[1].dagen} dagen &euro; ${TARIEF.tranches[1].perDag} en de laatste `
    + `${TARIEF.tranches[2].dagen} dagen &euro; ${TARIEF.tranches[2].perDag}. Na ${TARIEF.maxDagen} `
    + `dagen stopt de teller op &euro; ${duizend(TARIEF.maxBedrag)}.`,
    'Op <a href="/dwangsom-berekenen">de rekenpagina</a> staat het per dag uitgewerkt.',
  ])}
${vraag('Moet het bestuursorgaan de dwangsom zelf vaststellen?', [
    'Ja. Het bestuursorgaan stelt de hoogte binnen twee weken na de laatste dag vast bij '
    + 'beschikking (art. 4:18 Awb). Gebeurt dat niet, dan kun je daarom vragen.',
    'Het bedrag wordt rechtstreeks aan jou uitbetaald.',
  ])}
`;
  return maak({
    pad: '/ingebrekestelling',
    kruimel: 'Ingebrekestelling',
    titel: 'Ingebrekestelling: wat is het en wanneer stuur je er een?',
    omschrijving: 'Een ingebrekestelling laat een instantie weten dat de beslistermijn voorbij is. '
      + 'Wat erin moet staan, wanneer je hem stuurt en wat er daarna gebeurt.',
    h1: 'Wat is een ingebrekestelling?',
    wetnoot: 'Wettelijk kader: Algemene wet bestuursrecht, artikel 4:17. Deze regeling is landelijk '
      + 'en geldt hetzelfde voor UWV, gemeenten, DUO, de SVB en andere bestuursorganen.',
    lijf,
  }, env);
}

// ------------------------------------------------------------ beslistermijn ---

function beslistermijn(env) {
  // De tabel komt uit de catalogus, dezelfde bron als de rekenmodule. Zou hij
  // hier met de hand staan, dan zou de uitlegpagina binnen een paar maanden
  // iets anders zeggen dan de uitslag die de bezoeker krijgt.
  const perOrgaan = BESTUURSORGANEN
    .filter((b) => b.id !== 'anders')
    .map((b) => ({
      orgaan: b,
      zaken: ZAAKTYPEN.filter((z) => z.bestuursorgaan === b.id),
    }))
    .filter((r) => r.zaken.length > 0);

  // De catalogus noemt dit veld `label`, niet `naam`. Stond hier eerder
  // `orgaan.naam`, en dat leverde vijf lege koppen op zonder dat er iets
  // stukging - de tabellen stonden dan naamloos onder elkaar.
  const tabellen = perOrgaan.map(({ orgaan, zaken }) => `
  <h3>${veilig(orgaan.label)}</h3>
  <table class="tabel">
    <thead><tr><th>Soort aanvraag</th><th>Grondslag</th><th>Termijn</th></tr></thead>
    <tbody>
${zaken.map((z) => `      <tr><td>${veilig(z.label)}</td><td class="wetnoot">${veilig(z.grondslag)}</td><td>${inWeken(z.termijnDagen)}</td></tr>`).join('\n')}
    </tbody>
  </table>`).join('\n');

  const lijf = `
  <p>Een bestuursorgaan moet binnen een <strong>redelijke termijn</strong> beslissen. Wat redelijk
     is, staat soms met zoveel woorden in de wet; in de overige gevallen geldt een termijn van
     <strong>acht weken</strong> na ontvangst van je aanvraag.</p>
  <p class="wetnoot">Artikel 4:13 van de Algemene wet bestuursrecht.</p>

  <div class="kader">
    <p><strong>De datum in je eigen brief gaat voor.</strong> Staat er in de ontvangstbevestiging
       een datum waarop je een beslissing kunt verwachten, dan telt die datum. Daar hoef je geen
       wetsartikel voor op te zoeken.</p>
  </div>

  <h2>Twee dingen die de termijn verschuiven</h2>
  <h3>Verdaging</h3>
  <p>Een bestuursorgaan mag de termijn eenmalig verlengen, mits het dat vóór het einde van de
     termijn laat weten en er een nieuwe datum bij noemt. Krijg je zo'n brief, dan geldt die
     nieuwe datum.</p>
  <h3>Opschorting</h3>
  <p>Vraagt het bestuursorgaan aanvullende gegevens, dan staat de klok stil tussen de dag van het
     verzoek en de dag waarop jij die gegevens aanlevert. Die dagen tellen dus niet mee.</p>
  <p class="wetnoot">Verdaging: artikel 4:14 Awb. Opschorting: artikel 4:15 Awb.</p>

  <h2>Termijnen per soort aanvraag</h2>
  <p>Dit is de termijn die geldt als er geen datum in je brief staat. Bij een bezwaar loopt de
     termijn niet vanaf je bezwaarschrift maar vanaf het einde van de bezwaartermijn.</p>
${tabellen}

  <h2>Veelgestelde vragen</h2>
${vraag('Hoelang mag UWV over een WIA-aanvraag doen?', [
    'In de wet staat voor de WIA geen eigen termijn, dus geldt de restnorm van acht weken uit '
    + 'artikel 4:13 lid 2 Awb.',
    'In de praktijk noemt UWV in de ontvangstbevestiging vaak een eigen datum, en die datum telt. '
    + 'Staat er een langere termijn in dan acht weken, dan is dat de termijn waar je van uitgaat.',
  ])}
${vraag('Hoelang mag de gemeente over een bijstandsaanvraag doen?', [
    'Ook hier geldt de termijn van acht weken, tenzij er een datum in je brief staat.',
    'Heb je op dit moment geen geld om van te leven, dan kun je bij de gemeente om een voorschot '
    + 'vragen. Dat staat los van de beslistermijn en van een eventuele dwangsom.',
  ])}
${vraag('Hoelang mag een instantie over een bezwaar doen?', [
    'Zes weken, gerekend vanaf het einde van de bezwaartermijn. Is er een adviescommissie bij '
    + 'betrokken, dan is het twaalf weken.',
    'Verdaging met maximaal zes weken is mogelijk; daarna alleen nog met jouw instemming.',
    'Dit staat in artikel 7:10 Awb.',
  ])}
${vraag('De termijn is verstreken. Wat nu?', [
    'Dan kun je het bestuursorgaan in gebreke stellen. Vanaf dat moment heeft het nog twee weken '
    + 'om alsnog te beslissen, en pas daarna kan er een dwangsom gaan lopen.',
    'Op <a href="/ingebrekestelling">de pagina over de ingebrekestelling</a> staat wat er in die '
    + 'brief hoort.',
  ])}
${vraag('Mijn termijn is nog niet voorbij. Kan ik nu al iets doen?', [
    'Een ingebrekestelling die te vroeg wordt verstuurd telt niet mee, dus wachten is hier het '
    + 'juiste antwoord.',
    'Wel kun je de datum laten vastleggen, zodat je er niet zelf aan hoeft te denken. Wij houden '
    + 'hem dan bij en laten van ons horen zodra hij voorbij is.',
  ])}
`;
  return maak({
    pad: '/beslistermijn',
    kruimel: 'Beslistermijnen',
    titel: 'Beslistermijn: hoelang mag een instantie over je aanvraag doen?',
    omschrijving: 'De wettelijke beslistermijnen per soort aanvraag bij UWV, gemeente, DUO, SVB en '
      + 'Belastingdienst, plus wat verdaging en opschorting met die termijn doen.',
    h1: 'Hoelang mag een instantie over een beslissing doen?',
    wetnoot: 'Wettelijk kader: Algemene wet bestuursrecht, artikelen 4:13 tot en met 4:15 en 7:10. '
      + 'De termijnen hieronder komen uit dezelfde tabel die onze rekenmodule gebruikt.',
    lijf,
  }, env);
}

// -------------------------------------------------------- dwangsom berekenen ---

function dwangsomBerekenen(env) {
  let loper = 0;
  const rijen = TARIEF.tranches.map((tr, i) => {
    const van = loper + 1;
    loper += tr.dagen;
    const totaalTot = TARIEF.tranches.slice(0, i + 1)
      .reduce((som, t) => som + t.dagen * t.perDag, 0);
    return `      <tr><td>Dag ${van} tot en met ${loper}</td><td>${tr.dagen} dagen</td>`
      + `<td>&euro; ${tr.perDag} per dag</td><td>&euro; ${duizend(totaalTot)}</td></tr>`;
  }).join('\n');

  const lijf = `
  <p>De dwangsom is een vast bedrag per dag dat oploopt naarmate het langer duurt. Je hoeft er
     niets voor aan te tonen: als aan de voorwaarden is voldaan, ontstaat hij van rechtswege.</p>

  <h2>Waar begint de teller?</h2>
  <p>Niet op de dag dat de beslistermijn verstrijkt. De teller begint <strong>twee weken nadat je
     het bestuursorgaan in gebreke hebt gesteld</strong>, en alleen als er dan nog steeds geen
     besluit is.</p>
  <p>In de praktijk betekent dat drie momenten achter elkaar:</p>
  <ol>
    <li>de beslistermijn verstrijkt;</li>
    <li>je stelt in gebreke &mdash; vanaf dat moment lopen twee weken;</li>
    <li>is er daarna nog geen besluit, dan telt vanaf de dag erna elke dag mee.</li>
  </ol>

  <h2>De bedragen per dag</h2>
  <table class="tabel tabel--vier">
    <thead><tr><th>Periode</th><th>Duur</th><th>Per dag</th><th>Totaal tot dan</th></tr></thead>
    <tbody>
${rijen}
    </tbody>
  </table>
  <p>Na ${TARIEF.maxDagen} dagen stopt de teller. Het maximum is daarmee
     <strong>&euro; ${duizend(TARIEF.maxBedrag)}</strong>, ook als het besluit daarna nog maanden
     uitblijft.</p>
  <p class="wetnoot">${veilig(TARIEF.grondslag)} van de Algemene wet bestuursrecht.</p>

  <div class="kader">
    <p><strong>Alle dagen tellen mee</strong>, ook weekenden en feestdagen. Het gaat om kalenderdagen.</p>
  </div>

  <h2>Een voorbeeld</h2>
  <p>Stel: de beslistermijn verliep op 1 maart. Je stelt op 8 maart in gebreke. Dan heeft het
     bestuursorgaan tot en met 22 maart om te beslissen. Komt er op 15 april nog steeds niets, dan
     zijn er vanaf 23 maart 24 dagen verstreken:</p>
  <ul>
    <li>14 dagen &times; &euro; ${TARIEF.tranches[0].perDag} = &euro; ${TARIEF.tranches[0].dagen * TARIEF.tranches[0].perDag}</li>
    <li>10 dagen &times; &euro; ${TARIEF.tranches[1].perDag} = &euro; ${10 * TARIEF.tranches[1].perDag}</li>
    <li>samen <strong>&euro; ${TARIEF.tranches[0].dagen * TARIEF.tranches[0].perDag + 10 * TARIEF.tranches[1].perDag}</strong></li>
  </ul>
  <p>Komt het besluit pas na ${TARIEF.maxDagen} dagen, dan is het het maximum van
     &euro; ${duizend(TARIEF.maxBedrag)}.</p>

  <h2>Veelgestelde vragen</h2>
${vraag('Moet ik de dwangsom zelf uitrekenen en opvragen?', [
    'Het bestuursorgaan moet de hoogte binnen twee weken na de laatste dag zelf vaststellen bij '
    + 'beschikking (art. 4:18 Awb). Gebeurt dat niet, dan kun je erom vragen.',
    'Ben je het niet eens met het vastgestelde bedrag, dan kun je daartegen bezwaar maken.',
  ])}
${vraag('Krijg ik het geld zelf, of gaat het naar de instantie?', [
    'Een toegekende dwangsom wordt rechtstreeks aan jou uitbetaald, op je eigen rekening.',
  ])}
${vraag('Loopt de dwangsom door als ik intussen een besluit krijg?', [
    'Nee. De teller stopt op de dag dat het besluit er is. De dagen daarvoor blijven wel staan.',
  ])}
${vraag('Tellen weekenden en feestdagen mee?', [
    'Ja. Het gaat om kalenderdagen, niet om werkdagen.',
  ])}
${vraag('Is de dwangsom belast?', [
    'Of een dwangsom in jouw situatie fiscale gevolgen heeft, hangt van je omstandigheden af. '
    + 'Dat is een vraag voor de Belastingdienst of een fiscalist; wij kunnen daar geen uitsluitsel '
    + 'over geven.',
  ])}
`;
  return maak({
    pad: '/dwangsom-berekenen',
    kruimel: 'Dwangsom berekenen',
    titel: `Dwangsom berekenen: van &euro; 23 per dag tot &euro; ${duizend(TARIEF.maxBedrag)}`,
    omschrijving: 'Hoe de dwangsom bij niet tijdig beslissen wordt berekend: wanneer de teller '
      + `begint, de bedragen per dag en waarom hij na ${TARIEF.maxDagen} dagen stopt.`,
    h1: 'Hoe wordt de dwangsom berekend?',
    wetnoot: `Wettelijk kader: ${TARIEF.grondslag} van de Algemene wet bestuursrecht. De bedragen `
      + 'hieronder komen uit dezelfde tabel die onze rekenmodule gebruikt.',
    lijf,
  }, env);
}

/** Alle kennispagina's, als {bestand, pad, html}. */
export function kennispaginas(env = process.env) {
  return [
    { pad: '/ingebrekestelling', bestand: 'ingebrekestelling.html', html: ingebrekestelling(env) },
    { pad: '/beslistermijn', bestand: 'beslistermijn.html', html: beslistermijn(env) },
    { pad: '/dwangsom-berekenen', bestand: 'dwangsom-berekenen.html', html: dwangsomBerekenen(env) },
  ];
}
