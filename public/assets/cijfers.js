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
/** Op welk kanaal we inzoomen. Leeg is alles bij elkaar. */
let bron = '';

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

/**
 * De trechter van één verzameling tellingen.
 *
 * "Verloren" staat erbij omdat dat het getal is waar je iets aan kunt doen: de
 * percentages zeggen hoe erg het is, het aantal zegt hoeveel mensen het
 * betreft. Bij 8% verlies op 12 bezoekers is er niets aan de hand; bij 8% op
 * 4000 is dat een dag werk waard.
 */
function rendereTrechter(trechter) {
  const max = trechter[0] ? trechter[0].aantal : 0;
  const rijen = trechter.map((r) => el('tr', {},
    el('td', { tekst: r.label }),
    balkcel(r.aantal, max),
    el('td', { class: r.verloren ? 'verlies' : 'stil',
      tekst: r.verloren === null ? '—' : (r.verloren ? `−${getal(r.verloren)}` : '0') }),
    el('td', { class: r.vanVorige === null ? 'stil' : '',
      tekst: r.vanVorige === null ? '—' : `${r.vanVorige}%` }),
    el('td', { class: r.vanBezoek === null ? 'stil' : '',
      tekst: r.vanBezoek === null ? '—' : `${r.vanBezoek}%` })));
  return rol(el('table', {},
    el('thead', {}, el('tr', {},
      el('th', { tekst: 'Stap' }), el('th', { tekst: 'Aantal' }),
      el('th', { tekst: 'Afgehaakt' }),
      el('th', { tekst: 'Van vorige' }), el('th', { tekst: 'Van bezoek' }))),
    el('tbody', {}, rijen)));
}

