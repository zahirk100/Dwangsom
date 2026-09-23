/**
 * Opslagdrivers.
 *
 * De applicatie draait op twee heel verschillende soorten hosting:
 *
 *   - een gewone server (of uw eigen laptop) met een schijf die blijft bestaan
 *     -> BestandsOpslag: een JSON-bestand, atomair geschreven;
 *   - een serverloos platform zoals Vercel, waar elke request op een verse
 *     instantie kan landen en de schijf alleen-lezen en tijdelijk is
 *     -> RedisOpslag: Upstash/Vercel KV via de REST-API, met alleen `fetch`.
 *
 * Valt er niets te kiezen, dan is er GeheugenOpslag. Die werkt, maar is
 * vluchtig; de applicatie zegt dat er dan ook duidelijk bij.
 *
 * Naast de dossiers is er een tweede, algemene laag: genummerde rijen in een
 * verzameling, met `rijen`, `rij`, `zetRij` en `wisRij`. Daar wonen de
 * gebruikers, de sessies en de eenmalige koppelingen in. Dat scheelt een
 * derde driver, en het is precies de vorm die straks een tabel wordt.
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const SLEUTEL_INDEX = 'dws:index';
const SLEUTEL_AANVRAAG = 'dws:aanvraag:';
const SLEUTEL_TELLER = 'dws:teller:';
const SLEUTEL_RIJ = 'dws:rij:';
const SLEUTEL_RIJ_INDEX = 'dws:rijen:';
const SLEUTEL_METING = 'dws:meting:';
const SLEUTEL_METING_INDEX = 'dws:metingen';

/** Leest de omgeving uit; Vercel KV en Upstash gebruiken andere namen. */
export function redisInstellingen(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || env.REDIS_REST_URL || '';
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || env.REDIS_REST_TOKEN || '';
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

/** Kiest automatisch de juiste driver voor de omgeving waarin we draaien. */
export function kiesOpslag({ dataDir, env = process.env } = {}) {
  const redis = redisInstellingen(env);
  if (redis) return new RedisOpslag(redis);
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) return new GeheugenOpslag();
  return new BestandsOpslag(dataDir);
}

// --------------------------------------------------------------- bestand ---

export class BestandsOpslag {
  soort = 'bestand';
  duurzaam = true;

  constructor(dataDir) {
    this.dataDir = dataDir;
    this.bestand = path.join(dataDir, 'aanvragen.json');
    this.verzamelingenBestand = path.join(dataDir, 'verzamelingen.json');
    this.metingenBestand = path.join(dataDir, 'metingen.json');
    this.aanvragen = [];
    this.verzamelingen = {};
    this.metingen = {};
    this.schrijfKetting = Promise.resolve();
  }

