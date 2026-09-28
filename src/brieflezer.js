/**
 * Neemt een geüploade brief aan en maakt er leesbare tekst van.
 *
 * Wat er binnenkomt is een pdf, een tekstbestand, een foto of geplakte tekst.
 * Voor een pdf met tekstlaag en voor tekst is er niets bijzonders nodig; die
 * worden hier zelf gelezen, zonder bibliotheek.
 *
 * Een foto of een gescande pdf heeft tekstherkenning nodig. Dat gebeurt in
 * `tekstherkenning.js` en alleen als daar een sleutel voor is ingesteld. Staat
 * die er niet, dan zegt de applicatie net als voorheen eerlijk dat zij het
 * niet kan, in plaats van een leeg dossier te maken.
 *
 * Wat de tekstherkenning teruggeeft is gewone tekst en gaat daarna door
 * dezelfde regelgebaseerde herkenning als een pdf. De route na het lezen is
 * dus voor alle bestanden gelijk.
 */

import { pdfNaarTekst } from './pdftekst.js';
import { herkenTekst } from './tekstherkenning.js';

const MAX_BESTAND_BYTES = 6 * 1024 * 1024;
const MAX_TEKST = 60000;

const AFBEELDINGEN = /^image\//i;
const BEELDNAAM = /\.(jpe?g|png|heic|heif|webp|gif|tiff?)$/;

/** Het antwoord als wij een foto krijgen en er geen tekstherkenning is. */
const GEEN_HERKENNING = {
  gelukt: false,
  soort: 'afbeelding',
  reden: 'Dit is een foto. Wij kunnen tekst uit een pdf lezen, maar nog niet uit een foto.',
  hint: 'Download de brief als pdf uit uw berichtenbox, of typ de belangrijkste regels over.',
};

export async function leesBrief(
  { bestandsnaam = '', mediaType = '', data = '', tekst = '' } = {},
  { env = process.env, haal = fetch } = {},
) {
  if (tekst && String(tekst).trim().length > 0) {
    return { gelukt: true, tekst: String(tekst).slice(0, MAX_TEKST), bron: 'geplakt' };
  }

  if (!data) {
    return { gelukt: false, reden: 'Er is geen bestand of tekst meegestuurd.' };
  }

  let bytes;
  try {
    bytes = Buffer.from(String(data), 'base64');
  } catch {
    return { gelukt: false, reden: 'Het bestand kon niet worden gelezen.' };
  }
  if (bytes.length === 0) return { gelukt: false, reden: 'Het bestand is leeg.' };
  if (bytes.length > MAX_BESTAND_BYTES) {
    return { gelukt: false, reden: 'Het bestand is groter dan 6 MB. Stuur een kleinere versie.' };
  }

  const naam = String(bestandsnaam).toLowerCase();

  if (AFBEELDINGEN.test(mediaType) || BEELDNAAM.test(naam)) {
    const gelezen = await herkenTekst(bytes, { mediaType, env, haal });
    if (gelezen.gelukt) {
      return { gelukt: true, tekst: gelezen.tekst.slice(0, MAX_TEKST), bron: gelezen.bron };
    }
    // Staat de herkenning uit, dan geldt het oude antwoord. Staat zij aan maar
    // lukte het niet, dan hoort de aanvrager waaróm: een donkere foto vraagt
    // om een andere oplossing dan een storing.
    if (gelezen.soort === 'uit') return { ...GEEN_HERKENNING };
    return {
      gelukt: false,
      soort: gelezen.soort,
      reden: gelezen.reden,
      hint: gelezen.hint || GEEN_HERKENNING.hint,
    };
  }

  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-' || /\.pdf$/.test(naam)) {
    const resultaat = pdfNaarTekst(bytes);
    if (resultaat.gelukt) {
      return { gelukt: true, tekst: resultaat.tekst.slice(0, MAX_TEKST), bron: 'pdf' };
    }
    // Een pdf zonder tekstlaag is een scan: beeld in een pdf-jasje. Dat is
    // precies waar tekstherkenning voor is.
    const gescand = await herkenTekst(bytes, { mediaType: 'application/pdf', env, haal });
    if (gescand.gelukt) {
      return { gelukt: true, tekst: gescand.tekst.slice(0, MAX_TEKST), bron: gescand.bron };
    }
    return {
      gelukt: false,
      soort: gescand.soort === 'uit' ? 'pdf-zonder-tekst' : gescand.soort,
      reden: gescand.soort === 'uit' ? resultaat.reden : gescand.reden,
      hint: gescand.hint
        || 'Is de brief gescand? Typ dan de belangrijkste regels over, of stuur hem ons toe.',
    };
  }

  const alsTekst = bytes.toString('utf8');
  // Een binair bestand levert vervangingstekens op; dan is het geen brief.
  const rommel = (alsTekst.match(/�/g) || []).length;
  if (rommel > alsTekst.length / 50 || alsTekst.trim().length < 40) {
    return {
      gelukt: false,
      soort: 'onleesbaar',
      reden: 'Dit bestandstype kunnen wij niet lezen. Een pdf of een tekstbestand werkt wel.',
    };
  }
  return { gelukt: true, tekst: alsTekst.slice(0, MAX_TEKST), bron: 'tekst' };
}

export { MAX_BESTAND_BYTES };
