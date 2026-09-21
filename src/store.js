/**
 * Dossierbeheer. De feitelijke opslag zit in src/opslag.js; deze laag kent
 * alleen de regels: referentienummers, statusovergangen, notities en historie.
 */

import { randomUUID } from 'node:crypto';
import { kiesOpslag } from './opslag.js';

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

  async nieuweAanvraag({ invoer, contact, rapport, meta }) {
    const nu = new Date().toISOString();
    const jaar = new Date().getUTCFullYear();
    const nummer = await this.opslag.volgendNummer(jaar);
    const aanvraag = {
      id: randomUUID(),
      referentie: `DWS-${jaar}-${String(nummer).padStart(4, '0')}`,
      status: 'nieuw',
      aangemaaktOp: nu,
      gewijzigdOp: nu,
      invoer,
      contact,
      rapport,
      meta: meta || {},
      notities: [],
      historie: [{ op: nu, door: 'systeem', tekst: 'Aanvraag ontvangen via het aanvraagformulier.' }],
    };
    await this.opslag.voegToe(aanvraag);
    return aanvraag;
  }

  async lijst({ status, zoek, bestuursorgaan } = {}) {
    let resultaat = (await this.opslag.haalAlle()).slice();
    resultaat.sort((a, b) => String(b.aangemaaktOp).localeCompare(String(a.aangemaaktOp)));
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

  /** Herberekening opslaan, bijvoorbeeld nadat de beheerder data heeft gecorrigeerd. */
  async werkRapportBij(id, { invoer, rapport, door, toelichting }) {
    const aanvraag = await this.vind(id);
    if (!aanvraag) return null;
    const nu = new Date().toISOString();
    aanvraag.invoer = invoer;
    aanvraag.rapport = rapport;
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
    let totaalBedrag = 0;
    let metRecht = 0;
    for (const a of alle) {
      if (perStatus[a.status] !== undefined) perStatus[a.status] += 1;
      const berekening = a.rapport && a.rapport.berekening;
      if (a.rapport && a.rapport.uitkomst === 'recht' && berekening) {
        totaalBedrag += berekening.totaal || 0;
        metRecht += 1;
      }
    }
    const open = alle.filter((a) => !['toegekend', 'afgewezen', 'afgesloten'].includes(a.status)).length;
    return { totaal: alle.length, open, perStatus, totaalBedrag, metRecht };
  }
}
