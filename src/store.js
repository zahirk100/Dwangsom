/**
 * Dossierbeheer. De feitelijke opslag zit in src/opslag.js; deze laag kent
 * alleen de regels: referentienummers, statusovergangen, notities en historie.
 */

import { randomUUID } from 'node:crypto';
import { kiesOpslag } from './opslag.js';
import { DOSSIERSOORT } from '../public/shared/dwangsom.js';

/**
 * Bakken die geen gevraagd stuk zijn en dus niets afvinken.
 *
 * `nieuwe-post` is wat de instantie rechtstreeks naar de aanvrager stuurde,
 * `correspondentie` is wat wij zelf in het dossier hangen: onze verstuurde
 * brieven, een e-mailwisseling, een telefoonnotitie als pdf.
 */
export const LOSSE_BAKKEN = ['nieuwe-post', 'correspondentie'];

/** De verzameling waarin de inhoud van bijlagen staat, los van het dossier. */
const VERZAMELING_BESTANDEN = 'bestanden';

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

  async nieuweAanvraag({
    invoer, contact, rapport, stukken, meta, brief, verlengbrief, handtekening, gebruikerId,
  }) {
    const nu = new Date().toISOString();
    const jaar = new Date().getUTCFullYear();
    const nummer = await this.opslag.volgendNummer(jaar);
    const vervolg = (rapport && rapport.vervolg) || {};
    const soort = vervolg.soort || DOSSIERSOORT.BEOORDELING;
    // Wat de aanvrager al heeft meegestuurd, staat meteen aangevinkt. Anders
    // meldt het dossier "ontbreekt" over stukken die gewoon binnen zijn, en
    // gaat de behandelaar daarover mailen.
    const binnen = { ...(stukken || {}) };
    if (brief) {
      binnen.ontvangstbevestiging = true;
      binnen.bezwaarschrift = true;
      binnen.primair_besluit = binnen['primair-besluit'] || binnen.primair_besluit;
      binnen.termijnbrief = true;
    }
    if (verlengbrief) binnen.verdagingsbrief = true;
    if (handtekening) binnen.machtiging = true;
    const aanvraag = {
      id: randomUUID(),
      referentie: `DWS-${jaar}-${String(nummer).padStart(4, '0')}`,
      // Het account van de aanvrager. De funnel maakt dat aan op zijn
      // e-mailadres; hiermee vindt het portaal zijn eigen dossiers terug.
      gebruikerId: gebruikerId || null,
      soort,
      status: 'nieuw',
      actiedatum: vervolg.actiedatum || null,
      aangemaaktOp: nu,
      gewijzigdOp: nu,
      invoer,
      contact,
      rapport,
      stukken: binnen,
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

  async lijst({ status, zoek, bestuursorgaan, soort, actie } = {}) {
    let resultaat = (await this.opslag.haalAlle()).slice();
    // De werklijst: alles waarvan de bewaakte datum is bereikt en dat nog
    // open staat. Blijft samenwerken met zoeken en de overige filters.
    const actieNodig = actie === 'nodig';
    if (actieNodig) {
      const vandaag = new Date().toISOString().slice(0, 10);
      resultaat = resultaat.filter((a) => a.actiedatum && a.actiedatum <= vandaag
        && !['toegekend', 'afgewezen', 'afgesloten'].includes(a.status));
    }
    resultaat.sort((a, b) => String(b.aangemaaktOp).localeCompare(String(a.aangemaaktOp)));
    if (soort && soort !== 'alle') {
      resultaat = resultaat.filter((a) => (a.soort || DOSSIERSOORT.BEOORDELING) === soort);
      // Vooraanmeldingen zijn een wachtlijst: wie het eerst aan de beurt is,
      // hoort bovenaan te staan.
      if (soort === DOSSIERSOORT.VOORAANMELDING) {
        resultaat.sort((a, b) => String(a.actiedatum || '9999').localeCompare(String(b.actiedatum || '9999')));
      }
    }
    if (actieNodig) {
      resultaat.sort((a, b) => String(a.actiedatum).localeCompare(String(b.actiedatum)));
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

  /** De dossiers van één aanvrager, voor het klantportaal. */
  async vanGebruiker(gebruikerId) {
    if (!gebruikerId) return [];
    const alle = await this.opslag.haalAlle();
    return alle
      .filter((a) => a.gebruikerId === gebruikerId)
      .sort((a, b) => String(b.aangemaaktOp).localeCompare(String(a.aangemaaktOp)));
  }

  /** Koppelt een bestaand dossier alsnog aan een account. */
  async koppelAanGebruiker(id, gebruikerId) {
    const aanvraag = await this.vind(id);
    if (!aanvraag) return null;
    aanvraag.gebruikerId = gebruikerId;
    await this.opslag.zet(aanvraag);
    return aanvraag;
  }

  async vind(id) {
    return this.opslag.haal(id);
  }

  /**
   * Een dossier definitief verwijderen.
   *
   * Dit is de enige onomkeerbare handeling in de applicatie, dus hij doet
   * precies één ding en vraagt er niets bij. De bijlagen gaan mee: die staan
   * sinds de verhuizing naar Redis in eigen rijen, en zouden anders als
   * weeskinderen achterblijven in de opslag - onzichtbaar, maar wel met
   * persoonsgegevens erin.
   *
   * Het account van de aanvrager blijft met opzet staan. Dat kan hetzelfde
   * account zijn als waarmee jij inlogt (bij het proefdraaien gebeurt dat
   * zo), en een dossier opruimen hoort nooit iemands toegang te kosten.
   *
   * @returns {Promise<{verwijderd: boolean, referentie?: string, bestanden: number}>}
   */
  async verwijderAanvraag(id) {
    const aanvraag = await this.vind(id);
    if (!aanvraag) return { verwijderd: false, bestanden: 0 };

    let bestanden = 0;
    for (const bestand of (Array.isArray(aanvraag.bestanden) ? aanvraag.bestanden : [])) {
      if (!bestand || !bestand.id) continue;
      try {
        await this.opslag.wisRij(VERZAMELING_BESTANDEN, bestand.id);
        bestanden++;
      } catch (err) {
        // Een bijlage die niet weg wil, mag het dossier niet laten staan.
        console.error('[store] bijlage verwijderen mislukt:', err.message);
      }
    }

    const verwijderd = await this.opslag.verwijder(aanvraag.id);
    return { verwijderd, referentie: aanvraag.referentie, bestanden };
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

  /**
   * Tekent aan dat een automatisch bericht de deur uit is.
   *
   * Dit staat bewust in het dossier en niet in een aparte lijst: serverloos
   * draait elke ronde in een ander proces, en alleen het dossier reist mee.
   * Zo kan hetzelfde moment nooit twee keer gemaild worden, ook niet als de
   * dagelijkse taak per ongeluk twee keer loopt.
   *
   * Een mislukte poging wordt geteld in plaats van vergeten. Een tijdelijke
   * storing mag het morgen opnieuw proberen; een adres dat blijft weigeren
   * loopt na een paar rondes vanzelf dood in plaats van eeuwig door.
   */
  async noteerBericht(id, sleutel, { gelukt = true } = {}) {
    const aanvraag = await this.vind(id);
    if (!aanvraag) return null;
    const nu = new Date().toISOString();
    aanvraag.berichten = { ...(aanvraag.berichten || {}) };
    const eerder = aanvraag.berichten[sleutel] || {};
    aanvraag.berichten[sleutel] = gelukt
      ? { verstuurdOp: nu, pogingen: (eerder.pogingen || 0) + 1 }
      : { pogingen: (eerder.pogingen || 0) + 1, laatstGeprobeerdOp: nu };
    // Alleen een geslaagde verzending is iets wat de behandelaar moet kunnen
    // terugzien. Mislukte pogingen staan in het logboek, niet in de historie
    // van de klant zijn dossier.
    if (gelukt) {
      aanvraag.historie.push({ op: nu, door: 'systeem', tekst: `Automatisch bericht verstuurd: ${sleutel}.` });
    }
    aanvraag.gewijzigdOp = nu;
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

  /**
   * Gegevens corrigeren of aanvullen vanuit de beheeromgeving. Bedoeld om
   * niet voor elk ontbrekend veld de aanvrager te hoeven mailen: wat de
   * behandelaar zelf weet of telefonisch hoort, gaat hier direct in.
   *
   * Wijzigt de invoer, dan verandert ook de berekening - en daarmee mogelijk
   * het soort dossier en de datum die bewaakt wordt.
   */
  async werkDossierBij(id, { contact, invoer, rapport, door, toelichting, gewijzigd = [] }) {
    const aanvraag = await this.vind(id);
    if (!aanvraag) return null;
    const nu = new Date().toISOString();

    if (contact) aanvraag.contact = { ...aanvraag.contact, ...contact };
    if (invoer) aanvraag.invoer = { ...aanvraag.invoer, ...invoer };

    if (rapport) {
      const vervolg = rapport.vervolg || {};
      const oudeSoort = aanvraag.soort;
      aanvraag.rapport = rapport;
      if (vervolg.soort) aanvraag.soort = vervolg.soort;
      aanvraag.actiedatum = vervolg.actiedatum || null;
      if (oudeSoort !== aanvraag.soort) {
        aanvraag.historie.push({
          op: nu,
          door: door || 'beheerder',
          tekst: `Dossier verplaatst van ${labelVoorSoort(oudeSoort)} naar ${labelVoorSoort(aanvraag.soort)}.`,
        });
      }
    }

    // Alleen loggen als er iets te melden valt. Anders vult een paar keer
    // "Opnieuw doorrekenen" de historie met regels waar niemand iets aan heeft.
    const regel = toelichting || (gewijzigd.length ? `Gegevens bijgewerkt: ${gewijzigd.join(', ')}.` : '');
    if (regel) aanvraag.historie.push({ op: nu, door: door || 'beheerder', tekst: regel });
    aanvraag.gewijzigdOp = nu;
    await this.opslag.zet(aanvraag);
    return aanvraag;
  }

  /**
   * De uitkomst van een zaak vastleggen: wat is toegekend, wanneer en of het
   * is uitbetaald. Zonder deze afsluiting blijft een dossier hangen op een
   * status zonder cijfers erachter.
   */
  async legAfhandelingVast(id, afhandeling, door) {
    const aanvraag = await this.vind(id);
    if (!aanvraag) return null;
    const nu = new Date().toISOString();

    aanvraag.afhandeling = {
      ...(aanvraag.afhandeling || {}),
      ...afhandeling,
      vastgelegdOp: nu,
      door: door || 'beheerder',
    };

    const delen = [];
    if (Number.isFinite(afhandeling.bedragToegekend)) {
      delen.push(`toegekend ${afhandeling.bedragToegekend.toFixed(2)} euro`);
    }
    if (afhandeling.beschikkingOp) delen.push(`beschikking ${afhandeling.beschikkingOp}`);
    if (afhandeling.uitbetaaldOp) delen.push(`uitbetaald ${afhandeling.uitbetaaldOp}`);
    aanvraag.historie.push({
      op: nu,
      door: door || 'beheerder',
      tekst: `Afhandeling vastgelegd${delen.length ? ': ' + delen.join(', ') : ''}.`
        + (afhandeling.toelichting ? ` ${afhandeling.toelichting}` : ''),
    });

    if (afhandeling.status && isGeldigeStatus(afhandeling.status) && afhandeling.status !== aanvraag.status) {
      aanvraag.historie.push({
        op: nu,
        door: door || 'beheerder',
        tekst: `Status gewijzigd van "${labelVoorStatus(aanvraag.status)}" naar "${labelVoorStatus(afhandeling.status)}".`,
      });
      aanvraag.status = afhandeling.status;
    }

    aanvraag.gewijzigdOp = nu;
    await this.opslag.zet(aanvraag);
    return aanvraag;
  }

  /** Bijwerken welke stukken binnen zijn. */
  /**
   * Een bestand dat de aanvrager aanlevert voor een van de gevraagde stukken.
   *
   * Het bestand gaat als base64 mee in het dossier. Dat is een bewuste
   * tussenoplossing: het werkt op elke opslagdriver en er is geen externe
   * dienst voor nodig. Het schaalt niet oneindig, want een Redis-waarde heeft
   * een maximum, en daarom staat er een harde grens op. Voor productie hoort
   * hier bestandsopslag (Vercel Blob of Supabase Storage) achter; zie
   * docs/livegang.md.
   */
  async voegBestandToe(id, { stukId, bestandsnaam, mediaType, data, door, toelichting = '' }) {
    const aanvraag = await this.vind(id);
    if (!aanvraag) return null;
    const nu = new Date().toISOString();

    if (!Array.isArray(aanvraag.bestanden)) aanvraag.bestanden = [];
    const bestandId = randomUUID();
    const bestand = {
      id: bestandId,
      stukId: String(stukId || 'overig'),
      bestandsnaam: String(bestandsnaam || 'bestand').slice(0, 160),
      mediaType: String(mediaType || '').slice(0, 80),
      bytes: Math.round((String(data).length * 3) / 4),
      doorKlant: door === 'klant',
      door: door === 'klant' ? 'de aanvrager' : (door || 'beheerder'),
      toelichting: String(toelichting || '').slice(0, 300),
      aangemaaktOp: nu,
    };

    // De inhoud gaat in een eigen rij, niet in het dossier.
    //
    // Dit stond eerst als base64 in het dossier zelf. Dat werkte, tot je
    // bedacht wat er gebeurt bij de lijst in de beheeromgeving: die haalt élk
    // dossier op, dus ook de inhoud van elk bestand. Bij een paar honderd
    // dossiers met foto's van brieven is dat honderden megabytes per klik, en
    // een dossier dat over de maximale waardegrootte van de opslag heen gaat,
    // kan helemaal niet meer worden weggeschreven.
    //
    // In het dossier blijft alleen wat je nodig hebt om het te tonen; de bytes
    // komen pas van de schijf als iemand echt op de link klikt.
    await this.opslag.zetRij(VERZAMELING_BESTANDEN, bestandId, {
      id: bestandId,
      aanvraagId: aanvraag.id,
      bestandsnaam: bestand.bestandsnaam,
      mediaType: bestand.mediaType,
      data: String(data),
    });
    aanvraag.bestanden.push(bestand);

    // Een aangeleverd stuk is meteen afgevinkt; anders staat het dossier te
    // zeggen dat er iets ontbreekt dat er gewoon is. Losse correspondentie is
    // geen gevraagd stuk en vinkt dus niets af.
    if (!LOSSE_BAKKEN.includes(bestand.stukId)) {
      if (!aanvraag.stukken) aanvraag.stukken = {};
      aanvraag.stukken[bestand.stukId] = true;
    }

    aanvraag.historie.push({
      op: nu,
      door: bestand.door,
      tekst: `Bestand toegevoegd: ${bestand.bestandsnaam}.`
        + (bestand.toelichting ? ` (${bestand.toelichting})` : ''),
    });
    aanvraag.gewijzigdOp = nu;
    await this.opslag.zet(aanvraag);
    return aanvraag;
  }

  /**
   * Een bestand uit het dossier halen.
   *
   * Een verkeerd geüpload stuk moet weg kunnen, maar het spoor blijft: in de
   * historie staat wie wat heeft weggehaald. Was dit het enige bestand bij een
   * gevraagd stuk, dan gaat het vinkje er ook weer af, anders staat het dossier
   * te zeggen dat er iets ligt dat er niet is.
   */
  async verwijderBestand(id, bestandId, door) {
    const aanvraag = await this.vind(id);
    if (!aanvraag || !Array.isArray(aanvraag.bestanden)) return null;
    const bestand = aanvraag.bestanden.find((b) => b.id === bestandId);
    if (!bestand) return null;

    aanvraag.bestanden = aanvraag.bestanden.filter((b) => b.id !== bestandId);
    await this.opslag.wisRij(VERZAMELING_BESTANDEN, bestandId);
    const nu = new Date().toISOString();

    const restVoorStuk = aanvraag.bestanden.filter((b) => b.stukId === bestand.stukId);
    if (restVoorStuk.length === 0 && !LOSSE_BAKKEN.includes(bestand.stukId)
      && aanvraag.stukken && aanvraag.stukken[bestand.stukId]) {
      aanvraag.stukken[bestand.stukId] = false;
    }

    aanvraag.historie.push({
      op: nu,
      door: door || 'beheerder',
      tekst: `Bestand verwijderd: ${bestand.bestandsnaam}.`,
    });
    aanvraag.gewijzigdOp = nu;
    await this.opslag.zet(aanvraag);
    return aanvraag;
  }

  /**
   * Eén bestand ophalen om te downloaden.
   *
   * De metagegevens staan in het dossier, de bytes in een eigen rij. Oudere
   * dossiers hebben de inhoud nog inline staan; die blijven werken.
   */
  async vindBestand(id, bestandId) {
    const aanvraag = await this.vind(id);
    if (!aanvraag || !Array.isArray(aanvraag.bestanden)) return null;
    const bestand = aanvraag.bestanden.find((b) => b.id === bestandId);
    if (!bestand) return null;
    if (bestand.data) return bestand;

    const inhoud = await this.opslag.rij(VERZAMELING_BESTANDEN, bestandId);
    if (!inhoud || !inhoud.data) return null;
    return { ...bestand, data: inhoud.data };
  }

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
    let toegekendBedrag = 0;
    let toegekendAantal = 0;
    for (const a of alle) {
      const soort = a.soort || DOSSIERSOORT.BEOORDELING;
      if (perSoort[soort] !== undefined) perSoort[soort] += 1;
      const afgerond = ['toegekend', 'afgewezen', 'afgesloten'].includes(a.status);
      if (a.actiedatum && a.actiedatum <= vandaag && !afgerond) actieNodig += 1;
      if (perStatus[a.status] !== undefined) perStatus[a.status] += 1;
      const berekening = a.rapport && a.rapport.berekening;
      if (a.rapport && a.rapport.uitkomst === 'recht' && berekening && !afgerond) {
        totaalBedrag += berekening.totaal || 0;
        metRecht += 1;
      }
      // Wat er daadwerkelijk uit kwam. Dat verdwijnt anders uit beeld zodra
      // een dossier is afgehandeld en dus geen "opgebouwd recht" meer telt.
      const toegekend = a.afhandeling && a.afhandeling.bedragToegekend;
      if (Number.isFinite(toegekend) && toegekend > 0) {
        toegekendBedrag += toegekend;
        toegekendAantal += 1;
      }
    }
    const open = alle.filter((a) => !['toegekend', 'afgewezen', 'afgesloten'].includes(a.status)).length;
    return {
      totaal: alle.length, open, perStatus, perSoort,
      totaalBedrag, metRecht, actieNodig, toegekendBedrag, toegekendAantal,
    };
  }
}