/** De trechter per bron: waar haakt het verkeer van dít kanaal af? */
function rendereTrechterPerBron(data) {
  const bronnen = Object.entries(data.trechterPerBron || {})
    .sort((a, b) => (b[1][0].aantal || 0) - (a[1][0].aantal || 0))
    .filter(([, t]) => t[0].aantal > 0);
  if (bronnen.length === 0) return el('p', { class: 'stil', tekst: 'Nog geen verkeer per bron.' });

  const stappen = data.stappen || [];
  return rol(el('table', {},
    el('thead', {}, el('tr', {},
      el('th', { tekst: 'Bron' }),
      ...stappen.map((s) => el('th', { tekst: s.label.replace(/^Funnel /, '') })),
      el('th', { tekst: 'Omzetting' }))),
    el('tbody', {}, bronnen.map(([naam, trechter]) => {
      const bezoek = trechter[0].aantal;
      const eind = trechter[trechter.length - 1].aantal;
      return el('tr', {},
        el('td', { tekst: naam }),
        ...trechter.map((r) => el('td', {
          class: r.aantal === 0 ? 'stil' : '',
          tekst: getal(r.aantal),
        })),
        el('td', { class: bezoek ? 'nadruk' : 'stil',
          tekst: bezoek ? `${Math.round((eind / bezoek) * 1000) / 10}%` : '—' }));
    }))));
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

/** Nederlandse weekdag plus datum: "ma 29-09" leest sneller dan "2026-09-29". */
function dagLabel(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const dag = d.toLocaleDateString('nl-NL', { weekday: 'short', timeZone: 'UTC' });
  return `${dag} ${iso.slice(8, 10)}-${iso.slice(5, 7)}`;
}

/**
 * Elke dag met de hele trechter erachter.
 *
 * Hier stonden eerder drie kolommen - bezoek, gestart, aanvragen - en daarmee
 * zag je wel dát er niemand doorkwam maar niet waar hij bleef steken. Nu staat
 * elke stap erin, plus het aantal dat op die dag afhaakte.
 */
function rendereDagen(data, bron) {
  const stappen = data.stappen || [];
  const cijfersVan = (d) => (bron ? (d.bronnen[bron] || {}) : d);
  const metIets = data.dagen.filter((d) => stappen.some((s) => (cijfersVan(d)[s.id] || 0) > 0));
  if (metIets.length === 0) {
    return el('p', { class: 'stil',
      tekst: bron ? `Nog geen verkeer van ${bron} in deze periode.` : 'Nog geen dagen met verkeer.' });
  }
  const max = Math.max(...metIets.map((d) => cijfersVan(d).bezoek || 0));
  return rol(el('table', {},
    el('thead', {}, el('tr', {},
      el('th', { tekst: 'Dag' }),
      el('th', { tekst: 'Bezoek' }),
      ...stappen.slice(1).map((s) => el('th', { tekst: s.label.replace(/^Funnel /, '') })),
      el('th', { tekst: 'Afgehaakt' }))),
    el('tbody', {}, metIets.slice().reverse().map((d) => {
      const c = cijfersVan(d);
      const bezoek = c.bezoek || 0;
      const eind = c[stappen[stappen.length - 1].id] || 0;
      return el('tr', {},
        el('td', { tekst: dagLabel(d.dag) }),
        balkcel(bezoek, max),
        ...stappen.slice(1).map((s) => el('td', {
          class: (c[s.id] || 0) === 0 ? 'stil' : '', tekst: getal(c[s.id] || 0),
        })),
        el('td', { class: bezoek - eind > 0 ? 'verlies' : 'stil', tekst: `−${getal(bezoek - eind)}` }));
    }))));
}

const UITKOMSTNAAM = {
  recht: 'Recht op een vergoeding',
  'ingebrekestelling-nodig': 'Eerst in gebreke stellen',
  'hersteltermijn-loopt': 'Hersteltermijn loopt',
  'termijn-loopt': 'Nog niet te laat',
  'geen-recht': 'Geen recht',
  onbekend: 'Onbekend',
};

const euro = (n) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

/**
 * De controles die geen aanvraag werden.
 *
 * De trechter hierboven zegt hoevéél mensen afhaken. Dit zegt met wat voor
 * zaak, en dat is het verschil tussen "niets aan te doen" en "hier lekt geld
 * weg": iemand die afhaakt zonder recht is geen probleem, iemand die afhaakt
 * met duizend euro op tafel wel.
 */
function rendereControles(data) {
  const { overzicht, controles, stappen } = data;
  if (!controles || controles.length === 0) {
    return el('p', { class: 'stil', tekst: 'Nog geen controles vastgelegd.' });
  }

  const stapnaam = Object.fromEntries(stappen.map((s) => [s.id, s.label]));
  const perStap = stappen.map((stap) => el('tr', {},
    el('td', { tekst: stap.label }),
    balkcel(overzicht.perStap[stap.id] || 0, overzicht.totaal)));

  const perUitkomst = Object.entries(overzicht.perUitkomst)
    .sort((a, b) => b[1] - a[1])
    .map(([id, aantal]) => el('tr', {},
      el('td', { tekst: UITKOMSTNAAM[id] || id }),
      balkcel(aantal, overzicht.zonderAanvraag)));

  const lijst = controles.slice(0, 40).map((c) => el('tr', {},
    el('td', { tekst: (c.bijgewerktOp || '').slice(0, 10) }),
    el('td', { tekst: c.zaak.organisatienaam || c.zaak.bestuursorgaan || '—' }),
    el('td', { tekst: UITKOMSTNAAM[c.uitkomst] || c.uitkomst || '—' }),
    el('td', { tekst: c.bedrag ? euro(c.bedrag) : '—' }),
    el('td', { tekst: stapnaam[c.stap] || c.stap }),
    el('td', { tekst: String(c.aantalBrieven || 0) }),
    el('td', { class: c.aanvraagId ? '' : 'stil', tekst: c.aanvraagId ? 'ja' : 'nee' })));

  // Per kanaal: niet hoeveel klikken, maar wat voor zaken eruit kwamen.
  const herkomsttabel = (perHerkomst, kop) => {
    const rijen = Object.entries(perHerkomst || {})
      .sort((a, b) => b[1].controles - a[1].controles);
    if (rijen.length === 0) return el('p', { class: 'stil', tekst: 'Nog niets vastgelegd.' });
    const max = rijen[0][1].controles;
    return rol(el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { tekst: kop }), el('th', { tekst: 'Controles' }),
        el('th', { tekst: 'Werd opdracht' }), el('th', { tekst: 'Had recht' }),
        el('th', { tekst: 'Blijft liggen' }))),
      el('tbody', {}, rijen.map(([naam, w]) => el('tr', {},
        el('td', { tekst: naam }),
        balkcel(w.controles, max),
        el('td', { class: w.aanvragen ? '' : 'stil', tekst: getal(w.aanvragen) }),
        el('td', { class: w.metRecht ? '' : 'stil', tekst: getal(w.metRecht) }),
        el('td', { class: w.gemistBedrag ? 'verlies' : 'stil',
          tekst: w.gemistBedrag ? euro(w.gemistBedrag) : '—' }))))));
  };

  const perDag = overzicht.perDag || [];
  const dagtabel = perDag.length === 0
    ? el('p', { class: 'stil', tekst: 'Nog geen dagen met controles.' })
    : rol(el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { tekst: 'Dag' }), el('th', { tekst: 'Controles' }),
        ...stappen.map((s) => el('th', { tekst: s.label })),
        el('th', { tekst: 'Blijft liggen' }))),
      el('tbody', {}, perDag.map((d) => el('tr', {},
        el('td', { tekst: dagLabel(d.dag) }),
        balkcel(d.controles, Math.max(...perDag.map((x) => x.controles))),
        ...stappen.map((s) => el('td', {
          class: (d.perStap[s.id] || 0) === 0 ? 'stil' : '', tekst: getal(d.perStap[s.id] || 0),
        })),
        el('td', { class: d.gemistBedrag ? 'verlies' : 'stil',
          tekst: d.gemistBedrag ? euro(d.gemistBedrag) : '—' }))))));

  return el('div', {},
    el('div', { class: 'tegels' },
      tegel(getal(overzicht.totaal), 'Controles uitgevoerd'),
      tegel(getal(overzicht.zonderAanvraag), 'Zonder aanvraag'),
      tegel(euro(overzicht.gemistBedrag), 'Blijven liggen bij recht'),
      tegel(`${data.bewaardagen} dagen`, 'Bewaartermijn')),
    el('h3', { tekst: 'Per dag' }),
    dagtabel,
    el('h3', { tekst: 'Per kanaal' }),
    el('p', { class: 'stil' }, 'Niet hoeveel klikken een advertentie kostte, maar wat voor zaken '
      + 'eruit kwamen. "Blijft liggen" is het bedrag van mensen die recht hadden en toch afhaakten.'),
    herkomsttabel(overzicht.perBron, 'Bron'),
    el('h3', { tekst: 'Per landingspagina' }),
    herkomsttabel(overzicht.perLanding, 'Landing'),
    el('h3', { tekst: 'Hoever kwamen ze?' }),
    rol(el('table', {},
      el('thead', {}, el('tr', {}, el('th', { tekst: 'Laatste stap' }), el('th', { tekst: 'Aantal' }))),
      el('tbody', {}, perStap))),
    el('h3', { tekst: 'Wat voor zaak haakte af?' }),
    rol(el('table', {},
      el('thead', {}, el('tr', {}, el('th', { tekst: 'Uitkomst' }), el('th', { tekst: 'Aantal' }))),
      el('tbody', {}, perUitkomst))),
    el('h3', { tekst: 'De laatste controles' }),
    rol(el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { tekst: 'Datum' }), el('th', { tekst: 'Instantie' }),
        el('th', { tekst: 'Uitkomst' }), el('th', { tekst: 'Bedrag' }),
        el('th', { tekst: 'Tot waar' }), el('th', { tekst: 'Brieven' }),
        el('th', { tekst: 'Aanvraag' }))),
      el('tbody', {}, lijst))));
}

