/**
 * Wat een zoekmachine van deze site moet kunnen begrijpen.
 *
 * Drie dingen, en ze doen alle drie iets anders:
 *
 *   1. **robots.txt en sitemap.xml.** Welke pagina's bestaan er, en welke
 *      horen niet in de index. Zonder sitemap vindt Google de campagne-
 *      pagina's alleen via interne links, en dat duurt weken langer.
 *   2. **Gestructureerde gegevens (JSON-LD).** Wie wij zijn, en welke vragen
 *      een pagina beantwoordt. Dat laatste kan een zoekresultaat met
 *      uitklapbare vragen opleveren, wat merkbaar meer ruimte inneemt.
 *   3. **Kruimelpad.** Waar een pagina in de structuur hangt, zodat er in het
 *      zoekresultaat "nubeslist.nl > UWV > WIA" staat in plaats van een url.
 *
 * De FAQ-gegevens worden **uit de gerenderde pagina gehaald** en niet apart
 * bijgehouden. Dat is geen luiheid maar de enige manier om te garanderen wat
 * Google eist: het schema moet exact de vragen bevatten die de bezoeker ook
 * ziet staan. Een tweede lijst zou binnen een maand afwijken, en onjuiste
 * gestructureerde gegevens kosten je de weergave - of een handmatige
 * maatregel.
 */

const SITE = 'https://nubeslist.nl';

/** Tekens die in json-ld niet mogen blijven staan. */
function tekst(ruw) {
  return String(ruw)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&euro;/g, '€').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Eén json-ld blok, klaar om in de head te zetten. */
function blok(data) {
  // </script> in een string zou het script voortijdig sluiten. Dat kan hier
  // niet voorkomen, maar het is één regel om het onmogelijk te maken.
  const json = JSON.stringify(data, null, 2).replace(/<\//g, '<\\/');
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

/**
 * Wie wij zijn. Staat op elke pagina, zodat Google de losse pagina's aan
 * één organisatie kan koppelen.
 *
 * Bewust géén `aggregateRating` of `review`: die hebben wij niet, en
 * verzonnen beoordelingen in gestructureerde gegevens zijn precies waar
 * Google handmatige maatregelen voor uitdeelt.
 */
export function organisatieSchema(bedrijf = {}) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE}/#organisatie`,
    name: bedrijf.naam && bedrijf.naam !== 'nog niet ingevuld' ? bedrijf.naam : 'nubeslist.nl',
    alternateName: 'nubeslist.nl',
    url: `${SITE}/`,
    logo: `${SITE}/icoon-512.png`,
    description: 'nubeslist.nl controleert of een bestuursorgaan te laat is met beslissen en '
      + 'regelt de ingebrekestelling en de dwangsom bij niet tijdig beslissen.',
    areaServed: { '@type': 'Country', name: 'Nederland' },
    knowsLanguage: 'nl-NL',
  };
  // Alleen opnemen wat echt is ingevuld. Een adres met "nog niet ingevuld"
  // erin is slechter dan geen adres.
  const echt = (w) => w && w !== 'nog niet ingevuld';
  if (echt(bedrijf.email) || echt(bedrijf.telefoon)) {
    data.contactPoint = {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      availableLanguage: 'Dutch',
      ...(echt(bedrijf.email) ? { email: bedrijf.email } : {}),
      ...(echt(bedrijf.telefoon) ? { telephone: bedrijf.telefoon } : {}),
    };
  }
  if (echt(bedrijf.adres) && echt(bedrijf.postcodePlaats)) {
    // Splitsen op de eerste spatie gaat hier mis: "1234 AB Amsterdam" wordt
    // dan postcode "1234" in plaats van "1234 AB". Een Nederlandse postcode
    // is vier cijfers plus twee letters, met of zonder spatie ertussen.
    const heel = String(bedrijf.postcodePlaats).trim();
    const m = /^(\d{4}\s?[A-Za-z]{2})\s+(.+)$/.exec(heel);
    data.address = {
      '@type': 'PostalAddress',
      streetAddress: bedrijf.adres,
      ...(m ? { postalCode: m[1].toUpperCase(), addressLocality: m[2] } : { addressLocality: heel }),
      addressCountry: 'NL',
    };
  }
  if (echt(bedrijf.kvk)) {
    data.identifier = { '@type': 'PropertyValue', name: 'KvK', value: bedrijf.kvk };
  }
  return data;
}

/** De site als geheel, zodat losse pagina's aan elkaar hangen. */
export function siteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE}/#site`,
    url: `${SITE}/`,
    name: 'nubeslist.nl',
    inLanguage: 'nl-NL',
    publisher: { '@id': `${SITE}/#organisatie` },
  };
}

