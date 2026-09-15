#!/usr/bin/env node
// Wahlwerk - Statischer Seitengenerator
// Lizenz: AGPL-3.0-or-later

import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { page, bar, belegstreifen, note } from './lib/render.mjs';
import { esc, num, int, deDate, slug, daysBetween } from './lib/util.mjs';
import { computeTrend, computeSpread } from './lib/trend.mjs';
import { distribute } from './lib/seats.mjs';
import { findCoalitions, mehrheitOhne } from './lib/coalitions.mjs';
import { hemicycle, timeline, comparison, coalitionBars, scenarioStrip } from './lib/charts.mjs';
import { computeAccuracy, huerdenVergleich } from './lib/accuracy.mjs';
import { verknuepfeWahlkreise } from './lib/abgeordnetenwatch.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'dist');

const site = JSON.parse(await readFile(path.join(ROOT, 'config', 'site.json'), 'utf8'));
const parliamentConfig = JSON.parse(await readFile(path.join(ROOT, 'config', 'parliaments.json'), 'utf8'));
const data = JSON.parse(await readFile(path.join(ROOT, 'data', 'surveys.json'), 'utf8'));
const electionConfig = JSON.parse(await readFile(path.join(ROOT, 'config', 'elections.json'), 'utf8'));
const provenance = JSON.parse(await readFile(path.join(ROOT, 'data', 'provenance.json'), 'utf8'));

