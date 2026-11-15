import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';

const source = process.argv[2];
if (!source) throw new Error('Usage : npm run catalog:colors -- referentiel-des-lignes.json');
const rows = z
  .array(
    z.object({
      id_line: z.string().regex(/^C\d+$/),
      colourweb_hexa: z.string().nullish(),
      textcolourweb_hexa: z.string().nullish(),
    }),
  )
  .parse(JSON.parse(await readFile(source, 'utf8')));
const hex = (value: string | null | undefined) =>
  value && /^#?[0-9a-f]{6}$/i.test(value) ? `#${value.replace(/^#/, '').toUpperCase()}` : undefined;
const colors: Record<string, { color: string; textColor?: string }> = {};
for (const row of rows) {
  const color = hex(row.colourweb_hexa);
  if (color)
    colors[`STIF:Line::${row.id_line}:`] = { color, textColor: hex(row.textcolourweb_hexa) };
}
if (!Object.keys(colors).length) throw new Error('Aucune couleur valide dans le référentiel.');
await writeFile(
  'resources/line-colors.json',
  JSON.stringify({
    source: 'https://data.iledefrance-mobilites.fr/explore/dataset/referentiel-des-lignes/',
    file: basename(source),
    importedAt: new Date().toISOString(),
    colors,
  }) + '\n',
);
console.log(`${Object.keys(colors).length} couleurs de lignes importées.`);
