#!/usr/bin/env node
// Wahlwerk - Statischer Seitengenerator
// Lizenz: AGPL-3.0-or-later

import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { page, bar, belegstreifen, note } from './lib/render.mjs';
import { esc, num, int, deDate, slug, daysBetween } from './lib/util.mjs';
import { computeTrend, computeSpread } from './lib/trend.mjs';
import { distribute } from './lib/seats.mjs';
import { findCoalitions } from './lib/coalitions.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'dist');

const site = JSON.parse(await readFile(path.join(ROOT, 'config', 'site.json'), 'utf8'));
const parliamentConfig = JSON.parse(await readFile(path.join(ROOT, 'config', 'parliaments.json'), 'utf8'));
const data = JSON.parse(await readFile(path.join(ROOT, 'data', 'surveys.json'), 'utf8'));
const provenance = JSON.parse(await readFile(path.join(ROOT, 'data', 'provenance.json'), 'utf8'));

const COLORS = parliamentConfig.partyColors;
const isFixture = provenance.mode === 'fixture';
const buildTime = new Date().toISOString();
const pages = [];

if (site.baseUrl.includes('example.invalid')) {
  console.warn('[WARNUNG] baseUrl steht noch auf dem Platzhalter. Canonical-Tags und Sitemap sind damit unbrauchbar. config/site.json anpassen.');
}

// ---------------------------------------------------------------- Datenaufbau

const byParliament = new Map();
for (const s of data.surveys) {
  if (!byParliament.has(s.parliament)) byParliament.set(s.parliament, []);
  byParliament.get(s.parliament).push(s);
}

const byInstitute = new Map();
for (const s of data.surveys) {
  const key = s.institute ?? 'Institut nicht angegeben';
  if (!byInstitute.has(key)) byInstitute.set(key, []);
  byInstitute.get(key).push(s);
}

const partyIndex = new Map();
for (const s of data.surveys) {
  for (const p of Object.keys(s.results)) {
    if (!partyIndex.has(p)) partyIndex.set(p, []);
    partyIndex.get(p).push(s);
  }
}

const parliamentList = [...byParliament.entries()]
  .map(([name, surveys]) => {
    const cfg = parliamentConfig.parliaments[name] ?? null;
    const trend = computeTrend(surveys, site.trend);
    return { name, slug: slug(name), surveys, cfg, trend, latest: surveys[0] };
  })
  .sort((a, b) => b.surveys.length - a.surveys.length);

// ------------------------------------------------------------ Bausteinhelfer

function fixtureBanner() {
  if (!isFixture) return '';
  return note(
    'warn',
    'Testbuild mit synthetischen Daten',
    '<p>Dieser Build wurde aus <strong>frei erfundenen Testdaten</strong> erzeugt. Kein Wert auf dieser Seite bildet eine reale Umfrage ab. Fuer einen echten Build <code>npm run fetch</code> ausfuehren.</p>',
  );
}

function methodNote() {
  return note(
    'method',
    'Was der Trend ist und was nicht',
    `<p>Der Trend ist ein gewichteter Mittelwert bereits veroeffentlichter Sonntagsfragen. Er ist <strong>keine Prognose</strong> und korrigiert keine Institutseffekte. Je Institut geht nur die juengste Umfrage innerhalb von ${site.trend.maxAgeDays} Tagen ein, gewichtet mit einem Aktualitaetsabschlag (Halbwertszeit ${site.trend.halflifeDays} Tage) und der Wurzel der Fallzahl. Die vollstaendige Formel steht unter <a href="/methodik/">Methodik</a>.</p>`,
  );
}

function surveyRowLink(s) {
  return `/umfrage/${encodeURIComponent(s.id)}/`;
}

function provenanceBlock(s) {
  return `<div class="provenance">
<dl>
  <dt>Institut</dt><dd>${esc(s.institute ?? 'nicht angegeben')}</dd>
  <dt>Auftraggeber</dt><dd>${esc(s.tasker ?? 'nicht angegeben')}</dd>
  <dt>Befragungszeitraum</dt><dd>${s.dateStart && s.dateEnd ? `${esc(deDate(s.dateStart))} bis ${esc(deDate(s.dateEnd))}` : 'nicht angegeben'}</dd>
  <dt>Veroeffentlicht</dt><dd>${esc(deDate(s.date) ?? s.date)}</dd>
  <dt>Befragte</dt><dd>${s.surveyedPersons ? int(s.surveyedPersons) : 'nicht ausgewiesen'}</dd>
  <dt>Methode</dt><dd>${esc(s.method ?? 'nicht angegeben')}</dd>
  <dt>Summe der Werte</dt><dd>${num(s.resultSum)}&thinsp;%</dd>
  <dt>Datensatz-ID</dt><dd>${esc(s.id)}</dd>
</dl>
</div>`;
}

