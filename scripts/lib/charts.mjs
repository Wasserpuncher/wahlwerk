// Wahlwerk - Diagramme
// Lizenz: AGPL-3.0-or-later
//
// Alle Diagramme werden beim Build als statisches SVG erzeugt. Kein
// JavaScript, keine Zeichenbibliothek, keine externen Requests. Dadurch sind
// sie druckbar, funktionieren ohne Skripte, sind per Screenreader ueber
// title-Elemente zugaenglich und kosten keine Ladezeit.
//
// Grundsatz wie im ganzen Projekt: Ein Diagramm zeigt nur Werte, die es gibt.
// Fehlende Werte erzeugen Luecken, keine interpolierten Linien.

import { esc, num, int, deDate } from './util.mjs';

const FALLBACK = '#8A8F98';
const color = (colors, party) => colors[party] ?? colors.Sonstige ?? FALLBACK;

/**
 * Sitzbogen (Halbkreis). Jeder Sitz ist ein Punkt, sortiert nach Parteigroesse
 * von links nach rechts. Die senkrechte Linie markiert die Mitte des Bogens
 * und damit die Mehrheitsgrenze.
 */
export function hemicycle(seatMap, { colors, majority, totalSeats, rows = 5, width = 720 }) {
  const entries = Object.entries(seatMap)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((acc, [, s]) => acc + s, 0);
  if (total === 0) return '';

  const cx = width / 2;
  const rOuter = width / 2 - 16;
  const rInner = rOuter * 0.44;
  const cy = rOuter + 16;
  const height = cy + 62;

  const radii = Array.from({ length: rows }, (_, i) => rInner + ((rOuter - rInner) * i) / (rows - 1));
  const wSum = radii.reduce((a, b) => a + b, 0);
  const exact = radii.map((r) => (total * r) / wSum);
  const counts = exact.map((v) => Math.floor(v));
  let rest = total - counts.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; rest > 0; k += 1, rest -= 1) counts[order[k % order.length].i] += 1;

  const positions = [];
  radii.forEach((r, ri) => {
    const n = counts[ri];
    for (let i = 0; i < n; i += 1) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      positions.push({ ang: Math.PI - t * Math.PI, r });
    }
  });
  positions.sort((a, b) => b.ang - a.ang);

  const seatList = [];
  for (const [party, n] of entries) for (let i = 0; i < n; i += 1) seatList.push(party);

  const dot = Math.max(3.2, ((rOuter - rInner) / rows) * 0.34);
  const circles = positions
    .map((p, i) => {
      const party = seatList[i] ?? 'Sonstige';
      const x = cx + p.r * Math.cos(p.ang);
      const y = cy - p.r * Math.sin(p.ang);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dot.toFixed(1)}" fill="${esc(color(colors, party))}"><title>Sitz ${i + 1} von ${total}: ${esc(party)}</title></circle>`;
    })
    .join('');

  const legend = entries
    .map(([party, seats], i) => {
      const perRow = 4;
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = 12 + col * (width - 24) / perRow;
      const y = cy + 24 + row * 18;
      return `<g><rect x="${x}" y="${y - 9}" width="10" height="10" rx="2" fill="${esc(color(colors, party))}"/><text x="${x + 15}" y="${y}" class="lgd">${esc(party)} ${int(seats)}</text></g>`;
    })
    .join('');

  return `<figure class="chart chart-hemicycle">
<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Sitzbogen: ${entries.map(([p, s]) => `${p} ${s} Sitze`).join(', ')}, insgesamt ${total} von ${totalSeats}, Mehrheit ab ${majority}.">
  <line x1="${cx}" y1="${(cy - rOuter - 10).toFixed(1)}" x2="${cx}" y2="${(cy + 6).toFixed(1)}" class="axis-dash"/>
  <text x="${cx + 6}" y="${(cy - rOuter - 2).toFixed(1)}" class="lbl">Mehrheitslinie, ${int(majority)} Sitze</text>
  ${circles}
  ${legend}
</svg>
<figcaption>Ein Punkt ist ein Sitz. Sortiert nach Fraktionsgroesse von links nach rechts, ohne politische Anordnung. Die gestrichelte Linie markiert die Mitte des Bogens und damit die Mehrheitsgrenze von ${int(majority)} der ${int(totalSeats)} Sitze.</figcaption>
</figure>`;
}

