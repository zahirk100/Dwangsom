/**
 * Het gedrag van de campagnelanding.
 *
 * Drie dingen gebeuren hier. Het eerste is vormgeving die javascript nodig
 * heeft: de balk die meekleurt, het menu, welke sectie actief is.
 *
 * Het tweede is de keuzelijst met bestanden. Wie een foto van zijn brief
 * maakt, wil vóór het versturen kunnen zien welke foto hij koos - de derde
 * poging in een donkere gang is niet van de eerste te onderscheiden aan de
 * bestandsnaam. Daarom krijgt elk gekozen bestand een kaartje met een
 * miniatuur, de grootte en een knop om het weer weg te halen.
 *
 * Het derde is het lezen zelf. Wie hier op "Controleer mijn brief" drukt,
 * laat zijn brieven ook hier lezen - één verzoek per brief, met de stand
 * erbij. Naar de funnel gaat daarna alleen het resultaat: een paar kilobyte
 * tekst in plaats van megabytes aan bestanden.
 *
 * Dat was een echte fout, geen verfraaiing. Eerder reisden de bestanden zelf
 * mee via sessionStorage, en vanaf drie pdf's paste dat er niet meer in. De
 * overdracht mislukte dan stil: je landde op de funnel, moest opnieuw
 * beginnen, en het leek alsof de knop het niet deed.
 *
 * Er gaat hiermee nog steeds niets naar UWV. Wij lezen de brief, verder
 * niemand.
 */

import { leesBrieven, alsLading, gekozenBestanden, MAX_BRIEVEN } from '/assets/brieven.js';

const OVERDRACHT = 'nubeslist:brieven';

const bij = (naam) => document.getElementById(naam);

// ------------------------------------------------------------ dialogen ----

/**
 * Menu en voorvertoning zijn allebei een `<dialog>`.
 *
 * Dat scheelt niet alleen code. Een echte dialoog houdt de tabvolgorde binnen
 * het venster, sluit op Escape en legt de rest van de pagina stil - drie
 * dingen die met een overlay-div allemaal met de hand moeten, en die er in de
 * vorige versie dus ook niet in zaten.
 */
const dialogen = [...document.querySelectorAll('dialog')];
const menu = bij('menu-dialog');
const menuknop = bij('openm');
const voorvertoning = bij('file-preview-dialog');
const voorvertoningLijf = bij('file-preview-body');

function openDialoog(dialoog, aanleiding) {
  if (dialoog.open) return;
  dialoog.terug = aanleiding || document.activeElement;
  dialoog.showModal();
  document.body.classList.add('dialog-open');
  const sluiter = dialoog.querySelector('[data-close-dialog]');
  if (sluiter) sluiter.focus();
}

function sluitDialoog(dialoog, herstelFocus = true) {
  if (!herstelFocus) dialoog.terug = null;
  dialoog.close();
}

for (const dialoog of dialogen) {
  for (const knop of dialoog.querySelectorAll('[data-close-dialog]')) {
    knop.addEventListener('click', () => sluitDialoog(dialoog));
  }
  dialoog.addEventListener('close', () => {
    if (!dialogen.some((d) => d.open)) document.body.classList.remove('dialog-open');
    if (dialoog === menu) menuknop.setAttribute('aria-expanded', 'false');
    if (dialoog === voorvertoning) {
      voorvertoningLijf.replaceChildren();
      getoond = null;
    }
    const doel = dialoog.terug;
    dialoog.terug = null;
    if (doel && doel.isConnected && !dialogen.some((d) => d.open)) doel.focus({ preventScroll: true });
  });
  // Klikken naast het venster sluit het. Een klik binnen de randen is een
  // klik op de inhoud, ook als hij technisch op het dialoogelement landt.
  dialoog.addEventListener('click', (e) => {
    if (e.target !== dialoog) return;
    const vak = dialoog.getBoundingClientRect();
    if (e.clientX < vak.left || e.clientX > vak.right
      || e.clientY < vak.top || e.clientY > vak.bottom) sluitDialoog(dialoog);
  });
}

menuknop.addEventListener('click', () => {
  openDialoog(menu, menuknop);
  menuknop.setAttribute('aria-expanded', 'true');
});

// -------------------------------------------------------------- balk ----

const balk = bij('hdr');
const heroknop = bij('herobtn');
const vak = bij('drop');

