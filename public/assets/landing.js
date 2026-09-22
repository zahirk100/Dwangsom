/**
 * De homepage die meedenkt.
 *
 * Zodra de bezoeker aanwijst op wie hij wacht, hoort de hele pagina daarover
 * te gaan. "Als een instantie te laat is" is veel zwakker dan "als UWV te laat
 * is met jouw WIA-beslissing", en die informatie hebben we op dat moment.
 *
 * Twee lagen:
 *   1. instantie  -> UWV, gemeente, DUO, anders
 *   2. procedure  -> WIA, WW, Wajong, Ziektewet, bezwaar
 *
 * Na laag 2 gaat de bezoeker naar de funnel met beide waarden in de url, zodat
 * ook daar de juiste naam op het scherm staat.
 *
 * Alles wat hier gebeurt is tekst vervangen en een keuzerij tonen. Zonder
 * javascript blijft de pagina volledig werken: de knoppen zijn dan gewone
 * keuzes die naar /aanvraag verwijzen.
 */

import { BESTUURSORGANEN, zaaktypenVoor, labelBestuursorgaan } from '/shared/catalogus.js';
import { CAMPAGNES } from '/shared/campagnes.js';

const keuzevak = document.getElementById('instantiekeuze');
const vervolgvak = document.getElementById('procedurekeuze');
const actievak = document.getElementById('keuzeactie');

/** "UWV is te laat" klopt, "Gemeente is te laat" niet. */
function inEenZin(id) {
  return { gemeente: 'je gemeente', svb: 'de SVB', belastingdienst: 'de Belastingdienst' }[id]
    || (id ? labelBestuursorgaan(id) : 'de instantie');
}

const metHoofdletter = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** De naam zoals die in een knop past: "Upload mijn UWV-brief". */
function briefnaam(id) {
  return {
    uwv: 'UWV-brief', duo: 'DUO-brief', svb: 'SVB-brief',
    gemeente: 'gemeentebrief', belastingdienst: 'brief',
  }[id] || 'brief';
}

/** Kort, voor in een kop: "je WIA-beslissing". */
function procedureKort(zaakId) {
  const campagne = CAMPAGNES.find((c) => c.zaak === zaakId);
  return campagne ? campagne.kort : '';
}

/**
 * Zet alle gemarkeerde plekken op de gekozen instantie.
 * @param {string} instantie id uit de catalogus
 * @param {string} zaak optioneel zaaktype-id, voor de tweede laag
 */