/**
 * Werkt de meting eigenlijk wel?
 *
 * Dit blok staat bovenaan omdat een leeg cijferscherm twee heel verschillende
 * dingen kan betekenen: er kwam niemand, of er kwam wel iemand maar het is
 * niet geteld. Dat verschil was hier niet te zien, en dat is precies wat er
 * misging: in de advertentiebeheerder liepen de kliks op en hier bleef alles
 * op nul staan.
 *
 * Drie dingen moeten kloppen, en alle drie staan ze hier los van elkaar, want
 * ze gaan kapot om verschillende redenen: de opslag moet blijven bestaan, er
 * moet vandaag iets binnengekomen zijn, en een melding uit deze browser moet
 * de hele weg afleggen.
 */
function statusregel(naam, waarde, toon = 'goed', uitleg = '') {
  return el('div', { class: `status__regel status__regel--${toon}` },
    el('span', { class: 'status__naam', tekst: naam }),
    el('span', { class: 'status__waarde', tekst: waarde }),
    uitleg ? el('span', { class: 'status__uitleg', tekst: uitleg }) : null);
}

/**
 * De twee manieren van tellen naast elkaar.
 *
 * Het script weet meer, het plaatje werkt altijd. Zolang ze in de buurt van
 * elkaar liggen, is er niets aan de hand. Loopt het plaatje ver voor, dan
 * draait het script bij een deel van de bezoekers niet en zijn alle cijfers
 * eronder te laag - inclusief de trechter, want die hangt aan het script.
 * Dat is het soort fout dat er niet uitziet als een fout.
 */
