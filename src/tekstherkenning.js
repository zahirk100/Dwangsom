/**
 * Tekst uit een foto of een gescande brief halen.
 *
 * De rest van de applicatie werkt regelgebaseerd: `briefherkenning.js` zoekt
 * met patronen naar de instantie, het zaaktype en de beslisdatum. Dat blijft
 * zo. Wat hier gebeurt is uitsluitend overtypen: van beeld naar tekst, zonder
 * interpretatie. De herkenning die daarna volgt is dezelfde als bij een pdf
 * met tekstlaag, en dus net zo goed te testen.
 *
 * Twee dingen om te weten:
 *
 *   1. Dit gaat naar een dienst buiten de applicatie. Op de foto staat de
 *      brief van de aanvrager, inclusief naam, adres en mogelijk een
 *      burgerservicenummer. Dat is een verwerking door een derde en hoort dus
 *      in de privacyverklaring te staan. Zonder sleutel in de omgeving gebeurt
 *      er niets en blijft het oude, eerlijke antwoord staan ("wij kunnen nog
 *      geen foto lezen").
 *   2. Er gaat niets naar buiten wat er niet al was. Alleen het bestand dat de
 *      aanvrager zelf uploadt, en alleen op het moment van uploaden. Er wordt
 *      niets bewaard bij de dienst voor training; de tekst komt terug en de
 *      applicatie slaat alleen die tekst op, net als bij een pdf.
 */

const STANDAARD_MODEL = 'claude-opus-5';
const ADRES = 'https://api.anthropic.com/v1/messages';
const VERSIE = '2023-06-01';
const WACHTTIJD_MS = 45000;
const MAX_TEKENS = 4000;

/**
 * De opdracht is bewust smal: overtypen, niets invullen, niets samenvatten.
 * Alles wat lijkt op "bedenk welke instantie dit is" hoort hier niet; dat doet
 * briefherkenning.js met patronen die wij zelf kunnen nalezen.
 */
const OPDRACHT = [
  'Dit is een foto of scan van een brief van een Nederlandse instantie.',
  'Typ alle tekst over die je ziet, in de volgorde waarin hij op de brief staat.',
  '',
  'Regels:',
  '- Neem datums, bedragen, kenmerken en nummers exact over.',
  '- Verzin niets en vul niets aan. Wat onleesbaar is, sla je over.',
  '- Geen samenvatting, geen uitleg, geen opmaak eromheen: alleen de tekst.',
  '- Staat er geen leesbare brief op (te donker, te schuin, iets anders dan een brief),',
  '  antwoord dan met exact: GEEN_BRIEF',
].join('\n');

/** Welke beeldformaten de dienst aankan. */
const BEELDSOORTEN = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Het mediatype uit de bytes zelf halen. Wat de browser meestuurt klopt vaak,
 * maar niet altijd (en het komt van buiten), dus wij kijken zelf.
 */
export function beeldsoort(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (b.length < 12) return '';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (b.subarray(0, 6).toString('latin1') === 'GIF89a') return 'image/gif';
  if (b.subarray(0, 6).toString('latin1') === 'GIF87a') return 'image/gif';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  // HEIC/HEIF: de iPhone-indeling. De dienst leest die niet, dus wij noemen
  // hem apart zodat de aanvrager een bruikbaar antwoord krijgt.
  if (b.subarray(4, 8).toString('latin1') === 'ftyp') {
    const merk = b.subarray(8, 12).toString('latin1');
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heim'].includes(merk)) return 'image/heic';
  }
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return '';
}

/** Staat tekstherkenning aan, en zo ja waarmee? */
export function herkenningInstellingen(env = process.env) {
  const sleutel = env.OCR_API_SLEUTEL || env.ANTHROPIC_API_KEY || '';
  return {
    aan: Boolean(sleutel),
    sleutel,
    model: env.OCR_MODEL || STANDAARD_MODEL,
  };
}

/** Het inhoudsblok dat bij het bestand hoort. */
function blokVoor(mediaType, data) {
  if (mediaType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  }
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
}

/**
 * Leest een foto, schermafbeelding of gescande pdf en geeft de tekst terug.
 *
 * `haal` en `env` zijn er zodat dit te testen is zonder netwerk en zonder
 * sleutel; in productie zijn het gewoon `fetch` en `process.env`.
 */
export async function herkenTekst(bytes, { mediaType = '', env = process.env, haal = fetch } = {}) {
  const instelling = herkenningInstellingen(env);
  if (!instelling.aan) return { gelukt: false, soort: 'uit', reden: 'Tekstherkenning staat uit.' };

  const soort = beeldsoort(bytes) || mediaType;
  if (soort === 'image/heic') {
    return {
      gelukt: false,
      soort: 'heic',
      reden: 'Dit is een iPhone-foto (HEIC). Die indeling kunnen wij niet lezen.',
      hint: 'Maak een schermafbeelding van de foto, of stel je iPhone in op "Meest compatibel".',
    };
  }
  if (!BEELDSOORTEN.includes(soort) && soort !== 'application/pdf') {
    return { gelukt: false, soort: 'formaat', reden: 'Dit beeldformaat kunnen wij niet lezen.' };
  }

  const data = (Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)).toString('base64');

  let antwoord;
  try {
    antwoord = await haal(ADRES, {
      method: 'POST',
      headers: {
        'x-api-key': instelling.sleutel,
        'anthropic-version': VERSIE,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(WACHTTIJD_MS),
      body: JSON.stringify({
        model: instelling.model,
        max_tokens: MAX_TEKENS,
        messages: [{
          role: 'user',
          content: [blokVoor(soort, data), { type: 'text', text: OPDRACHT }],
        }],
      }),
    });
  } catch (err) {
    console.error(`[tekstherkenning] aanroep mislukt: ${err.message}`);
    return { gelukt: false, soort: 'storing', reden: 'De tekstherkenning reageerde niet.' };
  }

  const lijf = await antwoord.json().catch(() => ({}));
  if (!antwoord.ok) {
    const melding = (lijf.error && lijf.error.message) || `status ${antwoord.status}`;
    console.error(`[tekstherkenning] afgewezen: ${melding}`);
    return { gelukt: false, soort: 'storing', reden: 'De tekstherkenning gaf geen antwoord.' };
  }

  const tekst = (Array.isArray(lijf.content) ? lijf.content : [])
    .filter((blok) => blok && blok.type === 'text')
    .map((blok) => String(blok.text || ''))
    .join('\n')
    .trim();

  if (!tekst || /^GEEN_BRIEF\b/.test(tekst)) {
    return {
      gelukt: false,
      soort: 'onleesbaar-beeld',
      reden: 'Op deze foto konden wij geen brief lezen.',
      hint: 'Maak de foto recht van boven, met de hele brief in beeld en genoeg licht.',
    };
  }

  return { gelukt: true, tekst, bron: soort === 'application/pdf' ? 'scan' : 'foto' };
}

export { BEELDSOORTEN, STANDAARD_MODEL };
