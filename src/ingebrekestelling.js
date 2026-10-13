/**
 * De ingebrekestelling: de brief die de klok laat lopen.
 *
 * Dit is de kern van de hele zaak. Zonder deze brief ontstaat er geen dwangsom,
 * hoe lang een instantie ook stil blijft. Artikel 4:17 Awb begint pas te tellen
 * twee weken nadat deze brief is ontvangen, en alleen als hij schriftelijk is
 * en duidelijk maakt dat er niet op tijd is beslist.
 *
 * Tot nu toe moest een behandelaar die brief zelf in een tekstverwerker maken,
 * met de datums overgetypt uit het dossier. Bij een paar zaken gaat dat; bij
 * honderd is het de reden dat er fouten in sluipen - en een verkeerde datum in
 * deze brief kost de aanvrager zijn hele vordering.
 *
 * Wat hier niet gebeurt: iets verzinnen. Ontbreekt een gegeven, dan staat er
 * een invulregel en zegt het scherm welk gegeven dat is. Een brief met een
 * gegokt burgerservicenummer is erger dan geen brief.
 */

import { parseDatum, toonDatum, vandaag, plusDagen } from '../public/shared/datum.js';
import { HERSTELTERMIJN_DAGEN, TARIEF, euro } from '../public/shared/dwangsom.js';
import { labelBestuursorgaan, vraagtBsn, zoekZaaktype } from '../public/shared/catalogus.js';
import { normaliseerBsn, toonIban } from '../public/shared/identiteit.js';
import { Pdf, A4, tekstbreedte } from './pdf.js';
import { onderwerpVan } from './zaakfeiten.js';

const esc = (tekst) => String(tekst === null || tekst === undefined ? '' : tekst)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Waar een melding van een te late beslissing heen moet.
 *
 * UWV noemt op zijn eigen site en op het formulier "Melding te late beslissing"
 * één postbus voor deze meldingen, en dat is een ander adres dan het adres op
 * de brief waarmee de zaak binnenkwam. Een ingebrekestelling die op de verkeerde
 * stapel belandt, kost dagen die de aanvrager niet terugkrijgt.
 *
 * Alleen instanties waarvan wij het adres zéker weten staan hier. Voor de rest
 * blijft het een invulregel; een gegokt postbusnummer is erger dan een leeg vak.
 */
export const POSTADRESSEN = {
  uwv: { regels: ['Postbus 58175', '1040 HD  AMSTERDAM'] },
};

const INVULREGEL = '.'.repeat(28);

/**
 * Alles wat er in de brief komt, plus wat er nog ontbreekt.
 *
 * Gescheiden van de opmaak, zodat het scherm kan zeggen wat er mist zónder de
 * brief te hoeven maken.
 */
export function ingebrekestellingContext(aanvraag = {}, organisatie = {}, nu = vandaag()) {
  const contact = aanvraag.contact || {};
  const invoer = aanvraag.invoer || {};
  const zaaktype = zoekZaaktype(invoer.zaaktype);
  const ontbreekt = [];

  const nodig = (waarde, label) => {
    const tekst = String(waarde || '').trim();
    if (tekst) return tekst;
    ontbreekt.push(label);
    return null;
  };

  const bsnNodig = vraagtBsn(invoer.bestuursorgaan);
  const bsn = normaliseerBsn(contact.bsn);
  if (bsnNodig && !bsn) ontbreekt.push('Burgerservicenummer');

  /*
   * Deze twee staan met zoveel woorden op de lijst die UWV zelf publiceert van
   * wat er in een melding per brief moet staan: het telefoonnummer en het
   * rekeningnummer waarop de vergoeding moet komen. Zonder die twee is de brief
   * niet compleet, hoe keurig de rest ook klopt.
   */
  const telefoon = String(contact.telefoon || '').trim();
  if (!telefoon) ontbreekt.push('Telefoonnummer');
  const iban = String(contact.iban || '').trim();
  if (!iban) ontbreekt.push('Rekeningnummer');

  const geboortems = parseDatum(contact.geboortedatum);
  if (!geboortems) ontbreekt.push('Geboortedatum');

  // De twee datums waar de hele brief om draait.
  const aanvraagms = parseDatum(invoer.basisdatum);
  if (!aanvraagms) ontbreekt.push('Datum van de aanvraag');
  const beslisms = parseDatum(invoer.termijnEinddatum) || parseDatum(invoer.verdagingEinddatum);
  if (!beslisms) ontbreekt.push('Uiterste beslisdatum');

  const verstreken = beslisms !== null && beslisms < nu;
  const dagenTeLaat = beslisms === null ? null : Math.max(0, Math.round((nu - beslisms) / 86400000));

  return {
    referentie: aanvraag.referentie || '',
    datum: toonDatum(nu),
    aan: {
      naam: invoer.organisatienaam || labelBestuursorgaan(invoer.bestuursorgaan) || null,
      // Een adres dat in het dossier staat gaat voor; dat komt uit de brief van
      // de instantie zelf en is dus specifieker dan onze tabel.
      regels: String(invoer.organisatieadres || '').trim()
        ? [String(invoer.organisatieadres).trim()]
        : ((POSTADRESSEN[invoer.bestuursorgaan] || {}).regels || null),
    },
    aanvrager: {
      naam: nodig(contact.naam, 'Naam'),
      geboortedatum: geboortems ? toonDatum(geboortems) : null,
      adres: nodig(contact.adres, 'Adres'),
      postcodePlaats: nodig([contact.postcode, contact.woonplaats].filter(Boolean).join('  '),
        'Postcode en woonplaats'),
      bsn: bsnNodig ? (bsn || null) : null,
      bsnNodig,
      telefoon: telefoon || null,
      iban: iban ? toonIban(iban) : null,
    },
    gemachtigde: {
      naam: organisatie.naam || 'NuBeslist',
      adres: organisatie.adres || null,
      postcodePlaats: organisatie.postcodePlaats || null,
      kvk: organisatie.kvk || null,
      email: organisatie.email || null,
      telefoon: organisatie.telefoon || null,
    },
    zaak: {
      omschrijving: zaaktype ? zaaktype.label : 'de aanvraag',
      kenmerk: String(contact.kenmerk || '').trim() || null,
      aanvraagdatum: aanvraagms ? toonDatum(aanvraagms) : null,
      beslisdatum: beslisms ? toonDatum(beslisms) : null,
      verdaagd: Boolean(invoer.verdaagd),
    },
    termijn: {
      // De hersteltermijn uit de wet, vanaf vandaag gerekend. Dit is de datum
      // waarop de dwangsom begint te lopen als er dan nog niets ligt.
      dagen: HERSTELTERMIJN_DAGEN,
      uiterlijk: toonDatum(plusDagen(nu, HERSTELTERMIJN_DAGEN)),
    },
    // De bedragen staan in de wet en komen daarom uit één bron: hier iets
    // overtypen levert een brief op die een bedrag noemt dat niet bestaat.
    bedragen: {
      tranches: TARIEF.tranches.map((t) => ({ ...t })),
      maxDagen: TARIEF.maxDagen,
      maximum: TARIEF.maxBedrag,
      grondslag: TARIEF.grondslag,
    },
    verstreken,
    dagenTeLaat,
    ontbreekt,
  };
}