function tweeTellingen(data) {
  const v = data.bezoekVergelijking || { script: 0, plaatje: 0 };
  const waarde = `${getal(v.script)} via het script, ${getal(v.plaatje)} via het plaatje`;

  if (v.script === 0 && v.plaatje === 0) {
    return statusregel('Bezoek geteld', 'Nog niets geteld in deze periode', 'let-op');
  }
  if (v.plaatje === 0) {
    return statusregel('Bezoek geteld', waarde, 'let-op',
      'Het plaatje dat zonder javascript telt, komt niet aan. Dat is het vangnet '
      + 'onder deze cijfers; zonder dat vangnet is niet te zien of het script wel draait.');
  }
  // Het script mist altijd een beetje: iemand die wegklikt voordat het geladen
  // is, telt alleen als plaatje. Een vijfde schelen is normaal, de helft niet.
  const deel = v.script / v.plaatje;
  if (deel < 0.5) {
    return statusregel('Bezoek geteld', waarde, 'fout',
      'Het script telt minder dan de helft van wat er werkelijk geladen wordt. '
      + 'Bij een groot deel van de bezoekers draait het dus niet, en dan zijn de '
      + 'trechter en de cijfers per kanaal hieronder te laag. Kijk op /diagnose.');
  }
  if (deel < 0.8) {
    return statusregel('Bezoek geteld', waarde, 'let-op',
      'Het script telt merkbaar minder dan het plaatje. Een deel daarvan is normaal '
      + '(wie meteen wegklikt, telt alleen als plaatje), maar hou het in de gaten.');
  }
  return statusregel('Bezoek geteld', waarde, 'goed',
    'Beide manieren van tellen komen uit in dezelfde orde van grootte, dus het '
    + 'script draait bij vrijwel iedereen.');
}

