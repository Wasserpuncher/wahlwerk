// Wahlwerk - Institutsgenauigkeit
// Lizenz: AGPL-3.0-or-later
//
// Vergleicht veroeffentlichte Umfragen mit dem amtlichen Wahlergebnis und macht
// damit aus einer behaupteten Zuverlaessigkeit eine belegte. Das Verfahren ist
// bewusst einfach gehalten, damit es von Hand nachrechenbar bleibt.
//
// Vier Regeln, die diese Auswertung von einer Gefaelligkeitsrechnung trennen:
//
//   1. Je Institut zaehlt genau eine Umfrage, naemlich die letzte vor dem
//      Wahltag. Wer viele Umfragen veroeffentlicht, bekommt dadurch weder
//      Vorteil noch Nachteil.
//   2. Verglichen wird nur, was beide Seiten ausweisen. Eine Partei, die ein
//      Institut nicht abfragt, wird uebersprungen und nicht als null gewertet.
//      Der Unterschied zwischen "nicht erhoben" und "null Prozent" ist
//      wesentlich.
//   3. Sammelposten wie "Sonstige" bleiben aussen vor. Sie sind die Summe
//      wechselnder Parteien und auf beiden Seiten nicht dasselbe.
//   4. Damit die Kennzahlen zwischen Instituten vergleichbar sind, wird
//      zusaetzlich eine Kernmenge gebildet: die Parteien, die jedes
//      beruecksichtigte Institut ausweist. Nur die Kennzahl auf dieser
//      Kernmenge erlaubt eine Rangfolge.
//
// Was hier bewusst NICHT passiert: eine Korrektur von Hauseffekten, eine
// Hochrechnung oder eine Bewertung der Institute. Die Auswertung zeigt
// Abweichungen eines einzelnen Stichtags. Ein Institut mit einer grossen
// Abweichung bei einer Wahl ist deshalb nicht schlechter als eines mit einer
// kleinen; dafuer braeuchte es viele Wahlen.

/**
 * Waehlt je Institut die letzte Umfrage, deren Feldzeit vor dem Wahltag endete.
 *
 * @param {Array} surveys   normalisierte Umfragen eines Parlaments
 * @param {string} wahltag  ISO-Datum des Wahltags
 * @param {number} fensterTage  nur Umfragen innerhalb dieses Fensters vor der Wahl
 */
export function letzteUmfrageJeInstitut(surveys, wahltag, fensterTage = 30) {
  const wahl = Date.parse(`${wahltag}T00:00:00Z`);
  if (!Number.isFinite(wahl)) throw new RangeError(`Ungueltiger Wahltag: ${wahltag}`);

  const jeInstitut = new Map();
  for (const s of surveys) {
    const institut = s.institute;
    if (!institut) continue;

    // Massgeblich ist das Ende der Feldzeit, nicht das Veroeffentlichungsdatum.
    // Eine Umfrage misst die Stimmung im Feldzeitraum.
    const ende = s.dateEnd ?? s.date;
    const t = Date.parse(`${ende}T00:00:00Z`);
    if (!Number.isFinite(t)) continue;

    // Umfragen nach dem Wahltag gehoeren nicht in eine Vorhersagebewertung.
    if (t > wahl) continue;

    const tageVorWahl = Math.round((wahl - t) / 86400000);
    if (tageVorWahl > fensterTage) continue;

    const vorhanden = jeInstitut.get(institut);
    if (!vorhanden || t > vorhanden.zeit) {
      jeInstitut.set(institut, { survey: s, zeit: t, tageVorWahl });
    }
  }
  return [...jeInstitut.entries()]
    .map(([institut, v]) => ({ institut, ...v }))
    .sort((a, b) => b.zeit - a.zeit);
}

/**
 * Vergleicht eine einzelne Umfrage mit dem amtlichen Ergebnis.
 * Positive Differenz bedeutet: das amtliche Ergebnis lag hoeher als die
 * Umfrage, die Partei wurde also unterschaetzt.
 */
export function vergleicheUmfrage(umfrageWerte, amtlich, { aggregates = new Set(), nurParteien = null } = {}) {
  const abweichungen = {};
  for (const [partei, umfrageWert] of Object.entries(umfrageWerte)) {
    if (aggregates.has(partei.toLowerCase())) continue;
    if (nurParteien && !nurParteien.has(partei)) continue;
    const amtlicherWert = amtlich[partei];
    if (amtlicherWert === undefined || !Number.isFinite(umfrageWert)) continue;
    abweichungen[partei] = Number((amtlicherWert - umfrageWert).toFixed(2));
  }

  const werte = Object.values(abweichungen);
  if (werte.length === 0) return null;

  const mad = werte.reduce((a, d) => a + Math.abs(d), 0) / werte.length;
  const bias = werte.reduce((a, d) => a + d, 0) / werte.length;
  let groesster = null;
  for (const [partei, d] of Object.entries(abweichungen)) {
    if (!groesster || Math.abs(d) > Math.abs(groesster.differenz)) groesster = { partei, differenz: d };
  }

  return {
    abweichungen,
    verglicheneParteien: werte.length,
    mittlereAbsoluteAbweichung: Number(mad.toFixed(2)),
    mittlereAbweichung: Number(bias.toFixed(2)),
    groessterFehler: groesster,
  };
}

/**
 * Vollstaendige Auswertung fuer ein Parlament.
 *
 * Gibt null zurueck, wenn die Grundlage fehlt: kein amtliches Ergebnis, keine
 * Umfragen im Fenster, oder synthetische Daten. Das ist Absicht. Eine
 * Genauigkeitsauswertung auf erfundenen Umfragen waere die schaedlichste
 * Zahl, die dieses Projekt ausgeben koennte.
 */