  get omschrijving() {
    return `JSON-bestand (${this.bestand})`;
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      const data = JSON.parse(await fs.readFile(this.bestand, 'utf8'));
      this.aanvragen = Array.isArray(data.aanvragen) ? data.aanvragen : [];
    } catch (err) {
      if (err.code !== 'ENOENT') throw new Error(`Kan ${this.bestand} niet lezen: ${err.message}`);
      this.aanvragen = [];
    }
    try {
      const data = JSON.parse(await fs.readFile(this.verzamelingenBestand, 'utf8'));
      this.verzamelingen = (data && typeof data.verzamelingen === 'object') ? data.verzamelingen : {};
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw new Error(`Kan ${this.verzamelingenBestand} niet lezen: ${err.message}`);
      }
      this.verzamelingen = {};
    }
    try {
      const data = JSON.parse(await fs.readFile(this.metingenBestand, 'utf8'));
      this.metingen = (data && typeof data.metingen === 'object') ? data.metingen : {};
    } catch (err) {
      if (err.code !== 'ENOENT') throw new Error(`Kan ${this.metingenBestand} niet lezen: ${err.message}`);
      this.metingen = {};
    }
    return this;
  }

  /** Schrijfacties achter elkaar uitvoeren, nooit tegelijk. */
  #bewaar() {
    this.schrijfKetting = this.schrijfKetting.then(async () => {
      const tijdelijk = path.join(this.dataDir, `.aanvragen-${randomBytes(6).toString('hex')}.tmp`);
      await fs.writeFile(tijdelijk, JSON.stringify({ versie: 1, aanvragen: this.aanvragen }, null, 2), 'utf8');
      await fs.rename(tijdelijk, this.bestand);
    }).catch((err) => {
      console.error('[opslag] schrijven mislukt:', err.message);
    });
    return this.schrijfKetting;
  }

  async haalAlle() {
    return this.aanvragen;
  }

  async haal(id) {
    return this.aanvragen.find((a) => a.id === id || a.referentie === id) || null;
  }

  async verwijder(id) {
    const voor = this.aanvragen.length;
    this.aanvragen = this.aanvragen.filter((a) => a.id !== id && a.referentie !== id);
    if (this.aanvragen.length === voor) return false;
    await this.#bewaar();
    return true;
  }

  async voegToe(aanvraag) {
    this.aanvragen.unshift(aanvraag);
    await this.#bewaar();
    return aanvraag;
  }

  async zet(aanvraag) {
    const index = this.aanvragen.findIndex((a) => a.id === aanvraag.id);
    if (index === -1) this.aanvragen.unshift(aanvraag);
    else this.aanvragen[index] = aanvraag;
    await this.#bewaar();
    return aanvraag;
  }

  async volgendNummer(jaar) {
    const prefix = `DWS-${jaar}-`;
    const hoogste = this.aanvragen
      .filter((a) => typeof a.referentie === 'string' && a.referentie.startsWith(prefix))
      .map((a) => Number.parseInt(a.referentie.slice(prefix.length), 10))
      .filter(Number.isFinite)
      .reduce((max, n) => Math.max(max, n), 0);
    return hoogste + 1;
  }

  // ------------------------------------------------------- verzamelingen ---

  #bewaarVerzamelingen() {
    this.schrijfKetting = this.schrijfKetting.then(async () => {
      const tijdelijk = path.join(this.dataDir, `.verzamelingen-${randomBytes(6).toString('hex')}.tmp`);
      await fs.writeFile(tijdelijk,
        JSON.stringify({ versie: 1, verzamelingen: this.verzamelingen }, null, 2), 'utf8');
      await fs.rename(tijdelijk, this.verzamelingenBestand);
    }).catch((err) => {
      console.error('[opslag] schrijven mislukt:', err.message);
    });
    return this.schrijfKetting;
  }

  async rijen(verzameling) {
    return Object.values(this.verzamelingen[verzameling] || {});
  }

  async rij(verzameling, id) {
    return (this.verzamelingen[verzameling] || {})[id] || null;
  }

  async zetRij(verzameling, id, waarde) {
    if (!this.verzamelingen[verzameling]) this.verzamelingen[verzameling] = {};
    this.verzamelingen[verzameling][id] = waarde;
    await this.#bewaarVerzamelingen();
    return waarde;
  }

  async wisRij(verzameling, id) {
    if (this.verzamelingen[verzameling]) delete this.verzamelingen[verzameling][id];
    await this.#bewaarVerzamelingen();
  }

  // ------------------------------------------------------------ tellers ---

  #bewaarMetingen() {
    this.schrijfKetting = this.schrijfKetting.then(async () => {
      const tijdelijk = path.join(this.dataDir, `.metingen-${randomBytes(6).toString('hex')}.tmp`);
      await fs.writeFile(tijdelijk, JSON.stringify({ versie: 1, metingen: this.metingen }, null, 2), 'utf8');
      await fs.rename(tijdelijk, this.metingenBestand);
    }).catch((err) => {
      console.error('[opslag] metingen schrijven mislukt:', err.message);
    });
    return this.schrijfKetting;
  }

  async tel(dag, veld, aantal = 1) {
    this.metingen[dag] ||= {};
    this.metingen[dag][veld] = (this.metingen[dag][veld] || 0) + aantal;
    await this.#bewaarMetingen();
    return this.metingen[dag][veld];
  }

  async tellingen(dag) {
    return { ...(this.metingen[dag] || {}) };
  }

  async meetdagen() {
    return Object.keys(this.metingen).sort();
  }
}

// ----------------------------------------------------------------- redis ---

export class RedisOpslag {
  soort = 'redis';
  duurzaam = true;

  constructor({ url, token }) {
    this.url = url;
    this.token = token;
  }

