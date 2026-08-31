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
import { hemicycle, timeline, comparison, coalitionBars, scenarioStrip } from './lib/charts.mjs';
import { bereiteTermine, naechsteWahl, terminSlug, terminName, tageZwischen } from './lib/wahltermine.mjs';
import { nachkontrolle } from './lib/nachkontrolle.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

// Ausgabeverzeichnis und Bauzeitpunkt sind ueberschreibbar, damit die
// Selbsttests das Verhalten AN einem Wahltag und DANACH pruefen koennen,
// bevor der Tag da ist. Genau diese Zweige sind sonst erst am Wahlabend zum
// ersten Mal gelaufen - dem denkbar schlechtesten Zeitpunkt fuer einen
// Erstlauf. Beide Schalter sind ausdruecklich Testwerkzeug: WAHLWERK_BAUZEIT
// verschiebt nur die Zeitrechnung, es werden dadurch keine anderen Daten
// verwendet und keine Zahl veraendert. Ein Build mit gesetzter Bauzeit meldet
// sich laut, damit er nicht versehentlich veroeffentlicht wird.
const OUT = process.env.WAHLWERK_OUT ?? path.join(ROOT, 'dist');
const bauzeitOverride = process.env.WAHLWERK_BAUZEIT;
if (bauzeitOverride && Number.isNaN(Date.parse(bauzeitOverride))) {
  throw new Error(`WAHLWERK_BAUZEIT ist kein gueltiger Zeitpunkt: ${bauzeitOverride}`);
}
if (bauzeitOverride) {
  console.warn(`[TESTBUILD] Bauzeitpunkt kuenstlich auf ${bauzeitOverride} gesetzt. Diese Ausgabe darf nicht veroeffentlicht werden.`);
}

const site = JSON.parse(await readFile(path.join(ROOT, 'config', 'site.json'), 'utf8'));
const parliamentConfig = JSON.parse(await readFile(path.join(ROOT, 'config', 'parliaments.json'), 'utf8'));
const data = JSON.parse(await readFile(path.join(ROOT, 'data', 'surveys.json'), 'utf8'));
const electionConfig = JSON.parse(await readFile(path.join(ROOT, 'config', 'elections.json'), 'utf8'));
const provenance = JSON.parse(await readFile(path.join(ROOT, 'data', 'provenance.json'), 'utf8'));
const wahlterminConfig = JSON.parse(await readFile(path.join(ROOT, 'config', 'wahltermine.json'), 'utf8'));
const wahlleitungen = JSON.parse(await readFile(path.join(ROOT, 'config', 'wahlleitungen.json'), 'utf8'));

const COLORS = parliamentConfig.partyColors;
const isFixture = provenance.mode === 'fixture';
const buildTime = bauzeitOverride ? new Date(bauzeitOverride).toISOString() : new Date().toISOString();
const pages = [];

if (site.baseUrl.includes('example.invalid')) {
  console.warn('[WARNUNG] baseUrl steht noch auf dem Platzhalter. Canonical-Tags und Sitemap sind damit unbrauchbar. config/site.json anpassen.');
}

// ---------------------------------------------------------------- Datenaufbau

// Alter des Trend-Stichtags, gemessen am Bauzeitpunkt.
//
// Der Trend verankert sein Zeitfenster an der JUENGSTEN Umfrage des jeweiligen
// Parlaments, nicht an heute. Das ist fuer die Rechnung richtig, erzeugt aber
// eine Falle in der Darstellung: Zu einem Parlament, zu dem seit Jahren niemand
// mehr fragt, entsteht trotzdem ein vollbesetzter Trend, und die Seite schreibt
// "Trend" ueber Werte, die zwei Jahre alt sind. Das Europaparlament stand so mit
// dem Stand vom 07.06.2024 auf der Seite. Ab hier wird das Alter ausgewiesen.
const buildDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date(buildTime));
function stichtagAlterTage(anchorDate) {
  if (!anchorDate) return null;
  return Math.round((Date.parse(`${buildDay}T00:00:00Z`) - Date.parse(`${anchorDate}T00:00:00Z`)) / 86400000);
}

const byParliament = new Map();
for (const s of data.surveys) {
  if (!byParliament.has(s.parliament)) byParliament.set(s.parliament, []);
  byParliament.get(s.parliament).push(s);
}

// Die Umfragedatenbank fuehrt je Parlament einen langen Namen ("Landtag von
// Sachsen-Anhalt") und ein Kuerzel ("Sachsen-Anhalt"). config/parliaments.json
// ist auf die Kuerzel geschluesselt, byParliament dagegen auf den langen Namen,
// weil daraus Ueberschrift und Slug entstehen. Ohne diese Uebersetzung trifft
// nur der Bundestag zu, weil dort Name und Kuerzel zufaellig gleich sind. Alle
// 16 Laender fielen still in den Zweig "nicht verifiziert" und zeigten trotz
// verifizierter Regel keine Sitzverteilung.
const shortcutByName = new Map((data.parliaments ?? []).map((p) => [p.name, p.shortcut]));
const parliamentCfg = (name) =>
  parliamentConfig.parliaments[shortcutByName.get(name) ?? name] ??
  parliamentConfig.parliaments[name] ??
  null;

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

// Auftraggeber einer Umfrage. Bisher stand er zwar in jeder Tabelle und auf
// jeder Belegseite, war aber keine eigene Achse: Wer wissen wollte, welche
// Umfragen eine bestimmte Redaktion in Auftrag gegeben hat, konnte das nicht
// nachschlagen. Der Auftraggeber ist keine Nebensache, denn er entscheidet
// mit, welche Parlamente ueberhaupt abgefragt werden.
const byTasker = new Map();
for (const s of data.surveys) {
  const key = s.tasker ?? 'Auftraggeber nicht angegeben';
  if (!byTasker.has(key)) byTasker.set(key, []);
  byTasker.get(key).push(s);
}

// Erhebungsmethode. Telefon, Online und die Mischformen unterscheiden sich in
// ihren Verzerrungen deutlich. Der Bestand fuehrt die Angabe, die Seite hat
// sie bisher nicht auswertbar gemacht.
const byMethod = new Map();
for (const s of data.surveys) {
  const key = s.method ?? 'Unbekannt';
  if (!byMethod.has(key)) byMethod.set(key, []);
  byMethod.get(key).push(s);
}

// Chronologie. Der Bestand reicht ueber Jahre zurueck, erreichbar war davon
// aber nur der jeweils juengste Ausschnitt: die Tabellen brechen bei 200
// Zeilen ab. Beim Bau vom 31.08.2026 waren dadurch 1036 der 3918 Belegseiten
// von KEINER Seite aus verlinkt und nur ueber die Sitemap zu finden. Die
// Chronik schliesst diese Luecke, und scripts/check.mjs haelt sie zu.
const MONATSNAMEN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const byYear = new Map();
for (const s of data.surveys) {
  const tag = s.dateEnd ?? s.date;
  const jahr = tag.slice(0, 4);
  const monat = tag.slice(5, 7);
  if (!byYear.has(jahr)) byYear.set(jahr, new Map());
  const m = byYear.get(jahr);
  if (!m.has(monat)) m.set(monat, []);
  m.get(monat).push(s);
}
// Innerhalb eines Monats absteigend nach Feldende, damit die Chronik dieselbe
// Leserichtung hat wie jede andere Tabelle der Seite.
for (const monate of byYear.values()) {
  for (const liste of monate.values()) {
    liste.sort((a, b) => String(b.dateEnd ?? b.date).localeCompare(String(a.dateEnd ?? a.date)) || String(b.id).localeCompare(String(a.id)));
  }
}
const jahreAbsteigend = [...byYear.keys()].sort().reverse();

const parliamentList = [...byParliament.entries()]
  .map(([name, surveys]) => {
    const cfg = parliamentCfg(name);
    const trend = computeTrend(surveys, site.trend);
    return { name, slug: slug(name), surveys, cfg, trend, latest: surveys[0] };
  })
  .sort((a, b) => b.surveys.length - a.surveys.length);

// -------------------------------------------------------------- Wahltermine

// Kuerzel -> langer Name im Umfragebestand. Die Gegenrichtung von
// shortcutByName. config/wahltermine.json ist wie config/parliaments.json auf
// die Kuerzel geschluesselt; ohne diese Uebersetzung faende kein Termin sein
// Parlament. Genau dieser Fehlschlag hat am 27.08.2026 elf Tage lang die
// Sitzverteilung aller sechzehn Laender verschwinden lassen, deshalb wird ein
// fehlgehender Schluessel hier nicht verschluckt, sondern unten gemeldet.
const nameByShortcut = new Map((data.parliaments ?? []).map((p) => [p.shortcut, p.name]));

const termine = bereiteTermine(wahlterminConfig, buildDay, nameByShortcut);
const kommendeTermine = termine.filter((t) => t.phase === 'vorwahl' || t.phase === 'wahltag');
const naechste = naechsteWahl(termine);

// Ein Termin, dessen Parlament der Bestand nicht kennt, ist KEIN Abbruchgrund.
// Ein Testbuild laeuft bewusst auf einem reduzierten Bestand - die Fixture
// fuehrt drei Parlamente statt achtzehn -, und ein Generator, der daran
// scheitert, macht die Testdaten unbrauchbar. Der Kalender weist solche
// Termine schlicht ohne Verknuepfung aus. Dass beim ECHTEN Bestand jedes
// Kuerzel aufgeht, erzwingt stattdessen scripts/check.mjs; dort ist der
// richtige Ort dafuer, weil dort der Modus der Daten bekannt ist.
const unbekanntesParlament = termine.filter((t) => t.parlamentFehlt);
if (unbekanntesParlament.length > 0) {
  console.warn(
    `[Hinweis] ${unbekanntesParlament.length} Wahltermin(e) verweisen auf Parlamente, die dieser Datenbestand nicht fuehrt: ${[...new Set(unbekanntesParlament.map((t) => t.parlament))].join(', ')}. Sie erscheinen im Kalender ohne Verknuepfung.`,
  );
}