function statusblok(data) {
  const vak = el('section', { class: 'status' });
  const opslag = data.opslag || {};
  const vandaag = (data.dagen || []).find((d) => d.dag === data.vandaag) || {};
  const laatste = [...(data.dagen || [])].reverse().find((d) => d.bezoek > 0);

  const opslagnamen = {
    bestand: 'Bestand op schijf',
    redis: 'Database (Upstash of Vercel KV)',
    geheugen: 'Alleen werkgeheugen',
  };

  vak.append(
    el('h2', { tekst: 'Werkt de meting?' }),
    opslag.duurzaam
      ? statusregel('Opslag', opslagnamen[opslag.soort] || opslag.soort || 'onbekend', 'goed',
        'De tellers blijven staan, ook na een nieuwe deploy.')
      : statusregel('Opslag', `${opslagnamen[opslag.soort] || opslag.soort}: tellers verdwijnen`, 'fout',
        'Dit is werkgeheugen van een serverloze functie. Elke keer dat die afkoelt of '
        + 'opnieuw start, staat alles weer op nul, en bij drukte tellen meerdere '
        + 'instanties langs elkaar heen. Koppel een database (Upstash of Vercel KV) '
        + 'via de omgevingsvariabelen, anders zijn deze cijfers niet te vertrouwen.'),
    statusregel('Vandaag geteld', `${getal(vandaag.bezoek)} bezoeken, ${getal(vandaag.aanvraag)} aanvragen`,
      vandaag.bezoek > 0 ? 'goed' : 'let-op',
      vandaag.bezoek > 0 ? '' : (laatste
        ? `Het laatste bezoek dat is geteld was op ${dagLabel(laatste.dag)}.`
        : 'In deze hele periode is nog geen enkel bezoek geteld.')),
    tweeTellingen(data),
    statusregel('Draaiende versie', `${data.versie ? data.versie.commit : '?'} op ${data.versie ? data.versie.branch : '?'}`,
      'neutraal', 'Zie je hier een oudere commit dan je verwacht, dan staat je wijziging nog niet live.'),
    zelftest(data),
  );
  return vak;
}

/** Wat de laatste test opleverde, zodat het niet verdwijnt bij het herladen. */
let testmelding = null;

/**
 * Een melding de hele weg laten afleggen en kijken of hij aankomt.
 *
 * Stuurt dezelfde melding als elke pagina stuurt, over dezelfde route, en
 * leest daarna de teller terug. Gaat er onderweg iets mis - de route bestaat
 * niet, een grens gooit hem weg, de opslag schrijft niet - dan blijkt dat
 * hier, in plaats van pas over twee weken uit een advertentierekening.
 */
function zelftest(data) {
  const vak = el('div', { class: 'status__test' });
  const knop = el('button', { type: 'button', tekst: 'Test de meting' });
  const uitslag = el('p', {
    class: testmelding ? `status__uitslag status__uitslag--${testmelding.toon}` : 'stil',
    tekst: testmelding ? testmelding.tekst : 'Stuurt één testmelding en kijkt of die wordt opgeslagen.',
  });

  knop.addEventListener('click', async () => {
    knop.disabled = true;
    uitslag.className = 'stil';
    uitslag.textContent = 'Bezig…';
    const voor = (data.diagnoses || {})[data.vandaag] || 0;
    try {
      const heen = await fetch('/api/meting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ g: 'diagnose', b: 'direct' }),
      });
      if (heen.status !== 204) throw new Error(`de meetroute antwoordde met ${heen.status}`);
      const terug = await fetch(`/api/beheer/metingen?dagen=1`, { headers: { Accept: 'application/json' } });
      if (!terug.ok) throw new Error(`de cijfers waren niet te lezen (${terug.status})`);
      const na = await terug.json();
      const nu = (na.diagnoses || {})[na.vandaag] || 0;
      if (nu > voor) {
        testmelding = { toon: 'goed', tekst: 'De testmelding kwam aan en is opgeslagen. De meting werkt.' };
      } else if (na.opslag && !na.opslag.duurzaam) {
        testmelding = { toon: 'fout',
          tekst: 'De melding kwam aan maar was daarna niet terug te vinden. Dat is wat er met '
            + 'geheugenopslag gebeurt: de melding belandde op een andere instantie dan deze vraag. '
            + 'Zie de regel "Opslag" hierboven.' };
      } else {
        testmelding = { toon: 'fout',
          tekst: 'De melding kwam aan maar werd niet opgeslagen. Kijk in de logboeken van de '
            + 'hosting naar een fout bij "[meting] tellen mislukt".' };
      }
    } catch (err) {
      testmelding = { toon: 'fout', tekst: `De testmelding kwam niet aan: ${err.message}.` };
    }
    uitslag.className = `status__uitslag status__uitslag--${testmelding.toon}`;
    uitslag.textContent = testmelding.tekst;
    knop.disabled = false;
  });

  vak.append(knop, uitslag);
  return vak;
}