  get omschrijving() {
    return `Redis via REST (${this.url.replace(/^https?:\/\//, '').split('.')[0]}…)`;
  }

  async init() {
    // Eén rondje heen en weer, zodat een verkeerde sleutel meteen opvalt.
    await this.#roep([['PING']]);
    return this;
  }

  async #roep(commandos) {
    const antwoord = await fetch(`${this.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commandos),
    });
    if (!antwoord.ok) {
      throw new Error(`Opslag antwoordde met ${antwoord.status}: ${(await antwoord.text()).slice(0, 200)}`);
    }
    const data = await antwoord.json();
    const rijen = Array.isArray(data) ? data : [data];
    for (const rij of rijen) {
      if (rij && rij.error) throw new Error(`Opslagfout: ${rij.error}`);
    }
    return rijen.map((rij) => (rij ? rij.result : null));
  }

  async haalAlle() {
    const [ids] = await this.#roep([['LRANGE', SLEUTEL_INDEX, 0, -1]]);
    if (!ids || ids.length === 0) return [];
    const [waarden] = await this.#roep([['MGET', ...ids.map((id) => SLEUTEL_AANVRAAG + id)]]);
    return (waarden || [])
      .map((w) => { try { return w ? JSON.parse(w) : null; } catch { return null; } })
      .filter(Boolean);
  }

  async haal(id) {
    const [waarde] = await this.#roep([['GET', SLEUTEL_AANVRAAG + id]]);
    if (waarde) { try { return JSON.parse(waarde); } catch { return null; } }
    // Ook op referentienummer kunnen zoeken, net als de bestandsopslag.
    const alle = await this.haalAlle();
    return alle.find((a) => a.id === id || a.referentie === id) || null;
  }

  async voegToe(aanvraag) {
    await this.#roep([
      ['SET', SLEUTEL_AANVRAAG + aanvraag.id, JSON.stringify(aanvraag)],
      ['LPUSH', SLEUTEL_INDEX, aanvraag.id],
    ]);
    return aanvraag;
  }

  async verwijder(id) {
    // Ook uit de index halen, anders blijft haalAlle() naar een lege sleutel
    // wijzen en krijg je een gat in de lijst in plaats van een verdwenen rij.
    const [weg] = await this.#roep([
      ['DEL', SLEUTEL_AANVRAAG + id],
      ['LREM', SLEUTEL_INDEX, '0', id],
    ]);
    return Number(weg) > 0;
  }

  async zet(aanvraag) {
    await this.#roep([['SET', SLEUTEL_AANVRAAG + aanvraag.id, JSON.stringify(aanvraag)]]);
    return aanvraag;
  }

  async volgendNummer(jaar) {
    const [nummer] = await this.#roep([['INCR', SLEUTEL_TELLER + jaar]]);
    return Number(nummer) || 1;
  }

  // ------------------------------------------------------- verzamelingen ---
  // Eén sleutel per rij, plus een set met de id's erin. Een set en geen lijst,
  // zodat twee keer opslaan geen dubbele verwijzing oplevert.

  async rijen(verzameling) {
    const [ids] = await this.#roep([['SMEMBERS', `${SLEUTEL_RIJ_INDEX}${verzameling}`]]);
    if (!ids || ids.length === 0) return [];
    const [waarden] = await this.#roep([
      ['MGET', ...ids.map((id) => `${SLEUTEL_RIJ}${verzameling}:${id}`)],
    ]);
    return (waarden || [])
      .map((w) => { try { return w ? JSON.parse(w) : null; } catch { return null; } })
      .filter(Boolean);
  }

  async rij(verzameling, id) {
    const [waarde] = await this.#roep([['GET', `${SLEUTEL_RIJ}${verzameling}:${id}`]]);
    if (!waarde) return null;
    try { return JSON.parse(waarde); } catch { return null; }
  }

  async zetRij(verzameling, id, waarde) {
    await this.#roep([
      ['SET', `${SLEUTEL_RIJ}${verzameling}:${id}`, JSON.stringify(waarde)],
      ['SADD', `${SLEUTEL_RIJ_INDEX}${verzameling}`, String(id)],
    ]);
    return waarde;
  }

  async wisRij(verzameling, id) {
    await this.#roep([
      ['DEL', `${SLEUTEL_RIJ}${verzameling}:${id}`],
      ['SREM', `${SLEUTEL_RIJ_INDEX}${verzameling}`, String(id)],
    ]);
  }

  // ------------------------------------------------------------ tellers ---

  /**
   * Eén teller ophogen.
   *
   * Met HINCRBY, niet met lezen-optellen-schrijven. Twee bezoekers die op
   * dezelfde seconde binnenkomen zouden elkaars telling anders overschrijven,
   * en dat merk je nooit: je cijfers zijn dan gewoon stilletjes te laag.
   */
  async tel(dag, veld, aantal = 1) {
    const [nieuw] = await this.#roep([
      ['HINCRBY', `${SLEUTEL_METING}${dag}`, veld, String(aantal)],
      // Zonder houdbaarheidsdatum groeit dit eindeloos. Een jaar is ruim
      // genoeg om seizoenen te vergelijken.
      ['EXPIRE', `${SLEUTEL_METING}${dag}`, String(400 * 24 * 60 * 60)],
      ['SADD', SLEUTEL_METING_INDEX, dag],
    ]);
    return Number(nieuw) || 0;
  }

  async tellingen(dag) {
    const [plat] = await this.#roep([['HGETALL', `${SLEUTEL_METING}${dag}`]]);
    const uit = {};
    // Upstash geeft een vlakke lijst terug: veld, waarde, veld, waarde…
    if (Array.isArray(plat)) {
      for (let i = 0; i < plat.length; i += 2) uit[plat[i]] = Number(plat[i + 1]) || 0;
    } else if (plat && typeof plat === 'object') {
      for (const [k, w] of Object.entries(plat)) uit[k] = Number(w) || 0;
    }
    return uit;
  }

  async meetdagen() {
    const [dagen] = await this.#roep([['SMEMBERS', SLEUTEL_METING_INDEX]]);
    return (dagen || []).sort();
  }
}

// -------------------------------------------------------------- geheugen ---

export class GeheugenOpslag {
  soort = 'geheugen';
  duurzaam = false;

  constructor() {
    this.aanvragen = [];
    this.teller = new Map();
    this.verzamelingen = new Map();
  }

  get omschrijving() {
    return 'alleen werkgeheugen (niet duurzaam)';
  }

  async init() { return this; }
  async haalAlle() { return this.aanvragen; }
  async haal(id) { return this.aanvragen.find((a) => a.id === id || a.referentie === id) || null; }
  async voegToe(aanvraag) { this.aanvragen.unshift(aanvraag); return aanvraag; }
  async verwijder(id) {
    const voor = this.aanvragen.length;
    this.aanvragen = this.aanvragen.filter((a) => a.id !== id && a.referentie !== id);
    return this.aanvragen.length < voor;
  }

  async zet(aanvraag) {
    const index = this.aanvragen.findIndex((a) => a.id === aanvraag.id);
    if (index === -1) this.aanvragen.unshift(aanvraag);
    else this.aanvragen[index] = aanvraag;
    return aanvraag;
  }

  async volgendNummer(jaar) {
    const volgend = (this.teller.get(jaar) || 0) + 1;
    this.teller.set(jaar, volgend);
    return volgend;
  }

  #verzameling(naam) {
    if (!this.verzamelingen.has(naam)) this.verzamelingen.set(naam, new Map());
    return this.verzamelingen.get(naam);
  }

  async rijen(verzameling) { return [...this.#verzameling(verzameling).values()]; }
  async rij(verzameling, id) { return this.#verzameling(verzameling).get(String(id)) || null; }
  async zetRij(verzameling, id, waarde) {
    this.#verzameling(verzameling).set(String(id), waarde);
    return waarde;
  }
  async wisRij(verzameling, id) { this.#verzameling(verzameling).delete(String(id)); }

  async tel(dag, veld, aantal = 1) {
    this.metingen ||= {};
    this.metingen[dag] ||= {};
    this.metingen[dag][veld] = (this.metingen[dag][veld] || 0) + aantal;
    return this.metingen[dag][veld];
  }

  async tellingen(dag) { return { ...((this.metingen || {})[dag] || {}) }; }

  async meetdagen() { return Object.keys(this.metingen || {}).sort(); }
}