/**
 * De knop rechtsboven verschijnt pas als de knop in de hero uit beeld is, en
 * verdwijnt weer zodra het uploadvak zelf in beeld komt. Twee keer dezelfde
 * knop tegelijk op het scherm is er één te veel.
 */
function bijScrollen() {
  const hero = heroknop.getBoundingClientRect();
  const doel = vak.getBoundingClientRect();
  const hoogte = balk.getBoundingClientRect().height;
  const vakInBeeld = doel.top < innerHeight && doel.bottom > hoogte;
  balk.classList.toggle('scrolled', scrollY > 8);
  balk.classList.toggle('cta', hero.bottom < hoogte && !vakInBeeld && gekozen.length === 0);
  merkActief();
}
addEventListener('scroll', bijScrollen, { passive: true });
addEventListener('resize', bijScrollen);

const menulinks = [...document.querySelectorAll('nav a')];

/** Welk menu-item hoort bij wat er nu op de streep onder de balk staat. */
function merkActief() {
  const streep = balk.getBoundingClientRect().height + 80;
  let actief = null;
  for (const link of menulinks) {
    const doel = bij(link.dataset.t);
    if (!doel) continue;
    const plek = doel.getBoundingClientRect();
    if (plek.top <= streep && plek.bottom > streep) actief = link;
  }
  for (const link of menulinks) {
    link.classList.toggle('active', link === actief);
    if (link === actief) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

// Een link naar een uitklapper hoort die ook open te doen; anders spring je
// naar een dichte vraag en lijkt er niets te gebeuren.
function openDoel(id) {
  const doel = bij(id);
  if (doel && doel.tagName === 'DETAILS') doel.open = true;
  return doel;
}
addEventListener('hashchange', () => {
  try { openDoel(decodeURIComponent(location.hash.slice(1))); } catch { /* rare hash */ }
});
try { openDoel(decodeURIComponent(location.hash.slice(1))); } catch { /* rare hash */ }

for (const link of document.querySelectorAll('a[href^="#"]')) {
  link.addEventListener('click', () => {
    if (menu.open) sluitDialoog(menu, false);
    openDoel(link.getAttribute('href').slice(1));
  });
}

if (matchMedia('(min-width:961px)').matches) bij('hint').open = true;

// ------------------------------------------------------------ upload ----

const invoer = bij('file');
const kiesknop = bij('pick');
const lijst = bij('files');
const stand = bij('file-status');
const startknop = bij('go');
const foutvak = bij('file-error');
const foutlijst = bij('file-errors');
const kop = bij('droph');
const fase = bij('selection-phase');
const later = bij('later');

/** @type {{bestand: File, sleutel: string, soort: 'foto'|'pdf', url: string}[]} */
let gekozen = [];
let getoond = null;

const sleutelVan = (b) => JSON.stringify([b.name, b.size, b.lastModified, b.type]);

/**
 * Wat is dit voor bestand?
 *
 * Bewust op naam én mediatype: Android geeft een foto uit de camera soms
 * zonder mediatype door, en sommige mailprogramma's noemen een pdf
 * `application/octet-stream`. Herkennen we het geen van beide, dan zeggen we
 * dat hier - dat is eerlijker dan het versturen en de server laten weigeren.
 */
function soortVan(bestand) {
  const naam = String(bestand.name || '').toLowerCase();
  if (bestand.type === 'image/svg+xml' || /\.svgz?$/.test(naam)) return null;
  if (bestand.type === 'application/pdf' || /\.pdf$/.test(naam)) return 'pdf';
  if (/^image\/(jpeg|png|webp|heic|heif|avif|gif|bmp|x-ms-bmp|tiff)$/i.test(bestand.type)
    || /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp|tiff?)$/.test(naam)) return 'foto';
  return null;
}

function leesbaarFormaat(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} MB`;
}

function keuzeZin() {
  const aantal = gekozen.length;
  return `${aantal} ${aantal === 1 ? 'bestand' : 'bestanden'} gekozen. Er is nog niets verstuurd.`;
}

function zeg(tekst) {
  stand.textContent = tekst || '';
}

function toonFoto(regel, knop) {
  getoond = regel.sleutel;
  bij('file-preview-title').textContent = regel.bestand.name;
  const beeld = document.createElement('img');
  beeld.className = 'preview-image';
  beeld.alt = 'Voorvertoning van de gekozen foto';
  beeld.src = regel.url;
  beeld.addEventListener('error', () => {
    const melding = document.createElement('p');
    melding.textContent = 'Deze foto kan op dit apparaat niet worden weergegeven. '
      + 'Je kunt hem verwijderen en een andere foto kiezen.';
    voorvertoningLijf.replaceChildren(melding);
  });
  voorvertoningLijf.replaceChildren(beeld);
  openDialoog(voorvertoning, knop);
}

function verwijder(sleutel) {
  const plek = gekozen.findIndex((r) => r.sleutel === sleutel);
  if (plek < 0) return;
  const [regel] = gekozen.splice(plek, 1);
  if (voorvertoning.open && getoond === sleutel) sluitDialoog(voorvertoning, false);
  URL.revokeObjectURL(regel.url);
  toonLijst();
  zeg(gekozen.length
    ? `Bestand verwijderd. ${keuzeZin()}`
    : 'Bestand verwijderd. Er is geen brief meer gekozen.');
  // De focus hoort niet naar de bovenkant van de pagina te springen als het
  // kaartje eronder verdwijnt.
  const knoppen = [...lijst.querySelectorAll('.file-remove')];
  (knoppen[Math.min(plek, knoppen.length - 1)] || kiesknop).focus();
}

function kaartje(regel) {
  const rij = document.createElement('li');
  rij.className = 'file-card';

  const detail = document.createElement('div');
  detail.className = 'file-detail';
  const naam = document.createElement('p');
  naam.className = 'file-name';
  naam.textContent = regel.bestand.name;
  const onder = document.createElement('p');
  onder.className = 'file-meta';
  onder.textContent = `${regel.soort === 'pdf' ? 'PDF' : 'Foto'} · ${leesbaarFormaat(regel.bestand.size)} · Gekozen`;
  detail.append(naam, onder);

  const duim = document.createElement(regel.soort === 'pdf' ? 'a' : 'button');
  duim.className = 'file-preview';
  if (regel.soort === 'pdf') {
    duim.href = regel.url;
    duim.target = '_blank';
    duim.rel = 'noopener noreferrer';
    duim.setAttribute('aria-label', `Open ${regel.bestand.name} in een nieuw tabblad`);
    duim.textContent = 'PDF';
    const label = document.createElement('span');
    label.className = 'preview-label';
    label.textContent = 'Open';
    duim.append(label);
  } else {
    duim.type = 'button';
    duim.setAttribute('aria-label', `Bekijk ${regel.bestand.name}`);
    const beeld = document.createElement('img');
    beeld.alt = '';
    beeld.src = regel.url;
    const label = document.createElement('span');
    label.className = 'preview-label';
    label.textContent = 'Bekijk';
    duim.append(beeld, label);
    duim.addEventListener('click', () => toonFoto(regel, duim));
    // Lukt de miniatuur niet (heic op een android-telefoon), dan blijft het
    // bestand bruikbaar; alleen het plaatje valt weg.
    beeld.addEventListener('error', () => {
      duim.replaceChildren();
      duim.textContent = 'FOTO';
      duim.disabled = true;
      duim.setAttribute('aria-label', 'Foto gekozen; voorvertoning niet beschikbaar op dit apparaat');
      onder.textContent = `${leesbaarFormaat(regel.bestand.size)} · Gekozen. Voorvertoning niet beschikbaar op dit apparaat.`;
    });
  }

  const weg = document.createElement('button');
  weg.type = 'button';
  weg.className = 'file-remove';
  weg.textContent = 'Verwijder';
  weg.setAttribute('aria-label', `Verwijder ${regel.bestand.name}`);
  weg.addEventListener('click', () => verwijder(regel.sleutel));

  rij.append(duim, detail, weg);
  return rij;
}

function toonLijst() {
  const heeft = gekozen.length > 0;
  lijst.replaceChildren(...gekozen.map(kaartje));
  vak.classList.toggle('has', heeft);
  kop.textContent = heeft ? 'Dit zijn je gekozen bestanden' : 'Kies je UWV-brief';
  fase.textContent = heeft ? 'Bestanden gekozen' : 'Eerst jouw brief kiezen';
  bij('pick-empty').hidden = heeft;
  bij('pick-more').hidden = !heeft;
  startknop.hidden = !heeft;
  later.hidden = heeft;
  zeg(heeft ? keuzeZin() : '');
  bijScrollen();
}

function meldFouten(fouten) {
  foutlijst.replaceChildren(...fouten.map((tekst) => {
    const regel = document.createElement('li');
    regel.textContent = tekst;
    return regel;
  }));
  foutvak.hidden = fouten.length === 0;
}

/**
 * Gekozen bestanden opnemen in de lijst.
 *
 * Geeft terug of er iets in het vak is veranderd dat de bezoeker zou moeten
 * zien: een brief erbij, of een melding over een bestand dat niet kan. Dat is
 * wat bepaalt of de pagina naar het vak toe mag; zonder dat onderscheid
 * verplaatst een weggeklikt keuzevenster de pagina net zo goed, want dat
 * levert ook een change op - met nul bestanden.
 *
 * @returns {boolean} of er iets nieuws in het vak staat
 */
function voegToe(bestanden) {
  const fouten = [];
  const sleutels = new Set(gekozen.map((r) => r.sleutel));
  const had = gekozen.length;
  let dubbel = 0;
  let teveel = 0;

  for (const bestand of gekozenBestanden(bestanden, Infinity)) {
    const soort = soortVan(bestand);
    if (!soort) {
      fouten.push(`${bestand.name}: kies een foto of pdf. Dit bestandstype kunnen we niet lezen.`);
      continue;
    }
    const sleutel = sleutelVan(bestand);
    if (sleutels.has(sleutel)) { dubbel += 1; continue; }
    if (gekozen.length >= MAX_BRIEVEN) { teveel += 1; continue; }
    // Een pdf wordt in een nieuw tabblad geopend en heeft daarvoor het juiste
    // mediatype nodig; een foto gaat gewoon in een img.
    const bron = soort === 'pdf' ? new Blob([bestand], { type: 'application/pdf' }) : bestand;
    gekozen.push({ bestand, sleutel, soort, url: URL.createObjectURL(bron) });
    sleutels.add(sleutel);
  }

  meldFouten(fouten);
  toonLijst();
  const naschrift = [
    dubbel ? 'Een al gekozen bestand is niet dubbel toegevoegd.' : '',
    teveel ? `Er passen ${MAX_BRIEVEN} brieven in één controle; de rest is niet toegevoegd.` : '',
  ].filter(Boolean).join(' ');
  if (naschrift) zeg(`${stand.textContent} ${naschrift}`.trim());
  return gekozen.length > had || fouten.length > 0 || dubbel > 0 || teveel > 0;
}

/**
 * Wie via een knop bovenaan de pagina kiest, wil dat het vak daarna in beeld
 * staat; wie op "Kies een foto of pdf" in het vak zelf drukt, staat er al.
 * Deze vlag onthoudt welke van de twee het was.
 */
let kwamVanKnop = false;

/** Het uploadvak in beeld brengen. Zachtjes, zodat je ziet waar je heen gaat. */
function naarVak() {
  vak.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

kiesknop.addEventListener('click', () => invoer.click());

/**
 * De pagina verplaatst alleen als er in het vak ook echt iets te zien is.
 *
 * Let op de voorwaarde: niet "er is een keuze gemaakt" maar "er staat nu iets
 * nieuws". Wie het keuzevenster wegklikt krijgt óók een change, met nul
 * bestanden - dat is precies de sprong die hier eerder zat. Kiest iemand wél
 * iets, maar een bestand dat wij niet kunnen lezen, dan moet de pagina juist
 * wél mee: die melding staat in het vak, en daar kijkt hij anders niet naar.
 */
invoer.addEventListener('change', () => {
  const ietsTeZien = voegToe(invoer.files);
  invoer.value = '';
  if (kwamVanKnop && ietsTeZien) {
    kwamVanKnop = false;
    naarVak();
  }
});

/**
 * Het venster weggeklikt zonder iets te kiezen: niets doen.
 *
 * Hier stond eerst een sprong naar het uploadvak, met als gedachte dat de
 * knop anders niets lijkt te doen. Dat was de verkeerde afweging. Wie het
 * keuzevenster wegklikt heeft zich bedacht, en die zet je niet ongevraagd
 * vijfduizend pixels verderop. De knop staat nog gewoon in beeld; wie hem
 * alsnog wil, klikt opnieuw.
 *
 * De vlag gaat wel uit, anders zou een volgende keuze - bijvoorbeeld via de
 * knop in het vak zelf - alsnog die sprong maken.
 */
invoer.addEventListener('cancel', () => { kwamVanKnop = false; });

let sleepdiepte = 0;
vak.addEventListener('dragenter', (e) => {
  e.preventDefault();
  sleepdiepte += 1;
  vak.classList.add('over');
});
vak.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
});
vak.addEventListener('dragleave', (e) => {
  e.preventDefault();
  sleepdiepte = Math.max(0, sleepdiepte - 1);
  if (!sleepdiepte) vak.classList.remove('over');
});
vak.addEventListener('drop', (e) => {
  e.preventDefault();
  sleepdiepte = 0;
  vak.classList.remove('over');
  if (e.dataTransfer) voegToe(e.dataTransfer.files);
});

/** Waar we heen gaan. meting.js heeft het kanaal er dan al aan geplakt. */
function bestemming() {
  const anker = bij('verder');
  return anker ? anker.getAttribute('href') : '/aanvraag?instantie=uwv&van=uwv-te-laat';
}

/**
 * De knop opent de kiezer. Verder niets.
 *
 * Dit is twee keer eerder misgegaan, allebei op dezelfde manier: de knop deed
 * iets anders dan hij belooft.
 *
 * Eerst bracht "Controleer mijn UWV-brief" je alleen naar het uploadvak, en
 * moest je daar nóg een keer klikken om een bestand te kiezen. Dat is een
 * extra stap op precies het moment dat iemand iets wíl.
 *
 * Daarna sprong de pagina naar het vak én ging de kiezer open. Ook dat klopt
 * niet: je drukt op een knop bovenin en de pagina rent vijfduizend pixels naar
 * beneden terwijl er een keuzevenster over heen komt. Sluit je dat venster,
 * dan sta je ergens waar je niet om gevraagd hebt.
 *
 * Dus: klikken opent de kiezer, en de pagina blijft staan. Het vak komt pas in
 * beeld als er ook echt iets te zien is - zodra een bestand gekozen is, of als
 * de kiezer zonder keuze dichtgaat.
 *
 * Heeft iemand al een brief gekozen, dan gaat de kiezer niet open maar
 * verplaatst de pagina wel: dan is de knop in het vak zelf de volgende stap,
 * en een tweede keuzemenu is in de weg.
 */
for (const link of document.querySelectorAll('a[href="#upload"]')) {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    if (menu.open) sluitDialoog(menu, false);
    if (gekozen.length > 0) {
      naarVak();
      return;
    }
    kwamVanKnop = true;
    invoer.click();
  });
}

startknop.addEventListener('click', async () => {
  if (gekozen.length === 0) return;
  startknop.disabled = true;
  meldFouten([]);
  try {
    const ladingen = [];
    for (const regel of gekozen) ladingen.push(await alsLading(regel.bestand));
    const data = await leesBrieven(ladingen, {
      bijVoortgang: (klaar, totaal) => {
        zeg(totaal > 1
          ? `Wij lezen je brieven… (${Math.min(klaar + 1, totaal)} van ${totaal})`
          : 'Wij lezen je brief…');
      },
    });
    // Alleen het resultaat reist mee naar de funnel: een paar kilobyte tekst
    // in plaats van megabytes aan bestanden. Dat was precies wat eerder
    // stukliep - vanaf drie pdf's paste de stapel niet meer in de opslag van
    // het tabblad, en dan leek de knop niets te doen.
    sessionStorage.setItem(OVERDRACHT, JSON.stringify(data.gelezen));
    location.href = bestemming();
  } catch (fout) {
    zeg('');
    meldFouten([`${fout.message}${fout.hint ? ` ${fout.hint}` : ''}`]);
    startknop.disabled = false;
  }
});

// Blob-adressen blijven anders in het geheugen hangen tot het tabblad dicht
// gaat; bij vijf telefoonfoto's is dat zomaar dertig megabyte.
addEventListener('pagehide', (e) => {
  if (!e.persisted) for (const regel of gekozen) URL.revokeObjectURL(regel.url);
});

toonLijst();