/** Kan deze brief al verstuurd worden, en zo nee, waarom niet? */
export function kanIngebrekestelling(aanvraag = {}, organisatie = {}, nu = vandaag()) {
  const c = ingebrekestellingContext(aanvraag, organisatie, nu);
  if (!c.verstreken) {
    return {
      kan: false,
      reden: 'De beslistermijn is nog niet verstreken. Een ingebrekestelling die te vroeg komt, '
        + 'telt niet en moet later opnieuw.',
      ontbreekt: c.ontbreekt,
    };
  }
  if (c.ontbreekt.length > 0) {
    return {
      kan: false,
      reden: `Deze gegevens ontbreken nog: ${c.ontbreekt.join(', ')}.`,
      ontbreekt: c.ontbreekt,
    };
  }
  return { kan: true, reden: '', ontbreekt: [] };
}

/**
 * De brief in blokken, nog zonder opmaak.
 *
 * Apart van het zetwerk, zodat de toetsen kunnen lezen wat er in de brief komt
 * te staan zonder een pdf te hoeven uitpakken - en zodat er maar één plek is
 * waar de tekst staat.
 *
 * De brief is van de aanvrager zelf. Niet namens hem, niet met onze
 * ondertekening eronder en zonder machtiging als bijlage. Dat is een keuze met
 * gevolgen: wat wij met de aanvrager hebben afgesproken gaat de instantie niets
 * aan, en zo hoeft er ook geen machtigingsformulier mee. Wij zetten de brief
 * klaar, drukken hem af en doen hem op de post.
 */
