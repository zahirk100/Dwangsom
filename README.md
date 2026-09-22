# nubeslist.nl

Webapplicatie voor **dwangsom bij niet tijdig beslissen** (Algemene wet bestuursrecht,
art. 4:17 e.v.). Bestaat uit twee delen:

- **Aanvragersdeel.** Landingspagina en een wizard die per soort aanvraag alleen de
  relevante vragen stelt, de beslistermijn en de dwangsom berekent en het resultaat toont
  vóórdat de aanvrager zijn aanvraag indient.
- **Beheerdeel.** Afgeschermd overzicht van binnengekomen aanvragen met status, notities,
  herberekening, conceptbrieven en CSV-export.

De dwangsomregeling is landelijk en identiek voor UWV (WIA, Wajong, WW, Ziektewet),
gemeenten (bijstand, Wmo, jeugdhulp, vergunningen) en andere bestuursorganen. Alleen de
*beslistermijn* verschilt per zaaktype; die staat in een aparte catalogus.

## Merk en vindbaarheid

De naam is **nubeslist.nl**. Het merkteken is een klokring die rechtsboven openbreekt,
met daarin een vinkje dat er doorheen naar buiten loopt: er liep een termijn, en er
hoort een beslissing te komen.

De site is **wit met blauw**. Er is bewust geen donkere variant: `color-scheme: light`
staat vast in `public/assets/stijl.css`, zodat iemand met een donkere telefoon niet
het omgekeerde ziet van wat is afgesproken. Diepte komt van lichte schaduwen en van
`var(--papier)`, niet van gekleurde vlakken.

```
public/merk.svg        Het merkteken, ook het favicon (vector, dus overal scherp)
public/icoon-180.png   Voor het beginscherm van een telefoon
public/icoon-512.png   Grote variant
public/deelkaart.png   Het beeld onder een gedeelde link in WhatsApp of LinkedIn
scripts/maak-merk.mjs  Maakt die drie png's opnieuw uit dezelfde vormen
```

De png's worden getekend met afstandsfuncties en `node:zlib`, zonder enige afhankelijkheid.
Verander je het merkteken in `public/merk.svg`, draai dan `node scripts/maak-merk.mjs`
zodat de bestanden gelijk blijven lopen.

De hele bezoekerskant spreekt met **je**, niet met u. Dat staat vast in
`test/merk.test.js`: een enkel "uw" tussen de je-vorm valt meteen op.

## Eén intakeflow, veel voordeuren

Iemand die op een WIA-advertentie klikt, hoort niet op een algemene homepage te landen
met "de instantie" en "een aanvraag". Daarom staat in `public/shared/campagnes.js` per
ingang de tekst van zijn eigen landingspagina, en schrijft
`node scripts/maak-paginas.mjs` daar echte html-bestanden van:

```
/                     de algemene ingang, met de vraag "op welke instantie wacht je?"
/uwv /uwv-wia /uwv-ww /uwv-wajong /uwv-ziektewet /uwv-bezwaar
/gemeente /bijstand /wmo /jeugdhulp /schuldhulp /gemeente-bezwaar
/duo /studiefinanciering /svb /aow /toeslagen
/nog-niet-te-laat     voor wie zoekt of het al te lang duurt
```

Die laatste is er voor de bezoeker wiens termijn nog lóópt. Die kan vandaag
niets vorderen en is op elke andere pagina een afhaker, terwijl hij over drie
weken precies de klant is die wij zoeken. Hij levert zijn brief in, wij noteren
de datum en komen vanzelf in actie. Op de homepage staat dezelfde uitnodiging
als eigen blok (`#nog-niet`), niet als voetnoot in de vragenlijst.

Elke pagina heeft zijn eigen `<title>`, `description`, `canonical`, og-tags en `h1` in
de bron, want dat is wat een advertentie en een zoekmachine nodig hebben. Achter elke
voordeur zit dezelfde flow: de knop geeft `?instantie=` en `?zaak=` mee, waarna ook de
funnel "Laten we kijken of UWV te laat is" zegt en "Kies mijn UWV-brief" op de
uploadknop zet.

Waarom bestanden en geen server die rendert? Twee redenen. Op Vercel gaat het
bestandssysteem vóór de functie, dus een bestand is de zekerste route. En de titel hoort
in de bron te staan, niet door javascript te worden ingevuld. `test/campagnes.test.js`
vergelijkt de uitgeschreven bestanden met het template, zodat er nooit een oude tekst
online staat terwijl de broncode al bij is.

## De balk op een telefoon

Elke pagina met een balk heeft een uitklapmenu (`public/assets/menu.js`). Dat
verving een regel die er onschuldig uitzag: `.balk nav a.nav-secundair {
display: none }` onder 720px. "Hoe het werkt", "Kosten" en "Vragen" waren
daarmee op een telefoon niet te bereiken — geen responsief ontwerp maar
verlies.

