/**
 * Het gedrag van de campagnelanding.
 *
 * Twee dingen gebeuren hier. Het eerste is vormgeving die javascript nodig
 * heeft: de balk die meekleurt, het menu op mobiel, welke sectie actief is.
 *
 * Het tweede is het uploadvak, en dat is het belangrijkste. Wie op deze
 * pagina zijn brief kiest, hoeft hem niet op de volgende pagina opnieuw te
 * zoeken: het bestand gaat mee naar de funnel. Dat gaat via sessionStorage,
 * omdat een bestand niet in een link past. Het blijft daarmee in het tabblad
 * van de bezoeker: er gaat hier nog niets naar de server, en dat is precies
 * wat de pagina belooft.
 *
 * Past het niet (een grote pdf), dan gaan we gewoon door naar de funnel en
 * kiest de bezoeker zijn bestand daar. Liever een stap extra dan een lege
 * pagina.
 */

const OVERDRACHT = 'nubeslist:brieven';
const MAX_OVERDRACHT = 3.5 * 1024 * 1024;
const MAX_ZIJDE = 2200;

// -------------------------------------------------------------- balk ----

const balk = document.getElementById('hdr');
const heroknop = document.getElementById('herobtn');

function bijScrollen() {
  balk.classList.toggle('scrolled', scrollY > 8);
  balk.classList.toggle('cta', heroknop.getBoundingClientRect().bottom < 70);
}
addEventListener('scroll', bijScrollen, { passive: true });
bijScrollen();

const menulinks = [...document.querySelectorAll('nav a')];
const kijker = new IntersectionObserver((waarnemingen) => {
  for (const waarneming of waarnemingen) {
    if (!waarneming.isIntersecting) continue;
    menulinks.forEach((a) => a.classList.remove('active'));
    const bij = menulinks.find((a) => a.dataset.t === waarneming.target.id);
    if (bij) bij.classList.add('active');
  }
}, { rootMargin: '-45% 0px -50% 0px' });
document.querySelectorAll('main section').forEach((sectie) => kijker.observe(sectie));

// "Wat kost het?" staat in een uitklapper; wie erheen springt wil hem open zien.
document.querySelectorAll('a[href="#kosten"]').forEach((a) => {
  a.addEventListener('click', () => { document.getElementById('kosten').open = true; });
});

const lijf = document.body;
const openKnop = document.getElementById('openm');
openKnop.addEventListener('click', () => {
  lijf.classList.add('open');
  openKnop.setAttribute('aria-expanded', 'true');
});
const sluiters = [document.getElementById('closem'), document.getElementById('ov'),
  ...document.querySelectorAll('.sheet a')];
for (const element of sluiters) {
  element.addEventListener('click', () => {
    lijf.classList.remove('open');
    openKnop.setAttribute('aria-expanded', 'false');
  });
}

if (matchMedia('(min-width:961px)').matches) document.getElementById('hint').open = true;

// ------------------------------------------------------------ upload ----

const vak = document.getElementById('drop');
const invoer = document.getElementById('file');
const lijst = document.getElementById('files');
const knop = document.getElementById('go');
const melding = document.getElementById('melding');
const kop = document.getElementById('droph');
const stappen = document.querySelectorAll('.micro li');

let gekozen = [];

function zegt(tekst, soort) {
  if (!tekst) {
    melding.hidden = true;
    melding.textContent = '';
    return;
  }
  melding.hidden = false;
  melding.className = `melding melding--${soort}`;
  melding.textContent = tekst;
}

function toonLijst() {
  lijst.textContent = '';
  for (const bestand of gekozen) {
    const regel = document.createElement('li');
    const naam = document.createElement('span');
    naam.className = 'fn';
    naam.textContent = bestand.name;
    const vink = document.createElement('span');
    vink.className = 'ok';
    vink.textContent = '✓';
    regel.append(document.createTextNode('📄'), naam, vink);
    lijst.append(regel);
  }
  vak.classList.toggle('has', gekozen.length > 0);
  if (gekozen.length > 0) {
    kop.textContent = 'Klaar om te controleren';
    if (stappen.length > 1) {
      stappen[0].classList.remove('on');
      stappen[0].classList.add('done');
      stappen[1].classList.add('on');
    }
  }
}

