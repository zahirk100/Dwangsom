/**
 * Het aanmeldformulier achter een link uit een gesprek.
 *
 * Dit scherm is het laatste stukje van een weg die bij WhatsApp begon. Een
 * medewerker heeft daar al vastgesteld dat er iets te halen valt; wat hier nog
 * moet gebeuren is de machtiging, met de gegevens die daarvoor nodig zijn.
 *
 * Vandaar de toon en de lengte: geen uitleg over dwangsommen, geen bedragen,
 * geen keuzes. Vier velden, een handtekening en klaar. Alles wat hier extra bij
 * komt, is een reden om te stoppen.
 *
 * Er zijn twee soorten links. Bij een gewone aanmelding is de termijn al
 * voorbij en komt de brief later van ons. Bij een vooraanmelding loopt de
 * termijn nog; dan horen er een paar vragen over de zaak bij, want zonder te
 * weten wélke aanvraag en van wanneer valt er niets te bewaken. Wat de
 * medewerker in het gesprek al noteerde, staat er dan als overzichtje: alleen
 * wat nog ontbreekt wordt gevraagd.
 */

import { tarief, tariefZin } from '/shared/tarief.js';
import { bsnKlopt, normaliseerBsn, ibanKlopt, normaliseerIban, toonIban } from '/shared/identiteit.js';
import { BESTUURSORGANEN, zaaktypenVoor, zoekZaaktype, labelBestuursorgaan } from '/shared/catalogus.js';
import { parseDatum, toonDatum } from '/shared/datum.js';

const bij = (id) => document.getElementById(id);
const token = new URLSearchParams(location.search).get('t') || '';

// ------------------------------------------------------------ fouten ------

function zetFout(veld, tekst) {
  const vak = bij(`veld-${veld}`);
  const regel = bij(`fout-${veld}`);
  const invoer = bij(veld);
  if (regel) regel.textContent = tekst || '';
  if (vak) vak.classList.toggle('mis', Boolean(tekst));
  if (invoer) {
    if (tekst) invoer.setAttribute('aria-invalid', 'true');
    else invoer.removeAttribute('aria-invalid');
  }
}

function wisFouten() {
  for (const veld of [
    'naam', 'geboortedatum', 'bsn', 'iban', 'email', 'handtekening', 'akkoord',
    'bestuursorgaan', 'zaaktype', 'basisdatum',
  ]) {
    zetFout(veld, '');
  }
  bij('fout').classList.add('verborgen');
}

// ------------------------------------------------------ handtekening ------

const canvas = bij('handtekening');
const vakje = bij('handtekeningvak');
const penseel = canvas.getContext('2d');
let tekent = false;
let getekend = false;

function penPositie(gebeurtenis) {
  const kader = canvas.getBoundingClientRect();
  return {
    x: (gebeurtenis.clientX - kader.left) * (canvas.width / kader.width),
    y: (gebeurtenis.clientY - kader.top) * (canvas.height / kader.height),
  };
}

penseel.lineWidth = 3;
penseel.lineCap = 'round';
penseel.lineJoin = 'round';
penseel.strokeStyle = '#16202e';

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  tekent = true;
  penseel.beginPath();
  const punt = penPositie(e);
  penseel.moveTo(punt.x, punt.y);
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!tekent) return;
  e.preventDefault();
  const punt = penPositie(e);
  penseel.lineTo(punt.x, punt.y);
  penseel.stroke();
  if (!getekend) {
    getekend = true;
    vakje.classList.add('getekend');
    bij('handtekening-stand').textContent = 'Getekend';
    zetFout('handtekening', '');
  }
});
for (const eind of ['pointerup', 'pointercancel']) {
  canvas.addEventListener(eind, () => { tekent = false; });
}
bij('wissen').addEventListener('click', () => {
  penseel.clearRect(0, 0, canvas.width, canvas.height);
  getekend = false;
  vakje.classList.remove('getekend');
  bij('handtekening-stand').textContent = 'Nog niet getekend';
});

// ------------------------------------------------- meelezen bij invoer ----

// Het rekeningnummer leest een stuk makkelijker in groepjes van vier, en wie
// zijn eigen nummer terugleest in de vorm die hij van de bank kent, controleert
// het ook echt.
bij('iban').addEventListener('blur', () => {
  const schoon = normaliseerIban(bij('iban').value);
  if (schoon && ibanKlopt(schoon)) {
    bij('iban').value = toonIban(schoon);
    zetFout('iban', '');
  }
});

