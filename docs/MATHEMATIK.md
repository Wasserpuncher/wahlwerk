# Mathematik und ihre Grenzen

Dieses Dokument sagt, was gerechnet wird, warum genau so, und wo die Rechnung endet. Jede Formel hier ist in `scripts/check.mjs` gegen von Hand nachgerechnete oder publizierte Referenzwerte geprüft.

## Korrekturen am 16. August 2026

Bei einer Prüfung des Rechenkerns sind drei Fehler aufgefallen. Sie sind behoben und durch Regressionstests abgesichert.

### Fehler 1: Sammelposten konnten Sitze erhalten

`distribute()` behandelte die Kategorie "Sonstige" wie eine Partei. Erreichte sie die Sperrklausel, bekam sie Sitze. Das ist falsch. "Sonstige" ist die Summe mehrerer Parteien, von denen einzeln in aller Regel keine die Hürde nimmt. Ein Sammelposten von sechs Prozent bedeutet gerade nicht, dass eine Partei mit sechs Prozent einzieht.

Der Fehler wäre in Sachsen-Anhalt nicht aufgefallen, weil der Sammelposten dort bei 3,5 Prozent liegt. In der Einzelumfrage von Infratest dimap vom 30. Juli 2026 steht er aber bei 6,0 Prozent. Ein Trend aus solchen Werten hätte eine Phantomfraktion erzeugt.

Behoben durch die Liste `aggregateCategories` in `config/parliaments.json`. Diese Kategorien werden vor der Zuteilung entfernt, unabhängig von ihrem Wert, und die Entfernung wird auf der Seite ausgewiesen.

### Fehler 2: Gleichstände wurden nie erkannt

`detectTies()` verglich die Quotienten **nach** der Sitzvergabe mit der Gewinnquote der letzten Runde. Da sich der Divisor der siegreichen Partei durch den erhaltenen Sitz bereits erhöht hatte, konnte dieser Vergleich einen echten Gleichstand niemals finden. Die Funktion gab immer eine leere Liste zurück und war damit wirkungslos.

Behoben: Die Gleichstandsprüfung findet jetzt **in** der Entscheidungsrunde statt. Teilen sich dort zwei oder mehr Parteien die höchste Quote, wird das gemeldet und auf der Seite als Warnung ausgegeben, weil im Wahlrecht in solchen Fällen das Los entscheidet und die programmatische Zuordnung damit willkürlich ist.

### Fehler 3: Die Gewichtungsformel war falsch begründet

Die Methodik behauptete: Der Standardfehler falle mit 1/√n, deshalb sei √n das richtige Gewicht. Das ist ein Denkfehler. Bei varianzoptimaler Mittelung ist das Gewicht der Kehrwert der Varianz. Die Varianz eines Anteils fällt mit 1/n, das statistisch optimale Gewicht wäre also n und nicht √n.

Die Formel selbst bleibt, aber die Begründung ist jetzt ehrlich, und der Exponent ist konfigurierbar (`trend.precisionExponent`):

- **Exponent 1**: varianzoptimal, sofern der Fehler rein aus der Stichprobenziehung stammt.
- **Exponent 0,5** (Standard): bewusste Dämpfung. Der Fehler einer Wahlumfrage wird nicht vom Stichprobenfehler dominiert, sondern von Gewichtungsmodellen, Nonresponse und Hauseffekten. Diese Anteile sinken mit wachsendem n nicht. Voller Exponent würde ein großes Onlinepanel gegenüber einer sorgfältigen Telefonstichprobe überbewerten.
- **Exponent 0**: Fallzahl ignorieren.

Das ist eine Modellentscheidung und keine Herleitung. Sie steht jetzt als solche da.

## Konfidenzintervalle: Wilson statt Wald

Die verbreitete Faustformel für den Fehlerbereich eines Anteils lautet

    p ± z · √( p(1-p) / n )

Das ist die Wald-Approximation. Sie ist im hier entscheidenden Bereich nachweislich schlecht: Sie ist symmetrisch, kann Grenzen unter null erzeugen, und bei kleinen Anteilen liegt ihre tatsächliche Überdeckung deutlich unter dem nominellen Niveau. Bei null Beobachtungen liefert sie ein Intervall der Breite null, also die Aussage, der wahre Wert sei mit Sicherheit exakt null. Das ist offensichtlich unsinnig.

Genau der kritische Bereich einer Sonntagsfrage, Parteien um die Fünfprozenthürde, ist davon betroffen.

Verwendet wird deshalb das **Wilson-Score-Intervall**. Es löst die Ungleichung

    |p̂ - p| / √( p(1-p)/n )  ≤  z

nach p auf, statt p im Nenner durch p̂ zu ersetzen. Ergebnis:

    Mitte      = ( p̂ + z²/(2n) ) / ( 1 + z²/n )
    Halbbreite = z/(1 + z²/n) · √( p̂(1-p̂)/n + z²/(4n²) )

Das Intervall ist asymmetrisch, bleibt immer zwischen null und eins und hat eine deutlich bessere Überdeckung.

Geprüft gegen publizierte Referenzwerte: 50 von 100 bei 95 Prozent ergibt 0,4038 bis 0,5962. Null von 100 ergibt 0 bis 0,0370.