// Amtliche Wahlergebnisse. Jede Datei unter config/wahlergebnisse/ gehoert zu
// genau einer Wahl und wird von scripts/import-wahlergebnis.mjs erzeugt. Fehlt
// die Datei, entfaellt der zugehoerige Abschnitt, ohne den Build zu stoppen:
// ein Parlament ohne amtliches Ergebnis ist der Normalfall, kein Fehler.
async function ladeOptional(datei, bezeichnung) {
  try {
    return JSON.parse(await readFile(datei, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[WARNUNG] ${bezeichnung} konnte nicht gelesen werden: ${err.message}`);
    }
    return null;
  }
}

const wahlergebnisse = new Map();
for (const [land, eintrag] of Object.entries(electionConfig.elections)) {
  if (!eintrag.amtlicheDatei) continue;
  const geladen = await ladeOptional(
    path.join(ROOT, 'config', eintrag.amtlicheDatei),
    `Amtliches Ergebnis fuer ${land}`,
  );
  if (geladen) wahlergebnisse.set(land, geladen);
}

// Wahlkreis- und Kandidaturdaten von abgeordnetenwatch.de. Optional: der Build
// laeuft vollstaendig ohne sie, nur die Namen der direkt Gewaehlten fehlen dann.
const abgeordnetenwatch = await ladeOptional(
  path.join(ROOT, 'data', 'abgeordnetenwatch.json'),
  'Daten von abgeordnetenwatch.de',
);

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
  // Die Unterscheidung ist wichtig: Seit amtliche Wahlergebnisse angebunden
  // sind, stehen im Testbuild echte und erfundene Zahlen nebeneinander. Ein
  // pauschales "alles hier ist erfunden" waere selbst eine Falschaussage und
  // wuerde das amtliche Ergebnis zu Unrecht in Zweifel ziehen.
  return note(
    'warn',
    'Testbuild mit synthetischen Umfragedaten',
    `<p>Die <strong>Umfragewerte</strong> dieses Builds sind <strong>frei erfunden</strong>. Keine der aufgefuehrten Umfragen, Institute und Trendrechnungen bildet etwas Reales ab. Fuer einen echten Build <code>npm run fetch</code> ausfuehren.</p>
<p>Nicht betroffen sind die <strong>amtlichen Wahlergebnisse</strong>. Sie stammen aus den Dateien der jeweiligen Wahlleitung und sind auch in diesem Testbuild echt. Alles, was Umfragen mit dem amtlichen Ergebnis vergleicht, bleibt dagegen leer: eine Abweichung erfundener Umfragen von einem echten Ergebnis waere eine sinnlose Zahl.</p>`,
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

function kpiBand(p) {
  const institutes = new Set(p.surveys.map((s) => s.institute).filter(Boolean));
  const withN = p.surveys.filter((s) => s.surveyedPersons);
  const totalN = withN.reduce((a, s) => a + s.surveyedPersons, 0);
  const lead =
    p.trend && !p.trend.insufficient
      ? Object.entries(p.trend.values).sort((a, b) => b[1] - a[1]).slice(0, 2)
      : null;
  return `<dl class="kpis">
  <div class="kpi"><dt>Umfragen</dt><dd>${int(p.surveys.length)}<span class="kpi-sub">von ${int(institutes.size)} Instituten</span></dd></div>
  <div class="kpi"><dt>Juengstes Feldende</dt><dd>${esc(deDate(p.latest.dateEnd ?? p.latest.date))}<span class="kpi-sub">${esc(p.latest.institute ?? 'Institut n.a.')}</span></dd></div>
  ${lead ? `<div class="kpi"><dt>Fuehrend im Trend</dt><dd>${num(lead[0][1])}&thinsp;%<span class="kpi-sub">${esc(lead[0][0])}, Abstand ${num(lead[0][1] - lead[1][1])} zu ${esc(lead[1][0])}</span></dd></div>` : ''}
  <div class="kpi"><dt>Befragte insgesamt</dt><dd>${withN.length ? int(totalN) : 'n.a.'}<span class="kpi-sub">${withN.length ? `aus ${int(withN.length)} Umfragen mit Angabe` : 'keine Fallzahl ausgewiesen'}</span></dd></div>
</dl>`;
}

function electionHistory(p) {
  const e = electionConfig.elections[p.name];
  if (!e || !Array.isArray(e.history) || e.history.length < 2) return '';

  const pseudo = [...e.history]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((h) => ({ date: h.date, results: h.results, institute: h.label, dateEnd: h.date }));

  const parties = [...new Set(e.history.flatMap((h) => Object.keys(h.results)))]
    .filter((party) => party !== 'Sonstige' && e.history.some((h) => (h.results[party] ?? 0) >= 4));

  const cols = [...new Set(e.history.flatMap((h) => Object.keys(h.results)))].sort((a, b) => {
    const newest = e.history[0].results;
    return (newest[b] ?? 0) - (newest[a] ?? 0);
  });

  const unverified = e.history.filter((h) => !h.verified);

  return `<h2 id="historie">Alle Wahlergebnisse seit ${esc(e.history.at(-1).date.slice(0, 4))}</h2>
<p class="lede">Amtliche Zweitstimmenanteile. Amtliche Werke sind nach Paragraf 5 UrhG gemeinfrei und duerfen dauerhaft archiviert und wiedergegeben werden.</p>
${timeline(pseudo, { colors: COLORS, threshold: p.cfg?.thresholdPercent ?? 5, parties })}
<div class="table-scroll"><table>
<caption>Zweitstimmenanteile in Prozent, neueste Wahl zuerst</caption>
<thead><tr><th class="left">Wahl</th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}<th>Summe</th><th>Sitze</th><th class="left">Beleglage</th></tr></thead>
<tbody>
${e.history
  .map(
    (h) => `<tr>
  <td class="left"><time datetime="${esc(h.date)}">${esc(deDate(h.date))}</time></td>
  ${cols.map((c) => `<td>${h.results[c] != null ? num(h.results[c]) : '—'}</td>`).join('')}
  <td>${num(h.sum)}</td>
  <td>${h.seatsActual ? int(h.seatsActual) : 'n.a.'}</td>
  <td class="left">${h.verified ? 'zwei Quellen' : 'eine Quelle, ungeprueft'}</td>
</tr>`,
  )
  .join('')}
</tbody>
</table></div>
${note('method', 'Warum die Summen nicht exakt 100 ergeben', '<p>Die amtlichen Anteile werden auf eine Nachkommastelle gerundet veroeffentlicht. Die Summe der gerundeten Werte weicht deshalb um wenige Zehntel von 100 ab. Es wird bewusst nicht nachjustiert. Der Build prueft fuer jede Wahl, ob die Summe im Bereich von 100 liegt, und bricht bei groben Abweichungen ab.</p>')}
${
  unverified.length > 0
    ? note(
        'warn',
        'Beleglage einzelner Wahlen',
        `<p>Fuer ${int(unverified.length)} der aufgefuehrten Wahlen liegt bisher nur eine Quelle vor. Diese Werte werden hier wiedergegeben und als ungeprueft gekennzeichnet, aber in <strong>keine Berechnung</strong> uebernommen: weder in den Wahlvergleich noch in die Institutsabweichung. Die amtliche Fundstelle ist das Statistische Landesamt Sachsen-Anhalt. ${e.history.at(-1).date.slice(0, 4) > '1990' ? `Die Landtagswahlen vor ${esc(e.history.at(-1).date.slice(0, 4))} fehlen noch und werden bewusst nicht aus dem Gedaechtnis ergaenzt.` : ''}</p>`,
      )
    : ''
}`;
}

function electionComparison(p) {
  const e = electionConfig.elections[p.name];
  if (!e || e.verified !== true || !p.trend || p.trend.insufficient) return '';

  // Liegt das amtliche Ergebnis derselben Wahl vor, steht der Vergleich von
  // Trend und Ergebnis bereits im Abschnitt zur Institutsgenauigkeit, und zwar
  // ausfuehrlicher. Ein zweiter Block "Vergleich mit der Landtagswahl 2026"
  // waere dann eine Dopplung, die zudem nahelegt, der Trend beziehe sich auf
  // eine noch bevorstehende Wahl.
  if (wahlergebnisse.has(p.name) && wahlergebnisse.get(p.name).wahl.wahltag === e.date) return '';

  return `<h2 id="vergleich">Vergleich mit der ${esc(e.label)}</h2>
${comparison(p.trend.values, e.results, {
    colors: COLORS,
    previousLabel: `${e.label} (${deDate(e.date)})`,
    currentLabel: `Trend ${deDate(p.trend.anchorDate)}`,
  })}
${e.hinweis ? note('method', 'Zur Einordnung', `<p>${esc(e.hinweis)}</p>`) : ''}`;
}

/** Aufzaehlung in natuerlichem Deutsch: "A, B und C". */
function aufzaehlung(teile) {
  if (teile.length <= 1) return teile.join('');
  return `${teile.slice(0, -1).join(', ')} und ${teile.at(-1)}`;
}

/**
 * Das amtliche Wahlergebnis. Anders als jede Modellrechnung auf dieser Seite
 * ist das kein Modell, sondern eine Feststellung. Der Abschnitt macht diesen
 * Unterschied ausdruecklich, weil er der wichtigste auf der ganzen Seite ist.
 */
function amtlichesErgebnisBlock(p) {
  const e = wahlergebnisse.get(p.name);
  if (!e) return '';

  const b = e.beteiligung;
  const s = e.sitze;
  const vorlaeufig = e.status.endgueltig !== true;

  const sitzZeilen = Object.entries(s.verteilung)
    .filter(([, v]) => v > 0)
    .sort((a, b2) => b2[1] - a[1]);

  const anteile = e.ergebnisProjektnamen;

  return `<h2 id="amtlich">Amtliches Ergebnis der ${esc(e.wahl.bezeichnung)}</h2>
<p class="lede">Gewaehlt wurde am ${esc(deDate(e.wahl.wahltag))}. Die folgenden Zahlen sind keine Modellrechnung und keine Umfrage, sondern das ausgezaehlte Ergebnis.</p>
${
  vorlaeufig
    ? note(
        'warn',
        'Vorlaeufiges amtliches Ergebnis',
        `<p>${esc(e.status.hinweis)} Stand der Quelldateien: ${esc(e.status.standDatum)}.</p>`,
      )
    : ''
}
<dl class="kpis">
  <div class="kpi"><dt>Wahlbeteiligung</dt><dd>${num(b.wahlbeteiligungProzent)}&thinsp;%<span class="kpi-sub">${int(b.waehler)} von ${int(b.wahlberechtigte)} Wahlberechtigten</span></dd></div>
  <div class="kpi"><dt>Gueltige Zweitstimmen</dt><dd>${int(b.gueltigeZweitstimmen)}<span class="kpi-sub">${int(b.ungueltigeZweitstimmen)} ungueltig, ${num(b.ungueltigeZweitstimmenProzent)}&thinsp;%</span></dd></div>
  <div class="kpi"><dt>Sitze im Landtag</dt><dd>${int(s.gesamt)}<span class="kpi-sub">${s.ueberhangUndAusgleich === 0 ? 'genau die gesetzliche Mindestzahl' : `${int(s.ueberhangUndAusgleich)} ueber der Mindestzahl von ${int(s.gesetzlicheMindestzahl)}`}</span></dd></div>
  <div class="kpi"><dt>Mehrheit ab</dt><dd>${int(s.mehrheit)}<span class="kpi-sub">Sitzen</span></dd></div>
</dl>

<h3>Zweitstimmen</h3>
<div class="panel">
${(() => {
  const sammel = new Set(parliamentConfig.aggregateCategories.map((x) => x.toLowerCase()));
  const skala = Math.ceil(Math.max(...Object.values(anteile)) / 5) * 5;
  // Sammelposten ans Ende, unabhaengig von ihrer Groesse. Sie zwischen die
  // Parteien zu sortieren legt nahe, sie waeren eine davon.
  return Object.entries(anteile)
    .sort((a, b2) => {
      const aS = sammel.has(a[0].toLowerCase());
      const bS = sammel.has(b2[0].toLowerCase());
      if (aS !== bS) return aS ? 1 : -1;
      return b2[1] - a[1];
    })
    .map(([party, value]) => bar(party, value, COLORS, skala))
    .join('');
})()}
</div>
<div class="table-scroll"><table>
<caption>Amtliches Zweitstimmenergebnis, absolute Stimmen und Anteile</caption>
<thead><tr><th class="left">Partei</th><th>Stimmen</th><th>Anteil</th><th>Sitze</th><th>davon direkt</th><th>davon Liste</th></tr></thead>
<tbody>
${Object.entries(e.zweitstimmen.stimmen)
  .sort((a, b2) => b2[1] - a[1])
  .map(([amtlicherName, stimmen]) => {
    const anteil = e.zweitstimmen.anteilExakt[amtlicherName];
    // Die Sitztabelle fuehrt Projektbezeichner, die Stimmtabelle amtliche.
    // Zusammengefuehrt wird ueber die beim Import festgehaltene Zuordnung.
    const projektname = e.parteiZuordnung?.[amtlicherName] ?? null;
    const det = projektname ? s.detail[projektname] ?? null : null;
    return `<tr>
  <td class="left">${esc(amtlicherName)}</td>
  <td>${int(stimmen)}</td>
  <td>${num(anteil)}&thinsp;%</td>
  <td>${det ? int(det.gesamt) : '—'}</td>
  <td>${det ? int(det.direkt) : '—'}</td>
  <td>${det ? int(det.liste) : '—'}</td>
</tr>`;
  })
  .join('')}
</tbody>
</table></div>

<h3>Sitzverteilung</h3>
${hemicycle(s.verteilung, { colors: COLORS, majority: s.mehrheit, totalSeats: s.gesamt })}
${(() => {
  const sitzmap = Object.fromEntries(sitzZeilen);
  const koalitionen = findCoalitions(sitzmap, s.mehrheit).map((c) => ({
    ...c,
    seatsByParty: Object.fromEntries(c.parties.map((party) => [party, s.verteilung[party]])),
  }));
  if (koalitionen.length === 0) return '<p>Es ergibt sich keine Mehrheit mit bis zu vier Partnern.</p>';

  // Die staerkste Partei und die Frage, ob es ohne sie eine Mehrheit gibt.
  // Diese Frage darf nicht an der Obergrenze von vier Partnern scheitern,
  // sonst entsteht der falsche Eindruck, es gaebe gar keine.
  const staerkste = sitzZeilen[0][0];
  const alleMitStaerkster = koalitionen.every((c) => c.parties.includes(staerkste));
  const ohne = alleMitStaerkster ? mehrheitOhne(sitzmap, s.mehrheit, staerkste) : null;

  return `<h3>Rechnerische Mehrheiten im gewaehlten Landtag</h3>
<p class="lede">Alle Kombinationen mit Mehrheit und hoechstens vier Partnern, aus denen keine Partei entfernt werden kann, ohne die Mehrheit zu verlieren. Reine Arithmetik, keine Aussage darueber, welche Kombination politisch in Betracht kommt.</p>
${coalitionBars(koalitionen, { colors: COLORS, totalSeats: s.gesamt, majority: s.mehrheit })}
${
  alleMitStaerkster
    ? note(
        'warn',
        `Jede dieser Mehrheiten enthaelt ${esc(staerkste)}`,
        ohne
          ? `<p>Das liegt an der Obergrenze von vier Partnern, nicht an der Arithmetik. Eine Mehrheit ohne ${esc(staerkste)} existiert: ${esc(aufzaehlung(ohne.parties))} kommen zusammen auf ${int(ohne.seats)} Sitze und damit ${ohne.surplus === 0 ? 'genau auf die Mehrheit' : `${int(ohne.surplus)} Sitze darueber`}. Sie braucht allerdings ${int(ohne.partnerCount)} Partner und erscheint deshalb nicht in der Liste oben.</p>`
          : `<p>Und zwar nicht wegen der Obergrenze von vier Partnern: Auch alle uebrigen Parteien zusammen erreichen die Mehrheit von ${int(s.mehrheit)} Sitzen nicht. Ohne ${esc(staerkste)} ist rechnerisch keine Mehrheit moeglich.</p>`,
      )
    : ''
}`;
})()}
${note(
  'method',
  'Woher diese Zahlen stammen und wie sie geprueft wurden',
  `<p>Quelle ist ${esc(e.quelle.herausgeber)}, Fundstelle <a href="${esc(e.quelle.fundstelle)}" rel="external">${esc(e.quelle.fundstelle)}</a>. ${esc(e.quelle.rechtsstellung)}</p>
<p>Die Rohdateien liegen im Repository unter <code>quellen/</code>, ihre Pruefsummen in der erzeugten Datei. Beim Einlesen wurden vier Kontrollen erzwungen: gueltige plus ungueltige Stimmen ergeben die Waehlerzahl, die Summe der Parteistimmen ergibt die gueltigen Stimmen, die Summe der Sitze ergibt die amtliche Gesamtzahl, und die aus den Erststimmen selbst ermittelten Wahlkreissieger stimmen mit den amtlich ausgewiesenen Direktmandaten ueberein. Schlaegt eine davon fehl, entsteht keine Datei.</p>
<p>Zusaetzlich rechnet der Selbsttest die Sitzverteilung aus den amtlichen Zweitstimmen mit dem Rechenkern dieses Projekts nach und vergleicht sie mit der amtlich festgestellten. Beide stimmen ueberein.</p>`,
)}`;
}

/**
 * Institutsgenauigkeit: die letzten Umfragen vor der Wahl gegen das amtliche
 * Ergebnis. Das ist der Abschnitt, der aus einer behaupteten Zuverlaessigkeit
 * eine belegte macht, und zugleich derjenige, bei dem eine Ueberinterpretation
 * am naechsten liegt. Die Vorbehalte stehen deshalb nicht im Kleingedruckten.
 */
function genauigkeitsBlock(p) {
  const e = wahlergebnisse.get(p.name);
  if (!e) return '';

  const acc = computeAccuracy(p.surveys, e, {
    fensterTage: site.accuracy?.fensterTage ?? 45,
    aggregateCategories: parliamentConfig.aggregateCategories,
    istSynthetisch: isFixture,
  });

  if (!acc.verfuegbar) {
    if (acc.grund === 'synthetisch') {
      return note(
        'warn',
        'Keine Genauigkeitsauswertung im Testmodus',
        '<p>Dieser Build nutzt synthetische Umfragedaten. Eine Abweichung erfundener Umfragen von einem echten Wahlergebnis waere eine sinnlose Zahl und wird deshalb nicht ausgegeben.</p>',
      );
    }
    if (acc.grund === 'keine-umfragen-im-fenster') {
      return note(
        'method',
        'Keine Genauigkeitsauswertung moeglich',
        `<p>Im Fenster von ${int(acc.fensterTage)} Tagen vor der Wahl liegt keine Umfrage vor, die sich mit dem amtlichen Ergebnis vergleichen liesse.</p>`,
      );
    }
    return '';
  }

  const parteiZeilen = Object.entries(acc.jePartei).sort((a, b2) => b2[1].amtlich - a[1].amtlich);
  const huerde = p.cfg?.thresholdPercent ?? 5;
  const huerdenZeilen = p.trend && !p.trend.insufficient
    ? huerdenVergleich(p.trend.values, e.ergebnisProjektnamen, huerde, parliamentConfig.aggregateCategories)
    : [];
  const abweichendeHuerde = huerdenZeilen.filter((z) => z.abweichend);

  const vorzeichen = (v) => `${v > 0 ? '+' : ''}${num(v)}`;

  return `<h2 id="genauigkeit">Wie genau waren die Umfragen?</h2>
<p class="lede">Verglichen wird die jeweils letzte Umfrage eines Instituts vor dem Wahltag mit dem amtlichen Ergebnis. Eine positive Differenz bedeutet: die Partei wurde unterschaetzt, sie hat besser abgeschnitten als gemessen.</p>

<div class="table-scroll"><table>
<caption>Abweichung je Institut, letzte Umfrage vor der Wahl</caption>
<thead><tr><th class="left">Institut</th><th class="left">Feldende</th><th>Tage vor der Wahl</th><th>Befragte</th><th>mittlere absolute Abweichung</th><th>groesster Einzelfehler</th></tr></thead>
<tbody>
${acc.institute
  .map(
    (i) => `<tr>
  <td class="left">${esc(i.institut)}</td>
  <td class="left"><time datetime="${esc(i.feldEnde)}">${esc(deDate(i.feldEnde))}</time></td>
  <td>${int(i.tageVorWahl)}</td>
  <td>${i.befragte ? int(i.befragte) : 'n.a.'}</td>
  <td>${num(i.kern?.mittlereAbsoluteAbweichung ?? i.mittlereAbsoluteAbweichung)}&thinsp;Pp</td>
  <td>${(() => {
    // Beide Spalten muessen auf derselben Grundmenge beruhen. Sonst stuende
    // neben einer Kennzahl ueber sechs Parteien ein Einzelfehler, den es in
    // dieser Grundmenge gar nicht gibt.
    const f = (i.kern ?? i).groessterFehler;
    return f ? `${esc(f.partei)} ${vorzeichen(f.differenz)}` : '—';
  })()}</td>
</tr>`,
  )
  .join('')}
</tbody>
</table></div>
${note(
  'method',
  'Was diese Rangfolge nicht sagt',
  `<p>Verglichen wird auf einer gemeinsamen Grundmenge von ${int(acc.kernparteien.length)} Parteien (${esc(acc.kernparteien.join(', '))}), damit ein Institut nicht dadurch besser dasteht, dass es eine schwierige Partei gar nicht erst ausweist.</p>
<p>Trotzdem ist das die Momentaufnahme <strong>einer einzigen Wahl</strong>. Ein Institut mit einer grossen Abweichung ist deshalb nicht schlechter als eines mit einer kleinen. Dafuer braeuchte es viele Wahlen. Hinzu kommt: die letzte Umfrage lag ${int(Math.min(...acc.institute.map((i) => i.tageVorWahl)))} bis ${int(Math.max(...acc.institute.map((i) => i.tageVorWahl)))} Tage vor dem Wahltag. Eine Umfrage misst die Stimmung im Feldzeitraum und ist keine Vorhersage des Wahltags.</p>`,
)}

<h3>Abweichung je Partei</h3>
<p class="lede">Ueber alle ${int(acc.institute.length)} beruecksichtigten Umfragen. Die mittlere Abweichung mit Vorzeichen zeigt, ob eine Partei von allen Instituten in dieselbe Richtung verschaetzt wurde.</p>
<div class="table-scroll"><table>
<thead><tr><th class="left">Partei</th><th>amtlich</th><th>mittlere Abweichung</th><th>mittlere absolute Abweichung</th><th>Spanne</th></tr></thead>
<tbody>
${parteiZeilen
  .map(
    ([partei, v]) => `<tr>
  <td class="left">${esc(partei)}</td>
  <td>${num(v.amtlich)}&thinsp;%</td>
  <td>${vorzeichen(v.mittlereAbweichung)}&thinsp;Pp</td>
  <td>${num(v.mittlereAbsoluteAbweichung)}&thinsp;Pp</td>
  <td>${vorzeichen(v.spanne.min)} bis ${vorzeichen(v.spanne.max)}</td>
</tr>`,
  )
  .join('')}
</tbody>
</table></div>

${
  huerdenZeilen.length > 0
    ? `<h3>Die Sperrklausel im Rueckblick</h3>
<p class="lede">An der Fuenfprozenthuerde haengen ganze Sitzbloecke. Hier steht, was der Trend vor der Wahl nahelegte und was tatsaechlich eingetreten ist.</p>
<div class="table-scroll"><table>
<thead><tr><th class="left">Partei</th><th>Trend</th><th>amtlich</th><th>Differenz</th><th class="left">Huerde nach Trend</th><th class="left">Huerde tatsaechlich</th></tr></thead>
<tbody>
${huerdenZeilen
  .map(
    (z) => `<tr${z.abweichend ? ' class="row-flag"' : ''}>
  <td class="left">${esc(z.partei)}</td>
  <td>${num(z.trend)}&thinsp;%</td>
  <td>${num(z.amtlich)}&thinsp;%</td>
  <td>${vorzeichen(z.differenz)}&thinsp;Pp</td>
  <td class="left">${z.trendDrin ? 'genommen' : 'verfehlt'}</td>
  <td class="left">${z.amtlichDrin ? 'genommen' : 'verfehlt'}</td>
</tr>`,
  )
  .join('')}
</tbody>
</table></div>
${
  abweichendeHuerde.length > 0
    ? note(
        'warn',
        `Bei ${int(abweichendeHuerde.length)} ${abweichendeHuerde.length === 1 ? 'Partei' : 'Parteien'} lag der Trend auf der falschen Seite der Huerde`,
        `<p>${abweichendeHuerde
          .map(
            (z) =>
              `<strong>${esc(z.partei)}</strong>: im Trend ${num(z.trend)} Prozent und damit ${z.trendDrin ? 'ueber' : 'unter'} der Huerde, amtlich ${num(z.amtlich)} Prozent und damit ${z.amtlichDrin ? 'darueber' : 'darunter'}`,
          )
          .join('. ')}. Genau das ist der Grund, warum eine Sitzrechnung auf Umfragebasis mit Vorbehalt zu lesen ist: eine Partei knapp unter der Huerde bekommt im Modell null Sitze, eine knapp darueber einen ganzen Block.</p>`,
      )
    : note(
        'method',
        'Die Huerde wurde richtig eingeschaetzt',
        '<p>Bei keiner Partei lag der Trend auf der anderen Seite der Sperrklausel als das amtliche Ergebnis. Das ist der guenstige Fall und keineswegs selbstverstaendlich.</p>',
      )
}`
    : ''
}`;
}

/**
 * Die Wahlkreise mit den direkt gewaehlten Personen. Die Namen stammen von
 * abgeordnetenwatch.de. Solange dort keine Mandate erfasst sind, werden sie
 * abgeleitet, und das steht auch so auf der Seite.
 */
function wahlkreisBlock(p) {
  const e = wahlergebnisse.get(p.name);
  if (!e?.wahlkreise?.liste?.length) return '';

  const passend =
    abgeordnetenwatch && abgeordnetenwatch.periode?.wahltag === e.wahl.wahltag ? abgeordnetenwatch : null;
  const v = passend ? verknuepfeWahlkreise(e.wahlkreise.liste, passend) : null;
  const zeilen = v ? v.zeilen : e.wahlkreise.liste;

  const direkt = Object.entries(e.wahlkreise.direktmandate).sort((a, b2) => b2[1] - a[1]);
  const knappste = [...e.wahlkreise.liste].sort((a, b2) => a.vorsprungPunkte - b2.vorsprungPunkte)[0];

  return `<h2 id="wahlkreise">Die ${int(e.wahlkreise.anzahl)} Wahlkreise</h2>
<p class="lede">In jedem Wahlkreis wird eine Person direkt gewaehlt, wer die meisten Erststimmen hat. Direktmandate: ${direkt.map(([party, n]) => `${esc(party)} ${int(n)}`).join(', ')}. Der knappste Wahlkreis war ${esc(knappste.name)} mit ${num(knappste.vorsprungPunkte)} Prozentpunkten Vorsprung.</p>
${
  v && v.abgeleitet > 0
    ? note(
        'method',
        'Woher die Namen stammen',
        `<p>Die Wahlkreisergebnisse sind amtlich. Die Namen der direkt Gewaehlten sind es an dieser Stelle nicht: abgeordnetenwatch.de hat fuer diese Wahlperiode noch keine Mandate erfasst, das geschieht ueblicherweise erst nach der konstituierenden Sitzung.</p>
<p>Fuer ${int(v.abgeleitet)} der ${int(v.gesamt)} Wahlkreise ist der Name deshalb <strong>abgeleitet</strong>: amtlich steht fest, welche Partei den Wahlkreis gewonnen hat, und bei abgeordnetenwatch.de ist hinterlegt, wer fuer diese Partei dort als einzige Person kandidiert hat. Das ist zulaessig, weil jede Partei je Wahlkreis nur einen Kreiswahlvorschlag einreichen darf, aber es ist eine Ableitung und keine amtliche Feststellung. Sobald die Mandate erfasst sind, tritt die dort hinterlegte Angabe an ihre Stelle.</p>`,
      )
    : ''
}
<div class="table-scroll"><table>
<caption>Wahlkreise, direkt gewaehlte Partei und Vorsprung auf den zweiten Platz</caption>
<thead><tr><th>Nr.</th><th class="left">Wahlkreis</th><th class="left">gewonnen von</th><th>Erststimmenanteil</th><th class="left">zweiter</th><th>Vorsprung</th><th class="left">direkt gewaehlt</th></tr></thead>
<tbody>
${zeilen
  .map(
    (w) => `<tr>
  <td>${esc(String(Number(w.nummer)))}</td>
  <td class="left">${esc(w.name)}</td>
  <td class="left">${esc(w.sieger)}</td>
  <td>${num(w.siegerAnteil)}&thinsp;%</td>
  <td class="left">${w.zweiter ? esc(w.zweiter) : '—'}</td>
  <td>${w.vorsprungPunkte !== null ? `${num(w.vorsprungPunkte)}&thinsp;Pp` : '—'}</td>
  <td class="left">${
    w.gewaehltName
      ? w.gewaehltProfil
        ? `<a href="${esc(w.gewaehltProfil)}" rel="external">${esc(w.gewaehltName)}</a>${w.herkunft === 'abgeleitet' ? ' <span class="meta">abgeleitet</span>' : ''}`
        : esc(w.gewaehltName)
      : '—'
  }</td>
</tr>`,
  )
  .join('')}
</tbody>
</table></div>
${
  passend
    ? `<p class="attribution">Namen und Profillinks von <a href="${esc(passend.quelle.attributionUrl)}" rel="external">abgeordnetenwatch.de</a>, lizenziert unter <a href="${esc(passend.quelle.lizenzLink)}" rel="license external">${esc(passend.quelle.lizenz)}</a>. Abgerufen am ${esc(deDate(passend.abgerufenAm.slice(0, 10)))}. Wahlkreisergebnisse vom ${esc(e.quelle.herausgeber)}.</p>`
    : ''
}`;
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
  const scale = Math.ceil(max / 5) * 5;
  const iv = p.trend.intervals ?? {};
  const threshold = p.cfg?.thresholdPercent ?? 5;
  const uncertain = entries.filter(
    ([party]) => party !== 'Sonstige' && iv[party] && iv[party].lower < threshold && iv[party].upper > threshold,
  );
  return `<div class="panel">
${entries.map(([party, value]) => bar(party, value, COLORS, scale, iv[party] ?? null)).join('')}
</div>
${
  p.trend.kish
    ? `<p class="lede">Fehlerbalken: 95-Prozent-Wilson-Intervall auf Basis eines effektiven Stichprobenumfangs von ${int(Math.round(p.trend.kish.effectiveSampleSize))}, berechnet nach Kish aus ${num(p.trend.kish.effectiveSurveys, 2)} effektiven Umfragen bei mittlerer Fallzahl ${int(Math.round(p.trend.kish.meanSampleSize))}. Designeffekt ${num(p.trend.designEffect, 2)}. Das ist die <strong>untere Schranke</strong> der Unsicherheit. Gewichtungsmodelle, Nonresponse und Hauseffekte sind darin nicht enthalten.</p>`
    : ''
}
${
  uncertain.length > 0
    ? note(
        'warn',
        'An der Sperrklausel nicht entscheidbar',
        `<p>Bei ${uncertain.map(([party, v]) => `<strong>${esc(party)}</strong> mit ${num(v)}&thinsp;% und einem Intervall von ${num(iv[party].lower)} bis ${num(iv[party].upper)}`).join(' sowie ')} schliesst das Konfidenzintervall die ${num(threshold, 0)}-Prozent-Huerde ein. Aus diesen Daten laesst sich der Einzug weder bejahen noch verneinen. Jede Sitzverteilung weiter unten setzt eine Entscheidung voraus, die die Daten nicht hergeben.</p>`,
      )
    : ''
}
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

  const dist = distribute(p.trend.values, p.cfg, { aggregateCategories: parliamentConfig.aggregateCategories });
  if (!dist) return '';
  const coalitions = findCoalitions(dist.seats, dist.majority).map((c) => ({
    ...c,
    seatsByParty: Object.fromEntries(c.parties.map((party) => [party, dist.seats[party]])),
  }));
  const seatRows = Object.entries(dist.seats)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  // Szenarien: was passiert, wenn knapp gescheiterte Parteien die Huerde doch nehmen.
  const nearMiss = Object.entries(p.trend.values)
    .filter(([party, v]) => party !== 'Sonstige' && v < dist.thresholdPercent && v >= dist.thresholdPercent - 2)
    .sort((a, b) => b[1] - a[1])
    .map(([party]) => party);

  const scenarios = [{ label: 'Basis', extra: [], note: 'Nur Parteien ueber der Sperrklausel.' }];
  for (const party of nearMiss) {
    scenarios.push({ label: `${party} zieht ein`, extra: [party], note: `${party} liegt im Trend bei ${num(p.trend.values[party])} Prozent und damit innerhalb der Fehlertoleranz zur Huerde.` });
  }
  if (nearMiss.length > 1) scenarios.push({ label: 'beide ziehen ein', extra: nearMiss, note: `${nearMiss.join(' und ')} nehmen die Huerde gemeinsam.` });

  const computed = scenarios
    .map((sc) => {
      const forced = { ...p.cfg, thresholdPercent: 0 };
      const eligible = {};
      for (const [party, v] of Object.entries(p.trend.values)) {
        if (party === 'Sonstige') continue;
        if (v >= dist.thresholdPercent || sc.extra.includes(party)) eligible[party] = v;
      }
      const d = distribute(eligible, forced, { aggregateCategories: parliamentConfig.aggregateCategories });
      return d ? { label: sc.label, note: sc.note, seats: d.seats } : null;
    })
    .filter(Boolean);

  // Ist die Wahl bereits gelaufen und das Ergebnis angebunden, ist diese
  // Rechnung eine Rueckschau: Was haette der Trend ergeben? Das ist
  // aufschlussreich, darf aber nicht wie eine offene Frage aussehen, wenn die
  // tatsaechliche Sitzverteilung weiter oben auf derselben Seite steht.
  const amtlich = wahlergebnisse.get(p.name);
  const rueckschau = Boolean(amtlich);

  return `<h2 id="sitze">${rueckschau ? 'Was die Umfragen fuer die Sitzverteilung bedeutet haetten' : 'Modellrechnung zur Sitzverteilung'}</h2>
${
  rueckschau
    ? note(
        'warn',
        'Rueckschau, nicht der Stand der Dinge',
        `<p>Diese Rechnung beruht auf den <strong>Umfragen vor der Wahl</strong>, nicht auf dem Ergebnis. Die tatsaechliche Sitzverteilung des am ${esc(deDate(amtlich.wahl.wahltag))} gewaehlten Landtags steht <a href="#amtlich">weiter oben</a>. Der Abschnitt bleibt stehen, weil der Vergleich zeigt, wie weit eine Sitzrechnung auf Umfragebasis vom Ergebnis abweichen kann.</p>`,
      )
    : ''
}
${note(
  'method',
  rueckschau ? 'Wie diese Modellrechnung entstand' : 'Modellrechnung, keine Prognose',
  `<p>Grundlage ist der oben stehende Trend, nicht ein Wahlergebnis. Verfahren: ${esc(dist.method === 'sainte-lague' ? 'Sainte-Lague/Schepers' : dist.method === 'hare-niemeyer' ? 'Hare/Niemeyer' : 'dHondt')}, Sperrklausel ${num(dist.thresholdPercent, 0)}&thinsp;%, ${int(dist.totalSeats)} Sitze, Rechtsgrundlage ${esc(p.cfg.rechtsgrundlage)}. ${dist.excludedParties.length > 0 ? `An der Sperrklausel scheitern im Modell: ${esc(dist.excludedParties.join(', '))}.` : ''} ${dist.removedAggregates.length > 0 ? `Nicht beruecksichtigt, weil Sammelposten mehrerer Parteien: ${esc(dist.removedAggregates.join(', '))}.` : ''} ${p.cfg.hinweis ? esc(p.cfg.hinweis) : ''}</p>`,
)}
${
  dist.ties.length > 1
    ? note('warn', 'Der letzte Sitz faellt durch einen Gleichstand', `<p>Bei ${esc(dist.ties.join(' und '))} ist die entscheidende Quote rechnerisch identisch. Dieses Programm vergibt den Sitz nach alphabetischer Reihenfolge, damit der Build reproduzierbar bleibt. Im Wahlrecht entscheidet in solchen Faellen das Los. Die Zuordnung dieses einen Sitzes ist hier also willkuerlich.</p>`)
    : ''
}
${hemicycle(dist.seats, { colors: COLORS, majority: dist.majority, totalSeats: dist.totalSeats })}
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
    : coalitionBars(coalitions, { colors: COLORS, totalSeats: dist.totalSeats, majority: dist.majority })
}
${
  computed.length > 1
    ? `<h3>Was die Sperrklausel entscheidet</h3>
<p class="lede">Dieselben Umfragewerte, unterschiedliche Sitzverteilung. Der Unterschied entsteht allein daraus, wie viele Stimmen an der Fuenfprozenthuerde verfallen und damit auf die verbleibenden Parteien umgelegt werden.</p>
${scenarioStrip(computed, { colors: COLORS, totalSeats: dist.totalSeats, majority: dist.majority })}
${note('warn', 'Warum das kein Detail ist', `<p>Die betroffenen Parteien liegen im Trend bei ${nearMiss.map((x) => `${esc(x)} ${num(p.trend.values[x])}`).join(', ')} Prozent. Der Abstand zur Huerde ist kleiner als die uebliche Fehlertoleranz einer Umfrage. Aus einer Sonntagsfrage laesst sich deshalb nicht ablesen, welches dieser Szenarien eintritt.</p>`)}`
    : ''
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
      // Liegt das amtliche Ergebnis vor, zeigt die Karte dieses und nicht den
      // Trend. Sonst stuenden auf der Startseite Umfragewerte, die durch ein
      // vorliegendes Wahlergebnis ueberholt sind, ohne dass das erkennbar
      // waere. Im Fall Sachsen-Anhalt lagen Trend und Ergebnis bei der CDU
      // knapp sechs Prozentpunkte auseinander.
      const amtlich = wahlergebnisse.get(p.name);
      if (amtlich) {
        const sammel = new Set(parliamentConfig.aggregateCategories.map((x) => x.toLowerCase()));
        const werte = Object.entries(amtlich.ergebnisProjektnamen)
          .filter(([party]) => !sammel.has(party.toLowerCase()))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4);
        return `<article class="card">
  <h3><a href="/parlament/${p.slug}/">${esc(p.name)}</a></h3>
  <p class="card-kicker">${esc(amtlich.wahl.bezeichnung)}, amtliches Ergebnis</p>
  ${werte.map(([party, v]) => bar(party, v, COLORS, 45)).join('')}
  <p>${int(amtlich.sitze.gesamt)} Sitze, gewaehlt am ${esc(deDate(amtlich.wahl.wahltag))}${amtlich.status.endgueltig ? '' : ' (vorlaeufig)'}</p>
</article>`;
      }

      const t = p.trend && !p.trend.insufficient ? Object.entries(p.trend.values).sort((a, b) => b[1] - a[1]).slice(0, 4) : [];
      return `<article class="card">
  <h3><a href="/parlament/${p.slug}/">${esc(p.name)}</a></h3>
  <p class="card-kicker">Sonntagsfrage, gewichteter Trend</p>
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
<p class="eyebrow">Stand ${esc(deDate(buildTime.slice(0, 10)))}${provenance.mode === 'archive' ? ` \u00b7 Archivstand Nr. ${esc(String(provenance.archiveSeq))} vom ${esc(deDate(provenance.recordedAt.slice(0, 10)))}` : ''}</p>
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
          `<li><a href="/parlament/${p.slug}/">${esc(p.name)}</a><span class="meta">${
            wahlergebnisse.has(p.name)
              ? `${esc(wahlergebnisse.get(p.name).wahl.bezeichnung)}, ${int(p.surveys.length)} Umfragen`
              : `${int(p.surveys.length)} Umfragen, ab ${esc(deDate(p.surveys.at(-1).date))}`
          }</span></li>`,
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
      // Liegt ein amtliches Ergebnis vor, ist es der wichtigste Inhalt der
      // Seite. Titel und Beschreibung muessen das nennen, sonst versprechen sie
      // eine Vorschau auf eine Wahl, die bereits stattgefunden hat.
      title: wahlergebnisse.has(p.name)
        ? wahlergebnisse.get(p.name).wahl.langbezeichnung
        : `Sonntagsfrage ${p.name}`,
      description: wahlergebnisse.has(p.name)
        ? `Amtliches Ergebnis der ${wahlergebnisse.get(p.name).wahl.bezeichnung} in ${p.name}: Zweitstimmen, Sitzverteilung, alle ${int(wahlergebnisse.get(p.name).wahlkreise.anzahl)} Wahlkreise. Dazu der Vergleich mit den ${int(p.surveys.length)} Umfragen vor der Wahl und die Abweichung je Institut.`
        : `Alle ${int(p.surveys.length)} verfuegbaren Umfragen zu ${p.name} mit Institut, Auftraggeber, Feldzeit und Fallzahl. Gewichteter Trend, Streuung und Quellenangabe je Wert.`,
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
${
  wahlergebnisse.has(p.name)
    ? `<h1>${esc(wahlergebnisse.get(p.name).wahl.langbezeichnung)}</h1>
<p class="lede">Das amtliche Ergebnis der Wahl vom ${esc(deDate(wahlergebnisse.get(p.name).wahl.wahltag))}, die Sitzverteilung im Landtag und alle ${int(wahlergebnisse.get(p.name).wahlkreise.anzahl)} Wahlkreise. Darunter die ${int(p.surveys.length)} Umfragen aus der Zeit davor und die Frage, wie nah sie am Ergebnis lagen.</p>`
    : `<h1>Sonntagsfrage ${esc(p.name)}</h1>
<p class="lede">${int(p.surveys.length)} Umfragen von ${int(institutesHere.length)} Instituten, aeltester Datensatz vom ${esc(deDate(p.surveys.at(-1).date))}, juengster vom ${esc(deDate(p.surveys[0].date))}.</p>`
}
${kpiBand(p)}
${amtlichesErgebnisBlock(p)}
${wahlkreisBlock(p)}
${genauigkeitsBlock(p)}
<h2 id="umfragen">Die Umfragen vor der Wahl</h2>
${timeline(p.surveys, { colors: COLORS, threshold: p.cfg?.thresholdPercent ?? 5 })}
${electionComparison(p)}
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
${surveyTable(p.surveys, { caption: `Veroeffentlichte Sonntagsfragen zu ${p.name}, absteigend nach Veroeffentlichungsdatum` })}
${electionHistory(p)}`,
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

// Anschrift des Verantwortlichen. Sie ist in der Datenschutzerklaerung optional:
// Artikel 13 Absatz 1 Buchstabe a DSGVO verlangt Identitaet und Kontaktdaten,
// also Name und eine erreichbare Adresse, nicht zwingend eine Postanschrift.
// Eine ladungsfaehige Anschrift verlangt dagegen Paragraf 5 DDG fuer das
// Impressum. Wer ohne Impressum betreibt (legal.renderImpressum false), hat
// diese Pflicht bewusst nicht erfuellt und soll hier keine leere oder erfundene
// Zeile ausgeben, sondern gar keine.
const v = site.legal.verantwortlicher;
const hatAnschrift = [v.strasse, v.plz, v.ort].every((f) => f && !String(f).includes('BITTE AUSFUELLEN'));
const anschriftZeile = hatAnschrift
  ? `<dt>Anschrift</dt><dd>${esc(v.strasse)}, ${esc(`${v.plz} ${v.ort}`)}, ${esc(v.land)}</dd>\n  `
  : '';

// Speicherdauer der Protokolldaten. Steht logRetentionDays auf 0, wird bewusst
// KEINE Frist behauptet. Weder Netlify noch Cloudflare veroeffentlichen eine
// konkrete Aufbewahrungsdauer, und eine erfundene Frist in einer
// Datenschutzerklaerung waere ein eigener Verstoss. Siehe config/site.json.
const speicherdauer =
  site.hosting.logRetentionDays > 0
    ? `${int(site.hosting.logRetentionDays)} Tage, danach automatische Loeschung durch den Anbieter.`
    : 'Die Protokolldaten entstehen ausschliesslich bei den unter Ziffer 4 genannten Anbietern. Diese veroeffentlichen keine feste Aufbewahrungsdauer, weshalb hier keine behauptet wird. Es gelten die Fristen aus deren Datenschutzerklaerungen, die unter Ziffer 4 verlinkt sind.';

for (const c of contentPages) {
  let html = await readFile(path.join(ROOT, 'content', c.file), 'utf8');
  html = html
    .replaceAll('{{VERANTWORTLICHER_NAME}}', esc(site.legal.verantwortlicher.name))
    .replaceAll('{{VERANTWORTLICHER_ANSCHRIFT}}', anschriftZeile)
    .replaceAll('{{VERANTWORTLICHER_STRASSE}}', esc(site.legal.verantwortlicher.strasse))
    .replaceAll('{{VERANTWORTLICHER_PLZ_ORT}}', esc(`${site.legal.verantwortlicher.plz} ${site.legal.verantwortlicher.ort}`))
    .replaceAll('{{VERANTWORTLICHER_LAND}}', esc(site.legal.verantwortlicher.land))
    .replaceAll('{{VERANTWORTLICHER_EMAIL}}', esc(site.legal.verantwortlicher.email))
    .replaceAll('{{VERANTWORTLICHER_TELEFON}}', esc(site.legal.verantwortlicher.telefon || 'nicht angegeben'))
    .replaceAll('{{AUFSICHTSBEHOERDE}}', esc(site.legal.aufsichtsbehoerde))
    .replaceAll('{{HOSTER}}', esc(site.hosting.anbieter))
    .replaceAll('{{HOSTER_DATENSCHUTZ}}', esc(site.hosting.anbieterDatenschutz))
    .replaceAll('{{HOSTER_AVV}}', esc(site.hosting.anbieterAvv))
    .replaceAll('{{CDN}}', esc(site.hosting.cdn))
    .replaceAll('{{CDN_DATENSCHUTZ}}', esc(site.hosting.cdnDatenschutz))
    .replaceAll('{{CDN_AVV}}', esc(site.hosting.cdnAvv))
    .replaceAll('{{SERVERSTANDORT}}', esc(site.hosting.serverstandort))
    .replaceAll('{{DRITTLAND_GRUNDLAGE}}', esc(site.hosting.drittlandGrundlage))
    .replaceAll('{{SPEICHERDAUER}}', speicherdauer)
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

  // Ein nicht ersetzter Platzhalter wuerde woertlich auf einer Rechtsseite
  // landen. Das ist kein Schoenheitsfehler, sondern eine fehlende Pflichtangabe.
  // Deshalb Abbruch statt stiller Ausgabe.
  const offen = [...new Set(html.match(/\{\{[A-Z_]+\}\}/g) ?? [])];
  if (offen.length > 0) {
    throw new Error(`${c.file}: nicht ersetzte Platzhalter ${offen.join(', ')}. Entweder fehlt der Wert in config/site.json oder die Ersetzung in build.mjs.`);
  }

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

      // WICHTIG: Die Lizenzangabe oben gilt fuer die Umfragedaten. Die
      // amtlichen Wahlergebnisse stehen unter einer anderen Rechtsstellung:
      // Als amtliche Werke nach Paragraf 5 UrhG sind sie gemeinfrei und
      // gerade NICHT Teil der ODbL-Datenbank. Sie stehen deshalb in einem
      // eigenen Block mit eigener Lizenzangabe. Wer beides in einen Topf
      // wirft, gibt die Lizenzlage beider Quellen falsch wieder.
      _lizenzhinweis:
        'license und attribution gelten fuer surveys und trends. Die amtlichen Ergebnisse unter elections tragen ihre eigene Rechtsstellung und unterliegen nicht der ODbL.',

      surveys: data.surveys,
      trends: Object.fromEntries(parliamentList.map((p) => [p.name, p.trend])),
      elections: Object.fromEntries(
        [...wahlergebnisse.entries()].map(([land, e]) => [
          land,
          {
            wahl: e.wahl,
            status: e.status,
            beteiligung: e.beteiligung,
            zweitstimmen: { stimmen: e.zweitstimmen.stimmen, anteilExakt: e.zweitstimmen.anteilExakt },
            erststimmen: { stimmen: e.erststimmen.stimmen, anteilExakt: e.erststimmen.anteilExakt },
            sitze: e.sitze,
            wahlkreise: e.wahlkreise,
            quelle: e.quelle,
          },
        ]),
      ),
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