bij('bsn').addEventListener('blur', () => {
  const schoon = normaliseerBsn(bij('bsn').value);
  if (!schoon) return;
  if (!bsnKlopt(schoon)) {
    zetFout('bsn', 'Dit burgerservicenummer klopt niet. Controleer de negen cijfers.');
  } else {
    bij('bsn').value = schoon;
    zetFout('bsn', '');
  }
});

// --------------------------------------------------------------- de zaak --

/*
 * Wat de medewerker al wist, en wat er daarna nog over is om te vragen.
 * Beide komen uit dezelfde bron als de rest van de site: de catalogus met
 * zaaktypen. Een lijst die hier apart wordt bijgehouden loopt uit de pas met
 * de termijnen waarmee gerekend wordt.
 */
let linksoort = 'aanmelding';
let bekendeZaak = {};

const LABELS = {
  bestuursorgaan: 'Instantie',
  zaaktype: 'Je aanvraag',
  basisdatum: 'Aanvraag gedaan op',
  termijnEinddatum: 'Beslissing uiterlijk op',
};

function toonZaakwaarde(veld, waarde) {
  if (veld === 'bestuursorgaan') return labelBestuursorgaan(waarde);
  if (veld === 'zaaktype') {
    const soort = zoekZaaktype(waarde);
    return soort ? soort.label : waarde;
  }
  const ms = parseDatum(waarde);
  return ms === null ? String(waarde) : toonDatum(ms);
}

/** De keuzelijst met soorten zaak hoort bij de gekozen instantie. */
function vulZaaktypen() {
  const orgaan = bij('bestuursorgaan').value || bekendeZaak.bestuursorgaan || '';
  const lijst = bij('zaaktype');
  const gekozen = lijst.value;
  lijst.textContent = '';
  const leeg = document.createElement('option');
  leeg.value = '';
  leeg.textContent = orgaan ? 'Kies waar het over gaat…' : 'Kies eerst een instantie';
  lijst.append(leeg);
  for (const soort of zaaktypenVoor(orgaan)) {
    const optie = document.createElement('option');
    optie.value = soort.id;
    optie.textContent = soort.label;
    lijst.append(optie);
  }
  if (gekozen && zaaktypenVoor(orgaan).some((z) => z.id === gekozen)) lijst.value = gekozen;
  zetDatumlabel();
}

/*
 * Bij een bezwaar loopt de termijn niet vanaf de aanvraag maar vanaf het
 * besluit waartegen bezwaar is gemaakt. Dezelfde vraag stellen zou een datum
 * opleveren waarmee de berekening de verkeerde kant op gaat.
 */
function zetDatumlabel() {
  const soort = zoekZaaktype(bij('zaaktype').value || bekendeZaak.zaaktype || '');
  const bezwaar = soort && soort.termijnVanaf === 'bezwaartermijn';
  const label = bij('label-basisdatum');
  if (!label) return;
  label.childNodes[0].nodeValue = bezwaar
    ? 'Wanneer is het besluit genomen waartegen je bezwaar maakte? '
    : 'Wanneer heb je de aanvraag gedaan? ';
}

