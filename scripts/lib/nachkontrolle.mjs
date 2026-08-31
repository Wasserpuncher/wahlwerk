// Wahlwerk - Nachkontrolle: Umfrage gegen amtliches Ergebnis
// Lizenz: AGPL-3.0-or-later
//
// Eine Umfrage ist eine Behauptung ueber die Zukunft. Am Wahlabend wird sie
// nachpruefbar. Diese Datei rechnet genau diesen Abgleich und sonst nichts.
//
// Vorgehen:
//   1. Aus dem Bestand werden ausschliesslich Umfragen genommen, deren
//      letzter Befragungstag VOR dem Wahltag liegt. Alles am Wahltag selbst
//      oder danach ist keine Vorhersage mehr und wuerde die Kontrolle
//      wertlos machen.
//   2. Auf diesen Bestand wird derselbe Trend gerechnet wie ueberall sonst
//      auf der Seite, mit denselben Parametern. Es wird kein nachtraeglich
//      guenstigeres Verfahren gewaehlt. computeTrend verankert sein Zeit-
//      fenster an der juengsten Umfrage des uebergebenen Bestandes, hier also
//      an der letzten Umfrage vor der Wahl.
//   3. Verglichen wird Partei fuer Partei gegen das amtliche Ergebnis.
//
// Was diese Rechnung NICHT ist: eine Bewertung einzelner Institute. Der Trend
// mittelt ueber Institute; ein Fehler des Mittelwertes ist kein Fehler eines
// bestimmten Hauses. Und ein einzelner Abgleich ist kein Beleg fuer eine
// systematische Verzerrung, sondern ein einzelner Datenpunkt.
//
// Die groesste Falle steckt in den Parteinamen. Das amtliche Ergebnis fuehrt
// "FW", der Umfragebestand "Freie Wähler". Ein stiller Namensfehlschlag wuerde
// die Partei einfach aus der Rechnung fallen lassen und einen zu schoenen
// mittleren Fehler erzeugen. Deshalb wird jede nicht zuordenbare Partei
// gezaehlt und namentlich zurueckgegeben, statt weggelassen zu werden.

import { computeTrend } from './trend.mjs';

export function nachkontrolle(surveys, wahl, trendConfig, aliasse = {}) {
  if (!wahl?.date || !wahl?.results) return null;

  const davor = surveys.filter((s) => (s.dateEnd ?? s.date) < wahl.date);
  if (davor.length === 0) return { moeglich: false, grund: 'keine Umfrage vor dem Wahltag im Bestand' };

  const trend = computeTrend(davor, trendConfig);
  if (!trend || trend.insufficient) {
    return {
      moeglich: false,
      grund: `weniger als ${trendConfig.minSurveys} Umfragen im Zeitfenster von ${trendConfig.maxAgeDays} Tagen vor der Wahl`,
      verfuegbar: trend?.availableSurveys ?? 0,
    };
  }

  // Amtlicher Name -> Name im Umfragebestand.
  const nachBestand = (amtlich) => aliasse[amtlich] ?? amtlich;

  const zeilen = [];
  const ohneUmfragewert = [];
  for (const [partei, amtlich] of Object.entries(wahl.results)) {
    const key = nachBestand(partei);
    const umfrage = trend.values[key];
    if (umfrage === undefined) {
      ohneUmfragewert.push({ partei, gesuchtAls: key });
      continue;
    }
    zeilen.push({
      partei,
      bestandName: key,
      umfrage,
      amtlich,
      abweichung: umfrage - amtlich,
      intervall: trend.intervals?.[key] ?? null,
      // Lag das amtliche Ergebnis im 95-Prozent-Intervall der Umfrage? Das
      // Intervall bildet nur den Stichprobenfehler ab, nicht die Verzerrung
      // durch Gewichtung und Nonresponse. Ein Treffer ist deshalb kein
      // Guetesiegel und ein Fehlschlag kein Beweis fuer Schlamperei.
      imIntervall: trend.intervals?.[key]
        ? amtlich >= trend.intervals[key].lower && amtlich <= trend.intervals[key].upper
        : null,
    });
  }

  // Parteien, die die Umfragen fuehrten, das amtliche Ergebnis aber nicht
  // einzeln ausweist. Auch das wird genannt statt verschwiegen.
  const amtlicheKeys = new Set(Object.keys(wahl.results).map(nachBestand));
  const ohneAmtlichenWert = Object.keys(trend.values)
    .filter((k) => !amtlicheKeys.has(k))
    .map((k) => ({ partei: k, umfrage: trend.values[k] }));

  zeilen.sort((a, b) => b.amtlich - a.amtlich);

  const betraege = zeilen.map((z) => Math.abs(z.abweichung));
  const mittlererFehler = betraege.length ? betraege.reduce((a, b) => a + b, 0) / betraege.length : null;
  const groesster = zeilen.length
    ? zeilen.reduce((a, b) => (Math.abs(b.abweichung) > Math.abs(a.abweichung) ? b : a))
    : null;

  return {
    moeglich: true,
    wahldatum: wahl.date,
    label: wahl.label ?? null,
    stichtag: trend.anchorDate,
    tageVorDerWahl: Math.round(
      (Date.parse(`${wahl.date}T00:00:00Z`) - Date.parse(`${trend.anchorDate}T00:00:00Z`)) / 86400000,
    ),
    verwendeteUmfragen: trend.surveysUsed,
    zeilen,
    ohneUmfragewert,
    ohneAmtlichenWert,
    mittlererFehler,
    groesster,
    imIntervallAnteil: zeilen.filter((z) => z.imIntervall === true).length,
    imIntervallGeprueft: zeilen.filter((z) => z.imIntervall !== null).length,
    trend,
  };
}
