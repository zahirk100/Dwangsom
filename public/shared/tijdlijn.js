/**
 * De tijdlijn zoals de aanvrager hem ziet.
 *
 * Bewust niet de interne historie: daar staat "Gegevens bijgewerkt: telefoon"
 * en "Dossier verplaatst van Vooraanmelding naar Aanvraag" in, en dat zegt de
 * klant niets. Deze tijdlijn wordt afgeleid uit de staat van het dossier, dus
 * hij klopt altijd en er kan nooit per ongeluk een interne notitie in lekken.
 *
 * Elke stap heeft een staat: 'klaar', 'bezig' of 'straks'. Dat is precies wat
 * het scherm nodig heeft om het bolletje te kleuren.
 */

import { UITKOMST } from './dwangsom.js';

/** @typedef {{sleutel: string, titel: string, onder: string, staat: string, datum?: string}} Stap */

const KLAAR = 'klaar';
const BEZIG = 'bezig';
const STRAKS = 'straks';

/**
 * @param {object} dossier het dossier zoals de server het teruggeeft
 * @returns {Stap[]}
 */
export function klantTijdlijn(dossier) {
  const invoer = (dossier && dossier.invoer) || {};
  const rapport = (dossier && dossier.rapport) || {};
  const berekening = rapport.berekening || {};
  const afhandeling = dossier && dossier.afhandeling;
  const status = (dossier && dossier.status) || 'nieuw';
  const afgerond = ['toegekend', 'afgewezen', 'afgesloten'].includes(status);

  const stappen = [];

  // 1. Altijd klaar zodra het dossier bestaat.
  stappen.push({
    sleutel: 'ontvangen',
    titel: 'Je zaak is bij ons binnen',
    onder: 'Wij hebben je brief gelezen en je gegevens vastgelegd.',
    staat: KLAAR,
    datum: dossier && dossier.aangemaaktOp,
  });

  // 2. De melding dat de instantie te laat is.
  const igsVerstuurd = Boolean(invoer.ingebrekeGesteld);
  const termijnLoopt = rapport.uitkomst === UITKOMST.TERMIJN_LOOPT;
  stappen.push({
    sleutel: 'melding',
    titel: igsVerstuurd ? 'De melding is verstuurd' : 'Wij melden dat de instantie te laat is',
    onder: igsVerstuurd
      ? 'De instantie weet nu dat de beslistermijn voorbij is.'
      : (termijnLoopt
        ? 'Zodra de beslistermijn voorbij is, versturen wij deze melding.'
        : 'Wij stellen de brief op en versturen hem namens jou.'),
    staat: igsVerstuurd ? KLAAR : (termijnLoopt ? STRAKS : BEZIG),
    datum: igsVerstuurd ? invoer.ingebrekestellingDatum : null,
  });

  // 3. De twee weken die daarna gaan lopen.
  const tweeWekenLoopt = rapport.uitkomst === UITKOMST.HERSTELTERMIJN_LOOPT;
  const tweeWekenVoorbij = igsVerstuurd && !tweeWekenLoopt;
  stappen.push({
    sleutel: 'hersteltermijn',
    titel: 'De instantie krijgt nog twee weken',
    onder: tweeWekenLoopt
      ? 'Komt er nu een besluit, dan is de zaak daarmee klaar.'
      : 'Na onze melding heeft de instantie nog twee weken om te beslissen.',
    staat: tweeWekenLoopt ? BEZIG : (tweeWekenVoorbij ? KLAAR : STRAKS),
  });

  // 4. De dwangsom zelf.
  const loopt = rapport.uitkomst === UITKOMST.RECHT;
  stappen.push({
    sleutel: 'dwangsom',
    titel: loopt ? 'Er loopt een dwangsom' : 'Wij houden de dwangsom bij',
    onder: loopt
      ? 'Wij dienen de vordering in en volgen de beschikking op.'
      : 'Blijft een besluit uit, dan telt de dwangsom vanzelf op.',
    staat: loopt ? BEZIG : (afgerond ? KLAAR : STRAKS),
  });

  // 5. De afronding.
  const uitbetaald = Boolean(afhandeling && afhandeling.uitbetaaldOp);
  stappen.push({
    sleutel: 'afronding',
    titel: uitbetaald ? 'Het bedrag is uitbetaald' : 'Uitbetaling op jouw rekening',
    onder: uitbetaald
      ? 'De instantie heeft het bedrag rechtstreeks aan jou overgemaakt.'
      : 'Een toegekende vergoeding wordt rechtstreeks aan jou overgemaakt.',
    staat: uitbetaald ? KLAAR : (afgerond ? BEZIG : STRAKS),
    datum: afhandeling ? afhandeling.uitbetaaldOp : null,
  });

  return stappen;
}

