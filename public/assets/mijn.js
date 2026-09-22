/**
 * Het klantportaal.
 *
 * Eén scherm dat antwoord geeft op de enige vraag die de aanvrager heeft:
 * waar staat mijn zaak en moet ik nog iets doen? De tijdlijn en de
 * samenvatting komen uit shared/tijdlijn.js, zodat de tekst op het scherm
 * dezelfde is als die in de statusmail.
 *
 * Er wordt hier bewust niets uit de url of uit localStorage gelezen behalve
 * de eenmalige koppeling: welk dossier je ziet, bepaalt de server aan de hand
 * van je sessie.
 */

import { klantTijdlijn, klantSamenvatting } from '/shared/tijdlijn.js';
import { euro } from '/shared/dwangsom.js';
import { parseDatum, toonDatum } from '/shared/datum.js';
import { labelBestuursorgaan, zoekZaaktype } from '/shared/catalogus.js';

const inloggen = document.getElementById('inloggen');
const portaal = document.getElementById('portaal');
const inhoud = document.getElementById('inhoud');

function el(tag, attrs = {}, ...kinderen) {
  const knoop = document.createElement(tag);
  for (const [sleutel, waarde] of Object.entries(attrs)) {
    if (waarde === null || waarde === undefined || waarde === false) continue;
    if (sleutel === 'class') knoop.className = waarde;
    else if (sleutel === 'tekst') knoop.textContent = waarde;
    else knoop.setAttribute(sleutel, waarde);
  }
  for (const kind of kinderen.flat()) {
    if (kind === null || kind === undefined || kind === false) continue;
    knoop.append(typeof kind === 'string' ? document.createTextNode(kind) : kind);
  }
  return knoop;
}

function melding(vak, soort, titel, tekst) {
  vak.textContent = '';
  vak.append(el('div', { class: `melding melding--${soort}` },
    el('strong', { tekst: titel }), tekst ? el('p', { tekst }) : null));
}

async function api(pad, opties = {}) {
  const antwoord = await fetch(pad, {
    headers: { 'Content-Type': 'application/json' },
    ...opties,
  });
  const data = await antwoord.json().catch(() => ({}));
  if (!antwoord.ok) {
    const fout = new Error(data.fout || `Er ging iets mis (${antwoord.status}).`);
    fout.velden = data.velden;
    throw fout;
  }
  return data;
}

/** Werkt zowel met '2026-09-22' als met een volledig tijdstempel. */
const datum = (iso) => {
  const kaal = String(iso || '').slice(0, 10);
  const d = parseDatum(kaal);
  return d ? toonDatum(d) : '';
};

// ----------------------------------------------------------------- schermen

function toonInloggen(boodschap) {
  inloggen.classList.remove('verborgen');
  portaal.classList.add('verborgen');
  if (boodschap) melding(document.getElementById('inlogmelding'), 'let-op', boodschap);
}

/**
 * Eén dossier, van boven naar beneden: waar sta je, wat gebeurt er, wat
 * weten wij van je, en wat missen wij nog.
 */