function surveyTable(surveys, { limit = 200, caption } = {}) {
  const shown = surveys.slice(0, limit);
  const parties = [...new Set(shown.flatMap((s) => Object.keys(s.results)))];
  const order = parties.sort((a, b) => {
    const avg = (p) => {
      const vals = shown.map((s) => s.results[p]).filter((v) => v != null);
      return vals.reduce((x, y) => x + y, 0) / (vals.length || 1);
    };
    return avg(b) - avg(a);
  });

  return `<div class="table-scroll">
<table>
${caption ? `<caption>${esc(caption)}</caption>` : ''}
<thead><tr>
  <th class="left" scope="col">Feldende</th>
  <th class="left" scope="col">Institut</th>
  <th class="left" scope="col">Auftraggeber</th>
  <th scope="col">n</th>
  ${order.map((p) => `<th scope="col">${esc(p)}</th>`).join('')}
  <th class="left" scope="col">Beleg</th>
</tr></thead>
<tbody>
${shown
  .map(
    (s) => `<tr>
  <td class="left"><time datetime="${esc(s.dateEnd ?? s.date)}">${esc(deDate(s.dateEnd ?? s.date))}</time></td>
  <td class="left">${esc(s.institute ?? 'n.a.')}</td>
  <td class="left">${esc(s.tasker ?? 'n.a.')}</td>
  <td>${s.surveyedPersons ? int(s.surveyedPersons) : 'n.a.'}</td>
  ${order.map((p) => `<td>${s.results[p] != null ? num(s.results[p]) : 'n.a.'}</td>`).join('')}
  <td class="left"><a href="${surveyRowLink(s)}">Beleg</a></td>
</tr>`,
  )
  .join('')}
</tbody>
</table>
</div>
${surveys.length > limit ? `<p class="lede">Angezeigt werden die ${int(limit)} juengsten von ${int(surveys.length)} Umfragen. Der vollstaendige Bestand steht unter <a href="/daten/">Daten</a> als JSON und CSV bereit.</p>` : ''}`;
}

function trendBlock(p) {
  if (!p.trend) return '<p>Fuer dieses Parlament liegen keine datierten Umfragen vor.</p>';
  if (p.trend.insufficient) {
    return note(
      'warn',
      'Zu wenige Umfragen fuer einen Trend',
      `<p>Im Fenster von ${site.trend.maxAgeDays} Tagen liegen nur ${int(p.trend.availableSurveys)} Umfragen vor, erforderlich sind ${int(p.trend.requiredSurveys)}. Es wird deshalb kein Mittelwert ausgewiesen. Die Einzelumfragen stehen unten.</p>`,
    );
  }
  const entries = Object.entries(p.trend.values).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map((e) => e[1]), 10);
  return `<div class="panel">
${entries.map(([party, value]) => bar(party, value, COLORS, Math.ceil(max / 5) * 5)).join('')}
</div>
<p class="lede">Stichtag ${esc(deDate(p.trend.anchorDate))}. Summe der Werte ${num(p.trend.sum)}&thinsp;%. Abweichungen von 100 entstehen durch die Mittelung ueber Umfragen mit unterschiedlichem Parteienausweis und werden nicht wegnormiert.</p>
<details>
<summary>Welche Umfragen in diesen Trend eingehen und mit welchem Gewicht</summary>
<div class="table-scroll"><table>
<thead><tr><th class="left">Institut</th><th class="left">Feldende</th><th>Alter in Tagen</th><th>n</th><th>Gewicht</th><th class="left">Beleg</th></tr></thead>
<tbody>
${p.trend.surveysUsed
  .map(
    (u) => `<tr>
  <td class="left">${esc(u.institute ?? 'n.a.')}</td>
  <td class="left"><time datetime="${esc(u.dateEnd)}">${esc(deDate(u.dateEnd))}</time></td>
  <td>${int(u.ageDays)}</td>
  <td>${u.surveyedPersons ? int(u.surveyedPersons) : `${int(site.trend.referenceSampleSize)} angenommen`}</td>
  <td>${num(u.weight, 3)}</td>
  <td class="left"><a href="/umfrage/${encodeURIComponent(u.id)}/">Beleg</a></td>
</tr>`,
  )
  .join('')}
</tbody>
</table></div>
</details>`;
}

function seatBlock(p) {
  if (!p.trend || p.trend.insufficient) return '';
  if (!p.cfg || p.cfg.verified !== true) {
    return note(
      'warn',
      'Keine Sitzverteilung ausgewiesen',
      `<p>Fuer ${esc(p.name)} ist die Sitzzuteilung in <code>config/parliaments.json</code> noch nicht verifiziert. Statt eine plausible, aber ungepruefte Zahl auszugeben, bleibt dieser Abschnitt leer. ${p.cfg?.hinweis ? esc(p.cfg.hinweis) : ''}</p>`,
    );
  }

  const dist = distribute(p.trend.values, p.cfg);
  if (!dist) return '';
  const coalitions = findCoalitions(dist.seats, dist.majority);
  const seatRows = Object.entries(dist.seats)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  return `<h2 id="sitze">Modellrechnung zur Sitzverteilung</h2>
${note(
  'method',
  'Modellrechnung, keine Prognose',
  `<p>Grundlage ist der oben stehende Trend, nicht ein Wahlergebnis. Verfahren: ${esc(dist.method === 'sainte-lague' ? 'Sainte-Lague/Schepers' : dist.method === 'hare-niemeyer' ? 'Hare/Niemeyer' : 'dHondt')}, Sperrklausel ${num(dist.thresholdPercent, 0)}&thinsp;%, ${int(dist.totalSeats)} Sitze, Rechtsgrundlage ${esc(p.cfg.rechtsgrundlage)}. ${dist.excludedParties.length > 0 ? `An der Sperrklausel scheitern im Modell: ${esc(dist.excludedParties.join(', '))}.` : ''} ${p.cfg.hinweis ? esc(p.cfg.hinweis) : ''}</p>`,
)}
<div class="table-scroll"><table>
<caption>Sitze im Modell, Mehrheit ab ${int(dist.majority)} Sitzen</caption>
<thead><tr><th class="left">Partei</th><th>Trendwert</th><th>Sitze im Modell</th></tr></thead>
<tbody>${seatRows.map(([party, seats]) => `<tr><td class="left">${esc(party)}</td><td>${num(p.trend.values[party])}&thinsp;%</td><td>${int(seats)}</td></tr>`).join('')}</tbody>
</table></div>

<h3>Rechnerische Mehrheiten</h3>
<p class="lede">Aufgefuehrt sind alle Kombinationen mit Mehrheit, aus denen keine Partei entfernt werden kann, ohne die Mehrheit zu verlieren. Dies ist reine Arithmetik. Ob eine Kombination politisch in Betracht kommt, wird hier nicht bewertet.</p>
${
  coalitions.length === 0
    ? '<p>Im Modell ergibt sich keine Mehrheit mit bis zu vier Partnern.</p>'
    : `<div class="table-scroll"><table>
<thead><tr><th class="left">Kombination</th><th>Sitze</th><th>Ueber der Mehrheit</th></tr></thead>
<tbody>${coalitions.map((c) => `<tr><td class="left">${esc(c.parties.join(' + '))}</td><td>${int(c.seats)}</td><td>${int(c.surplus)}</td></tr>`).join('')}</tbody>
</table></div>`
}`;
}

