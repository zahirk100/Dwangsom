/**
 * Ingang voor Vercel.
 *
 * Deze functie handelt alles af wat niet al als statisch bestand is
 * geserveerd: de API én, als vangnet, de pagina's zelf. Zo werkt de site
 * ongeacht hoe het platform besluit te routeren.
 *
 * Het laden van de applicatie gebeurt apart en binnen een try, zodat een fout
 * tijdens het laden als leesbare tekst in het antwoord belandt in plaats van
 * als een kale FUNCTION_INVOCATION_FAILED. Fouten tíjdens een verzoek gaan
 * naar de gewone foutafhandeling, die de juiste statuscode kiest.
 */

let applicatie = null;

async function laadApplicatie() {
  if (!applicatie) applicatie = await import('../server.js');
  return applicatie;
}

function meldLaadfout(res, err) {
  console.error('[api] applicatie kon niet worden geladen:', err);
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(
    'Dwangsomhulp kon niet starten.\n\n'
    + `${err && err.message ? err.message : err}\n\n`
    + 'Deze melding komt uit de applicatie zelf. Staat hier "Cannot find module",\n'
    + 'dan ontbreekt een bestand in de deploy. De volledige fout staat in de\n'
    + 'runtime logs van Vercel.\n',
  );
}

export default async function handler(req, res) {
  let app;
  try {
    app = await laadApplicatie();
  } catch (err) {
    meldLaadfout(res, err);
    return;
  }

  try {
    await app.verwerk(req, res);
  } catch (err) {
    app.foutAfhandeling(err, req, res);
  }
}