Wat er in de balk blijft staan is het merk en de hoofdknop; de rest zit achter
de menuknop. Zonder javascript staat het menu gewoon open en loopt de balk door
op meerdere regels: onbereikbare links zijn erger dan een balk die wat hoger is.

In die navigatie staat nu ook **Mijn dossier**. Dat ontbrak overal: wie
terugkwam voor zijn eigen zaak had geen enkele link om op te klikken.

## De reis van de bezoeker

De landingspagina is geen brochure maar een intake. De opbouw volgt wat iemand in de
eerste minuut nodig heeft:

1. **Herkenning.** "Wacht je te lang op een beslissing?" en de vraag op welke instantie,
   nog voor er één wetsartikel valt. De controle is het product.
2. **De uitslag, als voorbeeld.** Een kaartje met instantie, procedure, datum en volgende
   stap: dit krijg je terug. Op een bijstandspagina staat daar de gemeente, niet UWV.
3. **Pas dan de vergoeding.** Wat er kan ontstaan als de instantie te laat blijft, en
   hoe het bedrag oploopt.
4. **Wat wij daarna doen**, met de tijdlijn die het dossier straks laat zien.

In de funnel loopt dat door. De voortgang heet niet "stap 3 van 5" maar
Brief, Situatie, Gegevens, Machtiging, Wij regelen het. Op het machtigingsscherm staat
eerst **Dit gaan we nu voor je doen** (toegespitst op deze zaak) en daarna **Jouw zaak**
met instantie, procedure, beslistermijn en volgende stap, zodat het dossier al klaar
lijkt te staan voordat er iets ondertekend wordt.

## Starten

```bash
node server.js                  # http://localhost:3000
SESSIE_GEHEIM=een-lang-geheim node server.js
npm test                        # 135 tests, zonder netwerk
```

Geen dependencies. Node 20.6 of nieuwer. Live zetten op Vercel: zie
[DEPLOY.md](DEPLOY.md).

| Omgevingsvariabele | Standaard | Betekenis |
| --- | --- | --- |
| `PORT` | `3000` | Poort van de webserver |
| `SESSIE_GEHEIM` | per start willekeurig | Ondertekent de sessiecookies; zonder dit log je uit bij een herstart |
| `BEHEER_OPEN` | uit | `1` opent `/beheer` zonder wachtwoord, om te proefdraaien. De omgeving waarschuwt er zelf over. Weghalen vóór livegang. |
| `TARIEF_PERCENTAGE` **of** `TARIEF_VAST` | leeg | Onze vergoeding bij een toegekende dwangsom: een percentage (`25`) of een vast bedrag (`129`). **Staat er niets, dan noemt de site nergens een bedrag** — dat is met opzet, zie hieronder. Vóór livegang invullen. |
| `DATA_DIR` | `./data` | Map waarin `aanvragen.json` wordt bewaard |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | leeg | Redis via REST; verplicht op serverloze hosting |
| `SECURE_COOKIES` | automatisch achter HTTPS | Zet op `1` om af te dwingen |
| `FUNNEL` | `nieuw` | `klassiek` zet de oude vragenwizard terug op `/aanvraag` |
| `BEDRIJF_NAAM`, `BEDRIJF_ADRES`, `BEDRIJF_POSTCODE_PLAATS`, `BEDRIJF_KVK`, `BEDRIJF_EMAIL`, `BEDRIJF_TELEFOON` | leeg | Onze eigen gegevens op de machtiging. Wat leeg is, wordt een invulregel in het document en een waarschuwing in het dossier. |

### Het tarief staat op één plek

Wat wij rekenen is een bedrijfsbeslissing, geen code, en het staat op te veel
schermen om het te kopiëren: de homepage, de funnel vlak voor de handtekening,
de voorwaarden. Daarom komt het uit `public/shared/tarief.js`, en die leest de
omgeving.

Het gekozen tarief is **25% van de toegekende dwangsom**; dat staat als
standaard in de module. De omgevingsvariabele gaat daarvóór, zodat het te
wijzigen is zonder de code aan te raken. Het is een consumentenprijs en dus
inclusief btw. Waarom een percentage en geen vast bedrag staat in
[docs/livegang.md](docs/livegang.md): de dwangsom loopt van € 23 tot € 1.442,
dus een vast bedrag is bij een kleine zaak hoger dan de hele vergoeding.

```
TARIEF_PERCENTAGE=25    een deel van de toegekende dwangsom
TARIEF_VAST=129         een vast bedrag per toegekende zaak
TARIEF_PERCENTAGE=0     noem geen bedrag (zie hieronder)
```

