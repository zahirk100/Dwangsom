/**
 * Het gedrag van de campagnelanding.
 *
 * Twee dingen gebeuren hier. Het eerste is vormgeving die javascript nodig
 * heeft: de balk die meekleurt, het menu op mobiel, welke sectie actief is.
 *
 * Het tweede is het uploadvak, en dat is het belangrijkste. Wie hier op
 * "Controleer mijn brief" drukt, laat zijn brieven ook hier lezen - één
 * verzoek per brief, met de stand erbij. Naar de funnel gaat daarna alleen
 * het resultaat: een paar kilobyte tekst in plaats van megabytes aan
 * bestanden.
 *
 * Dat was een echte fout, geen verfraaiing. Eerder reisden de bestanden zelf
 * mee via sessionStorage, en vanaf drie pdf's paste dat er niet meer in. De
 * overdracht mislukte dan stil: je landde op de funnel, moest opnieuw
 * beginnen, en het leek alsof de knop het niet deed.
 *
 * Er gaat hiermee nog steeds niets naar UWV. Wij lezen de brief, verder
 * niemand.
 */

import { leesBrieven, alsLading, gekozenBestanden } from '/assets/brieven.js';

const OVERDRACHT = 'nubeslist:brieven';

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
  const nieuwe = gekozenBestanden(bestanden);
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
  try {
    const ladingen = [];
    for (const bestand of gekozen) ladingen.push(await alsLading(bestand));
    const data = await leesBrieven(ladingen, {
      bijVoortgang: (klaar, totaal) => {
        zegt(totaal > 1
          ? `Wij lezen je brieven\u2026 (${Math.min(klaar + 1, totaal)} van ${totaal})`
          : 'Wij lezen je brief\u2026', 'bezig');
      },
    });
    // Alleen het resultaat reist mee naar de funnel: een paar kilobyte tekst
    // in plaats van megabytes aan bestanden. Dat was precies wat eerder
    // stukliep - vanaf drie pdf's paste de stapel niet meer in de opslag van
    // het tabblad, en dan leek de knop niets te doen.
    sessionStorage.setItem(OVERDRACHT, JSON.stringify(data.gelezen));
    location.href = bestemming();
  } catch (fout) {
    zegt(`${fout.message}${fout.hint ? ` ${fout.hint}` : ''}`, 'fout');
    knop.disabled = false;
  }
});