function rendereDossier(dossier) {
  const samen = klantSamenvatting(dossier);
  const zaaktype = zoekZaaktype(dossier.invoer.zaaktype);
  const orgaan = dossier.invoer.organisatienaam || labelBestuursorgaan(dossier.invoer.bestuursorgaan);
  const berekening = (dossier.rapport && dossier.rapport.berekening) || {};
  const toegekend = dossier.afhandeling && Number.isFinite(dossier.afhandeling.bedragToegekend)
    ? dossier.afhandeling.bedragToegekend : null;

  const kop = el('div', { class: 'zaakkop' },
    el('span', { class: 'zaakkop__ref', tekst: dossier.referentie }),
    el('h1', { tekst: samen.kop }),
    el('p', { tekst: samen.tekst }));

  if (toegekend !== null) {
    kop.append(el('div', { class: 'zaakkop__bedrag' },
      el('strong', { tekst: euro(toegekend) }),
      el('span', { tekst: dossier.afhandeling.uitbetaaldOp
        ? `uitbetaald op ${datum(dossier.afhandeling.uitbetaaldOp)}`
        : 'toegekend, de uitbetaling volgt' })));
  } else if (berekening.totaal > 0) {
    kop.append(el('div', { class: 'zaakkop__bedrag' },
      el('strong', { tekst: euro(berekening.totaal) }),
      el('span', { tekst: berekening.doorlopend
        ? `opgebouwd over ${berekening.dagen} dagen en loopt nog door`
        : `opgebouwd over ${berekening.dagen} dagen` })));
  }

  // --------------------------------------------------------------- tijdlijn
  const lijst = el('ul', { class: 'tijdlijn' });
  for (const stap of klantTijdlijn(dossier)) {
    lijst.append(el('li', { class: stap.staat },
      el('span', { class: 'tijdlijn__titel', tekst: stap.titel }),
      el('span', { class: 'tijdlijn__onder', tekst: stap.onder }),
      stap.datum ? el('span', { class: 'tijdlijn__datum', tekst: datum(stap.datum) }) : null));
  }

  // --------------------------------------------------------------- gegevens
  const rijen = [
    ['Instantie', orgaan],
    ['Waar het over gaat', zaaktype ? zaaktype.label : dossier.invoer.zaaktype],
    ['Aangevraagd op', datum(dossier.invoer.basisdatum)],
    ['Uiterste beslisdatum', dossier.rapport && dossier.rapport.beslistermijn
      ? datum(dossier.rapport.beslistermijn.einddatum) : 'nog niet vastgesteld'],
    ['Melding verstuurd', dossier.invoer.ingebrekeGesteld
      ? datum(dossier.invoer.ingebrekestellingDatum) : 'nog niet'],
    ['Bij ons binnen op', datum(dossier.aangemaaktOp)],
  ];
  const gegevens = el('dl', { class: 'gegevens' });
  for (const [naam, waarde] of rijen) {
    if (!waarde) continue;
    gegevens.append(el('div', {}, el('dt', { tekst: naam }), el('dd', { tekst: waarde })));
  }

  const contactrijen = [
    ['Naam', dossier.contact.naam],
    ['E-mail', dossier.contact.email],
    ['Telefoon', dossier.contact.telefoon],
    ['Adres', [dossier.contact.adres, dossier.contact.postcode, dossier.contact.woonplaats]
      .filter(Boolean).join(', ')],
    ['Geboortedatum', datum(dossier.contact.geboortedatum)],
    ['Burgerservicenummer', dossier.contact.bsnBekend ? 'bij ons bekend' : ''],
    ['Rekeningnummer', dossier.contact.ibanBekend ? 'bij ons bekend' : ''],
  ];
  const mijnGegevens = el('dl', { class: 'gegevens' });
  for (const [naam, waarde] of contactrijen) {
    if (!waarde) continue;
    mijnGegevens.append(el('div', {}, el('dt', { tekst: naam }), el('dd', { tekst: waarde })));
  }

  const blok = el('div', {}, kop,
    el('div', { class: 'kolomkop', tekst: 'Zo staat je zaak ervoor' }), lijst,
    el('div', { class: 'kolomkop', tekst: 'Je zaak' }), gegevens);

  // Wat er nog ontbreekt, met de velden er meteen onder.
  if (dossier.ontbreekt.length > 0) {
    blok.append(el('div', { class: 'kolomkop', tekst: 'Dit hebben wij nog van je nodig' }),
      aanvulformulier(dossier));
  }

  blok.append(el('div', { class: 'kolomkop', tekst: 'Jouw gegevens' }), mijnGegevens);

  const wijzig = el('button', { class: 'knop knop--zacht knop--klein', type: 'button' },
    'Gegevens wijzigen');
  wijzig.addEventListener('click', () => {
    wijzig.replaceWith(aanvulformulier(dossier, true));
  });
  blok.append(el('div', { style: 'margin-top:16px' }, wijzig));

  return blok;
}

/**
 * De velden die de aanvrager zelf mag invullen. Bewust kort: zijn BSN en
 * rekeningnummer staan er niet bij, die corrigeert een behandelaar na
 * contact. Anders is één typefout genoeg om het geld naar iemand anders te
 * laten gaan.
 */
const ZELF_IN_TE_VULLEN = [
  ['naam', 'Naam', 'text'],
  ['telefoon', 'Telefoonnummer', 'tel'],
  ['adres', 'Straat en huisnummer', 'text'],
  ['postcode', 'Postcode', 'text'],
  ['woonplaats', 'Woonplaats', 'text'],
  ['geboortedatum', 'Geboortedatum', 'date'],
];

