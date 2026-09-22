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

import { klantTijdlijn, klantSamenvatting, klantAftelling } from '/shared/tijdlijn.js';
import { euro } from '/shared/dwangsom.js';
import { tarief, tariefSplitsing, euroTekst } from '/shared/tarief.js';
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
  if (!boodschap) return;
  // Een lege inlogpagina na een kapotte link is een doodlopende weg: de klant
  // weet vaak niet eens meer met welk adres hij zich heeft aangemeld. Zeg dus
  // wat er is, en laat de volgende stap één tik zijn.
  const vak = document.getElementById('inlogmelding');
  melding(vak, 'let-op', boodschap,
    'Vul hieronder je e-mailadres in, dan sturen wij meteen een nieuwe link.');
  const veld = document.getElementById('email');
  if (veld) veld.focus();
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

    // Er komt een factuur van ons aan. Die hoort niet als verrassing in de bus
    // te vallen naast het bedrag dat hij net heeft gekregen.
    const split = tariefSplitsing(tarief(INSTELLINGEN), toegekend);
    if (split) {
      kop.append(el('div', { class: 'zaakkop__som' },
        el('div', {}, el('span', { tekst: 'Onze vergoeding' }),
          el('strong', { tekst: `\u2212 ${euroTekst(split.vergoeding)}` })),
        el('div', { class: 'zaakkop__som--uit' }, el('span', { tekst: 'Jij houdt over' }),
          el('strong', { tekst: euroTekst(split.overhoudt) }))));
    }
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

  const blok = el('div', {}, kop);

  // De aftelling: het enige getal waar iemand voor terugkomt. Wat hij hier
  // niet ziet, gaat hij zelf bijhouden - en dat is nou juist wat wij doen.
  const aftelling = klantAftelling(dossier);
  if (aftelling) {
    blok.append(el('div', { class: 'aftelling' },
      el('div', { class: 'aftelling__getal' },
        el('strong', { tekst: String(aftelling.dagen) }),
        el('span', { tekst: aftelling.dagen === 1 ? 'dag' : 'dagen' })),
      el('div', {},
        el('span', { class: 'aftelling__kop', tekst: aftelling.kop }),
        el('span', { class: 'aftelling__onder', tekst: aftelling.onder }))));
  }

  blok.append(el('div', { class: 'rustregel' },
    el('strong', {}, 'Je hoeft nu niets te doen.'),
    el('span', {}, ' Wij houden dit voor je bij en laten van ons horen zodra er iets verandert.')));

  blok.append(el('div', { class: 'kolomkop', tekst: 'Zo staat je zaak ervoor' }), lijst,
    el('div', { class: 'kolomkop', tekst: 'Je zaak' }), gegevens);

  // Wat er nog ontbreekt, met de velden er meteen onder.
  if (dossier.ontbreekt.length > 0) {
    blok.append(el('div', { class: 'kolomkop', tekst: 'Dit hebben wij nog van je nodig' }),
      aanvulformulier(dossier));
  }

  // De stukken die bij déze zaak horen. Per zaaktype anders, en daarom pas
  // hier op te halen: welke brieven nodig zijn hangt af van wat er speelt.
  if (dossier.stukken && dossier.stukken.length > 0) {
    blok.append(el('div', { class: 'kolomkop', tekst: 'Stukken bij je zaak' }),
      stukkenlijst(dossier));
  }

  blok.append(el('div', { class: 'kolomkop', tekst: 'Post van de instantie' }),
    nieuwePostblok(dossier));

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
 * Wat er bij deze zaak aan stukken nodig is, met per stuk een uploadknop.
 *
 * De lijst komt van de server en verschilt per zaaktype: bij een bezwaar is
 * dat het primaire besluit plus het bezwaarschrift, bij een aanvraag de
 * ontvangstbevestiging. De aanvrager hoeft dat niet te weten; hij ziet alleen
 * wat er van hém nodig is en of het al binnen is.
 */
function stukkenlijst(dossier) {
  const houder = el('div', {});
  const open = dossier.stukken.filter((s) => !s.binnen && s.verplicht);

  if (open.length > 0) {
    houder.append(el('div', { class: 'melding melding--let-op', style: 'margin-bottom:16px' },
      el('strong', { tekst: open.length === 1 ? 'Eén stuk hebben wij nog nodig' : `Nog ${open.length} stukken nodig` }),
      el('p', { tekst: 'Zonder deze stukken kunnen wij je zaak niet onderbouwen. Je kunt ze hier '
        + 'uploaden; een foto van het papier is ook goed.' })));
  }

  const lijst = el('ul', { class: 'stukken' });
  for (const stuk of dossier.stukken) lijst.append(stukregel(dossier, stuk));
  houder.append(lijst);
  return houder;
}

