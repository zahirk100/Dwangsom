/**
 * Tekst uit een pdf halen, met alleen ingebouwde modules.
 *
 * Een pdf bewaart zijn tekst in streams die meestal met zlib zijn ingepakt.
 * Node heeft zlib aan boord, dus we kunnen die streams uitpakken en de
 * tekstoperatoren eruit vissen. Dat is genoeg voor brieven die door een
 * computer zijn gemaakt - precies wat UWV, DUO en gemeenten versturen.
 *
 * Wat dit niet kan: een foto of een gescande brief zonder tekstlaag. Daar is
 * OCR voor nodig, en dat zit hier bewust niet in. De applicatie zegt dat dan
 * ook eerlijk tegen de aanvrager in plaats van een lege brief te accepteren.
 */

import zlib from 'node:zlib';

const MAX_STREAMS = 500;

/** Haalt alle (uitgepakte) contentstreams uit de pdf-bytes. */
function streams(bytes) {
  const gevonden = [];
  const tekst = bytes.toString('latin1');
  const streamPatroon = /stream\r?\n?/g;
  let match;

  while ((match = streamPatroon.exec(tekst)) !== null && gevonden.length < MAX_STREAMS) {
    const begin = match.index + match[0].length;
    const eind = tekst.indexOf('endstream', begin);
    if (eind === -1) break;
    streamPatroon.lastIndex = eind;

    const ruw = bytes.subarray(begin, eind);
    try {
      gevonden.push(zlib.inflateSync(ruw).toString('latin1'));
    } catch {
      try {
        gevonden.push(zlib.inflateRawSync(ruw).toString('latin1'));
      } catch {
        // Niet ingepakt: sommige pdf's zetten de inhoud er gewoon in.
        gevonden.push(ruw.toString('latin1'));
      }
    }
  }
  return gevonden;
}

/** Zet de escapes uit een pdf-string om naar gewone tekens. */
function ontsnap(waarde) {
  return waarde
    .replace(/\\([0-7]{1,3})/g, (_, octaal) => String.fromCharCode(parseInt(octaal, 8)))
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\([()\\])/g, '$1');
}

/**
 * De tekstoperatoren uit een contentstream lezen.
 * Tj en ' zetten één string neer, TJ een rij strings met tussenruimtes,
 * en de operatoren Td, TD, T-ster en ET betekenen meestal een nieuwe regel.
 */
function leesTekst(stream) {
  const regels = [];
  let regel = '';

  const patroon = /\((?:[^()\\]|\\.)*\)\s*Tj|\[(?:[^\][\\]|\\.)*\]\s*TJ|\((?:[^()\\]|\\.)*\)\s*'|T\*|Td|TD|ET/g;
  let match;

  while ((match = patroon.exec(stream)) !== null) {
    const stuk = match[0];

    if (stuk === 'T*' || stuk === 'Td' || stuk === 'TD' || stuk === 'ET') {
      if (regel.trim()) regels.push(regel.trim());
      regel = '';
      continue;
    }

    if (stuk.endsWith('TJ')) {
      const binnenin = stuk.slice(stuk.indexOf('[') + 1, stuk.lastIndexOf(']'));
      for (const deel of binnenin.matchAll(/\((?:[^()\\]|\\.)*\)|-?\d+(?:\.\d+)?/g)) {
        const waarde = deel[0];
        if (waarde.startsWith('(')) {
          regel += ontsnap(waarde.slice(1, -1));
        } else if (Number(waarde) < -180) {
          // Een grote negatieve verschuiving is in de praktijk een spatie.
          regel += ' ';
        }
      }
      continue;
    }

    const binnenin = stuk.slice(stuk.indexOf('(') + 1, stuk.lastIndexOf(')'));
    if (stuk.endsWith("'") && regel.trim()) {
      regels.push(regel.trim());
      regel = '';
    }
    regel += ontsnap(binnenin);
  }

  if (regel.trim()) regels.push(regel.trim());
  return regels;
}

/**
 * @param {Buffer} bytes
 * @returns {{tekst: string, gelukt: boolean, reden?: string}}
 */
export function pdfNaarTekst(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return { tekst: '', gelukt: false, reden: 'Dit lijkt geen pdf-bestand te zijn.' };
  }

  const regels = [];
  for (const stream of streams(bytes)) {
    regels.push(...leesTekst(stream));
  }

  const tekst = regels.join('\n').replace(/[ \t]+/g, ' ').trim();
  if (tekst.length < 20) {
    return {
      tekst,
      gelukt: false,
      reden: 'In deze pdf zit geen leesbare tekstlaag. Dat gebeurt bij een scan of een foto.',
    };
  }
  return { tekst, gelukt: true };
}
