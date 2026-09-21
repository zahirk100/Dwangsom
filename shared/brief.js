/**
 * Genereert de standaardbrieven: de ingebrekestelling en de claim nadat de
 * dwangsom is gaan lopen. Wordt zowel in de wizard (download voor de klant)
 * als in de beheeromgeving gebruikt.
 */

import { toonDatum, parseDatum, vandaag } from './datum.js';
import { euro } from './dwangsom.js';
import { labelBestuursorgaan, zoekZaaktype } from './catalogus.js';

function regels(...delen) {
  // Alleen null/undefined weglaten: een lege string is een bewuste witregel.
  return delen.filter((d) => d !== null && d !== undefined).join('\n');
}

function afzender(contact = {}) {
  return regels(
    contact.naam || '[Uw naam]',
    contact.adres || '[Straat en huisnummer]',
    [contact.postcode, contact.woonplaats].filter(Boolean).join('  ') || '[Postcode en woonplaats]',
    contact.email ? `E-mail: ${contact.email}` : null,
    contact.telefoon ? `Telefoon: ${contact.telefoon}` : null,
  );
}

function geadresseerde(invoer = {}) {
  const naam = invoer.organisatienaam || labelBestuursorgaan(invoer.bestuursorgaan);
  return regels('Aan: ' + naam, '[Afdeling / postadres]');
}

function zaakregel(invoer = {}) {
  const zt = zoekZaaktype(invoer.zaaktype);
  const onderwerp = zt ? `"${zt.label}"` : 'mijn aanvraag';
  return { onderwerp, zt };
}

/**
 * Ingebrekestelling op grond van art. 4:17 lid 3 Awb.
 */
export function ingebrekestellingBrief({ invoer = {}, contact = {}, rapport = {}, datum } = {}) {
  const briefdatum = parseDatum(datum) ?? vandaag();
  const { onderwerp } = zaakregel(invoer);
  const kenmerk = contact.kenmerk || invoer.kenmerk;
  const eindeTermijn = rapport.beslistermijn ? parseDatum(rapport.beslistermijn.einddatum) : null;

  return regels(
    afzender(contact),
    '',
    geadresseerde(invoer),
    '',
    `Datum: ${toonDatum(briefdatum)}`,
    kenmerk ? `Uw kenmerk: ${kenmerk}` : null,
    'Betreft: ingebrekestelling wegens niet tijdig beslissen',
    '',
    'Geachte heer, mevrouw,',
    '',
    `Op ${toonDatum(parseDatum(invoer.basisdatum))} heb ik bij u een aanvraag ingediend voor ${onderwerp}.`,
    eindeTermijn
      ? `De wettelijke beslistermijn is verstreken op ${toonDatum(eindeTermijn)}. Tot op heden heb ik geen besluit ontvangen.`
      : 'De wettelijke beslistermijn is inmiddels verstreken. Tot op heden heb ik geen besluit ontvangen.',
    '',
    'Met deze brief stel ik u formeel in gebreke wegens niet tijdig beslissen, zoals bedoeld in artikel 4:17, derde lid, van de Algemene wet bestuursrecht.',
    '',
    'Ik verzoek u binnen twee weken na ontvangst van deze brief alsnog een besluit te nemen en dat schriftelijk aan mij bekend te maken. Neemt u binnen die termijn geen besluit, dan bent u van rechtswege een dwangsom verschuldigd van maximaal € 1.442, berekend over ten hoogste 42 dagen (artikel 4:17, tweede lid, Awb). Ik behoud mij daarnaast het recht voor beroep in te stellen wegens niet tijdig beslissen (artikel 6:12 Awb).',
    '',
    'Ik verzoek u de ontvangst van deze ingebrekestelling schriftelijk te bevestigen.',
    '',
    'Met vriendelijke groet,',
    '',
    '',
    contact.naam || '[Uw naam]',
    contact.geboortedatum ? `Geboortedatum: ${contact.geboortedatum}` : null,
  );
}

/**
 * Verzoek om vaststelling en betaling van de verbeurde dwangsom (art. 4:18 Awb).
 */
export function claimBrief({ invoer = {}, contact = {}, rapport = {}, datum } = {}) {
  const briefdatum = parseDatum(datum) ?? vandaag();
  const { onderwerp } = zaakregel(invoer);
  const kenmerk = contact.kenmerk || invoer.kenmerk;
  const b = rapport.berekening;
  const opbouw = b && b.opbouw
    ? b.opbouw.map((t) => `- ${t.dagen} dagen x ${euro(t.perDag)} (${toonDatum(parseDatum(t.van))} t/m ${toonDatum(parseDatum(t.tot))}): ${euro(t.bedrag)}`).join('\n')
    : '';

  return regels(
    afzender(contact),
    '',
    geadresseerde(invoer),
    '',
    `Datum: ${toonDatum(briefdatum)}`,
    kenmerk ? `Uw kenmerk: ${kenmerk}` : null,
    'Betreft: verzoek om vaststelling en betaling van de verbeurde dwangsom',
    '',
    'Geachte heer, mevrouw,',
    '',
    `Op ${toonDatum(parseDatum(invoer.basisdatum))} heb ik bij u een aanvraag ingediend voor ${onderwerp}. Omdat de beslistermijn was verstreken, heb ik u op ${toonDatum(parseDatum(invoer.ingebrekestellingDatum))} schriftelijk in gebreke gesteld.`,
    '',
    b
      ? `Sinds ${toonDatum(parseDatum(b.eersteDag))} bent u een dwangsom verschuldigd. ${b.laatsteDag ? `Tot en met ${toonDatum(parseDatum(b.laatsteDag))} gaat het om ${b.dagen} ${b.dagen === 1 ? 'dag' : 'dagen'}.` : ''}`
      : 'Inmiddels bent u een dwangsom verschuldigd wegens niet tijdig beslissen.',
    opbouw ? '' : null,
    opbouw || null,
    b ? `Totaal: ${euro(b.totaal)}${b.doorlopend ? ' tot nu toe; dit bedrag loopt op zolang een besluit uitblijft.' : '.'}` : null,
    '',
    'Op grond van artikel 4:18 van de Algemene wet bestuursrecht dient u de verschuldigdheid en de hoogte van de dwangsom binnen twee weken na de laatste dag waarover de dwangsom verschuldigd was bij beschikking vast te stellen. Ik verzoek u die beschikking te nemen en het bedrag binnen zes weken aan mij te betalen.',
    '',
    'Daarnaast verzoek ik u alsnog onverwijld op mijn aanvraag te beslissen.',
    '',
    'Met vriendelijke groet,',
    '',
    '',
    contact.naam || '[Uw naam]',
  );
}

export function briefBestandsnaam(soort, referentie) {
  const deel = referentie ? `-${referentie}` : '';
  return soort === 'claim' ? `dwangsom-claim${deel}.txt` : `ingebrekestelling${deel}.txt`;
}