// ------------------------------------------------------------------- Seiten

function addPage(url, html, { priority = 0.5, changefreq = 'weekly', lastmod = buildTime } = {}) {
  pages.push({ url, html, priority, changefreq, lastmod });
}

// Startseite
{
  const cards = parliamentList
    .map((p) => {
      const t = p.trend && !p.trend.insufficient ? Object.entries(p.trend.values).sort((a, b) => b[1] - a[1]).slice(0, 4) : [];
      return `<article class="card">
  <h3><a href="/parlament/${p.slug}/">${esc(p.name)}</a></h3>
  ${t.length > 0 ? t.map(([party, v]) => bar(party, v, COLORS, 40)).join('') : '<p>Kein Trend verfuegbar.</p>'}
  <p>${int(p.surveys.length)} Umfragen, juengstes Feldende ${esc(deDate(p.latest.dateEnd ?? p.latest.date))}</p>
</article>`;
    })
    .join('');

  addPage(
    '/',
    page({
      site,
      url: '/',
      title: site.name,
      description: site.description,
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: site.name,
          url: site.baseUrl,
          description: site.description,
          inLanguage: 'de-DE',
          license: 'https://opendatacommons.org/licenses/odbl/1-0/',
          isAccessibleForFree: true,
        },
      ],
      updated: buildTime,
      body: `${fixtureBanner()}
<p class="eyebrow">Stand ${esc(deDate(buildTime.slice(0, 10)))}</p>
<h1>${esc(site.tagline)}</h1>
<p class="lede">${esc(site.description)}</p>
${belegstreifen(data.surveys.slice(0, 400))}
<h2>Parlamente</h2>
<div class="grid">${cards}</div>
${methodNote()}
<h2>Zuletzt veroeffentlicht</h2>
${surveyTable(data.surveys.slice(0, 25), { limit: 25, caption: 'Die 25 zuletzt veroeffentlichten Umfragen ueber alle Parlamente' })}`,
    }),
    { priority: 1.0, changefreq: 'daily' },
  );
}

// Parlamentsuebersicht
addPage(
  '/parlamente/',
  page({
    site,
    url: '/parlamente/',
    title: 'Alle Parlamente',
    description: `Umfragen zu ${int(parliamentList.length)} Parlamenten mit Trend, Einzelumfragen und Quellenangabe je Wert.`,
    breadcrumbs: [{ label: 'Start', url: '/' }, { label: 'Parlamente', url: '/parlamente/' }],
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Alle Parlamente',
        url: `${site.baseUrl}/parlamente/`,
        inLanguage: 'de-DE',
      },
    ],
    body: `<h1>Parlamente</h1>
<p class="lede">Zu jedem Parlament: gewichteter Trend, alle Einzelumfragen, Streuung zwischen den Instituten und, sofern die Sitzzuteilung verifiziert ist, eine Modellrechnung.</p>
<ul class="linklist">${parliamentList
      .map(
        (p) =>
          `<li><a href="/parlament/${p.slug}/">${esc(p.name)}</a><span class="meta">${int(p.surveys.length)} Umfragen, ab ${esc(deDate(p.surveys.at(-1).date))}</span></li>`,
      )
      .join('')}</ul>`,
  }),
  { priority: 0.8 },
);

