/**
 * Maakt de voorbeeldbrieven waarmee de funnel te testen is: als .txt en als
 * echte pdf met een ingepakte tekstlaag, zodat ook de pdf-extractie wordt
 * beproefd. Draaien met: node voorbeelden/maak-brieven.mjs
 *
 * De brieven zijn nagemaakt en bevatten verzonnen namen en nummers.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));

function pdfString(regel) {
  return regel.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7e]/g, (teken) => ({ '€': 'EUR', 'é': 'e', 'ë': 'e' }[teken] || '?'));
}

/** Een eenvoudige pdf van één of meer pagina's met platte tekst. */
function maakPdf(regels) {
  const perPagina = 52;
  const paginas = [];
  for (let i = 0; i < regels.length; i += perPagina) paginas.push(regels.slice(i, i + perPagina));

  const objecten = [];
  const paginaIds = paginas.map((_, i) => 5 + i * 2);

  objecten[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objecten[2] = `<< /Type /Pages /Kids [${paginaIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${paginas.length} >>`;
  objecten[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objecten[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

  const stukken = [];
  paginas.forEach((paginaRegels, index) => {
    const paginaId = paginaIds[index];
    const inhoudId = paginaId + 1;
    objecten[paginaId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] `
      + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${inhoudId} 0 R >>`;
    const inhoud = ['BT', '/F1 10 Tf', '14 TL', '57 785 Td']
      .concat(paginaRegels.map((regel) => `(${pdfString(regel)}) Tj T*`))
      .concat(['ET']).join('\n');
    stukken.push({ id: inhoudId, data: zlib.deflateSync(Buffer.from(inhoud, 'latin1')) });
  });

  let pdf = Buffer.from('%PDF-1.4\n', 'latin1');
  const posities = [];
  const hoogste = Math.max(...Object.keys(objecten).map(Number), ...stukken.map((s) => s.id));

  for (let id = 1; id <= hoogste; id += 1) {
    posities[id] = pdf.length;
    const stroom = stukken.find((s) => s.id === id);
    if (stroom) {
      pdf = Buffer.concat([
        pdf,
        Buffer.from(`${id} 0 obj\n<< /Length ${stroom.data.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
        stroom.data,
        Buffer.from('\nendstream\nendobj\n', 'latin1'),
      ]);
    } else if (objecten[id]) {
      pdf = Buffer.concat([pdf, Buffer.from(`${id} 0 obj\n${objecten[id]}\nendobj\n`, 'latin1')]);
    } else {
      pdf = Buffer.concat([pdf, Buffer.from(`${id} 0 obj\n<< >>\nendobj\n`, 'latin1')]);
    }
  }

  const xref = pdf.length;
  let tabel = `xref\n0 ${hoogste + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= hoogste; id += 1) {
    tabel += `${String(posities[id]).padStart(10, '0')} 00000 n \n`;
  }
  tabel += `trailer\n<< /Size ${hoogste + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.concat([pdf, Buffer.from(tabel, 'latin1')]);
}

const brieven = {
  'uwv-wia-ontvangstbevestiging': [
    'UWV', 'Postbus 58285', '1040 HG Amsterdam', '',
    'De heer S. Javaid', 'Straatnaam 12', '1234 AB Amsterdam', '',
    'Datum: 14 juli 2026',
    'Ons kenmerk: 123456789 / WIA-2026-44821',
    'Betreft: ontvangst van uw aanvraag WIA-uitkering', '',
    'Geachte heer Javaid,', '',
    'Wij hebben uw aanvraag voor een WIA-uitkering ontvangen op 10 juli 2026.',
    'In deze brief leest u wat er nu gebeurt.', '',
    'Wanneer krijgt u een beslissing?',
    'Wij beoordelen uw aanvraag. U ontvangt uiterlijk 14 september 2026 een',
    'beslissing van ons. Lukt het ons niet om op tijd te beslissen, dan krijgt u',
    'daarover bericht.', '',
    'Wat moet u zelf doen?',
    'U hoeft nu niets te doen. Wel vragen wij u wijzigingen in uw situatie aan',
    'ons door te geven.', '',
    'Heeft u nog vragen?',
    'Kijk op uwv.nl of bel ons op 088 - 898 92 94.', '',
    'Met vriendelijke groet,', 'UWV', 'Afdeling Sociaal Medische Zaken',
  ],
  'uwv-bezwaar-ontvangstbevestiging': [
    'UWV', 'Afdeling Bezwaar en Beroep', 'Postbus 58285', '1040 HG Amsterdam', '',
    'Mevrouw A. de Groot', 'Kerkstraat 7', '3511 AA Utrecht', '',
    'Datum: 3 maart 2026',
    'Ons kenmerk: 987654321 / BB-2026-1180',
    'Betreft: ontvangst van uw bezwaarschrift', '',
    'Geachte mevrouw De Groot,', '',
    'Wij hebben uw bezwaarschrift ontvangen op 27 februari 2026. Uw bezwaar',
    'gaat over onze beslissing van 20 januari 2026 over uw WW-uitkering.', '',
    'Wanneer krijgt u een beslissing op uw bezwaar?',
    'Wij nemen uiterlijk 3 juni 2026 een beslissing op uw bezwaar.', '',
    'Met vriendelijke groet,', 'UWV',
  ],
  'gemeente-bijstand-ontvangstbevestiging': [
    'Gemeente Zwolle', 'Afdeling Werk en Inkomen', 'Postbus 10007', '8000 GA Zwolle', '',
    'De heer M. el Amrani', 'Vechtstraat 45', '8022 CD Zwolle', '',
    'Datum: 5 mei 2026',
    'Zaaknummer: Z-2026-0098123',
    'Onderwerp: ontvangstbevestiging aanvraag bijstandsuitkering', '',
    'Geachte heer El Amrani,', '',
    'Op 4 mei 2026 hebben wij uw aanvraag voor een bijstandsuitkering op grond',
    'van de Participatiewet ontvangen.', '',
    'Beslistermijn',
    'Wij nemen uiterlijk binnen acht weken na ontvangst van uw aanvraag een',
    'besluit. Dat betekent dat u uiterlijk 29 juni 2026 een besluit van ons',
    'ontvangt.', '',
    'Met vriendelijke groet,',
    'namens het college van burgemeester en wethouders van Zwolle',
  ],
  'duo-studiefinanciering-ontvangstbevestiging': [
    'DUO', 'Dienst Uitvoering Onderwijs', 'Postbus 50081', '9702 EJ Groningen', '',
    'Mevrouw L. Pietersen', 'Hoofdweg 3', '9726 AA Groningen', '',
    'Datum: 12 februari 2026',
    'Burgerservicenummer: 111222333',
    'Ons kenmerk: DUO-2026-77410',
    'Betreft: uw aanvraag studiefinanciering', '',
    'Geachte mevrouw Pietersen,', '',
    'Wij hebben uw aanvraag ontvangen op 9 februari 2026.', '',
    'U krijgt uiterlijk 6 april 2026 bericht over uw aanvraag.', '',
    'Met vriendelijke groet,', 'DUO',
  ],
  'uwv-verlenging-beslistermijn': [
    'UWV', 'Postbus 58285', '1040 HG Amsterdam', '',
    'De heer S. Javaid', 'Straatnaam 12', '1234 AB Amsterdam', '',
    'Datum: 8 september 2026',
    'Ons kenmerk: 123456789 / WIA-2026-44821',
    'Betreft: wij hebben meer tijd nodig', '',
    'Geachte heer Javaid,', '',
    'Eerder schreven wij u dat u uiterlijk 14 september 2026 een beslissing zou',
    'ontvangen op uw aanvraag WIA-uitkering. Het lukt ons niet om binnen die',
    'termijn te beslissen.', '',
    'Wij verlengen de beslistermijn. U ontvangt uiterlijk 26 oktober 2026 een',
    'beslissing van ons.', '',
    'Met vriendelijke groet,', 'UWV',
  ],
  'uwv-ww-termijn-lang-verstreken': [
    'UWV', 'Postbus 58285', '1040 HG Amsterdam', '',
    'Mevrouw K. Bakker', 'Molenweg 88', '7511 AB Enschede', '',
    'Datum: 9 april 2026',
    'Ons kenmerk: 456789123 / WW-2026-30912',
    'Betreft: ontvangst van uw aanvraag WW-uitkering', '',
    'Geachte mevrouw Bakker,', '',
    'Wij hebben uw aanvraag voor een WW-uitkering ontvangen op 7 april 2026.', '',
    'Wanneer krijgt u een beslissing?',
    'U ontvangt uiterlijk 1 juni 2026 een beslissing van ons.', '',
    'Wat moet u zelf doen?',
    'U hoeft nu niets te doen.', '',
    'Met vriendelijke groet,', 'UWV',
  ],
  'uwv-beslissing-genomen': [
    'UWV', 'Postbus 58285', '1040 HG Amsterdam', '',
    'De heer S. Javaid', 'Straatnaam 12', '1234 AB Amsterdam', '',
    'Datum: 11 september 2026',
    'Ons kenmerk: 123456789 / WIA-2026-44821',
    'Betreft: beslissing op uw aanvraag WIA-uitkering', '',
    'Geachte heer Javaid,', '',
    'U heeft een WIA-uitkering aangevraagd. Wij hebben een beslissing genomen.',
    'U krijgt een WGA-uitkering vanaf 1 oktober 2026.', '',
    'Bent u het niet eens met deze beslissing? Dan kunt u binnen zes weken',
    'bezwaar maken.', '',
    'Met vriendelijke groet,', 'UWV',
  ],
};

await fs.mkdir(HIER, { recursive: true });
for (const [naam, regels] of Object.entries(brieven)) {
  await fs.writeFile(path.join(HIER, `${naam}.txt`), regels.join('\n') + '\n', 'utf8');
  await fs.writeFile(path.join(HIER, `${naam}.pdf`), maakPdf(regels));
}
console.log(`${Object.keys(brieven).length} voorbeeldbrieven geschreven als .txt en .pdf`);