// Termine, zu denen es eine eigene Seite gibt: exakt datiert und mit einem
// Parlament, zu dem Umfragen vorliegen. Kommunalwahlen haben keine
// Sonntagsfrage und bekommen deshalb bewusst keine Seite, statt eine leere.
const terminSeiten = termine
  .filter((t) => t.datum && t.parlamentName && byParliament.has(t.parlamentName))
  .map((t) => ({ ...t, slug: terminSlug(t, slug), name: terminName(t) }));

const parliamentByName = new Map(parliamentList.map((p) => [p.name, p]));

// Nachkontrolle je Parlament: der Schlussstand der Umfragen vor der letzten
// Wahl gegen das amtliche Ergebnis. Sie ist nur moeglich, wo ein verifiziertes
// amtliches Ergebnis vorliegt. Wo nicht, bleibt der Platz leer und die Seite
// sagt warum. Das ist der Grundsatz des Projekts: lieber eine fehlende Zahl
// als eine geratene.
const aliasse = electionConfig.parteiAliasse ?? {};
const nachkontrollen = new Map();
for (const [kuerzel, wahl] of Object.entries(electionConfig.elections ?? {})) {
  if (!wahl.verified) continue;
  const name = nameByShortcut.get(kuerzel) ?? kuerzel;
  const surveys = byParliament.get(name);
  if (!surveys) continue;
  const nk = nachkontrolle(surveys, wahl, site.trend, aliasse);
  if (nk) nachkontrollen.set(name, nk);
}

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
  const e = electionConfig.elections[shortcutByName.get(p.name) ?? p.name];
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
${timeline(pseudo, { colors: COLORS, threshold: p.cfg?.thresholdPercent ?? null, parties })}
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
  const e = electionConfig.elections[shortcutByName.get(p.name) ?? p.name];
  if (!e || e.verified !== true || !p.trend || p.trend.insufficient) return '';
  return `<h2 id="vergleich">Vergleich mit der ${esc(e.label)}</h2>
${comparison(p.trend.values, e.results, {
    colors: COLORS,
    previousLabel: `${e.label} (${deDate(e.date)})`,
    currentLabel: `Trend ${deDate(p.trend.anchorDate)}`,
  })}
${e.hinweis ? note('method', 'Zur Einordnung', `<p>${esc(e.hinweis)}</p>`) : ''}`;
}

function trendBlock(p, { hatStreuung = false } = {}) {
  if (!p.trend) return '<p>Fuer dieses Parlament liegen keine datierten Umfragen vor.</p>';
  if (p.trend.insufficient) {
    return note(
      'warn',
      'Zu wenige Umfragen fuer einen Trend',
      `<p>Im Fenster von ${site.trend.maxAgeDays} Tagen um die juengste Umfrage vom ${esc(deDate(p.trend.anchorDate))} liegt nur ${int(p.trend.availableSurveys)} ${p.trend.availableSurveys === 1 ? 'Umfrage' : 'Umfragen'} vor, erforderlich sind ${int(p.trend.requiredSurveys)}. Es wird deshalb kein Mittelwert ausgewiesen. Die Einzelumfragen stehen unten.</p>
${
  p.cfg?.verified === true && p.cfg.seats
    ? `<p>Die Sitzzuteilung fuer ${esc(p.name)} <strong>ist</strong> verifiziert: ${int(p.cfg.seats)} Sitze, Verfahren ${esc(p.cfg.method === 'sainte-lague' ? 'Sainte-Lague/Schepers' : p.cfg.method === 'hare-niemeyer' ? 'Hare/Niemeyer' : 'dHondt')}, Sperrklausel ${num(p.cfg.thresholdPercent, 0)}&thinsp;Prozent, Rechtsgrundlage ${esc(p.cfg.rechtsgrundlage)}. Es fehlt also nicht die Regel, sondern die Datengrundlage. Sobald ${int(p.trend.requiredSurveys)} Umfragen innerhalb von ${site.trend.maxAgeDays} Tagen vorliegen, erscheint hier die Modellrechnung. Das ist typischerweise im Vorfeld der naechsten Landtagswahl der Fall.</p>`
    : ''
}`,
    );
  }
  const entries = Object.entries(p.trend.values).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map((e) => e[1]), 10);
  const scale = Math.ceil(max / 5) * 5;
  const iv = p.trend.intervals ?? {};
  // Kein Vorgabewert. Ist die Huerde unbekannt, wird keine behauptet: ein
  // eingesetztes "5" waere fuer das Europaparlament schlicht falsch.
  const threshold = p.cfg?.thresholdPercent ?? null;
  const uncertain = entries.filter(
    ([party]) => party !== 'Sonstige' && iv[party] && iv[party].lower < threshold && iv[party].upper > threshold,
  );
  return `<div class="panel">
${entries.map(([party, value]) => bar(party, value, COLORS, scale, iv[party] ?? null)).join('')}
</div>
${
  p.trend.kish
    ? `<p class="lede">Fehlerbalken: 95-Prozent-Wilson-Intervall auf Basis eines effektiven Stichprobenumfangs von ${int(Math.round(p.trend.kish.effectiveSampleSize))}, berechnet nach Kish aus ${num(p.trend.kish.effectiveSurveys, 2)} effektiven Umfragen bei mittlerer Fallzahl ${int(Math.round(p.trend.kish.meanSampleSize))}. Designeffekt ${num(p.trend.designEffect, 2)}. Bei annaehernd gleichen Gewichten entspricht diese Zahl fast der Summe der Befragten: gerechnet wird so, als waeren alle Befragten eine einzige Zufallsstichprobe. Das ist die <strong>untere Schranke</strong> der Unsicherheit. Die Abweichung zwischen den Instituten, Gewichtungsmodelle, Nonresponse und Hauseffekte sind darin nicht enthalten.${hatStreuung ? ' Wie weit die Institute tatsaechlich auseinanderliegen, steht unter <a href="#streuung">Streuung zwischen den Instituten</a>.' : ''}</p>`
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
<p class="lede">Stichtag ${esc(deDate(p.trend.anchorDate))}${(() => { const a = stichtagAlterTage(p.trend.anchorDate); return a === null ? '' : a <= 1 ? ', also von gestern oder heute' : `, das sind ${int(a)} Tage vor diesem Seitenstand`; })()}. Summe der Werte ${num(p.trend.sum)}&thinsp;%. Abweichungen von 100 entstehen durch die Mittelung ueber Umfragen mit unterschiedlichem Parteienausweis und werden nicht wegnormiert.</p>
${(() => {
  const a = stichtagAlterTage(p.trend.anchorDate);
  const fenster = p.trend.parameters?.maxAgeDays ?? 45;
  if (a === null || a <= fenster) return '';
  return note('warn', 'Dieser Trend ist nicht aktuell', `<p>Die juengste Umfrage zu ${esc(p.name)} endete am ${esc(deDate(p.trend.anchorDate))} und ist damit <strong>${int(a)} Tage</strong> alt. Das Zeitfenster des Trends von ${int(fenster)} Tagen liegt vollstaendig in der Vergangenheit; die Werte beschreiben die Stimmung von damals, nicht die von heute. Sie stehen hier, weil sie belegt sind, nicht weil sie aktuell waeren.</p>`);
})()}
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

// Der erklaerende Satz unter dem Szenarienstreifen behauptete frueher pauschal,
// der Abstand zur Huerde sei "kleiner als die uebliche Fehlertoleranz". Das war
// fuer Parteien, deren eigenes Konfidenzintervall die Huerde gar nicht beruehrt,
// schlicht falsch und widersprach dem Fehlerbalken weiter oben auf derselben
// Seite. Jetzt wird getrennt: gezeigt wird ein weiter Korridor, behauptet wird
// Unentscheidbarkeit nur dort, wo das Intervall die Huerde tatsaechlich kreuzt.
function schwellenSatz(p, dist, nearMiss, nearHit) {
  const iv = p.trend.intervals ?? {};
  const alle = [...nearMiss, ...nearHit];
  const kreuzt = alle.filter((x) => iv[x] && iv[x].lower < dist.thresholdPercent && iv[x].upper > dist.thresholdPercent);
  const daneben = alle.filter((x) => !kreuzt.includes(x));
  const liste = (xs) => xs.map((x) => `${esc(x)} ${num(p.trend.values[x])}&thinsp;%`).join(', ');
  const teile = [];
  teile.push(`<p>Gezeigt werden Parteien, die im Trend hoechstens zwei Prozentpunkte von der Sperrklausel entfernt liegen: ${liste(alle)}.</p>`);
  if (kreuzt.length > 0) {
    teile.push(`<p>Bei ${liste(kreuzt)} ueberschneidet sich das 95-Prozent-Intervall mit der Huerde. Fuer diese Parteien ist aus den vorliegenden Umfragen <strong>nicht entscheidbar</strong>, auf welcher Seite sie landen.</p>`);
  }
  if (daneben.length > 0) {
    teile.push(`<p>Bei ${liste(daneben)} liegt die Huerde ausserhalb des berechneten Intervalls. Das Szenario steht trotzdem hier, weil dieses Intervall die <strong>untere Schranke</strong> der Unsicherheit ist: Hauseffekte, Gewichtungsmodelle und Nonresponse sind darin nicht enthalten, und die mittlere Abweichung der Institute vom amtlichen Ergebnis liegt erfahrungsgemaess darueber.</p>`);
  }
  return teile.join('');
}

  // Szenarien rund um die Sperrklausel.
  //
  // Die Huerde wirkt in BEIDE Richtungen, und beide Richtungen sind gleich
  // folgenreich. Bis zum 27.08.2026 rechnete dieser Abschnitt nur den Fall
  // "knapp gescheiterte Partei nimmt die Huerde doch". Der umgekehrte Fall,
  // eine knapp eingezogene Partei verfehlt sie, fehlte vollstaendig, obwohl er
  // die Sitzverteilung staerker veraendert: die Stimmen der ausgeschiedenen
  // Partei werden auf die verbleibenden umgelegt, was vor allem der staerksten
  // Kraft zugutekommt. In Sachsen-Anhalt entschied genau dieser Fall darueber,
  // ob die staerkste Partei die absolute Mehrheit allein erreicht. Ein Modell,
  // das nur eine Richtung zeigt, stellt die Lage schief dar.
  const band = 2;
  const kandidaten = Object.entries(p.trend.values).filter(([party]) => party !== 'Sonstige');

  // knapp darunter: koennten einziehen
  const nearMiss = kandidaten
    .filter(([, v]) => v < dist.thresholdPercent && v >= dist.thresholdPercent - band)
    .sort((a, b) => b[1] - a[1])
    .map(([party]) => party);

  // knapp darueber: koennten herausfallen
  const nearHit = kandidaten
    .filter(([, v]) => v >= dist.thresholdPercent && v <= dist.thresholdPercent + band)
    .sort((a, b) => a[1] - b[1])
    .map(([party]) => party);

  const scenarios = [{ label: 'Basis', extra: [], drop: [], note: 'Nur Parteien ueber der Sperrklausel.' }];
  for (const party of nearMiss) {
    scenarios.push({ label: `${party} zieht ein`, extra: [party], drop: [], note: `${party} liegt im Trend bei ${num(p.trend.values[party])} Prozent und damit innerhalb der Fehlertoleranz zur Huerde.` });
  }
  if (nearMiss.length > 1) scenarios.push({ label: 'beide ziehen ein', extra: nearMiss, drop: [], note: `${nearMiss.join(' und ')} nehmen die Huerde gemeinsam.` });
  for (const party of nearHit) {
    scenarios.push({ label: `${party} verfehlt die Huerde`, extra: [], drop: [party], note: `${party} liegt im Trend bei ${num(p.trend.values[party])} Prozent und damit ebenfalls innerhalb der Fehlertoleranz zur Huerde, nur von der anderen Seite. Faellt die Partei heraus, werden ihre Stimmen auf die verbleibenden umgelegt.` });
  }
  if (nearHit.length > 1) scenarios.push({ label: 'beide verfehlen die Huerde', extra: [], drop: nearHit, note: `${nearHit.join(' und ')} scheitern gemeinsam an der Huerde.` });

  const computed = scenarios
    .map((sc) => {
      const forced = { ...p.cfg, thresholdPercent: 0 };
      const eligible = {};
      for (const [party, v] of Object.entries(p.trend.values)) {
        if (party === 'Sonstige') continue;
        if ((sc.drop ?? []).includes(party)) continue;
        if (v >= dist.thresholdPercent || sc.extra.includes(party)) eligible[party] = v;
      }
      const d = distribute(eligible, forced, { aggregateCategories: parliamentConfig.aggregateCategories });
      return d ? { label: sc.label, note: sc.note, seats: d.seats } : null;
    })
    .filter(Boolean);

  return `<h2 id="sitze">Modellrechnung zur Sitzverteilung</h2>