/**
 * Verlaufsdiagramm. Eine Linie je Partei, Luecken bleiben Luecken.
 * Die x-Achse nutzt das Veroeffentlichungsdatum, weil der Befragungszeitraum
 * nicht bei jeder Umfrage ausgewiesen ist.
 */
export function timeline(surveys, { colors, width = 900, height = 380, threshold = null, parties: only = null }) {
  const pts = surveys
    .filter((s) => s.date)
    .map((s) => ({ t: Date.parse(`${s.date}T00:00:00Z`), r: s.results, institute: s.institute, date: s.date }))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return '';

  const parties = only ?? [...new Set(pts.flatMap((p) => Object.keys(p.r)))].filter((p) => p !== 'Sonstige');
  const maxV = Math.max(...pts.flatMap((p) => Object.values(p.r)), 10);
  const yMax = Math.ceil(maxV / 10) * 10 + 5;

  const m = { l: 38, r: 96, t: 16, b: 34 };
  const iw = width - m.l - m.r;
  const ih = height - m.t - m.b;
  const t0 = pts[0].t;
  const t1 = pts.at(-1).t;
  const X = (t) => m.l + ((t - t0) / (t1 - t0 || 1)) * iw;
  const Y = (v) => m.t + ih - (v / yMax) * ih;

  const yTicks = [];
  for (let v = 0; v <= yMax; v += 10) {
    yTicks.push(`<line x1="${m.l}" y1="${Y(v).toFixed(1)}" x2="${m.l + iw}" y2="${Y(v).toFixed(1)}" class="grid"/><text x="${m.l - 7}" y="${(Y(v) + 4).toFixed(1)}" class="tick tick-y">${v}</text>`);
  }

  const years = [...new Set(pts.map((p) => p.date.slice(0, 4)))];
  const xTicks = years
    .map((y) => {
      const t = Date.parse(`${y}-01-01T00:00:00Z`);
      if (t < t0 || t > t1) return '';
      return `<line x1="${X(t).toFixed(1)}" y1="${m.t}" x2="${X(t).toFixed(1)}" y2="${m.t + ih}" class="grid"/><text x="${X(t).toFixed(1)}" y="${height - 12}" class="tick tick-x">${y}</text>`;
    })
    .join('');

  const lines = parties
    .map((party) => {
      const segs = [];
      let cur = [];
      for (const p of pts) {
        const v = p.r[party];
        if (v == null) {
          if (cur.length > 1) segs.push(cur);
          cur = [];
        } else cur.push(`${X(p.t).toFixed(1)},${Y(v).toFixed(1)}`);
      }
      if (cur.length > 1) segs.push(cur);
      const c = color(colors, party);
      const path = segs.map((s) => `<polyline points="${s.join(' ')}" fill="none" stroke="${esc(c)}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
      const dots = pts
        .filter((p) => p.r[party] != null)
        .map(
          (p) =>
            `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.r[party]).toFixed(1)}" r="2.8" fill="${esc(c)}"><title>${esc(party)} ${num(p.r[party])} Prozent, ${esc(p.institute ?? 'Institut n.a.')}, ${esc(deDate(p.date))}</title></circle>`,
        )
        .join('');
      const last = [...pts].reverse().find((p) => p.r[party] != null);
      const label = last
        ? `<text x="${(m.l + iw + 8).toFixed(1)}" y="${(Y(last.r[party]) + 4).toFixed(1)}" class="series" fill="${esc(c)}">${esc(party)} ${num(last.r[party])}</text>`
        : '';
      return path + dots + label;
    })
    .join('');

  return `<figure class="chart">
<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Verlauf der Umfragewerte von ${esc(deDate(pts[0].date))} bis ${esc(deDate(pts.at(-1).date))} fuer ${parties.join(', ')}.">
  ${yTicks.join('')}
  ${xTicks}
  ${threshold ? `<line x1="${m.l}" y1="${Y(threshold).toFixed(1)}" x2="${m.l + iw}" y2="${Y(threshold).toFixed(1)}" class="threshold"/>
  <text x="${m.l + 6}" y="${(Y(threshold) - 6).toFixed(1)}" class="lbl">Sperrklausel ${int(threshold)} Prozent</text>` : ''}
  ${lines}
  <line x1="${m.l}" y1="${m.t + ih}" x2="${m.l + iw}" y2="${m.t + ih}" class="axis"/>
</svg>
<figcaption>Jeder Punkt ist eine veroeffentlichte Umfrage, aufgetragen nach Veroeffentlichungsdatum. Zwischen den Punkten wird nur verbunden, nicht interpoliert. Wo eine Partei nicht einzeln ausgewiesen wurde, bricht die Linie ab, statt auf null zu fallen.</figcaption>
</figure>`;
}

