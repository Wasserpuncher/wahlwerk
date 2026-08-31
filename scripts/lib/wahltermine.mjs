// Wahlwerk - Wahltermine und Wahlphasen
// Lizenz: AGPL-3.0-or-later
//
// Diese Datei rechnet ausschliesslich mit Terminen, die in
// config/wahltermine.json stehen. Dort steht nur, was die Bundeswahlleiterin
// veroeffentlicht hat. Es wird hier KEIN Termin geraten, verschoben oder aus
// einem Turnus hochgerechnet.
//
// Die zentrale Schwierigkeit einer statischen Seite an einem Wahltag: Die
// Seite kennt nur den Zeitpunkt ihres letzten Baus. Ein Countdown, der beim
// Bau "noch 6 Tage" sagt, steht auch dann noch da, wenn seit dem Bau eine
// Woche vergangen ist. Deshalb nennt jede Ausgabe den Bautag mit, und die
// Phase wird aus dem Bautag abgeleitet, nicht behauptet.

/** Ganze Tage von a nach b, beide als ISO-Datum. Negativ, wenn b vor a liegt. */
export function tageZwischen(isoA, isoB) {
  const a = Date.parse(`${isoA}T00:00:00Z`);
  const b = Date.parse(`${isoB}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * Phase eines Wahltermins, gemessen am Bautag.
 *
 *   vorwahl   - der Wahltag liegt in der Zukunft
 *   wahltag   - gebaut wurde am Wahltag selbst
 *   nachwahl  - der Wahltag ist vorbei
 *
 * Ohne exaktes Datum (die Quelle nennt nur "Fruehjahr" oder "Herbst") gibt es
 * keine Phase und keinen Countdown. Das ist Absicht: eine Jahreszeit ist kein
 * Datum, und eine erfundene Genauigkeit waere schlimmer als keine Angabe.
 */
export function phase(datum, bautag) {
  if (!datum) return 'unbestimmt';
  const d = tageZwischen(bautag, datum);
  if (d === null) return 'unbestimmt';
  if (d > 0) return 'vorwahl';
  if (d === 0) return 'wahltag';
  return 'nachwahl';
}

/** Slug fuer die Detailseite eines Termins, z. B. landtagswahl-sachsen-anhalt-2026. */
export function terminSlug(termin, slugFn) {
  return slugFn(`${termin.art}-${termin.land}-${termin.jahr}`);
}

/** Anzeigename, z. B. "Landtagswahl Sachsen-Anhalt 2026". */
export function terminName(termin) {
  return termin.land === 'alle'
    ? `${termin.art} ${termin.jahr}`
    : `${termin.art} ${termin.land} ${termin.jahr}`;
}

/**
 * Bereitet die Termine fuer den Bau auf: sortiert nach Datum, mit Phase,
 * Restdauer und der Verknuepfung zum Parlament im Umfragebestand.
 *
 * parlamentNachKuerzel bildet das Kuerzel aus config/wahltermine.json auf den
 * langen Namen ab, unter dem das Parlament im Umfragebestand gefuehrt wird.
 * Genau diese Uebersetzung hat am 27.08.2026 elf Tage lang gefehlt und alle
 * 16 Laender still in den Zweig "nicht verifiziert" fallen lassen. Sie wird
 * hier deshalb nicht stillschweigend uebersprungen, sondern ausgewiesen:
 * findet sie nichts, bleibt parlamentName null und die Seite sagt das.
 */
export function bereiteTermine(config, bautag, parlamentNachKuerzel) {
  return config.termine
    .map((t) => {
      const p = phase(t.datum, bautag);
      return {
        ...t,
        phase: p,
        tageBis: t.datum ? tageZwischen(bautag, t.datum) : null,
        parlamentName: t.parlament ? (parlamentNachKuerzel.get(t.parlament) ?? null) : null,
        parlamentFehlt: Boolean(t.parlament) && !parlamentNachKuerzel.has(t.parlament),
      };
    })
    .sort((a, b) => {
      // Termine mit Datum zuerst, chronologisch. Danach die nur grob
      // datierten, nach Jahr. Innerhalb desselben Tages alphabetisch, damit
      // der Bau reproduzierbar bleibt.
      if (a.datum && b.datum) return a.datum.localeCompare(b.datum) || a.land.localeCompare(b.land);
      if (a.datum) return -1;
      if (b.datum) return 1;
      return a.jahr - b.jahr || a.land.localeCompare(b.land);
    });
}

/** Die naechste bevorstehende Wahl mit exaktem Datum, oder null. */
export function naechsteWahl(termine) {
  return termine.find((t) => t.datum && (t.phase === 'vorwahl' || t.phase === 'wahltag')) ?? null;
}
