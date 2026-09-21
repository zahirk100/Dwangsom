/**
 * Opslag van aanvragen in een JSON-bestand.
 *
 * Bewust zonder externe database: de applicatie draait met `node server.js`
 * zonder installatiestappen. Schrijven gebeurt atomair (tmp + rename) en
 * geserialiseerd via een wachtrij, zodat gelijktijdige requests elkaars
 * schrijfactie niet overschrijven.
 */

import { randomUUID, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

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

export class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.bestand = path.join(dataDir, 'aanvragen.json');
    this.aanvragen = [];
    this.klaar = false;
    this.schrijfKetting = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      const ruw = await fs.readFile(this.bestand, 'utf8');
      const data = JSON.parse(ruw);
      this.aanvragen = Array.isArray(data.aanvragen) ? data.aanvragen : [];
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw new Error(`Kan ${this.bestand} niet lezen: ${err.message}`);
      }
      this.aanvragen = [];
    }
    this.klaar = true;
    return this;
  }

  /** Schrijfacties achter elkaar uitvoeren, nooit tegelijk. */
  #bewaar() {
    this.schrijfKetting = this.schrijfKetting.then(async () => {
      const tijdelijk = path.join(this.dataDir, `.aanvragen-${randomBytes(6).toString('hex')}.tmp`);
      const inhoud = JSON.stringify({ versie: 1, aanvragen: this.aanvragen }, null, 2);
      await fs.writeFile(tijdelijk, inhoud, 'utf8');
      await fs.rename(tijdelijk, this.bestand);
    }).catch((err) => {
      console.error('[store] schrijven mislukt:', err.message);
    });
    return this.schrijfKetting;
  }

  async nieuweAanvraag({ invoer, contact, rapport, meta }) {
    const nu = new Date().toISOString();
    const aanvraag = {
      id: randomUUID(),
      referentie: await this.#nieuwReferentienummer(),
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
    this.aanvragen.unshift(aanvraag);
    await this.#bewaar();
    return aanvraag;
  }

  async #nieuwReferentienummer() {
    const jaar = new Date().getUTCFullYear();
    const prefix = `DWS-${jaar}-`;
    const hoogste = this.aanvragen
      .filter((a) => typeof a.referentie === 'string' && a.referentie.startsWith(prefix))
      .map((a) => Number.parseInt(a.referentie.slice(prefix.length), 10))
      .filter((n) => Number.isFinite(n))
      .reduce((max, n) => Math.max(max, n), 0);
    return `${prefix}${String(hoogste + 1).padStart(4, '0')}`;
  }

  lijst({ status, zoek, bestuursorgaan } = {}) {
    let resultaat = this.aanvragen.slice();
    if (status && status !== 'alle') {
      resultaat = resultaat.filter((a) => a.status === status);
    }
    if (bestuursorgaan && bestuursorgaan !== 'alle') {
      resultaat = resultaat.filter((a) => a.invoer && a.invoer.bestuursorgaan === bestuursorgaan);
    }
    if (zoek) {
      const term = String(zoek).toLowerCase().trim();
      resultaat = resultaat.filter((a) => {
        const hooiberg = [
          a.referentie,
          a.contact && a.contact.naam,
          a.contact && a.contact.email,
          a.contact && a.contact.woonplaats,
          a.invoer && a.invoer.organisatienaam,
          a.contact && a.contact.kenmerk,
        ].filter(Boolean).join(' ').toLowerCase();
        return hooiberg.includes(term);
      });
    }
    return resultaat;
  }

  vind(id) {
    return this.aanvragen.find((a) => a.id === id || a.referentie === id) || null;
  }

  async wijzigStatus(id, status, door) {
    const aanvraag = this.vind(id);
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
    await this.#bewaar();
    return aanvraag;
  }

  async voegNotitieToe(id, tekst, door) {
    const aanvraag = this.vind(id);
    if (!aanvraag) return null;
    const nu = new Date().toISOString();
    aanvraag.notities.push({ id: randomUUID(), op: nu, door: door || 'beheerder', tekst });
    aanvraag.gewijzigdOp = nu;
    await this.#bewaar();
    return aanvraag;
  }

  /** Herberekening opslaan, bijvoorbeeld nadat de beheerder data heeft gecorrigeerd. */
  async werkRapportBij(id, { invoer, rapport, door, toelichting }) {
    const aanvraag = this.vind(id);
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
    await this.#bewaar();
    return aanvraag;
  }

  statistieken() {
    const perStatus = Object.fromEntries(STATUSSEN.map((s) => [s.id, 0]));
    let totaalBedrag = 0;
    let metRecht = 0;
    for (const a of this.aanvragen) {
      if (perStatus[a.status] !== undefined) perStatus[a.status] += 1;
      const b = a.rapport && a.rapport.berekening;
      if (a.rapport && a.rapport.uitkomst === 'recht' && b) {
        totaalBedrag += b.totaal || 0;
        metRecht += 1;
      }
    }
    const open = this.aanvragen.filter((a) => !['toegekend', 'afgewezen', 'afgesloten'].includes(a.status)).length;
    return { totaal: this.aanvragen.length, open, perStatus, totaalBedrag, metRecht };
  }
}

export function labelVoorStatus(id) {
  const s = STATUSSEN.find((x) => x.id === id);
  return s ? s.label : id;
}
