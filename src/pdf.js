/**
 * Een kleine pdf-schrijver, zonder bibliotheek.
 *
 * Waarom dit bestaat: een brief die wij afdrukken en op de post doen, hoort een
 * pdf te zijn en geen webpagina. Een webpagina moet je eerst afdrukken naar pdf,
 * de browser zet er kop- en voetregels bij met de datum en het webadres erin, en
 * wat eruit komt verschilt per computer. Voor een brief die namens iemand anders
 * de deur uit gaat is dat niet goed genoeg.
 *
 * Alle bestaande oplossingen zijn een npm-pakket, en die hebben wij hier niet.
 * Dus staat het hier: genoeg pdf om een zakelijke brief te zetten, en niets
 * meer. Platte tekst in Helvetica, vet waar het moet, automatische
 * regelafbreking en een nieuwe pagina als het blad vol is.
 *
 * De opbouw van een pdf in het kort: een handvol objecten, elk met een nummer,
 * en achteraan een tabel die per objectnummer zegt op welke byte het begint.
 * Eén catalogus, één pagina-boom, per pagina een beschrijving en een stroom met
 * tekenopdrachten, plus de lettertypen. De tekenopdrachten zelf zijn
 * verrassend simpel: BT begint tekst, Tf kiest een letter, Td verplaatst de
 * cursor, Tj zet een regel neer, ET sluit af.
 */

/** A4 in punten (1/72 inch), de maat waar de hele opmaak op staat. */
export const A4 = { breedte: 595.28, hoogte: 841.89 };

/**
 * Breedtes van Helvetica, per teken, in duizendsten van de lettergrootte.
 *
 * Zonder deze tabel valt niet te berekenen waar een regel vol is, en dan loopt
 * de tekst over de kantlijn of breekt hij veel te vroeg af. Alleen de tekens
 * die wij ook echt zetten; voor de rest geldt de terugval hieronder.
 */
const BREEDTES = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '{': 334, '|': 260, '}': 334, '~': 584,
  '€': 556, '©': 737, 'é': 556, 'è': 556, 'ë': 556, 'ê': 556, 'ï': 278, 'í': 278,
  'ó': 556, 'ö': 556, 'ú': 556, 'ü': 556, 'á': 556, 'à': 556, 'ç': 500, 'ñ': 556,
  '–': 556, '—': 1000, '‘': 222, '’': 222, '“': 333, '”': 333, '•': 350,
};

/** Vet is breder. Eén factor is nauwkeurig genoeg voor een brief. */
const VET_FACTOR = 1.06;
const TERUGVAL = 556;

/**
 * Van tekst naar WinAnsi-bytes.
 *
 * Een pdf-string is geen UTF-8. De standaardlettertypen gebruiken WinAnsi, en
 * dat is Latin-1 met een paar afwijkingen in het gat tussen 128 en 159 - waar
 * onder meer het euroteken zit. Alles buiten die tabel wordt een vraagteken;
 * liever dat dan een onleesbaar blok.
 */
const WINANSI_EXTRA = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
  'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

function naarWinAnsi(tekst) {
  const bytes = [];
  for (const teken of String(tekst)) {
    const punt = teken.codePointAt(0);
    if (WINANSI_EXTRA[teken] !== undefined) bytes.push(WINANSI_EXTRA[teken]);
    else if (punt <= 0xff) bytes.push(punt);
    else bytes.push(0x3f); // vraagteken
  }
  return Buffer.from(bytes);
}

/** Haakjes en backslashes hebben in een pdf-string een eigen betekenis. */
function pdfString(tekst) {
  const bytes = naarWinAnsi(tekst);
  const uit = [];
  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) uit.push(0x5c, byte);
    else if (byte < 32 || byte > 126) {
      for (const cijfer of `\\${byte.toString(8).padStart(3, '0')}`) uit.push(cijfer.charCodeAt(0));
    } else uit.push(byte);
  }
  return Buffer.from(uit);
}

