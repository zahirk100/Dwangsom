/** Beheeromgeving: overzicht, detaillade, statusbeheer en notities. */

import { euro } from '/shared/dwangsom.js';
import { parseDatum, toonDatum, vandaag, verschilDagen } from '/shared/datum.js';
import { labelBestuursorgaan } from '/shared/catalogus.js';
import { maskeerBsn, toonIban } from '/shared/identiteit.js';

const inloggenVak = document.getElementById('inloggen');
const dashboardVak = document.getElementById('dashboard');
const tabelBody = document.getElementById('tabel-body');
const leegVak = document.getElementById('leeg');
const ladeHouder = document.getElementById('lade-houder');

let statussen = [];
let soorten = [];
let rollen = [];
let ik = null;
let huidigSoort = 'alle';
let actieveAanvraag = null;
let actieveEisen = null;
let actieveMachtiging = null;
let bewerktGegevens = false;
let actieFilter = '';

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
  const data = await antwoord.json().catch(() => ({}));
  // 401 op de inlogroute zelf is een afgekeurd wachtwoord, geen verlopen
  // sessie; die moet de foutmelding gewoon in beeld krijgen.
  if (antwoord.status === 401 && !pad.startsWith('/api/beheer/login')) {
    toonInloggen();
    throw new Error('Niet ingelogd.');
  }
  if (!antwoord.ok) {
    const fout = new Error(data.fout || 'Er ging iets mis.');
    fout.velden = data.velden || {};
    fout.tweefactorNodig = Boolean(data.tweefactorNodig);
    throw fout;
  }
  return data;
}

// ------------------------------------------------------------- inloggen ---

/**
 * Welk scherm hoort hier? Er zijn er vier, en de sessie bepaalt welke:
 * de allereerste beheerder aanmaken, een uitnodiging inwisselen, gewoon
 * inloggen, of tweefactor afmaken omdat die nog niet staat.
 */
function toonInloggen(sessie = {}) {
  sluitLade();
  const uitnodiging = new URLSearchParams(location.search).get('uitnodiging');
  if (uitnodiging) {
    toonScherm('uitnodigingformulier');
    document.getElementById('uitnodiging-wachtwoord').focus();
    return;
  }
  if (sessie.tweefactorNodig) return void startTweefactor();
  if (sessie.eersteStart) {
    toonScherm('eersteformulier');
    document.getElementById('eerste-naam').focus();
    return;
  }
  toonScherm('inlogformulier');
  document.getElementById('email').focus();
}

function toonDashboard(gebruiker) {
  inloggenVak.classList.add('verborgen');
  dashboardVak.classList.remove('verborgen');
  ik = gebruiker || ik;
  rendereWieBenIk();
  laadLijst();
}

/** Eén van de inlogschermen tonen, de rest verbergen. */
function toonScherm(id) {
  inloggenVak.classList.remove('verborgen');
  dashboardVak.classList.add('verborgen');
  for (const naam of ['eersteformulier', 'uitnodigingformulier', 'inlogformulier', 'tweefactorvak']) {
    const knoop = document.getElementById(naam);
    if (knoop) knoop.classList.toggle('verborgen', naam !== id);
  }
}

function meldFout(vakId, bericht) {
  const vak = document.getElementById(vakId);
  vak.textContent = '';
  vak.append(el('div', { class: 'melding melding--fout', tekst: bericht }));
}

// ------------------------------------------------------------- inloggen ----

document.getElementById('eersteformulier').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/api/beheer/eerste-beheerder', {
      method: 'POST',
      body: JSON.stringify({
        naam: document.getElementById('eerste-naam').value,
        email: document.getElementById('eerste-email').value,
        wachtwoord: document.getElementById('eerste-wachtwoord').value,
      }),
    });
    ik = data.gebruiker;
    await startTweefactor();
  } catch (err) {
    meldFout('eerste-fout', err.message);
  }
});

document.getElementById('uitnodigingformulier').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = new URLSearchParams(location.search).get('uitnodiging');
  try {
    const data = await api('/api/beheer/uitnodiging', {
      method: 'POST',
      body: JSON.stringify({ token, wachtwoord: document.getElementById('uitnodiging-wachtwoord').value }),
    });
    ik = data.gebruiker;
    history.replaceState(null, '', '/beheer');
    await startTweefactor();
  } catch (err) {
    meldFout('uitnodiging-fout', err.message);
  }
});

document.getElementById('inlogformulier').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('inlog-fout').textContent = '';
  try {
    const data = await api('/api/beheer/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('email').value,
        wachtwoord: document.getElementById('wachtwoord').value,
        code: document.getElementById('code').value,
      }),
    });
    // Tweede factor gevraagd: het codeveld erbij, wachtwoord blijft staan.
    if (data.tweefactorNodig) {
      document.getElementById('codeveld').classList.remove('verborgen');
      document.getElementById('code').focus();
      return;
    }
    document.getElementById('wachtwoord').value = '';
    document.getElementById('code').value = '';
    ik = data.gebruiker;
    if (data.tweefactorInstellen) return startTweefactor();
    toonDashboard(data.gebruiker);
  } catch (err) {
    // Klopte de code niet, dan blijft het codeveld staan.
    if (err.tweefactorNodig) document.getElementById('codeveld').classList.remove('verborgen');
    meldFout('inlog-fout', err.message);
  }
});

document.getElementById('knop-uitloggen').addEventListener('click', async () => {
  await fetch('/api/beheer/logout', { method: 'POST' });
  ik = null;
  location.href = '/beheer';
});

// ------------------------------------------------------------ tweefactor ---

async function startTweefactor() {
  toonScherm('tweefactorvak');
  const vak = document.getElementById('tweefactor-inhoud');
  vak.textContent = 'Bezig…';
  let gegevens;
  try {
    gegevens = await api('/api/beheer/tweefactor/start', { method: 'POST', body: '{}' });
  } catch (err) {
    vak.textContent = '';
    vak.append(el('div', { class: 'melding melding--fout', tekst: err.message }));
    return;
  }

  vak.textContent = '';
  vak.append(
    el('a', { class: 'knop knop--primair', href: gegevens.otpauth, style: 'width:100%' },
      'Openen in mijn authenticator-app'),
    el('p', { class: 'qr-onder', style: 'margin-top:14px' }, 'Of voer deze sleutel met de hand in:'),
    el('code', { class: 'qr-geheim', tekst: gegevens.geheim }),
  );

  const codeveld = el('input', {
    type: 'text', id: 'tf-code', inputmode: 'numeric', maxlength: '6', placeholder: '123456',
    autocomplete: 'one-time-code',
  });
  const fout = el('div', {});
  const bevestig = el('button', { class: 'knop knop--primair', type: 'button', style: 'width:100%' },
    'Bevestigen');

  bevestig.addEventListener('click', async () => {
    fout.textContent = '';
    bevestig.disabled = true;
    try {
      const data = await api('/api/beheer/tweefactor/bevestig', {
        method: 'POST', body: JSON.stringify({ code: codeveld.value }),
      });
      toonHerstelcodes(data.herstelcodes);
    } catch (err) {
      bevestig.disabled = false;
      fout.append(el('div', { class: 'melding melding--fout', tekst: err.message }));
    }
  });

  vak.append(
    el('div', { class: 'veld', style: 'margin-top:20px' },
      el('label', { for: 'tf-code' }, 'Vul de code van zes cijfers in'), codeveld),
    fout, bevestig,
  );
  codeveld.focus();
}

