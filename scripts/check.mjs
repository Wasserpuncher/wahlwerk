#!/usr/bin/env node
// Wahlwerk - Selbsttests
// Lizenz: AGPL-3.0-or-later
//
// Zwei Teile:
//   1. Rechenverfahren gegen von Hand nachgerechnete Beispiele
//   2. Pruefung des erzeugten dist/ auf SEO- und Struktureigenschaften
//
// Aufruf: node scripts/check.mjs

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { sainteLague, hareNiemeyer, dHondt } from './lib/seats.mjs';
import { findCoalitions } from './lib/coalitions.mjs';
import { slug } from './lib/util.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'dist');

let failures = 0;
let checks = 0;

function assert(name, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --------------------------------------------------- 1. Rechenverfahren
console.log('\nRechenverfahren');

// Beispiel: Stimmanteile A 53, B 24, C 23 bei 10 Sitzen.
// Von Hand nachgerechnet, siehe docs/TESTFAELLE.md
const shares = { A: 53, B: 24, C: 23 };

assert('Sainte-Lague, 10 Sitze', eq(sainteLague(shares, 10), { A: 6, B: 2, C: 2 }), JSON.stringify(sainteLague(shares, 10)));
assert('Hare/Niemeyer, 10 Sitze', eq(hareNiemeyer(shares, 10), { A: 5, B: 3, C: 2 }), JSON.stringify(hareNiemeyer(shares, 10)));
assert('dHondt, 10 Sitze', eq(dHondt(shares, 10), { A: 6, B: 2, C: 2 }), JSON.stringify(dHondt(shares, 10)));

const sumOf = (o) => Object.values(o).reduce((a, b) => a + b, 0);
assert('Sainte-Lague vergibt genau alle Sitze', sumOf(sainteLague(shares, 137)) === 137);
assert('Hare/Niemeyer vergibt genau alle Sitze', sumOf(hareNiemeyer(shares, 137)) === 137);
assert('dHondt vergibt genau alle Sitze', sumOf(dHondt(shares, 137)) === 137);
assert('Null Sitze ergibt Nullverteilung', eq(sainteLague(shares, 0), { A: 0, B: 0, C: 0 }));

// Determinismus: zweimal rechnen muss identisch sein.
assert('Sainte-Lague ist deterministisch', eq(sainteLague(shares, 71), sainteLague(shares, 71)));

// Koalitionen: bei A 6, B 2, C 2 von 10 Sitzen ist nur A allein eine minimale Mehrheit.
const coal = findCoalitions({ A: 6, B: 2, C: 2 }, 6);
assert('nur eine minimale Mehrheit', coal.length === 1, JSON.stringify(coal));
assert('minimale Mehrheit ist A allein', eq(coal[0]?.parties, ['A']), JSON.stringify(coal[0]));

// Gleichstand: A 5, B 5 von 10, Mehrheit 6 -> nur A+B
const coal2 = findCoalitions({ A: 5, B: 5 }, 6);
assert('Patt erzwingt Zweierbuendnis', coal2.length === 1 && coal2[0].parties.length === 2, JSON.stringify(coal2));

// ---------------------------------------------- Regression Sachsen-Anhalt
// Echter Fall statt Lehrbuchbeispiel. Grundlage sind die veroeffentlichten
// Wahltrendwerte zur Landtagswahl Sachsen-Anhalt vom 12.08.2026 (drei Umfragen
// von pollytix, INSA und Infratest dimap, zusammen 4753 Befragte).
// Erwartet wird genau die Sitzverteilung, die dawum.de mit einer unabhaengigen
// Implementierung veroeffentlicht: AfD 41, CDU 22, Linke 13, SPD 7 von 83.
// Zweck: eine stille Aenderung am Rechenkern faellt sofort auf.
console.log('\nRegression Sachsen-Anhalt, Landtagswahl 06.09.2026');
{
  const trend = { AfD: 42.1, CDU: 22.9, Linke: 13.0, SPD: 6.6 };
  const seats = hareNiemeyer(trend, 83);
  assert('Sitzverteilung entspricht der unabhaengigen Rechnung', eq(seats, { AfD: 41, CDU: 22, Linke: 13, SPD: 7 }), JSON.stringify(seats));
  assert('Summe ergibt 83 Sitze', sumOf(seats) === 83);

  const coal = findCoalitions(seats, 42).map((c) => c.parties.join('+'));
  assert(
    'vier minimale Mehrheiten wie veroeffentlicht',
    eq(coal, ['AfD+CDU', 'AfD+Linke', 'AfD+SPD', 'CDU+Linke+SPD']),
    coal.join(' | '),
  );
}

// Slug-Stabilitaet
console.log('\nSlugs');
assert('Umlaute werden transliteriert', slug('Thüringen') === 'thueringen', slug('Thüringen'));
assert('Sonderzeichen werden zusammengefasst', slug('Nordrhein-Westfalen (NRW)') === 'nordrhein-westfalen-nrw', slug('Nordrhein-Westfalen (NRW)'));
assert('Slug ist idempotent', slug(slug('Baden-Württemberg')) === slug('Baden-Württemberg'));

// --------------------------------------------------- 2. Ausgabepruefung
if (!existsSync(OUT)) {
  console.error('\ndist/ fehlt. Zuerst npm run build ausfuehren.');
  process.exit(1);
}

console.log('\nErzeugte Seiten');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const htmlFiles = await walk(OUT);
assert('mindestens eine Seite erzeugt', htmlFiles.length > 0);

const titles = new Map();
const descriptions = new Map();
const problems = [];

for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const rel = path.relative(OUT, file);

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];

  if (!title) problems.push(`${rel}: kein Titel`);
  if (!desc) problems.push(`${rel}: keine Beschreibung`);
  if (!canonical) problems.push(`${rel}: kein Canonical`);
  if (!html.includes('application/ld+json')) problems.push(`${rel}: kein JSON-LD`);
  if (!/<h1[ >]/.test(html)) problems.push(`${rel}: keine h1`);
  if (desc && desc.length > 300) problems.push(`${rel}: Beschreibung mit ${desc.length} Zeichen zu lang`);

  // Externe Ressourcen sind aus Datenschutzgruenden unzulaessig.
  const externalAsset = html.match(/<(?:script|link|img)[^>]+(?:src|href)="https?:\/\/(?!schema\.org)[^"]+"/);
  if (externalAsset && !/rel="(?:license |external|external )?[^"]*"/.test(externalAsset[0])) {
    // Nur echte Ressourceneinbindungen sind kritisch, normale Textlinks nicht.
    if (/<(?:script|img)/.test(externalAsset[0]) || /<link[^>]+stylesheet/.test(externalAsset[0])) {
      problems.push(`${rel}: laedt externe Ressource ${externalAsset[0].slice(0, 90)}`);
    }
  }

  if (title) {
    if (!titles.has(title)) titles.set(title, []);
    titles.get(title).push(rel);
  }
  if (desc) {
    if (!descriptions.has(desc)) descriptions.set(desc, []);
    descriptions.get(desc).push(rel);
  }

  // JSON-LD muss parsebar sein.
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(m[1].replaceAll('\\u003c', '<').replaceAll('\\u003e', '>'));
    } catch (err) {
      problems.push(`${rel}: JSON-LD nicht parsebar (${err.message})`);
    }
  }
}