function personaliseer(instantie, zaak = '') {
  const zin = inEenZin(instantie);
  const naam = labelBestuursorgaan(instantie);
  const zaaktype = zaak ? zaaktypenVoor(instantie).find((z) => z.id === zaak) : null;
  const kort = zaak ? procedureKort(zaak) : '';

  document.documentElement.setAttribute('data-instantie', instantie);

  // De kop bovenaan. Met procedure erbij is hij het sterkst.
  const kop = document.querySelector('[data-kop]');
  if (kop) {
    kop.textContent = kort
      ? `Wacht je te lang op ${kort}?`
      : `Wacht je te lang op een beslissing van ${zin}?`;
  }

  const onder = document.querySelector('[data-onder]');
  if (onder) {
    onder.textContent = `Wij controleren of ${zin} over de beslistermijn heen is en regelen wat `
      + 'daarna nodig is.';
  }

  const lead = document.querySelector('[data-lead]');
  if (lead) {
    lead.textContent = `Upload de brief van ${zin} waarin staat wanneer je een beslissing kon `
      + `verwachten. Binnen een minuut weet je of ${zin} te laat is.`;
  }

  // Elke knop naar de funnel neemt de keuze mee.
  const vragen = new URLSearchParams({ instantie });
  if (zaak) vragen.set('zaak', zaak);
  for (const knop of document.querySelectorAll('[data-cta]')) {
    knop.setAttribute('href', `/aanvraag?${vragen.toString()}`);
  }
  for (const tekst of document.querySelectorAll('[data-cta-tekst]')) {
    tekst.textContent = `Upload mijn ${briefnaam(instantie)}`;
  }

  // Losse zinnen waar de naam van de instantie in staat.
  for (const plek of document.querySelectorAll('[data-instantie-zin]')) {
    plek.textContent = zin;
  }

  // De voorbeeldkaart en het minischerm.
  for (const plek of document.querySelectorAll('[data-proefkop]')) {
    plek.textContent = plek.closest('.minischerm')
      ? `${metHoofdletter(zin)} lijkt te laat.`
      : `Het lijkt erop dat ${zin} te laat is`;
  }
  for (const plek of document.querySelectorAll('[data-proefinstantie]')) plek.textContent = naam;
  if (zaaktype) {
    // Het catalogus-label ("WIA-uitkering aanvragen of beoordelen") is te lang
    // voor een tabelregel; de korte naam uit de campagne past wel.
    const kortLabelTekst = kort ? metHoofdletter(kort.replace(/^je /, '')) : zaaktype.label;
    for (const plek of document.querySelectorAll('[data-proefprocedure]')) {
      plek.textContent = kortLabelTekst;
    }
  }
  const bestand = document.querySelector('.leesstappen__bestand');
  if (bestand) bestand.textContent = `${naam}-brief.pdf`;

  // Het dossiervoorbeeld.
  const dossierkop = document.querySelector('[data-dossierkop]');
  if (dossierkop) dossierkop.textContent = `Jouw zaak bij ${naam}`;
  const dossierklok = document.querySelector('[data-dossierklok]');
  if (dossierklok) {
    dossierklok.textContent = `${metHoofdletter(zin)} heeft nog tot 6 oktober om alsnog te beslissen.`;
  }

  // De sectiekop met de procedures.
  const waarvoor = document.querySelector('[data-waarvoorkop]');
  if (waarvoor) waarvoor.textContent = `Waar wacht je bij ${naam} op?`;

  // De vragen die over deze instantie gaan.
  const vraagBrief = document.querySelector('[data-vraag-brief]');
  if (vraagBrief) vraagBrief.textContent = `Welke ${briefnaam(instantie)} moet ik uploaden?`;
  const vraagVerlenging = document.querySelector('[data-vraag-verlenging]');
  if (vraagVerlenging) {
    vraagVerlenging.textContent = `Wat als ${zin} heeft laten weten dat het langer duurt?`;
  }
  const vraagUit = document.querySelector('[data-vraag-uitbetaling]');
  if (vraagUit) vraagUit.textContent = `Betaalt ${zin} de vergoeding aan mij of aan nubeslist.nl?`;

  const slot = document.querySelector('[data-slotkop]');
  if (slot) {
    slot.textContent = kort
      ? `Nog steeds aan het wachten op ${kort}?`
      : `Nog steeds aan het wachten op ${zin}?`;
  }
}

/** De tweede laag: welke procedure binnen deze instantie? */
function toonProcedures(instantie) {
  if (!vervolgvak) return;
  const zaken = zaaktypenVoor(instantie).filter((z) => CAMPAGNES.some((c) => c.zaak === z.id));
  vervolgvak.textContent = '';

  if (zaken.length === 0) {
    // Voor instanties zonder eigen campagnepagina's meteen door naar de funnel.
    vervolgvak.classList.add('verborgen');
    return;
  }

  const kop = document.createElement('p');
  kop.className = 'keuzekaarten__vraag';
  kop.textContent = `Waar wacht je bij ${labelBestuursorgaan(instantie)} op?`;
  vervolgvak.append(kop);

  const rij = document.createElement('div');
  rij.className = 'keuzeknoppen';
  for (const zaak of zaken) {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'keuzeknop';
    knop.textContent = kortLabel(zaak);
    knop.addEventListener('click', () => {
      for (const ander of rij.querySelectorAll('.keuzeknop')) ander.classList.remove('gekozen');
      knop.classList.add('gekozen');
      personaliseer(instantie, zaak.id);
      toonActie(instantie, zaak.id);
    });
    rij.append(knop);
  }

  const anders = document.createElement('button');
  anders.type = 'button';
  anders.className = 'keuzeknop';
  anders.textContent = 'Iets anders';
  anders.addEventListener('click', () => {
    for (const ander of rij.querySelectorAll('.keuzeknop')) ander.classList.remove('gekozen');
    anders.classList.add('gekozen');
    personaliseer(instantie, '');
    toonActie(instantie, '');
  });
  rij.append(anders);

  vervolgvak.append(rij);
  vervolgvak.classList.remove('verborgen');
}