function bouwZaakkaart(data) {
  linksoort = data.soort === 'vooraanmelding' ? 'vooraanmelding' : 'aanmelding';
  bekendeZaak = data.zaak || {};
  if (linksoort !== 'vooraanmelding') return;

  bij('formulier-kop').textContent = 'Je vooraanmelding';
  bij('verzend').textContent = 'Vooraanmelding versturen';
  bij('kaart-zaak').classList.remove('verborgen');

  // Eerst de instanties in de lijst, dan pas wat er al bekend was invullen.
  const orgaanlijst = bij('bestuursorgaan');
  orgaanlijst.textContent = '';
  const leeg = document.createElement('option');
  leeg.value = '';
  leeg.textContent = 'Kies een instantie…';
  orgaanlijst.append(leeg);
  for (const orgaan of BESTUURSORGANEN) {
    const optie = document.createElement('option');
    optie.value = orgaan.id;
    optie.textContent = orgaan.label;
    orgaanlijst.append(optie);
  }

  for (const veld of ['bestuursorgaan', 'zaaktype', 'basisdatum']) {
    if (bekendeZaak[veld]) bij(veld).value = bekendeZaak[veld];
  }
  vulZaaktypen();
  if (bekendeZaak.zaaktype) bij('zaaktype').value = bekendeZaak.zaaktype;

  // Wat al bekend is, staat er als tekst om te controleren; de rest wordt
  // gevraagd. Iemand die alles al heeft doorgegeven hoeft hier dus niets te
  // doen behalve tekenen.
  const overzicht = bij('zaak-bekend');
  overzicht.textContent = '';
  let gevraagd = 0;
  /*
   * De uiterste beslisdatum staat hier met opzet niet bij. Die komt uit de
   * brief van de instantie, en die brief heeft de medewerker in het gesprek
   * voor zich - de aanvrager zou er alleen maar naar hoeven zoeken. Weten wij
   * hem, dan staat hij in het overzichtje; weten wij hem niet, dan rekent de
   * applicatie met de wettelijke termijn en halen wij hem later uit de brief.
   */
  for (const veld of ['bestuursorgaan', 'zaaktype', 'basisdatum']) {
    if (bekendeZaak[veld]) {
      const rij = document.createElement('div');
      const kop = document.createElement('dt');
      kop.textContent = LABELS[veld];
      const waarde = document.createElement('dd');
      waarde.textContent = toonZaakwaarde(veld, bekendeZaak[veld]);
      rij.append(kop, waarde);
      overzicht.append(rij);
    } else {
      bij(`veld-${veld}`).classList.remove('verborgen');
      gevraagd += 1;
    }
  }
  if (bekendeZaak.termijnEinddatum) {
    const rij = document.createElement('div');
    const kop = document.createElement('dt');
    kop.textContent = LABELS.termijnEinddatum;
    const waarde = document.createElement('dd');
    waarde.textContent = toonZaakwaarde('termijnEinddatum', bekendeZaak.termijnEinddatum);
    rij.append(kop, waarde);
    overzicht.append(rij);
  }

  if (overzicht.children.length) overzicht.classList.remove('verborgen');

  /*
   * In de praktijk is dit scherm leeg op het overzichtje na: de medewerker
   * legt de zaak vast als hij de link maakt, want hij heeft de aanvrager toch
   * al aan de lijn. Dan staat hier alleen wat wij genoteerd hebben, om te
   * controleren - en is dit formulier even kort als het gewone.
   */
  bij('zaak-uitleg').textContent = gevraagd === 0
    ? 'Dit hebben wij uit ons gesprek genoteerd. Klopt er iets niet? Laat het ons even weten.'
    : 'Hiermee weten wij vanaf wanneer de instantie te laat is.';
  bij('formulier-inleiding').textContent = gevraagd === 0
    ? 'De instantie heeft nog tijd om te beslissen. Wij houden die datum in de gaten en komen '
      + 'in actie zodra zij te laat zijn. Teken hieronder, dan regelen wij de rest.'
    : 'De instantie heeft nog tijd om te beslissen. Wij houden die datum in de gaten en komen '
      + 'in actie zodra zij te laat zijn. Daarvoor hebben wij deze gegevens nodig.';
}

bij('bestuursorgaan').addEventListener('change', () => {
  bij('zaaktype').value = '';
  vulZaaktypen();
});
bij('zaaktype').addEventListener('change', zetDatumlabel);

// ------------------------------------------------------------- openen -----