/**
 * De stukkenlijst komt uit dezelfde module als de beheeromgeving, en daar is
 * hij geschreven vanuit de behandelaar: "de eigen ingebrekestelling van de
 * aanvrager". Dat is precies de verkeerde toon tegen de aanvrager zelf, die
 * hier zijn eigen zaak leest. Vandaar een eigen woordenlijst voor dit scherm;
 * staat een stuk er niet in, dan blijft de gedeelde tekst gewoon staan.
 */
const KLANTTEKST = {
  ontvangstbevestiging: ['Bewijs van je aanvraag',
    'De ontvangstbevestiging, of iets anders waaruit blijkt wanneer je hebt aangevraagd.'],
  termijnbrief: ['De brief met de uiterste beslisdatum',
    'Daarin staat wanneer je een besluit zou krijgen.'],
  verdagingsbrief: ['De brief waarin je beslissing is uitgesteld',
    'Daarmee weten wij tot wanneer zij de tijd hadden.'],
  opschortingsbrief: ['De brief waarin om aanvullende gegevens is gevraagd',
    'Daarmee controleren wij hoeveel dagen de termijn heeft stilgestaan.'],
  'primair-besluit': ['Het besluit waartegen je bezwaar maakte',
    'Daaruit blijkt vanaf wanneer de bezwaartermijn liep.'],
  bezwaarschrift: ['Je bezwaarschrift en het verzendbewijs',
    'Bijvoorbeeld de ontvangstbevestiging of het verzendbewijs van de post.'],
  ingebrekestelling: ['De melding die je zelf hebt verstuurd',
    'De brief of e-mail waarin je om een besluit vroeg.'],
  verzendbewijs: ['Het verzendbewijs van die melding',
    'Dit is het belangrijkste bewijsstuk: het bepaalt vanaf welke dag de dwangsom telt.'],
  besluit: ['Het besluit dat je inmiddels hebt ontvangen',
    'Daarmee stellen wij vast tot welke dag de dwangsom is opgelopen.'],
};

function stukregel(dossier, stuk) {
  const regel = el('li', { class: stuk.binnen ? 'stuk stuk--binnen' : 'stuk' });
  const fout = el('div', {});
  const eigen = KLANTTEKST[stuk.id] || [];
  const label = eigen[0] || stuk.label;
  const uitleg = eigen[1] || stuk.uitleg;

  regel.append(el('div', { class: 'stuk__kop' },
    el('span', { class: 'stuk__merk', tekst: stuk.binnen ? '\u2713' : '\u25cb' }),
    el('div', {},
      el('span', { class: 'stuk__label', tekst: label }),
      uitleg ? el('span', { class: 'stuk__uitleg', tekst: uitleg }) : null,
      stuk.verplicht ? null : el('span', { class: 'stuk__uitleg', tekst: 'Mag ook later.' }))));

  // Wat er al ligt, met een link om het terug te kijken.
  if (stuk.bestanden.length > 0) {
    const bestanden = el('ul', { class: 'stuk__bestanden' });
    for (const bestand of stuk.bestanden) {
      bestanden.append(el('li', {},
        el('a', {
          href: `/api/mijn/dossiers/${dossier.id}/bestanden/${bestand.id}`,
          tekst: bestand.bestandsnaam,
        })));
    }
    regel.append(bestanden);
  }

  const invoer = el('input', {
    type: 'file', accept: '.pdf,.txt,application/pdf,text/plain,image/*',
    id: `stuk-${stuk.id}`, class: 'verborgen-invoer',
  });
  const knop = el('button', { class: 'knop knop--zacht knop--klein', type: 'button' },
    stuk.binnen ? 'Nog een bestand toevoegen' : 'Bestand toevoegen');
  knop.addEventListener('click', () => invoer.click());

  invoer.addEventListener('change', async () => {
    const bestand = invoer.files && invoer.files[0];
    if (!bestand) return;
    fout.textContent = '';
    knop.disabled = true;
    knop.textContent = 'Bezig met uploaden…';
    try {
      const buffer = await bestand.arrayBuffer();
      let ruw = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 8192) {
        ruw += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      await api(`/api/mijn/dossiers/${dossier.id}/stuk`, {
        method: 'POST',
        body: JSON.stringify({
          stukId: stuk.id,
          bestandsnaam: bestand.name,
          mediaType: bestand.type,
          data: btoa(ruw),
        }),
      });
      await laad();
    } catch (err) {
      knop.disabled = false;
      knop.textContent = 'Bestand toevoegen';
      melding(fout, 'fout', err.message);
    }
  });

  regel.append(el('div', { class: 'stuk__actie' }, invoer, knop), fout);
  return regel;
}