export function computeAccuracy(surveys, wahlergebnis, options = {}) {
  const {
    fensterTage = 30,
    aggregateCategories = ['Sonstige'],
    istSynthetisch = false,
  } = options;

  if (istSynthetisch) {
    return { verfuegbar: false, grund: 'synthetisch' };
  }
  if (!wahlergebnis || !wahlergebnis.ergebnisProjektnamen) {
    return { verfuegbar: false, grund: 'kein-ergebnis' };
  }

  const aggregates = new Set(aggregateCategories.map((s) => s.toLowerCase()));
  const amtlich = {};
  for (const [partei, wert] of Object.entries(wahlergebnis.ergebnisProjektnamen)) {
    if (aggregates.has(partei.toLowerCase())) continue;
    amtlich[partei] = wert;
  }

  const wahltag = wahlergebnis.wahl.wahltag;
  const ausgewaehlt = letzteUmfrageJeInstitut(surveys, wahltag, fensterTage);

  if (ausgewaehlt.length === 0) {
    return { verfuegbar: false, grund: 'keine-umfragen-im-fenster', fensterTage };
  }

  // Kernmenge: Parteien, die jedes beruecksichtigte Institut ausweist und fuer
  // die ein amtlicher Wert vorliegt. Nur darauf sind die Institute vergleichbar.
  let kern = null;
  for (const a of ausgewaehlt) {
    const hier = new Set(
      Object.keys(a.survey.results).filter((p) => !aggregates.has(p.toLowerCase()) && amtlich[p] !== undefined),
    );
    kern = kern === null ? hier : new Set([...kern].filter((p) => hier.has(p)));
  }

  const institute = [];
  for (const a of ausgewaehlt) {
    const voll = vergleicheUmfrage(a.survey.results, amtlich, { aggregates });
    const aufKern = vergleicheUmfrage(a.survey.results, amtlich, { aggregates, nurParteien: kern });
    if (!voll) continue;
    institute.push({
      institut: a.institut,
      surveyId: a.survey.id,
      feldEnde: a.survey.dateEnd ?? a.survey.date,
      veroeffentlicht: a.survey.date,
      tageVorWahl: a.tageVorWahl,
      befragte: a.survey.surveyedPersons ?? null,
      auftraggeber: a.survey.tasker ?? null,
      werte: a.survey.results,
      ...voll,
      kern: aufKern,
    });
  }

  if (institute.length === 0) {
    return { verfuegbar: false, grund: 'kein-vergleich-moeglich', fensterTage };
  }

  // Abweichung je Partei ueber alle beruecksichtigten Institute. Die mittlere
  // Abweichung mit Vorzeichen ist hier die interessantere Zahl: sie zeigt, ob
  // eine Partei systematisch von allen Instituten zu hoch oder zu niedrig
  // eingeschaetzt wurde.
  const jePartei = {};
  for (const partei of Object.keys(amtlich)) {
    const werte = institute.map((i) => i.abweichungen[partei]).filter((d) => d !== undefined);
    if (werte.length === 0) continue;
    const mad = werte.reduce((a, d) => a + Math.abs(d), 0) / werte.length;
    const bias = werte.reduce((a, d) => a + d, 0) / werte.length;
    jePartei[partei] = {
      amtlich: amtlich[partei],
      institute: werte.length,
      mittlereAbsoluteAbweichung: Number(mad.toFixed(2)),
      mittlereAbweichung: Number(bias.toFixed(2)),
      spanne: {
        min: Number(Math.min(...werte).toFixed(2)),
        max: Number(Math.max(...werte).toFixed(2)),
      },
    };
  }

  const kernWerte = institute.map((i) => i.kern?.mittlereAbsoluteAbweichung).filter((v) => Number.isFinite(v));
  const gesamtMad = kernWerte.length ? kernWerte.reduce((a, b) => a + b, 0) / kernWerte.length : null;

  return {
    verfuegbar: true,
    wahltag,
    fensterTage,
    kernparteien: [...(kern ?? [])],
    institute,
    jePartei,
    gesamtMittlereAbsoluteAbweichung: gesamtMad === null ? null : Number(gesamtMad.toFixed(2)),
    status: wahlergebnis.status,
  };
}

/**
 * Prueft, ob eine Partei die Sperrklausel nach Umfrage und nach amtlichem
 * Ergebnis unterschiedlich passiert. Genau hier entscheidet sich, ob eine
 * Umfrage die Mehrheitsverhaeltnisse richtig angedeutet hat, denn an der
 * Sperrklausel haengen ganze Sitzbloecke.
 */
export function huerdenVergleich(trendWerte, amtlich, schwelle = 5, aggregateCategories = ['Sonstige']) {
  const aggregates = new Set(aggregateCategories.map((s) => s.toLowerCase()));
  const zeilen = [];
  const parteien = new Set([...Object.keys(trendWerte ?? {}), ...Object.keys(amtlich ?? {})]);
  for (const partei of parteien) {
    if (aggregates.has(partei.toLowerCase())) continue;
    const t = trendWerte?.[partei];
    const a = amtlich?.[partei];
    if (!Number.isFinite(t) || !Number.isFinite(a)) continue;
    const trendDrin = t >= schwelle;
    const amtlichDrin = a >= schwelle;
    zeilen.push({
      partei,
      trend: t,
      amtlich: a,
      differenz: Number((a - t).toFixed(2)),
      trendDrin,
      amtlichDrin,
      abweichend: trendDrin !== amtlichDrin,
    });
  }
  return zeilen.sort((x, y) => y.amtlich - x.amtlich);
}