Zet je het uitdrukkelijk op `0`, dan noemt de site géén getal en zegt hij dat
je het vooraf hoort. Die stand blijft bestaan omdat een verzonnen percentage op
de pagina waar iemand tekent erger is dan geen percentage; hij is er voor als
het tarief nog niet vaststaat.

**Het rekent door met het bedrag van de zaak zelf.** Een percentage zegt mensen
weinig. Vlak voor de handtekening staat daarom de som: loopt er al een
dwangsom, dan met dat bedrag; moet de melding nog de deur uit, dan met het
wettelijk maximum en met zoveel woorden erbij dat dat het maximum is. In het
klantportaal staat dezelfde som zodra er echt een bedrag is toegekend, zodat
onze factuur geen verrassing is.

## Structuur

```
server.js              HTTP-server, routes, CSV-export; exporteert apiHandler
src/pdftekst.js        Tekst uit een pdf halen, met alleen node:zlib
src/brieflezer.js      Upload aannemen: pdf, tekstbestand of geplakte tekst
src/briefherkenning.js Uit de brieftekst de zaak, de datums en de persoon halen
vercel.json            cleanUrls en de route van al het verkeer naar server.js
src/landingpagina.js   De landingspagina als één template voor alle ingangen
src/machtiging.js      Machtiging als afdrukbare pagina, uit de dossiergegevens
src/organisatie.js     Onze eigen gegevens uit de omgeving
src/store.js           Dossierregels: referenties, status, notities, historie
src/opslag.js          Opslagdrivers: bestand, Redis via REST, geheugen
src/sessie.js          Sessies als ondertekend cookie, zonder serverstatus
src/validatie.js       Servervalidatie van het formulier en van beheerwijzigingen
voorbeelden/           Voorbeeldbrieven (txt en pdf) om de herkenning te testen
src/http-util.js       Statische bestanden, bodyparser, snelheidsbegrenzer
public/                Landingspagina, wizard, beheeromgeving
public/shared/         Rekenkern, catalogus, dossiereisen, brieven, datumhulpjes
public/shared/funnelvragen.js  Welke velden de funnel nog vraagt, en waarom
public/shared/campagnes.js     De ingangen: per advertentie een eigen tekst
scripts/maak-paginas.mjs       Schrijft die ingangen uit als echte html-bestanden
test/                  Unit- en integratietests (node:test)
```

De rekenkern staat in `public/shared/` omdat de browser die modules rechtstreeks
importeert: de wizard rekent live met exact dezelfde functie als de server, zonder
bouwstap of gekopieerde bestanden. De server rekent bij indiening altijd opnieuw;
wat de browser meestuurt is nooit leidend.

## Het rekenmodel

1. **Beslistermijn.** Heeft het bestuursorgaan zelf een datum genoemd, dan telt die.
   Anders de standaardtermijn uit `shared/catalogus.js`. Bij bezwaar begint de termijn pas
   na afloop van de bezwaartermijn van zes weken. Verdaging en opschorting (art. 4:15 Awb)
   verschuiven het einde.
2. **Ingebrekestelling.** Zonder schriftelijke ingebrekestelling gaat er niets lopen. Een
   ingebrekestelling vóór het einde van de termijn is prematuur; de app waarschuwt en rekent
   vanaf het einde van de beslistermijn.
3. **Hersteltermijn.** Het bestuursorgaan krijgt twee weken, geteld vanaf de laatste van
   (einde beslistermijn, ontvangst ingebrekestelling). De eerste dag waarover de dwangsom
   verschuldigd is, valt daar één dag na — dus vijftien dagen na die startdag.
4. **Bedrag.** Dag 1–14 € 23, dag 15–28 € 35, dag 29–42 € 45, maximaal 42 dagen en
   € 1.442 (art. 4:17 lid 2 Awb). Komt er eerder een besluit, dan telt de dwangsom tot en
   met de dag vóór de bekendmaking.
5. **Uitsluitingen.** Geen belanghebbende, buiten behandeling gesteld, Woo-verzoek,
   asielaanvraag. Bij een ingebrekestelling meer dan een jaar na het verstrijken van de
   termijn volgt een waarschuwing wegens mogelijk onredelijk laat in gebreke stellen.

Mogelijke uitkomsten: `termijn-loopt`, `ingebrekestelling-nodig`, `hersteltermijn-loopt`,
`recht`, `geen-recht`.

## Twee funnels

De aanvrager kan op twee manieren binnenkomen. Welke op `/aanvraag` staat,
bepaalt de omgevingsvariabele `FUNNEL`; beide blijven altijd bereikbaar.

| Route | Funnel | Idee |
| --- | --- | --- |
| `/aanvraag-nieuw` (standaard op `/aanvraag`) | **Brief uploaden** | Het document is de intake. Vijf schermen, één handtekening. |
| `/aanvraag-klassiek` | **Vragenwizard** | Acht stappen waarin de aanvrager alles zelf invult. Blijft de terugval als er geen bruikbare brief is. |