${note(
  'method',
  'Modellrechnung, keine Prognose',
  `<p>Grundlage ist der oben stehende Trend, nicht ein Wahlergebnis. Verfahren: ${esc(dist.method === 'sainte-lague' ? 'Sainte-Lague/Schepers' : dist.method === 'hare-niemeyer' ? 'Hare/Niemeyer' : 'dHondt')}, Sperrklausel ${num(dist.thresholdPercent, 0)}&thinsp;%, ${int(dist.totalSeats)} Sitze, Rechtsgrundlage ${esc(p.cfg.rechtsgrundlage)}. ${dist.excludedParties.length > 0 ? `An der Sperrklausel scheitern im Modell: ${esc(dist.excludedParties.join(', '))}.` : ''} ${dist.exemptedParties?.length > 0 ? `<strong>Von der Sperrklausel ausgenommen und deshalb trotz eines Werts unter ${num(dist.thresholdPercent, 0)}&thinsp;Prozent beruecksichtigt: ${esc(dist.exemptedParties.join(', '))}.</strong>` : ''} ${dist.removedAggregates.length > 0 ? `Nicht beruecksichtigt, weil Sammelposten mehrerer Parteien: ${esc(dist.removedAggregates.join(', '))}.` : ''} ${p.cfg.hinweis ? esc(p.cfg.hinweis) : ''}</p>`,
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
<p class="lede">Dieselben Umfragewerte, unterschiedliche Sitzverteilung. Der Unterschied entsteht allein daraus, wie viele Stimmen an der Sperrklausel von ${num(dist.thresholdPercent, 0)}&thinsp;Prozent verfallen und damit auf die verbleibenden Parteien umgelegt werden.</p>
${scenarioStrip(computed, { colors: COLORS, totalSeats: dist.totalSeats, majority: dist.majority })}
${note('warn', 'Warum das kein Detail ist', schwellenSatz(p, dist, nearMiss, nearHit))}`
    : ''
}`;
}

// ------------------------------------------------------------------- Seiten

function addPage(url, html, { priority = 0.5, changefreq = 'weekly', lastmod = buildTime } = {}) {
  pages.push({ url, html, priority, changefreq, lastmod });
}

/**
 * Wahlhinweis auf der Startseite. Steht bewusst oben: wenn in wenigen Tagen
 * gewaehlt wird, ist das die wichtigste Angabe der ganzen Seite.
 *
 * Die Ueberschrift richtet sich nach dem NAECHSTEN Termin ueberhaupt, nicht
 * nach dem naechsten, zu dem es hier Umfragen gibt. Beides faellt regelmaessig
 * auseinander: Kommunalwahlen haben keine Sonntagsfrage und damit keine eigene
 * Seite. Wuerde die Startseite den naechsten Termin MIT Seite als "naechste
 * Wahl" ausgeben, widerspraeche sie ab dem 07.09.2026 dem eigenen Wahlkalender,
 * der dann die niedersaechsische Kommunalwahl am 13.09. als naechste fuehrt.
 */
function startseiteWahlen() {
  const anstehend = terminSeiten.filter((t) => t.phase === 'vorwahl' || t.phase === 'wahltag').slice(0, 3);
  if (anstehend.length === 0) return '';

  const tage = (t) => (t.phase === 'wahltag' ? 'heute' : `in ${int(t.tageBis)} ${t.tageBis === 1 ? 'Tag' : 'Tagen'}`);
  const eintrag = (t) =>
    `<li><a href="/wahl/${t.slug}/">${esc(t.name)}</a><span class="meta">${esc(deDate(t.datum))} &middot; ${t.phase === 'wahltag' ? '<strong>heute</strong>' : `noch <strong>${int(t.tageBis)}</strong> ${t.tageBis === 1 ? 'Tag' : 'Tage'}`}</span></li>`;

  // Ist der naechste Termin ueberhaupt zugleich der naechste mit eigener Seite?
  const gleich = naechste && anstehend[0] && naechste.datum === anstehend[0].datum && naechste.land === anstehend[0].land && naechste.art === anstehend[0].art;

  const kopf = gleich
    ? `<strong>${anstehend[0].phase === 'wahltag' ? 'Heute wird gewaehlt.' : `Naechste Wahl ${tage(anstehend[0])}.`}</strong>`
    : `<strong>Naechste Wahl ${tage(naechste)}: ${esc(terminName(naechste))}.</strong> Dazu gibt es keine Sonntagsfrage und deshalb hier keine Seite. Als naechstes mit Umfragen im Bestand:`;

  return `<aside class="wahlband${(gleich ? anstehend[0] : naechste).phase === 'wahltag' ? ' wahlband-heute' : ' wahlband-vor'} wahlband-gross">
  <p>${kopf} Gezaehlt ab dem Bautag dieser Seite, ${esc(deDate(buildDay))}.</p>
  <ul class="linklist">${anstehend.map(eintrag).join('')}</ul>
  <p><a href="/wahlen/">Vollstaendiger Wahlkalender</a> &middot; <a href="/chronik/">Chronik aller ${int(data.surveys.length)} Umfragen</a></p>
</aside>`;
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
<p class="eyebrow">Stand ${esc(deDate(buildTime.slice(0, 10)))}${provenance.mode === 'archive' ? ` \u00b7 Archivstand Nr. ${esc(String(provenance.archiveSeq))} vom ${esc(deDate(provenance.recordedAt.slice(0, 10)))}` : ''}</p>
<h1>${esc(site.tagline)}</h1>
<p class="lede">${esc(site.description)}</p>
${startseiteWahlen()}
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
${
  // Steht eine Wahl zu diesem Parlament an, gehoert der Hinweis nach oben und
  // nicht ans Seitenende: er aendert, wie die Zahlen darunter zu lesen sind.
  (() => {
    const t = terminSeiten.find((x) => x.parlamentName === p.name && (x.phase === 'vorwahl' || x.phase === 'wahltag'));
    if (t) {
      const rest = t.phase === 'wahltag' ? '<strong>Heute wird gewaehlt.</strong>' : `Gewaehlt wird in <strong>${int(t.tageBis)} ${t.tageBis === 1 ? 'Tag' : 'Tagen'}</strong>.`;
      return `<p class="wahlband${t.phase === 'wahltag' ? ' wahlband-heute' : ''}">${rest} <a href="/wahl/${t.slug}/">${esc(t.name)}</a> am ${esc(deDate(t.datum))} &ndash; dort stehen Modellrechnung, Szenarien und die Nachkontrolle der letzten Wahl. Stand dieses Seitenbaus: ${esc(deDate(buildDay))}.</p>`;
    }
    // Und danach. Ohne diesen Zweig stuende am Tag nach einer Wahl auf der
    // Parlamentsseite weiterhin ein Trend mit Sitzmodell, als stuende die Wahl
    // noch bevor - obwohl das Ergebnis laengst feststeht und die Umfragen
    // darunter samt und sonders von davor stammen. Die Frist von 120 Tagen
    // begrenzt den Hinweis auf die Zeit, in der er noch etwas erklaert.
    const vergangen = terminSeiten
      .filter((x) => x.parlamentName === p.name && x.phase === 'nachwahl' && Math.abs(x.tageBis) <= 120)
      .sort((a, b) => b.datum.localeCompare(a.datum))[0];
    if (!vergangen) return '';
    const her = Math.abs(vergangen.tageBis);
    return `<p class="wahlband wahlband-nach">Am ${esc(deDate(vergangen.datum))} wurde gewaehlt, vor ${int(her)} ${her === 1 ? 'Tag' : 'Tagen'}. <strong>Die Zahlen auf dieser Seite sind Umfragen, nicht das Ergebnis</strong>, und die juengsten davon stammen aus der Zeit davor. Was die Umfragen erwarten liessen und wie es ausgegangen ist, steht auf der Seite zur <a href="/wahl/${vergangen.slug}/">${esc(vergangen.name)}</a>. Stand dieses Seitenbaus: ${esc(deDate(buildDay))}.</p>`;
  })()
}
${kpiBand(p)}
${timeline(p.surveys, { colors: COLORS, threshold: p.cfg?.thresholdPercent ?? null })}
${electionComparison(p)}
${belegstreifen(p.surveys)}
<h2 id="trend">Gewichteter Trend</h2>
${trendBlock(p, { hatStreuung: Object.keys(spread).length > 0 })}
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
${
  // Nachkontrolle nur, wo sie wirklich gerechnet werden kann. Ein Kasten
  // "liegt nicht vor" auf siebzehn Parlamentsseiten waere Laerm; auf der
  // Wahlseite dagegen ist die Angabe tragend und steht dort immer.
  nachkontrollen.get(p.name)?.moeglich ? nachkontrollBlock(nachkontrollen.get(p.name), p.name) : ''
}
<h2 id="alle">Alle Umfragen</h2>
<p>Diese Tabelle zeigt die juengsten Umfragen. Der vollstaendige Bestand ist nach Monaten geordnet ueber die <a href="/chronik/">Chronik</a> erreichbar, jede einzelne Umfrage mit eigener Belegseite.</p>
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
${note('method', 'Warum manche Parteien fehlen', '<p>Ob eine Partei einzeln ausgewiesen wird, entscheidet das jeweilige Institut, nicht diese Seite. Wird eine Partei nicht ausgewiesen, geht sie in der Regel in der Kategorie Sonstige auf. Ein fehlender Wert bedeutet deshalb <strong>nicht</strong> null Prozent und wird hier auch nicht als solcher behandelt.</p>', { level: 2 })}
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
<ul class="linklist">${perParliament.map(({ p, value }) => `<li><a href="/parlament/${p.slug}/">${esc(p.name)}</a><span class="meta">${num(value)}&thinsp;% im Trend, Stichtag ${esc(deDate(p.trend.anchorDate))}${(() => { const a = stichtagAlterTage(p.trend.anchorDate); const f = p.trend.parameters?.maxAgeDays ?? 45; return a !== null && a > f ? ` (veraltet, ${int(a)} Tage)` : ''; })()}</span></li>`).join('')}</ul>`
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

// ------------------------------------------------------------- Wahltermine

/**
 * Statusband einer Wahl. Der einzige Zeitbezug, den eine statische Seite
 * ehrlich herstellen kann, ist der Bautag. Er wird deshalb immer mitgenannt.
 * Ein Countdown ohne Bautag waere eine Behauptung ueber den Moment des Lesens,
 * und den kennt diese Seite nicht.
 */
function statusBand(t, ergebnisLiegtVor = false) {
  const tag = `<time datetime="${esc(t.datum)}">${esc(deDate(t.datum))}</time>`;
  if (t.phase === 'wahltag') {
    return ergebnisLiegtVor
      ? `<p class="wahlband wahlband-heute"><strong>Heute wurde gewaehlt</strong>, und das amtliche Ergebnis ist bereits verifiziert eingetragen. ${tag}. Stand dieses Seitenbaus: ${esc(deDate(buildDay))}.</p>`
      : `<p class="wahlband wahlband-heute"><strong>Heute wird gewaehlt.</strong> ${tag}. Stand dieses Seitenbaus: ${esc(deDate(buildDay))}.</p>`;
  }
  if (t.phase === 'vorwahl') {
    const d = t.tageBis;
    return `<p class="wahlband wahlband-vor"><strong>Noch ${int(d)} ${d === 1 ? 'Tag' : 'Tage'}</strong> bis zur Wahl am ${tag}. Gezaehlt ab dem Bautag dieser Seite, ${esc(deDate(buildDay))}. Wird die Seite nicht neu gebaut, altert diese Angabe.</p>`;
  }
  const her = Math.abs(t.tageBis);
  return `<p class="wahlband wahlband-nach">Gewaehlt wurde am ${tag}, vor ${int(her)} ${her === 1 ? 'Tag' : 'Tagen'} (Stand ${esc(deDate(buildDay))}).</p>`;
}

/**
 * Nachkontrolle: der Schlussstand der Umfragen gegen das amtliche Ergebnis.
 *
 * Dieser Abschnitt ist der Grund, warum die Seite ueberhaupt Umfragen zeigt.
 * Eine Sonntagsfrage laesst sich pruefen, sobald gewaehlt wurde, und diese
 * Pruefung faellt regelmaessig unangenehm aus. Sie wird hier nicht weggelassen
 * und nicht relativiert, aber auch nicht ueberdehnt: ein einzelner Abgleich
 * ist ein Datenpunkt, kein Beweis fuer ein System.
 */
function nachkontrollBlock(nk, parlamentName, { ueberschrift = 'h2', id = 'nachkontrolle' } = {}) {
  const H = ueberschrift;
  if (!nk) {
    return `<${H} id="${id}">Nachkontrolle</${H}>
${note('warn', 'Kein verifiziertes amtliches Ergebnis im Bestand', `<p>Zu ${esc(parlamentName)} ist in <code>config/elections.json</code> kein amtliches Wahlergebnis verifiziert hinterlegt. Ohne dieses Ergebnis laesst sich nicht messen, wie weit die Umfragen beim letzten Mal danebenlagen. Der Abschnitt bleibt deshalb leer, statt einen Vergleich mit einer ungeprueften Zahl zu zeigen. Ein Ergebnis wird erst aufgenommen, wenn es von mindestens zwei unabhaengigen Quellen uebereinstimmend belegt oder von der Landeswahlleitung unmittelbar bestaetigt ist.</p>`)}`;
  }
  if (!nk.moeglich) {
    return `<${H} id="${id}">Nachkontrolle</${H}>
${note('warn', 'Nachkontrolle nicht moeglich', `<p>Zwar liegt ein amtliches Ergebnis vor, aber der Umfragebestand traegt ${esc(nk.grund)}. Ein Vergleich waere damit nicht belastbar und unterbleibt.</p>`)}`;
  }

  const vz = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${num(Math.abs(v))}`;
  const zeilen = nk.zeilen
    .map(
      (z) => `<tr>
  <td class="left">${esc(z.partei)}</td>
  <td>${num(z.umfrage)}</td>
  <td>${num(z.amtlich)}</td>
  <td class="num ${z.abweichung > 0 ? 'ab-plus' : z.abweichung < 0 ? 'ab-minus' : ''}">${vz(z.abweichung)}</td>
  <td>${z.imIntervall === null ? 'n.a.' : z.imIntervall ? 'ja' : 'nein'}</td>
</tr>`,
    )
    .join('');

  const g = nk.groesster;
  return `<${H} id="${id}">Nachkontrolle: was die Umfragen beim letzten Mal wert waren</${H}>
<p class="lede">Am ${esc(deDate(nk.wahldatum))} wurde tatsaechlich gewaehlt. Damit laesst sich nachrechnen, wie gut der Umfragestand kurz davor das Ergebnis getroffen hat. Verglichen wird der Trend mit <strong>demselben Verfahren und denselben Parametern</strong>, die diese Seite ueberall verwendet, gerechnet auf dem Stand vom ${esc(deDate(nk.stichtag))} &ndash; ${int(nk.tageVorDerWahl)} ${nk.tageVorDerWahl === 1 ? 'Tag' : 'Tage'} vor der Wahl. Es wurde kein nachtraeglich guenstigeres Verfahren gewaehlt.</p>
<dl class="kpis">
  <div class="kpi"><dt>Mittlerer absoluter Fehler</dt><dd>${num(nk.mittlererFehler, 2)}<span class="kpi-sub">Prozentpunkte, Mittel der Betraege ueber ${int(nk.zeilen.length)} Parteien &ndash; Vorzeichen heben sich dabei NICHT auf</span></dd></div>
  <div class="kpi"><dt>Groesste Abweichung</dt><dd>${vz(g.abweichung)}<span class="kpi-sub">bei ${esc(g.partei)}: Umfragen ${num(g.umfrage)}, amtlich ${num(g.amtlich)}</span></dd></div>
  <div class="kpi"><dt>Im 95-%-Intervall</dt><dd>${int(nk.imIntervallAnteil)} von ${int(nk.imIntervallGeprueft)}<span class="kpi-sub">Parteien, deren Ergebnis das Intervall der Umfragen traf</span></dd></div>
</dl>
<div class="table-scroll"><table>
<caption>Trend kurz vor der Wahl gegen das amtliche Ergebnis. Ein positives Vorzeichen heisst: die Umfragen lagen ueber dem spaeteren Ergebnis.</caption>
<thead><tr><th class="left" scope="col">Partei</th><th scope="col">Umfragen</th><th scope="col">amtlich</th><th scope="col">Abweichung</th><th scope="col">im 95-%-Intervall</th></tr></thead>
<tbody>${zeilen}</tbody>
</table></div>
${
  nk.ohneUmfragewert.length > 0
    ? note('warn', 'Nicht zuordenbare Parteien', `<p>Zu ${nk.ohneUmfragewert.map((o) => `<strong>${esc(o.partei)}</strong> (gesucht als ${esc(o.gesuchtAls)})`).join(', ')} fand sich im Umfragebestand kein Wert. Diese Parteien gehen NICHT in den mittleren Fehler ein. Sie werden hier genannt, weil ein stilles Weglassen den Fehler zu guenstig aussehen liesse.</p>`)
    : ''
}
${
  nk.ohneAmtlichenWert.length > 0
    ? note('warn', 'Ohne amtlichen Vergleichswert', `<p>${nk.ohneAmtlichenWert.map((o) => `<strong>${esc(o.partei)}</strong> (${num(o.umfrage)}&thinsp;%)`).join(', ')} wurde von den Umfragen ausgewiesen, im amtlichen Ergebnis aber nicht einzeln gefuehrt. Auch diese Werte bleiben aussen vor.</p>`)
    : ''
}
<p>Grundlage waren ${int(nk.verwendeteUmfragen.length)} Umfragen: ${nk.verwendeteUmfragen.map((u) => `${esc(u.institute ?? 'Institut unbekannt')} (Feldende ${esc(deDate(u.dateEnd))})`).join(', ')}.</p>
${note('method', 'Was dieser Vergleich aussagt und was nicht', `<p>Der Trend mittelt ueber Institute. Eine Abweichung des Mittelwertes ist deshalb <strong>kein Fehler eines bestimmten Instituts</strong>, und diese Seite leitet daraus keine Bewertung einzelner Haeuser ab. Ein einzelner Wahlabgleich ist ausserdem ein einzelner Datenpunkt: er belegt keine systematische Verzerrung, sondern zeigt, wie gross der Abstand in diesem Fall war.</p><p>Das ausgewiesene 95-Prozent-Intervall bildet nur den Stichprobenfehler ab. Verzerrungen durch Gewichtung, Nonresponse und spaete Meinungsaenderungen stecken nicht darin. Ein Ergebnis ausserhalb des Intervalls ist deshalb <strong>zu erwarten</strong> und kein Beleg fuer Schlamperei; ein Ergebnis innerhalb ist kein Guetesiegel. Der Designeffekt steht in dieser Rechnung auf ${num(site.trend.designEffect, 1)} und ist damit die untere Schranke der Unsicherheit.</p>`)}`;
}

// Wahlkalender
{
  const mitDatum = termine.filter((t) => t.datum);
  const ohneDatum = termine.filter((t) => !t.datum);

  const zeile = (t) => {
    const seite = terminSeiten.find((x) => x.slug === terminSlug(t, slug));
    const bezeichnung = seite ? `<a href="/wahl/${seite.slug}/">${esc(terminName(t))}</a>` : esc(terminName(t));
    const rest =
      t.phase === 'vorwahl'
        ? `noch ${int(t.tageBis)} ${t.tageBis === 1 ? 'Tag' : 'Tage'}`
        : t.phase === 'wahltag'
          ? 'heute'
          : t.datum
            ? 'vorbei'
            : '&ndash;';
    const bestand = t.parlamentName && byParliament.has(t.parlamentName)
      ? `<a href="/parlament/${slug(t.parlamentName)}/">${int(byParliament.get(t.parlamentName).length)} Umfragen</a>`
      : t.parlament
        ? 'keine Umfragen im Bestand'
        : 'keine Sonntagsfrage';
    return `<tr>
  <td class="left">${t.datum ? `<time datetime="${esc(t.datum)}">${esc(deDate(t.datum))}</time>` : `${esc(t.zeitraum)} ${esc(String(t.jahr))}`}</td>
  <td class="left">${bezeichnung}</td>
  <td class="left">${esc(t.land)}</td>
  <td class="left">${esc(t.turnus ?? 'n.a.')}</td>
  <td class="left">${rest}</td>
  <td class="left">${bestand}</td>
</tr>`;
  };

  const tabelle = (liste, caption) => `<div class="table-scroll"><table>
<caption>${esc(caption)}</caption>
<thead><tr><th class="left" scope="col">Termin</th><th class="left" scope="col">Wahl</th><th class="left" scope="col">Land</th><th class="left" scope="col">Turnus</th><th class="left" scope="col">Abstand</th><th class="left" scope="col">Umfragen</th></tr></thead>
<tbody>${liste.map(zeile).join('')}</tbody>
</table></div>`;

  addPage(
    '/wahlen/',
    page({
      site,
      url: '/wahlen/',
      title: 'Wahlkalender',
      description: `${int(termine.length)} Wahltermine in Deutschland nach der amtlichen Uebersicht der Bundeswahlleiterin, mit Abstand zum Bautag dieser Seite und Verknuepfung zu den Umfragen.`,
      breadcrumbs: [{ label: 'Start', url: '/' }, { label: 'Wahlkalender', url: '/wahlen/' }],
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Wahlkalender',
          url: `${site.baseUrl}/wahlen/`,
          inLanguage: 'de-DE',
        },
      ],
      body: `${fixtureBanner()}
<h1>Wahlkalender</h1>
<p class="lede">${int(mitDatum.length)} Termine stehen mit genauem Datum fest, ${int(ohneDatum.length)} weitere sind bisher nur nach Jahreszeit bekannt. Uebernommen aus der amtlichen Uebersicht der Bundeswahlleiterin, abgerufen am ${esc(deDate(wahlterminConfig._abgerufen))}.</p>
${naechste ? statusBand(naechste).replace('<p class="wahlband', '<p class="wahlband wahlband-gross') : ''}
${note('method', 'Vorbehalt der Quelle, woertlich', `<p>&bdquo;${esc(wahlterminConfig._vorbehaltDerQuelle)}&ldquo;</p><p>Wahlwerk gibt diesen Vorbehalt unveraendert weiter. Wo die Bundeswahlleiterin nur eine Jahreszeit nennt, steht hier eine Jahreszeit und kein ausgedachtes Datum.</p>`, { level: 2 })}
<h2 id="fest">Termine mit festem Datum</h2>
${tabelle(mitDatum, 'Wahltermine mit amtlich bekanntgegebenem Datum, chronologisch')}
<h2 id="grob">Termine ohne festes Datum</h2>
<p>Fuer diese Wahlen nennt die Quelle bisher nur eine Jahreszeit. Sie erhalten deshalb keine eigene Seite und keinen Countdown.</p>
${tabelle(ohneDatum, 'Wahltermine, fuer die noch kein Tag bekanntgegeben wurde')}
<p><a href="${esc(wahlterminConfig._quelle)}" rel="external">Quelle: Die Bundeswahlleiterin, Kuenftige Wahltermine</a></p>`,
    }),
    { priority: 0.9, changefreq: 'daily' },
  );
}