// Parlamentsseiten und darunter Institutsseiten
for (const p of parliamentList) {
  const spread = computeSpread(p.trend && !p.trend.insufficient ? p.surveys.filter((s) => p.trend.surveysUsed.some((u) => u.id === s.id)) : []);
  const institutesHere = [...new Set(p.surveys.map((s) => s.institute).filter(Boolean))].sort();

  addPage(
    `/parlament/${p.slug}/`,
    page({
      site,
      url: `/parlament/${p.slug}/`,
      title: `Sonntagsfrage ${p.name}`,
      description: `Alle ${int(p.surveys.length)} verfuegbaren Umfragen zu ${p.name} mit Institut, Auftraggeber, Feldzeit und Fallzahl. Gewichteter Trend, Streuung und Quellenangabe je Wert.`,
      breadcrumbs: [
        { label: 'Start', url: '/' },
        { label: 'Parlamente', url: '/parlamente/' },
        { label: p.name, url: `/parlament/${p.slug}/` },
      ],
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'Dataset',
          name: `Wahlumfragen ${p.name}`,
          description: `Sammlung veroeffentlichter Sonntagsfragen zu ${p.name}.`,
          url: `${site.baseUrl}/parlament/${p.slug}/`,
          inLanguage: 'de-DE',
          license: 'https://opendatacommons.org/licenses/odbl/1-0/',
          isAccessibleForFree: true,
          creator: { '@type': 'Organization', name: 'dawum.de', url: 'https://dawum.de' },
          temporalCoverage: `${p.surveys.at(-1).date}/${p.surveys[0].date}`,
          variableMeasured: [...new Set(p.surveys.flatMap((s) => Object.keys(s.results)))].map((party) => ({
            '@type': 'PropertyValue',
            name: party,
            unitText: 'Prozent',
          })),
          distribution: [
            { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${site.baseUrl}/daten/wahlwerk.json` },
            { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${site.baseUrl}/daten/umfragen.csv` },
          ],
        },
      ],
      updated: buildTime,
      body: `${fixtureBanner()}
<p class="eyebrow">${esc(p.surveys[0].parliamentElection ?? 'Wahl')}</p>
<h1>Sonntagsfrage ${esc(p.name)}</h1>
<p class="lede">${int(p.surveys.length)} Umfragen von ${int(institutesHere.length)} Instituten, aeltester Datensatz vom ${esc(deDate(p.surveys.at(-1).date))}, juengster vom ${esc(deDate(p.surveys[0].date))}.</p>
${belegstreifen(p.surveys)}
<h2 id="trend">Gewichteter Trend</h2>
${trendBlock(p)}
${methodNote()}
${
  Object.keys(spread).length > 0
    ? `<h2 id="streuung">Streuung zwischen den Instituten</h2>
<p class="lede">Niedrigster und hoechster Wert unter den Umfragen, die in den Trend eingehen. Grosse Spannen sind ein Warnsignal gegen die Ueberinterpretation eines Mittelwerts.</p>
<div class="table-scroll"><table>
<thead><tr><th class="left">Partei</th><th>Minimum</th><th class="left">Institut</th><th>Maximum</th><th class="left">Institut</th><th>Spanne</th></tr></thead>
<tbody>${Object.entries(spread)
        .sort((a, b) => b[1].max.value - a[1].max.value)
        .map(
          ([party, s]) =>
            `<tr><td class="left">${esc(party)}</td><td>${num(s.min.value)}</td><td class="left">${esc(s.min.institute ?? 'n.a.')}</td><td>${num(s.max.value)}</td><td class="left">${esc(s.max.institute ?? 'n.a.')}</td><td>${num(s.max.value - s.min.value)}</td></tr>`,
        )
        .join('')}</tbody>
</table></div>`
    : ''
}
${seatBlock(p)}
<h2 id="institute">Institute mit Umfragen zu ${esc(p.name)}</h2>
<ul class="linklist">${institutesHere
        .map((i) => {
          const count = p.surveys.filter((s) => s.institute === i).length;
          return `<li><a href="/parlament/${p.slug}/institut/${slug(i)}/">${esc(i)}</a><span class="meta">${int(count)} Umfragen</span></li>`;
        })
        .join('')}</ul>
<h2 id="alle">Alle Umfragen</h2>
${surveyTable(p.surveys, { caption: `Veroeffentlichte Sonntagsfragen zu ${p.name}, absteigend nach Veroeffentlichungsdatum` })}`,
    }),
    { priority: 0.9, changefreq: 'daily' },
  );

  for (const inst of institutesHere) {
    const list = p.surveys.filter((s) => s.institute === inst);
    addPage(
      `/parlament/${p.slug}/institut/${slug(inst)}/`,
      page({
        site,
        url: `/parlament/${p.slug}/institut/${slug(inst)}/`,
        title: `${inst}: Umfragen zu ${p.name}`,
        description: `Alle ${int(list.length)} Umfragen von ${inst} zu ${p.name} mit Feldzeit, Fallzahl und Auftraggeber.`,
        breadcrumbs: [
          { label: 'Start', url: '/' },
          { label: 'Parlamente', url: '/parlamente/' },
          { label: p.name, url: `/parlament/${p.slug}/` },
          { label: inst, url: `/parlament/${p.slug}/institut/${slug(inst)}/` },
        ],
        structuredData: [
          {
            '@context': 'https://schema.org',
            '@type': 'Dataset',
            name: `${inst}: Umfragen zu ${p.name}`,
            url: `${site.baseUrl}/parlament/${p.slug}/institut/${slug(inst)}/`,
            inLanguage: 'de-DE',
            license: 'https://opendatacommons.org/licenses/odbl/1-0/',
            temporalCoverage: `${list.at(-1).date}/${list[0].date}`,
          },
        ],
        body: `${fixtureBanner()}
<h1>${esc(inst)}: Umfragen zu ${esc(p.name)}</h1>
<p class="lede">${int(list.length)} Umfragen zwischen ${esc(deDate(list.at(-1).date))} und ${esc(deDate(list[0].date))}. Zurueck zur <a href="/parlament/${p.slug}/">Gesamtuebersicht ${esc(p.name)}</a> oder zum <a href="/institut/${slug(inst)}/">Institutsprofil</a>.</p>
${belegstreifen(list)}
${surveyTable(list, { caption: `Umfragen von ${inst} zu ${p.name}` })}`,
      }),
      { priority: 0.6 },
    );
  }
}

// Institutsuebersicht und Profile
const instituteList = [...byInstitute.entries()].sort((a, b) => b[1].length - a[1].length);