Terugschakelen kost één variabele: `FUNNEL=klassiek`. De oude funnel staat
bovendien als branch `backup/funnel-v1-klassiek` in de repository.

### Hoe de briefupload werkt

1. **Inlezen** (`src/brieflezer.js`) — een pdf, een tekstbestand of geplakte
   tekst. Uit een pdf met tekstlaag halen wij de tekst met `node:zlib`, zonder
   externe bibliotheek. Een foto of een gescande pdf gaat er niet doorheen:
   daar is tekstherkenning voor nodig, en dat zit er bewust niet in. De
   aanvrager krijgt dan uitleg en de klassieke route aangeboden.
2. **Herkennen** (`src/briefherkenning.js`) — instantie, soort zaak, naam,
   adres, kenmerk, burgerservicenummer en de datums. Het belangrijkste is de
   **uiterste beslisdatum die de instantie zelf noemt**; die gaat altijd voor
   op onze standaardtermijnen. Een verlengingsbrief noemt twee datums; dan
   telt de laatste. Een beslissing sluit de zaak.
3. **Rekenen** — dezelfde rekenkern als altijd, en meteen een uitkomst op het
   scherm vóór er één gegeven is gevraagd.
4. **Aanvullen** — alleen wat niet uit de brief kwam. In de praktijk zijn dat
   geboortedatum, BSN, IBAN en e-mailadres. Blijkt een gelezen waarde niet te
   kloppen — een nummer bij het woord "burgerservicenummer" is niet altijd een
   burgerservicenummer — dan verschijnt dat veld alsnog, voorgevuld en met de
   reden erbij. Die regel staat in `public/shared/funnelvragen.js` en wordt
   apart getest, want een foutmelding over een onzichtbaar veld is een
   doodlopende weg.
5. **Machtigen** — één scherm, met een handtekening die met de vinger of muis
   wordt gezet. Die komt rechtstreeks in het machtigingsdocument te staan.

De herkenning is regelgebaseerd en gebruikt geen taalmodel: geen API-sleutel,
geen kosten, geen gegevens die het pand verlaten. Wat niet wordt herkend,
wordt niet geraden maar gevraagd.

### Voorbeeldbrieven om mee te testen

In `voorbeelden/` staan zeven nagemaakte brieven, elk als `.txt` en als pdf
met tekstlaag. Samen dekken ze alle routes van de funnel:

| Brief | Wat je te zien krijgt |
| --- | --- |
| `uwv-wia-ontvangstbevestiging` | Termijn net verstreken; wij moeten eerst aanmanen |
| `uwv-ww-termijn-lang-verstreken` | Termijn maanden voorbij; met "ja, zelf aangemaand" verschijnt € 1.442 |
| `gemeente-bijstand-ontvangstbevestiging` | Gemeente Zwolle, datum uit de zin ervóór |
| `duo-studiefinanciering-ontvangstbevestiging` | DUO, inclusief het BSN uit de brief |
| `uwv-bezwaar-ontvangstbevestiging` | Lopend bezwaar in plaats van een aanvraag |
| `uwv-verlenging-beslistermijn` | Twee datums in één brief; de nieuwe telt |
| `uwv-beslissing-genomen` | Er is beslist: de procedure stopt |

Opnieuw maken kan met `node voorbeelden/maak-brieven.mjs`.

## Aanvraag of vooraanmelding

Niet iedereen kan meteen iets vorderen. De rekenkern vertaalt de uitkomst daarom
naar een soort dossier en de datum die bewaakt moet worden (`rapport.vervolg`):

| Uitkomst | Soort | Bewaakte datum |
| --- | --- | --- |
| `recht` | **aanvraag** | vandaag — er valt nu te vorderen |
| `hersteltermijn-loopt` | **vooraanmelding** | de eerste dwangsomdag |
| `ingebrekestelling-nodig` | **vooraanmelding** | vandaag — de brief kan direct |
| `termijn-loopt` | **vooraanmelding** | de dag na het einde van de beslistermijn |
| `geen-recht` | **beoordeling** | geen |

Wie nog niet kan claimen wordt dus niet weggestuurd, maar doet een
vooraanmelding. In de beheeromgeving staan die onder een eigen kopje,
gesorteerd op de datum waarop er iets moet gebeuren, met een teller erbij
("over 12 dagen", "vandaag", "5 dagen te laat"). Een herberekening verplaatst
een dossier vanzelf naar het juiste kopje zodra de tijd verstrijkt.

## Welke gegevens vragen wij?

`public/shared/dossier.js` bepaalt per zaak wat nodig is, zodat het formulier
niet meer vraagt dan dat en de beheerder achteraf niets hoeft na te bellen:

