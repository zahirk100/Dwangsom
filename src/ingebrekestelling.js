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

function regel(label, waarde) {
  const inhoud = waarde
    ? `<span class="waarde">${esc(waarde)}</span>`
    : `<span class="invulregel" aria-label="nog in te vullen">${INVULREGEL}</span>`;
  return `<div class="regel"><span class="label">${esc(label)}</span>${inhoud}</div>`;
}

/** De ingebrekestelling als afdrukbare pagina. */
export function ingebrekestellingHtml(aanvraag, organisatie, nu = vandaag()) {
  const c = ingebrekestellingContext(aanvraag, organisatie, nu);
  const g = c.gemachtigde;

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ingebrekestelling ${esc(c.referentie)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #f2f4f8; color: #16202e;
    font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  }
  .balk {
    position: sticky; top: 0; background: #fff; border-bottom: 1px solid #dbe2ec;
    padding: 12px 20px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
  }
  .balk p { margin: 0; font-size: .88rem; color: #5a6472; }
  button {
    font: inherit; font-weight: 640; padding: 9px 16px; border-radius: 9px;
    border: none; background: #24509a; color: #fff; cursor: pointer;
  }
  .blad {
    background: #fff; max-width: 21cm; min-height: 27cm; margin: 24px auto;
    padding: 2.2cm 2cm; box-shadow: 0 8px 30px rgba(13,27,51,.10);
  }
  .adressen { display: flex; justify-content: space-between; gap: 40px; margin-bottom: 36px; }
  .adres { font-size: .95rem; }
  .adres strong { display: block; }
  .afzender { text-align: right; color: #5a6472; }
  h1 { font-size: 1.25rem; margin: 0 0 4px; }
  .kenmerk { color: #5a6472; font-size: .88rem; margin: 0 0 26px; }
  h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .07em; color: #5a6472; margin: 24px 0 8px; }
  .regel { display: flex; gap: 12px; padding: 5px 0; border-bottom: 1px solid #eef1f6; }
  .label { flex: 0 0 38%; color: #5a6472; }
  .waarde { font-weight: 600; }
  .invulregel { color: #9aa6b8; letter-spacing: 1px; }
  p { margin: 0 0 12px; }
  ul { margin: 8px 0 14px; padding-left: 20px; }
  li { margin-bottom: 5px; }
  .nadruk { background: #fff8e1; padding: 2px 4px; font-weight: 600; }
  .ondertekening { margin-top: 44px; page-break-inside: avoid; }
  .ondertekening .lijn { border-bottom: 1px solid #16202e; height: 54px; width: 60%; margin-bottom: 6px; }
  .voet { margin-top: 40px; padding-top: 14px; border-top: 1px solid #eef1f6; font-size: .82rem; color: #5a6472; }
  .let-op {
    background: #fdeeda; border: 1px solid #e9c48c; color: #8a4b04;
    padding: 12px 14px; border-radius: 8px; margin-bottom: 22px; font-size: .9rem;
  }
  .te-vroeg { background: #fbe4e2; border-color: #b3261e; color: #8a1b14; }
  @media print {
    body { background: #fff; }
    .balk, .let-op { display: none; }
    .blad { box-shadow: none; margin: 0; max-width: none; min-height: 0; padding: 0; }
    @page { size: A4; margin: 2cm; }
  }
</style>
</head>
<body>
  <div class="balk">
    <button type="button" onclick="window.print()">Afdrukken of opslaan als pdf</button>
    <p>Stuur deze brief aangetekend of met ontvangstbevestiging. De datum van ontvangst
       bepaalt wanneer de dwangsom begint te lopen.</p>
  </div>

  <main class="blad">
    ${!c.verstreken ? `<div class="let-op te-vroeg"><strong>Let op: nog te vroeg.</strong>
      De beslistermijn is nog niet verstreken${c.zaak.beslisdatum ? ` (uiterlijk ${esc(c.zaak.beslisdatum)})` : ''}.
      Een ingebrekestelling die te vroeg wordt verstuurd telt niet en moet later opnieuw.</div>` : ''}
    ${c.ontbreekt.length ? `<div class="let-op"><strong>Nog niet compleet.</strong>
      Deze gegevens ontbreken en staan als invulregel in de brief:
      ${esc(c.ontbreekt.join(', '))}. Vul ze aan in het dossier en maak de brief opnieuw.</div>` : ''}

    <div class="adressen">
      <div class="adres">
        <strong>${esc(c.aan.naam || 'Het bestuursorgaan')}</strong>
        ${c.aan.regels
    ? c.aan.regels.map((regel) => esc(regel)).join('<br>')
    : `<span class="invulregel">${INVULREGEL}</span>`}
      </div>
      <div class="adres afzender">
        <strong>${esc(g.naam)}</strong>
        ${g.adres ? `${esc(g.adres)}<br>` : ''}
        ${g.postcodePlaats ? `${esc(g.postcodePlaats)}<br>` : ''}
        ${g.email ? `${esc(g.email)}<br>` : ''}
        ${g.kvk ? `KvK ${esc(g.kvk)}` : ''}
      </div>
    </div>

    <p>${esc(c.gemachtigde.postcodePlaats ? c.gemachtigde.postcodePlaats.split('  ').pop() : '')}, ${esc(c.datum)}</p>

    <h1>Ingebrekestelling wegens niet tijdig beslissen</h1>
    <p class="kenmerk">Ons dossier ${esc(c.referentie)}${c.zaak.kenmerk ? ` &middot; uw kenmerk ${esc(c.zaak.kenmerk)}` : ''}</p>

    <h2>Het gaat om</h2>
    ${regel('Naam', c.aanvrager.naam)}
    ${regel('Geboortedatum', c.aanvrager.geboortedatum)}
    ${regel('Adres', c.aanvrager.adres)}
    ${regel('Postcode en woonplaats', c.aanvrager.postcodePlaats)}
    ${regel('Telefoonnummer', c.aanvrager.telefoon)}
    ${c.aanvrager.bsnNodig ? regel('Burgerservicenummer', c.aanvrager.bsn) : ''}
    ${regel('Aanvraag', c.zaak.omschrijving)}
    ${regel('Ingediend op', c.zaak.aanvraagdatum)}
    ${regel('Uiterste beslisdatum', c.zaak.beslisdatum)}
    ${regel('Rekeningnummer voor de vergoeding', c.aanvrager.iban)}

    <h2>Geachte heer, mevrouw</h2>
    <p>Namens bovengenoemde aanvrager stel ik u hierbij in gebreke wegens het niet tijdig
       nemen van een besluit. Een door de aanvrager ondertekende machtiging is bijgevoegd.</p>

    <p>De aanvraag is ingediend op ${c.zaak.aanvraagdatum ? esc(c.zaak.aanvraagdatum) : `<span class="invulregel">${INVULREGEL}</span>`}.
       ${c.zaak.verdaagd ? 'U heeft de beslistermijn verdaagd. ' : ''}De termijn om te beslissen is
       ${c.zaak.beslisdatum ? `verstreken op <span class="nadruk">${esc(c.zaak.beslisdatum)}</span>` : 'verstreken'}${
  c.dagenTeLaat !== null && c.dagenTeLaat > 0 ? `, inmiddels ${c.dagenTeLaat} dagen geleden` : ''}.
       Tot op heden is er geen besluit genomen.</p>

    <p>Op grond van artikel 4:17 van de Algemene wet bestuursrecht verbeurt u een dwangsom
       wanneer u niet binnen <span class="nadruk">${c.termijn.dagen} dagen</span> na ontvangst van
       deze ingebrekestelling alsnog een besluit neemt. Dat betekent dat u uiterlijk
       <span class="nadruk">${esc(c.termijn.uiterlijk)}</span> moet beslissen.</p>

    <p>De dwangsom bedraagt dan (${esc(c.bedragen.grondslag)}):</p>
    <ul>
      ${c.bedragen.tranches.map((t, i) => `<li>${esc(euro(t.perDag))} per dag voor ${
  i === 0 ? 'de eerste' : 'de volgende'} ${t.dagen} dagen;</li>`).join('\n      ')}
    </ul>
    <p>De dwangsom loopt ten hoogste ${c.bedragen.maxDagen} dagen, met een maximum van
       ${esc(euro(c.bedragen.maximum))} in totaal.</p>

    <p>Ik verzoek u alsnog binnen de genoemde termijn te beslissen. Een eventueel verbeurde
       dwangsom kunt u overmaken op ${c.aanvrager.iban
    ? `rekeningnummer <span class="nadruk">${esc(c.aanvrager.iban)}</span>`
    : `het hierboven genoemde rekeningnummer`}, ten name van
       ${c.aanvrager.naam ? esc(c.aanvrager.naam) : `<span class="invulregel">${INVULREGEL}</span>`}.
       Correspondentie over deze zaak kunt u aan ondergetekende richten.</p>

    <div class="ondertekening">
      <p>Met vriendelijke groet,</p>
      <div class="lijn"></div>
      <p><strong>${esc(g.naam)}</strong><br>
         namens ${c.aanvrager.naam ? esc(c.aanvrager.naam) : `<span class="invulregel">${INVULREGEL}</span>`}</p>
    </div>

    <div class="voet">
      Bijlage: machtiging.
      ${g.telefoon ? `Vragen over deze brief: ${esc(g.telefoon)}.` : ''}
      ${g.email ? esc(g.email) : ''}
    </div>
  </main>
</body>
</html>`;
}
