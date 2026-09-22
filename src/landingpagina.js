/**
 * De landingspagina, als één template voor alle ingangen.
 *
 * De volgorde volgt de psychologie van de bezoeker, niet de indeling van een
 * brochure:
 *
 *   herkenning -> wat er mogelijk is -> wat het kan opleveren -> hoe makkelijk
 *   het gaat -> wat wij daarna overnemen -> bewijs -> waarom wij -> wat het
 *   kost -> vertrouwen -> vragen -> starten.
 *
 * De pagina hoeft de bezoeker niet te overtuigen dat dwangsommen bestaan. Hij
 * moet hem overtuigen zijn brief te uploaden. Daarna doet de uitslag in de
 * funnel het overtuigen. Dat zijn twee aparte conversies en ze staan hier
 * bewust niet door elkaar.
 *
 * scripts/maak-paginas.mjs schrijft hier echte html-bestanden van, één per
 * ingang, zodat elke advertentie op een pagina landt met zijn eigen titel,
 * omschrijving en kop in de bron. public/assets/landing.js personaliseert de
 * algemene pagina daarna verder zodra de bezoeker zijn instantie aanwijst.
 */

import { ALGEMEEN, CAMPAGNES } from '../public/shared/campagnes.js';
import { labelBestuursorgaan, zoekZaaktype } from '../public/shared/catalogus.js';
import { tarief, tariefZin, tariefVoorbeeld } from '../public/shared/tarief.js';
import { organisatiegegevens } from './organisatie.js';

const SITE = 'https://nubeslist.nl';

