# SEO: wat er staat, en wat er nog moet

Dit document beschrijft de zoekmachineopzet van nubeslist.nl. Het eerste deel
is wat er in de code zit; het tweede is werk dat buiten de code valt en dat
alleen jij kunt doen.

---

## 1. Wat er nu in de code zit

| | Waar |
| --- | --- |
| `robots.txt` met verwijzing naar de sitemap | gegenereerd door `npm run build` |
| `sitemap.xml` met 26 pagina's | idem, uit dezelfde lijst die de pagina's maakt |
| Eigen titel, omschrijving en canonical per pagina | `public/shared/campagnes.js` |
| `Organization` en `WebSite` op elke pagina | `src/seo.js` |
| `FAQPage` op elke pagina met zichtbare vragen | uit de pagina zelf gelezen |
| `BreadcrumbList` op elke zaakpagina | `/` → `/uwv` → `/uwv-wia` |
| `Service` per ingang | met de instantie erin |

Alles wordt geschreven, niets bijgehouden. Een sitemap die je met de hand
onderhoudt mist binnen een maand de nieuwste pagina, en dat is precies de
pagina waarvoor je hem had.

### Waarom het FAQ-schema uit de pagina komt

Google eist dat elke vraag in de gestructureerde gegevens **ook zichtbaar op
de pagina staat**. Een tweede lijst in de code zou binnen een maand afwijken
van de tekst, en dan verlies je de weergave of krijg je een handmatige
maatregel.

Daarom leest `faqSchema()` de `<details>`-blokken uit de html die net gebouwd
is. Afwijken kan daarmee niet. `test/seo.test.js` bewaakt dat het zo blijft.

### Wat er bewust niet in staat

- **Geen `aggregateRating` of `review`.** Die hebben wij niet. Verzonnen
  beoordelingen in gestructureerde gegevens zijn waar Google handmatige
  maatregelen voor uitdeelt, en die kost je maanden.
- **Geen `Offer` met een prijs.** De vergoeding is voorwaardelijk (alleen bij
  een toekenning) en een percentage van een bedrag dat vooraf niet vaststaat.
  Dat is in schema-vorm niet eerlijk uit te drukken.
- **Geen adres zolang `BEDRIJF_ADRES` leeg is.** Een adres met "nog niet
  ingevuld" erin is slechter dan geen adres.

---

## 2. De zoekwoordenkaart

De opzet is een piramide: één brede pagina per instantie, daaronder een
pagina per procedure. Elke pagina heeft **één** hoofdzoekwoord. Twee pagina's
die op hetzelfde woord mikken, concurreren met elkaar en verliezen allebei.

### Het onderscheid dat het meeste uitmaakt

Er zijn twee soorten zoekers, en ze zijn niet even veel waard:

**De probleemzoeker** typt *"uwv duurt lang"* of *"hoelang duurt een
WIA-aanvraag"*. Hij weet niet dat er een dwangsom bestaat. Dit is verreweg de
grootste groep, en de goedkoopste — maar hij moet eerst leren dat hij iets
kán doen.

**De oplossingszoeker** typt *"ingebrekestelling uwv"* of *"dwangsom niet
tijdig beslissen"*. Hij weet het al. Weinig volume, hogere concurrentie, maar
hij is dichter bij een aanvraag.

De campagnepagina's mikken op de eerste groep; `/hoe-werkt-het` en de
FAQ-blokken vangen de tweede.

### Per pagina

| Pagina | Hoofdzoekwoord | Daarnaast |
| --- | --- | --- |
| `/` | wachten op beslissing overheid | beslistermijn overheid |
| `/uwv` | uwv te laat met beslissing | uwv beslist niet, uwv duurt lang |
| `/uwv-wia` | wia beslissing duurt lang | hoelang duurt wia aanvraag, wia beslistermijn |
| `/uwv-ww` | ww aanvraag duurt lang | uwv ww beslissing termijn |
| `/uwv-wajong` | wajong beslissing duurt lang | wajong aanvraag termijn |
| `/uwv-ziektewet` | ziektewet uitkering duurt lang | zw beslissing uwv |
| `/uwv-bezwaar` | uwv beslist niet op bezwaar | bezwaartermijn uwv verstreken |
| `/gemeente` | gemeente te laat met beslissing | gemeente reageert niet |
| `/bijstand` | bijstandsaanvraag duurt lang | beslistermijn bijstand participatiewet |
| `/wmo` | wmo aanvraag duurt lang | beslistermijn wmo |
| `/jeugdhulp` | jeugdhulp aanvraag duurt lang | beslistermijn jeugdwet |
| `/schuldhulp` | schuldhulpverlening duurt lang | beslistermijn schuldhulp |
| `/gemeente-bezwaar` | gemeente beslist niet op bezwaar | bezwaartermijn gemeente |
| `/duo` | duo te laat met beslissing | duo reageert niet |
| `/studiefinanciering` | studiefinanciering aanvraag duurt lang | duo beslistermijn |
| `/svb` | svb te laat met beslissing | svb reageert niet |
| `/aow` | aow aanvraag duurt lang | beslistermijn aow |
| `/toeslagen` | toeslag aanvraag duurt lang | belastingdienst beslist niet |
| `/nog-niet-te-laat` | wanneer is de beslistermijn voorbij | hoelang mag een instantie erover doen |
| `/hoe-werkt-het` | dwangsom niet tijdig beslissen | awb 4:17, regeling |
| `/ingebrekestelling` | ingebrekestelling | in gebreke stellen |
| `/beslistermijn` | beslistermijn | hoelang mag uwv erover doen |
| `/dwangsom-berekenen` | dwangsom berekenen | bedrag per dag |
| `/uwv-te-laat` | *advertenties, geen organisch doel* | — |