/**
 * Waarom mensen niet verder kwamen.
 *
 * De trechter zegt hoevéél er wegloopt tussen twee stappen; dit zegt waarom.
 * Dat verschil bepaalt wat je eraan doet: een onleesbare brief is werk aan de
 * tekstherkenning, een storing is werk aan de techniek, "nog niet te laat" is
 * een advertentie die de verkeerde mensen trekt, en wie het zelf gaat regelen
 * heeft zijn uitslag gekregen en ons niet nodig gevonden. Dat laatste is geen
 * lek maar een keuze, en hoort dus ook niet als verlies te worden geteld.
 */
function rendereRedenen(data) {
  const redenen = (data.redenen || []).filter((r) => r.aantal > 0);
  if (redenen.length === 0) {
    return el('p', { class: 'stil', tekst: 'Nog niemand is op een doodlopend scherm beland.' });
  }
  const max = Math.max(...redenen.map((r) => r.aantal));
  const brief = data.totalen['funnel-brief'] || 0;
  return rol(el('table', {},
    el('thead', {}, el('tr', {},
      el('th', { tekst: 'Reden' }), el('th', { tekst: 'Aantal' }),
      el('th', { tekst: 'Van de brieven' }))),
    el('tbody', {}, redenen.map((r) => el('tr', {},
      el('td', { tekst: r.label }),
      balkcel(r.aantal, max),
      el('td', { class: brief ? '' : 'stil',
        tekst: brief ? `${Math.round((r.aantal / brief) * 1000) / 10}%` : '\u2014' }))))));
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

  let controles = null;
  try {
    const antwoord = await fetch('/api/beheer/controles', { headers: { Accept: 'application/json' } });
    if (antwoord.ok) controles = await antwoord.json();
  } catch { /* de rest van het scherm werkt ook zonder */ }

  const t = data.totalen;
  const omzetting = t.bezoek ? Math.round(((t.aanvraag || 0) / t.bezoek) * 1000) / 10 : null;

  // Zoomen we in op één kanaal, dan geldt dat voor de trechter en de dagen.
  // De rest van het scherm blijft het totaal tonen, want daar gaat het niet
  // over herkomst.
  const trechter = bron ? (data.trechterPerBron[bron] || []) : data.trechter;

  inhoud.textContent = '';
  inhoud.append(
    statusblok(data),
    el('div', { class: 'tegels' },
      tegel(getal(t.bezoek), 'Bezoeken'),
      tegel(getal(t['funnel-start']), 'Aanvraag gestart'),
      tegel(getal(t.aanvraag), 'Aanvraag ingediend'),
      tegel(omzetting === null ? '—' : `${omzetting}%`, 'Bezoek naar aanvraag')),
    el('h2', { tekst: 'Waar haken mensen af?' }),
    bronkiezer(data),
    trechter.length ? rendereTrechter(trechter)
      : el('p', { class: 'stil', tekst: `Nog geen verkeer van ${bron} in deze periode.` }),
    el('h2', { tekst: 'Waarom kwamen ze niet verder?' }),
    el('p', { class: 'stil' }, 'De trechter zegt hoeveel mensen wegliepen, dit zegt waarom. '
      + 'Dit zijn zijwegen en geen stappen, dus ze tellen niet op tot het verlies hierboven.'),
    rendereRedenen(data),
    el('h2', { tekst: 'Per dag' }),
    el('p', { class: 'stil' }, bron
      ? `Alleen verkeer van ${bron}. "Afgehaakt" is het aantal bezoekers dat die dag niet tot een aanvraag kwam.`
      : '"Afgehaakt" is het aantal bezoekers dat die dag niet tot een aanvraag kwam.'),
    rendereDagen(data, bron),
    el('h2', { tekst: 'Per bron' }),
    rendereBronnen(data),
    el('h2', { tekst: 'Waar haakt elk kanaal af?' }),
    rendereTrechterPerBron(data),
    el('h2', { tekst: 'Meest bezochte pagina’s' }),
    renderePaginas(data),
    el('h2', { tekst: 'Controles zonder aanvraag' }),
    el('p', { class: 'stil' }, 'Wat er is uitgezocht zonder dat er een aanvraag van kwam. '
      + 'Hier staat de zaak, niet de persoon: geen naam, e-mailadres of rekeningnummer.'),
    controles ? rendereControles(controles) : el('p', { class: 'stil', tekst: 'Kon de controles niet laden.' }),
    el('h2', { tekst: 'Opnieuw beginnen' }),
    el('p', { class: 'stil' }, 'Voordat de advertenties aangaan: wis het testverkeer, anders '
      + 'staan jullie eigen bezoeken tussen de echte en klopt geen enkele verhouding. '
      + 'Dossiers en aanvragen blijven staan.'),
    leegmaakknop(),
  );
}

