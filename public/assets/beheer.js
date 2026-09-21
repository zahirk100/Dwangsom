/** Beheeromgeving: overzicht, detaillade, statusbeheer en notities. */

import { euro } from '/shared/dwangsom.js';
import { parseDatum, toonDatum } from '/shared/datum.js';
import { labelBestuursorgaan } from '/shared/catalogus.js';

const inloggenVak = document.getElementById('inloggen');
const dashboardVak = document.getElementById('dashboard');
const tabelBody = document.getElementById('tabel-body');
const leegVak = document.getElementById('leeg');
const ladeHouder = document.getElementById('lade-houder');

let statussen = [];
let actieveAanvraag = null;

const UITKOMST_LABEL = {
  'recht': { tekst: 'Recht opgebouwd', kleur: 'groen' },
  'hersteltermijn-loopt': { tekst: 'Twee weken lopen', kleur: 'oranje' },
  'ingebrekestelling-nodig': { tekst: 'Ingebrekestelling nodig', kleur: 'paars' },
  'termijn-loopt': { tekst: 'Termijn loopt nog', kleur: 'blauw' },
  'geen-recht': { tekst: 'Geen recht', kleur: 'rood' },
};

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

function chip(tekst, kleur) {
  return el('span', { class: `label-chip${kleur ? ` label-chip--${kleur}` : ''}`, tekst });
}

function datumTijd(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function api(pad, opties = {}) {
  const antwoord = await fetch(pad, {
    headers: { 'Content-Type': 'application/json' },
    ...opties,
  });
  if (antwoord.status === 401) {
    toonInloggen();
    throw new Error('Niet ingelogd.');
  }
  const data = await antwoord.json().catch(() => ({}));
  if (!antwoord.ok) throw new Error(data.fout || 'Er ging iets mis.');
  return data;
}

// ------------------------------------------------------------- inloggen ---

function toonInloggen() {
  inloggenVak.classList.remove('verborgen');
  dashboardVak.classList.add('verborgen');
  sluitLade();
  document.getElementById('wachtwoord').focus();
}

function toonDashboard() {
  inloggenVak.classList.add('verborgen');
  dashboardVak.classList.remove('verborgen');
  laadLijst();
}

document.getElementById('inlogformulier').addEventListener('submit', async (e) => {
  e.preventDefault();
  const foutVak = document.getElementById('inlog-fout');
  foutVak.textContent = '';
  try {
    await api('/api/beheer/login', {
      method: 'POST',
      body: JSON.stringify({ wachtwoord: document.getElementById('wachtwoord').value }),
    });
    document.getElementById('wachtwoord').value = '';
    toonDashboard();
  } catch (err) {
    foutVak.append(el('div', { class: 'melding melding--fout', tekst: err.message }));
  }
});

document.getElementById('knop-uitloggen').addEventListener('click', async () => {
  await fetch('/api/beheer/logout', { method: 'POST' });
  toonInloggen();
});

// --------------------------------------------------------------- lijst ----

function filterQuery() {
  const params = new URLSearchParams();
  const zoek = document.getElementById('zoek').value.trim();
  if (zoek) params.set('zoek', zoek);
  params.set('status', document.getElementById('filter-status').value);
  params.set('bestuursorgaan', document.getElementById('filter-orgaan').value);
  return params.toString();
}

async function laadLijst() {
  const data = await api(`/api/beheer/aanvragen?${filterQuery()}`);
  statussen = data.statussen;
  vulStatusfilter();
  rendereKengetallen(data.statistieken);
  rendereTabel(data.aanvragen);
  document.getElementById('knop-export').href = `/api/beheer/export.csv?status=${document.getElementById('filter-status').value}`;
}

function vulStatusfilter() {
  const select = document.getElementById('filter-status');
  if (select.options.length > 1) return;
  for (const status of statussen) {
    select.append(el('option', { value: status.id }, status.label));
  }
}

function rendereKengetallen(stats) {
  const vak = document.getElementById('kengetallen');
  vak.textContent = '';
  const items = [
    { label: 'Totaal aanvragen', waarde: String(stats.totaal) },
    { label: 'Open dossiers', waarde: String(stats.open) },
    { label: 'Met opgebouwd recht', waarde: String(stats.metRecht) },
    { label: 'Totale claimwaarde', waarde: euro(stats.totaalBedrag) },
  ];
  for (const item of items) {
    vak.append(el('div', { class: 'kaart kengetal' },
      el('div', { class: 'kengetal__label', tekst: item.label }),
      el('div', { class: 'kengetal__waarde', tekst: item.waarde })));
  }
}

function rendereTabel(aanvragen) {
  tabelBody.textContent = '';
  leegVak.classList.toggle('verborgen', aanvragen.length > 0);
  for (const a of aanvragen) {
    const uitkomst = UITKOMST_LABEL[a.uitkomst] || { tekst: a.uitkomst || '–', kleur: '' };
    const status = statussen.find((s) => s.id === a.status);
    const rij = el('tr', { tabindex: '0' },
      el('td', {}, el('strong', { tekst: a.referentie })),
      el('td', {}, el('div', { tekst: a.naam }), el('div', { class: 'subtiel', style: 'font-size:.82rem', tekst: a.email })),
      el('td', { tekst: a.organisatienaam || labelBestuursorgaan(a.bestuursorgaan) }),
      el('td', { tekst: a.zaaktype }),
      el('td', {}, chip(uitkomst.tekst, uitkomst.kleur)),
      el('td', { class: 'bedrag', tekst: a.bedrag ? euro(a.bedrag) + (a.doorlopend ? ' ↑' : '') : '–' }),
      el('td', {}, chip(a.statusLabel, status ? status.kleur : '')),
      el('td', { class: 'subtiel', style: 'white-space:nowrap', tekst: datumTijd(a.aangemaaktOp) }),
    );
    rij.addEventListener('click', () => openLade(a.id));
    rij.addEventListener('keydown', (e) => { if (e.key === 'Enter') openLade(a.id); });
    tabelBody.append(rij);
  }
}

['zoek'].forEach((id) => {
  let pauze;
  document.getElementById(id).addEventListener('input', () => {
    clearTimeout(pauze);
    pauze = setTimeout(laadLijst, 250);
  });
});
document.getElementById('filter-status').addEventListener('change', laadLijst);
document.getElementById('filter-orgaan').addEventListener('change', laadLijst);
document.getElementById('knop-vernieuw').addEventListener('click', laadLijst);

// ---------------------------------------------------------------- lade ----

function sluitLade() {
  ladeHouder.textContent = '';
  actieveAanvraag = null;
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sluitLade(); });

