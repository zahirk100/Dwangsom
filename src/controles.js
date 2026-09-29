/**
 * De controles die geen aanvraag werden.
 *
 * Verreweg de meeste mensen die hun brief uploaden, dienen geen aanvraag in.
 * Zonder dit bestand weet je alleen hóéveel dat er zijn (dat telt meting.js);
 * je weet niet wát er wegloopt. En dat is de vraag die ertoe doet: iemand die
 * afhaakt omdat hij geen recht blijkt te hebben, is geen probleem. Iemand die
 * afhaakt terwijl er duizend euro op tafel ligt, is er wel een - en dan wil je
 * weten waar in het scherm hij stopte.
 *
 * Wat hier wordt bewaard is daarom de zaak, niet de persoon:
 *
 *   - de kenmerken van de zaak (instantie, soort aanvraag, uitkomst, bedrag);
 *   - hoever iemand kwam en wanneer;
 *   - de tekst van de brieven, zodat een mens kan nakijken waaróm de
 *     herkenning iets niet vond.
 *
 * En wat hier bewust níet wordt bewaard: naam, e-mailadres, telefoonnummer,
 * rekeningnummer. Die worden pas in stap 3 ingevuld, en iemand die daarna
 * afhaakt heeft ons niets gevraagd - zijn adresgegevens bewaren om hem later
 * te kunnen benaderen is precies wat je niet wilt doen. Het
 * burgerservicenummer wordt uit de brieftekst gehaald voordat die wordt
 * opgeslagen.
 *
 * Deze gegevens gaan er na `CONTROLE_BEWAARDAGEN` dagen vanzelf weer uit.
 */

import { bsnKlopt } from '../public/shared/identiteit.js';

/** Hoelang een onvoltooide controle blijft staan. */
export function bewaardagen(env = process.env) {
  const ingesteld = Number(env.CONTROLE_BEWAARDAGEN);
  if (Number.isFinite(ingesteld) && ingesteld >= 0 && ingesteld <= 365) return Math.round(ingesteld);
  return 30;
}

/** Hoeveel er hooguit bewaard blijven, zodat dit nooit volloopt. */
export const MAX_CONTROLES = 500;

const MAX_BRIEFTEKST = 20000;
const MAX_BRIEVEN = 5;

/** Hoever iemand kwam. */
export const STAPPEN = [
  { id: 'uitslag', label: 'Uitslag gezien' },
  { id: 'gegevens', label: 'Gegevens ingevuld' },
  { id: 'akkoord', label: 'Bij de handtekening' },
  { id: 'ingediend', label: 'Aanvraag ingediend' },
];

const STAP_IDS = STAPPEN.map((s) => s.id);

/**
 * Haalt burgerservicenummers uit een tekst.
 *
 * Niet alleen het nummer dat de herkenning vond: elk los getal van negen
 * cijfers dat door de elfproef komt, gaat eruit. Een vals positief kost hier
 * niets (dan staat er een kenmerk minder in een tekst die wij toch alleen
 * gebruiken om te zien of de herkenning werkte), en een gemist nummer kost
 * wel iets.
 */
export function zonderBsn(tekst) {
  return String(tekst || '').replace(/\b\d{9}\b/g, (nummer) => (bsnKlopt(nummer) ? '·········' : nummer));
}

function tekst(waarde, maximum) {
  return String(waarde ?? '').trim().slice(0, maximum);
}

/**
 * Maakt van wat de browser stuurt een rij die bewaard mag worden.
 *
 * Deze route staat open (er is nog geen klant, dus er valt niets in te
 * loggen), dus alles wat hier binnenkomt is onbetrouwbaar. Daarom een
 * whitelist: wat hier niet wordt genoemd, bestaat niet.
 */