/** De herstelcodes komen één keer in beeld en daarna nooit meer. */
function toonHerstelcodes(codes) {
  const vak = document.getElementById('tweefactor-inhoud');
  vak.textContent = '';
  const lijst = el('ul', { class: 'herstelcodes' });
  for (const code of codes) lijst.append(el('li', { tekst: code }));

  const verder = el('button', { class: 'knop knop--primair', type: 'button', style: 'width:100%; margin-top:18px' },
    'Ik heb ze bewaard, ga verder');
  verder.addEventListener('click', () => toonDashboard(ik));

  vak.append(
    el('div', { class: 'melding melding--goed' },
      el('strong', {}, 'Tweestapsverificatie staat aan'),
      el('p', {}, 'Bewaar onderstaande herstelcodes ergens veilig. Hiermee kom je binnen als je '
        + 'je telefoon kwijt bent. Elke code werkt één keer, en je ziet ze hierna niet meer.')),
    lijst,
    el('button', {
      class: 'knop knop--zacht knop--klein', type: 'button', style: 'margin-top:10px',
    }, 'Kopieer de codes'),
    verder,
  );
  vak.querySelector('.knop--zacht').addEventListener('click', (e) => {
    navigator.clipboard.writeText(codes.join('\n')).then(() => { e.target.textContent = 'Gekopieerd'; });
  });
}

// ---------------------------------------------------------- wie ben ik ----

function rendereWieBenIk() {
  const nav = document.getElementById('balk-nav');
  const bestaand = document.getElementById('wie-ben-ik');
  if (bestaand) bestaand.remove();
  if (!ik) return;
  const rol = (rollen.find((r) => r.id === ik.rol) || {}).label || ik.rol;
  // Op een telefoon past deze naam er niet bij; dan schoof de hele pagina
  // zijwaarts. Wie is ingelogd, staat ook onder Accounts.
  nav.prepend(el('span', {
    class: 'subtiel balk-weg-op-klein', id: 'wie-ben-ik',
    style: 'font-size:.84rem; margin-right:10px; white-space:nowrap',
    tekst: `${ik.naam || ik.email} (${rol})`,
  }));

  // Alleen een beheerder krijgt de knop naar het accountbeheer te zien.
  const knop = document.getElementById('knop-accounts');
  if (knop) knop.classList.toggle('verborgen', ik.rol !== 'beheerder');
}

// --------------------------------------------------------------- lijst ----

function filterQuery() {
  const params = new URLSearchParams();
  const zoek = document.getElementById('zoek').value.trim();
  if (zoek) params.set('zoek', zoek);
  params.set('status', document.getElementById('filter-status').value);
  params.set('bestuursorgaan', document.getElementById('filter-orgaan').value);
  params.set('soort', huidigSoort);
  if (actieFilter) params.set('actie', actieFilter);
  return params.toString();
}

async function laadLijst() {
  const data = await api(`/api/beheer/aanvragen?${filterQuery()}`);
  statussen = data.statussen;
  soorten = data.soorten || [];
  vulStatusfilter();
  rendereTabs(data.statistieken);
  rendereOpslagwaarschuwing(data.opslag, data.open);
  rendereKengetallen(data.statistieken);
  rendereTabel(data.aanvragen);
  const melding = document.getElementById('werklijst-melding');
  melding.textContent = '';
  if (actieFilter) {
    melding.append(el('div', { class: 'melding melding--info' },
      el('strong', {}, 'Werklijst: actie nodig'),
      el('p', {}, 'Alleen dossiers waarvan de bewaakte datum is bereikt. '),
      maakKnop('Alle dossiers tonen', () => { actieFilter = ''; laadLijst(); }, 'knop--zacht')));
  }
  document.getElementById('knop-export').href = `/api/beheer/export.csv?status=${document.getElementById('filter-status').value}`;
}

function vulStatusfilter() {
  const select = document.getElementById('filter-status');
  if (select.options.length > 1) return;
  for (const status of statussen) {
    select.append(el('option', { value: status.id }, status.label));
  }
}

/**
 * Zonder duurzame opslag (bijvoorbeeld op Vercel zonder database) verdwijnen
 * ingediende aanvragen zodra de functie afkoelt. Dat mag niemand ontgaan.
 */
function rendereOpslagwaarschuwing(opslag, open) {
  const vak = document.getElementById('opslag-waarschuwing');
  vak.textContent = '';

  if (open) {
    vak.append(el('div', { class: 'melding melding--let-op' },
      el('strong', {}, 'Testmodus: deze omgeving is niet afgeschermd'),
      el('p', {}, 'Iedereen met de link kan de dossiers van aanvragers inzien. '
        + 'Haal de omgevingsvariabele BEHEER_OPEN weg voordat u echte aanvragen '
        + 'binnenkrijgt; dan geldt het beheerwachtwoord weer.')));
  }

  if (!opslag || opslag.duurzaam) return;
  vak.append(el('div', { class: 'melding melding--fout' },
    el('strong', {}, 'Let op: aanvragen worden nu niet bewaard'),
    el('p', {}, `Deze omgeving draait op ${opslag.omschrijving}. Een zojuist ingediende `
      + 'aanvraag kan daardoor ontbreken in dit overzicht, en alles verdwijnt zodra de '
      + 'server herstart. Prima om de app te proberen, maar koppel een database '
      + '(KV_REST_API_URL en KV_REST_API_TOKEN) voordat u klanten naar deze site verwijst.')));
}

/**
 * Aanvragen en vooraanmeldingen zijn verschillend werk: het ene is vorderen,
 * het andere is een datum bewaken. Daarom staan ze uit elkaar.
 */
function rendereTabs(stats) {
  const houder = document.getElementById('soort-tabs');
  houder.textContent = '';
  const perSoort = (stats && stats.perSoort) || {};
  const alles = [{ id: 'alle', label: 'Alle dossiers', uitleg: '' }, ...soorten];

  for (const soort of alles) {
    const aantal = soort.id === 'alle'
      ? Object.values(perSoort).reduce((som, n) => som + n, 0)
      : (perSoort[soort.id] || 0);
    // Geen role="tab": dit zijn filterknoppen die de tabel opnieuw laden, geen
    // tabbladen met panelen. aria-pressed beschrijft dat eerlijk.
    const knop = el('button', {
      class: 'tab', type: 'button',
      'aria-pressed': String(soort.id === huidigSoort),
    }, soort.label, el('span', { class: 'tab__aantal', tekst: String(aantal) }));
    knop.addEventListener('click', () => {
      huidigSoort = soort.id;
      laadLijst();
    });
    houder.append(knop);
  }

  const gekozen = alles.find((s) => s.id === huidigSoort);
  const uitleg = document.getElementById('tab-uitleg') || el('p', { class: 'tab__uitleg', id: 'tab-uitleg' });
  uitleg.textContent = gekozen && gekozen.uitleg ? gekozen.uitleg : '';
  houder.after(uitleg);
}