addPage(
  '/institute/',
  page({
    site,
    url: '/institute/',
    title: 'Meinungsforschungsinstitute',
    description: `${int(instituteList.length)} Institute im Bestand, mit Anzahl der Umfragen, abgedeckten Parlamenten und durchschnittlicher Fallzahl.`,
    breadcrumbs: [{ label: 'Start', url: '/' }, { label: 'Institute', url: '/institute/' }],
    structuredData: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Meinungsforschungsinstitute', url: `${site.baseUrl}/institute/`, inLanguage: 'de-DE' }],
    body: `<h1>Meinungsforschungsinstitute</h1>
<p class="lede">Die Institute erheben die Umfragen. ${esc(site.name)} gibt sie wieder und bewertet sie nicht. Fallzahlen sind Medianwerte ueber alle erfassten Umfragen des Instituts.</p>
<div class="table-scroll"><table>
<thead><tr><th class="left">Institut</th><th>Umfragen</th><th>Parlamente</th><th>Median n</th><th class="left">Zeitraum</th></tr></thead>
<tbody>${instituteList
      .map(([name, list]) => {
        const ns = list.map((s) => s.surveyedPersons).filter(Boolean).sort((a, b) => a - b);
        const median = ns.length ? ns[Math.floor(ns.length / 2)] : null;
        const parls = new Set(list.map((s) => s.parliament)).size;
        return `<tr><td class="left"><a href="/institut/${slug(name)}/">${esc(name)}</a></td><td>${int(list.length)}</td><td>${int(parls)}</td><td>${median ? int(median) : 'n.a.'}</td><td class="left">${esc(deDate(list.at(-1).date))} bis ${esc(deDate(list[0].date))}</td></tr>`;
      })
      .join('')}</tbody>
</table></div>`,
  }),
  { priority: 0.8 },
);

for (const [name, list] of instituteList) {
  const parls = [...new Set(list.map((s) => s.parliament))].sort();
  const taskers = [...new Set(list.map((s) => s.tasker).filter(Boolean))].sort();
  const methods = [...new Set(list.map((s) => s.method).filter(Boolean))].sort();
  addPage(
    `/institut/${slug(name)}/`,
    page({
      site,
      url: `/institut/${slug(name)}/`,
      title: name,
      description: `${int(list.length)} erfasste Umfragen von ${name} zu ${int(parls.length)} Parlamenten, mit Auftraggebern, Befragungsmethoden und Fallzahlen.`,
      breadcrumbs: [
        { label: 'Start', url: '/' },
        { label: 'Institute', url: '/institute/' },
        { label: name, url: `/institut/${slug(name)}/` },
      ],
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'Dataset',
          name: `Umfragen von ${name}`,
          url: `${site.baseUrl}/institut/${slug(name)}/`,
          inLanguage: 'de-DE',
          license: 'https://opendatacommons.org/licenses/odbl/1-0/',
          temporalCoverage: `${list.at(-1).date}/${list[0].date}`,
        },
      ],
      body: `${fixtureBanner()}
<h1>${esc(name)}</h1>
<p class="lede">${int(list.length)} erfasste Umfragen zwischen ${esc(deDate(list.at(-1).date))} und ${esc(deDate(list[0].date))}.</p>
<div class="provenance"><dl>
<dt>Parlamente</dt><dd>${esc(parls.join(', '))}</dd>
<dt>Auftraggeber</dt><dd>${taskers.length ? esc(taskers.join(', ')) : 'nicht angegeben'}</dd>
<dt>Erfasste Methoden</dt><dd>${methods.length ? esc(methods.join(', ')) : 'nicht angegeben'}</dd>
<dt>Umfragen ohne Fallzahl</dt><dd>${int(list.filter((s) => !s.surveyedPersons).length)}</dd>
</dl></div>
${belegstreifen(list)}
<h2>Aufteilung nach Parlament</h2>
<ul class="linklist">${parls
        .map(
          (pl) =>
            `<li><a href="/parlament/${slug(pl)}/institut/${slug(name)}/">${esc(pl)}</a><span class="meta">${int(list.filter((s) => s.parliament === pl).length)} Umfragen</span></li>`,
        )
        .join('')}</ul>
<h2>Alle Umfragen</h2>
${surveyTable(list, { caption: `Umfragen von ${name}` })}`,
    }),
    { priority: 0.6 },
  );
}

// Parteiseiten
const partyList = [...partyIndex.entries()].sort((a, b) => b[1].length - a[1].length);

addPage(
  '/parteien/',
  page({
    site,
    url: '/parteien/',
    title: 'Parteien in den Umfragen',
    description: `${int(partyList.length)} Parteien und Sammelkategorien, die in den erfassten Umfragen einzeln ausgewiesen werden.`,
    breadcrumbs: [{ label: 'Start', url: '/' }, { label: 'Parteien', url: '/parteien/' }],
    structuredData: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Parteien in den Umfragen', url: `${site.baseUrl}/parteien/`, inLanguage: 'de-DE' }],
    body: `<h1>Parteien</h1>
${note('method', 'Warum manche Parteien fehlen', '<p>Ob eine Partei einzeln ausgewiesen wird, entscheidet das jeweilige Institut, nicht diese Seite. Wird eine Partei nicht ausgewiesen, geht sie in der Regel in der Kategorie Sonstige auf. Ein fehlender Wert bedeutet deshalb <strong>nicht</strong> null Prozent und wird hier auch nicht als solcher behandelt.</p>')}
<ul class="linklist">${partyList
      .map(([party, list]) => `<li><a href="/partei/${slug(party)}/">${esc(party)}</a><span class="meta">in ${int(list.length)} Umfragen ausgewiesen</span></li>`)
      .join('')}</ul>`,
  }),
  { priority: 0.8 },
);