export function maakControle(ruw = {}, { nu = new Date().toISOString() } = {}) {
  const invoer = (ruw.invoer && typeof ruw.invoer === 'object') ? ruw.invoer : {};
  const rapport = (ruw.rapport && typeof ruw.rapport === 'object') ? ruw.rapport : {};
  const berekening = (rapport.berekening && typeof rapport.berekening === 'object') ? rapport.berekening : {};
  const stap = STAP_IDS.includes(ruw.stap) ? ruw.stap : 'uitslag';

  const brieven = (Array.isArray(ruw.brieven) ? ruw.brieven : []).slice(0, MAX_BRIEVEN)
    .map((brief) => ({
      bestandsnaam: tekst(brief && brief.bestandsnaam, 120),
      bron: tekst(brief && brief.bron, 20),
      soort: tekst(brief && brief.soort, 30),
      tekst: zonderBsn(tekst(brief && brief.tekst, MAX_BRIEFTEKST)),
    }))
    .filter((brief) => brief.tekst);

  return {
    sleutel: tekst(ruw.sleutel, 40),
    gestartOp: nu,
    bijgewerktOp: nu,
    stap,
    bron: tekst(ruw.bron, 24),
    van: tekst(ruw.van, 40),
    zaak: {
      bestuursorgaan: tekst(invoer.bestuursorgaan, 40),
      organisatienaam: tekst(invoer.organisatienaam, 80),
      zaaktype: tekst(invoer.zaaktype, 40),
      beslisdatum: tekst(invoer.termijnEinddatum, 10),
      verdaagd: Boolean(invoer.verdaagd),
      ingebrekeGesteld: Boolean(invoer.ingebrekeGesteld),
    },
    uitkomst: tekst(rapport.uitkomst, 40),
    bedrag: Number.isFinite(Number(berekening.totaal)) ? Number(berekening.totaal) : 0,
    aantalBrieven: brieven.length,
    brieven,
    aanvraagId: '',
  };
}

/** Een bestaande controle bijwerken met een latere stap. */
export function werkControleBij(bestaand, ruw = {}, { nu = new Date().toISOString() } = {}) {
  const nieuw = maakControle(ruw, { nu });
  const stapOrde = (id) => STAP_IDS.indexOf(id);
  return {
    ...bestaand,
    ...nieuw,
    gestartOp: bestaand.gestartOp || nieuw.gestartOp,
    // Nooit terug: wie van stap 3 naar stap 2 klikt is niet minder ver.
    stap: stapOrde(nieuw.stap) >= stapOrde(bestaand.stap) ? nieuw.stap : bestaand.stap,
    // Brieven alleen overschrijven als er nieuwe meekomen.
    brieven: nieuw.brieven.length ? nieuw.brieven : (bestaand.brieven || []),
    aantalBrieven: nieuw.brieven.length ? nieuw.aantalBrieven : (bestaand.aantalBrieven || 0),
    aanvraagId: bestaand.aanvraagId || '',
  };
}

/** Is deze controle ouder dan we hem willen bewaren? */
export function verlopen(controle, { dagen, nu = new Date() } = {}) {
  if (!dagen) return false;
  const gezet = Date.parse(controle.bijgewerktOp || controle.gestartOp || '');
  if (!Number.isFinite(gezet)) return true;
  return (nu.getTime() - gezet) > dagen * 24 * 60 * 60 * 1000;
}

/**
 * Het beeld waar het om begonnen was: waar haakt men af, en met wat voor zaak?
 */
export function controleOverzicht(rijen = []) {
  const perStap = Object.fromEntries(STAPPEN.map((s) => [s.id, 0]));
  const perUitkomst = {};
  const perInstantie = {};
  let zonderAanvraag = 0;
  let gemistBedrag = 0;

  for (const rij of rijen) {
    const afgerond = Boolean(rij.aanvraagId);
    if (perStap[rij.stap] !== undefined) perStap[rij.stap] += 1;
    if (!afgerond) {
      zonderAanvraag += 1;
      const uitkomst = rij.uitkomst || 'onbekend';
      perUitkomst[uitkomst] = (perUitkomst[uitkomst] || 0) + 1;
      const orgaan = (rij.zaak && rij.zaak.bestuursorgaan) || 'onbekend';
      perInstantie[orgaan] = (perInstantie[orgaan] || 0) + 1;
      if (rij.uitkomst === 'recht') gemistBedrag += Number(rij.bedrag) || 0;
    }
  }

  return {
    totaal: rijen.length,
    zonderAanvraag,
    afgerond: rijen.length - zonderAanvraag,
    perStap,
    perUitkomst,
    perInstantie,
    gemistBedrag,
  };
}