/** Hoe dringend is de bewaakte datum? */
function termijn(datum) {
  if (!datum) return { tekst: '', kleur: '', titel: '' };
  const dagen = verschilDagen(vandaag(), parseDatum(datum));
  if (dagen < 0) return { tekst: `${-dagen} d te laat`, kleur: 'rood', titel: toonDatum(parseDatum(datum)) };
  if (dagen === 0) return { tekst: 'vandaag', kleur: 'oranje', titel: toonDatum(parseDatum(datum)) };
  if (dagen <= 7) return { tekst: `over ${dagen} d`, kleur: 'oranje', titel: toonDatum(parseDatum(datum)) };
  return { tekst: `over ${dagen} d`, kleur: '', titel: toonDatum(parseDatum(datum)) };
}

function rendereKengetallen(stats) {
  const vak = document.getElementById('kengetallen');
  vak.textContent = '';
  const items = [
    { label: 'Open dossiers', waarde: String(stats.open) },
    { label: 'Actie nodig', waarde: String(stats.actieNodig || 0), filter: 'nodig',
      uitleg: 'Dossiers waarvan de bewaakte datum is bereikt' },
    { label: 'Met opgebouwd recht', waarde: String(stats.metRecht) },
    { label: 'Openstaande claimwaarde', waarde: euro(stats.totaalBedrag),
      uitleg: 'Opgebouwd recht in dossiers die nog niet zijn afgehandeld' },
    { label: 'Toegekend', waarde: euro(stats.toegekendBedrag || 0),
      uitleg: `Vastgelegd in ${stats.toegekendAantal || 0} afgehandelde dossiers` },
  ];
  for (const item of items) {
    const kaart = el('div', {
      class: `kaart kengetal${item.filter ? ' kengetal--knop' : ''}`,
      title: item.uitleg || '',
      'aria-pressed': item.filter ? String(actieFilter === item.filter) : null,
    },
      el('div', { class: 'kengetal__label', tekst: item.label }),
      el('div', { class: 'kengetal__waarde', tekst: item.waarde }));

    // De werklijst: waar moet vandaag iets gebeuren? Dat is waar een
    // behandelaar zijn dag mee begint, dus dat hoort één klik te zijn.
    if (item.filter) {
      kaart.setAttribute('role', 'button');
      kaart.setAttribute('tabindex', '0');
      const schakel = () => {
        actieFilter = actieFilter === item.filter ? '' : item.filter;
        laadLijst();
      };
      kaart.addEventListener('click', schakel);
      kaart.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); schakel(); } });
    }
    vak.append(kaart);
  }
}

