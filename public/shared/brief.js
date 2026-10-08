/**
 * De claimbrief: het verzoek om de verbeurde dwangsom vast te stellen en uit te
 * betalen, nadat de termijn is gaan lopen.
 *
 * Hier stond ooit ook een ingebrekestelling in. Die is weggehaald toen bleek
 * dat er twee versies naast elkaar bestonden: deze, en de opgemaakte pagina in
 * src/ingebrekestelling.js. Welke je kreeg, hing af van welke knop je toevallig
 * aanklikte - en deze noemde het burgerservicenummer niet, het rekeningnummer
 * niet, en zette "[Afdeling / postadres]" in plaats van een echt adres. Precies
 * de gegevens die UWV in een melding eist. Eén brief, uit één bron.
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
  // De ingebrekestelling is een opgemaakte pagina om af te drukken; de claim is
  // nog gewone tekst om in een e-mail te plakken.
  return soort === 'claim' ? `dwangsom-claim${deel}.txt` : `ingebrekestelling${deel}.html`;
}