/** Tekst veilig in html zetten. */
function veilig(tekst) {
  return String(tekst ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Het pad waarnaar de knop gaat, met de instantie al gekozen. */
function funnelPad(ingang) {
  const delen = [];
  if (ingang.instantie) delen.push(`instantie=${encodeURIComponent(ingang.instantie)}`);
  if (ingang.zaak) delen.push(`zaak=${encodeURIComponent(ingang.zaak)}`);
  return delen.length ? `/aanvraag?${delen.join('&amp;')}` : '/aanvraag';
}

const MERKTEKEN = (klasse) => `<svg class="${klasse}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <defs><linearGradient id="verloop-${klasse}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#3b7ad4"/><stop offset="1" stop-color="#1c3a6e"/>
        </linearGradient></defs>
        <rect width="64" height="64" rx="16" fill="url(#verloop-${klasse})"/>
        <path d="M40.8 19.4A18 18 0 1 0 50 33.5" fill="none" stroke="#fff" stroke-width="4.2"
              stroke-linecap="round" opacity=".48"/>
        <path d="M22.5 33.2 30.8 41.5 51 18.5" fill="none" stroke="#fff" stroke-width="6.2"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

const VINK = (kleur = 'var(--groen-600)') => `<svg viewBox="0 0 20 20" aria-hidden="true" fill="none"
        stroke="${kleur}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5 8 14.5 16 5.5"/></svg>`;

const SLOT = `<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="9" width="12" height="8" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>`;

/** De vier keuzes waarmee de bezoeker zijn eigen zaak aanwijst. */
const INSTANTIEKEUZE = [
  { id: 'uwv', label: 'UWV', onder: 'WIA, WW, Wajong, Ziektewet' },
  { id: 'gemeente', label: 'Mijn gemeente', onder: 'Bijstand, Wmo, jeugdhulp' },
  { id: 'duo', label: 'DUO', onder: 'Studiefinanciering' },
  { id: 'anders', label: 'Andere instantie', onder: 'SVB, Belastingdienst, overig' },
];

/** De ingangen per instantie, voor het blok "waar wacht je op". */
function ingangenPer(instantie) {
  return CAMPAGNES.filter((c) => c.instantie === instantie && c.zaak);
}

/** Eén regel in het overzicht "waar wacht je op". */
function ingangLink(campagne) {
  return `            <li><a href="/${campagne.slug}">${veilig(campagne.kort)}</a></li>`;
}

/** Aan het begin van een zin hoort een hoofdletter, ook bij "je gemeente". */
function metHoofdletter(tekst) {
  return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

/**
 * "UWV is te laat" klopt, "Gemeente is te laat" niet. Daarom een naam die in
 * een lopende zin past, naast de naam voor een tabelregel.
 */
function instantieInEenZin(id) {
  return { gemeente: 'je gemeente', svb: 'de SVB', belastingdienst: 'de Belastingdienst' }[id]
    || (id ? labelBestuursorgaan(id) : 'de instantie');
}

/**
 * De voorbeeldkaart in de hero hoort bij de ingang: op een bijstandspagina
 * staat er de gemeente, niet UWV. Zonder ingang nemen we het geval dat het
 * vaakst voorkomt.
 */
function voorbeeldZaak(ingang) {
  const zaaktype = ingang.zaak ? zoekZaaktype(ingang.zaak) : null;
  return {
    instantie: ingang.instantie ? instantieInEenZin(ingang.instantie) : 'UWV',
    naam: ingang.instantie ? labelBestuursorgaan(ingang.instantie) : 'UWV',
    procedure: zaaktype ? zaaktype.label : (ingang.instantie ? 'je aanvraag' : 'WIA-aanvraag'),
    datum: '4 september',
  };
}

/**
 * De hero-actie. Op een campagnepagina weten we de instantie al uit de
 * advertentie, dus dan meteen doorpakken. Op de algemene pagina vragen we het,
 * en dat is niet zomaar een menu: vanaf die klik verandert de rest van de
 * pagina mee (zie public/assets/landing.js).
 */
function heroKeuze(ingang) {
  if (ingang.instantie) {
    return `        <div class="hero__knoppen">
          <a class="knop knop--primair knop--groot" href="${funnelPad(ingang)}">${veilig(ingang.knop)}</a>
          <a class="knop knop--zacht" href="#werkwijze">Eerst lezen hoe het werkt</a>
        </div>
        <p class="hero__anders">Wacht je op iets anders? <a href="/">Begin dan hier</a>.</p>`;
  }
  return `        <div class="keuzekaarten" id="instantiekeuze">
          <p class="keuzekaarten__vraag">Op wie wacht je?</p>
          <div class="keuzekaarten__rij" role="group" aria-label="Op wie wacht je?">
${INSTANTIEKEUZE.map((k) => `            <button type="button" class="keuzekaart" data-instantie="${k.id}">
              <span class="keuzekaart__naam">${veilig(k.label)}</span>
              <span class="keuzekaart__onder">${veilig(k.onder)}</span>
            </button>`).join('\n')}
          </div>
          <div class="keuzekaarten__vervolg verborgen" id="procedurekeuze"></div>
          <!--
            De volgende stap hoort te verschijnen waar de vinger is. Zonder dit
            veranderde er wel van alles op de pagina, maar allemaal boven de
            vouw: je klikte en er leek niets te gebeuren.
          -->
          <div class="keuzeactie verborgen" id="keuzeactie"></div>
          <p class="keuzekaarten__over">Weet je het niet zeker?
            <a href="/aanvraag">Upload je brief, dan zoeken wij het uit</a>.</p>
        </div>`;
}

/**
 * @param {object} ingang een record uit public/shared/campagnes.js
 * @param {object} env omgevingsvariabelen, voor het tarief en de bedrijfsgegevens
 * @returns {string} de volledige html van die landingspagina
 */
export function landingHtml(ingang, env = process.env) {
  const url = ingang.slug ? `${SITE}/${ingang.slug}` : `${SITE}/`;
  const pad = funnelPad(ingang);
  const voorbeeld = voorbeeldZaak(ingang);
  const naam = voorbeeld.instantie;
  const t = tarief(env);
  const bedrijf = organisatiegegevens(env);
  const bekend = Boolean(ingang.instantie);

  const uploadkop = ingang.uploadkop || `Laten we kijken of ${naam} te laat is`;

  return `<!doctype html>
<html lang="nl"${bekend ? ` data-instantie="${veilig(ingang.instantie)}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${veilig(ingang.titel)}</title>
<meta name="description" content="${veilig(ingang.omschrijving)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#ffffff">
<meta name="robots" content="index, follow">

<meta property="og:type" content="website">
<meta property="og:site_name" content="nubeslist.nl">
<meta property="og:locale" content="nl_NL">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${veilig(ingang.kop)}">
<meta property="og:description" content="${veilig(ingang.omschrijving)}">
<meta property="og:image" content="${SITE}/deelkaart.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Het merkteken van nubeslist.nl">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${veilig(ingang.kop)}">
<meta name="twitter:description" content="${veilig(ingang.omschrijving)}">
<meta name="twitter:image" content="${SITE}/deelkaart.png">

<link rel="icon" href="/merk.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icoon-180.png">
<link rel="stylesheet" href="/assets/stijl.css">
<link rel="stylesheet" href="/assets/landing.css">
</head>
<body>

<header class="balk">
  <div class="omhulsel balk__inhoud">
    <a class="merk" href="/" aria-label="nubeslist.nl, naar de startpagina">
      ${MERKTEKEN('merk__teken')}
      <span class="merk__naam">nubeslist<span class="merk__punt">.nl</span></span>
    </a>
    <nav>
      <a class="nav-secundair" href="#werkwijze">Hoe het werkt</a>
      <a class="nav-secundair" href="#kosten">Kosten</a>
      <a class="nav-secundair" href="#vragen">Vragen</a>
      <a class="knop knop--zacht knop--klein" href="/beheer">Beheer</a>
      <a class="knop knop--primair knop--klein" href="${pad}" data-cta>
        <span class="nav-lang" data-cta-tekst>${veilig(ingang.knop)}</span><span class="nav-kort">Starten</span>
      </a>
    </nav>
  </div>
</header>

<main>

  <!-- ============================================= 1. herkenning + trigger -->
  <section class="hero">
    <div class="omhulsel hero__raster">
      <div class="hero__tekst">
        <h1 data-kop>${veilig(ingang.kop)}</h1>
        <p class="hero__onder" data-onder>${veilig(ingang.onder)}</p>
        <p class="hero__lead" data-lead>${veilig(ingang.lead)}</p>
        <p class="hero__trigger">Blijft een beslissing daarna uit? Dan kan je vergoeding
           oplopen tot <strong>&euro; 1.442</strong>.</p>

${heroKeuze(ingang)}

        <ul class="waarborgen">
          <li>${VINK()}<span>Gratis eerste controle</span></li>
          <li>${VINK()}<span>Binnen 1 minuut duidelijkheid</span></li>
          <li>${VINK()}<span>Geen juridisch uitzoekwerk</span></li>
        </ul>
      </div>

      <aside class="hero__beeld" aria-label="Voorbeeld van de uitslag die je krijgt">
        <p class="hero__beeldkop">Zo kan jouw uitslag eruitzien</p>
        <div class="proefkaart">
          <div class="proefkaart__balk">
            <span class="proefkaart__stip"></span>
            <span class="proefkaart__stip"></span>
            <span class="proefkaart__stip"></span>
          </div>
          <div class="proefkaart__lijf">
            <!-- Het leesproces, zodat je ziet wat er met je brief gebeurt. -->
            <ol class="leesstappen" aria-hidden="true">
              <li class="leesstappen__bestand">${veilig(voorbeeld.naam)}-brief.pdf</li>
              <li>${VINK('#3b7ad4')} instantie gevonden</li>
              <li>${VINK('#3b7ad4')} procedure gevonden</li>
              <li>${VINK('#3b7ad4')} beslisdatum gevonden</li>
            </ol>
            <span class="chipje">Jouw uitslag</span>
            <p class="proefkaart__kop" data-proefkop>Het lijkt erop dat ${veilig(naam)} te laat is</p>
            <dl class="proefkaart__rijen">
              <div><dt>Instantie</dt><dd data-proefinstantie>${veilig(voorbeeld.naam)}</dd></div>
              <div><dt>Procedure</dt><dd data-proefprocedure>${veilig(voorbeeld.procedure)}</dd></div>
              <div><dt>Beslissen v&oacute;&oacute;r</dt><dd>${veilig(voorbeeld.datum)}</dd></div>
              <div><dt>Beslissing ontvangen</dt><dd>Nee</dd></div>
            </dl>
            <p class="proefkaart__stap">Volgende stap: melding te late beslissing</p>
          </div>
        </div>
        <p class="hero__beelduitleg">Dit zie je nadat wij je brief hebben gelezen. Je hoeft zelf
          geen datum op te zoeken en geen wet te begrijpen.</p>
      </aside>
    </div>
  </section>

  <!-- ====================================================== 2. herken je dit -->
  <section class="blok blok--papier" id="herkenning">
    <div class="omhulsel">
      <div class="sectiekop">
        <h2>Herken je dit?</h2>
      </div>
      <div class="herkenning">
        <article class="kaart herkenning__geval">
          <h3>De datum in je brief is voorbij</h3>
          <p>Maar je hebt nog steeds geen beslissing gekregen.</p>
        </article>
        <article class="kaart herkenning__geval">
          <h3>Je krijgt te horen dat je moet wachten</h3>
          <p>Maar je weet niet hoe lang dat eigenlijk mag duren.</p>
        </article>
        <article class="kaart herkenning__geval">
          <h3>Je weet niet wat je nu moet doen</h3>
          <p>Nog bellen, afwachten, of officieel actie ondernemen?</p>
        </article>
      </div>
      <div class="middenknop">
        <p class="middenknop__zin">Je hoeft dat niet zelf uit te zoeken.
           <strong>nubeslist.nl controleert het voor je.</strong></p>
        <a class="knop knop--primair knop--groot" href="${pad}" data-cta>
          <span data-cta-tekst>${veilig(ingang.knop)}</span></a>
      </div>
    </div>
  </section>

  <!-- ============================================ 3. de regeling in 20 sec -->
  <section class="blok" id="vergoeding">
    <div class="omhulsel">
      <div class="sectiekop">
        <h2>Je hoeft niet eindeloos te blijven wachten</h2>
        <p>Voor beslissingen gelden termijnen. Is die termijn verstreken, dan kan
           <span data-instantie-zin>${veilig(naam)}</span> formeel worden gemeld dat zij te laat is.
           Blijft een beslissing daarna uit, dan kan een dwangsom ontstaan.</p>
      </div>

      <!-- De hele regeling als één keten, zodat je hem in vijf seconden snapt. -->
      <ol class="keten">
        <li class="keten__stap">
          <span class="keten__merk">1</span>
          <div><strong>Beslistermijn verstreken</strong>
            <span>De datum uit je brief is voorbij.</span></div>
        </li>
        <li class="keten__stap">
          <span class="keten__merk">2</span>
          <div><strong>Wij versturen de melding</strong>
            <span>Officieel, met verzendbewijs.</span></div>
        </li>
        <li class="keten__stap">
          <span class="keten__merk">3</span>
          <div><strong>Nog twee weken</strong>
            <span>Komt er een besluit, dan is het klaar.</span></div>
        </li>
        <li class="keten__stap keten__stap--geld">
          <span class="keten__merk">4</span>
          <div><strong>Nog geen beslissing?</strong>
            <span>Dan telt de dwangsom op.</span></div>
        </li>
      </ol>

      <div class="vergoeding__raster">
        <div class="bedragkaart kaart">
          <span class="bedragkaart__titel">Mogelijke wettelijke dwangsom</span>
          <span class="bedragkaart__bedrag">tot &euro; 1.442</span>
          <p class="bedragkaart__onder">De teller loopt ten hoogste 42 dagen en het bedrag per dag
             stijgt onderweg.</p>
          <div class="staaf" aria-hidden="true">
            <span class="t1" style="grid-column: span 14"></span>
            <span class="t2" style="grid-column: span 14"></span>
            <span class="t3" style="grid-column: span 14"></span>
          </div>
          <ul class="tarieven">
            <li><strong>&euro; 23</strong> <span>per dag, de eerste 14 dagen</span></li>
            <li><strong>&euro; 35</strong> <span>per dag, dag 15 tot en met 28</span></li>
            <li><strong>&euro; 45</strong> <span>per dag, dag 29 tot en met 42</span></li>
          </ul>
        </div>
        <div class="vergoeding__tekst">
          <h3>En het geld is van jou</h3>
          <p>Een toegekende dwangsom wordt door de instantie <strong>rechtstreeks op je eigen
             rekening</strong> gestort. Wij zitten niet tussen jou en je vergoeding.</p>
          <p>Dat is ook de reden dat wij je rekeningnummer vragen: niet om het geld te ontvangen,
             maar om het op de juiste rekening te laten uitbetalen.</p>
          <p class="fijndruk">Of er in jouw zaak recht ontstaat, hangt af van de omstandigheden.
             Wij zeggen het eerlijk als het er niet in zit.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ============================================== 4. van brief naar uitslag -->
  <section class="blok blok--papier" id="werkwijze">
    <div class="omhulsel">
      <div class="sectiekop">
        <h2>Van jouw brief naar duidelijkheid in 1 minuut</h2>
        <p data-uploadtekst>${veilig(ingang.uploadtekst
          || `Upload de brief waarin ${naam} zegt wanneer je een beslissing kon verwachten. `
            + 'Wij zoeken de relevante datum voor je op.')}</p>
      </div>

      <div class="demo">
        <ol class="fasen">
          <li class="fase">
            <span class="fase__merk">1</span>
            <div>
              <h3>Je uploadt je brief</h3>
              <p>Een pdf, een foto of een screenshot. Weet je niet zeker welke brief? Upload wat je
                 hebt, dan kijken wij mee.</p>
              <span class="fase__tijd">ongeveer 10 seconden</span>
            </div>
          </li>
          <li class="fase">
            <span class="fase__merk">2</span>
            <div>
              <h3>Wij lezen hem uit</h3>
              <p>Instantie, procedure, je gegevens en de uiterste beslisdatum. Jij hoeft niets op te
                 zoeken en niets over te typen.</p>
              <span class="fase__tijd">direct op het scherm</span>
            </div>
          </li>
          <li class="fase">
            <span class="fase__merk">3</span>
            <div>
              <h3>Je ziet je eigen zaak terug</h3>
              <p>Met je eigen datum en je eigen procedure, nog v&oacute;&oacute;r je iets invult.</p>
              <span class="fase__tijd">binnen een minuut</span>
            </div>
          </li>
          <li class="fase">
            <span class="fase__merk">4</span>
            <div>
              <h3>Je geeft akkoord</h3>
              <p>Wat al uit je brief kwam staat voorgevuld. Je vult alleen aan wat wij missen en
                 zet &eacute;&eacute;n keer je handtekening.</p>
              <span class="fase__tijd">ongeveer een minuut</span>
            </div>
          </li>
        </ol>

        <!-- Het resultaatscherm, zodat stap 3 geen belofte is maar een demo. -->
        <aside class="minischerm" aria-label="Voorbeeld van het controlescherm">
          <div class="minischerm__kop">${VINK('#ffffff')} We hebben je brief gecontroleerd</div>
          <dl class="minischerm__rijen">
            <div><dt>Instantie</dt><dd data-proefinstantie>${veilig(voorbeeld.naam)}</dd></div>
            <div><dt>Procedure</dt><dd data-proefprocedure>${veilig(voorbeeld.procedure)}</dd></div>
            <div><dt>Beslissen v&oacute;&oacute;r</dt><dd>4 september</dd></div>
            <div><dt>Beslissing ontvangen</dt><dd>Nee</dd></div>
          </dl>
          <p class="minischerm__slot" data-proefkop>${veilig(metHoofdletter(naam))} lijkt te laat.</p>
        </aside>
      </div>

      <div class="middenknop">
        <a class="knop knop--primair knop--groot" href="${pad}" data-cta>
          <span data-cta-tekst>${veilig(ingang.knop)}</span></a>
        <p class="vertrouwenregel">${SLOT} Je documenten worden beveiligd verwerkt en alleen
           gebruikt om je zaak te controleren. Je machtigt ons pas als je zelf tekent.</p>
      </div>
    </div>
  </section>

  <!-- ============================================ 5. dit doe jij / dit doen wij -->
  <section class="blok" id="verdeling">
    <div class="omhulsel">
      <div class="sectiekop">
        <h2>Jij doet &eacute;&eacute;n ding. Wij de rest.</h2>
        <p>Een dwangsom ontstaat alleen als iemand de data bijhoudt. Vanaf je handtekening is dat
           onze taak, niet de jouwe.</p>
      </div>
      <div class="verdeling">
        <article class="kaart verdeling__kant verdeling__kant--jij">
          <span class="verdeling__wie">Dit doe jij</span>
          <ul>
            <li>${VINK()}<span>Je brief uploaden</span></li>
            <li>${VINK()}<span>Controleren of onze gegevens kloppen</span></li>
            <li>${VINK()}<span>&Eacute;&eacute;n keer tekenen</span></li>
          </ul>
          <p class="verdeling__tijd">Samen ongeveer twee minuten.</p>
        </article>
        <article class="kaart verdeling__kant verdeling__kant--wij">
          <span class="verdeling__wie">Vanaf dat moment doen wij</span>
          <ul>
            <li>${VINK()}<span>De formele melding opstellen en versturen</span></li>
            <li>${VINK()}<span>Het verzendbewijs bewaren</span></li>
            <li>${VINK()}<span>De vervolgtermijn bewaken</span></li>
            <li>${VINK()}<span>De dwangsom berekenen en vorderen</span></li>
            <li>${VINK()}<span>De beschikking opvolgen</span></li>
          </ul>
          <p class="verdeling__tijd">Jij hoeft de procedure niet bij te houden.</p>
        </article>
      </div>
    </div>
  </section>

  <!-- ====================================================== 6. het dossier -->
  <section class="blok blok--papier" id="dossier">
    <div class="omhulsel">
      <div class="sectiekop">
        <h2>En je kunt op elk moment zien waar het staat</h2>
        <p>Na je handtekening krijg je een eigen dossier. Geen mappen, geen telefoontjes: één
           scherm dat zegt wat er is gebeurd en wat er nu loopt.</p>
      </div>

      <div class="dossierdemo">
        <div class="dossierdemo__kop">
          <div>
            <span class="dossierdemo__ref">DWS-2026-0148</span>
            <h3 data-dossierkop>Jouw zaak bij ${veilig(voorbeeld.naam)}</h3>
          </div>
          <span class="dossierdemo__staat">Melding verzonden</span>
        </div>

        <div class="dossierdemo__klok">
          <strong>11 dagen</strong>
          <span data-dossierklok>${veilig(metHoofdletter(naam))} heeft nog tot 6 oktober om alsnog
             te beslissen.</span>
        </div>

        <ul class="tijdlijn">
          <li class="klaar"><span class="tijdlijn__titel">Je brief gecontroleerd</span>
            <span class="tijdlijn__datum">22 september</span></li>
          <li class="klaar"><span class="tijdlijn__titel">Machtiging ontvangen</span>
            <span class="tijdlijn__datum">22 september</span></li>
          <li class="klaar"><span class="tijdlijn__titel">Melding te late beslissing verzonden</span>
            <span class="tijdlijn__datum">22 september</span></li>
          <li class="bezig"><span class="tijdlijn__titel">Vervolgtermijn loopt</span>
            <span class="tijdlijn__datum">tot 6 oktober</span></li>
          <li><span class="tijdlijn__titel">Eventuele dwangsom bewaken</span>
            <span class="tijdlijn__datum">daarna</span></li>
        </ul>

        <p class="dossierdemo__rust"><strong>Je hoeft nu niets te doen.</strong> Krijg je
           ondertussen post? Dan upload je die in je dossier en pakken wij het op.</p>
      </div>
    </div>
  </section>

  <!-- ================================================= 7. waar wacht je op -->
  <section class="blok" id="waarvoor">
    <div class="omhulsel">
      <div class="sectiekop">
        <h2 data-waarvoorkop>Waar wacht je op?</h2>
        <p>De regeling geldt voor veel aanvragen en bezwaren bij overheidsinstanties. Of dat ook
           voor jouw zaak geldt, controleren wij voor je.</p>
      </div>
      <div class="ingangen">
        <article class="kaart ingang">
          <h3><span class="label-chip label-chip--blauw">UWV</span> Uitkeringen en beoordelingen</h3>
          <ul>
${ingangenPer('uwv').map(ingangLink).join('\n')}
          </ul>
        </article>
        <article class="kaart ingang">
          <h3><span class="label-chip label-chip--paars">Gemeente</span> Inkomen, zorg en hulp</h3>
          <ul>
${ingangenPer('gemeente').map(ingangLink).join('\n')}
          </ul>
        </article>
        <article class="kaart ingang">
          <h3><span class="label-chip">Landelijk</span> DUO, SVB en Belastingdienst</h3>
          <ul>
            <li><a href="/studiefinanciering">je studiefinanciering van DUO</a></li>
            <li><a href="/aow">je AOW-aanvraag bij de SVB</a></li>
            <li><a href="/toeslagen">een beslissing over je toeslag</a></li>
            <li><a href="/aanvraag?instantie=anders">een provincie, waterschap of ander orgaan</a></li>
          </ul>
        </article>
      </div>
    </div>
  </section>

  <!-- ================================================== 8. waarom nubeslist -->
  <section class="blok blok--papier" id="waarom">
    <div class="omhulsel">
      <div class="sectiekop">
        <h2>Waarom mensen dit aan ons overlaten</h2>
        <p>Je kunt zo'n melding ook zelf sturen. Dit is wat je dan zelf moet uitzoeken en
           bijhouden, en wat wij overnemen.</p>
      </div>
      <div class="redenen">
        <article class="kaart"><h3>Geen termijnen uitzoeken</h3>
          <p>Wij halen de datum uit je brief en bepalen welke termijn voor jouw zaak geldt.</p></article>
        <article class="kaart"><h3>Geen formulieren uitzoeken</h3>
          <p>Wij stellen de juiste vervolgstap op en versturen hem namens jou.</p></article>
        <article class="kaart"><h3>Geen deadlines bewaken</h3>
          <p>Wij houden bij wanneer er opnieuw iets moet gebeuren, en doen dat dan ook.</p></article>
        <article class="kaart"><h3>Geen voorschot</h3>
          <p>De eerste controle is gratis en je betaalt niets vooraf.</p></article>
        <article class="kaart"><h3>Jij houdt overzicht</h3>
          <p>In je dossier zie je precies waar je zaak staat en wat de volgende stap is.</p></article>
        <article class="kaart"><h3>Het geld gaat naar jou</h3>
          <p>De instantie betaalt rechtstreeks op je eigen rekening, niet aan ons.</p></article>
      </div>
      <p class="redenen__slot">Jij levert &eacute;&eacute;n keer je informatie aan. Vanaf daar
         houden wij de procedure bij.</p>
    </div>
  </section>

  <!-- ================================================= 8b. nog niet te laat -->
  <!--
    De bezoeker wiens termijn nog loopt is geen verloren bezoeker. Hij is een
    klant van over drie weken, en op dat moment moet iemand eraan denken. Dat
    is precies wat wij verkopen, dus dit hoort op de pagina en niet verstopt
    in een vraag onderaan.
  -->
  <section class="blok" id="nog-niet">
    <div class="omhulsel">
      <div class="nogniet">
        <div>
          <h2>Is je termijn nog niet voorbij?</h2>
          <p>Dan hoef je nu niets te doen &mdash; maar je moet er over een paar weken wel aan
             denken. Upload je brief, dan noteren wij de datum waarop
             <span data-instantie-zin>de instantie</span> uiterlijk moet beslissen. Blijft een
             beslissing uit, dan komen wij vanzelf in actie. Jij hoeft er niet aan te denken.</p>
          <a class="knop knop--zacht" href="${pad}" data-cta>Houd mijn termijn bij</a>
        </div>
        <ul class="nogniet__punten">
          <li>${VINK()} Wij bewaken de datum uit je brief</li>
          <li>${VINK()} Je hoort van ons zodra er iets kan</li>
          <li>${VINK()} Ook hier: geen vergoeding, geen kosten</li>
        </ul>
      </div>
    </div>
  </section>

  <!-- ============================================================ 9. kosten -->
  <section class="blok" id="kosten">
    <div class="omhulsel">
      <div class="sectiekop">
        <h2>Wat kost het je?</h2>
        <p>Geen kleine lettertjes. Dit is wat je betaalt, en wanneer.</p>
      </div>
      <div class="kosten">
        <article class="kaart">
          <h3>${VINK()} Controleren is gratis</h3>
          <p>De uitslag op het scherm kost je niets en verplicht je tot niets. Je beslist daarna
             zelf of je ons inschakelt.</p>
        </article>
        <article class="kaart">
          <h3>${VINK()} Geen vergoeding, geen kosten</h3>
          <p>Wordt er geen dwangsom toegekend, dan betaal je <strong>&euro; 0</strong>. Het risico
             ligt bij ons.</p>
        </article>
        <article class="kaart kosten--tarief">
          <h3>${VINK()} Wel een vergoeding?</h3>
          <p>${veilig(tariefZin(t))}</p>
          ${tariefVoorbeeld(t) ? `<p class="kosten__voorbeeld">${veilig(tariefVoorbeeld(t))}</p>` : ''}
        </article>
      </div>
      <p class="kosten__slot">Je weet altijd v&oacute;&oacute;rdat je tekent precies wat onze
         vergoeding is. Die staat ook op het scherm waar je je handtekening zet.</p>
    </div>
  </section>

  <!-- ======================================================= 10. vertrouwen -->
  <section class="blok blok--papier" id="vertrouwen">
    <div class="omhulsel">
      <div class="sectiekop">
        <h2>Aan wie geef je dit mee?</h2>
      </div>
      <div class="vertrouwen">
        <article class="kaart vertrouwen__wie">
          <h3>Achter nubeslist.nl</h3>
          <p>nubeslist.nl is een Nederlandse particuliere dienstverlener die mensen helpt wanneer
             een beslissing van een overheidsinstantie te lang uitblijft. Wij maken een procedure
             die normaal bestaat uit brieven, termijnen en opvolging eenvoudig en inzichtelijk.</p>
          <dl class="vertrouwen__gegevens">
            <div><dt>Naam</dt><dd>${veilig(bedrijf.naam)}</dd></div>
            <div><dt>Vestiging</dt><dd>${veilig(bedrijf.postcodePlaats)}</dd></div>
            <div><dt>KvK</dt><dd>${veilig(bedrijf.kvk)}</dd></div>
            <div><dt>E-mail</dt><dd>${veilig(bedrijf.email)}</dd></div>
          </dl>
          <p class="fijndruk">Wij zijn geen overheidsinstantie en niet verbonden aan UWV, DUO,
             de SVB of een gemeente.</p>
        </article>
        <div class="vertrouwen__punten">
          <article class="kaart"><h3>${SLOT} Je gegevens</h3>
            <p>Wij gebruiken je gegevens alleen om je zaak te beoordelen en de melding namens je te
               doen. Wij verkopen niets door en delen niets met anderen dan de instantie waar je
               zaak ligt.</p>
            <p><a href="/privacy">Hoe wij met je gegevens omgaan</a></p></article>
          <article class="kaart"><h3>${VINK()} De machtiging</h3>
            <p>Je machtigt ons alleen voor deze ene procedure over de te late beslissing. Wij mogen
               daarmee geen andere zaken van je behandelen.</p></article>
          <article class="kaart"><h3>${VINK()} De uitbetaling</h3>
            <p>Een toegekende dwangsom gaat rechtstreeks naar jouw rekening. Wij ontvangen jouw
               vergoeding niet.</p></article>
        </div>
      </div>
    </div>
  </section>

  <!-- ============================================================ 11. vragen -->
  <section class="blok" id="vragen">
    <div class="omhulsel">
      <div class="sectiekop">
        <h2>Veelgestelde vragen</h2>
        <p>Staat je vraag er niet bij? Start gerust de controle; die is gratis en je zit nergens
           aan vast.</p>
      </div>

      <details class="vraag" open>
        <summary data-vraag-brief>Welke brief moet ik uploaden?</summary>
        <p>De brief waarin <span data-instantie-zin>${veilig(naam)}</span> zegt wanneer je een
           beslissing kunt verwachten. Meestal is dat de ontvangstbevestiging van je aanvraag of
           van je bezwaarschrift, uit je berichtenbox of per post. Weet je het niet zeker? Upload
           de brief die je hebt; wij kijken met je mee.</p>
      </details>
      <details class="vraag">
        <summary>Moet ik zelf weten wat de beslistermijn is?</summary>
        <p>Nee. Dat is precies wat wij uitzoeken. Staat er een datum in je brief, dan telt die
           datum. Staat er geen datum in, dan bepalen wij de termijn aan de hand van het soort
           aanvraag.</p>
      </details>
      <details class="vraag">
        <summary data-vraag-verlenging>Wat als ik te horen heb gekregen dat het langer duurt?</summary>
        <p>Dan geldt die nieuwe datum. Upload die brief ook, dan rekenen wij met de juiste termijn.
           Je hoeft zelf niet te beoordelen of zo'n brief juridisch een verlenging is; dat doen wij.</p>
      </details>
      <details class="vraag">
        <summary>Wat is die melding die jullie versturen?</summary>
        <p>Dat is de ingebrekestelling: een brief waarin staat dat de beslistermijn voorbij is en
           dat je alsnog een besluit wilt. Zonder die brief kan er geen dwangsom ontstaan. De
           instantie krijgt daarna twee weken om alsnog te beslissen, en pas na die twee weken kan
           de teller gaan lopen.</p>
      </details>
      <details class="vraag">
        <summary>Hoeveel kan het opleveren?</summary>
        <p>De eerste veertien dagen is het &euro; 23 per dag, de volgende veertien dagen &euro; 35
           per dag en de laatste veertien dagen &euro; 45 per dag. Na 42 dagen stopt de teller op
           &euro; 1.442. Dat staat in artikel 4:17 van de Algemene wet bestuursrecht.</p>
      </details>
      <details class="vraag">
        <summary data-vraag-uitbetaling>Krijg ik het geld, of gaat het naar jullie?</summary>
        <p>Het geld gaat naar jou. De instantie betaalt een toegekende dwangsom rechtstreeks op je
           eigen rekening. Daarom vragen wij je rekeningnummer: om het op de juiste rekening te
           laten uitbetalen, niet om het te ontvangen.</p>
      </details>
      <details class="vraag">
        <summary>Wanneer kan er geen dwangsom ontstaan?</summary>
        <p>Onder meer als je geen belanghebbende bent, als je aanvraag kennelijk niet-ontvankelijk
           is, of als je onredelijk laat meldt dat de termijn voorbij is. Bij Woo-verzoeken en
           asielaanvragen geldt de regeling niet. In die gevallen kun je wel naar de rechtbank
           stappen omdat er niet tijdig is beslist.</p>
      </details>
      <details class="vraag">
        <summary>Ik heb alleen een foto van mijn brief, kan dat ook?</summary>
        <p>Een pdf uit je berichtenbox werkt het beste, want daar staat de tekst leesbaar in.
           Lukt dat niet, dan kun je de tekst van je brief ook in het scherm plakken of
           overtypen. Bij een foto vragen wij je de belangrijkste gegevens zelf in te vullen.</p>
      </details>
      <details class="vraag">
        <summary>Wat doen jullie met mijn gegevens?</summary>
        <p>Wij gebruiken je gegevens alleen om je zaak te beoordelen en de melding namens je te
           doen. Je burgerservicenummer hebben wij nodig omdat de instantie je zaak daarmee
           terugvindt, en je rekeningnummer omdat een toegekende vergoeding rechtstreeks aan jou
           wordt uitbetaald. Wij verkopen niets door en delen niets met anderen dan de instantie
           waar je zaak ligt.</p>
      </details>
      <details class="vraag">
        <summary>Mijn termijn is nog niet voorbij, kan ik mij alvast melden?</summary>
        <p>Ja, en dat is verstandig. Je doet dan een vooraanmelding. Wij noteren de datum waarop de
           beslistermijn afloopt en komen automatisch in actie zodra die voorbij is. Zo mis je het
           moment niet waarop de melding de deur uit moet, en hoef je er zelf niet aan te denken.</p>
      </details>

      <div class="oproep">
        <h2 data-slotkop>${veilig(ingang.kop)}</h2>
        <p>Upload je brief en je weet binnen een minuut waar je aan toe bent.</p>
        <a class="knop knop--primair knop--groot" href="${pad}" data-cta>
          <span data-cta-tekst>${veilig(ingang.knop)}</span></a>
        <p class="oproep__fijn">Gratis eerste controle &nbsp;&middot;&nbsp; Geen account nodig
           &nbsp;&middot;&nbsp; Je zit nergens aan vast</p>
      </div>
    </div>
  </section>
</main>

<footer class="voet">
  <div class="omhulsel">
    <div class="voet__merk">
      ${MERKTEKEN('voet__teken')}
      <span>nubeslist.nl</span>
    </div>
    <p>nubeslist.nl is een particuliere dienstverlener en geen overheidsinstantie. Wij zijn niet
       verbonden aan UWV, DUO, de SVB, een gemeente of een ander bestuursorgaan.</p>
    <p>De uitslag op het scherm is een inschatting op basis van de gegevens die je aanlevert en is
       geen juridisch advies. Aan de uitkomst kunnen geen rechten worden ontleend.</p>
    <ul class="voet__links">
      <li><a href="/">Startpagina</a></li>
      <li><a href="${pad}">Controle starten</a></li>
      <li><a href="/hoe-werkt-het">Hoe de regeling werkt</a></li>
      <li><a href="#kosten">Kosten</a></li>
      <li><a href="#vertrouwen">Over ons</a></li>
      <li><a href="/privacy">Privacy</a></li>
      <li><a href="/voorwaarden">Voorwaarden</a></li>
      <li><a href="/beheer">Beheeromgeving</a></li>
    </ul>
  </div>
</footer>

<script type="module" src="/assets/landing.js"></script>
</body>
</html>
`;
}

/** Alle pagina's die gegenereerd moeten worden, als {bestandsnaam, html}. */
export function alleLandingspaginas(env = process.env) {
  return [ALGEMEEN, ...CAMPAGNES].map((ingang) => ({
    bestand: ingang.slug ? `${ingang.slug}.html` : 'index.html',
    ingang,
    html: landingHtml(ingang, env),
  }));
}