assert('alle Seiten haben Titel, Beschreibung, Canonical, JSON-LD und h1', problems.length === 0, problems.slice(0, 8).join(' | '));

const dupTitles = [...titles.entries()].filter(([, files]) => files.length > 1);
assert('keine doppelten Seitentitel', dupTitles.length === 0, dupTitles.slice(0, 3).map(([t, f]) => `${t} (${f.length}x)`).join(' | '));

const dupDesc = [...descriptions.entries()].filter(([, files]) => files.length > 1);
assert('keine doppelten Beschreibungen', dupDesc.length === 0, dupDesc.slice(0, 3).map(([d, f]) => `${d.slice(0, 40)} (${f.length}x)`).join(' | '));

// Sitemap gegen tatsaechliche Dateien pruefen
console.log('\nSitemap und Pflichtdateien');
for (const required of ['sitemap.xml', 'robots.txt', 'feed.xml', '404.html', 'assets/wahlwerk.css', 'daten/wahlwerk.json', 'daten/umfragen.csv', 'datenschutz/index.html', 'methodik/index.html', 'quellen/index.html']) {
  assert(`${required} vorhanden`, existsSync(path.join(OUT, required)));
}

const sitemapIndex = await readFile(path.join(OUT, 'sitemap.xml'), 'utf8');
const chunkNames = [...sitemapIndex.matchAll(/<loc>[^<]*\/([^/<]+\.xml)<\/loc>/g)].map((m) => m[1]);
assert('Sitemap-Index verweist auf vorhandene Dateien', chunkNames.every((n) => existsSync(path.join(OUT, n))), chunkNames.join(', '));

let sitemapUrls = 0;
let missingTargets = [];
for (const name of chunkNames) {
  const xml = await readFile(path.join(OUT, name), 'utf8');
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    sitemapUrls += 1;
    const urlPath = m[1].replace(/^https?:\/\/[^/]+/, '');
    const target = path.join(OUT, urlPath === '/' ? 'index.html' : path.join(urlPath, 'index.html'));
    if (!existsSync(target)) missingTargets.push(urlPath);
  }
}
assert('jede Sitemap-URL hat eine Datei', missingTargets.length === 0, missingTargets.slice(0, 5).join(', '));
assert('Sitemap deckt alle HTML-Seiten ab (ohne 404)', sitemapUrls === htmlFiles.length - 1, `${sitemapUrls} URLs, ${htmlFiles.length - 1} Seiten`);

const robots = await readFile(path.join(OUT, 'robots.txt'), 'utf8');
assert('robots.txt verweist auf die Sitemap', robots.includes('Sitemap:'));
assert('robots.txt sperrt nichts Wesentliches', !/Disallow:\s*\/\s*$/m.test(robots));

// Groesse
const sizes = await Promise.all(htmlFiles.map(async (f) => (await stat(f)).size));
const totalKb = Math.round(sizes.reduce((a, b) => a + b, 0) / 1024);
const cssKb = Math.round((await stat(path.join(OUT, 'assets', 'wahlwerk.css'))).size / 1024);
console.log(`\n  Umfang: ${htmlFiles.length} Seiten, ${totalKb} KB HTML, ${cssKb} KB CSS, 0 KB JavaScript`);

console.log(`\n${checks - failures} von ${checks} Pruefungen bestanden.`);
if (failures > 0) {
  console.error(`${failures} Pruefung(en) fehlgeschlagen.`);
  process.exitCode = 1;
}
