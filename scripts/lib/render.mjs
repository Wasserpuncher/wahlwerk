// Wahlwerk - Renderschicht
// Lizenz: AGPL-3.0-or-later

import { esc, jsonLd, num, int, deDate } from './util.mjs';

/**
 * Erzeugt eine vollstaendige HTML-Seite.
 * Jede Seite bekommt einen eigenen Titel, eine eigene Beschreibung, ein
 * Canonical-Tag und mindestens einen JSON-LD-Block. Ohne diese vier Angaben
 * wird bewusst ein Fehler geworfen, damit keine Seite ohne Kopfdaten entsteht.
 */
export function page({ site, url, title, description, breadcrumbs = [], structuredData = [], head = '', body, updated }) {
  if (!title) throw new Error(`Seite ${url} ohne Titel.`);
  if (!description) throw new Error(`Seite ${url} ohne Beschreibung.`);

  const canonical = `${site.baseUrl}${url}`;
  const fullTitle = url === '/' ? `${site.name} - ${site.tagline}` : `${title} | ${site.name}`;

  const crumbLd =
    breadcrumbs.length > 0
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: breadcrumbs.map((c, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: c.label,
              item: `${site.baseUrl}${c.url}`,
            })),
          },
        ]
      : [];

  const ld = [...crumbLd, ...structuredData];

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:locale" content="${esc(site.locale)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(description)}">
${updated ? `<meta property="og:updated_time" content="${esc(updated)}">` : ''}
<link rel="alternate" type="application/rss+xml" title="${esc(site.name)} - neue Umfragen" href="/feed.xml">
<link rel="stylesheet" href="/assets/wahlwerk.css">
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
${head}
<script type="application/ld+json">
${jsonLd(ld.length === 1 ? ld[0] : ld)}
</script>
</head>
<body>
<a class="skip" href="#inhalt">Zum Inhalt springen</a>
<header class="site-head">
  <div class="wrap head-inner">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-text"><strong>${esc(site.name)}</strong><span>${esc(site.tagline)}</span></span>
    </a>
    <nav aria-label="Hauptnavigation">
      <a href="/wahlen/">Wahlen</a>
      <a href="/parlamente/">Parlamente</a>
      <a href="/parteien/">Parteien</a>
      <a href="/institute/">Institute</a>
      <a href="/chronik/">Chronik</a>
      <a href="/methodik/">Methodik</a>
      <a href="/daten/">Daten</a>
    </nav>
  </div>
</header>
${breadcrumbs.length > 0 ? breadcrumbNav(breadcrumbs) : ''}
<main id="inhalt" class="wrap">
${body}
</main>
${footer(site)}
</body>
</html>
`;
}

function breadcrumbNav(crumbs) {
  return `<nav class="crumbs wrap" aria-label="Breadcrumb"><ol>${crumbs
    .map((c, i) =>
      i === crumbs.length - 1
        ? `<li aria-current="page">${esc(c.label)}</li>`
        : `<li><a href="${esc(c.url)}">${esc(c.label)}</a></li>`,
    )
    .join('')}</ol></nav>`;
}

function footer(site) {
  const legal = [`<a href="/datenschutz/">Datenschutz</a>`];
  if (site.legal.renderImpressum) legal.unshift(`<a href="/impressum/">Impressum</a>`);
  return `<footer class="site-foot">
  <div class="wrap">
    <p class="attribution"><strong>Datengrundlage:</strong> Umfragedaten von <a href="https://dawum.de" rel="external">dawum.de</a>, lizenziert unter der <a href="https://opendatacommons.org/licenses/odbl/1-0/" rel="license external">Open Database License (ODbL)</a>. Diese abgeleitete Datenbank steht ebenfalls unter ODbL.</p>
    <p class="attribution">Die Umfragen selbst stammen von den jeweils genannten Meinungsforschungsinstituten. ${esc(site.name)} erhebt keine eigenen Umfragen.</p>
    <nav class="foot-nav" aria-label="Rechtliches und Projekt">
      ${legal.join('')}
      <a href="/methodik/">Methodik</a>
      <a href="/quellen/">Quellenverzeichnis</a>
      <a href="/auftraggeber/">Auftraggeber</a>
      <a href="/methoden/">Erhebungsmethoden</a>
      <a href="/daten/">Datenexport</a>
      <a href="/feed.xml">RSS</a>
    </nav>
  </div>
