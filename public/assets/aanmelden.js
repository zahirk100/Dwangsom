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
 */

import { tarief, tariefZin } from '/shared/tarief.js';
import { bsnKlopt, normaliseerBsn, ibanKlopt, normaliseerIban, toonIban } from '/shared/identiteit.js';

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
  for (const veld of ['naam', 'geboortedatum', 'bsn', 'iban', 'email', 'handtekening', 'akkoord']) {
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

  bij('formulier').classList.remove('verborgen');
  bij('naam').focus();
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
      bij('klaar-regel').textContent = `Je aanmelding is binnen. Je kenmerk is ${data.referentie}.`;
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
    knop.textContent = 'Aanmelding versturen';
  }
});

open();