/**
 * Abschnitt zur Sitzverteilung auf einer Wahlseite.
 *
 * seatBlock() liefert einen leeren String, wenn kein Trend zustande kommt
 * (weniger als drei Umfragen im Zeitfenster). Stand die Ueberschrift dann
 * trotzdem da, las sich das wie ein Abschnitt, den jemand vergessen hat zu
 * fuellen. Fuer dieses Projekt ist das der schlimmere Fehler: Es sagt sonst
 * ueberall, WARUM eine Stelle leer ist. Also entweder Ueberschrift mit Inhalt
 * oder Ueberschrift mit Begruendung, aber nie eine Ueberschrift ueber nichts.
 */
function sitzAbschnitt(p, istVorbei, t, eigenesErgebnisVerifiziert) {
  const inhalt = seatBlock(p);
  if (!inhalt) {
    return `<h2 id="sitzmodell">Was daraus an Sitzen folgt</h2>
${note('warn', 'Keine Modellrechnung moeglich', `<p>Fuer eine Sitzverteilung braucht es einen Trend, und der verlangt mindestens ${int(site.trend.minSurveys)} Umfragen innerhalb von ${int(site.trend.maxAgeDays)} Tagen. Zu ${esc(p.name)} liegen ${istVorbei ? `vor dem ${esc(deDate(t.datum))}` : 'derzeit'} nicht genug vor. Statt aus zu wenigen Umfragen eine Sitzzahl zu rechnen, bleibt dieser Abschnitt leer. Vor einer Wahl steigt die Zahl der Umfragen erfahrungsgemaess deutlich; sobald sie reicht, erscheint die Rechnung hier von selbst.</p>`)}`;
  }
  return `<h2 id="sitzmodell">Was daraus an Sitzen folgt</h2>
${
  istVorbei
    ? note('warn', 'Diese Modellrechnung ist ueberholt', `<p>Sie beruht auf Umfragen vor dem ${esc(deDate(t.datum))} und ist durch das tatsaechliche Wahlergebnis ersetzt worden. Sie steht hier nur noch, damit nachvollziehbar bleibt, was die Umfragen erwarten liessen. ${eigenesErgebnisVerifiziert ? 'Der Vergleich mit dem amtlichen Ergebnis steht darunter.' : 'Das amtliche Ergebnis ist in Wahlwerk noch nicht verifiziert; sobald es eingetragen ist, erscheint hier der Vergleich.'}</p>`)
    : ''
}
${inhalt}`;
}