for (const [party, list] of partyList) {
  const perParliament = parliamentList
    .filter((p) => p.trend && !p.trend.insufficient && p.trend.values[party] != null)
    .map((p) => ({ p, value: p.trend.values[party] }))
    .sort((a, b) => b.value - a.value);

  addPage(
    `/partei/${slug(party)}/`,
    page({
      site,
      url: `/partei/${slug(party)}/`,
      title: `${party} in den Wahlumfragen`,
      description: `Aktuelle Trendwerte fuer ${party} in ${int(perParliament.length)} Parlamenten sowie alle Einzelumfragen, in denen ${party} einzeln ausgewiesen wird.`,
      breadcrumbs: [
        { label: 'Start', url: '/' },
        { label: 'Parteien', url: '/parteien/' },
        { label: party, url: `/partei/${slug(party)}/` },
      ],
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'Dataset',
          name: `Umfragewerte ${party}`,
          url: `${site.baseUrl}/partei/${slug(party)}/`,
          inLanguage: 'de-DE',
          license: 'https://opendatacommons.org/licenses/odbl/1-0/',
          temporalCoverage: `${list.at(-1).date}/${list[0].date}`,
        },
      ],
      body: `${fixtureBanner()}
<h1>${esc(party)} in den Wahlumfragen</h1>
<p class="lede">Einzeln ausgewiesen in ${int(list.length)} erfassten Umfragen, juengste vom ${esc(deDate(list[0].date))}.</p>
${
  perParliament.length > 0
    ? `<h2>Trendwerte nach Parlament</h2>
<div class="panel">${perParliament.map(({ p, value }) => bar(p.name, value, { [p.name]: COLORS[party] ?? COLORS.Sonstige }, Math.max(40, ...perParliament.map((x) => x.value)))).join('')}</div>
<ul class="linklist">${perParliament.map(({ p, value }) => `<li><a href="/parlament/${p.slug}/">${esc(p.name)}</a><span class="meta">${num(value)}&thinsp;% im Trend, Stichtag ${esc(deDate(p.trend.anchorDate))}</span></li>`).join('')}</ul>`
    : '<p>Fuer diese Partei liegt derzeit in keinem Parlament ein ausreichend besetzter Trend vor.</p>'
}
<h2>Alle Umfragen mit ausgewiesenem Wert</h2>
${surveyTable(list, { limit: 150, caption: `Umfragen, in denen ${party} einzeln ausgewiesen wird` })}`,
    }),
    { priority: 0.7 },
  );
}

// Einzelne Umfragen
if (site.build.generateSurveyPages) {
  for (const s of data.surveys) {
    const parl = parliamentList.find((p) => p.name === s.parliament);
    const entries = Object.entries(s.results).sort((a, b) => b[1] - a[1]);
    const fieldDays = s.dateStart && s.dateEnd ? daysBetween(s.dateStart, s.dateEnd) : null;

    addPage(
      `/umfrage/${encodeURIComponent(s.id)}/`,
      page({
        site,
        url: `/umfrage/${encodeURIComponent(s.id)}/`,
        title: `${s.institute ?? 'Umfrage'} zu ${s.parliament}, Feldende ${deDate(s.dateEnd ?? s.date)}`,
        description: `Einzelne Sonntagsfrage von ${s.institute ?? 'unbekanntem Institut'} zu ${s.parliament}. ${s.surveyedPersons ? `${int(s.surveyedPersons)} Befragte, ` : ''}veroeffentlicht am ${deDate(s.date)}. Alle Parteiwerte mit vollstaendiger Herkunftsangabe.`,
        breadcrumbs: [
          { label: 'Start', url: '/' },
          { label: 'Parlamente', url: '/parlamente/' },
          { label: s.parliament, url: `/parlament/${slug(s.parliament)}/` },
          { label: `Umfrage ${s.id}`, url: `/umfrage/${encodeURIComponent(s.id)}/` },
        ],
        structuredData: [
          {
            '@context': 'https://schema.org',
            '@type': 'Dataset',
            name: `Sonntagsfrage ${s.parliament}, ${s.institute ?? 'Institut unbekannt'}, ${s.date}`,
            url: `${site.baseUrl}/umfrage/${encodeURIComponent(s.id)}/`,
            datePublished: s.date,
            inLanguage: 'de-DE',
            license: 'https://opendatacommons.org/licenses/odbl/1-0/',
            creator: s.institute ? { '@type': 'Organization', name: s.institute } : undefined,
            sponsor: s.tasker ? { '@type': 'Organization', name: s.tasker } : undefined,
            temporalCoverage: s.dateStart && s.dateEnd ? `${s.dateStart}/${s.dateEnd}` : undefined,
            variableMeasured: entries.map(([p, v]) => ({ '@type': 'PropertyValue', name: p, value: v, unitText: 'Prozent' })),
          },
        ],
        body: `${fixtureBanner()}
<p class="eyebrow">Einzelbeleg</p>
<h1>${esc(s.institute ?? 'Institut nicht angegeben')} zu ${esc(s.parliament)}</h1>
<p class="lede">Feldende ${esc(deDate(s.dateEnd ?? s.date))}, veroeffentlicht ${esc(deDate(s.date))}${fieldDays != null ? `, Feldzeit ${int(fieldDays + 1)} Tage` : ''}.</p>
${provenanceBlock(s)}
<h2>Ergebnis</h2>
<div class="panel">${entries.map(([p, v]) => bar(p, v, COLORS, Math.ceil(Math.max(...entries.map((e) => e[1])) / 5) * 5)).join('')}</div>
${
  Math.abs(s.resultSum - 100) > 2
    ? note('warn', 'Summe weicht von 100 Prozent ab', `<p>Die ausgewiesenen Werte summieren sich auf ${num(s.resultSum)}&thinsp;%. Das ist bei Instituten ueblich, die nicht alle Parteien einzeln ausweisen oder Unentschlossene anders behandeln. Der Wert wird hier unveraendert wiedergegeben und nicht hochgerechnet.</p>`)
    : ''
}
${note('method', 'Was diese Zahlen aussagen', `<p>Eine Sonntagsfrage misst die Wahlabsicht im Befragungszeitraum. Sie ist keine Vorhersage des Wahlergebnisses. Der statistische Fehlerbereich haengt von der Fallzahl ab und ist bei kleinen Parteien relativ groesser als bei grossen. ${s.surveyedPersons ? '' : 'Fuer diese Umfrage ist keine Fallzahl ausgewiesen, eine Fehlerabschaetzung ist damit nicht moeglich.'}</p>`)}
${parl ? `<p><a href="/parlament/${parl.slug}/">Alle Umfragen zu ${esc(s.parliament)}</a>${s.institute ? ` und <a href="/institut/${slug(s.institute)}/">alle Umfragen von ${esc(s.institute)}</a>` : ''}.</p>` : ''}`,
      }),
      { priority: 0.4, changefreq: 'monthly', lastmod: `${s.date}T00:00:00Z` },
    );
  }
}