- **Identiteit.** Burgerservicenummer en IBAN worden narekend met de elfproef
  en de mod-97-toets (`public/shared/identiteit.js`), zodat een typefout niet
  pas weken later opvalt. Het BSN wordt in de beheeromgeving alleen als
  laatste vier cijfers getoond.
- **Gegevens.** Bij een vooraanmelding alleen naam en e-mail. Gaan wij namens
  iemand optreden, dan ook adres en woonplaats (die komen op de brieven) en bij
  een machtiging de geboortedatum. Een telefoonnummer is bewust nooit verplicht.
- **Stukken.** Bij bezwaar het primaire besluit en het bezwaarschrift; bij een
  verstuurde ingebrekestelling het verzendbewijs; bij verdaging of opschorting
  de bijbehorende brief. Wat wij zelf aanleveren (de machtiging) staat apart.

De aanvrager vinkt aan wat hij heeft; de beheeromgeving toont per dossier wat
nog ontbreekt, en de CSV-export zet die lijst in een kolom.

## Een dossier behandelen

De beheeromgeving is bedoeld als werkbank, niet als kijkdoos. Het uitgangspunt:
alles wat een behandelaar aan een dossier moet doen, kan daar ook — zodat de
aanvrager niet voor elk detail een mailtje krijgt.

- **Werklijst.** Het kengetal *Actie nodig* is aanklikbaar en filtert op
  dossiers waarvan de bewaakte datum is bereikt en die nog openstaan, oudste
  eerst. Dat is de stapel van vandaag.
- **Volgende stap.** Bovenaan het dossier staat wat er moet gebeuren, met de
  knoppen om het meteen vast te leggen: *Ingebrekestelling verstuurd (door
  ons)*, *Aanvrager stelde zelf in gebreke*, *Besluit ontvangen*. Elke knop
  vraagt een datum, rekent de zaak opnieuw door, verzet de bewaakte datum en
  schrijft een regel in de historie. Zonder dit blijft een dossier hangen: de
  brief is verstuurd, maar het systeem weet er niets van.
- **Gegevens corrigeren.** *Gegevens aanvullen of corrigeren* opent de
  contactgegevens als formulier. Wat aan de telefoon bekend wordt, gaat er
  direct in; BSN en IBAN worden ook hier nagerekend en een fout veld wijst
  zichzelf aan. Velden die nog nodig zijn om te kunnen indienen krijgen een
  label *nodig om in te dienen*.
- **Wat nog ontbreekt.** Een dossier dat van vooraanmelding naar aanvraag
  verschuift, heeft ineens meer nodig (BSN, geboortedatum, IBAN). Dat komt
  bovenaan als melding te staan, en in de lijst als teller, in plaats van pas
  bij het indienen op te vallen.
- **Afhandelen.** Het blok *Afhandeling* legt het toegekende bedrag, de datum
  van de beschikking, de uitbetaling en de eindstatus vast. Dat sluit het
  dossier, haalt het uit de werklijst en telt mee in het kengetal *Toegekend*.

Stukken die al binnen zijn, staan meteen aangevinkt: de brief die de aanvrager
uploadde, de tweede brief bij verdaging en de digitaal ondertekende machtiging.
Stelden wij zelf in gebreke, dan gelden die brief en het verzendbewijs als ons
eigen stuk en worden ze niet bij de aanvrager opgevraagd — precies het onnodige
mailtje dat dit moet voorkomen.

## De machtiging

In het dossier maakt **Opstellen en afdrukken** de machtiging in één klik op uit
de gegevens die al bekend zijn: naam, geboortedatum en adres van de aanvrager,
onze eigen gegevens, en om welke zaak het gaat. Het resultaat is een afdrukbare
pagina — de browser maakt er met *opslaan als pdf* een bestand van, dus daar is
geen bibliotheek voor nodig. De aanvrager hoeft alleen te ondertekenen.

Wat ontbreekt wordt niet verzonnen maar zichtbaar gelaten: een stippellijn in
het document en een waarschuwing boven het dossier, met de namen van de velden
die nog moeten worden aangevuld. Dat geldt ook voor onze eigen gegevens als de
`BEDRIJF_*`-variabelen niet zijn ingesteld.

Daarna houdt het dossier bij of de machtiging is verstuurd en ondertekend terug
is. Dat laatste vinkt meteen het bijbehorende stuk af, zodat het dossier op één
plek klopt. De machtiging omvat bewust geen betalingen: een toegekende dwangsom
wordt rechtstreeks aan de aanvrager uitbetaald.

## Wat de aanvrager wél en niet te zien krijgt

De wizard toont de uitkomst, het bedrag en de data uit de eigen zaak, plus wat
wij overnemen. Wat er niet in staat: het stappenplan om het zelf te doen, de
kant-en-klare brieven en de rekenregels achter de termijnen. Die zitten in de
beheeromgeving, waar ze thuishoren. De publieke uitlegpagina beschrijft de
regeling in algemene termen, want dat is openbaar recht en het wekt vertrouwen.