/**
 * Eén regel die samenvat waar de zaak staat. Dit is wat de klant bovenaan
 * ziet en wat in de statusmail komt.
 */
export function klantSamenvatting(dossier) {
  const rapport = (dossier && dossier.rapport) || {};
  const afhandeling = dossier && dossier.afhandeling;
  const status = (dossier && dossier.status) || 'nieuw';

  if (status === 'toegekend') {
    const bedrag = afhandeling && afhandeling.bedragToegekend;
    return {
      kop: 'Je zaak is toegekend',
      tekst: bedrag
        ? `Er is een dwangsom van € ${Number(bedrag).toFixed(2).replace('.', ',')} toegekend.`
        : 'Er is een dwangsom toegekend.',
      kleur: 'goed',
    };
  }
  if (status === 'afgewezen') {
    return {
      kop: 'De vordering is afgewezen',
      tekst: 'Wij nemen contact met je op over wat er nog mogelijk is.',
      kleur: 'let-op',
    };
  }
  if (status === 'afgesloten') {
    return { kop: 'Je zaak is afgesloten', tekst: 'Er staat niets meer open.', kleur: 'info' };
  }

  // Bewust niet rapport.kop: dat is de tekst van de rekenkern, en die zegt
  // dingen als "stel eerst in gebreke". De klant hoeft niets te stellen; wij
  // doen dat. Daarom hier een eigen zin per uitkomst.
  const perUitkomst = {
    [UITKOMST.RECHT]: {
      kop: 'Er loopt een dwangsom voor je',
      tekst: 'Wij vorderen het bedrag en volgen de beschikking op.',
      kleur: 'goed',
    },
    [UITKOMST.HERSTELTERMIJN_LOOPT]: {
      kop: 'De instantie heeft nog twee weken',
      tekst: 'Wij hebben gemeld dat de termijn voorbij is. Komt er geen besluit, dan gaat de '
        + 'dwangsom lopen en vorderen wij die voor je.',
      kleur: 'info',
    },
    [UITKOMST.INGEBREKESTELLING_NODIG]: {
      kop: 'Wij melden dat de instantie te laat is',
      tekst: 'De beslistermijn is voorbij. Wij stellen de brief op en versturen hem namens jou.',
      kleur: 'info',
    },
    [UITKOMST.TERMIJN_LOOPT]: {
      kop: 'De termijn loopt nog',
      tekst: 'Wij houden de datum in de gaten en komen in actie zodra die voorbij is.',
      kleur: 'info',
    },
    [UITKOMST.GEEN_RECHT]: {
      kop: 'Een behandelaar kijkt naar je zaak',
      tekst: 'De automatische toets ziet nog geen recht op een dwangsom. Wij laten er iemand '
        + 'naar kijken en nemen contact met je op.',
      kleur: 'let-op',
    },
  };
  return perUitkomst[rapport.uitkomst] || {
    kop: 'Wij zijn met je zaak bezig',
    tekst: 'Je hoeft zelf niets te doen; je hoort van ons zodra er iets verandert.',
    kleur: 'info',
  };
}
