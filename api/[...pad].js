/**
 * De API als serverloze functie.
 *
 * Vercel kent twee manieren om aan code te komen: bestanden in `api/` worden
 * functies, en alles in `public/` wordt als statisch bestand uitgeleverd.
 * Deze map is er weer omdat de site een tijd op de aanname draaide dat het
 * platform `server.js` uit zichzelf als applicatie zou laden. Klopt die
 * aanname niet, dan bestaat er in productie helemaal geen API: elk verzoek
 * aan /api/... komt dan bij de statische hosting terecht en die kent het pad
 * niet. De pagina's blijven het intussen gewoon doen, want dat zijn echte
 * bestanden. Dat is precies het beeld waar dit weken op is misgelopen:
 * advertenties leverden bezoekers, de landingspagina laadde, en er werd niets
 * geteld, niets gelezen en niets ingediend.
 *
 * Met dit bestand is die aanname niet meer nodig. De naam `[...pad].js` vangt
 * /api/ en alles daaronder; het oorspronkelijke pad blijft in `req.url`
 * staan, dus de router hieronder ziet hetzelfde als lokaal. Draait het
 * platform `server.js` toch al zelf, dan verandert dit niets: voor /api/*
 * wint deze functie en die roept dezelfde router aan.
 *
 * Wat hier NIET moet staan is een rewrite in vercel.json. Die was er eerder
 * wel en veranderde /api/beheer/login onderweg in /api/index, waarna de
 * router het pad niet meer herkende. Bestandsroutering doet dit vanzelf en
 * zonder het pad aan te raken.
 */
export { apiHandler as default } from '../server.js';
