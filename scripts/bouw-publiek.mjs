/**
 * Bouwstap voor statische hosting (Vercel).
 *
 * De browser importeert /shared/dwangsom.js rechtstreeks, zodat de wizard met
 * exact dezelfde code rekent als de server. Lokaal serveert server.js die map
 * zelf; op Vercel serveert het platform alleen public/. Daarom kopiëren we de
 * gedeelde modules bij het bouwen naar public/shared/.
 *
 * shared/ blijft de enige bron; public/shared/ staat in .gitignore.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const wortel = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bron = path.join(wortel, 'shared');
const doel = path.join(wortel, 'public', 'shared');

await fs.rm(doel, { recursive: true, force: true });
await fs.mkdir(doel, { recursive: true });

const bestanden = (await fs.readdir(bron)).filter((naam) => naam.endsWith('.js'));
for (const naam of bestanden) {
  await fs.copyFile(path.join(bron, naam), path.join(doel, naam));
}

console.log(`[bouw] ${bestanden.length} gedeelde modules gekopieerd naar public/shared/`);