/** Hoe breed een stuk tekst wordt bij deze lettergrootte. */
export function tekstbreedte(tekst, grootte, vet = false) {
  let duizendsten = 0;
  for (const teken of String(tekst)) duizendsten += BREEDTES[teken] || TERUGVAL;
  return (duizendsten / 1000) * grootte * (vet ? VET_FACTOR : 1);
}

/**
 * Breekt een alinea af op de beschikbare breedte.
 *
 * Een woord dat zelf al te lang is (een lang kenmerk bijvoorbeeld) blijft heel
 * en steekt een stukje uit; dat is lelijker dan afbreken maar leesbaarder dan
 * een nummer dat middenin wordt doorgesneden.
 */
export function breekAf(tekst, breedte, grootte, vet = false) {
  const regels = [];
  for (const stuk of String(tekst).split('\n')) {
    let regel = '';
    for (const woord of stuk.split(/\s+/).filter(Boolean)) {
      const proef = regel ? `${regel} ${woord}` : woord;
      if (regel && tekstbreedte(proef, grootte, vet) > breedte) {
        regels.push(regel);
        regel = woord;
      } else {
        regel = proef;
      }
    }
    regels.push(regel);
  }
  return regels;
}

/**
 * Een document in aanbouw.
 *
 * De cursor loopt van boven naar beneden; wie onderaan het blad komt, krijgt
 * een nieuwe pagina. Zo hoeft de brief zelf nergens te weten hoe lang hij is.
 */
export class Pdf {
  constructor({ marge = 56, regelhoogte = 1.45 } = {}) {
    this.marge = marge;
    this.regelhoogte = regelhoogte;
    this.paginas = [];
    this.nieuwePagina();
  }

  get breedte() {
    return A4.breedte - this.marge * 2;
  }

  nieuwePagina() {
    this.huidig = [];
    this.paginas.push(this.huidig);
    this.y = A4.hoogte - this.marge;
    return this;
  }

  /** Genoeg ruimte voor zoveel punten, of anders een nieuw blad. */
  ruimte(punten) {
    if (this.y - punten < this.marge) this.nieuwePagina();
    return this;
  }

  /** Eén regel op een vaste plek, zonder afbreken. */
  regel(tekst, { grootte = 10.5, vet = false, x = this.marge, kleur = null } = {}) {
    this.ruimte(grootte * this.regelhoogte);
    this.huidig.push({ tekst, x, y: this.y, grootte, vet, kleur });
    this.y -= grootte * this.regelhoogte;
    return this;
  }

  /** Een alinea die zichzelf afbreekt op de tekstbreedte. */
  alinea(tekst, { grootte = 10.5, vet = false, x = this.marge, na = 7, breedte = null } = {}) {
    const ruimte = breedte || (A4.breedte - x - this.marge);
    for (const regel of breekAf(tekst, ruimte, grootte, vet)) {
      this.regel(regel, { grootte, vet, x });
    }
    this.y -= na;
    return this;
  }

  /** Witruimte. */
  wit(punten = 10) {
    this.y -= punten;
    return this;
  }

  /** Een label met een waarde ernaast, zoals in een gegevensblok. */
  veld(label, waarde, { grootte = 10.5, labelbreedte = 170 } = {}) {
    this.ruimte(grootte * this.regelhoogte);
    const y = this.y;
    this.huidig.push({ tekst: label, x: this.marge, y, grootte, vet: false, kleur: [0.35, 0.39, 0.45] });
    const regels = breekAf(String(waarde), this.breedte - labelbreedte, grootte, true);
    this.huidig.push({ tekst: regels[0] || '', x: this.marge + labelbreedte, y, grootte, vet: true });
    this.y -= grootte * this.regelhoogte;
    for (const extra of regels.slice(1)) {
      this.regel(extra, { grootte, vet: true, x: this.marge + labelbreedte });
    }
    return this;
  }