/** Gegenueberstellung Wahlergebnis und aktueller Trend als Paarbalken. */
export function comparison(current, previous, { colors, previousLabel, currentLabel, width = 760 }) {
  const parties = [...new Set([...Object.keys(current), ...Object.keys(previous)])]
    .filter((p) => (current[p] ?? 0) >= 1 || (previous[p] ?? 0) >= 1)
    .sort((a, b) => (current[b] ?? 0) - (current[a] ?? 0));
  const maxV = Math.max(...parties.flatMap((p) => [current[p] ?? 0, previous[p] ?? 0]), 10);
  const scale = Math.ceil(maxV / 10) * 10;

  const rowH = 46;
  const m = { l: 74, r: 84, t: 24, b: 12 };
  const iw = width - m.l - m.r;
  const height = m.t + parties.length * rowH + m.b;

  const rows = parties
    .map((p, i) => {
      const y = m.t + i * rowH;
      const cv = current[p];
      const pv = previous[p];
      const c = color(colors, p);
      const wCur = cv != null ? (cv / scale) * iw : 0;
      const wPrev = pv != null ? (pv / scale) * iw : 0;
      const delta = cv != null && pv != null ? cv - pv : null;
      return `<g>
  <text x="${m.l - 10}" y="${y + 20}" class="cat">${esc(p)}</text>
  ${pv != null ? `<rect x="${m.l}" y="${y + 2}" width="${wPrev.toFixed(1)}" height="12" fill="${esc(c)}" opacity="0.32"><title>${esc(previousLabel)}: ${num(pv)} Prozent</title></rect><text x="${(m.l + wPrev + 6).toFixed(1)}" y="${y + 12}" class="val val-muted">${num(pv)}</text>` : ''}
  ${cv != null ? `<rect x="${m.l}" y="${y + 18}" width="${wCur.toFixed(1)}" height="16" fill="${esc(c)}"><title>${esc(currentLabel)}: ${num(cv)} Prozent</title></rect><text x="${(m.l + wCur + 6).toFixed(1)}" y="${y + 31}" class="val">${num(cv)}</text>` : ''}
  ${delta != null ? `<text x="${width - 8}" y="${y + 24}" class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : '\u2212'}${num(Math.abs(delta))}</text>` : ''}
</g>`;
    })
    .join('');

  return `<figure class="chart">
<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Vergleich ${esc(previousLabel)} gegen ${esc(currentLabel)} je Partei in Prozent.">
  <text x="${m.l}" y="13" class="lbl">Blass: ${esc(previousLabel)} &nbsp;&nbsp; Kraeftig: ${esc(currentLabel)}</text>
  ${rows}
</svg>
<figcaption>Der blasse Balken ist ${esc(previousLabel)}, der kraeftige ${esc(currentLabel)}. Rechts die Differenz in Prozentpunkten. Parteien unter einem Prozent in beiden Werten sind ausgelassen.</figcaption>
</figure>`;
}