## Effektiver Stichprobenumfang statt Addition

Der Trend fasst mehrere Umfragen zusammen. Die Fallzahlen einfach zu addieren wäre falsch, weil die Umfragen unterschiedlich gewichtet eingehen und weil sie nicht aus einer gemeinsamen Zufallsstichprobe stammen.

Verwendet wird die **Kish-Formel** für den effektiven Stichprobenumfang:

    n_eff = (Σ wᵢ)² / Σ wᵢ²

Bei gleichen Gewichten ergibt das die Anzahl der Umfragen, bei stark ungleichen Gewichten weniger. Multipliziert mit der gewichteten mittleren Fallzahl ergibt sich der effektive Umfang der Zusammenfassung.

Für Sachsen-Anhalt am 12. August 2026: drei Umfragen, Kish-Effektivumfang rund 2865 statt der naiven Summe 4753. Das Konfidenzintervall wird dadurch breiter und damit ehrlicher.

## Differenz zweier Parteien

Für den Abstand zweier Parteien aus **derselben** Umfrage ist die naive Formel √(se₁² + se₂²) falsch. Sie unterstellt Unabhängigkeit, aber die Anteile sind negativ korreliert, weil sie sich zu eins ergänzen. Korrekt ist für eine Multinomialverteilung:

    Var(p₁ - p₂) = ( p₁(1-p₁) + p₂(1-p₂) + 2·p₁·p₂ ) / n

denn Cov(p₁, p₂) = -p₁·p₂/n. Der Fehler der Differenz ist also **größer**, nicht kleiner, als die naive Rechnung nahelegt. Ein Vorsprung ist damit weniger belastbar, als er auf den ersten Blick aussieht.

## Der Designeffekt: die ehrlichste Stelle des Dokuments

Alle obigen Intervalle unterstellen eine **reine Zufallsstichprobe**. Reale Wahlumfragen sind das nicht. Quotierung, Gewichtung nach Parteibindung und vergangenem Wahlverhalten, Nonresponse und Panel-Selbstselektion blähen die Varianz auf. Der Faktor heißt Designeffekt und liegt in der Praxis über eins.

Der Standardwert in `config/site.json` ist **1,0**. Das ist die untere Schranke der Unsicherheit, nicht ihr realistischer Wert. Ich setze bewusst keine höhere Zahl ein, weil ich keine belastbare Quelle für einen konkreten Designeffekt der hier verarbeiteten Institute habe, und eine geschätzte Zahl wäre genau das, was dieses Projekt nicht tut.

Zur Einordnung: Die tatsächliche mittlere Abweichung aller Institute vom amtlichen Ergebnis lag bei der Landtagswahl Sachsen-Anhalt 2021 bei 2,86 Prozentpunkten, im Einzelfall bei bis zu 10,1. Die hier ausgewiesenen Intervalle von rund ±0,8 bis ±1,8 Prozentpunkten sind also deutlich zu eng, um die reale Treffsicherheit abzubilden. Wer den Designeffekt erhöht, muss die Quelle dafür in `docs/` nennen.

## Sperrklausel: mindestens, nicht mehr als

Die Wahlgesetze formulieren "mindestens 5 vom Hundert". Der Vergleich im Code ist deshalb `>=` und nicht `>`. Bei exakt 5,0 Prozent ist eine Partei beteiligt. Ein eigener Test sichert diesen Grenzfall ab.

## Bekannte Eigenarten der Zuteilungsverfahren

**Hare/Niemeyer** kann das Alabama-Paradoxon zeigen: Eine Vergrößerung der Sitzzahl kann einer Partei einen Sitz **nehmen**. Das ist keine Fehlimplementierung, sondern eine bekannte Eigenschaft des Quotenverfahrens. Sachsen-Anhalt schreibt es gesetzlich vor, also wird es verwendet.

**Divisorverfahren** wie Sainte-Laguë und d'Hondt sind frei von diesem Paradoxon, verletzen aber die Quotenbedingung: Eine Partei kann mehr oder weniger Sitze erhalten, als ihr exakter Anteil nahelegt. d'Hondt bevorzugt dabei systematisch große Parteien.

Kein Verfahren erfüllt alle wünschenswerten Eigenschaften gleichzeitig. Welches gilt, entscheidet das Gesetz, nicht die Zweckmäßigkeit.

## Invarianten zur Laufzeit

`distribute()` bricht mit einem Fehler ab, wenn:

- die Summe der vergebenen Sitze nicht der vorgesehenen Sitzzahl entspricht
- eine Sitzzahl negativ oder nicht ganzzahlig ist
- ein Umfragewert negativ oder keine endliche Zahl ist

Ein Rechenfehler soll den Build abbrechen, nicht still auf die Seite gelangen.

## Was auch nach allen Korrekturen gilt

Die Sitzverteilung ist eine Modellrechnung aus Zweitstimmenanteilen. Sie bildet Überhang- und Ausgleichsmandate nicht ab, weil sich Direktmandate aus einer Sonntagsfrage nicht ableiten lassen. Die Konfidenzintervalle decken den Stichprobenfehler ab und sonst nichts. Die Rechnung ist korrekt. Das macht sie nicht zu einer Vorhersage.
