// Wahlwerk - Statistik
// Lizenz: AGPL-3.0-or-later
//
// Alle Funktionen hier sind reine Mathematik und in scripts/check.mjs gegen
// publizierte Referenzwerte geprueft.
//
// WARUM WILSON UND NICHT DIE NORMALAPPROXIMATION
//
// Die uebliche Faustformel fuer das Konfidenzintervall eines Anteils lautet
//   p ± z · sqrt(p(1-p)/n)
// Das ist die Wald-Approximation. Sie ist bei kleinen Anteilen nachweislich
// schlecht: Sie ist symmetrisch, kann Grenzen unter null oder ueber eins
// erzeugen, und ihre tatsaechliche Ueberdeckung liegt teils deutlich unter dem
// nominellen Niveau. Genau der kritische Bereich einer Sonntagsfrage, also
// Parteien um die Fuenfprozenthuerde, ist davon betroffen.
//
// Das Wilson-Score-Intervall loest die Ungleichung
//   |p̂ - p| / sqrt(p(1-p)/n) ≤ z
// nach p auf, statt p durch p̂ zu ersetzen. Ergebnis:
//
//   Mitte     = (p̂ + z²/(2n)) / (1 + z²/n)
//   Halbbreite= z/(1 + z²/n) · sqrt( p̂(1-p̂)/n + z²/(4n²) )
//
// Das Intervall ist asymmetrisch, bleibt immer innerhalb von null bis eins und
// hat eine deutlich bessere Ueberdeckung. Es ist damit die korrekte Wahl.

/** z-Werte fuer gaengige Konfidenzniveaus. */
export const Z = { 0.9: 1.6448536269514722, 0.95: 1.959963984540054, 0.99: 2.5758293035489004 };

/**
 * Wilson-Score-Intervall fuer einen Anteil.
 * @param {number} pHat Anteil als Bruchteil zwischen 0 und 1
 * @param {number} n Stichprobengroesse
 * @param {number} z z-Wert, Standard 1,96 fuer 95 Prozent
 * @param {number} designEffect Varianzaufblaehung durch das Stichprobendesign
 */
export function wilson(pHat, n, z = Z[0.95], designEffect = 1) {
  if (!(n > 0)) return null;
  if (pHat < 0 || pHat > 1) throw new RangeError(`Anteil ausserhalb von 0 bis 1: ${pHat}`);
  // Ein Designeffekt deff bedeutet, dass die Varianz um Faktor deff steigt.
  // Aequivalent dazu ist eine effektive Stichprobengroesse n_eff = n / deff.
  const nEff = n / (designEffect > 0 ? designEffect : 1);
  const z2 = z * z;
  const denom = 1 + z2 / nEff;
  const centre = (pHat + z2 / (2 * nEff)) / denom;
  const half = (z / denom) * Math.sqrt((pHat * (1 - pHat)) / nEff + z2 / (4 * nEff * nEff));
  return {
    centre,
    lower: Math.max(0, centre - half),
    upper: Math.min(1, centre + half),
    half,
    nEff,
  };
}

/**
 * Fehlertoleranz eines Umfragewerts in Prozentpunkten.
 * Eingabe und Ausgabe in Prozent, nicht als Bruchteil.
 */
export function marginPercent(valuePercent, n, { z = Z[0.95], designEffect = 1 } = {}) {
  const ci = wilson(valuePercent / 100, n, z, designEffect);
  if (!ci) return null;
  return {
    lower: ci.lower * 100,
    upper: ci.upper * 100,
    lowerDelta: valuePercent - ci.lower * 100,
    upperDelta: ci.upper * 100 - valuePercent,
    nEff: ci.nEff,
  };
}

/**
 * Standardfehler der Differenz zweier Anteile aus DERSELBEN Stichprobe.
 * Wichtig: Die Anteile sind negativ korreliert, weil sich alle Anteile zu eins
 * ergaenzen. Die naive Formel sqrt(se1² + se2²) unterstellt Unabhaengigkeit
 * und unterschaetzt den Fehler deshalb systematisch. Korrekt ist fuer eine
 * Multinomialverteilung:
 *   Var(p1 - p2) = ( p1(1-p1) + p2(1-p2) + 2·p1·p2 ) / n
 * denn Cov(p1, p2) = -p1·p2/n.
 */
export function seDifferenceSameSample(p1Percent, p2Percent, n, { designEffect = 1 } = {}) {
  if (!(n > 0)) return null;
  const nEff = n / (designEffect > 0 ? designEffect : 1);
  const p1 = p1Percent / 100;
  const p2 = p2Percent / 100;
  const variance = (p1 * (1 - p1) + p2 * (1 - p2) + 2 * p1 * p2) / nEff;
  return Math.sqrt(variance) * 100;
}

/**
 * Gewichteter Mittelwert mit dem zugehoerigen effektiven Stichprobenumfang
 * nach Kish. Wird gebraucht, um dem Trend eine ehrliche Fehlertoleranz zu
 * geben, statt einfach die Fallzahlen zu addieren.
 *
 *   n_eff = (Σ w_i)² / Σ w_i²
 *
 * Bei gleichen Gewichten ergibt das die Anzahl der Umfragen, bei stark
 * ungleichen Gewichten weniger. Multipliziert mit der mittleren Fallzahl
 * liefert es den effektiven Umfang der Zusammenfassung.
 *
 * WAS DIESE ZAHL NICHT LEISTET, ausdruecklich festgehalten am 27.08.2026:
 * Bei GLEICHEN Gewichten ist das Ergebnis exakt die Summe der Fallzahlen, denn
 * (k*w)^2 / (k*w^2) * (w*Sn)/(k*w) = Sn. Der Abschlag entsteht allein durch
 * ungleiche Gewichte, nicht dadurch, dass die Werte aus verschiedenen
 * Erhebungen stammen. Die Varianz ZWISCHEN den Instituten geht also nicht ein:
 * gerechnet wird so, als waeren alle Befragten eine einzige Zufallsstichprobe.
 * Das daraus abgeleitete Intervall ist deshalb eine untere Schranke und darf
 * nie als die tatsaechliche Unsicherheit einer Wahlumfrage ausgegeben werden.
 * Wer das aendern will, braucht einen belegten Designeffekt; siehe den Hinweis
 * zu trend.designEffect in config/site.json und docs/ROADMAP.md.
 */
export function kishEffectiveSize(weights, sampleSizes) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const sumSq = weights.reduce((a, b) => a + b * b, 0);
  if (sumSq === 0) return null;
  const effSurveys = (sum * sum) / sumSq;
  const weightedN = weights.reduce((acc, w, i) => acc + w * sampleSizes[i], 0) / (sum || 1);
  return { effectiveSurveys: effSurveys, meanSampleSize: weightedN, effectiveSampleSize: effSurveys * weightedN };
}
