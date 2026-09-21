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
npm test                        # 35 tests, zonder netwerk
```

Geen dependencies, geen buildstap. Node 20.6 of nieuwer.

| Omgevingsvariabele | Standaard | Betekenis |
| --- | --- | --- |
| `PORT` | `3000` | Poort van de webserver |
| `BEHEER_WACHTWOORD` | willekeurig, wordt geprint | Wachtwoord voor `/beheer` |
| `DATA_DIR` | `./data` | Map waarin `aanvragen.json` wordt bewaard |
| `SECURE_COOKIES` | uit | Zet op `1` achter HTTPS |

## Structuur

```
server.js              HTTP-server, routes, sessies, CSV-export
src/store.js           Opslag in JSON (atomair schrijven, geserialiseerd)
src/validatie.js       Servervalidatie van het aanvraagformulier
src/http-util.js       Statische bestanden, bodyparser, snelheidsbegrenzer
shared/dwangsom.js     Rekenkern (browser + server)
shared/catalogus.js    Zaaktypen met hun beslistermijn
shared/brief.js        Ingebrekestelling en dwangsomclaim als brieftekst
shared/datum.js        Datumrekenen in UTC
public/                Landingspagina, wizard, beheeromgeving
test/                  Unit- en integratietests (node:test)
```

`shared/` wordt ook aan de browser geserveerd, zodat de wizard live met exact dezelfde
functie rekent als de server. De server rekent bij indiening altijd opnieuw; wat de
browser meestuurt is nooit leidend.

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

### Aanpassen van termijnen en bedragen

- Beslistermijn per zaaktype: `ZAAKTYPEN` in `shared/catalogus.js`. Elk zaaktype heeft
  `zekerheid: 'wettelijk'` (termijn staat in de wet) of `'restnorm'` (geen bijzondere
  termijn, dus de acht weken van art. 4:13 lid 2 Awb). De restnormen zijn terugvalwaarden;
  de wizard vraagt daarom altijd eerst naar de datum uit de ontvangstbevestiging.
- Tarieven en het maximum: `TARIEF` in `shared/dwangsom.js`. De tranches tellen op tot het
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
| `GET /api/beheer/aanvragen/:id/brief?soort=` | `ingebrekestelling` of `claim` |
| `GET /api/beheer/export.csv` | Export voor de administratie |

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
bewaar dossiers in een echte database, geef beheerders eigen accounts met
tweefactorauthenticatie, zet de applicatie achter HTTPS, richt back-ups en een
bewaartermijn in, en laat de standaardtermijnen in de catalogus juridisch toetsen.

## Voorbehoud

Dwangsomhulp is een particuliere dienstverlener, geen overheidsinstantie. De berekening is
een inschatting op basis van de ingevulde gegevens en is geen juridisch advies.
