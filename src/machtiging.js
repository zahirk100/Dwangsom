/**
 * Machtiging, met één klik opgemaakt uit het dossier.
 *
 * Het resultaat is een afdrukbare pagina: de behandelaar opent hem, drukt af
 * of bewaart als pdf, en stuurt hem naar de aanvrager. Die hoeft alleen nog te
 * tekenen. Geen externe bibliotheek nodig; de browser maakt de pdf.
 *
 * Ontbreekt een gegeven, dan komt er een invulregel in het document én een
 * waarschuwing in de beheeromgeving. Liever een zichtbaar gat dan een
 * verzonnen geboortedatum op een document dat iemand ondertekent.
 */

import { parseDatum, toonDatum, vandaag } from '../public/shared/datum.js';
import { labelBestuursorgaan, vraagtBsn, zoekZaaktype } from '../public/shared/catalogus.js';
import { normaliseerBsn, toonIban } from '../public/shared/identiteit.js';

const INVULREGEL = '…'.repeat(28);

function esc(waarde) {
  return String(waarde === null || waarde === undefined ? '' : waarde)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Zet het dossier om in de regels van de machtiging en meldt wat ontbreekt.
 */
export function machtigingContext(aanvraag = {}, organisatie = {}) {
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

  const geboortedatum = parseDatum(contact.geboortedatum);
  if (!geboortedatum) ontbreekt.push('Geboortedatum');

  const bsn = normaliseerBsn(contact.bsn);
  const bsnNodig = vraagtBsn(invoer.bestuursorgaan);
  if (bsnNodig && !bsn) ontbreekt.push('Burgerservicenummer');

  return {
    referentie: aanvraag.referentie || '',
    datum: toonDatum(vandaag()),
    gever: {
      naam: nodig(contact.naam, 'Naam'),
      geboortedatum: geboortedatum ? toonDatum(geboortedatum) : null,
      adres: nodig(contact.adres, 'Adres'),
      postcodePlaats: [contact.postcode, contact.woonplaats].filter(Boolean).join('  ')
        || (ontbreekt.push('Postcode en woonplaats'), null),
      bsn: bsnNodig ? (bsn || null) : null,
      bsnNodig,
      iban: contact.iban ? toonIban(contact.iban) : null,
    },
    gemachtigde: {
      naam: organisatie.naam || 'Dwangsomhulp',
      adres: organisatie.adres || null,
      postcodePlaats: organisatie.postcodePlaats || null,
      kvk: organisatie.kvk || null,
      email: organisatie.email || null,
      telefoon: organisatie.telefoon || null,
    },
    zaak: {
      bestuursorgaan: invoer.organisatienaam || labelBestuursorgaan(invoer.bestuursorgaan),
      omschrijving: zaaktype ? zaaktype.label : 'de aanvraag',
      kenmerk: String(contact.kenmerk || '').trim() || null,
      aanvraagdatum: parseDatum(invoer.basisdatum) ? toonDatum(parseDatum(invoer.basisdatum)) : null,
    },
    handtekening: aanvraag.handtekening && aanvraag.handtekening.afbeelding
      ? { afbeelding: aanvraag.handtekening.afbeelding, gezetOp: aanvraag.handtekening.gezetOp }
      : null,
    ontbreekt,
  };
}

function regel(label, waarde) {
  const inhoud = waarde
    ? `<span class="waarde">${esc(waarde)}</span>`
    : `<span class="invulregel" aria-label="nog in te vullen">${INVULREGEL}</span>`;
  return `<div class="regel"><span class="label">${esc(label)}</span>${inhoud}</div>`;
}

/** De machtiging als afdrukbare pagina. */
export function machtigingHtml(aanvraag, organisatie) {
  const c = machtigingContext(aanvraag, organisatie);

  const bevoegdheden = [
    'het opvragen en inzien van de stukken in deze zaak',
    'het indienen van een ingebrekestelling wegens niet tijdig beslissen',
    'het vorderen van de verbeurde dwangsom en het laten vaststellen van de hoogte daarvan',
    'het instellen van beroep wegens niet tijdig beslissen en het voeren van de daarbij behorende correspondentie',
    'het ontvangen van correspondentie over deze zaak',
  ];

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Machtiging ${esc(c.referentie)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #f2f4f8; color: #16202e;
    font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
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
  h1 { font-size: 1.5rem; margin: 0 0 4px; letter-spacing: -.01em; }
  .kenmerk { color: #5a6472; font-size: .88rem; margin: 0 0 28px; }
  h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .07em; color: #5a6472; margin: 26px 0 10px; }
  .regel { display: flex; gap: 12px; padding: 5px 0; border-bottom: 1px solid #eef1f6; }
  .label { flex: 0 0 38%; color: #5a6472; }
  .waarde { font-weight: 600; }
  .invulregel { color: #9aa6b8; letter-spacing: 1px; }
  ul { margin: 8px 0 0; padding-left: 20px; }
  li { margin-bottom: 5px; }
  .voorwaarde { margin-top: 18px; font-size: .93rem; }
  .handtekeningen { display: flex; gap: 40px; margin-top: 46px; page-break-inside: avoid; }
  .handtekening { flex: 1; }
  .handtekening .lijn { border-bottom: 1px solid #16202e; height: 54px; margin-bottom: 6px; }
  .handtekening img.gezet { display: block; height: 54px; width: auto; max-width: 100%; border-bottom: 1px solid #16202e; margin-bottom: 6px; }
  .handtekening span { font-size: .84rem; color: #5a6472; }
  .voet { margin-top: 44px; padding-top: 14px; border-top: 1px solid #eef1f6; font-size: .82rem; color: #5a6472; }
  .let-op {
    background: #fdeeda; border: 1px solid #e9c48c; color: #8a4b04;
    padding: 12px 14px; border-radius: 8px; margin-bottom: 22px; font-size: .9rem;
  }
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
    <p>Stuur dit document naar de aanvrager; die hoeft alleen te ondertekenen.</p>
  </div>

  <main class="blad">
    ${c.ontbreekt.length ? `<div class="let-op"><strong>Nog niet compleet.</strong>
      Deze gegevens ontbreken en staan als invulregel in het document:
      ${esc(c.ontbreekt.join(', '))}. Vul ze aan in het dossier en maak de machtiging opnieuw,
      of laat de aanvrager ze met de hand invullen.</div>` : ''}

    <h1>Machtiging</h1>
    <p class="kenmerk">Dossier ${esc(c.referentie)} &middot; opgemaakt op ${esc(c.datum)}</p>

    <h2>Ondergetekende</h2>
    ${regel('Naam', c.gever.naam)}
    ${regel('Geboortedatum', c.gever.geboortedatum)}
    ${regel('Adres', c.gever.adres)}
    ${regel('Postcode en woonplaats', c.gever.postcodePlaats)}
    ${c.gever.bsnNodig ? regel('Burgerservicenummer', c.gever.bsn) : ''}

    <h2>Machtigt</h2>
    ${regel('Naam', c.gemachtigde.naam)}
    ${regel('Adres', c.gemachtigde.adres)}
    ${regel('Postcode en woonplaats', c.gemachtigde.postcodePlaats)}
    ${regel('KvK-nummer', c.gemachtigde.kvk)}

    <h2>Om op te treden in deze zaak</h2>
    ${regel('Bestuursorgaan', c.zaak.bestuursorgaan)}
    ${regel('Betreft', c.zaak.omschrijving)}
    ${regel('Aanvraag ingediend op', c.zaak.aanvraagdatum)}
    ${regel('Kenmerk of zaaknummer', c.zaak.kenmerk)}

    <h2>De machtiging omvat</h2>
    <ul>${bevoegdheden.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>

    <p class="voorwaarde">
      Betalingen worden niet namens ondergetekende in ontvangst genomen: een toegekende
      dwangsom wordt rechtstreeks aan ondergetekende uitbetaald${c.gever.iban ? `, op rekeningnummer ${esc(c.gever.iban)}` : ''}.
      Deze machtiging geldt tot ondergetekende haar schriftelijk intrekt.
    </p>

    <div class="handtekeningen">
      <div class="handtekening">
        ${c.handtekening
          ? `<img class="gezet" src="${esc(c.handtekening.afbeelding)}" alt="Handtekening van ${esc(c.gever.naam || 'de ondergetekende')}">`
          : '<div class="lijn"></div>'}
        <span>Handtekening ondergetekende${c.handtekening
          ? `<br>Digitaal gezet op ${esc(toonDatum(parseDatum(String(c.handtekening.gezetOp).slice(0, 10))))}`
          : `<br>Plaats en datum: ${INVULREGEL}`}</span>
      </div>
      <div class="handtekening">
        <div class="lijn"></div>
        <span>Namens ${esc(c.gemachtigde.naam)}<br>Plaats en datum: ${INVULREGEL}</span>
      </div>
    </div>

    <p class="voet">
      ${esc(c.gemachtigde.naam)}${c.gemachtigde.kvk ? ` &middot; KvK ${esc(c.gemachtigde.kvk)}` : ''}
      ${c.gemachtigde.email ? ` &middot; ${esc(c.gemachtigde.email)}` : ''}
      ${c.gemachtigde.telefoon ? ` &middot; ${esc(c.gemachtigde.telefoon)}` : ''}
    </p>
  </main>
</body>
</html>`;
}