function aanvulformulier(dossier, alles = false) {
  const nodig = new Set(dossier.ontbreekt.map((o) => o.id));
  const velden = alles ? ZELF_IN_TE_VULLEN : ZELF_IN_TE_VULLEN.filter(([id]) => nodig.has(id));
  const houder = el('div', {});
  const fout = el('div', {});
  const invoervelden = {};

  if (velden.length === 0) {
    return el('p', { class: 'fijndruk', tekst: 'Wij hebben alles wat wij nodig hebben.' });
  }

  if (!alles) {
    const redenen = dossier.ontbreekt
      .filter((o) => nodig.has(o.id) && ZELF_IN_TE_VULLEN.some(([id]) => id === o.id));
    if (redenen.length) {
      houder.append(el('div', { class: 'melding melding--let-op ontbreekt' },
        el('strong', { tekst: 'Vul dit even aan' }),
        el('p', { tekst: `${redenen.map((r) => r.label).join(', ')}. Daarmee kunnen wij de zaak indienen.` })));
    }
  }

  const rij = el('div', { class: 'veldrij' });
  for (const [id, label, type] of velden) {
    const veld = el('input', { type, id: `mijn-${id}`, maxlength: '160' });
    veld.value = dossier.contact[id] || '';
    invoervelden[id] = veld;
    rij.append(el('div', { class: 'veld' },
      el('label', { for: `mijn-${id}` }, label,
        nodig.has(id) ? el('span', { class: 'label-chip label-chip--oranje', style: 'margin-left:8px' }, 'nodig') : null),
      veld,
      el('p', { class: 'veld__fout verborgen', 'data-fout': id })));
  }
  houder.append(rij);

  const opslaan = el('button', { class: 'knop knop--primair', type: 'button' }, 'Opslaan');
  opslaan.addEventListener('click', async () => {
    fout.textContent = '';
    for (const id of Object.keys(invoervelden)) zetVeldfout(id, '');
    const contact = Object.fromEntries(
      Object.entries(invoervelden).map(([id, veld]) => [id, veld.value]),
    );
    opslaan.disabled = true;
    opslaan.textContent = 'Bezig…';
    try {
      await api(`/api/mijn/dossiers/${dossier.id}/gegevens`, {
        method: 'POST', body: JSON.stringify(contact),
      });
      await laad();
    } catch (err) {
      opslaan.disabled = false;
      opslaan.textContent = 'Opslaan';
      if (err.velden) {
        for (const [id, tekst] of Object.entries(err.velden)) zetVeldfout(id, tekst);
      } else {
        melding(fout, 'fout', err.message);
      }
    }
  });
  houder.append(el('div', { class: 'knoprij' }, opslaan), fout);
  return houder;
}

function zetVeldfout(id, tekst) {
  const knoop = document.querySelector(`[data-fout="${id}"]`);
  if (!knoop) return;
  knoop.textContent = tekst || '';
  knoop.classList.toggle('verborgen', !tekst);
}

function rendereGeenDossier(gebruiker) {
  return el('div', { class: 'kaart', style: 'padding:28px' },
    el('h1', { style: 'font-size:1.3rem', tekst: `Hallo ${gebruiker.naam || ''}`.trim() }),
    el('p', { class: 'fijndruk', tekst: 'Er staat op dit moment geen zaak op je naam.' }),
    el('div', { class: 'knoprij' },
      el('a', { class: 'knop knop--primair', href: '/aanvraag' }, 'Controleer je brief')));
}

// -------------------------------------------------------------------- start

async function laad() {
  const data = await api('/api/mijn/dossiers');
  inloggen.classList.add('verborgen');
  portaal.classList.remove('verborgen');
  inhoud.textContent = '';

  if (data.dossiers.length === 0) {
    inhoud.append(rendereGeenDossier(data.gebruiker));
  } else {
    for (const dossier of data.dossiers) inhoud.append(rendereDossier(dossier));
  }

  const uitloggen = el('button', { class: 'knop knop--stil knop--klein', type: 'button' }, 'Uitloggen');
  uitloggen.addEventListener('click', async () => {
    await api('/api/mijn/uitloggen', { method: 'POST' });
    location.href = '/';
  });
  inhoud.append(el('div', { class: 'uitlogrij' },
    uitloggen,
    el('span', { class: 'fijndruk', tekst: `Ingelogd als ${data.gebruiker.email}` })));
  inhoud.append(el('p', { class: 'hulp' },
    'Vragen over je zaak? Antwoord gewoon op een van onze e-mails, dan pakken wij het op.'));
}

/** Binnenkomen via de link uit de e-mail. */
async function wisselKoppelingIn() {
  const token = new URLSearchParams(location.search).get('t');
  if (!token) return false;
  // De link meteen uit de adresbalk halen: hij is eenmalig en hoort niet in
  // de geschiedenis of in een gedeelde schermafbeelding terecht te komen.
  history.replaceState(null, '', '/mijn');
  try {
    await api('/api/mijn/koppeling', { method: 'POST', body: JSON.stringify({ token }) });
    return true;
  } catch (err) {
    toonInloggen(err.message);
    return false;
  }
}

document.getElementById('linkformulier').addEventListener('submit', async (e) => {
  e.preventDefault();
  const vak = document.getElementById('inlogmelding');
  const email = document.getElementById('email').value.trim();
  if (!email) return;
  try {
    await api('/api/mijn/link', { method: 'POST', body: JSON.stringify({ email }) });
    melding(vak, 'goed', 'Kijk in je mailbox',
      'Staat er een zaak op dit adres, dan hebben wij je zojuist een inloglink gestuurd.');
  } catch (err) {
    melding(vak, 'fout', err.message);
  }
});

(async function start() {
  await wisselKoppelingIn();
  // Eerst vragen of we ingelogd zijn; dat scheelt een 401 in de console bij
  // iedereen die het portaal gewoon opent zonder link.
  const sessie = await api('/api/mijn/sessie').catch(() => ({ ingelogd: false }));
  if (!sessie.ingelogd) return toonInloggen();
  try {
    await laad();
  } catch {
    toonInloggen();
  }
}());
