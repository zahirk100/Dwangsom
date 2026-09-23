/**
 * Het cijferscherm.
 *
 * Eén vraag staat centraal: waar haken mensen af? Daarom is de trechter het
 * eerste blok en niet het bezoekersaantal. Een advertentie die veel klikken
 * oplevert en geen aanvragen is duurder dan geen advertentie.
 */
const inhoud = document.getElementById('inhoud');
const periode = document.getElementById('periode');
let dagen = 30;

function el(tag, attrs = {}, ...kinderen) {
  const n = document.createElement(tag);
  for (const [k, w] of Object.entries(attrs)) {
    if (w === null || w === undefined) continue;
    if (k === 'tekst') n.textContent = w; else n.setAttribute(k, w);
  }
  for (const kind of kinderen.flat()) {
    if (kind === null || kind === undefined || kind === false) continue;
    n.append(kind.nodeType ? kind : document.createTextNode(String(kind)));
  }
  return n;
}

const getal = (n) => new Intl.NumberFormat('nl-NL').format(n || 0);

/**
 * Een tabel in een schuifbare houder.
 *
 * Vijf kolommen passen niet op een telefoon, en kolommen weglaten kan hier
 * niet: dit is een beheerscherm, daar wil je de cijfers compleet zien. Dus
 * schuiven in plaats van verbergen.
 */
const rol = (tabel) => el('div', { class: 'rol' }, tabel);

function tegel(getalTekst, label) {
  return el('div', { class: 'tegel' },
    el('div', { class: 'tegel__getal', tekst: getalTekst }),
    el('div', { class: 'tegel__label', tekst: label }));
}

/** Een tabelcel met een balkje erachter, zodat verhoudingen meteen zichtbaar zijn. */
function balkcel(waarde, max) {
  const breedte = max > 0 ? Math.round((waarde / max) * 100) : 0;
  return el('td', { class: 'balk' },
    el('span', { class: 'balk__vulling', style: `width:${breedte}%` }),
    el('span', { class: 'balk__tekst', tekst: getal(waarde) }));
}

function rendereTrechter(data) {
  const max = data.trechter[0] ? data.trechter[0].aantal : 0;
  const rijen = data.trechter.map((r) => el('tr', {},
    el('td', { tekst: r.label }),
    balkcel(r.aantal, max),
    el('td', { class: r.vanVorige === null ? 'stil' : '',
      tekst: r.vanVorige === null ? '—' : `${r.vanVorige}%` }),
    el('td', { class: r.vanBezoek === null ? 'stil' : '',
      tekst: r.vanBezoek === null ? '—' : `${r.vanBezoek}%` })));
  return rol(el('table', {},
    el('thead', {}, el('tr', {},
      el('th', { tekst: 'Stap' }), el('th', { tekst: 'Aantal' }),
      el('th', { tekst: 'Van vorige' }), el('th', { tekst: 'Van bezoek' }))),
    el('tbody', {}, rijen)));
}

function rendereBronnen(data) {
  const bronnen = Object.entries(data.perBron)
    .sort((a, b) => (b[1].bezoek || 0) - (a[1].bezoek || 0));
  if (bronnen.length === 0) return el('p', { class: 'stil', tekst: 'Nog geen verkeer.' });
  const max = Math.max(...bronnen.map(([, w]) => w.bezoek || 0));
  return rol(el('table', {},
    el('thead', {}, el('tr', {},
      el('th', { tekst: 'Bron' }), el('th', { tekst: 'Bezoek' }),
      el('th', { tekst: 'Gestart' }), el('th', { tekst: 'Aanvragen' }),
      el('th', { tekst: 'Omzetting' }))),
    el('tbody', {}, bronnen.map(([naam, w]) => {
      const bezoek = w.bezoek || 0;
      const aanvraag = w.aanvraag || 0;
      return el('tr', {},
        el('td', { tekst: naam }),
        balkcel(bezoek, max),
        el('td', { tekst: getal(w['funnel-start']) }),
        el('td', { tekst: getal(aanvraag) }),
        el('td', { class: bezoek ? '' : 'stil',
          tekst: bezoek ? `${Math.round((aanvraag / bezoek) * 1000) / 10}%` : '—' }));
    }))));
}