// Inhaltsseiten aus content/
const contentPages = [
  { file: 'methodik.html', url: '/methodik/', title: 'Methodik', description: 'Die vollstaendige Rechenvorschrift hinter jedem Trendwert, jeder Sitzverteilung und jeder Koalitionsrechnung. Nachrechenbar und quelloffen.', priority: 0.7 },
  { file: 'quellen.html', url: '/quellen/', title: 'Quellenverzeichnis', description: 'Jede verwendete Datenquelle mit Betreiber, Lizenz, Abrufweg und bekannten Grenzen.', priority: 0.7 },
  { file: 'daten.html', url: '/daten/', title: 'Datenexport', description: 'Der gesamte Bestand als JSON und CSV unter der Open Database License, mit Feldbeschreibung.', priority: 0.7 },
  { file: 'datenschutz.html', url: '/datenschutz/', title: 'Datenschutzerklaerung', description: 'Informationen nach Artikel 13 und 14 DSGVO zur Verarbeitung personenbezogener Daten auf dieser Website.', priority: 0.3 },
];
if (site.legal.renderImpressum) {
  contentPages.push({ file: 'impressum.html', url: '/impressum/', title: 'Impressum', description: 'Anbieterkennzeichnung nach Paragraf 5 DDG und Paragraf 18 Absatz 2 MStV.', priority: 0.3 });
}

for (const c of contentPages) {
  let html = await readFile(path.join(ROOT, 'content', c.file), 'utf8');
  html = html
    .replaceAll('{{VERANTWORTLICHER_NAME}}', esc(site.legal.verantwortlicher.name))
    .replaceAll('{{VERANTWORTLICHER_STRASSE}}', esc(site.legal.verantwortlicher.strasse))
    .replaceAll('{{VERANTWORTLICHER_PLZ_ORT}}', esc(`${site.legal.verantwortlicher.plz} ${site.legal.verantwortlicher.ort}`))
    .replaceAll('{{VERANTWORTLICHER_LAND}}', esc(site.legal.verantwortlicher.land))
    .replaceAll('{{VERANTWORTLICHER_EMAIL}}', esc(site.legal.verantwortlicher.email))
    .replaceAll('{{VERANTWORTLICHER_TELEFON}}', esc(site.legal.verantwortlicher.telefon || 'nicht angegeben'))
    .replaceAll('{{AUFSICHTSBEHOERDE}}', esc(site.legal.aufsichtsbehoerde))
    .replaceAll('{{HOSTER}}', esc(site.hosting.anbieter))
    .replaceAll('{{SERVERSTANDORT}}', esc(site.hosting.serverstandort))
    .replaceAll('{{LOG_TAGE}}', esc(String(site.hosting.logRetentionDays)))
    .replaceAll('{{SITE_NAME}}', esc(site.name))
    .replaceAll('{{BASE_URL}}', esc(site.baseUrl))
    .replaceAll('{{HALFLIFE}}', esc(String(site.trend.halflifeDays)))
    .replaceAll('{{MAXAGE}}', esc(String(site.trend.maxAgeDays)))
    .replaceAll('{{REFN}}', esc(String(site.trend.referenceSampleSize)))
    .replaceAll('{{MINSURVEYS}}', esc(String(site.trend.minSurveys)))
    .replaceAll('{{SURVEY_COUNT}}', int(data.surveys.length))
    .replaceAll('{{PARLIAMENT_COUNT}}', int(parliamentList.length))
    .replaceAll('{{INSTITUTE_COUNT}}', int(instituteList.length))
    .replaceAll('{{SOURCE_UPDATE}}', esc(provenance.sourceLastUpdate ?? provenance.fetchedAt ?? 'unbekannt'))
    .replaceAll('{{BUILD_TIME}}', esc(buildTime));

  addPage(
    c.url,
    page({
      site,
      url: c.url,
      title: c.title,
      description: c.description,
      breadcrumbs: [{ label: 'Start', url: '/' }, { label: c.title, url: c.url }],
      structuredData: [{ '@context': 'https://schema.org', '@type': 'WebPage', name: c.title, url: `${site.baseUrl}${c.url}`, inLanguage: 'de-DE' }],
      body: html,
    }),
    { priority: c.priority, changefreq: 'monthly' },
  );
}

// ------------------------------------------------------------------ Ausgabe

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const p of pages) {
  const dir = path.join(OUT, p.url === '/' ? '' : p.url);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), p.html, 'utf8');
}