### Aanpassen van termijnen en bedragen

- Beslistermijn per zaaktype: `ZAAKTYPEN` in `public/shared/catalogus.js`. Elk zaaktype heeft
  `zekerheid: 'wettelijk'` (termijn staat in de wet) of `'restnorm'` (geen bijzondere
  termijn, dus de acht weken van art. 4:13 lid 2 Awb). De restnormen zijn terugvalwaarden;
  de wizard vraagt daarom altijd eerst naar de datum uit de ontvangstbevestiging.
- Tarieven en het maximum: `TARIEF` in `public/shared/dwangsom.js`. De tranches tellen op tot het
  maximum; een test bewaakt dat.

## API

Publiek:

| Route | Doel |
| --- | --- |
| `GET /api/catalogus` | Bestuursorganen en zaaktypen |
| `POST /api/berekening` | Berekening zonder op te slaan |
| `POST /api/aanvragen` | Aanvraag indienen, geeft referentienummer terug |

Beheer (sessiecookie vereist):

| Route | Doel |
| --- | --- |
| `POST /api/beheer/login` · `/logout` · `GET /sessie` | Sessiebeheer |
| `GET /api/beheer/aanvragen` | Lijst met filters `status`, `bestuursorgaan`, `soort`, `zoek`, `actie=nodig` |
| `GET /api/beheer/aanvragen/:id` | Volledig dossier, inclusief `eisen` |
| `PATCH /api/beheer/aanvragen/:id` | Status wijzigen |
| `POST /api/beheer/aanvragen/:id/bijwerken` | Gegevens corrigeren of een stap vastleggen; rekent meteen opnieuw door |
| `POST /api/beheer/aanvragen/:id/afhandeling` | Toegekend bedrag, beschikking, uitbetaling en eindstatus |
| `POST /api/beheer/aanvragen/:id/notities` | Interne notitie |
| `POST /api/beheer/aanvragen/:id/herbereken` | Opnieuw rekenen op vandaag |
| `POST /api/beheer/aanvragen/:id/stukken` | Aanvinken welke stukken binnen zijn |
| `GET /api/beheer/aanvragen/:id/machtiging` | De machtiging als afdrukbare pagina |
| `POST /api/beheer/aanvragen/:id/machtiging` | Status: `verstuurd`, `ontvangen` of `ingetrokken` |
| `GET /api/beheer/aanvragen/:id/brief?soort=` | `ingebrekestelling` of `claim` |
| `POST /api/beheer/aanvragen/:id/bestanden` | Zelf een stuk of correspondentie aan het dossier toevoegen |
| `GET` · `DELETE /api/beheer/aanvragen/:id/bestanden/:bestandId` | Een stuk openen of uit het dossier halen |
| `POST /api/beheer/aanvragen/:id/brief` | De opgestelde brief in het dossier bewaren |
| `GET /api/beheer/export.csv` | Export voor de administratie |

Klantportaal (eigen sessiecookie, alleen het eigen dossier):

| Route | Doel |
| --- | --- |
| `POST /api/mijn/link` · `/koppeling` · `/uitloggen` · `GET /sessie` | Inloglink aanvragen, inwisselen, uitloggen |
| `GET /api/mijn/dossiers` | De eigen dossiers, door `voorKlant` gefilterd |
| `POST /api/mijn/dossiers/:id/gegevens` | De eigen contactgegevens aanvullen (niet BSN of IBAN) |
| `POST /api/mijn/dossiers/:id/stuk` | Een bewijsstuk uploaden bij een van de gevraagde stukken |
| `GET /api/mijn/dossiers/:id/bestanden/:bestandId` | Een eerder geüpload bestand terugkijken |

Lokaal serveert `server.js` ook de pagina's. Op Vercel wordt diezelfde module
geladen en via de **default export** aangeroepen, ook voor `/api/*`. Beide wegen
komen uit bij dezelfde `verwerk`-router, dus de
applicatie gedraagt zich overal gelijk. Er is geen bouwstap: wat in de
repository staat, is wat er wordt geserveerd.

## Wat staat er nu live?

`GET /api/versie` geeft het antwoord, en het is het enige antwoord waar je op
kunt bouwen:

```json
{ "commit": "88e5996", "branch": "main", "opslag": "redis",
  "opslagDuurzaam": true, "beheerOpen": false, "gestartOp": "..." }
```

Dat antwoord gaat als `no-store` de deur uit, dus het komt altijd van de
draaiende server en nooit uit een cache. Daarmee valt het meest verwarrende
probleem van een livegang uiteen in twee losse vragen:

