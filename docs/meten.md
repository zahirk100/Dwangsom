# Meten en adverteren

Twee dingen die vaak op één hoop worden gegooid, maar iets heel anders doen:

| | Waarvoor | Waar staat het |
| --- | --- | --- |
| **Eigen tellingen** | *jouw* vraag: hoeveel bezoek, waar haken mensen af | `/cijfers`, achter je inlog |
| **Meta-pixel of CAPI** | *Meta's* vraag: wie moet ik de advertentie tonen | nog niet gebouwd — zie hieronder |

Het eerste staat er. Het tweede is een keuze met een juridische kant, en die
moet je bewust maken.

---

## 1. Wat er nu meet

Op `/cijfers` (achter dezelfde inlog als de beheeromgeving) staat:

- bezoeken, aanvragen gestart, aanvragen ingediend, en het omzettingspercentage;
- **de trechter**: bezoek → funnel geopend → uitslag gezien → gegevens ingevuld
  → ingediend, met het verlies per stap;
- per bron (meta, google, organisch, direct), met de omzetting per bron;
- per dag en per pagina.

### Het is tellen, geen volgen

Er wordt **geen cookie gezet, geen ip-adres bewaard en geen sessie-id
aangemaakt**. Wat er in de opslag komt is één getal per dag, per gebeurtenis,
per bron. Meer niet.

Dat is geen overdreven voorzichtigheid. Wie op `/uwv-wia` komt, vertelt
daarmee iets over zijn gezondheid — een bijzonder persoonsgegeven onder de
AVG. Door alleen op te tellen kan dat nergens terechtkomen, ook niet per
ongeluk en ook niet bij een derde partij.

**Gevolg: hiervoor is geen cookiebanner nodig.** Er wordt niets op het
apparaat van de bezoeker gezet of gelezen, dus de toestemmingsplicht uit de
Telecommunicatiewet geldt niet.

**Andere gevolg: je kunt niet zien wie iets deed.** Geen bezoekersreis, geen
"deze persoon kwam drie keer terug". Dat is de prijs, en voor wat jij wilt
weten is het geen probleem.

### Waar het vandaan komt

De bron wordt gelezen uit `?bron=` of `?utm_source=` in de url, en anders uit
de verwijzer. Onbekende waarden worden `overig`, zodat één verzonnen
`utm_source` niet meteen een eigen regel in het overzicht krijgt.

Zet in Meta altijd een herkomst achter je link:

```
https://nubeslist.nl/uwv-te-laat?bron=meta
```

Wil je per advertentie meten, gebruik dan Meta's eigen parameters erachter —
die tellen we niet mee, maar ze blijven wel in de url staan voor als je later
een pixel toevoegt.

---

## 2. De Meta-pixel: wat het oplevert en wat het kost

Je eigen tellingen vertellen jou hoe het gaat. Ze vertellen **Meta** niets, en
dat is een probleem voor je advertenties: zonder terugkoppeling kan het
algoritme niet leren wie je aanvragen indient, en optimaliseert het op klikken
in plaats van op klanten. Het verschil in kosten is meestal groot.

Daar staat tegenover:

**Je hebt toestemming nodig.** Een marketingpixel zet een cookie en stuurt
gegevens naar Meta. Dat mag pas ná toestemming van de bezoeker
(Telecommunicatiewet art. 11.7a en de AVG). Dus: een cookiebanner, en de
pixel blijft uit tot iemand op accepteren klikt. Wie weigert, wordt niet
gemeten — reken op 30 tot 60 procent.

**En er is een zwaardere vraag.** Als de pixel meestuurt dát iemand
`/uwv-wia` bezocht, stuur je gezondheidsgerelateerde gegevens naar Meta. Dat
is een bijzonder persoonsgegeven, en daar gelden veel strengere eisen voor dan
gewone toestemming. Europese toezichthouders zijn hier in het verleden hard
op geweest.

### Wat ik zou doen

**Niet de standaardpixel op elke pagina.** Wel:

1. **Een cookiebanner** met een echte weigerknop, die standaard uit staat.
2. **De Conversions API in plaats van de pixel**, zodat de melding vanaf je
   eigen server gaat en jij bepaalt wat erin zit.
3. **Alleen het eindpunt melden**: "er is een aanvraag ingediend", zonder
   welk zaaktype, zonder pagina, zonder inhoud. Dat is precies wat Meta nodig
   heeft om te optimaliseren, en het minste wat je kunt prijsgeven.
4. **Nooit** het zaaktype, de instantie of de uitslag meesturen.

Dat is te bouwen. Maar het raakt aan dezelfde vraag die al openstaat over het
BSN, en dat is een vraag voor een jurist — niet iets wat ik kan afdoen.

### Zolang dat niet geregeld is

Je kunt gewoon adverteren. Zet een `?bron=meta` achter je links, lees je
resultaten af op `/cijfers`, en stuur handmatig bij: zet advertenties uit die
klikken opleveren maar geen aanvragen. Dat is trager dan automatisch
optimaliseren, maar het werkt, en het kost je niets aan privacyrisico.

---

## 3. Wat de cijfers je gaan vertellen

Kijk niet naar het bezoekersaantal maar naar de trechter. Vier situaties, vier
conclusies:

| Wat je ziet | Wat er aan de hand is |
| --- | --- |
| Veel bezoek, weinig funnel gestart | De advertentie belooft iets anders dan de pagina levert |
| Funnel gestart, afhaken bij de uitslag | Mensen schrikken van de uitkomst, of snappen hem niet |
| Uitslag gezien, afhaken bij gegevens | Je vraagt te veel, of te vroeg (het BSN zit hier) |
| Gegevens ingevuld, afhaken bij akkoord | De machtiging of de prijs schrikt af |

Elke regel vraagt om een andere reparatie. Zonder deze cijfers is het gissen,
en gissen met een advertentiebudget is duur.