// Assets
await mkdir(path.join(OUT, 'assets'), { recursive: true });
await cp(path.join(ROOT, 'src', 'styles', 'wahlwerk.css'), path.join(OUT, 'assets', 'wahlwerk.css'));
await writeFile(
  path.join(OUT, 'assets', 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#ecefe9"/><g stroke="#15181a" stroke-width="2.4"><path d="M5 24V12M11 24V7M17 24V15M23 24V10"/></g><path d="M3 27h26" stroke="#12545a" stroke-width="2.4"/></svg>`,
  'utf8',
);

// Datenexporte
await mkdir(path.join(OUT, 'daten'), { recursive: true });
await writeFile(
  path.join(OUT, 'daten', 'wahlwerk.json'),
  JSON.stringify(
    {
      license: 'ODC Open Database License (ODbL) 1.0',
      licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      attribution: 'Daten von dawum.de (Open Database License (ODbL)), aufbereitet von ' + site.name,
      sourceUrl: 'https://dawum.de',
      generatedAt: buildTime,
      sourceLastUpdate: provenance.sourceLastUpdate ?? null,
      synthetic: isFixture,
      surveys: data.surveys,
      trends: Object.fromEntries(parliamentList.map((p) => [p.name, p.trend])),
    },
    null,
    2,
  ),
  'utf8',
);

const csvParties = [...new Set(data.surveys.flatMap((s) => Object.keys(s.results)))].sort();
const csvEsc = (v) => {
  const str = v == null ? '' : String(v);
  return /[",;\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
};
const csv = [
  ['id', 'parlament', 'institut', 'auftraggeber', 'methode', 'veroeffentlicht', 'feld_start', 'feld_ende', 'befragte', ...csvParties].join(';'),
  ...data.surveys.map((s) =>
    [s.id, s.parliament, s.institute, s.tasker, s.method, s.date, s.dateStart, s.dateEnd, s.surveyedPersons, ...csvParties.map((p) => (s.results[p] != null ? String(s.results[p]).replace('.', ',') : ''))]
      .map(csvEsc)
      .join(';'),
  ),
].join('\n');
await writeFile(path.join(OUT, 'daten', 'umfragen.csv'), `\uFEFF${csv}`, 'utf8');

// Sitemaps
const chunkSize = site.build.sitemapChunkSize;
const chunks = [];
for (let i = 0; i < pages.length; i += chunkSize) chunks.push(pages.slice(i, i + chunkSize));

const sitemapNames = [];
for (const [i, chunk] of chunks.entries()) {
  const name = chunks.length === 1 ? 'sitemap-pages.xml' : `sitemap-pages-${i + 1}.xml`;
  sitemapNames.push(name);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${chunk
    .map(
      (p) => `  <url>
    <loc>${esc(site.baseUrl + p.url)}</loc>
    <lastmod>${esc(p.lastmod)}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority.toFixed(1)}</priority>
  </url>`,
    )
    .join('\n')}
</urlset>`;
  await writeFile(path.join(OUT, name), xml, 'utf8');
}

await writeFile(
  path.join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapNames.map((n) => `  <sitemap><loc>${esc(`${site.baseUrl}/${n}`)}</loc><lastmod>${buildTime}</lastmod></sitemap>`).join('\n')}
</sitemapindex>`,
  'utf8',
);

await writeFile(
  path.join(OUT, 'robots.txt'),
  `# ${site.name}
User-agent: *
Allow: /
Disallow: /daten/umfragen.csv$

Sitemap: ${site.baseUrl}/sitemap.xml
`,
  'utf8',
);

// RSS
const feedItems = data.surveys.slice(0, 50);
await writeFile(
  path.join(OUT, 'feed.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(site.name)} - neue Wahlumfragen</title>
<link>${esc(site.baseUrl)}/</link>
<atom:link href="${esc(site.baseUrl)}/feed.xml" rel="self" type="application/rss+xml"/>
<description>${esc(site.description)}</description>
<language>de-de</language>
<lastBuildDate>${new Date(buildTime).toUTCString()}</lastBuildDate>
${feedItems
    .map(
      (s) => `<item>
  <title>${esc(`${s.institute ?? 'Umfrage'}: ${s.parliament}, ${deDate(s.date)}`)}</title>
  <link>${esc(`${site.baseUrl}/umfrage/${encodeURIComponent(s.id)}/`)}</link>
  <guid isPermaLink="true">${esc(`${site.baseUrl}/umfrage/${encodeURIComponent(s.id)}/`)}</guid>
  <pubDate>${new Date(`${s.date}T06:00:00Z`).toUTCString()}</pubDate>
  <description>${esc(
    Object.entries(s.results)
      .sort((a, b) => b[1] - a[1])
      .map(([p, v]) => `${p} ${num(v)} %`)
      .join(', ') + `. Feldende ${deDate(s.dateEnd ?? s.date)}${s.surveyedPersons ? `, ${int(s.surveyedPersons)} Befragte` : ''}. Quelle: ${s.institute ?? 'nicht angegeben'}.`,
  )}</description>
</item>`,
    )
    .join('\n')}
</channel>
</rss>`,
  'utf8',
);

// 404
await writeFile(
  path.join(OUT, '404.html'),
  page({
    site,
    url: '/404.html',
    title: 'Seite nicht gefunden',
    description: 'Die aufgerufene Adresse existiert nicht.',
    structuredData: [{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Seite nicht gefunden', inLanguage: 'de-DE' }],
    body: `<h1>Seite nicht gefunden</h1>
<p class="lede">Diese Adresse gibt es nicht. Umfragen aendern ihre Adresse nicht, aber ein Tippfehler reicht.</p>
<ul class="linklist"><li><a href="/parlamente/">Alle Parlamente</a></li><li><a href="/institute/">Alle Institute</a></li><li><a href="/parteien/">Alle Parteien</a></li><li><a href="/daten/">Datenexport</a></li></ul>`,
  }),
  'utf8',
);

console.log(`Build fertig: ${pages.length} Seiten, ${chunks.length} Sitemap-Datei(en), Ausgabe in dist/`);
if (isFixture) console.warn('[WARNUNG] Build basiert auf synthetischen Testdaten und darf nicht veroeffentlicht werden.');
