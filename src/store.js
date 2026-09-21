/**
 * Dossierbeheer. De feitelijke opslag zit in src/opslag.js; deze laag kent
 * alleen de regels: referentienummers, statusovergangen, notities en historie.
 */

import { randomUUID } from 'node:crypto';
import { kiesOpslag } from './opslag.js';
import { DOSSIERSOORT } from '../public/shared/dwangsom.js';

export const SOORTEN = [
  { id: DOSSIERSOORT.AANVRAAG, label: 'Aanvragen', enkelvoud: 'Aanvraag',
    uitleg: 'Er is een dwangsom opgebouwd; deze kan gevorderd worden.' },
  { id: DOSSIERSOORT.VOORAANMELDING, label: 'Vooraanmeldingen', enkelvoud: 'Vooraanmelding',
    uitleg: 'Nog niet te vorderen; wij bewaken de datum waarop er iets moet gebeuren.' },
  { id: DOSSIERSOORT.BEOORDELING, label: 'Beoordelingen', enkelvoud: 'Beoordeling',
    uitleg: 'De automatische toets ziet geen recht; handmatig bekijken.' },
];

export const STATUSSEN = [
  { id: 'nieuw', label: 'Nieuw', kleur: 'blauw' },
  { id: 'in-behandeling', label: 'In behandeling', kleur: 'paars' },
  { id: 'stukken-opgevraagd', label: 'Stukken opgevraagd', kleur: 'oranje' },
  { id: 'ingebrekestelling-verstuurd', label: 'Ingebrekestelling verstuurd', kleur: 'oranje' },
  { id: 'dwangsom-geclaimd', label: 'Dwangsom geclaimd', kleur: 'paars' },
  { id: 'toegekend', label: 'Toegekend', kleur: 'groen' },
  { id: 'afgewezen', label: 'Afgewezen', kleur: 'rood' },
  { id: 'afgesloten', label: 'Afgesloten', kleur: 'grijs' },
];

const STATUS_IDS = new Set(STATUSSEN.map((s) => s.id));

export function isGeldigeStatus(id) {
  return STATUS_IDS.has(id);
}

export function labelVoorSoort(id) {
  const soort = SOORTEN.find((s) => s.id === id);
  return soort ? soort.enkelvoud : 'Dossier';
}

export function labelVoorStatus(id) {
  const status = STATUSSEN.find((s) => s.id === id);
  return status ? status.label : id;
}

export class Store {
  constructor({ dataDir, opslag } = {}) {
    this.opslag = opslag || kiesOpslag({ dataDir });
    this.klaar = false;
  }

  async init() {
    await this.opslag.init();
    this.klaar = true;
    return this;
  }

  /** Zegt of ingediende aanvragen een herstart overleven. */
  get duurzaam() {
    return this.opslag.duurzaam;
  }

  async nieuweAanvraag({ invoer, contact, rapport, stukken, meta, brief, verlengbrief, handtekening }) {
    const nu = new Date().toISOString();
    const jaar = new Date().getUTCFullYear();
    const nummer = await this.opslag.volgendNummer(jaar);
    const vervolg = (rapport && rapport.vervolg) || {};
    const soort = vervolg.soort || DOSSIERSOORT.BEOORDELING;
    const aanvraag = {
      id: randomUUID(),
      referentie: `DWS-${jaar}-${String(nummer).padStart(4, '0')}`,
      soort,
      status: 'nieuw',
      actiedatum: vervolg.actiedatum || null,
      aangemaaktOp: nu,
      gewijzigdOp: nu,
      invoer,
      contact,
      rapport,
      stukken: stukken || {},
      brief: brief || null,
      verlengbrief: verlengbrief || null,
      // Is er digitaal getekend, dan is de machtiging meteen binnen.
      machtiging: handtekening ? { ondertekendOp: handtekening.gezetOp, digitaal: true } : {},
      handtekening: handtekening || null,
      meta: meta || {},
      notities: [],
      historie: [{
        op: nu,
        door: 'systeem',
        tekst: soort === DOSSIERSOORT.VOORAANMELDING
          ? `Vooraanmelding ontvangen. Bewaken tot ${vervolg.actiedatum || 'nader te bepalen'}: ${vervolg.actieLabel || ''}`.trim()
          : 'Aanvraag ontvangen via het aanvraagformulier.',
      }],
    };
    await this.opslag.voegToe(aanvraag);
    return aanvraag;
  }