async function openLade(id) {
  const data = await api(`/api/beheer/aanvragen/${id}`);
  actieveAanvraag = data.aanvraag;
  rendereLade();
}

function gegevensLijst(paren) {
  return el('dl', { class: 'gegevens' },
    paren.filter(([, w]) => w !== '' && w !== null && w !== undefined)
      .map(([label, w]) => el('div', {}, el('dt', { tekst: label }), el('dd', { tekst: String(w) }))));
}

function rendereLade() {
  const a = actieveAanvraag;
  const b = a.rapport && a.rapport.berekening;
  const uitkomst = UITKOMST_LABEL[a.rapport && a.rapport.uitkomst] || { tekst: '–', kleur: '' };

  const statusSelect = el('select', { id: 'status-select', style: 'max-width:240px' },
    statussen.map((s) => el('option', { value: s.id, selected: s.id === a.status }, s.label)));
  statusSelect.value = a.status;
  statusSelect.addEventListener('change', async () => {
    const data = await api(`/api/beheer/aanvragen/${a.id}`, {
      method: 'PATCH', body: JSON.stringify({ status: statusSelect.value }),
    });
    actieveAanvraag = data.aanvraag;
    rendereLade();
    laadLijst();
  });

  const notitieVeld = el('textarea', { placeholder: 'Interne notitie toevoegen…' });
  const notitieKnop = el('button', { class: 'knop knop--zacht knop--klein', type: 'button' }, 'Notitie opslaan');
  notitieKnop.addEventListener('click', async () => {
    const tekst = notitieVeld.value.trim();
    if (!tekst) return;
    const data = await api(`/api/beheer/aanvragen/${a.id}/notities`, {
      method: 'POST', body: JSON.stringify({ tekst }),
    });
    actieveAanvraag = data.aanvraag;
    rendereLade();
  });

  const herberekenKnop = el('button', { class: 'knop knop--zacht knop--klein', type: 'button' }, '↻ Herberekenen op vandaag');
  herberekenKnop.addEventListener('click', async () => {
    const data = await api(`/api/beheer/aanvragen/${a.id}/herbereken`, {
      method: 'POST',
      body: JSON.stringify({ invoer: {}, toelichting: 'Herberekend op de datum van vandaag.' }),
    });
    actieveAanvraag = data.aanvraag;
    rendereLade();
    laadLijst();
  });

  const lade = el('aside', { class: 'lade', role: 'dialog', 'aria-label': `Aanvraag ${a.referentie}` },
    el('div', { class: 'lade__kop' },
      el('div', {},
        el('h2', { tekst: a.referentie }),
        el('div', { style: 'display:flex; gap:8px; margin-top:6px; flex-wrap:wrap' },
          chip(uitkomst.tekst, uitkomst.kleur),
          chip(a.contact.machtiging ? 'Machtiging gewenst' : 'Geen machtiging'),
        )),
      el('button', { class: 'knop knop--stil knop--klein', type: 'button', id: 'sluit-lade', style: 'margin-left:auto' }, '✕'),
    ),

    el('div', { class: 'melding melding--info' },
      el('strong', { tekst: a.rapport ? a.rapport.kop : 'Geen berekening' }),
      el('p', { tekst: a.rapport ? a.rapport.samenvatting : '' })),

    el('div', { class: 'kolomkop', tekst: 'Status' }),
    statusSelect,

    el('div', { class: 'kolomkop', tekst: 'Aanvrager' }),
    gegevensLijst([
      ['Naam', a.contact.naam],
      ['E-mail', a.contact.email],
      ['Telefoon', a.contact.telefoon],
      ['Adres', [a.contact.adres, a.contact.postcode].filter(Boolean).join(', ')],
      ['Woonplaats', a.contact.woonplaats],
      ['Geboortedatum', a.contact.geboortedatum],
      ['Kenmerk', a.contact.kenmerk],
      ['Ontvangen op', datumTijd(a.aangemaaktOp)],
    ]),
    a.contact.toelichting
      ? el('div', { class: 'notitie', style: 'margin-top:10px' },
          el('div', { class: 'notitie__meta', tekst: 'Toelichting van de aanvrager' }),
          el('div', { tekst: a.contact.toelichting }))
      : null,

    el('div', { class: 'kolomkop', tekst: 'Zaak' }),
    gegevensLijst([
      ['Organisatie', a.invoer.organisatienaam || labelBestuursorgaan(a.invoer.bestuursorgaan)],
      ['Zaaktype', a.rapport && a.rapport.zaaktype ? a.rapport.zaaktype.label : a.invoer.zaaktype],
      ['Aanvraagdatum', toonDatum(parseDatum(a.invoer.basisdatum))],
      ['Einde beslistermijn', a.rapport && a.rapport.beslistermijn ? toonDatum(parseDatum(a.rapport.beslistermijn.einddatum)) : '–'],
      ['Grondslag termijn', a.rapport && a.rapport.beslistermijn ? a.rapport.beslistermijn.uitleg : ''],
      ['Ingebrekestelling', a.invoer.ingebrekeGesteld ? toonDatum(parseDatum(a.invoer.ingebrekestellingDatum)) : 'Nog niet verstuurd'],
      ['Besluit', a.invoer.besluitGenomen ? toonDatum(parseDatum(a.invoer.besluitDatum)) : 'Nog geen besluit'],
      ['Opschorting', a.invoer.opschortingDagen ? `${a.invoer.opschortingDagen} dagen` : 'Geen'],
    ]),

    b && b.dagen > 0 ? el('div', { class: 'kolomkop', tekst: 'Berekening' }) : null,
    b && b.dagen > 0 ? gegevensLijst([
      ['Eerste dwangsomdag', toonDatum(parseDatum(b.eersteDag))],
      ['Laatste dag geteld', b.laatsteDag ? toonDatum(parseDatum(b.laatsteDag)) : '–'],
      ['Aantal dagen', `${b.dagen} van 42`],
      ['Bedrag', euro(b.totaal) + (b.doorlopend ? ' (loopt door)' : '')],
      ['Maximum bereikt op', toonDatum(parseDatum(b.maximumOp))],
    ]) : null,

    (a.rapport && a.rapport.waarschuwingen || []).map((w) =>
      el('div', { class: 'melding melding--let-op', style: 'margin-top:12px' },
        el('strong', { tekst: w.titel }), el('p', { tekst: w.uitleg }))),
    (a.rapport && a.rapport.blokkades || []).map((w) =>
      el('div', { class: 'melding melding--fout', style: 'margin-top:12px' },
        el('strong', { tekst: w.titel }), el('p', { tekst: w.uitleg }))),

    el('div', { class: 'kolomkop', tekst: 'Documenten' }),
    el('div', { class: 'knoprij' },
      el('a', { class: 'knop knop--zacht knop--klein', href: `/api/beheer/aanvragen/${a.id}/brief?soort=ingebrekestelling` }, '⬇ Ingebrekestelling'),
      el('a', { class: 'knop knop--zacht knop--klein', href: `/api/beheer/aanvragen/${a.id}/brief?soort=claim` }, '⬇ Dwangsomclaim'),
      herberekenKnop,
    ),

    el('div', { class: 'kolomkop', tekst: `Notities (${a.notities.length})` }),
    a.notities.length === 0 ? el('p', { class: 'subtiel', style: 'font-size:.9rem', tekst: 'Nog geen notities.' }) : null,
    a.notities.map((n) => el('div', { class: 'notitie' },
      el('div', { class: 'notitie__meta', tekst: `${n.door} · ${datumTijd(n.op)}` }),
      el('div', { tekst: n.tekst }))),
    notitieVeld,
    el('div', { class: 'knoprij' }, notitieKnop),

    el('div', { class: 'kolomkop', tekst: 'Historie' }),
    el('ul', { class: 'tijdlijn' },
      a.historie.map((h) => el('li', { 'data-status': 'gehaald' },
        el('div', { class: 'tijdlijn__datum', tekst: datumTijd(h.op) }),
        el('div', { class: 'tijdlijn__label', tekst: h.tekst })))),
  );

  ladeHouder.textContent = '';
  const overlay = el('div', { class: 'overlay' });
  overlay.addEventListener('click', sluitLade);
  ladeHouder.append(overlay, lade);
  lade.querySelector('#sluit-lade').addEventListener('click', sluitLade);
  lade.scrollTop = 0;
}

// ------------------------------------------------------------- opstart ----

api('/api/beheer/sessie')
  .then((data) => (data.ingelogd ? toonDashboard() : toonInloggen()))
  .catch(toonInloggen);