// Einzelseite je Wahltermin
for (const t of terminSeiten) {
  const p = parliamentByName.get(t.parlamentName);
  const nk = nachkontrollen.get(t.parlamentName) ?? null;
  const behoerde = wahlleitungen.behoerden?.[t.parlament] ?? null;
  const url = `/wahl/${t.slug}/`;
  const anzahl = p.surveys.length;
  const imWahlkampf = p.surveys.filter((s) => t.datum && (s.dateEnd ?? s.date) < t.datum && tageZwischen(s.dateEnd ?? s.date, t.datum) <= 180);

  // Nach dem Wahltag darf diese Seite nicht den heutigen Umfragestand zeigen:
  // der enthaelt dann Erhebungen NACH der Wahl, die ueber diese Wahl nichts
  // mehr aussagen. Gezeigt wird stattdessen der eingefrorene Schlussstand,
  // gerechnet auf denselben Bestand, den auch die Nachkontrolle verwendet.
  // Bezieht sich das verifizierte amtliche Ergebnis auf GENAU diese Wahl?
  // Nur dann darf unter einem vergangenen Wahltermin eine Nachkontrolle
  // stehen; sonst zeigte die Seite die Fehlerbilanz einer anderen Wahl.
  const eigenesErgebnisVerifiziert = Boolean(nk?.moeglich && nk.wahldatum === t.datum);

  // "Vorbei" ist nicht dasselbe wie "an einem frueheren Tag". Am Wahltag
  // selbst, sobald das amtliche Ergebnis dieser Wahl eingetragen ist, ist die
  // Wahl gelaufen - der Kalendertag ist derselbe geblieben. Ohne diese
  // Unterscheidung stuende am Wahlabend "Heute wird gewaehlt" unmittelbar
  // ueber "Am 06.09.2026 wurde tatsaechlich gewaehlt".
  const istVorbei = t.phase === 'nachwahl' || (t.phase === 'wahltag' && eigenesErgebnisVerifiziert);
  const davor = p.surveys.filter((s) => (s.dateEnd ?? s.date) < t.datum);
  const anzeigeParlament = istVorbei ? { ...p, surveys: davor, trend: computeTrend(davor, site.trend) } : p;

  addPage(
    url,
    page({
      site,
      url,
      title: t.name,
      description: istVorbei
        ? `${t.name} am ${deDate(t.datum)}: der eingefrorene Schlussstand der Sonntagsfragen vor der Wahl${eigenesErgebnisVerifiziert ? ' und der Vergleich mit dem amtlichen Ergebnis' : '; das amtliche Ergebnis ist hier noch nicht verifiziert'}. Jede Zahl mit Beleg.`
        : `${t.name} am ${deDate(t.datum)}: Stand der Sonntagsfragen, Modellrechnung zur Sitzverteilung${nk?.moeglich ? ' und die Nachkontrolle der letzten Wahl' : ''}. Jede Zahl mit Beleg.`,
      breadcrumbs: [
        { label: 'Start', url: '/' },
        { label: 'Wahlkalender', url: '/wahlen/' },
        { label: t.name, url },
      ],
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'Event',
          name: t.name,
          startDate: t.datum,
          endDate: t.datum,
          eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
          // schema.org kennt keinen Status fuer "hat stattgefunden": die
          // Vokabelliste fuehrt nur Scheduled, Cancelled, MovedOnline,
          // Postponed und Rescheduled. EventScheduled bleibt deshalb auch
          // nach dem Wahltag richtig und wird bewusst nicht umgeschrieben.
          eventStatus: 'https://schema.org/EventScheduled',
          url: `${site.baseUrl}${url}`,
          location: { '@type': 'Place', name: t.land === 'alle' ? 'Deutschland' : t.land, address: { '@type': 'PostalAddress', addressCountry: 'DE', addressRegion: t.land === 'alle' ? undefined : t.land } },
          description: `${t.art} in ${t.land}`,
        },
      ],
      body: `${fixtureBanner()}
<p class="eyebrow">Wahltermin</p>
<h1>${esc(t.name)}</h1>
${statusBand(t, eigenesErgebnisVerifiziert)}
<p class="meta">Termin nach der amtlichen Uebersicht der <a href="${esc(wahlterminConfig._quelle)}" rel="external">Bundeswahlleiterin</a>, abgerufen am ${esc(deDate(wahlterminConfig._abgerufen))}. Deren Vorbehalt: &bdquo;Angaben zu Landtags- und Kommunalwahlen ohne Gew&auml;hr.&ldquo; Vollstaendig im <a href="/wahlen/">Wahlkalender</a> und unter <a href="/quellen/">Quellen</a>.</p>
<p class="lede">Gewaehlt ${istVorbei ? 'wurde' : 'wird'} das Parlament <a href="/parlament/${p.slug}/">${esc(p.name)}</a>. Im Bestand liegen dazu ${int(anzahl)} Sonntagsfragen, davon ${int(imWahlkampf.length)} aus den letzten 180 Tagen vor dem Wahltag.</p>
${note('warn', 'Was diese Seite am Wahlabend tut und was nicht', `<p>Wahlwerk erhebt keine eigenen Daten und veroeffentlicht <strong>keine Prognose, keine Hochrechnung und keine Nachwahlbefragung</strong>. Am Wahlabend gibt es hier also keine Zahl, die schneller waere als die amtliche. Das amtliche Ergebnis stellt ${behoerde ? esc(behoerde.name) : 'die zustaendige Landeswahlleitung'} fest; es erscheint auf dieser Seite erst, wenn es nach dem Zwei-Quellen-Kriterium des Projekts verifiziert und in <code>config/elections.json</code> eingetragen ist.</p><p>Bis dahin steht hier der Stand der veroeffentlichten Umfragen. Eine Sonntagsfrage misst die Wahlabsicht im Befragungszeitraum und ist keine Vorhersage. ${nk?.moeglich ? 'Wie weit beides auseinanderliegen kann, steht weiter unten in der Nachkontrolle &ndash; mit Zahlen, nicht als Floskel.' : 'Wie weit beides auseinanderliegen kann, laesst sich fuer dieses Parlament noch nicht beziffern: es fehlt ein verifiziertes amtliches Ergebnis der vorangegangenen Wahl. Der Abschnitt Nachkontrolle sagt weiter unten, woran es liegt.'}</p>`, { level: 2 })}

<h2 id="stand">${istVorbei ? 'Schlussstand der Umfragen vor der Wahl' : 'Stand der Umfragen'}</h2>
${
  istVorbei
    ? `<p>Gewaehlt ist. Gezeigt wird deshalb <strong>nicht</strong> der heutige Umfragestand, sondern der eingefrorene Stand vom letzten Befragungstag vor dem ${esc(deDate(t.datum))}. Alles, was nach der Wahl erhoben wurde, ist keine Aussage mehr ueber diese Wahl und bleibt hier aussen vor. Der laufende Trend steht auf der <a href="/parlament/${p.slug}/">Parlamentsseite</a>.</p>`
    : ''
}
${trendBlock(anzeigeParlament, { hatStreuung: false })}

${sitzAbschnitt(anzeigeParlament, istVorbei, t, eigenesErgebnisVerifiziert)}

${
  // Vor der Wahl ist die Nachkontrolle die der LETZTEN Wahl und dient der
  // Einordnung. Nach der Wahl muss sie sich auf DIESE Wahl beziehen - sonst
  // stuende neben dem Ergebnis eines Wahlabends die Fehlerbilanz einer
  // anderen Wahl, was ein Leser zwangslaeufig verwechselt.
  istVorbei && !eigenesErgebnisVerifiziert
    ? `<h2 id="nachkontrolle">Nachkontrolle</h2>
${note('warn', 'Amtliches Ergebnis noch nicht verifiziert', `<p>Die Wahl vom ${esc(deDate(t.datum))} ist gelaufen, das Ergebnis ist in Wahlwerk aber noch nicht eingetragen. Aufgenommen wird es erst, wenn es nach dem Zwei-Quellen-Kriterium des Projekts belegt oder von ${behoerde ? esc(behoerde.name) : 'der zustaendigen Landeswahlleitung'} unmittelbar bestaetigt ist. Bis dahin steht hier keine Zahl &ndash; auch keine aus einer Hochrechnung, aus der Presse oder aus dem Gedaechtnis.</p><p>Zum Vergleich mit der vorangegangenen Wahl siehe die <a href="/parlament/${p.slug}/">Parlamentsseite</a>.</p>`)}`
    : nachkontrollBlock(nk, p.name)
}

<h2 id="umfragen">Die Umfragen vor dieser Wahl</h2>
${
  imWahlkampf.length > 0
    ? `${belegstreifen(imWahlkampf)}
${surveyTable(imWahlkampf, { limit: 60, caption: `Sonntagsfragen zu ${p.name} in den 180 Tagen vor dem ${deDate(t.datum)}` })}`
    : `<p>Im Bestand liegt aus den 180 Tagen vor dem Wahltag keine Umfrage zu diesem Parlament. Alle ${int(anzahl)} erfassten Umfragen stehen auf der <a href="/parlament/${p.slug}/">Parlamentsseite</a>.</p>`
}
<p><a href="/parlament/${p.slug}/">Alle ${int(anzahl)} Umfragen zu ${esc(p.name)}</a> &middot; <a href="/wahlen/">zurueck zum Wahlkalender</a></p>

<h2 id="amtlich">Amtliche Stelle</h2>
${
  behoerde
    ? `<p>Zustaendig fuer die Durchfuehrung und die Feststellung des Ergebnisses ist <strong>${esc(behoerde.name)}</strong> (Ebene: ${esc(behoerde.ebene)}). Wer eine Angabe dieser Seite gegen die amtliche Quelle pruefen oder eine fehlende Rechtsgrundlage erfragen will, kann das nach dem jeweiligen Informationsfreiheitsgesetz tun: <a href="${esc(wahlleitungen.basisUrl)}${esc(String(behoerde.id))}/" rel="external">Anfrage an ${esc(behoerde.name)} stellen</a>.</p>`
    : `<p>Zu diesem Parlament ist in <code>config/wahlleitungen.json</code> keine zustaendige Stelle hinterlegt. Der Hinweis bleibt deshalb leer, statt eine Behoerde zu benennen, die nicht geprueft ist.</p>`
}`,
    }),
    { priority: t.phase === 'nachwahl' ? 0.6 : 1.0, changefreq: 'daily' },
  );
}

