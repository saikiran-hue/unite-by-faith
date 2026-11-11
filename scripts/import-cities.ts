/**
 * Downloads GeoNames cities15000.zip and writes the `cities` insert SQL.
 *
 *   GEONAMES_DIR=<dir> npx tsx scripts/import-cities.ts
 *
 * The download is untrusted data: it is only ever parsed as tab-separated text, never executed.
 * Output: $GEONAMES_DIR/cities.sql (default dir: <os tmpdir>/ubf-geonames), consumed by build-catalogue-sql.ts.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GEONAMES_ATTRIBUTION } from '../src/lib/attribution';

const GEONAMES_URL = 'https://download.geonames.org/export/dump/cities15000.zip';
const ROWS_PER_INSERT = 1000;

export const geonamesDir = () => process.env.GEONAMES_DIR ?? path.join(os.tmpdir(), 'ubf-geonames');
export const citiesSqlPath = () => path.join(geonamesDir(), 'cities.sql');

interface City {
  id: number;
  name: string;
  countryCode: string;
  lat: number;
  lng: number;
  timezone: string;
  population: number;
}

/** Parses the GeoNames TSV (columns: 0 id, 1 name, 4 lat, 5 lng, 8 country, 14 population, 17 timezone). */
export function parseCities(tsv: string): City[] {
  const cities: City[] = [];
  for (const line of tsv.split('\n')) {
    if (!line.trim()) continue;
    const c = line.split('\t');
    if (c.length < 19) throw new Error(`Unexpected GeoNames row (${c.length} columns): ${line.slice(0, 80)}`);
    const city: City = {
      id: Number(c[0]),
      name: c[1].trim(),
      countryCode: c[8],
      lat: Number(c[4]),
      lng: Number(c[5]),
      timezone: c[17],
      population: Number(c[14]) || 0,
    };
    if (
      !Number.isInteger(city.id) ||
      !city.name ||
      city.countryCode.length !== 2 ||
      !Number.isFinite(city.lat) ||
      !Number.isFinite(city.lng) ||
      !city.timezone
    ) {
      throw new Error(`Invalid GeoNames row: ${line.slice(0, 80)}`);
    }
    cities.push(city);
  }
  return cities;
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function citiesToSql(cities: City[]): string {
  const sorted = [...cities].sort((a, b) => a.id - b.id);
  const parts = [`-- ${GEONAMES_ATTRIBUTION} (https://www.geonames.org, cities with population over 15000).`];
  for (let i = 0; i < sorted.length; i += ROWS_PER_INSERT) {
    const rows = sorted
      .slice(i, i + ROWS_PER_INSERT)
      .map(
        (c) =>
          `(${c.id},${lit(c.name)},${lit(c.countryCode)},${c.lat},${c.lng},${lit(c.timezone)},${c.population})`,
      );
    parts.push(
      `insert into public.cities (id, name, country_code, lat, lng, timezone, population) values\n${rows.join(',\n')}\n` +
        `on conflict (id) do update set name = excluded.name, country_code = excluded.country_code, lat = excluded.lat,\n` +
        `  lng = excluded.lng, timezone = excluded.timezone, population = excluded.population;`,
    );
  }
  return parts.join('\n') + '\n';
}

async function main() {
  const dir = geonamesDir();
  mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, 'cities15000.zip');
  if (!existsSync(zip)) {
    const res = await fetch(GEONAMES_URL);
    if (!res.ok) throw new Error(`GeoNames download failed: ${res.status}`);
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  }
  // unzip -p streams the one member to stdout; we only read it as text.
  const tsv = execFileSync('unzip', ['-p', zip, 'cities15000.txt'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const cities = parseCities(tsv);
  writeFileSync(citiesSqlPath(), citiesToSql(cities));
  console.log(`Wrote ${cities.length} cities to ${citiesSqlPath()}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