async function open() {
  let data;
  try {
    const antwoord = await fetch(`/api/aanmelden?t=${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
    });
    data = await antwoord.json();
  } catch {
    data = { geldig: false, reden: 'Wij konden deze link niet controleren. Probeer het zo nog eens.' };
  }

  bij('laden').classList.add('verborgen');

  if (!data.geldig) {
    bij('dicht-reden').textContent = data.reden || 'Deze link werkt niet meer.';
    bij('dicht').classList.remove('verborgen');
    return;
  }

  const organisatie = data.organisatie || {};
  if (organisatie.naam) bij('org-naam').textContent = organisatie.naam;

  // Het tarief komt uit dezelfde bron als de rest van de site. Staat het er
  // niet, dan noemen wij geen bedrag en geen percentage: liever eerlijk zeggen
  // dat wij het apart afspreken dan een getal verzinnen waar iemand voor tekent.
  const t = tarief(data);
  bij('vergoeding-tekst').textContent = t.bekend
    ? `${tariefZin(t)} Lukt het niet, dan kost het je niets. De instantie betaalt de `
      + 'vergoeding rechtstreeks aan jou uit; wij sturen je daarna onze factuur.'
    : 'Wat onze hulp kost, spreken wij apart met je af voordat wij iets doen. '
      + 'Lukt het niet, dan kost het je niets.';

  bouwZaakkaart(data);

  bij('formulier').classList.remove('verborgen');
  const eerste = document.querySelector('#kaart-zaak .veld:not(.verborgen) select, '
    + '#kaart-zaak .veld:not(.verborgen) input') || bij('naam');
  eerste.focus();
}

// ---------------------------------------------------------- versturen -----

bij('formulier').addEventListener('submit', async (gebeurtenis) => {
  gebeurtenis.preventDefault();
  wisFouten();

  const knop = bij('verzend');
  knop.disabled = true;
  knop.textContent = 'Bezig met versturen…';

  const lading = {
    t: token,
    // Alleen wat op het scherm staat. Wat de medewerker al had genoteerd,
    // weet de server zelf nog; dat hoeft hier niet nog eens langs de aanvrager.
    zaak: linksoort === 'vooraanmelding' ? {
      bestuursorgaan: bij('bestuursorgaan').value,
      zaaktype: bij('zaaktype').value,
      basisdatum: bij('basisdatum').value,
    } : undefined,
    naam: bij('naam').value,
    geboortedatum: bij('geboortedatum').value,
    bsn: normaliseerBsn(bij('bsn').value),
    iban: normaliseerIban(bij('iban').value),
    email: bij('email').value,
    akkoord: bij('akkoord').checked,
    handtekening: getekend
      ? { afbeelding: canvas.toDataURL('image/png'), gezetOp: new Date().toISOString() }
      : null,
  };

  try {
    const antwoord = await fetch('/api/aanmelden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lading),
    });
    const data = await antwoord.json().catch(() => ({}));

    if (antwoord.status === 201) {
      bij('formulier').classList.add('verborgen');
      bij('klaar-regel').textContent = linksoort === 'vooraanmelding'
        ? `Je vooraanmelding is binnen. Je kenmerk is ${data.referentie}.`
        : `Je aanmelding is binnen. Je kenmerk is ${data.referentie}.`;
      if (linksoort === 'vooraanmelding') {
        const tot = data.bewaaktTot ? parseDatum(data.bewaaktTot) : null;
        bij('klaar-uitleg').textContent = tot
          ? `Wij houden ${toonDatum(tot)} in de gaten. Komt er dan nog geen beslissing, `
            + 'dan stellen wij de instantie namens jou in gebreke. Je hoeft zelf niets te doen.'
          : 'Wij kijken ernaar en nemen contact met je op als er iets moet gebeuren. '
            + 'Je hoeft zelf niets te doen.';
      }
      bij('klaar-mail').textContent = data.email
        ? 'Wij hebben je een bevestiging gemaild met een link naar je eigen dossier.'
        : 'Bewaar dit kenmerk; je hebt het nodig als je ons iets vraagt.';
      bij('klaar').classList.remove('verborgen');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (data.velden) {
      for (const [veld, tekst] of Object.entries(data.velden)) zetFout(veld, tekst);
      const eerste = document.querySelector('.veld.mis input, #veld-akkoord input');
      if (eerste) eerste.focus();
      bij('fout').textContent = 'Er ontbreekt nog iets. Kijk hieronder waar het rood staat.';
      bij('fout').classList.remove('verborgen');
      return;
    }

    bij('fout').textContent = data.fout || 'Versturen is niet gelukt. Probeer het nog een keer.';
    bij('fout').classList.remove('verborgen');
  } catch {
    bij('fout').textContent = 'Wij konden je aanmelding niet versturen. Controleer je verbinding '
      + 'en probeer het nog een keer.';
    bij('fout').classList.remove('verborgen');
  } finally {
    knop.disabled = false;
    knop.textContent = linksoort === 'vooraanmelding'
      ? 'Vooraanmelding versturen' : 'Aanmelding versturen';
  }
});

open();
