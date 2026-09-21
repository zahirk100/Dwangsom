# Dwangsomhulp

Webapplicatie voor **dwangsom bij niet tijdig beslissen** (Algemene wet bestuursrecht,
art. 4:17 e.v.). Bestaat uit twee delen:

- **Aanvragersdeel** — landingspagina en een wizard die per soort aanvraag alleen de
  relevante vragen stelt, de beslistermijn en de dwangsom berekent en het resultaat toont
  vóórdat de aanvrager zijn aanvraag indient.
- **Beheerdeel** — afgeschermd overzicht van binnengekomen aanvragen met status, notities,
  herberekening, conceptbrieven en CSV-export.

De dwangsomregeling is landelijk en identiek voor UWV (WIA, Wajong, WW, Ziektewet),
gemeenten (bijstand, Wmo, jeugdhulp, vergunningen) en andere bestuursorganen. Alleen de
*beslistermijn* verschilt per zaaktype; die staat in een aparte catalogus.

## Starten

```bash
node server.js                  # http://localhost:3000
BEHEER_WACHTWOORD=geheim node server.js
npm test                        # 135 tests, zonder netwerk
```

Geen dependencies. Node 20.6 of nieuwer. Live zetten op Vercel: zie
[DEPLOY.md](DEPLOY.md).

| Omgevingsvariabele | Standaard | Betekenis |
| --- | --- | --- |
| `PORT` | `3000` | Poort van de webserver |
| `BEHEER_WACHTWOORD` | willekeurig, wordt geprint | Wachtwoord voor `/beheer` |
| `BEHEER_OPEN` | uit | `1` opent `/beheer` zonder wachtwoord, om te proefdraaien. De omgeving waarschuwt er zelf over. Weghalen vóór livegang. |
| `SESSIE_GEHEIM` | het beheerwachtwoord | Sleutel waarmee sessiecookies worden ondertekend |
| `DATA_DIR` | `./data` | Map waarin `aanvragen.json` wordt bewaard |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | leeg | Redis via REST; verplicht op serverloze hosting |
| `SECURE_COOKIES` | automatisch achter HTTPS | Zet op `1` om af te dwingen |
| `FUNNEL` | `nieuw` | `klassiek` zet de oude vragenwizard terug op `/aanvraag` |
| `BEDRIJF_NAAM`, `BEDRIJF_ADRES`, `BEDRIJF_POSTCODE_PLAATS`, `BEDRIJF_KVK`, `BEDRIJF_EMAIL`, `BEDRIJF_TELEFOON` | leeg | Onze eigen gegevens op de machtiging. Wat leeg is, wordt een invulregel in het document en een waarschuwing in het dossier. |

## Structuur

```
server.js              HTTP-server, routes, CSV-export; exporteert apiHandler
src/pdftekst.js        Tekst uit een pdf halen, met alleen node:zlib
src/brieflezer.js      Upload aannemen: pdf, tekstbestand of geplakte tekst
src/briefherkenning.js Uit de brieftekst de zaak, de datums en de persoon halen
api/index.js           Ingang voor Vercel: /api/* naar dezelfde router
api/ping.js            Diagnose-eindpunt, zonder imports; mag weg als alles draait
vercel.json            cleanUrls en de rewrite van /api/* naar api/index.js
src/machtiging.js      Machtiging als afdrukbare pagina, uit de dossiergegevens
src/organisatie.js     Onze eigen gegevens uit de omgeving
src/store.js           Dossierregels: referenties, status, notities, historie
src/opslag.js          Opslagdrivers: bestand, Redis via REST, geheugen
src/sessie.js          Sessies als ondertekend cookie, zonder serverstatus
src/validatie.js       Servervalidatie van het aanvraagformulier
src/http-util.js       Statische bestanden, bodyparser, snelheidsbegrenzer
public/                Landingspagina, wizard, beheeromgeving
public/shared/         Rekenkern, catalogus, dossiereisen, brieven, datumhulpjes
public/shared/funnelvragen.js  Welke velden de funnel nog vraagt, en waarom
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
| `GET /api/beheer/aanvragen` | Lijst met filters `status`, `bestuursorgaan`, `zoek` |
| `GET /api/beheer/aanvragen/:id` | Volledig dossier |
| `PATCH /api/beheer/aanvragen/:id` | Status wijzigen |
| `POST /api/beheer/aanvragen/:id/notities` | Interne notitie |
| `POST /api/beheer/aanvragen/:id/herbereken` | Opnieuw rekenen op vandaag |
| `POST /api/beheer/aanvragen/:id/stukken` | Aanvinken welke stukken binnen zijn |
| `GET /api/beheer/aanvragen/:id/machtiging` | De machtiging als afdrukbare pagina |
| `POST /api/beheer/aanvragen/:id/machtiging` | Status: `verstuurd`, `ontvangen` of `ingetrokken` |
| `GET /api/beheer/aanvragen/:id/brief?soort=` | `ingebrekestelling` of `claim` |
| `GET /api/beheer/export.csv` | Export voor de administratie |

Lokaal serveert `server.js` ook de pagina's. Op Vercel wordt diezelfde module
geladen en via de **default export** aangeroepen; `api/index.js` doet hetzelfde
voor `/api/*`. Beide wegen komen uit bij dezelfde `verwerk`-router, dus de
applicatie gedraagt zich overal gelijk. Er is geen bouwstap: wat in de
repository staat, is wat er wordt geserveerd.

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

## Voorbehoud

Dwangsomhulp is een particuliere dienstverlener, geen overheidsinstantie. De berekening is
een inschatting op basis van de ingevulde gegevens en is geen juridisch advies.