// ----------------------------------------------------------------- Chronik

// Uebersicht ueber alle Jahre
{
  const zeilen = jahreAbsteigend
    .map((jahr) => {
      const monate = byYear.get(jahr);
      const alle = [...monate.values()].flat();
      const parls = new Set(alle.map((s) => s.parliament)).size;
      const insts = new Set(alle.map((s) => s.institute).filter(Boolean)).size;
      return `<tr>
  <td class="left"><a href="/chronik/${esc(jahr)}/">${esc(jahr)}</a></td>
  <td>${int(alle.length)}</td>
  <td>${int(monate.size)}</td>
  <td>${int(parls)}</td>
  <td>${int(insts)}</td>
</tr>`;
    })
    .join('');
  const gesamt = data.surveys.length;

  addPage(
    '/chronik/',
    page({
      site,
      url: '/chronik/',
      title: 'Chronik',
      description: `Alle ${int(gesamt)} erfassten Umfragen nach Jahr und Monat geordnet, von ${jahreAbsteigend.at(-1)} bis ${jahreAbsteigend[0]}. Jede einzelne Umfrage ist von hier aus erreichbar.`,
      breadcrumbs: [{ label: 'Start', url: '/' }, { label: 'Chronik', url: '/chronik/' }],
      structuredData: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Chronik', url: `${site.baseUrl}/chronik/`, inLanguage: 'de-DE' }],
      body: `${fixtureBanner()}
<h1>Chronik</h1>
<p class="lede">Der vollstaendige Bestand in zeitlicher Ordnung: ${int(gesamt)} Umfragen aus ${int(jahreAbsteigend.length)} Jahren, von ${esc(jahreAbsteigend.at(-1))} bis ${esc(jahreAbsteigend[0])}. Von hier fuehrt zu <strong>jeder</strong> einzelnen Umfrage ein Weg.</p>
${note('method', 'Warum es diese Seite gibt', `<p>Die Tabellen auf den Parlaments- und Institutsseiten brechen nach 200 Zeilen ab, damit sie lesbar bleiben. Damit war der aeltere Bestand zwar erzeugt und in der Sitemap verzeichnet, aber von keiner Seite aus verlinkt: beim Bau vom 31.08.2026 betraf das <strong>1036 von 3918</strong> Belegseiten. Wer nicht zufaellig die Adresse kannte, kam nicht hin. Die Chronik schliesst diese Luecke, und eine Pruefung in <code>scripts/check.mjs</code> laesst den Bau scheitern, sobald wieder eine Umfrage unerreichbar wird.</p>`, { level: 2 })}
${belegstreifen(data.surveys)}
<div class="table-scroll"><table>
<caption>Umfragen je Jahr, absteigend</caption>
<thead><tr><th class="left" scope="col">Jahr</th><th scope="col">Umfragen</th><th scope="col">Monate</th><th scope="col">Parlamente</th><th scope="col">Institute</th></tr></thead>
<tbody>${zeilen}</tbody>
</table></div>`,
    }),
    { priority: 0.8, changefreq: 'daily' },
  );
}

