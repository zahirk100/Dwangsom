/**
 * Accounts, rollen en sessies.
 *
 * Twee soorten mensen loggen hier in, met tegengestelde eisen:
 *
 *   - de aanvrager wil zo min mogelijk drempel. Hij komt eens per paar weken
 *     kijken hoe zijn zaak ervoor staat; een wachtwoord dat hij dan kwijt is,
 *     is alleen maar een obstakel. Daarom een eenmalige koppeling per e-mail.
 *   - de medewerker moet juist door een streng hek: wachtwoord én een code uit
 *     een authenticator-app, en binnenkomen kan alleen op uitnodiging.
 *
 * De sessie is een ondertekend cookie met een verwijzing naar een opgeslagen
 * sessierij. Dat is bewust anders dan het oude cookie uit src/sessie.js, dat
 * alleen een vervaltijd bevatte: nu kan een beheerder iemand ook echt
 * uitloggen, en verdwijnt de sessie zodra het account wordt geblokkeerd.
 */

import { randomUUID, randomBytes, createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { hashWachtwoord, wachtwoordKlopt, keurWachtwoord } from './wachtwoord.js';
import { nieuwGeheim, codeKlopt, otpauthUrl, nieuweHerstelcodes } from './totp.js';

export const ROLLEN = [
  { id: 'beheerder', label: 'Beheerder', uitleg: 'Alles, plus medewerkers beheren.' },
  { id: 'behandelaar', label: 'Behandelaar', uitleg: 'Dossiers behandelen en afhandelen.' },
  { id: 'lezer', label: 'Meekijker', uitleg: 'Alleen inzien en exporteren, niets wijzigen.' },
];

/** De aanvrager staat hier bewust niet bij: dat is geen medewerkersrol. */
export const MEDEWERKERROLLEN = new Set(ROLLEN.map((r) => r.id));
export const ROL_KLANT = 'klant';

export const SESSIEDUUR_MS = 8 * 60 * 60 * 1000;
/** Een klant blijft langer ingelogd: hij komt af en toe terug, niet dagelijks. */
export const KLANTSESSIEDUUR_MS = 30 * 24 * 60 * 60 * 1000;
export const KOPPELING_GELDIG_MS = 60 * 60 * 1000;

/**
 * Hoe lang een inloglink na het eerste gebruik nog werkt.
 *
 * Bedoeld voor mailapps en scanners die de link vóór de klant ophalen, en
 * voor wie twee keer tikt. Kort genoeg om geen echt tweede leven te geven.
 */
export const KOPPELING_COULANCE_MS = 10 * 60 * 1000;
export const UITNODIGING_GELDIG_MS = 7 * 24 * 60 * 60 * 1000;

const V_GEBRUIKERS = 'gebruikers';
const V_SESSIES = 'sessies';
const V_KOPPELINGEN = 'koppelingen';

export const COOKIE_MEDEWERKER = 'nb_beheer';
export const COOKIE_KLANT = 'nb_klant';

const normaliseerEmail = (email) => String(email || '').trim().toLowerCase();

/** Een token dat we nooit bewaren: alleen de hash gaat de opslag in. */
function nieuwToken() {
  return randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('base64url');
}

/**
 * Rollen die meer mogen dan kijken. Een meekijker mag niets wijzigen, ook niet
 * als de knop per ongeluk in beeld staat.
 */
export function magWijzigen(gebruiker) {
  return Boolean(gebruiker) && (gebruiker.rol === 'beheerder' || gebruiker.rol === 'behandelaar');
}

export function magBeheren(gebruiker) {
  return Boolean(gebruiker) && gebruiker.rol === 'beheerder';
}

export function isMedewerker(gebruiker) {
  return Boolean(gebruiker) && MEDEWERKERROLLEN.has(gebruiker.rol) && gebruiker.actief !== false;
}

/** Wat er over een gebruiker naar de browser mag. Nooit hashes of geheimen. */
export function naarBuiten(gebruiker) {
  if (!gebruiker) return null;
  return {
    id: gebruiker.id,
    email: gebruiker.email,
    naam: gebruiker.naam || '',
    rol: gebruiker.rol,
    actief: gebruiker.actief !== false,
    tweefactorAan: Boolean(gebruiker.totpBevestigdOp),
    laatsteAanmelding: gebruiker.laatsteAanmelding || null,
    aangemaaktOp: gebruiker.aangemaaktOp,
  };
}

export class Gebruikers {
  /**
   * @param {{opslag: object, sleutel: Buffer}} opties
   *   `sleutel` ondertekent de cookies; die komt uit SESSIE_GEHEIM.
   */
  constructor({ opslag, sleutel }) {
    this.opslag = opslag;
    this.sleutel = sleutel;
  }

  // ------------------------------------------------------------- zoeken ---

  async alle() {
    const rijen = await this.opslag.rijen(V_GEBRUIKERS);
    return rijen.sort((a, b) => String(a.email).localeCompare(String(b.email)));
  }

  async medewerkers() {
    return (await this.alle()).filter((g) => MEDEWERKERROLLEN.has(g.rol));
  }

  async vind(id) {
    return this.opslag.rij(V_GEBRUIKERS, id);
  }

  async vindOpEmail(email) {
    const gezocht = normaliseerEmail(email);
    if (!gezocht) return null;
    const alle = await this.opslag.rijen(V_GEBRUIKERS);
    return alle.find((g) => normaliseerEmail(g.email) === gezocht) || null;
  }

  /** Is er al iemand? Zo niet, dan mag de eerste zichzelf beheerder maken. */
  async isLeeg() {
    return (await this.medewerkers()).length === 0;
  }

  // ------------------------------------------------------- aanmaken ------

  async #bewaar(gebruiker) {
    await this.opslag.zetRij(V_GEBRUIKERS, gebruiker.id, gebruiker);
    return gebruiker;
  }

  /**
   * Maakt een medewerker aan. Er komt geen wachtwoord in: de uitnodiging die
   * hieruit volgt laat hem er zelf één kiezen.
   */
  async nodigMedewerkerUit({ email, naam, rol, door }) {
    const schoon = normaliseerEmail(email);
    if (!schoon || !schoon.includes('@')) throw new Error('Vul een geldig e-mailadres in.');
    if (!MEDEWERKERROLLEN.has(rol)) throw new Error('Onbekende rol.');
    if (await this.vindOpEmail(schoon)) throw new Error('Er bestaat al een account met dit e-mailadres.');

    const gebruiker = await this.#bewaar({
      id: randomUUID(),
      email: schoon,
      naam: String(naam || '').trim().slice(0, 120),
      rol,
      actief: true,
      wachtwoordHash: '',
      totpGeheim: '',
      totpBevestigdOp: null,
      herstelcodes: [],
      aangemaaktOp: new Date().toISOString(),
      aangemaaktDoor: door || null,
      laatsteAanmelding: null,
    });
    const uitnodiging = await this.maakKoppeling(gebruiker.id, 'uitnodiging', UITNODIGING_GELDIG_MS);
    return { gebruiker, uitnodiging };
  }

  /**
   * De allereerste beheerder. Alleen mogelijk zolang er nog geen medewerker
   * is; daarna gaat het via een uitnodiging.
   */
  async maakEersteBeheerder({ email, naam, wachtwoord }) {
    if (!(await this.isLeeg())) throw new Error('Er is al een beheerder ingesteld.');
    const reden = keurWachtwoord(wachtwoord);
    if (reden) throw new Error(reden);

    return this.#bewaar({
      id: randomUUID(),
      email: normaliseerEmail(email),
      naam: String(naam || '').trim().slice(0, 120),
      rol: 'beheerder',
      actief: true,
      wachtwoordHash: await hashWachtwoord(wachtwoord),
      totpGeheim: '',
      totpBevestigdOp: null,
      herstelcodes: [],
      aangemaaktOp: new Date().toISOString(),
      aangemaaktDoor: 'eerste-start',
      laatsteAanmelding: null,
    });
  }

  /** De klant krijgt een account op zijn e-mailadres, zonder wachtwoord. */
  async vindOfMaakKlant({ email, naam }) {
    const bestaand = await this.vindOpEmail(email);
    if (bestaand) return bestaand;
    return this.#bewaar({
      id: randomUUID(),
      email: normaliseerEmail(email),
      naam: String(naam || '').trim().slice(0, 120),
      rol: ROL_KLANT,
      actief: true,
      wachtwoordHash: '',
      totpGeheim: '',
      totpBevestigdOp: null,
      herstelcodes: [],
      aangemaaktOp: new Date().toISOString(),
      aangemaaktDoor: 'funnel',
      laatsteAanmelding: null,
    });
  }

  // --------------------------------------------------------- bijwerken ---

  async wijzigRol(id, rol, door) {
    if (!MEDEWERKERROLLEN.has(rol)) throw new Error('Onbekende rol.');
    const gebruiker = await this.vind(id);
    if (!gebruiker) throw new Error('Onbekend account.');
    // De laatste beheerder mag zichzelf niet degraderen; dan kan niemand meer
    // accounts beheren en is de omgeving op slot.
    if (gebruiker.rol === 'beheerder' && rol !== 'beheerder' && await this.#laatsteBeheerder(id)) {
      throw new Error('Dit is de laatste beheerder; maak eerst iemand anders beheerder.');
    }
    gebruiker.rol = rol;
    gebruiker.gewijzigdDoor = door || null;
    return this.#bewaar(gebruiker);
  }

  async zetActief(id, actief, door) {
    const gebruiker = await this.vind(id);
    if (!gebruiker) throw new Error('Onbekend account.');
    if (!actief && await this.#laatsteBeheerder(id)) {
      throw new Error('Dit is de laatste beheerder; die kan niet worden geblokkeerd.');
    }
    gebruiker.actief = Boolean(actief);
    gebruiker.gewijzigdDoor = door || null;
    await this.#bewaar(gebruiker);
    // Geblokkeerd is geblokkeerd: lopende sessies vervallen meteen.
    if (!actief) await this.beeindigSessiesVan(id);
    return gebruiker;
  }

  async #laatsteBeheerder(id) {
    const beheerders = (await this.medewerkers())
      .filter((g) => g.rol === 'beheerder' && g.actief !== false);
    return beheerders.length <= 1 && beheerders.some((g) => g.id === id);
  }

  async zetWachtwoord(id, wachtwoord) {
    const reden = keurWachtwoord(wachtwoord);
    if (reden) throw new Error(reden);
    const gebruiker = await this.vind(id);
    if (!gebruiker) throw new Error('Onbekend account.');
    gebruiker.wachtwoordHash = await hashWachtwoord(wachtwoord);
    return this.#bewaar(gebruiker);
  }

  // ------------------------------------------------------- tweefactor ---

  /** Zet een nieuw geheim klaar. Pas na bevestigen telt hij echt. */
  async begingTweefactor(id) {
    const gebruiker = await this.vind(id);
    if (!gebruiker) throw new Error('Onbekend account.');
    gebruiker.totpGeheim = nieuwGeheim();
    gebruiker.totpBevestigdOp = null;
    await this.#bewaar(gebruiker);
    return {
      geheim: gebruiker.totpGeheim,
      url: otpauthUrl({ geheim: gebruiker.totpGeheim, email: gebruiker.email }),
    };
  }

  /**
   * Bevestigt met een code uit de app. Nu pas is tweefactor aan, en nu pas
   * krijgt de medewerker zijn herstelcodes te zien.
   */
  async bevestigTweefactor(id, code) {
    const gebruiker = await this.vind(id);
    if (!gebruiker || !gebruiker.totpGeheim) throw new Error('Er staat geen tweefactor klaar.');
    if (!codeKlopt(gebruiker.totpGeheim, code)) throw new Error('Die code klopt niet. Probeer het opnieuw.');

    const codes = nieuweHerstelcodes();
    gebruiker.herstelcodes = await Promise.all(codes.map((c) => hashWachtwoord(c)));
    gebruiker.totpBevestigdOp = new Date().toISOString();
    await this.#bewaar(gebruiker);
    // De codes zelf worden hier één keer teruggegeven en daarna nooit meer.
    return codes;
  }

  /** Controleert een code of, als die niet klopt, een eenmalige herstelcode. */
  async controleerTweedeFactor(gebruiker, code) {
    if (codeKlopt(gebruiker.totpGeheim, code)) return true;

    const schoon = String(code || '').trim().toUpperCase();
    const codes = Array.isArray(gebruiker.herstelcodes) ? gebruiker.herstelcodes : [];
    for (let i = 0; i < codes.length; i += 1) {
      if (await wachtwoordKlopt(schoon, codes[i])) {
        // Eenmalig: verbruikt is verbruikt.
        codes.splice(i, 1);
        gebruiker.herstelcodes = codes;
        await this.#bewaar(gebruiker);
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------ eenmalige koppeling ---

  /**
   * Een link die één keer werkt: uitnodiging, magic link of wachtwoordherstel.
   * In de opslag staat alleen de hash, zodat een gelekte database geen
   * werkende links oplevert.
   */
  async maakKoppeling(gebruikerId, soort, geldigMs = KOPPELING_GELDIG_MS) {
    const token = nieuwToken();
    await this.opslag.zetRij(V_KOPPELINGEN, hashToken(token), {
      id: hashToken(token),
      gebruikerId,
      soort,
      verlooptOp: Date.now() + geldigMs,
      gebruiktOp: null,
      aangemaaktOp: new Date().toISOString(),
    });
    return token;
  }

  /**
   * Wisselt een token in voor de gebruiker erachter.
   *
   * Eén keer bruikbaar, maar met een korte coulanceperiode, en daar is een
   * reden voor. Een link in een e-mail wordt zelden precies één keer opgehaald:
   * mailapps en beveiligingsscanners halen hem vooraf op, iemand tikt er twee
   * keer op, of de pagina wordt herladen. Werd de link bij de eerste aanraking
   * vernietigd, dan kreeg de klant die hem zelf opende een inlogscherm te zien
   * met de mededeling dat zijn link al gebruikt was. Precies dat gebeurde.
   *
   * Binnen `KOPPELING_COULANCE_MS` na het eerste gebruik werkt hij daarom nog;
   * daarna is hij dood. Dat venster is klein, de link zelf is geheim en al
   * kort geldig, en wie hem heeft heeft de mailbox — dus dit weegt niet op
   * tegen een klant die niet in zijn eigen dossier komt.
   */
  async verzilverKoppeling(token, soort) {
    if (!token) return null;
    const rij = await this.opslag.rij(V_KOPPELINGEN, hashToken(token));
    if (!rij) return null;
    if (rij.soort !== soort) return null;
    if (rij.verlooptOp < Date.now()) {
      await this.opslag.wisRij(V_KOPPELINGEN, rij.id);
      return null;
    }
    if (rij.gebruiktOp && Date.now() - rij.gebruiktOp > KOPPELING_COULANCE_MS) {
      await this.opslag.wisRij(V_KOPPELINGEN, rij.id);
      return null;
    }

    const gebruiker = await this.vind(rij.gebruikerId);
    if (!gebruiker || gebruiker.actief === false) return null;

    // Uitnodigingen en wachtwoordherstel zijn wél hard eenmalig: die geven
    // meer weg dan toegang tot je eigen dossier.
    if (soort !== 'magic') {
      await this.opslag.wisRij(V_KOPPELINGEN, rij.id);
      return gebruiker;
    }

    if (!rij.gebruiktOp) {
      await this.opslag.zetRij(V_KOPPELINGEN, rij.id, { ...rij, gebruiktOp: Date.now() });
    }
    return gebruiker;
  }

  // ------------------------------------------------------------ inloggen ---

  /**
   * Stap één voor een medewerker: e-mailadres en wachtwoord.
   * @returns {Promise<{gebruiker: object}|{fout: string}|{tweefactorNodig: true, gebruiker: object}>}
   */
  async controleerWachtwoord(email, wachtwoord) {
    const gebruiker = await this.vindOpEmail(email);
    // Ook zonder account het werk doen, zodat de antwoordtijd niet verraadt
    // of dit e-mailadres bestaat.
    const hash = (gebruiker && gebruiker.wachtwoordHash)
      || '$scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const klopt = await wachtwoordKlopt(wachtwoord, hash);

    if (!gebruiker || !klopt) return { fout: 'Onjuist e-mailadres of wachtwoord.' };
    if (!isMedewerker(gebruiker)) return { fout: 'Dit account heeft geen toegang tot de beheeromgeving.' };
    if (!gebruiker.wachtwoordHash) return { fout: 'Dit account is nog niet ingesteld. Gebruik de uitnodiging.' };
    return { gebruiker };
  }

  async noteerAanmelding(id) {
    const gebruiker = await this.vind(id);
    if (!gebruiker) return null;
    gebruiker.laatsteAanmelding = new Date().toISOString();
    return this.#bewaar(gebruiker);
  }

  // ------------------------------------------------------------ sessies ---

  #onderteken(sessieId) {
    return createHmac('sha256', this.sleutel).update(sessieId).digest('base64url');
  }

  /** Maakt een sessie en geeft de cookiewaarde terug. */
  async maakSessie(gebruiker, { duurMs, ip, userAgent } = {}) {
    const duur = duurMs || (gebruiker.rol === ROL_KLANT ? KLANTSESSIEDUUR_MS : SESSIEDUUR_MS);
    const sessie = {
      id: randomUUID(),
      gebruikerId: gebruiker.id,
      rol: gebruiker.rol,
      verlooptOp: Date.now() + duur,
      ip: ip || null,
      userAgent: String(userAgent || '').slice(0, 200),
      aangemaaktOp: new Date().toISOString(),
    };
    await this.opslag.zetRij(V_SESSIES, sessie.id, sessie);
    return `${sessie.id}.${this.#onderteken(sessie.id)}`;
  }

  /**
   * Leest een cookie uit en geeft de gebruiker terug, of null.
   * De handtekening wordt eerst gecontroleerd: zonder geldige handtekening
   * gaan we niet eens in de opslag kijken.
   */
  /**
   * Waarom werd dit cookie niet geaccepteerd?
   *
   * Alleen om te kunnen zoeken. `uitCookie` geeft null terug en daarmee vallen
   * zes verschillende oorzaken samen: een kapotte vorm, een handtekening van
   * een andere sleutel, een sessie die niet in de opslag staat, een verlopen
   * sessie, een verdwenen gebruiker. Zonder dat onderscheid is een storing in
   * productie niet te vinden - en dat bleek.
   *
   * Dit verandert niets aan wie er binnenkomt; het beschrijft alleen wat
   * `uitCookie` net heeft geweigerd.
   */
  async waaromGeenSessie(waarde) {
    if (typeof waarde !== 'string' || waarde.indexOf('.') <= 0) return 'vorm';
    const sessieId = waarde.slice(0, waarde.indexOf('.'));
    const meegestuurd = Buffer.from(waarde.slice(waarde.indexOf('.') + 1));
    const verwacht = Buffer.from(this.#onderteken(sessieId));
    if (meegestuurd.length !== verwacht.length || !timingSafeEqual(meegestuurd, verwacht)) {
      return 'handtekening';
    }
    const sessie = await this.opslag.rij(V_SESSIES, sessieId);
    if (!sessie) return 'geen-sessie-in-opslag';
    if (sessie.verlooptOp < Date.now()) return 'verlopen';
    const gebruiker = await this.vind(sessie.gebruikerId);
    if (!gebruiker) return 'geen-gebruiker';
    if (gebruiker.actief === false) return 'niet-actief';
    return `rol-${gebruiker.rol}`;
  }

  async uitCookie(waarde) {
    if (typeof waarde !== 'string') return null;
    const punt = waarde.indexOf('.');
    if (punt <= 0) return null;
    const sessieId = waarde.slice(0, punt);
    const meegestuurd = Buffer.from(waarde.slice(punt + 1));
    const verwacht = Buffer.from(this.#onderteken(sessieId));
    if (meegestuurd.length !== verwacht.length) return null;
    if (!timingSafeEqual(meegestuurd, verwacht)) return null;

    const sessie = await this.opslag.rij(V_SESSIES, sessieId);
    if (!sessie) return null;
    if (sessie.verlooptOp < Date.now()) {
      await this.opslag.wisRij(V_SESSIES, sessieId);
      return null;
    }
    const gebruiker = await this.vind(sessie.gebruikerId);
    if (!gebruiker || gebruiker.actief === false) return null;
    return { gebruiker, sessie };
  }

  async beeindigSessie(waarde) {
    if (typeof waarde !== 'string') return;
    const sessieId = waarde.split('.')[0];
    if (sessieId) await this.opslag.wisRij(V_SESSIES, sessieId);
  }

  async beeindigSessiesVan(gebruikerId) {
    const sessies = await this.opslag.rijen(V_SESSIES);
    for (const sessie of sessies) {
      if (sessie.gebruikerId === gebruikerId) await this.opslag.wisRij(V_SESSIES, sessie.id);
    }
  }

  /** Verlopen sessies en koppelingen opruimen. */
  async ruimOp(nu = Date.now()) {
    let opgeruimd = 0;
    for (const sessie of await this.opslag.rijen(V_SESSIES)) {
      if (sessie.verlooptOp < nu) { await this.opslag.wisRij(V_SESSIES, sessie.id); opgeruimd += 1; }
    }
    for (const koppeling of await this.opslag.rijen(V_KOPPELINGEN)) {
      if (koppeling.verlooptOp < nu) { await this.opslag.wisRij(V_KOPPELINGEN, koppeling.id); opgeruimd += 1; }
    }
    return opgeruimd;
  }
}

/** Het cookie zoals het over de lijn gaat. */
export function cookieRegel(naam, waarde, { verwijder = false, veilig = false, duurMs = SESSIEDUUR_MS } = {}) {
  const delen = [
    `${naam}=${verwijder ? '' : waarde}`,
    'Path=/',
    'HttpOnly',
    // Lax en niet Strict: anders is iemand die via een e-maillink binnenkomt
    // meteen weer uitgelogd, en dat is precies hoe de klant binnenkomt.
    'SameSite=Lax',
    verwijder ? 'Max-Age=0' : `Max-Age=${Math.floor(duurMs / 1000)}`,
  ];
  if (veilig) delen.push('Secure');
  return delen.join('; ');
}