function voegToe(bestanden) {
  const nieuwe = [...bestanden].filter((b) => b && b.size > 0);
  if (nieuwe.length === 0) return;
  gekozen = gekozen.concat(nieuwe).slice(0, 5);
  zegt('');
  toonLijst();
}

invoer.addEventListener('change', () => {
  voegToe(invoer.files);
  invoer.value = '';
});

for (const gebeurtenis of ['dragenter', 'dragover']) {
  vak.addEventListener(gebeurtenis, (e) => { e.preventDefault(); vak.classList.add('over'); });
}
for (const gebeurtenis of ['dragleave', 'drop']) {
  vak.addEventListener(gebeurtenis, (e) => { e.preventDefault(); vak.classList.remove('over'); });
}
vak.addEventListener('drop', (e) => voegToe(e.dataTransfer.files));

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binair = '';
  for (let i = 0; i < bytes.length; i += 1) binair += String.fromCharCode(bytes[i]);
  return btoa(binair);
}

/**
 * Een telefoonfoto is al gauw vijf megabyte, terwijl de tekst op de brief bij
 * 2200 pixels ruim leesbaar blijft. Verkleinen scheelt wachttijd, en het is
 * het verschil tussen wel en niet meekunnen naar de funnel.
 */
async function verkleind(bestand) {
  if (!/^image\//i.test(bestand.type) || typeof createImageBitmap !== 'function') return null;
  try {
    const beeld = await createImageBitmap(bestand);
    const factor = Math.min(1, MAX_ZIJDE / Math.max(beeld.width, beeld.height));
    const doek = document.createElement('canvas');
    doek.width = Math.round(beeld.width * factor);
    doek.height = Math.round(beeld.height * factor);
    doek.getContext('2d').drawImage(beeld, 0, 0, doek.width, doek.height);
    const blob = await new Promise((klaar) => doek.toBlob(klaar, 'image/jpeg', 0.85));
    if (!blob || blob.size >= bestand.size) return null;
    return { mediaType: 'image/jpeg', data: base64(await blob.arrayBuffer()) };
  } catch {
    return null;
  }
}

async function alsLading(bestand) {
  const kleiner = await verkleind(bestand);
  return {
    bestandsnaam: bestand.name,
    mediaType: kleiner ? kleiner.mediaType : (bestand.type || ''),
    data: kleiner ? kleiner.data : base64(await bestand.arrayBuffer()),
  };
}

/** Waar we heen gaan. meting.js heeft het kanaal er dan al aan geplakt. */
function bestemming() {
  const anker = document.getElementById('verder');
  return anker ? anker.getAttribute('href') : '/aanvraag?instantie=uwv&van=uwv-te-laat';
}

/**
 * Eén klik, niet twee.
 *
 * "Controleer mijn UWV-brief" bracht je eerst alleen naar het uploadvak; daar
 * moest je nog een keer klikken om je bestand te kiezen. Dat is een extra stap
 * op precies het moment dat iemand iets wíl. Nu springt de pagina naar het vak
 * én gaat de bestandskiezer meteen open - op een telefoon is dat het menu met
 * "Maak een foto".
 *
 * Heeft iemand al een brief gekozen, dan alleen springen: dan is de knop in
 * het vak zelf de volgende stap, en een tweede keuzemenu is dan in de weg.
 */
for (const link of document.querySelectorAll('a[href="#upload"]')) {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('upload').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (gekozen.length === 0) invoer.click();
  });
}

knop.addEventListener('click', async () => {
  if (gekozen.length === 0) return;
  knop.disabled = true;
  zegt('Wij lezen je brief…', 'bezig');
  try {
    const ladingen = [];
    for (const bestand of gekozen) ladingen.push(await alsLading(bestand));
    const pakket = JSON.stringify(ladingen);
    if (pakket.length <= MAX_OVERDRACHT) sessionStorage.setItem(OVERDRACHT, pakket);
  } catch {
    // Geen ruimte of geen toestemming: dan kiest de bezoeker zijn bestand
    // opnieuw op de volgende pagina. Dat is vervelend, maar niet stuk.
  }
  location.href = bestemming();
});