// Jahresseiten und Monatsseiten
for (const jahr of jahreAbsteigend) {
  const monate = byYear.get(jahr);
  const monateAbsteigend = [...monate.keys()].sort().reverse();
  const alleImJahr = [...monate.values()].flat();

  addPage(
    `/chronik/${jahr}/`,
    page({
      site,
      url: `/chronik/${jahr}/`,
      title: `Umfragen ${jahr}`,
      description: `Alle ${int(alleImJahr.length)} im Jahr ${jahr} veroeffentlichten Sonntagsfragen, nach Monaten geordnet, mit Institut, Auftraggeber und Fallzahl.`,
      breadcrumbs: [
        { label: 'Start', url: '/' },
        { label: 'Chronik', url: '/chronik/' },
        { label: jahr, url: `/chronik/${jahr}/` },
      ],
      structuredData: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: `Umfragen ${jahr}`, url: `${site.baseUrl}/chronik/${jahr}/`, inLanguage: 'de-DE', temporalCoverage: `${jahr}-01-01/${jahr}-12-31` }],
      body: `${fixtureBanner()}
<p class="eyebrow">Chronik</p>
<h1>Umfragen ${esc(jahr)}</h1>
<p class="lede">${int(alleImJahr.length)} Umfragen in ${int(monate.size)} Monaten, zu ${int(new Set(alleImJahr.map((s) => s.parliament)).size)} Parlamenten von ${int(new Set(alleImJahr.map((s) => s.institute).filter(Boolean)).size)} Instituten.</p>
${belegstreifen(alleImJahr)}
<h2 id="monate">Monate</h2>
<ul class="linklist">${monateAbsteigend
        .map((m) => {
          const liste = monate.get(m);
          return `<li><a href="/chronik/${esc(jahr)}/${esc(m)}/">${esc(MONATSNAMEN[Number(m) - 1])} ${esc(jahr)}</a><span class="meta">${int(liste.length)} ${liste.length === 1 ? 'Umfrage' : 'Umfragen'}</span></li>`;
        })
        .join('')}</ul>
<p><a href="/chronik/">Alle Jahre</a>${jahreAbsteigend.indexOf(jahr) > 0 ? ` &middot; <a href="/chronik/${esc(jahreAbsteigend[jahreAbsteigend.indexOf(jahr) - 1])}/">${esc(jahreAbsteigend[jahreAbsteigend.indexOf(jahr) - 1])}</a>` : ''}${jahreAbsteigend.indexOf(jahr) < jahreAbsteigend.length - 1 ? ` &middot; <a href="/chronik/${esc(jahreAbsteigend[jahreAbsteigend.indexOf(jahr) + 1])}/">${esc(jahreAbsteigend[jahreAbsteigend.indexOf(jahr) + 1])}</a>` : ''}</p>`,
    }),
    { priority: 0.6 },
  );

  for (const m of monateAbsteigend) {
    const liste = monate.get(m);
    const name = `${MONATSNAMEN[Number(m) - 1]} ${jahr}`;
    const idx = monateAbsteigend.indexOf(m);
    addPage(
      `/chronik/${jahr}/${m}/`,
      page({
        site,
        url: `/chronik/${jahr}/${m}/`,
        title: `Umfragen ${name}`,
        description: `Die ${int(liste.length)} Sonntagsfragen aus ${name}, vollstaendig mit Institut, Auftraggeber, Feldzeit und Fallzahl.`,
        breadcrumbs: [
          { label: 'Start', url: '/' },
          { label: 'Chronik', url: '/chronik/' },
          { label: jahr, url: `/chronik/${jahr}/` },
          { label: MONATSNAMEN[Number(m) - 1], url: `/chronik/${jahr}/${m}/` },
        ],
        structuredData: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: `Umfragen ${name}`, url: `${site.baseUrl}/chronik/${jahr}/${m}/`, inLanguage: 'de-DE', temporalCoverage: `${jahr}-${m}` }],
        body: `${fixtureBanner()}
<p class="eyebrow">Chronik &middot; <a href="/chronik/${esc(jahr)}/">${esc(jahr)}</a></p>
<h1>Umfragen ${esc(name)}</h1>
<p class="lede">${int(liste.length)} ${liste.length === 1 ? 'Umfrage' : 'Umfragen'} zu ${int(new Set(liste.map((s) => s.parliament)).size)} ${new Set(liste.map((s) => s.parliament)).size === 1 ? 'Parlament' : 'Parlamenten'}. Sortiert nach letztem Befragungstag, absteigend. Diese Liste ist vollstaendig und wird nicht gekuerzt.</p>
${surveyTable(liste, { limit: liste.length, caption: `Alle Sonntagsfragen aus ${name}` })}
<p>${idx > 0 ? `<a href="/chronik/${esc(jahr)}/${esc(monateAbsteigend[idx - 1])}/">Spaeter: ${esc(MONATSNAMEN[Number(monateAbsteigend[idx - 1]) - 1])}</a> &middot; ` : ''}<a href="/chronik/${esc(jahr)}/">${esc(jahr)} im Ueberblick</a>${idx < monateAbsteigend.length - 1 ? ` &middot; <a href="/chronik/${esc(jahr)}/${esc(monateAbsteigend[idx + 1])}/">Frueher: ${esc(MONATSNAMEN[Number(monateAbsteigend[idx + 1]) - 1])}</a>` : ''}</p>`,
      }),
      { priority: 0.5 },
    );
  }
}

// ------------------------------------------------------------ Auftraggeber