  async lijst({ status, zoek, bestuursorgaan, soort } = {}) {
    let resultaat = (await this.opslag.haalAlle()).slice();
    resultaat.sort((a, b) => String(b.aangemaaktOp).localeCompare(String(a.aangemaaktOp)));
    if (soort && soort !== 'alle') {
      resultaat = resultaat.filter((a) => (a.soort || DOSSIERSOORT.BEOORDELING) === soort);
      // Vooraanmeldingen zijn een wachtlijst: wie het eerst aan de beurt is,
      // hoort bovenaan te staan.
      if (soort === DOSSIERSOORT.VOORAANMELDING) {
        resultaat.sort((a, b) => String(a.actiedatum || '9999').localeCompare(String(b.actiedatum || '9999')));
      }
    }
    if (status && status !== 'alle') {
      resultaat = resultaat.filter((a) => a.status === status);
    }
    if (bestuursorgaan && bestuursorgaan !== 'alle') {
      resultaat = resultaat.filter((a) => a.invoer && a.invoer.bestuursorgaan === bestuursorgaan);
    }
    if (zoek) {
      const term = String(zoek).toLowerCase().trim();
      resultaat = resultaat.filter((a) => [
        a.referentie,
        a.contact && a.contact.naam,
        a.contact && a.contact.email,
        a.contact && a.contact.woonplaats,
        a.contact && a.contact.kenmerk,
        a.invoer && a.invoer.organisatienaam,
      ].filter(Boolean).join(' ').toLowerCase().includes(term));
    }
    return resultaat;
  }

  async vind(id) {
    return this.opslag.haal(id);
  }

  async wijzigStatus(id, status, door) {
    const aanvraag = await this.vind(id);
    if (!aanvraag) return null;
    const oud = aanvraag.status;
    if (oud === status) return aanvraag;
    aanvraag.status = status;
    aanvraag.gewijzigdOp = new Date().toISOString();
    aanvraag.historie.push({
      op: aanvraag.gewijzigdOp,
      door: door || 'beheerder',
      tekst: `Status gewijzigd van "${labelVoorStatus(oud)}" naar "${labelVoorStatus(status)}".`,
    });
    await this.opslag.zet(aanvraag);
    return aanvraag;
  }

  async voegNotitieToe(id, tekst, door) {
    const aanvraag = await this.vind(id);
    if (!aanvraag) return null;
    const nu = new Date().toISOString();
    aanvraag.notities.push({ id: randomUUID(), op: nu, door: door || 'beheerder', tekst });
    aanvraag.gewijzigdOp = nu;
    await this.opslag.zet(aanvraag);
    return aanvraag;
  }

  /**
   * Machtiging: verstuurd naar de aanvrager, of ondertekend terugontvangen.
   * Het terugontvangen vinkt meteen het bijbehorende stuk af, zodat het
   * dossier op één plek klopt.
   */
  async werkMachtigingBij(id, actie, door) {
    const aanvraag = await this.vind(id);
    if (!aanvraag) return null;
    const nu = new Date().toISOString();
    const machtiging = { ...(aanvraag.machtiging || {}) };

    if (actie === 'verstuurd') {
      machtiging.verstuurdOp = nu;
      aanvraag.historie.push({ op: nu, door: door || 'beheerder', tekst: 'Machtiging naar de aanvrager gestuurd.' });
    } else if (actie === 'ontvangen') {
      machtiging.ontvangenOp = nu;
      aanvraag.stukken = { ...(aanvraag.stukken || {}), machtiging: true };
      aanvraag.historie.push({ op: nu, door: door || 'beheerder', tekst: 'Ondertekende machtiging ontvangen en in het dossier gehangen.' });
    } else if (actie === 'ingetrokken') {
      machtiging.verstuurdOp = null;
      machtiging.ontvangenOp = null;
      aanvraag.stukken = { ...(aanvraag.stukken || {}), machtiging: false };
      aanvraag.historie.push({ op: nu, door: door || 'beheerder', tekst: 'Machtigingsstatus teruggezet.' });
    } else {
      return null;
    }

    aanvraag.machtiging = machtiging;
    aanvraag.gewijzigdOp = nu;
    await this.opslag.zet(aanvraag);
    return aanvraag;
  }

