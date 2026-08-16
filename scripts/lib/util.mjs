// Wahlwerk - Hilfsfunktionen
// Lizenz: AGPL-3.0-or-later

/** HTML-Escaping fuer Textinhalte und Attributwerte. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Escaping fuer JSON-LD, das in ein script-Tag eingebettet wird. */
export function jsonLd(obj) {
  return JSON.stringify(obj, null, 2).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
}

const UMLAUT_MAP = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'ae', Ö: 'oe', Ü: 'ue', ß: 'ss' };

/** URL-Slug: stabil, kleingeschrieben, ohne Umlaute, ohne doppelte Trenner. */
export function slug(input) {
  if (!input) return '';
  return String(input)
    .replace(/[äöüÄÖÜß]/g, (c) => UMLAUT_MAP[c])
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Deutsche Zahlendarstellung mit fester Nachkommastelle. */
export function num(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n.a.';
  return Number(value).toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Ganzzahl mit Tausenderpunkt. */
export function int(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n.a.';
  return Number(value).toLocaleString('de-DE');
}

/** ISO-Datum (YYYY-MM-DD) zu deutschem Datum. Gibt bei ungueltigem Input null zurueck. */
export function deDate(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}

/** Differenz in ganzen Tagen zwischen zwei ISO-Daten. */
export function daysBetween(isoA, isoB) {
  const a = new Date(`${isoA}T00:00:00Z`).getTime();
  const b = new Date(`${isoB}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** Groesstes ISO-Datum aus einer Liste. */
export function maxDate(list) {
  return list.filter(Boolean).sort().at(-1) ?? null;
}

/** Deterministischer Vergleich fuer stabile Sortierung und reproduzierbare Builds. */
export function byKey(fn, dir = 1) {
  return (a, b) => {
    const x = fn(a);
    const y = fn(b);
    if (x < y) return -1 * dir;
    if (x > y) return 1 * dir;
    return 0;
  };
}