const taskerList = [...byTasker.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

addPage(
  '/auftraggeber/',
  page({
    site,
    url: '/auftraggeber/',
    title: 'Auftraggeber',
    description: `${int(taskerList.length)} Auftraggeber im Bestand. Wer eine Umfrage bezahlt, entscheidet mit, welches Parlament ueberhaupt abgefragt wird.`,
    breadcrumbs: [{ label: 'Start', url: '/' }, { label: 'Auftraggeber', url: '/auftraggeber/' }],
    structuredData: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Auftraggeber', url: `${site.baseUrl}/auftraggeber/`, inLanguage: 'de-DE' }],
    body: `${fixtureBanner()}
<h1>Auftraggeber</h1>
<p class="lede">${int(taskerList.length)} Auftraggeber haben die ${int(data.surveys.length)} erfassten Umfragen in Auftrag gegeben. Der Auftraggeber stand bisher zwar in jeder Tabelle, war aber nicht nachschlagbar.</p>
${note('method', 'Warum der Auftraggeber zaehlt', `<p>Wer eine Umfrage bezahlt, bestimmt, <strong>welche Frage ueberhaupt gestellt wird</strong> und zu welchem Parlament. Das ist kein Vorwurf, sondern die Voraussetzung dafuer, den Bestand richtig zu lesen: Dass zu einem Landtag viele Umfragen vorliegen und zu einem anderen kaum welche, ist eine Entscheidung von Redaktionen und Verbaenden, keine Eigenschaft der Laender. Ueber den Einfluss auf das Ergebnis sagt diese Zuordnung nichts; Wahlwerk bewertet weder Institute noch Auftraggeber.</p>`, { level: 2 })}
<div class="table-scroll"><table>
<caption>Auftraggeber nach Anzahl der Umfragen</caption>
<thead><tr><th class="left" scope="col">Auftraggeber</th><th scope="col">Umfragen</th><th scope="col">Institute</th><th scope="col">Parlamente</th><th class="left" scope="col">Zeitraum</th></tr></thead>
<tbody>${taskerList
      .map(([name, list]) => {
        const daten = list.map((s) => s.dateEnd ?? s.date).sort();
        return `<tr><td class="left"><a href="/auftraggeber/${slug(name)}/">${esc(name)}</a></td><td>${int(list.length)}</td><td>${int(new Set(list.map((s) => s.institute).filter(Boolean)).size)}</td><td>${int(new Set(list.map((s) => s.parliament)).size)}</td><td class="left">${esc(deDate(daten[0]))} bis ${esc(deDate(daten.at(-1)))}</td></tr>`;
      })
      .join('')}</tbody>
</table></div>`,
  }),
  { priority: 0.8 },
);

for (const [name, list] of taskerList) {
  const parls = [...new Set(list.map((s) => s.parliament))].sort();
  const insts = [...new Set(list.map((s) => s.institute).filter(Boolean))].sort();
  const daten = list.map((s) => s.dateEnd ?? s.date).sort();
  addPage(
    `/auftraggeber/${slug(name)}/`,
    page({
      site,
      url: `/auftraggeber/${slug(name)}/`,
      title: `Auftraggeber: ${name}`,
      description: `${int(list.length)} von ${name} beauftragte Umfragen, erhoben von ${int(insts.length)} ${insts.length === 1 ? 'Institut' : 'Instituten'} zu ${int(parls.length)} ${parls.length === 1 ? 'Parlament' : 'Parlamenten'}.`,
      breadcrumbs: [
        { label: 'Start', url: '/' },
        { label: 'Auftraggeber', url: '/auftraggeber/' },
        { label: name, url: `/auftraggeber/${slug(name)}/` },
      ],
      structuredData: [{ '@context': 'https://schema.org', '@type': 'Dataset', name: `Umfragen im Auftrag von ${name}`, url: `${site.baseUrl}/auftraggeber/${slug(name)}/`, inLanguage: 'de-DE', license: 'https://opendatacommons.org/licenses/odbl/1-0/', temporalCoverage: `${daten[0]}/${daten.at(-1)}` }],
      body: `${fixtureBanner()}
<p class="eyebrow">Auftraggeber</p>
<h1>${esc(name)}</h1>
<p class="lede">${int(list.length)} beauftragte ${list.length === 1 ? 'Umfrage' : 'Umfragen'} zwischen ${esc(deDate(daten[0]))} und ${esc(deDate(daten.at(-1)))}, erhoben von ${insts.length > 0 ? insts.map((i) => `<a href="/institut/${slug(i)}/">${esc(i)}</a>`).join(', ') : 'nicht ausgewiesenen Instituten'}.</p>
${belegstreifen(list)}
<h2 id="parlamente">Abgefragte Parlamente</h2>
<ul class="linklist">${parls
        .map((n) => `<li><a href="/parlament/${slug(n)}/">${esc(n)}</a><span class="meta">${int(list.filter((s) => s.parliament === n).length)} Umfragen</span></li>`)
        .join('')}</ul>
<h2 id="alle">Alle Umfragen</h2>
${surveyTable(list, { limit: Math.min(list.length, 200), caption: `Umfragen im Auftrag von ${name}` })}`,
    }),
    { priority: 0.5 },
  );
}

// ---------------------------------------------------------------- Methoden

const methodList = [...byMethod.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

// "Unbekannt" ist keine Erhebungsmethode, sondern deren Fehlen. Der Bestand
// fuehrt diesen Wert selbst; er wird deshalb ausgewiesen, aber nicht als
// Methode mitgezaehlt. Eine Ueberschrift "6 Erhebungsmethoden" waere sonst um
// genau eine zu hoch, und der Satz darunter behauptete Vollstaendigkeit, die
// die eigene Tabelle widerlegt.
const ohneMethode = (byMethod.get('Unbekannt') ?? []).length;
const dokumentierteMethoden = methodList.filter(([name]) => name !== 'Unbekannt').length;

addPage(
  '/methoden/',
  page({
    site,
    url: '/methoden/',
    title: 'Erhebungsmethoden',
    description: `${int(dokumentierteMethoden)} dokumentierte Erhebungsmethoden im Bestand, von Telefon ueber Online bis zu Mischformen, dazu ${int(ohneMethode)} Umfragen ohne Methodenangabe.`,
    breadcrumbs: [{ label: 'Start', url: '/' }, { label: 'Erhebungsmethoden', url: '/methoden/' }],
    structuredData: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Erhebungsmethoden', url: `${site.baseUrl}/methoden/`, inLanguage: 'de-DE' }],
    body: `${fixtureBanner()}
<h1>Erhebungsmethoden</h1>
<p class="lede">${int(dokumentierteMethoden)} unterscheidbare Erhebungsmethoden. Bei ${int(ohneMethode)} der ${int(data.surveys.length)} Umfragen (${num((ohneMethode / data.surveys.length) * 100)}&thinsp;%) fuehrt der Bestand die Methode als <em>Unbekannt</em> &ndash; diese Gruppe steht unten mit, wird aber nicht als Methode mitgezaehlt.</p>
${note('method', 'Was die Methode ueber eine Umfrage sagt', `<p>Telefon- und Onlinebefragungen erreichen unterschiedliche Menschen und werden unterschiedlich gewichtet. Beides hat bekannte Schwaechen: eine Telefonstichprobe erreicht Juengere schlechter, ein Onlinepanel besteht aus Menschen, die sich zur Teilnahme entschlossen haben. <strong>Aus der Methode allein folgt keine Rangfolge der Qualitaet</strong>, und Wahlwerk leitet aus ihr keine ab. Die Angabe steht hier, weil sie zur Einordnung gehoert und weil sie im Bestand vorhanden ist.</p><p>Die Zahlen unten sind Auszaehlungen des Bestandes, keine Guetemasse. Insbesondere ist der Median der Fallzahl <strong>kein</strong> Mass fuer Genauigkeit: der Fehler einer Wahlumfrage wird nicht vom Stichprobenfehler dominiert.</p>`, { level: 2 })}
<div class="table-scroll"><table>
<caption>Erhebungsmethoden nach Anzahl der Umfragen</caption>
<thead><tr><th class="left" scope="col">Methode</th><th scope="col">Umfragen</th><th scope="col">Anteil</th><th scope="col">Institute</th><th scope="col">Median n</th><th class="left" scope="col">Zeitraum</th></tr></thead>
<tbody>${methodList
      .map(([name, list]) => {
        const ns = list.map((s) => s.surveyedPersons).filter(Boolean).sort((a, b) => a - b);
        const daten = list.map((s) => s.dateEnd ?? s.date).sort();
        return `<tr><td class="left"><a href="/methode/${slug(name)}/">${esc(name)}</a></td><td>${int(list.length)}</td><td>${num((list.length / data.surveys.length) * 100)}&thinsp;%</td><td>${int(new Set(list.map((s) => s.institute).filter(Boolean)).size)}</td><td>${ns.length ? int(ns[Math.floor(ns.length / 2)]) : 'n.a.'}</td><td class="left">${esc(deDate(daten[0]))} bis ${esc(deDate(daten.at(-1)))}</td></tr>`;
      })
      .join('')}</tbody>
</table></div>`,
  }),
  { priority: 0.7 },
);

for (const [name, list] of methodList) {
  const insts = [...new Set(list.map((s) => s.institute).filter(Boolean))].sort();
  const daten = list.map((s) => s.dateEnd ?? s.date).sort();
  addPage(
    `/methode/${slug(name)}/`,
    page({
      site,
      url: `/methode/${slug(name)}/`,
      title: `Methode: ${name}`,
      description: `${int(list.length)} Umfragen mit der Erhebungsmethode ${name}, von ${int(insts.length)} Instituten, mit Fallzahlen und Zeitraum.`,
      breadcrumbs: [
        { label: 'Start', url: '/' },
        { label: 'Erhebungsmethoden', url: '/methoden/' },
        { label: name, url: `/methode/${slug(name)}/` },
      ],
      structuredData: [{ '@context': 'https://schema.org', '@type': 'Dataset', name: `Umfragen mit der Methode ${name}`, url: `${site.baseUrl}/methode/${slug(name)}/`, inLanguage: 'de-DE', license: 'https://opendatacommons.org/licenses/odbl/1-0/', temporalCoverage: `${daten[0]}/${daten.at(-1)}` }],
      body: `${fixtureBanner()}
<p class="eyebrow">Erhebungsmethode</p>
<h1>${esc(name)}</h1>
<p class="lede">${int(list.length)} Umfragen zwischen ${esc(deDate(daten[0]))} und ${esc(deDate(daten.at(-1)))}, erhoben von ${int(insts.length)} ${insts.length === 1 ? 'Institut' : 'Instituten'}. Das sind ${num((list.length / data.surveys.length) * 100)}&thinsp;% des Bestandes.</p>
${name === 'Unbekannt' ? note('warn', 'Methode nicht ausgewiesen', '<p>Bei diesen Umfragen ist im Bestand keine Erhebungsmethode angegeben. Das heisst nicht, dass keine existiert &ndash; nur, dass sie hier nicht dokumentiert ist. Sie werden bewusst als eigene Gruppe gefuehrt und nicht auf eine plausible Methode verteilt.</p>', { level: 2 }) : ''}
${belegstreifen(list)}
<h2 id="institute">Institute mit dieser Methode</h2>
<ul class="linklist">${insts
        .map((i) => `<li><a href="/institut/${slug(i)}/">${esc(i)}</a><span class="meta">${int(list.filter((s) => s.institute === i).length)} Umfragen</span></li>`)
        .join('')}</ul>
<h2 id="alle">Umfragen</h2>
${surveyTable(list, { caption: `Umfragen mit der Erhebungsmethode ${name}` })}`,
    }),
    { priority: 0.5 },
  );
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
    .replaceAll('{{BUILD_TIME}}', esc(buildTime))
    .replaceAll('{{WAHLTERMIN_QUELLE}}', esc(wahlterminConfig._quelle))
    .replaceAll('{{WAHLTERMIN_ABRUF}}', esc(deDate(wahlterminConfig._abgerufen) ?? wahlterminConfig._abgerufen))
    .replaceAll('{{WAHLTERMIN_ANZAHL}}', int(termine.length))
    .replaceAll('{{WAHLTERMIN_DATIERT}}', int(termine.filter((t) => t.datum).length))
    .replaceAll('{{WAHLTERMIN_VORBEHALT}}', esc(wahlterminConfig._vorbehaltDerQuelle));

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

console.log(`Build fertig: ${pages.length} Seiten, ${chunks.length} Sitemap-Datei(en), Ausgabe in ${path.relative(ROOT, OUT) || OUT}/`);
if (isFixture) console.warn('[WARNUNG] Build basiert auf synthetischen Testdaten und darf nicht veroeffentlicht werden.');