function rendereTabel(aanvragen) {
  tabelBody.textContent = '';
  leegVak.classList.toggle('verborgen', aanvragen.length > 0);
  for (const a of aanvragen) {
    const uitkomst = UITKOMST_LABEL[a.uitkomst] || { tekst: a.uitkomst || '\u2013', kleur: '' };
    const status = statussen.find((s) => s.id === a.status);
    const klok = termijn(a.actiedatum);

    const rij = el('tr', { tabindex: '0' },
      el('td', {},
        el('strong', { tekst: a.referentie }),
        el('div', { class: 'subtiel', style: 'font-size:.78rem', tekst: a.soortLabel })),
      el('td', {}, el('div', { tekst: a.naam }), el('div', { class: 'subtiel', style: 'font-size:.82rem', tekst: a.email })),
      el('td', {},
        el('div', { tekst: a.zaaktype }),
        el('div', { class: 'subtiel', style: 'font-size:.82rem', tekst: a.organisatienaam || labelBestuursorgaan(a.bestuursorgaan) })),
      el('td', {}, chip(uitkomst.tekst, uitkomst.kleur)),
      el('td', { class: 'bedrag', tekst: a.bedrag ? euro(a.bedrag) + (a.doorlopend ? ' \u2191' : '') : '\u2013' }),
      el('td', { title: klok.titel },
        a.actiedatum
          ? el('div', {}, chip(klok.tekst, klok.kleur),
              el('div', { class: 'subtiel', style: 'font-size:.78rem', tekst: a.actieLabel }))
          : el('span', { class: 'subtiel', tekst: '\u2013' })),
      el('td', {}, (() => {
        const tekort = (a.stukkenOntbreken || 0) + (a.gegevensOntbreken || 0);
        if (a.bedragToegekend !== null && a.bedragToegekend !== undefined) {
          return chip(`${euro(a.bedragToegekend)} toegekend`, 'groen');
        }
        return tekort === 0 ? chip('Compleet', 'groen') : chip(`${tekort} ontbreekt`, 'oranje');
      })()),
      el('td', {}, chip(a.statusLabel, status ? status.kleur : '')),
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
document.getElementById('knop-accounts').addEventListener('click', openAccounts);

// ---------------------------------------------------------------- lade ----

function sluitLade() {
  ladeHouder.textContent = '';
  actieveAanvraag = null;
}

/** Een lade met een eigen titel en inhoud, voor alles wat geen dossier is. */
function toonLade(titel, inhoud) {
  const lade = el('div', { class: 'lade' },
    el('div', { class: 'lade__kop' },
      el('h2', { style: 'margin:0; font-size:1.2rem', tekst: titel }),
      el('button', {
        class: 'knop knop--stil knop--klein', type: 'button', id: 'sluit-lade',
        style: 'margin-left:auto',
      }, '\u2715')),
    inhoud);

  ladeHouder.textContent = '';
  const overlay = el('div', { class: 'overlay' });
  overlay.addEventListener('click', sluitLade);
  ladeHouder.append(overlay, lade);
  lade.querySelector('#sluit-lade').addEventListener('click', sluitLade);
  lade.scrollTop = 0;
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sluitLade(); });

async function openLade(id) {
  bewerktGegevens = false;
  const data = await api(`/api/beheer/aanvragen/${id}`);
  actieveAanvraag = data.aanvraag;
  actieveEisen = data.eisen || { gegevens: [], stukken: [] };
  actieveMachtiging = data.machtiging || null;
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
          machtigingChip(a),
        )),
      el('button', { class: 'knop knop--stil knop--klein', type: 'button', id: 'sluit-lade', style: 'margin-left:auto' }, '✕'),
    ),

    el('div', { class: 'melding melding--info' },
      el('strong', { tekst: a.rapport ? a.rapport.kop : 'Geen berekening' }),
      el('p', { tekst: a.rapport ? a.rapport.samenvatting : '' })),

    ontbrekendeGegevens(a).length ? el('div', { class: 'melding melding--let-op' },
      el('strong', {}, 'Dit ontbreekt nog om te kunnen indienen'),
      el('p', { tekst: `${ontbrekendeGegevens(a).map((g) => g.label).join(', ')}. `
        + 'Vul aan onder Aanvrager; bellen gaat sneller dan mailen.' })) : null,

    el('div', { class: 'kolomkop', tekst: 'Volgende stap' }),
    volgendeStapBlok(a),

    el('div', { class: 'kolomkop', tekst: 'Status' }),
    statusSelect,

    el('div', { class: 'kolomkop', tekst: 'Aanvrager' }),
    aanvragerBlok(a),
    a.contact.toelichting
      ? el('div', { class: 'notitie', style: 'margin-top:10px' },
          el('div', { class: 'notitie__meta', tekst: 'Toelichting van de aanvrager' }),
          el('div', { tekst: a.contact.toelichting }))
      : null,

    el('div', { class: 'kolomkop', tekst: 'Zaak' }),
    gegevensLijst([
      ['Soort dossier', labelSoort(a.soort)],
      ['Actie op', a.actiedatum
        ? `${toonDatum(parseDatum(a.actiedatum))} (${termijn(a.actiedatum).tekst})`
        : 'geen datum te bewaken'],
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

    a.brief ? el('div', { class: 'kolomkop', tekst: 'Brief van de aanvrager' }) : null,
    a.brief ? briefBlok(a) : null,

    el('div', { class: 'kolomkop', tekst: 'Stukken' }),
    stukkenBlok(a),

    el('div', { class: 'kolomkop', tekst: 'Machtiging' }),
    machtigingBlok(a),

    el('div', { class: 'kolomkop', tekst: 'Documenten' }),
    brievenBlok(a, herberekenKnop),

    el('div', { class: 'kolomkop', tekst: 'Correspondentie' }),
    correspondentieBlok(a),

    el('div', { class: 'kolomkop', tekst: 'Afhandeling' }),
    afhandelingBlok(a),

    el('div', { class: 'kolomkop', tekst: `Notities (${a.notities.length})` }),
    a.notities.length === 0 ? el('p', { class: 'subtiel', style: 'font-size:.9rem', tekst: 'Nog geen notities.' }) : null,
    a.notities.map((n) => el('div', { class: 'notitie' },
      el('div', { class: 'notitie__meta', tekst: `${n.door}, ${datumTijd(n.op)}` }),
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

/**
 * Onze eigen brieven: opstellen, en bewaren in het dossier.
 *
 * Downloaden alleen was niet genoeg. Een brief die in de map Downloads van
 * een behandelaar staat, is voor het dossier niet verstuurd - en de volgende
 * behandelaar kan niet zien wat er precies de deur uit is gegaan.
 */
function brievenBlok(a, herberekenKnop) {
  const houder = el('div', {});
  const melding = el('div', {});

  async function bewaar(soort, knop) {
    knop.disabled = true;
    const oudeTekst = knop.textContent;
    knop.textContent = 'Bezig…';
    try {
      const data = await api(`/api/beheer/aanvragen/${a.id}/brief`, {
        method: 'POST', body: JSON.stringify({ soort }),
      });
      actieveAanvraag = data.aanvraag;
      rendereLade();
    } catch (err) {
      knop.disabled = false;
      knop.textContent = oudeTekst;
      melding.textContent = '';
      melding.append(el('div', { class: 'melding melding--fout' }, el('strong', { tekst: err.message })));
    }
  }

  for (const [soort, label] of [['ingebrekestelling', 'Ingebrekestelling'], ['claim', 'Dwangsomclaim']]) {
    const bewaarKnop = el('button', { class: 'knop knop--stil knop--klein', type: 'button' },
      'In dossier bewaren');
    bewaarKnop.addEventListener('click', () => bewaar(soort, bewaarKnop));
    houder.append(el('div', { class: 'knoprij' },
      el('a', {
        class: 'knop knop--zacht knop--klein',
        href: `/api/beheer/aanvragen/${a.id}/brief?soort=${soort}`,
      }, `\u2b07 ${label}`),
      bewaarKnop));
  }
  houder.append(el('div', { class: 'knoprij' }, herberekenKnop), melding);
  return houder;
}

/**
 * Alles wat bij deze zaak hoort maar geen gevraagd stuk is: onze verstuurde
 * brieven, een e-mailwisseling, post die de instantie rechtstreeks naar de
 * aanvrager stuurde.
 */
function correspondentieBlok(a) {
  const houder = el('div', {});
  const eigen = (a.bestanden || []).filter((b) => b.stukId === 'correspondentie');
  const post = (a.bestanden || []).filter((b) => b.stukId === 'nieuwe-post');

  if (post.length) {
    houder.append(el('div', { class: 'melding melding--let-op' },
      el('strong', {}, `Post van de instantie (${post.length})`),
      el('p', {}, 'De aanvrager kreeg dit rechtstreeks toegestuurd. Controleer of het de '
        + 'berekening verandert.'),
      bestandenlijst(a, post)));
  }

  houder.append(eigen.length
    ? bestandenlijst(a, eigen)
    : el('p', { class: 'subtiel', style: 'font-size:.9rem', tekst: 'Nog niets in het dossier gehangen.' }));

  houder.append(uploadknop(a, 'correspondentie', 'Document toevoegen'));
  return houder;
}

/**
 * Eén uploadknop, overal dezelfde. `stukId` bepaalt waar het bestand landt.
 */
function uploadknop(a, stukId, label) {
  const fout = el('div', {});
  const invoer = el('input', {
    type: 'file', accept: '.pdf,.txt,application/pdf,text/plain,image/*',
    class: 'verborgen-invoer',
  });
  const knop = el('button', { class: 'knop knop--zacht knop--klein', type: 'button' }, label);
  knop.addEventListener('click', () => invoer.click());

  invoer.addEventListener('change', async () => {
    const bestand = invoer.files && invoer.files[0];
    if (!bestand) return;
    fout.textContent = '';
    knop.disabled = true;
    knop.textContent = 'Bezig met uploaden…';
    try {
      const bytes = new Uint8Array(await bestand.arrayBuffer());
      let ruw = '';
      for (let i = 0; i < bytes.length; i += 8192) ruw += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const data = await api(`/api/beheer/aanvragen/${a.id}/bestanden`, {
        method: 'POST',
        body: JSON.stringify({
          stukId, bestandsnaam: bestand.name, mediaType: bestand.type, data: btoa(ruw),
        }),
      });
      actieveAanvraag = data.aanvraag;
      rendereLade();
      laadLijst();
    } catch (err) {
      knop.disabled = false;
      knop.textContent = label;
      fout.textContent = '';
      fout.append(el('div', { class: 'melding melding--fout' }, el('strong', { tekst: err.message })));
    }
  });

  return el('div', { style: 'margin-top:10px' }, invoer, knop, fout);
}

/**
 * De stukken die bij deze zaak horen, met een vinkje per stuk. Zo houdt de
 * behandelaar bij wat binnen is, en ziet iedereen in een oogopslag waar het
 * dossier op wacht.
 */
function stukkenBlok(a) {
  const stukken = (actieveEisen && actieveEisen.stukken) || [];
  if (stukken.length === 0) {
    return el('p', { class: 'subtiel', style: 'font-size:.9rem', tekst: 'Voor deze zaak zijn geen stukken nodig.' });
  }

  const houder = el('div', {});
  for (const stuk of stukken) {
    const aangevinkt = Boolean(a.stukken && a.stukken[stuk.id]);
    const vakje = el('input', { type: 'checkbox', checked: aangevinkt });
    vakje.checked = aangevinkt;
    vakje.addEventListener('change', async () => {
      const data = await api(`/api/beheer/aanvragen/${a.id}/stukken`, {
        method: 'POST', body: JSON.stringify({ stukken: { [stuk.id]: vakje.checked } }),
      });
      actieveAanvraag = data.aanvraag;
      rendereLade();
      laadLijst();
    });
    // Wat de aanvrager hiervoor uploadde, meteen te openen. Anders moet een
    // behandelaar hem bellen voor iets dat hij al heeft opgestuurd.
    const bijlagen = (a.bestanden || []).filter((b) => b.stukId === stuk.id);
    // Het vinkje zegt alleen dát iets binnen is. Hier kan het stuk er ook echt
    // in: wat de aanvrager opstuurt per e-mail, of wat wij zelf ontvangen.
    houder.append(el('div', { class: 'stuk-blok' },
      el('label', { class: 'stuk-rij' }, vakje,
        el('span', {},
          el('span', { tekst: stuk.label }),
          stuk.door === 'wij' ? chip('wij regelen dit', 'blauw') : null,
          stuk.verplicht ? null : chip('optioneel', ''),
          bijlagen.length ? chip(`${bijlagen.length} bestand${bijlagen.length === 1 ? '' : 'en'}`, 'groen') : null,
          el('span', { class: 'stuk-rij__uitleg', style: 'display:block', tekst: stuk.uitleg }))),
      bijlagen.length ? bestandenlijst(a, bijlagen) : null,
      uploadknop(a, stuk.id, 'Bestand toevoegen')));
  }

  return houder;
}

/** Downloadlinks bij een stuk. */
function bestandenlijst(a, bestanden) {
  const lijst = el('ul', { class: 'bijlagen' });
  for (const bestand of bestanden) {
    const wis = el('button', { class: 'bijlagen__wis', type: 'button', title: 'Uit het dossier halen' }, '\u2715');
    wis.addEventListener('click', async () => {
      // Een bestand weghalen is niet terug te draaien; de historie houdt wel
      // bij wie het deed.
      if (!window.confirm(`"${bestand.bestandsnaam}" uit het dossier halen?`)) return;
      wis.disabled = true;
      const data = await api(`/api/beheer/aanvragen/${a.id}/bestanden/${bestand.id}`, { method: 'DELETE' });
      actieveAanvraag = data.aanvraag;
      rendereLade();
      laadLijst();
    });
    lijst.append(el('li', {},
      el('a', {
        href: `/api/beheer/aanvragen/${a.id}/bestanden/${bestand.id}`,
        target: '_blank', rel: 'noopener',
        tekst: bestand.bestandsnaam,
      }),
      el('span', { class: 'bijlagen__meta',
        tekst: `${bestand.doorKlant ? 'door de aanvrager' : `door ${bestand.door || 'ons'}`}`
          + `${bestand.aangemaaktOp ? ` op ${datumTijd(bestand.aangemaaktOp)}` : ''}`
          + `${bestand.toelichting ? ` \u00b7 ${bestand.toelichting}` : ''}` }),
      wis));
  }
  return lijst;
}

/**
 * Machtiging: in één klik opgemaakt uit de gegevens die al bekend zijn, en
 * daarna bijhouden of hij verstuurd en ondertekend terug is.
 */
/**
 * Wat de machtiging op dít moment is, niet wat wij ervan hopen.
 *
 * Hier stond "Machtiging gewenst" boven een dossier waarin de aanvrager al
 * digitaal had getekend. Een behandelaar die dat leest, gaat bellen over iets
 * dat al binnen is.
 */
function machtigingChip(a) {
  const m = a.machtiging || {};
  if (m.ondertekendOp) return chip('Digitaal getekend', 'groen');
  if (m.ontvangenOp) return chip('Machtiging binnen', 'groen');
  if (m.verstuurdOp) return chip('Machtiging verstuurd', 'blauw');
  if (a.contact && a.contact.machtiging) return chip('Machtiging nodig', 'oranje');
  return chip('Geen machtiging');
}

function machtigingBlok(a) {
  const status = actieveMachtiging || {};
  const houder = el('div', {});

  const ontbreekt = status.ontbrekendeGegevens || [];
  if (ontbreekt.length) {
    houder.append(el('div', { class: 'melding melding--let-op' },
      el('strong', {}, 'Nog niet compleet'),
      el('p', { tekst: `Deze gegevens van de aanvrager ontbreken en komen als invulregel op de `
        + `machtiging: ${ontbreekt.join(', ')}.` })));
  }
  const eigenGegevens = status.ontbrekendeOrganisatiegegevens || [];
  if (eigenGegevens.length) {
    houder.append(el('div', { class: 'melding melding--let-op' },
      el('strong', {}, 'Onze eigen gegevens ontbreken'),
      el('p', { tekst: `Stel deze omgevingsvariabelen in, anders staan ze als invulregel op het `
        + `document: ${eigenGegevens.join(', ')}.` })));
  }

  if (a.handtekening && a.handtekening.afbeelding) {
    houder.append(el('div', { class: 'melding melding--goed' },
      el('strong', {}, 'Digitaal ondertekend'),
      el('p', { tekst: `De aanvrager heeft op ${datumTijd(a.handtekening.gezetOp)} getekend. `
        + 'De handtekening staat al in het document.' })));
    houder.append(el('img', {
      src: a.handtekening.afbeelding, alt: 'Gezette handtekening', class: 'handtekening-voorbeeld',
    }));
  }

  const regels = [];
  if (status.ondertekendOp) regels.push(`Digitaal getekend op ${datumTijd(status.ondertekendOp)}`);
  if (status.verstuurdOp) regels.push(`Verstuurd op ${datumTijd(status.verstuurdOp)}`);
  if (status.ontvangenOp) regels.push(`Ondertekend ontvangen op ${datumTijd(status.ontvangenOp)}`);
  houder.append(el('p', { class: 'subtiel', style: 'font-size:.9rem; margin:0 0 10px',
    tekst: regels.length ? regels.join('. ') : 'Nog niet verstuurd.' }));

  async function zet(actie) {
    const data = await api(`/api/beheer/aanvragen/${a.id}/machtiging`, {
      method: 'POST', body: JSON.stringify({ actie }),
    });
    actieveAanvraag = data.aanvraag;
    actieveMachtiging = { ...actieveMachtiging, ...(data.aanvraag.machtiging || {}) };
    rendereLade();
    laadLijst();
  }

  const digitaal = Boolean(status.ondertekendOp);
  const knoppen = el('div', { class: 'knoprij' },
    el('a', {
      class: 'knop knop--primair knop--klein',
      href: `/api/beheer/aanvragen/${a.id}/machtiging`,
      target: '_blank', rel: 'noopener',
    }, digitaal ? 'Machtiging openen' : 'Opstellen en afdrukken'),
  );

  // Is er digitaal getekend, dan is de papieren route niet de gewone gang van
  // zaken maar een uitzondering: sommige bestuursorganen willen een natte
  // handtekening. Die knoppen horen dan niet als volgende stap te oogsten.
  if (digitaal) {
    houder.append(knoppen);
    if (!status.verstuurdOp && !status.ontvangenOp) {
      const extra = el('details', { class: 'papierroute' },
        el('summary', {}, 'Toch per post laten tekenen'),
        el('p', { class: 'subtiel', style: 'font-size:.88rem; margin:8px 0' },
          'Alleen nodig als het bestuursorgaan een natte handtekening eist. De digitale '
          + 'machtiging blijft in het dossier staan.'));
      const papier = el('div', { class: 'knoprij' },
        maakKnop('Markeer als verstuurd', () => zet('verstuurd'), 'knop--stil'),
        maakKnop('Ondertekend ontvangen', () => zet('ontvangen'), 'knop--stil'));
      extra.append(papier);
      houder.append(extra);
    } else {
      houder.append(el('div', { class: 'knoprij' },
        maakKnop('Terugzetten', () => zet('ingetrokken'), 'knop--stil')));
    }
    return houder;
  }

  if (!status.verstuurdOp) {
    knoppen.append(maakKnop('Markeer als verstuurd', () => zet('verstuurd')));
  }
  if (!status.ontvangenOp) {
    knoppen.append(maakKnop('Ondertekend ontvangen', () => zet('ontvangen')));
  } else {
    knoppen.append(maakKnop('Terugzetten', () => zet('ingetrokken'), 'knop--stil'));
  }
  houder.append(knoppen);
  return houder;
}

/** De brief waarmee de aanvrager binnenkwam, met de tekst die wij eruit lazen. */
function briefBlok(a) {
  const brief = a.brief;
  const bron = { pdf: 'pdf', geplakt: 'geplakte tekst', tekst: 'tekstbestand' }[brief.bron] || brief.bron;
  const houder = el('div', {});
  houder.append(gegevensLijst([
    ['Bestand', brief.bestandsnaam || `(${bron})`],
    ['Ingelezen als', bron],
    ['Omvang', `${brief.tekens} tekens`],
    ['Tweede brief', a.verlengbrief ? (a.verlengbrief.bestandsnaam || 'ja') : 'geen'],
  ]));
  const inklap = el('details', { style: 'margin-top:10px' },
    el('summary', { class: 'subtiel', style: 'cursor:pointer; font-size:.9rem' }, 'Tekst uit de brief tonen'),
    el('pre', { class: 'brieftekst', tekst: brief.tekst }));
  houder.append(inklap);
  return houder;
}

/** De lijst levert soortLabel mee, de detailweergave niet. Hier dus zelf opzoeken. */
function labelSoort(id) {
  const gevonden = soorten.find((s) => s.id === id);
  // De tabbladen gebruiken het meervoud; hier gaat het om dit ene dossier.
  return gevonden ? (gevonden.enkelvoud || gevonden.label) : 'Beoordeling';
}

function maakKnop(tekst, bijKlik, extraClass = 'knop--zacht') {
  const knop = el('button', { class: `knop ${extraClass} knop--klein`, type: 'button' }, tekst);
  knop.addEventListener('click', bijKlik);
  return knop;
}

/**
 * Eén weg voor alles wat de behandelaar aan een dossier verandert. Na afloop
 * is het dossier opnieuw doorgerekend, dus de lade en de lijst moeten allebei
 * ververst worden.
 */
async function werkBij(id, body, foutVak) {
  if (foutVak) foutVak.textContent = '';
  try {
    const data = await api(`/api/beheer/aanvragen/${id}/bijwerken`, {
      method: 'POST', body: JSON.stringify(body),
    });
    actieveAanvraag = data.aanvraag;
    if (data.eisen) actieveEisen = data.eisen;
    bewerktGegevens = false;
    rendereLade();
    laadLijst();
    return true;
  } catch (err) {
    if (foutVak) foutVak.append(el('div', { class: 'melding melding--fout', tekst: err.message }));
    return false;
  }
}

/**
 * Wat is de eerstvolgende handeling in dit dossier, en kan die hier meteen
 * worden vastgelegd? Zonder dit blijft een dossier hangen: de behandelaar
 * verstuurt wel een ingebrekestelling, maar het systeem weet daar niets van.
 */
function volgendeStapBlok(a) {
  const invoer = a.invoer || {};
  const vervolg = (a.rapport && a.rapport.vervolg) || {};
  const houder = el('div', {});
  const fout = el('div', {});
  const klok = termijn(a.actiedatum);

  houder.append(el('div', { class: `melding melding--${klok.kleur === 'rood' ? 'fout' : (klok.kleur === 'oranje' ? 'let-op' : 'info')}` },
    el('strong', { tekst: vervolg.actieLabel || 'Geen actie gepland' }),
    el('p', { tekst: [
      a.actiedatum ? `${toonDatum(parseDatum(a.actiedatum))} (${klok.tekst}).` : 'Geen datum om te bewaken.',
      vervolg.actieUitleg || '',
    ].filter(Boolean).join(' ') })));

  const knoppen = el('div', { class: 'knoprij' });

  if (!invoer.ingebrekeGesteld) {
    // "Wij verstuurden" vinkt ook de twee bewijsstukken af: die zitten dan in
    // ons eigen dossier en hoeven niet bij de aanvrager te worden opgehaald.
    knoppen.append(datumActie('Ingebrekestelling verstuurd (door ons)', a, fout, (datum) => ({
      invoer: { ingebrekeGesteld: true, ingebrekestellingDatum: datum, ingebrekestellingDoorOns: true },
      toelichting: `Ingebrekestelling door ons verstuurd op ${datum}.`,
    })));
    knoppen.append(datumActie('Aanvrager stelde zelf in gebreke', a, fout, (datum) => ({
      invoer: { ingebrekeGesteld: true, ingebrekestellingDatum: datum, ingebrekestellingDoorOns: false },
      toelichting: `Aanvrager stelde zelf in gebreke op ${datum}; brief en verzendbewijs opvragen.`,
    })));
  }
  if (!invoer.besluitGenomen) {
    knoppen.append(datumActie('Besluit ontvangen', a, fout, (datum) => ({
      invoer: { besluitGenomen: true, besluitDatum: datum },
      toelichting: `Besluit van het bestuursorgaan ontvangen op ${datum}.`,
    })));
  }

  const herbereken = maakKnop('Opnieuw doorrekenen', async () => {
    await werkBij(a.id, { toelichting: 'Zaak opnieuw doorgerekend op vandaag.' }, fout);
  }, 'knop--stil');
  knoppen.append(herbereken);

  houder.append(knoppen, fout);
  return houder;
}

/**
 * De gegevens van de aanvrager, met de mogelijkheid ze hier te corrigeren.
 * Dat is het verschil tussen "even de klant mailen" en het gewoon invullen
 * wat je aan de telefoon hoort.
 */
function aanvragerBlok(a) {
  if (!bewerktGegevens) {
    const houder = el('div', {});
    houder.append(gegevensLijst([
      ['Naam', a.contact.naam],
      ['E-mail', a.contact.email],
      ['Telefoon', a.contact.telefoon],
      ['Adres', [a.contact.adres, a.contact.postcode].filter(Boolean).join(', ')],
      ['Woonplaats', a.contact.woonplaats],
      ['Geboortedatum', a.contact.geboortedatum],
      ['Burgerservicenummer', maskeerBsn(a.contact.bsn)],
      ['IBAN', a.contact.iban ? toonIban(a.contact.iban) : ''],
      ['Kenmerk', a.contact.kenmerk],
      ['Ontvangen op', datumTijd(a.aangemaaktOp)],
    ]));
    houder.append(el('div', { class: 'knoprij' },
      maakKnop('Gegevens aanvullen of corrigeren', () => { bewerktGegevens = true; rendereLade(); })));
    return houder;
  }

  const velden = [
    ['naam', 'Naam', 'text'], ['email', 'E-mailadres', 'email'], ['telefoon', 'Telefoon', 'tel'],
    ['adres', 'Adres', 'text'], ['postcode', 'Postcode', 'text'], ['woonplaats', 'Woonplaats', 'text'],
    ['geboortedatum', 'Geboortedatum', 'date'], ['bsn', 'Burgerservicenummer', 'text'],
    ['iban', 'IBAN', 'text'], ['kenmerk', 'Kenmerk of zaaknummer', 'text'],
  ];
  const nodig = new Set(ontbrekendeGegevens(a).map((g) => g.id));
  const invoervelden = {};
  const formulier = el('div', {});
  const fout = el('div', {});

  for (const [id, label, type] of velden) {
    const invoerveld = el('input', { type, id: `bw-${id}`, maxlength: '160' });
    invoerveld.value = a.contact[id] || '';
    invoervelden[id] = invoerveld;
    formulier.append(el('div', { class: 'veld', style: 'margin-bottom:12px' },
      el('label', { for: `bw-${id}` }, label,
        nodig.has(id) ? chip('nodig om in te dienen', 'oranje') : null),
      invoerveld,
      el('p', { class: 'veld__fout verborgen', 'data-fout': id })));
  }

  const opslaan = maakKnop('Opslaan', async () => {
    for (const id of Object.keys(invoervelden)) zetFout(id, '');
    const contact = Object.fromEntries(Object.entries(invoervelden).map(([id, veld]) => [id, veld.value]));
    try {
      const data = await api(`/api/beheer/aanvragen/${a.id}/bijwerken`, {
        method: 'POST', body: JSON.stringify({ contact }),
      });
      actieveAanvraag = data.aanvraag;
      if (data.eisen) actieveEisen = data.eisen;
      bewerktGegevens = false;
      rendereLade();
      laadLijst();
    } catch (err) {
      const velden2 = err.velden || {};
      if (Object.keys(velden2).length) {
        for (const [id, tekst] of Object.entries(velden2)) zetFout(id, tekst);
      } else {
        fout.append(el('div', { class: 'melding melding--fout', tekst: err.message }));
      }
    }
  }, 'knop--primair');

  formulier.append(el('div', { class: 'knoprij' }, opslaan,
    maakKnop('Annuleren', () => { bewerktGegevens = false; rendereLade(); }, 'knop--stil')), fout);
  return formulier;
}

function zetFout(id, tekst) {
  const knoop = document.querySelector(`.lade [data-fout="${id}"]`);
  if (!knoop) return;
  knoop.textContent = tekst || '';
  knoop.classList.toggle('verborgen', !tekst);
}

/**
 * De uitkomst van de zaak vastleggen. Zonder dit blijft een dossier hangen op
 * een status zonder cijfers erachter, en is achteraf niet te zien wat het
 * heeft opgeleverd.
 */
function afhandelingBlok(a) {
  const huidig = a.afhandeling || {};
  const berekening = (a.rapport && a.rapport.berekening) || {};
  const houder = el('div', {});
  const fout = el('div', {});

  if (huidig.vastgelegdOp) {
    houder.append(gegevensLijst([
      ['Toegekend bedrag', Number.isFinite(huidig.bedragToegekend) ? euro(huidig.bedragToegekend) : 'niet ingevuld'],
      ['Beschikking op', huidig.beschikkingOp ? toonDatum(parseDatum(huidig.beschikkingOp)) : ''],
      ['Uitbetaald op', huidig.uitbetaaldOp ? toonDatum(parseDatum(huidig.uitbetaaldOp)) : 'nog niet'],
      ['Vastgelegd op', datumTijd(huidig.vastgelegdOp)],
    ]));
    if (huidig.toelichting) {
      houder.append(el('div', { class: 'notitie' }, el('div', { tekst: huidig.toelichting })));
    }
  }

  const bedrag = el('input', { type: 'number', step: '0.01', min: '0', id: 'af-bedrag' });
  bedrag.value = Number.isFinite(huidig.bedragToegekend)
    ? String(huidig.bedragToegekend)
    : (berekening.totaal ? String(berekening.totaal) : '');
  const beschikking = el('input', { type: 'date', id: 'af-beschikking' });
  beschikking.value = huidig.beschikkingOp || '';
  const uitbetaald = el('input', { type: 'date', id: 'af-uitbetaald' });
  uitbetaald.value = huidig.uitbetaaldOp || '';
  const toelichting = el('textarea', { id: 'af-toelichting', rows: '2' });
  toelichting.value = huidig.toelichting || '';
  const status = el('select', { id: 'af-status' },
    el('option', { value: '' }, 'Status ongewijzigd laten'),
    statussen.map((st) => el('option', { value: st.id }, st.label)));

  houder.append(
    el('div', { class: 'rij' },
      el('div', { class: 'veld' }, el('label', { for: 'af-bedrag' }, 'Toegekend bedrag'), bedrag),
      el('div', { class: 'veld' }, el('label', { for: 'af-beschikking' }, 'Datum beschikking'), beschikking)),
    el('div', { class: 'rij' },
      el('div', { class: 'veld' }, el('label', { for: 'af-uitbetaald' }, 'Uitbetaald op'), uitbetaald),
      el('div', { class: 'veld' }, el('label', { for: 'af-status' }, 'Status'), status)),
    el('div', { class: 'veld' }, el('label', { for: 'af-toelichting' }, 'Toelichting'), toelichting),
    el('div', { class: 'knoprij' }, maakKnop('Afhandeling vastleggen', async () => {
      fout.textContent = '';
      try {
        const data = await api(`/api/beheer/aanvragen/${a.id}/afhandeling`, {
          method: 'POST',
          body: JSON.stringify({
            bedragToegekend: bedrag.value === '' ? null : Number(bedrag.value),
            beschikkingOp: beschikking.value,
            uitbetaaldOp: uitbetaald.value,
            toelichting: toelichting.value,
            status: status.value || null,
          }),
        });
        actieveAanvraag = data.aanvraag;
        rendereLade();
        laadLijst();
      } catch (err) {
        fout.append(el('div', { class: 'melding melding--fout', tekst: err.message }));
      }
    }, 'knop--primair')),
    fout,
  );
  return houder;
}

/** Een knop die eerst een datum vraagt en die daarna vastlegt. */
function datumActie(label, a, foutVak, maakBody) {
  const houder = el('span', { style: 'display:inline-flex; gap:6px; align-items:center' });
  const knop = maakKnop(label, () => {
    knop.classList.add('verborgen');
    const datum = el('input', { type: 'date', style: 'max-width:160px' });
    datum.value = new Date().toISOString().slice(0, 10);
    const bevestig = maakKnop('Vastleggen', async () => {
      if (!datum.value) return;
      await werkBij(a.id, maakBody(datum.value), foutVak);
    }, 'knop--primair');
    houder.append(datum, bevestig);
  });
  houder.append(knop);
  return houder;
}

/** Verplichte contactgegevens die nog niet zijn ingevuld. */
function ontbrekendeGegevens(a) {
  const gegevens = (actieveEisen && actieveEisen.gegevens) || [];
  return gegevens.filter((g) => g.verplicht && !String((a.contact || {})[g.id] || '').trim());
}

// ---------------------------------------------------------- accounts ------

/**
 * Accountbeheer, alleen voor een beheerder.
 *
 * Bewust in dezelfde lade als een dossier: één plek waar iets opengaat, en
 * geen aparte pagina die weer een eigen inlogcontrole nodig heeft.
 */
async function openAccounts() {
  let data;
  try {
    data = await api('/api/beheer/medewerkers');
  } catch (err) {
    return alert(err.message);
  }
  rollen = data.rollen || rollen;

  const lijf = el('div', {});
  const fout = el('div', {});

  const tabel = el('table', { class: 'medewerkers' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'Naam'), el('th', {}, 'Rol'), el('th', {}, 'Tweefactor'), el('th', {}, 'Status'))));
  const lijf2 = el('tbody', {});

  for (const m of data.medewerkers) {
    const zelf = m.id === data.ik.id;

    const rolKeuze = el('select', {}, ...rollen.map((r) => el('option', { value: r.id }, r.label)));
    rolKeuze.value = m.rol;
    rolKeuze.disabled = zelf;
    rolKeuze.addEventListener('change', async () => {
      fout.textContent = '';
      try {
        await api(`/api/beheer/medewerkers/${m.id}`, {
          method: 'PATCH', body: JSON.stringify({ rol: rolKeuze.value }),
        });
        openAccounts();
      } catch (err) {
        rolKeuze.value = m.rol;
        fout.append(el('div', { class: 'melding melding--fout', tekst: err.message }));
      }
    });

    const blokkeer = maakKnop(m.actief ? 'Blokkeren' : 'Weer toelaten', async () => {
      fout.textContent = '';
      try {
        await api(`/api/beheer/medewerkers/${m.id}`, {
          method: 'PATCH', body: JSON.stringify({ actief: !m.actief }),
        });
        openAccounts();
      } catch (err) {
        fout.append(el('div', { class: 'melding melding--fout', tekst: err.message }));
      }
    }, m.actief ? 'knop--stil' : 'knop--zacht');
    blokkeer.disabled = zelf;

    lijf2.append(el('tr', {},
      el('td', {},
        el('strong', { tekst: m.naam || '(naam onbekend)' }),
        el('div', { class: 'subtiel', style: 'font-size:.84rem', tekst: m.email }),
        zelf ? chip('dat ben jij', 'blauw') : null),
      el('td', {}, rolKeuze),
      el('td', {}, m.tweefactorAan
        ? chip('ingesteld', 'groen')
        : chip('nog niet ingesteld', 'oranje')),
      el('td', {},
        m.actief ? chip('actief', 'groen') : chip('geblokkeerd', 'rood'),
        el('div', { style: 'margin-top:6px' }, blokkeer))));
  }
  tabel.append(lijf2);

  // ------------------------------------------------------- uitnodigen ----
  const naam = el('input', { type: 'text', id: 'nieuw-naam', placeholder: 'Naam' });
  const email = el('input', { type: 'email', id: 'nieuw-email', placeholder: 'E-mailadres' });
  const rol = el('select', { id: 'nieuw-rol' }, ...rollen.map((r) => el('option', { value: r.id }, r.label)));
  rol.value = 'behandelaar';
  const uitslag = el('div', {});

  const nodigUit = maakKnop('Uitnodiging versturen', async () => {
    uitslag.textContent = '';
    try {
      const data2 = await api('/api/beheer/medewerkers', {
        method: 'POST',
        body: JSON.stringify({ naam: naam.value, email: email.value, rol: rol.value }),
      });
      naam.value = '';
      email.value = '';
      // Gaat er geen mail de deur uit, dan moet de link hier te kopiëren zijn.
      // Bewust niet meteen verversen: dan zou de melding met de link er direct
      // weer af zijn, en juist die link moet de beheerder kunnen kopiëren.
      if (data2.uitnodigingslink) {
        const veld = el('code', { class: 'qr-geheim', tekst: data2.uitnodigingslink });
        const kopieer = maakKnop('Link kopiëren', () => {
          navigator.clipboard.writeText(data2.uitnodigingslink)
            .then(() => { kopieer.textContent = 'Gekopieerd'; });
        });
        uitslag.append(el('div', { class: 'melding melding--let-op' },
          el('strong', {}, `${data2.medewerker.email} is toegevoegd, maar er ging geen mail uit`),
          el('p', {}, 'Er is nog geen mailkoppeling ingesteld. Geef deze link zelf door; '
            + 'hij is zeven dagen geldig en werkt één keer.'),
          veld,
          el('div', { class: 'knoprij' }, kopieer)));
      } else {
        uitslag.append(el('div', { class: 'melding melding--goed' },
          el('strong', {}, 'Uitnodiging verstuurd'),
          el('p', {}, `${data2.medewerker.email} kan nu een wachtwoord kiezen.`)));
      }
    } catch (err) {
      uitslag.append(el('div', { class: 'melding melding--fout', tekst: err.message }));
    }
  }, 'knop--primair');

  lijf.append(
    el('div', { class: 'kolomkop', tekst: 'Medewerkers' }),
    el('div', { class: 'tabel-omhulsel' }, tabel),
    fout,
    el('div', { class: 'kolomkop', tekst: 'Iemand uitnodigen' }),
    el('p', { class: 'veld__hulp' }, 'De uitgenodigde kiest zelf een wachtwoord en moet '
      + 'tweestapsverificatie instellen voordat hij bij de dossiers kan.'),
    el('div', { class: 'veld' }, naam),
    el('div', { class: 'veld' }, email),
    el('div', { class: 'veld' }, rol),
    el('div', { class: 'knoprij' }, nodigUit),
    uitslag,
  );

  toonLade('Accounts', lijf);
}

// ------------------------------------------------------------- opstart ----

api('/api/beheer/sessie')
  .then((data) => {
    rollen = data.rollen || [];
    if (data.ingelogd) return toonDashboard(data.gebruiker);
    return toonInloggen(data);
  })
  .catch(() => toonInloggen());