/** "WIA-uitkering aanvragen of beoordelen" is te lang voor een knop. */
function kortLabel(zaaktype) {
  const campagne = CAMPAGNES.find((c) => c.zaak === zaaktype.id);
  if (!campagne) return zaaktype.label;
  // "je WIA-beslissing" -> "WIA-beslissing"
  return metHoofdletter(campagne.kort.replace(/^je /, ''));
}

/**
 * De volgende stap, direct onder de keuze die net gemaakt is.
 *
 * Hiervoor werd de hele pagina herschreven en daarna naar boven gescrold. Wie
 * op zijn telefoon bij de keuzeknoppen stond, zag dus niets gebeuren op de
 * plek waar hij tikte, en er stond daar ook geen knop. Nu verschijnt hier wat
 * er te doen valt: een knop naar de funnel, met de naam van zijn eigen zaak.
 */
function toonActie(instantie, zaak = '') {
  if (!actievak) return;
  const zin = inEenZin(instantie);
  const kort = zaak ? procedureKort(zaak) : '';
  const vragen = new URLSearchParams({ instantie });
  if (zaak) vragen.set('zaak', zaak);

  actievak.textContent = '';
  actievak.append(
    el('p', 'keuzeactie__kop', kort
      ? `Wacht je op ${kort}?`
      : `Wacht je op een beslissing van ${zin}?`),
    el('p', 'keuzeactie__onder',
      `Upload de brief van ${zin} waarin staat wanneer je een beslissing kon verwachten. `
      + 'Binnen een minuut weet je of de termijn voorbij is.'),
  );

  const knop = document.createElement('a');
  knop.className = 'knop knop--primair knop--groot keuzeactie__knop';
  knop.href = `/aanvraag?${vragen.toString()}`;
  knop.textContent = `Upload mijn ${briefnaam(instantie)}`;
  actievak.append(knop,
    el('p', 'keuzeactie__fijn',
      'Je zit nergens aan vast tot je zelf tekent.'));

  actievak.classList.remove('verborgen');

  // Alleen bijsturen als de knop niet in beeld staat; een scroll terwijl je al
  // kijkt naar wat je zocht, is alleen maar verwarrend.
  const doos = actievak.getBoundingClientRect();
  if (doos.bottom > window.innerHeight || doos.top < 0) {
    actievak.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/** Kort hulpje: een element met klasse en tekst. */
function el(tag, klasse, tekst) {
  const knoop = document.createElement(tag);
  if (klasse) knoop.className = klasse;
  if (tekst) knoop.textContent = tekst;
  return knoop;
}

// ------------------------------------------------------------------- start --

if (keuzevak) {
  for (const knop of keuzevak.querySelectorAll('[data-instantie]')) {
    knop.addEventListener('click', () => {
      const instantie = knop.dataset.instantie;
      if (!BESTUURSORGANEN.some((b) => b.id === instantie)) return;
      for (const ander of keuzevak.querySelectorAll('[data-instantie]')) {
        ander.classList.toggle('gekozen', ander === knop);
      }
      personaliseer(instantie);
      toonProcedures(instantie);
      toonActie(instantie);
    });
  }
}