  /** Een horizontale lijn, voor onder een kop of boven een voet. */
  lijn({ dikte = 0.5, kleur = [0.85, 0.88, 0.92], na = 10 } = {}) {
    this.ruimte(dikte + na);
    this.huidig.push({ lijn: true, y: this.y, dikte, kleur });
    this.y -= na;
    return this;
  }

  /** Alles samen als één pdf-bestand. */
  naarBuffer() {
    const objecten = [];
    const voegToe = (inhoud) => {
      objecten.push(inhoud);
      return objecten.length; // objectnummers beginnen bij 1
    };

    const paginaNummers = [];
    const inhoudNummers = this.paginas.map((pagina) => voegToe(stroomVan(pagina)));

    const paginaboom = objecten.length + this.paginas.length + 1;
    for (let i = 0; i < this.paginas.length; i += 1) {
      paginaNummers.push(voegToe(Buffer.from(
        `<< /Type /Page /Parent ${paginaboom} 0 R /MediaBox [0 0 ${A4.breedte} ${A4.hoogte}] `
        + `/Resources << /Font << /F1 ${paginaboom + 2} 0 R /F2 ${paginaboom + 3} 0 R >> >> `
        + `/Contents ${inhoudNummers[i]} 0 R >>`, 'latin1')));
    }

    voegToe(Buffer.from(`<< /Type /Pages /Kids [${paginaNummers.map((n) => `${n} 0 R`).join(' ')}] `
      + `/Count ${paginaNummers.length} >>`, 'latin1'));
    const catalogus = voegToe(Buffer.from(`<< /Type /Catalog /Pages ${paginaboom} 0 R >>`, 'latin1'));
    voegToe(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica '
      + '/Encoding /WinAnsiEncoding >>', 'latin1'));
    voegToe(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold '
      + '/Encoding /WinAnsiEncoding >>', 'latin1'));

    // Nu pas schrijven, want elk object moet weten op welke byte het begint.
    const delen = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
    let lengte = delen[0].length;
    const posities = [];
    objecten.forEach((inhoud, i) => {
      posities.push(lengte);
      const kop = Buffer.from(`${i + 1} 0 obj\n`, 'latin1');
      const staart = Buffer.from('\nendobj\n', 'latin1');
      delen.push(kop, inhoud, staart);
      lengte += kop.length + inhoud.length + staart.length;
    });

    const xref = [`xref\n0 ${objecten.length + 1}\n0000000000 65535 f \n`];
    for (const positie of posities) xref.push(`${String(positie).padStart(10, '0')} 00000 n \n`);
    xref.push(`trailer\n<< /Size ${objecten.length + 1} /Root ${catalogus} 0 R >>\n`
      + `startxref\n${lengte}\n%%EOF\n`);
    delen.push(Buffer.from(xref.join(''), 'latin1'));
    return Buffer.concat(delen);
  }
}

/** De tekenopdrachten van één pagina, verpakt als pdf-object. */
function stroomVan(pagina) {
  const regels = [];
  for (const stuk of pagina) {
    if (stuk.lijn) {
      const [r, g, b] = stuk.kleur;
      regels.push(`${r} ${g} ${b} RG ${stuk.dikte} w ${56} ${stuk.y} m ${A4.breedte - 56} ${stuk.y} l S`);
      continue;
    }
    if (!String(stuk.tekst).length) continue;
    const kleur = stuk.kleur ? `${stuk.kleur[0]} ${stuk.kleur[1]} ${stuk.kleur[2]} rg ` : '0 0 0 rg ';
    regels.push(`BT ${kleur}/${stuk.vet ? 'F2' : 'F1'} ${stuk.grootte} Tf `
      + `${stuk.x} ${stuk.y} Td (${pdfString(stuk.tekst).toString('latin1')}) Tj ET`);
  }
  const stroom = Buffer.from(regels.join('\n'), 'latin1');
  return Buffer.concat([
    Buffer.from(`<< /Length ${stroom.length} >>\nstream\n`, 'latin1'),
    stroom,
    Buffer.from('\nendstream', 'latin1'),
  ]);
}