/** Koalitionen als gestapelte Balken mit Mehrheitslinie. */
export function coalitionBars(coalitions, { colors, totalSeats, majority, width = 760 }) {
  if (coalitions.length === 0) return '';
  const rowH = 34;
  const m = { l: 8, r: 8, t: 30, b: 24 };
  const iw = width - m.l - m.r;
  const height = m.t + coalitions.length * rowH + m.b;
  const X = (seats) => (seats / totalSeats) * iw;
  const majX = m.l + X(majority);

  const rows = coalitions
    .map((c, i) => {
      const y = m.t + i * rowH;
      let x = m.l;
      const segs = c.parties
        .map((p) => {
          const seats = c.seatsByParty[p];
          const w = X(seats);
          const rect = `<rect x="${x.toFixed(1)}" y="${y}" width="${Math.max(0, w - 1).toFixed(1)}" height="18" fill="${esc(color(colors, p))}"><title>${esc(p)}: ${int(seats)} Sitze</title></rect>${w > 34 ? `<text x="${(x + w / 2).toFixed(1)}" y="${y + 13}" class="seg">${esc(p)}</text>` : ''}`;
          x += w;
          return rect;
        })
        .join('');
      return `<g>
  ${segs}
  <text x="${(x + 8).toFixed(1)}" y="${y + 13}" class="val">${int(c.seats)}</text>
  <text x="${m.l}" y="${y + 30}" class="cap">${esc(c.parties.join(' + '))}, ${c.surplus === 0 ? 'exakt an der Mehrheit' : `${int(c.surplus)} Sitze darueber`}</text>
</g>`;
    })
    .join('');

  return `<figure class="chart">
<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Rechnerische Mehrheiten mit ${int(majority)} Sitzen als Schwelle.">
  <line x1="${majX.toFixed(1)}" y1="18" x2="${majX.toFixed(1)}" y2="${height - 16}" class="axis-dash"/>
  <text x="${(majX + 6).toFixed(1)}" y="13" class="lbl">Mehrheit ab ${int(majority)}</text>
  ${rows}
</svg>
<figcaption>Balkenbreite entspricht dem Sitzanteil an ${int(totalSeats)} Sitzen. Aufgefuehrt sind nur minimale Mehrheiten, aus denen kein Partner entfernt werden kann. Die Reihenfolge ist arithmetisch, nicht politisch gewichtet.</figcaption>
</figure>`;
}

/** Kleine Balkenreihe je Szenario, zum direkten Vergleich nebeneinander. */
export function scenarioStrip(scenarios, { colors, totalSeats, majority, width = 760 }) {
  const rowH = 52;
  const m = { l: 8, r: 8, t: 26, b: 8 };
  const iw = width - m.l - m.r;
  const height = m.t + scenarios.length * rowH + m.b;
  const majX = m.l + (majority / totalSeats) * iw;

  const rows = scenarios
    .map((s, i) => {
      const y = m.t + i * rowH;
      let x = m.l;
      const segs = Object.entries(s.seats)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([p, v]) => {
          const w = (v / totalSeats) * iw;
          const r = `<rect x="${x.toFixed(1)}" y="${y + 14}" width="${Math.max(0, w - 1).toFixed(1)}" height="20" fill="${esc(color(colors, p))}"><title>${esc(p)}: ${int(v)} Sitze</title></rect>${w > 30 ? `<text x="${(x + w / 2).toFixed(1)}" y="${y + 28}" class="seg">${esc(p)} ${int(v)}</text>` : ''}`;
          x += w;
          return r;
        })
        .join('');
      return `<g><text x="${m.l}" y="${y + 9}" class="cat cat-left">${esc(s.label)}</text>${segs}<text x="${m.l}" y="${y + 47}" class="cap">${esc(s.note)}</text></g>`;
    })
    .join('');

  return `<figure class="chart">
<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Vergleich der Sitzverteilung in ${scenarios.length} Szenarien.">
  <line x1="${majX.toFixed(1)}" y1="16" x2="${majX.toFixed(1)}" y2="${height - 4}" class="axis-dash"/>
  <text x="${(majX + 6).toFixed(1)}" y="11" class="lbl">Mehrheit ab ${int(majority)}</text>
  ${rows}
</svg>
<figcaption>Gleicher Stimmenanteil, unterschiedliche Sitzverteilung. Der Unterschied entsteht allein dadurch, wie viele Stimmen an der Sperrklausel verfallen.</figcaption>
</figure>`;
}