  /** Bijwerken welke stukken binnen zijn. */
  async werkStukkenBij(id, stukken, door) {
    const aanvraag = await this.vind(id);
    if (!aanvraag) return null;
    const nu = new Date().toISOString();
    aanvraag.stukken = { ...(aanvraag.stukken || {}), ...stukken };
    aanvraag.gewijzigdOp = nu;
    aanvraag.historie.push({ op: nu, door: door || 'beheerder', tekst: 'Ontvangen stukken bijgewerkt.' });
    await this.opslag.zet(aanvraag);
    return aanvraag;
  }

  /** Herberekening opslaan, bijvoorbeeld nadat de beheerder data heeft gecorrigeerd. */
  async werkRapportBij(id, { invoer, rapport, door, toelichting }) {
    const aanvraag = await this.vind(id);
    if (!aanvraag) return null;
    const nu = new Date().toISOString();
    const vervolg = (rapport && rapport.vervolg) || {};
    aanvraag.invoer = invoer;
    aanvraag.rapport = rapport;
    // Een herberekening kan een vooraanmelding in een aanvraag veranderen:
    // de termijn is inmiddels verstreken, of de dwangsom is gaan lopen.
    const oudeSoort = aanvraag.soort;
    if (vervolg.soort) aanvraag.soort = vervolg.soort;
    aanvraag.actiedatum = vervolg.actiedatum || null;
    if (oudeSoort !== aanvraag.soort) {
      aanvraag.historie.push({
        op: nu,
        door: door || 'systeem',
        tekst: `Dossier verplaatst van ${labelVoorSoort(oudeSoort)} naar ${labelVoorSoort(aanvraag.soort)}.`,
      });
    }
    aanvraag.gewijzigdOp = nu;
    aanvraag.historie.push({
      op: nu,
      door: door || 'beheerder',
      tekst: toelichting || 'Gegevens gecorrigeerd en berekening opnieuw uitgevoerd.',
    });
    await this.opslag.zet(aanvraag);
    return aanvraag;
  }

  async statistieken() {
    const alle = await this.opslag.haalAlle();
    const perStatus = Object.fromEntries(STATUSSEN.map((s) => [s.id, 0]));
    const perSoort = Object.fromEntries(SOORTEN.map((s) => [s.id, 0]));
    const vandaag = new Date().toISOString().slice(0, 10);
    let totaalBedrag = 0;
    let metRecht = 0;
    let actieNodig = 0;
    for (const a of alle) {
      const soort = a.soort || DOSSIERSOORT.BEOORDELING;
      if (perSoort[soort] !== undefined) perSoort[soort] += 1;
      if (a.actiedatum && a.actiedatum <= vandaag
        && !['toegekend', 'afgewezen', 'afgesloten'].includes(a.status)) actieNodig += 1;
      if (perStatus[a.status] !== undefined) perStatus[a.status] += 1;
      const berekening = a.rapport && a.rapport.berekening;
      if (a.rapport && a.rapport.uitkomst === 'recht' && berekening) {
        totaalBedrag += berekening.totaal || 0;
        metRecht += 1;
      }
    }
    const open = alle.filter((a) => !['toegekend', 'afgewezen', 'afgesloten'].includes(a.status)).length;
    return { totaal: alle.length, open, perStatus, perSoort, totaalBedrag, metRecht, actieNodig };
  }
}