/**
 * De vragen die een pagina beantwoordt, uit de pagina zelf gehaald.
 *
 * Google eist dat elke vraag in het schema ook zichtbaar op de pagina staat.
 * Daarom lezen we de `<details>`-blokken uit de html die we net hebben
 * gebouwd, in plaats van een tweede lijst bij te houden die kan afwijken.
 *
 * @param {string} html de gerenderde pagina
 * @returns {object|null} een FAQPage, of null als er te weinig vragen zijn
 */
export function faqSchema(html, url) {
  const vragen = [];
  const details = html.match(/<details[^>]*>[\s\S]*?<\/details>/g) || [];
  for (const stuk of details) {
    const kop = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(stuk);
    if (!kop) continue;
    const vraag = tekst(kop[1]);
    const antwoord = tekst(stuk.replace(/<summary[^>]*>[\s\S]*?<\/summary>/, ''));
    // Een vraag zonder vraagteken is meestal een uitklapper met een tabel
    // erin ("Hoe wordt de vergoeding berekend?" mag wel, "Rekenvoorbeeld"
    // niet). En een antwoord van twee woorden zegt een zoekmachine niets.
    if (!vraag.endsWith('?') || antwoord.length < 40) continue;
    vragen.push({
      '@type': 'Question',
      name: vraag,
      acceptedAnswer: { '@type': 'Answer', text: antwoord },
    });
  }
  if (vragen.length < 3) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url}#vragen`,
    mainEntity: vragen,
  };
}

/**
 * Het kruimelpad. Levert in het zoekresultaat een leesbaar pad op in plaats
 * van een kale url.
 *
 * @param {Array<{naam: string, pad: string}>} kruimels
 */
export function kruimelSchema(kruimels) {
  if (!kruimels || kruimels.length < 2) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: kruimels.map((k, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: k.naam,
      item: `${SITE}${k.pad}`,
    })),
  };
}

/** De dienst die op een pagina wordt aangeboden. */
export function dienstSchema({ url, naam, omschrijving, instantie }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${url}#dienst`,
    name: naam,
    description: omschrijving,
    serviceType: 'Dwangsom bij niet tijdig beslissen',
    provider: { '@id': `${SITE}/#organisatie` },
    areaServed: { '@type': 'Country', name: 'Nederland' },
    ...(instantie ? { audience: { '@type': 'Audience', audienceType: `Aanvragers bij ${instantie}` } } : {}),
  };
}

/**
 * Zet de blokken in de head, vlak voor `</head>`.
 * Lege blokken (null) worden overgeslagen.
 */
export function metSchema(html, blokken) {
  const echte = blokken.filter(Boolean);
  if (echte.length === 0) return html;
  const scripts = echte.map(blok).join('\n');
  return html.replace('</head>', `${scripts}\n</head>`);
}

// ------------------------------------------------------- robots en sitemap ---

/**
 * robots.txt.
 *
 * `/api/` en de afgeschermde delen horen er niet in. Niet omdat het geheim
 * is - dat regelt de inlog - maar omdat een zoekmachine die /api/ afloopt
 * verzoeken kost en nooit iets oplevert.
 */
export function robotsTxt() {
  return [
    '# nubeslist.nl',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    '# Achter een inlog. Hier valt niets te indexeren en het kost alleen',
    '# verzoeken aan onze kant.',
    'Disallow: /beheer',
    'Disallow: /mijn',
    'Disallow: /api/',
    '',
    `Sitemap: ${SITE}/sitemap.xml`,
    '',
  ].join('\n');
}

/**
 * sitemap.xml.
 *
 * Alleen pagina's die ook echt geïndexeerd mogen worden. De funnel en de
 * beheeromgeving staan er niet in: die staan op noindex, en een sitemap die
 * naar noindex-pagina's wijst levert alleen waarschuwingen op in Search
 * Console.
 *
 * @param {Array<{pad: string, prioriteit?: number, frequentie?: string}>} paginas
 * @param {Date} [nu]
 */
export function sitemapXml(paginas, nu = new Date()) {
  const datum = nu.toISOString().slice(0, 10);
  const regels = paginas.map(({ pad, prioriteit = 0.7, frequentie = 'monthly' }) => [
    '  <url>',
    `    <loc>${SITE}${pad === '/' ? '/' : pad}</loc>`,
    `    <lastmod>${datum}</lastmod>`,
    `    <changefreq>${frequentie}</changefreq>`,
    `    <priority>${prioriteit.toFixed(1)}</priority>`,
    '  </url>',
  ].join('\n'));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${regels.join('\n')}
</urlset>
`;
}