/**
 * Nieuwe post van de instantie.
 *
 * Dit lost een operationeel probleem op: stuurt de instantie rechtstreeks een
 * besluit of een verlengingsbrief naar de aanvrager, dan weten wij dat nu pas
 * als hij belt. Eén knop in zijn eigen dossier maakt hem onderdeel van de
 * keten zonder dat hij de procedure hoeft te snappen.
 */
function nieuwePostblok(dossier) {
  const orgaan = dossier.invoer.organisatienaam
    || labelBestuursorgaan(dossier.invoer.bestuursorgaan) || 'de instantie';
  const fout = el('div', {});
  const binnen = dossier.nieuwePost || [];

  const houder = el('div', { class: 'nieuwepost' },
    el('strong', { tekst: `Kreeg je intussen bericht van ${orgaan}?` }),
    el('p', { tekst: 'Een besluit, een brief dat het langer duurt, of iets anders: zet het hier '
      + 'neer. Dan rekenen wij ermee en hoef je ons niet te bellen.' }));

  if (binnen.length > 0) {
    const lijst = el('ul', { class: 'stuk__bestanden', style: 'margin-left:0' });
    for (const bestand of binnen) {
      lijst.append(el('li', {}, el('a', {
        href: `/api/mijn/dossiers/${dossier.id}/bestanden/${bestand.id}`,
        tekst: bestand.bestandsnaam,
      })));
    }
    houder.append(lijst);
  }

  const invoer = el('input', {
    type: 'file', accept: '.pdf,.txt,application/pdf,text/plain,image/*',
    id: 'nieuwe-post', class: 'verborgen-invoer',
  });
  const knop = el('button', { class: 'knop knop--zacht knop--klein', type: 'button' },
    `Nieuw bericht van ${orgaan} uploaden`);
  knop.addEventListener('click', () => invoer.click());
  invoer.addEventListener('change', () => stuurBestand({
    dossier, stukId: 'nieuwe-post', invoer, knop, fout,
    knoptekst: `Nieuw bericht van ${orgaan} uploaden`,
  }));

  houder.append(el('div', { style: 'margin-top:12px' }, invoer, knop), fout);
  return houder;
}

/** Eén bestand naar de server, in blokjes omdat btoa geen grote arrays lust. */
async function stuurBestand({ dossier, stukId, invoer, knop, fout, knoptekst }) {
  const bestand = invoer.files && invoer.files[0];
  if (!bestand) return;
  fout.textContent = '';
  knop.disabled = true;
  knop.textContent = 'Bezig met uploaden…';
  try {
    const bytes = new Uint8Array(await bestand.arrayBuffer());
    let ruw = '';
    for (let i = 0; i < bytes.length; i += 8192) ruw += String.fromCharCode(...bytes.subarray(i, i + 8192));
    await api(`/api/mijn/dossiers/${dossier.id}/stuk`, {
      method: 'POST',
      body: JSON.stringify({
        stukId, bestandsnaam: bestand.name, mediaType: bestand.type, data: btoa(ruw),
      }),
    });
    await laad();
  } catch (err) {
    knop.disabled = false;
    knop.textContent = knoptekst;
    melding(fout, 'fout', err.message);
  }
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

/**
 * Het tarief, voor de som onder een toegekend bedrag.
 *
 * Anders dan in de funnel wordt hier meteen gerenderd, dus dit moet binnen
 * zijn vóór het scherm staat; vandaar await in plaats van laten lopen.
 */
const INSTELLINGEN = {};
async function haalInstellingen() {
  if (Object.keys(INSTELLINGEN).length > 0) return;
  try {
    Object.assign(INSTELLINGEN, await (await fetch('/api/instellingen')).json());
  } catch { /* dan valt tarief() terug op de standaard */ }
}

async function laad() {
  await haalInstellingen();
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