- **Staat je commit er niet?** Dan is de deploy niet gelukt of niet gestart;
  kijk in Vercel onder Deployments.
- **Staat je commit er wél, maar zie je op het scherm de oude pagina?** Dan zit
  het in de cache van je browser, niet in de deploy. Een privévenster laat
  meteen zien of dat klopt.

`opslagDuurzaam: false` is het ergste wat hier kan staan: dan draait de
applicatie op geheugenopslag en is elk dossier weg bij de volgende deploy.

## Hosting en opslag

De applicatie kiest zelf de opslag die bij de omgeving past:

| Omgeving | Driver | Duurzaam |
| --- | --- | --- |
| Eigen server of laptop | `aanvragen.json`, atomair geschreven | ja |
| Serverloos mét `KV_REST_API_*` | Redis via de REST-API, alleen met `fetch` | ja |
| Serverloos zónder database | werkgeheugen | **nee** — de beheeromgeving toont een rode waarschuwing |

Serverloos draaien stelt twee extra eisen, en aan allebei is voldaan:

- **Sessies** zitten niet in het geheugen van één instantie, maar in het cookie
  zelf: een vervaltijd met een HMAC-handtekening (`src/sessie.js`). Elke
  instantie leidt dezelfde sleutel af uit `SESSIE_GEHEIM` of het
  beheerwachtwoord.
- **De request-body** wordt door Vercel al ingelezen; `leesJsonBody` gebruikt
  `req.body` als die er is en valt anders terug op de stream.

De snelheidsbegrenzers tellen per instantie. Op serverloze hosting is dat een
ruwe bovengrens, geen harde. Voor strengere limieten hoort die teller ook in
Redis.

## Privacy en beveiliging

- Er wordt **geen burgerservicenummer** gevraagd; het formulier zegt dat expliciet.
- Sessiecookies zijn `HttpOnly` en `SameSite=Strict`; zet `SECURE_COOKIES=1` achter HTTPS.
- Wachtwoordvergelijking is tijdconstant; inloggen is begrensd op 8 pogingen per kwartier
  per IP, indienen op 20 per uur.
- Alles wat de aanvrager invult wordt in de browser met `textContent` gerenderd, dus geen
  HTML-injectie. CSV-velden die met `=`, `+`, `-` of `@` beginnen worden ontsnapt.
- `data/aanvragen.json` bevat persoonsgegevens en staat in `.gitignore`.

### Voor productie

Dit is een werkende applicatie met bewuste beperkingen. Vóór echt gebruik:
geef beheerders eigen accounts met tweefactorauthenticatie in plaats van één
gedeeld wachtwoord, voeg e-mailnotificatie bij een nieuwe aanvraag toe (zit er
nu niet in), richt back-ups en een bewaartermijn in, en laat de
standaardtermijnen in de catalogus juridisch toetsen. Zie DEPLOY.md voor de
volledige lijst.

## Accounts, rollen en het klantportaal

De beheeromgeving werkt met **accounts per medewerker**, niet met één gedeeld
wachtwoord. De eerste beheerder maakt zichzelf aan op `/beheer` zolang er nog
geen enkel account is; daarna gaat het op uitnodiging.

- **Tweestapsverificatie is verplicht.** Zonder bevestigde tweede factor kom je
  niet voorbij het instelscherm, ook niet met het juiste wachtwoord. Bij het
  instellen krijg je acht eenmalige herstelcodes, voor als de telefoon kwijt is.
- **Drie rollen.** Beheerder (alles, plus accounts beheren), behandelaar
  (dossiers behandelen en afhandelen) en meekijker (alleen inzien en exporteren,
  bijvoorbeeld voor de boekhouder).
- **Wachtwoorden** gaan door scrypt uit `node:crypto`, met een eigen zout per
  account en de kosten in de hash, zodat die later te verhogen zijn.
- **De codes** volgen RFC 6238 (TOTP), met de officiële testwaarden vastgelegd
  in `test/toegang.test.js`.

Het **klantportaal** staat op `/mijn` en werkt met een inloglink per e-mail,
zonder wachtwoord: de aanvrager komt eens per paar weken kijken, en een
wachtwoord dat hij dan kwijt is, is alleen maar drempel. Hij ziet zijn tijdlijn,
zijn gegevens, en vult aan wat nog ontbreekt.

Wat het portaal teruggeeft is een **lijst van wat er wél uit mag**, niet van wat
eruit moet (`voorKlant` in `server.js`). Interne notities, de historie en het
burgerservicenummer komen er zo nooit in terecht, ook niet als er later een veld
bijkomt. `test/portaal.test.js` legt dat vast, inclusief de vraag waar het bij
een portaal om draait: kan iemand het dossier van een ander zien?

### De klant levert zijn eigen stukken aan

