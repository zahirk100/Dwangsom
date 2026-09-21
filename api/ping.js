/**
 * Diagnose-eindpunt. Bewust zonder enige import op moduleniveau, zodat dit
 * bestand niet kan falen door iets in de applicatie.
 *
 * Werkt /api/ping wel en de rest niet, dan draait de serverloze omgeving
 * prima en zit het probleem in de applicatiecode. Faalt /api/ping ook, dan
 * komt de functie zelf niet op gang en ligt het aan de projectinstellingen
 * (Node-versie, buildinstellingen) en niet aan de applicatie.
 *
 * Dit bestand mag weg zodra de deploy draait.
 */

export default async function handler(req, res) {
  const regels = [
    'Dwangsomhulp - diagnose',
    '',
    `node:        ${process.version}`,
    `platform:    ${process.platform} ${process.arch}`,
    `VERCEL:      ${process.env.VERCEL || '(niet gezet)'}`,
    `regio:       ${process.env.VERCEL_REGION || '(onbekend)'}`,
    `wachtwoord:  ${process.env.BEHEER_WACHTWOORD ? 'ingesteld' : 'NIET ingesteld'}`,
    `database:    ${process.env.KV_REST_API_URL ? 'gekoppeld' : 'niet gekoppeld'}`,
    `url:         ${req.url}`,
    '',
  ];

  // Stap voor stap laden, zodat zichtbaar wordt wáár het misgaat.
  const modules = [
    ['shared/datum.js', () => import('../public/shared/datum.js')],
    ['shared/catalogus.js', () => import('../public/shared/catalogus.js')],
    ['shared/dwangsom.js', () => import('../public/shared/dwangsom.js')],
    ['shared/brief.js', () => import('../public/shared/brief.js')],
    ['src/opslag.js', () => import('../src/opslag.js')],
    ['src/sessie.js', () => import('../src/sessie.js')],
    ['src/store.js', () => import('../src/store.js')],
    ['src/http-util.js', () => import('../src/http-util.js')],
    ['src/validatie.js', () => import('../src/validatie.js')],
    ['server.js', () => import('../server.js')],
  ];

  for (const [naam, laad] of modules) {
    try {
      await laad();
      regels.push(`ok    ${naam}`);
    } catch (err) {
      regels.push(`FOUT  ${naam}: ${err && err.message ? err.message : err}`);
    }
  }

  regels.push('');
  try {
    const { default: fs } = await import('node:fs/promises');
    const { default: path } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const wortel = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const bestanden = await fs.readdir(path.join(wortel, 'public'));
    regels.push(`public/ in de bundel: ${bestanden.join(', ')}`);
  } catch (err) {
    regels.push(`public/ niet leesbaar: ${err && err.message ? err.message : err}`);
  }

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(regels.join('\n') + '\n');
}