### De kennispagina's

Deze drie beantwoorden een vraag die iemand intypt **voordat** hij weet dat wij
bestaan. Dat is ander verkeer dan de campagnepagina's, en het was het grootste
gat in de opzet.

| Pagina | Hoofdzoekwoord | Daarnaast |
| --- | --- | --- |
| `/ingebrekestelling` | ingebrekestelling | in gebreke stellen, wat is een ingebrekestelling |
| `/beslistermijn` | beslistermijn | hoelang mag uwv erover doen, beslistermijn bijstand |
| `/dwangsom-berekenen` | dwangsom berekenen | dwangsom hoogte, bedrag per dag |

De inhoud komt uit `dwangsom.js` en `catalogus.js` — dezelfde bron als de
rekenmodule. Een uitlegpagina die iets anders zegt dan de uitslag die de
bezoeker even later krijgt, is erger dan geen uitlegpagina.

Ze staan in de voet van **elke** pagina. Dat is niet alleen service: interne
links zijn hoe een zoekmachine een nieuwe pagina vindt en inschat waar die
over gaat.

### Wat er hierna nog kan

Meer vraagpagina's, maar alleen als er echt iets te vertellen valt. Een pagina
per instantie met dezelfde tekst is dunne inhoud, en dat patroon herkent
Google. De beste bron voor de volgende pagina is Search Console: waar je op
plek 11 tot 20 staat, is wat je moet uitbouwen.

---

## 3. Wat alleen jij kunt doen

De code is klaar; dit deel niet, en zonder dit deel gebeurt er niets.

### Direct na livegang

1. **Google Search Console** — voeg `nubeslist.nl` toe op
   [search.google.com/search-console](https://search.google.com/search-console).
   Verifiëren kan met een `TXT`-record bij TransIP.
2. **Dien de sitemap in**: `https://nubeslist.nl/sitemap.xml`. Zonder dit
   vindt Google de campagnepagina's alleen via links, en dat duurt weken
   langer.
3. **Vraag indexering aan** voor `/` en `/uwv` via de URL-inspectie. De rest
   volgt vanzelf.
4. **Bing Webmaster Tools** — kost tien minuten en je kunt de Search
   Console-gegevens importeren. Bing is klein maar niet nul.

### In de eerste maanden

5. **Kijk welke zoekopdrachten binnenkomen** (Search Console → Prestaties).
   Dat is de enige echte bron voor nieuwe pagina's: wat mensen typen en
   waarop je op plek 11 tot 20 staat, is wat je moet uitbouwen.
6. **Schrijf de twee ontbrekende pagina's** uit het vorige deel.
7. **Zorg voor een paar verwijzingen van buitenaf.** Dit is de zwakste kant
   van een nieuw domein en het enige wat je niet zelf kunt bouwen. Denk aan
   rechtshulpoverzichten, sociale-kaartsites van gemeenten en fora waar de
   vraag echt gesteld wordt — maar alleen waar het bericht op zichzelf nuttig
   is. Gekochte links kosten je het domein.

### Wat je niet moet doen

- **Geen verzonnen reviews**, op de site niet en in het schema niet.
- **Geen pagina's per plaatsnaam** ("dwangsom UWV Amsterdam"). Dat is dunne
  inhoud over een landelijke regeling; Google herkent het patroon.
- **De advertentielanding `/uwv-te-laat` niet optimaliseren voor organisch.**
  Die concurreert dan met `/uwv`, en dan verlies je allebei.

---

## 4. Wat een toets bewaakt

`test/seo.test.js` valt om bij:

- een sitemap die naar een `noindex`-pagina wijst (de waarschuwing die
  iedereen in Search Console krijgt en niemand kan verklaren);
- een sitemap die naar een pagina wijst die niet bestaat;
- een `robots.txt` die per ongeluk de hele site uitsluit;
- twee pagina's met dezelfde titel, omschrijving of canonical;
- een titel boven 70 of een omschrijving boven 175 tekens (Google kapt af);
- een FAQ-vraag in het schema die niet op de pagina staat;
- een pagina met meer of minder dan één `h1`;
- `aggregateRating` of `review` in het organisatieschema.