/**
 * Kiezen op welk kanaal je inzoomt.
 *
 * Een trechter over alle bronnen samen verbergt precies wat je wilt weten: als
 * meta veel klikt en niets oplevert en google het omgekeerde doet, ziet het
 * totaal er middelmatig uit en lijkt er niets aan de hand.
 */
function bronkiezer(data) {
  const bronnen = Object.entries(data.trechterPerBron || {})
    .filter(([, t]) => t[0] && t[0].aantal > 0)
    .map(([naam]) => naam)
    .sort();
  if (bronnen.length <= 1) return el('span', {});
  const rij = el('div', { class: 'keuzerij' });
  for (const naam of ['', ...bronnen]) {
    const knop = el('button', {
      type: 'button', 'aria-pressed': String(naam === bron),
      tekst: naam || 'Alle bronnen',
    });
    knop.addEventListener('click', () => { bron = naam; laad(); });
    rij.append(knop);
  }
  return rij;
}

/**
 * De cijfers leegmaken.
 *
 * Voor het moment waarop de advertenties aangaan: alles wat ervoor is geteld
 * is testverkeer van onszelf, en twintig eigen bezoeken tussen de eerste
 * vijftig echte zijn geen ruis maar veertig procent.
 *
 * Onomkeerbaar, dus met een woord dat overgetypt moet worden. Dossiers en
 * aanvragen blijven staan; dit wist tellers en controles.
 */
/**
 * Wat er bij het leegmaken gebeurde.
 *
 * Buiten de functie, want laad() tekent het hele scherm opnieuw en gooide de
 * bevestiging daarmee meteen weg: je drukte op de knop, alles sprong naar nul,
 * en er stond nergens wát er precies weg was.
 */
let leegmeldingTekst = '';

function leegmaakknop() {
  const vak = el('div', { class: 'leegmaken' });
  const melding = el('p', { class: 'stil', tekst: leegmeldingTekst });

  const veld = el('input', {
    type: 'text', id: 'leeg-bevestiging', placeholder: 'LEEGMAKEN',
    autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Typ LEEGMAKEN om te bevestigen',
  });
  const knop = el('button', { type: 'button', class: 'knop-gevaar', tekst: 'Cijfers leegmaken' });

  // Een invoerveld en geen prompt(): dat laatste wordt in sommige browsers
  // geblokkeerd, en dan lijkt de knop stuk terwijl er niets mis is.
  knop.addEventListener('click', async () => {
    const bevestiging = veld.value.trim();
    if (bevestiging.toUpperCase() !== 'LEEGMAKEN') {
      melding.textContent = 'Typ LEEGMAKEN in het vakje om te bevestigen.';
      veld.focus();
      return;
    }
    knop.disabled = true;
    melding.textContent = 'Bezig\u2026';
    try {
      const uit = await fetch('/api/beheer/metingen', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bevestiging }),
      });
      const data = await uit.json().catch(() => ({}));
      if (!uit.ok) throw new Error(data.fout || `status ${uit.status}`);
      veld.value = '';
      leegmeldingTekst = `Leeggemaakt: ${data.dagen} dagen en ${data.controles} controles. `
        + 'De meting begint hier opnieuw.';
      await laad();
    } catch (err) {
      melding.textContent = `Niet gelukt: ${err.message}`;
    } finally {
      knop.disabled = false;
    }
  });

  vak.append(veld, knop, melding);
  return vak;
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
