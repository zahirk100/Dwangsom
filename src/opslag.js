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
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const SLEUTEL_INDEX = 'dws:index';
const SLEUTEL_AANVRAAG = 'dws:aanvraag:';
const SLEUTEL_TELLER = 'dws:teller:';

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
    this.aanvragen = [];
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

  async zet(aanvraag) {
    await this.#roep([['SET', SLEUTEL_AANVRAAG + aanvraag.id, JSON.stringify(aanvraag)]]);
    return aanvraag;
  }

  async volgendNummer(jaar) {
    const [nummer] = await this.#roep([['INCR', SLEUTEL_TELLER + jaar]]);
    return Number(nummer) || 1;
  }
}

// -------------------------------------------------------------- geheugen ---

export class GeheugenOpslag {
  soort = 'geheugen';
  duurzaam = false;

  constructor() {
    this.aanvragen = [];
    this.teller = new Map();
  }

  get omschrijving() {
    return 'alleen werkgeheugen (niet duurzaam)';
  }

  async init() { return this; }
  async haalAlle() { return this.aanvragen; }
  async haal(id) { return this.aanvragen.find((a) => a.id === id || a.referentie === id) || null; }
  async voegToe(aanvraag) { this.aanvragen.unshift(aanvraag); return aanvraag; }

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
}