function renderePaginas(data) {
  const rijen = Object.entries(data.perPagina).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (rijen.length === 0) return el('p', { class: 'stil', tekst: 'Nog geen bezoek.' });
  const max = rijen[0][1];
  return rol(el('table', {},
    el('thead', {}, el('tr', {}, el('th', { tekst: 'Pagina' }), el('th', { tekst: 'Bezoek' }))),
    el('tbody', {}, rijen.map(([naam, aantal]) => el('tr', {},
      el('td', { tekst: naam === 'start' ? '/ (startpagina)' : `/${naam}` }),
      balkcel(aantal, max))))));
}

function rendereDagen(data) {
  const metIets = data.dagen.filter((d) => d.bezoek || d['funnel-start'] || d.aanvraag);
  if (metIets.length === 0) return el('p', { class: 'stil', tekst: 'Nog geen dagen met verkeer.' });
  const max = Math.max(...metIets.map((d) => d.bezoek));
  return rol(el('table', {},
    el('thead', {}, el('tr', {},
      el('th', { tekst: 'Dag' }), el('th', { tekst: 'Bezoek' }),
      el('th', { tekst: 'Gestart' }), el('th', { tekst: 'Aanvragen' }))),
    el('tbody', {}, metIets.slice().reverse().map((d) => el('tr', {},
      el('td', { tekst: d.dag }),
      balkcel(d.bezoek, max),
      el('td', { tekst: getal(d['funnel-start']) }),
      el('td', { tekst: getal(d.aanvraag) }))))));
}

async function laad() {
  inhoud.textContent = '';
  inhoud.append(el('p', { class: 'stil', tekst: 'Bezig met laden…' }));
  let data;
  try {
    const antwoord = await fetch(`/api/beheer/metingen?dagen=${dagen}`, { headers: { Accept: 'application/json' } });
    if (antwoord.status === 401 || antwoord.status === 403) {
      inhoud.textContent = '';
      inhoud.append(el('div', { class: 'melding' },
        'Je bent niet ingelogd. ', el('a', { href: '/beheer' }, 'Ga naar de beheeromgeving')));
      return;
    }
    if (!antwoord.ok) throw new Error(`status ${antwoord.status}`);
    data = await antwoord.json();
  } catch (err) {
    inhoud.textContent = '';
    inhoud.append(el('div', { class: 'melding', tekst: `Kon de cijfers niet laden: ${err.message}` }));
    return;
  }

  const t = data.totalen;
  const omzetting = t.bezoek ? Math.round(((t.aanvraag || 0) / t.bezoek) * 1000) / 10 : null;

  inhoud.textContent = '';
  inhoud.append(
    el('div', { class: 'tegels' },
      tegel(getal(t.bezoek), 'Bezoeken'),
      tegel(getal(t['funnel-start']), 'Aanvraag gestart'),
      tegel(getal(t.aanvraag), 'Aanvraag ingediend'),
      tegel(omzetting === null ? '—' : `${omzetting}%`, 'Bezoek naar aanvraag')),
    el('h2', { tekst: 'Waar haken mensen af?' }),
    rendereTrechter(data),
    el('h2', { tekst: 'Per bron' }),
    rendereBronnen(data),
    el('h2', { tekst: 'Per dag' }),
    rendereDagen(data),
    el('h2', { tekst: 'Meest bezochte pagina’s' }),
    renderePaginas(data),
  );
}

for (const n of [7, 30, 90]) {
  const knop = el('button', { type: 'button', 'aria-pressed': String(n === dagen), tekst: `${n} dagen` });
  knop.addEventListener('click', () => {
    dagen = n;
    for (const k of periode.querySelectorAll('button')) k.setAttribute('aria-pressed', 'false');
    knop.setAttribute('aria-pressed', 'true');
    laad();
  });
  periode.append(knop);
}

laad();
