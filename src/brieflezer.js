/**
 * Neemt een geüploade brief aan en maakt er leesbare tekst van.
 *
 * Wat er binnenkomt is een pdf, een tekstbestand of geplakte tekst. Een foto
 * of scan gaat hier niet doorheen: daar is tekstherkenning voor nodig, en dat
 * zit er bewust niet in. In plaats van een leeg dossier te maken zegt de
 * applicatie dan wat de aanvrager wel kan doen.
 */

import { pdfNaarTekst } from './pdftekst.js';

const MAX_BESTAND_BYTES = 6 * 1024 * 1024;
const MAX_TEKST = 60000;

const AFBEELDINGEN = /^image\//i;

export function leesBrief({ bestandsnaam = '', mediaType = '', data = '', tekst = '' } = {}) {
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

  if (AFBEELDINGEN.test(mediaType) || /\.(jpe?g|png|heic|webp|gif|tiff?)$/.test(naam)) {
    return {
      gelukt: false,
      soort: 'afbeelding',
      reden: 'Dit is een foto. Wij kunnen tekst uit een pdf lezen, maar nog niet uit een foto.',
      hint: 'Download de brief als pdf uit uw berichtenbox, of typ de belangrijkste regels over.',
    };
  }

  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-' || /\.pdf$/.test(naam)) {
    const resultaat = pdfNaarTekst(bytes);
    if (!resultaat.gelukt) {
      return {
        gelukt: false,
        soort: 'pdf-zonder-tekst',
        reden: resultaat.reden,
        hint: 'Is de brief gescand? Typ dan de belangrijkste regels over, of stuur hem ons toe.',
      };
    }
    return { gelukt: true, tekst: resultaat.tekst.slice(0, MAX_TEKST), bron: 'pdf' };
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