Welke bewijsstukken een zaak nodig heeft, verschilt per soort zaak: bij een
aanvraag is dat de ontvangstbevestiging, bij een bezwaar het primaire besluit
plus het bezwaarschrift, en stelde iemand zelf al in gebreke, dan is het
verzendbewijs daarvan het belangrijkste papier dat er is — dat bepaalt vanaf
welke dag de dwangsom telt.

Die lijst komt uit dezelfde functie als de beheeromgeving gebruikt
(`bepaalDossiereisen` in `public/shared/dossier.js`), zodat behandelaar en klant
nooit naar een andere lijst kijken. In het portaal staat per stuk een
uploadknop; wat binnen is, vinkt zichzelf af. Stukken die **wij** aanleveren
(onze eigen ingebrekestelling, de machtiging) worden er via `stukkenVanKlant`
uitgefilterd: daar moet de klant niet om gevraagd worden.

De teksten erboven zijn wél anders. De gedeelde module schrijft voor de
behandelaar ("de eigen ingebrekestelling van de aanvrager"), en dat is precies
de verkeerde toon tegen de aanvrager zelf. `mijn.js` heeft daarom een eigen
woordenlijst; staat een stuk daar niet in, dan blijft de gedeelde tekst staan.

Naast de gevraagde stukken is er één open bak: **nieuwe post van de
instantie**. Krijgt iemand rechtstreeks een besluit of een brief dat het langer
duurt, dan legt hij dat in zijn eigen dossier neer in plaats van te bellen. In
de beheeromgeving verschijnt dat als een aparte melding boven de stukkenlijst,
want het verandert meestal de berekening.

De behandelaar kan er zelf ook iets in hangen: bij elk stuk zit een
uploadknop, en er is een blok **Correspondentie** voor alles wat geen gevraagd
stuk is — onze verstuurde brieven, een e-mailwisseling. De ingebrekestelling en
de dwangsomclaim die wij opstellen hebben naast "downloaden" ook **In dossier
bewaren**: een brief die alleen in de map Downloads van een behandelaar staat,
is voor het dossier niet verstuurd, en de volgende behandelaar kan dan niet
zien wat er precies de deur uit ging.

Alles wat binnenkomt is voor de behandelaar te openen
(`GET /api/beheer/aanvragen/:id/bestanden/:bestandId`). Dat is geen detail: een
uploadknop waarvan niemand de uitkomst ziet, is erger dan geen uploadknop. De
inhoud reist niet mee in het dossierantwoord — `zonderBestandsinhoud()` haalt
hem eruit, anders gaan er megabytes over de lijn bij elk geopend dossier.

**De inhoud staat in een eigen rij**, niet in het dossier. Dat is een les die
we bijna te laat leerden: met de base64 ín het dossier haalde de lijst in de
beheeromgeving — die élk dossier ophaalt — ook de inhoud van elk bestand op.
Bij een paar honderd dossiers met foto's van brieven is dat honderden megabytes
per klik, en een dossier dat over de maximale waardegrootte van de opslag heen
gaat, kan helemaal niet meer worden weggeschreven. In het dossier blijft nu
alleen wat je nodig hebt om het te tónen (naam, type, omvang, wie en wanneer);
de bytes komen pas tevoorschijn als iemand op de link klikt.

Grens: 3 MB per bestand. Downloaden kan alleen ingelogd, en gaat altijd als
`attachment` met `no-store`, zodat een pdf nooit in de browser opent of in een
cache blijft hangen. Voor grote aantallen hoort hier op termijn echte
bestandsopslag achter (Vercel Blob of Supabase Storage); zie
`docs/livegang.md`.

```
src/wachtwoord.js   scrypt-hashes, met de kosten in de hash
src/totp.js         tweestapsverificatie en herstelcodes
src/gebruikers.js   accounts, rollen, uitnodigingen, inloglinks, sessies
src/mail.js         sjablonen en versturen via Resend of Postmark
public/mijn.html    het klantportaal, inclusief het aanleveren van stukken
public/shared/tijdlijn.js  de tijdlijn zoals de klant hem ziet
db/                 het Postgres-schema, klaar voor de stap naar Supabase
```

## Van test naar live

Het draaiboek staat in **[docs/livegang.md](docs/livegang.md)**: domein en DNS,
de omgevingsvariabelen, hoe je de eerste beheerder aanmaakt, wat er daarna nog
moet en wat er juridisch geregeld moet zijn voordat er één echte klant in zit.
Of je GitHub wel of niet blijft gebruiken staat daar ook bij.

De afwegingen achter de database- en loginkeuzes staan in
**[docs/ontwerp-database.md](docs/ontwerp-database.md)**.

## Voorbehoud

nubeslist.nl is een particuliere dienstverlener, geen overheidsinstantie. De berekening is
een inschatting op basis van de ingevulde gegevens en is geen juridisch advies.