</footer>`;
}

/** Balkenzeile fuer einen Parteiwert, rein per CSS, ohne JavaScript. */
export function bar(party, value, colors, max = 45, interval = null) {
  const color = colors[party] ?? colors.Sonstige ?? '#8A8F98';
  const pct = (v) => Math.max(0, Math.min(100, (v / max) * 100));
  const width = Math.max(0.4, pct(value));
  // Fehlerbalken als halbtransparente Spanne hinter dem Wert. Die Grenzen sind
  // asymmetrisch, weil das Wilson-Intervall bei kleinen Anteilen asymmetrisch ist.
  const ci = interval
    ? `<span class="bar-ci" style="--from:${pct(interval.lower).toFixed(2)}%;--to:${pct(interval.upper).toFixed(2)}%"></span>`
    : '';
  const title = interval
    ? ` title="${num(value)} Prozent, 95-Prozent-Intervall ${num(interval.lower)} bis ${num(interval.upper)}"`
    : '';
  return `<div class="bar-row"${title}>
  <span class="bar-label">${esc(party)}</span>
  <span class="bar-track">${ci}<span class="bar-fill" style="--w:${width.toFixed(2)}%;--c:${esc(color)}"></span></span>
  <span class="bar-value num">${num(value)}&thinsp;%</span>
</div>`;
}

/**
 * Signaturelement: Belegstreifen. Jede Umfrage ist ein Strich, waagerecht nach
 * Feldende positioniert, in der Hoehe nach Fallzahl skaliert. Ohne JavaScript,
 * als Inline-SVG, damit es auch im Feed-Reader und im Ausdruck funktioniert.
 */
export function belegstreifen(surveys, { width = 900, height = 64 } = {}) {
  const dated = surveys.filter((s) => s.dateEnd);
  if (dated.length < 2) return '';
  const times = dated.map((s) => Date.parse(`${s.dateEnd}T00:00:00Z`));
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(1, max - min);
  const maxN = Math.max(...dated.map((s) => s.surveyedPersons ?? 0), 1);

  const ticks = dated
    .map((s) => {
      const t = Date.parse(`${s.dateEnd}T00:00:00Z`);
      const x = ((t - min) / span) * (width - 2) + 1;
      const n = s.surveyedPersons ?? 0;
      const h = n > 0 ? 8 + (n / maxN) * (height - 16) : 6;
      const known = n > 0;
      return `<line x1="${x.toFixed(2)}" y1="${(height - h).toFixed(2)}" x2="${x.toFixed(2)}" y2="${height}" class="${known ? 'tick' : 'tick tick-unknown'}"><title>${esc(s.institute ?? 'Institut unbekannt')}, Feldende ${esc(deDate(s.dateEnd) ?? s.dateEnd)}${known ? `, ${int(n)} Befragte` : ', Fallzahl nicht ausgewiesen'}</title></line>`;
    })
    .join('');

  return `<figure class="beleg">
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Zeitstrahl aller beruecksichtigten Umfragen. Jeder Strich ist eine Umfrage, die Hoehe entspricht der Fallzahl.">
    <line x1="0" y1="${height}" x2="${width}" y2="${height}" class="axis"></line>
    ${ticks}
  </svg>
  <figcaption>Jeder Strich ist eine veroeffentlichte Umfrage, waagerecht nach dem letzten Befragungstag, in der Hoehe nach Fallzahl. Blasse Striche sind Umfragen ohne ausgewiesene Fallzahl. Zeitraum ${esc(deDate(new Date(min).toISOString().slice(0, 10)))} bis ${esc(deDate(new Date(max).toISOString().slice(0, 10)))}, ${int(dated.length)} Umfragen.</figcaption>
</figure>`;
}

/**
 * Hinweiskasten. Wird fuer methodische Vorbehalte verwendet, nicht fuer Deko.
 *
 * Die Ueberschriftenebene ist einstellbar, weil sie sonst die Gliederung der
 * Seite bricht: Steht ein solcher Kasten unmittelbar unter der h1 und noch vor
 * der ersten h2, folgt auf Ebene 1 eine Ebene 3. Wer mit einer Sprachausgabe
 * durch die Ueberschriften springt, findet dann eine Ebene, die es nicht gibt.
 * Voreinstellung bleibt 3, damit ein Kasten INNERHALB eines Abschnitts richtig
 * einsortiert bleibt; vor dem ersten Abschnitt wird 2 uebergeben.
 */
export function note(kind, title, html, { level = 3 } = {}) {
  const h = level === 2 ? 'h2' : 'h3';
  return `<aside class="note note-${esc(kind)}"><${h}>${esc(title)}</${h}>${html}</aside>`;
}