export function ingebrekestellingRegels(aanvraag = {}, organisatie = {}, nu = vandaag()) {
  const c = ingebrekestellingContext(aanvraag, organisatie, nu);
  const a = c.aanvrager;
  const plaats = (String(aanvraag.contact && aanvraag.contact.woonplaats) || '').trim();

  const gegevens = [
    ['Naam', a.naam],
    ['Geboortedatum', a.geboortedatum],
    ['Adres', a.adres],
    ['Postcode en woonplaats', a.postcodePlaats],
    ['Telefoonnummer', a.telefoon],
  ];
  if (a.bsnNodig) gegevens.push(['Burgerservicenummer', a.bsn]);
  gegevens.push(['Rekeningnummer', a.iban]);

  const alinea = [];
  const onderwerp = onderwerpVan((aanvraag.invoer || {}).zaaktype, 'een aanvraag');
  alinea.push(`Op ${c.zaak.aanvraagdatum || INVULREGEL} heb ik bij u ${onderwerp} ingediend.`
    + `${c.zaak.kenmerk ? ` U heeft deze zaak geregistreerd onder kenmerk ${c.zaak.kenmerk}.` : ''}`);
  alinea.push(c.zaak.beslisdatum
    ? `${c.zaak.verdaagd ? 'U heeft de beslistermijn verdaagd. ' : ''}De termijn om te beslissen `
      + `liep tot ${c.zaak.beslisdatum}${c.dagenTeLaat > 0 ? `, inmiddels ${c.dagenTeLaat} dagen `
        + 'geleden' : ''}. Tot op heden heb ik geen besluit ontvangen.`
    : 'De termijn om op mijn aanvraag te beslissen is inmiddels verstreken. Tot op heden heb ik '
      + 'geen besluit ontvangen.');
  alinea.push('Met deze brief stel ik u in gebreke wegens het niet tijdig nemen van een besluit, '
    + 'zoals bedoeld in artikel 4:17 van de Algemene wet bestuursrecht.');
  alinea.push(`Ik verzoek u binnen ${c.termijn.dagen} dagen na ontvangst van deze brief alsnog een `
    + 'besluit te nemen en dat schriftelijk aan mij bekend te maken. Neemt u binnen die termijn '
    + 'geen besluit, dan bent u van rechtswege een dwangsom verschuldigd.');
  const reeks = c.bedragen.tranches.map((t, i, alle) => {
    const wanneer = i === 0 ? 'de eerste' : (i === alle.length - 1 ? 'de laatste' : 'de volgende');
    return `${euro(t.perDag)} per dag voor ${wanneer} ${t.dagen} dagen`;
  });
  alinea.push(`Die dwangsom bedraagt ${reeks.slice(0, -1).join(', ')} en ${reeks[reeks.length - 1]}, `
    + `met een maximum van ${euro(c.bedragen.maximum)} over ten hoogste ${c.bedragen.maxDagen} `
    + `dagen (${c.bedragen.grondslag}).`);
  alinea.push(`Een eventueel verbeurde dwangsom kunt u overmaken op rekeningnummer `
    + `${a.iban || INVULREGEL}, ten name van ${a.naam || INVULREGEL}.`);
  alinea.push('Ik verzoek u de ontvangst van deze brief schriftelijk te bevestigen.');

  return {
    aan: [c.aan.naam || 'Het bestuursorgaan', ...(c.aan.regels || [INVULREGEL])],
    afzender: [a.naam, a.adres, a.postcodePlaats, a.telefoon].filter(Boolean),
    plaatsDatum: `${plaats ? `${plaats}, ` : ''}${c.datum}`,
    betreft: 'Ingebrekestelling wegens niet tijdig beslissen',
    gegevens,
    aanhef: 'Geachte heer, mevrouw,',
    alinea,
    groet: 'Met vriendelijke groet,',
    naam: a.naam || INVULREGEL,
    ontbreekt: c.ontbreekt,
    verstreken: c.verstreken,
  };
}

/**
 * De brief als pdf: afdrukken, in een envelop, klaar.
 *
 * Geen webpagina die eerst door een afdrukvenster moet. Een browser zet daar
 * zijn eigen kop- en voetregels bij - datum, webadres, paginanummer - en dat
 * hoort niet op een brief die namens iemand anders de deur uit gaat. Bovendien
 * verschilt het resultaat per computer en per browser.
 */
export function ingebrekestellingPdf(aanvraag, organisatie, nu = vandaag()) {
  const b = ingebrekestellingRegels(aanvraag, organisatie, nu);
  const pdf = new Pdf();

  // Afzender rechtsboven, zoals op een gewone brief.
  const rechts = A4.breedte - 56;
  for (const [i, regel] of b.afzender.entries()) {
    const grootte = i === 0 ? 11 : 10;
    pdf.huidig.push({
      tekst: regel,
      x: rechts - tekstbreedte(regel, grootte, i === 0),
      y: pdf.y,
      grootte,
      vet: i === 0,
      kleur: i === 0 ? null : [0.35, 0.39, 0.45],
    });
    pdf.y -= grootte * 1.4;
  }

  pdf.wit(18);
  for (const [i, regel] of b.aan.entries()) pdf.regel(regel, { grootte: 11, vet: i === 0 });
  pdf.wit(22);
  pdf.regel(b.plaatsDatum, { grootte: 10.5 });
  pdf.wit(16);
  pdf.regel(b.betreft, { grootte: 13, vet: true });
  pdf.wit(14);

  for (const [label, waarde] of b.gegevens) pdf.veld(label, waarde || INVULREGEL);
  pdf.wit(6);
  pdf.lijn();
  pdf.wit(6);

  pdf.regel(b.aanhef, { grootte: 10.5 });
  pdf.wit(8);
  for (const alinea of b.alinea) pdf.alinea(alinea, { grootte: 10.5, na: 9 });

  pdf.wit(14);
  pdf.regel(b.groet, { grootte: 10.5 });
  pdf.wit(26);
  pdf.regel(b.naam, { grootte: 11, vet: true });

  return pdf.naarBuffer();
}

/** De bestandsnaam waaronder de brief opent of wordt bewaard. */
export function ingebrekestellingBestandsnaam(referentie) {
  return `ingebrekestelling${referentie ? `-${referentie}` : ''}.pdf`;
}
