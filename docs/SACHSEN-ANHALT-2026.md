# Sachsen-Anhalt, Landtagswahl am 6. September 2026

Stand dieses Dokuments: **27. August 2026**, zehn Tage vor der Wahl. Alle Zahlen mit Quelle. Was hier nicht belegt ist, steht nicht drin.

Dieses Dokument ist eine datierte Momentaufnahme und veraltet zwangslaeufig. Massgeblich ist immer die erzeugte Seite, die bei jedem Build neu rechnet. Die Fassung vom 16. August war zum Schluss elf Tage alt und in der Aussage falsch geworden; was sich geaendert hat, steht unten unter "Was sich seit dem 16. August geaendert hat".

## Rechtsrahmen, verifiziert

| Angabe | Wert | Quelle |
|---|---|---|
| Wahltag | 6. September 2026 | Beschluss des Landtags vom 13. Mai 2025 |
| Sitze, gesetzliche Mindestzahl | 83 | Landeswahlleitung Sachsen-Anhalt, Wahlsystem |
| davon Direktmandate | 41 aus 41 Wahlkreisen | § 10 LWG LSA |
| davon Listenmandate | mindestens 42 | Landeswahlleitung |
| Zuteilungsverfahren | Hare/Niemeyer | Landeswahlleitung |
| Sperrklausel | 5 Prozent der gültigen Zweitstimmen | Landeswahlleitung |
| Mehrheit im Modell | 42 Sitze | 83 / 2 aufgerundet |
| Wahlberechtigte | rund 1,7 Millionen | Landeszentrale für politische Bildung |

Quelle für die Systemangaben: <https://wahlen.sachsen-anhalt.de/zu-den-wahlen/allgemeine-informationen-zur-landtagswahl/wahlsystem>

Damit ist Sachsen-Anhalt in `config/parliaments.json` auf `verified: true` gesetzt.

**Nachtrag vom 27.08.2026.** Freigeschaltet war die Sitzrechnung damit trotzdem nicht. `config/parliaments.json` ist auf die Kuerzel der Umfragedatenbank geschluesselt ("Sachsen-Anhalt"), die Seiten entstehen aber unter dem langen Namen ("Landtag von Sachsen-Anhalt"). Der Lookup lief ins Leere, fiel still in den Zweig "nicht verifiziert" und liess den gesamten Abschnitt weg. Betroffen waren alle 16 Laender; nur der Bundestag funktionierte, weil dort Name und Kuerzel zufaellig gleich sind. Kein Selbsttest wurde davon rot. Behoben am 27.08.2026, seitdem prueft `npm run check` fuer jeden verifizierten Eintrag, dass die Modellrechnung auf der erzeugten Seite auch wirklich steht.

## Die entscheidende Einschränkung

Der Landtag hat **mindestens** 83 Sitze. Überhang- und Ausgleichsmandate können ihn vergrößern, in der laufenden 8. Wahlperiode auf 97. Eine Sonntagsfrage erhebt die Zweitstimmenabsicht und sagt nichts über gewonnene Wahlkreise. Überhangmandate lassen sich daraus grundsätzlich nicht ableiten.

Jede Sitzrechnung auf Umfragebasis, auch die hier, unterstellt also 83 Sitze und keine Direktmandatsverzerrung. Bei einer Partei, die nach Umfragen rund 42 Prozent der Zweitstimmen erreicht und damit einen Großteil der 41 Wahlkreise gewinnen dürfte, ist genau das die kritische Annahme. Wer die Zahl ohne diesen Vorbehalt zitiert, zitiert sie falsch.

Zweiter, im Modell ebenfalls nicht abgebildeter Fall: Wahlkreissitze von Bewerbern ohne zugelassene Landesliste oder von Parteien unterhalb der Sperrklausel werden nach dem Gesetz von den 83 Sitzen abgezogen, bevor verteilt wird.

## Datenlage: vier Institute im Trendfenster

Bezugstag des Trends ist das juengste Feldzeitende, der 25. August 2026. Der Trend nutzt je Institut nur die **juengste** Erhebung, gewichtet mit einer Halbwertszeit von 14 Tagen und der Wurzel der Fallzahl. Das Gewicht steht in der letzten Spalte, damit die Rechnung von Hand nachvollziehbar bleibt.

| Institut | Auftraggeber | Feldzeit | Veröffentlicht | n | AfD | CDU | Linke | SPD | Grüne | BSW | FDP | Sonstige | Gewicht |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Infratest dimap | ARD | 24.08.2026 bis 25.08.2026 | 26.08.2026 | 1511 | 42,0 | 22,0 | 11,0 | 8,0 | 6,0 | 4,0 | 3,0 | 4,0 | 1,23 |
| Civey | WELT | 06.08.2026 bis 20.08.2026 | 25.08.2026 | 1500 | 43,0 | 21,0 | 12,0 | 7,0 | 5,0 | 4,0 | 4,0 | 4,0 | 0,96 |
| pollytix | Campact | 03.08.2026 bis 08.08.2026 | 12.08.2026 | 2604 | 43,0 | 23,0 | 13,0 | 7,0 | 5,0 | 4,0 | 2,0 | 3,0 | 0,70 |
| INSA | BILD | 31.07.2026 bis 06.08.2026 | 10.08.2026 | 1000 | 42,0 | 22,0 | 13,0 | 6,0 | 4,0 | 5,0 | 4,0 | 4,0 | 0,39 |
| **Trend 25.08.** | | | | **6615** | **42,5** | **21,9** | **12,0** | **7,3** | **5,3** | **4,1** | **3,2** | **3,8** | |

Quelle: dawum.de, ODbL. Zum Vergleich das amtliche Ergebnis vom 6. Juni 2021: CDU 37,1, AfD 20,8, Linke 11,0, SPD 8,4, FDP 6,4, Gruene 5,9.

### Was sich seit dem 16. August geaendert hat

Die vorige Fassung stuetzte sich auf drei Umfragen mit 4753 Befragten und fuehrte die Gruenen bei 4,6 Prozent, also unter der Huerde. Seither sind zwei Erhebungen dazugekommen, Civey vom 25. und Infratest dimap vom 26. August, zusammen 3011 weitere Befragte. Drei Aussagen der alten Fassung stimmen damit nicht mehr:

- Die Gruenen liegen im Trend jetzt bei 5,3 statt 4,6 Prozent, im juengsten Einzelwert sogar bei 6,0. Sie stehen damit **ueber** der Huerde statt darunter.
- Die Linke faellt von 13,0 auf 12,0. Der Satz "bei allen drei exakt 13,0" ist ueberholt, die Spanne betraegt jetzt 11,0 bis 13,0.
- Die SPD steigt von 6,6 auf 7,3.

Wer die alte Tabelle heute zitiert, zitiert einen ueberholten Stand.

### Streuung im Trendfenster

| Partei | Spanne der vier Institute |
|---|---|
| AfD | 42,0 bis 43,0 |
| CDU | 21,0 bis 23,0 |
| Linke | 11,0 bis 13,0 |
| SPD | 6,0 bis 8,0 |
| Gruene | 4,0 bis 6,0 |
| BSW | 4,0 bis 5,0 |
| FDP | 2,0 bis 4,0 |

### Die einzige Zahl, auf die es ankommt: fuenf Prozent

Der gewichtete Trend allein sagt wenig. Entscheidend ist, wie sicher er ist. Das 95-Prozent-Intervall, gerechnet ueber die effektive Fallzahl nach Kish (5870):

| Partei | Trend | 95-Prozent-Intervall | Huerde entschieden? |
|---|---:|---|---|
| Gruene | 5,3 | 4,71 bis 5,86 | **nein**, das Intervall liegt auf beiden Seiten der Huerde |
| BSW | 4,1 | 3,64 bis 4,66 | darunter, aber innerhalb der ueblichen Institutsabweichung |
| FDP | 3,2 | 2,78 bis 3,68 | klar darunter |

Diese Intervalle unterstellen eine reine Zufallsstichprobe, der Designeffekt steht in `config/site.json` auf 1,0. Reale Wahlumfragen liegen darueber, die wahre Unsicherheit ist also **groesser** als hier ausgewiesen. Bei der Landtagswahl 2021 lag die mittlere Abweichung der Institute vom amtlichen Ergebnis in Sachsen-Anhalt bei 2,86 Prozentpunkten, im Einzelfall bei bis zu 10,1. Beide Werte sind ein Vielfaches des Abstands, um den es hier geht.

## Sitzverteilung nach dem Stand vom 25. August

Hare/Niemeyer, 83 Sitze, Sperrklausel 5 Prozent, Mehrheit ab 42. An der Huerde scheitern im Modell FDP und BSW, der Sammelposten "Sonstige" wird vor der Zuteilung entfernt.

| Partei | Sitze |
|---|---:|
| AfD | 40 |
| CDU | 20 |
| Linke | 11 |
| SPD | 7 |
| Gruene | 5 |
| **Summe** | **83** |

Minimale Mehrheiten, also solche, aus denen kein Partner entfernt werden kann:

| Kombination | Sitze | Reserve ueber der Mehrheit |
|---|---:|---:|
| AfD + CDU | 60 | 18 |
| AfD + Linke | 51 | 9 |
| AfD + SPD | 47 | 5 |
| AfD + Gruene | 45 | 3 |
| CDU + Linke + SPD + Gruene | 43 | 1 |

Es gibt genau **eine** Mehrheit ohne die AfD, und sie hat einen Sitz Reserve.

## Warum 0,4 Prozentpunkte ueber alles entscheiden

Alle folgenden Rechnungen entstehen mit demselben Code, `scripts/lib/seats.mjs` und `scripts/lib/coalitions.mjs`. Veraendert wird jeweils nur, wer die Huerde nimmt. Die AfD behaelt in allen Faellen ihre 42,5 Prozent.

| Szenario | AfD | CDU | Linke | SPD | Gruene | BSW | Mehrheit ohne AfD |
|---|---:|---:|---:|---:|---:|---:|---|
| A: Trend von heute, Gruene 5,3 | 40 | 20 | 11 | 7 | 5 | - | CDU+Linke+SPD+Gruene, 43 Sitze |
| B: Gruene bei 4,9 | **42** | 22 | 12 | 7 | - | - | **keine** |
| C: zusaetzlich BSW bei 5,1 | 38 | 19 | 11 | 6 | 5 | 4 | **keine** |
| D: weder Gruene noch BSW | **42** | 22 | 12 | 7 | - | - | **keine** |

Das ist der Kern der Lage. Sinken die Gruenen von 5,3 auf 4,9, also um weniger als einen halben Prozentpunkt und damit weit innerhalb der Messunsicherheit, dann erreicht die AfD im Modell **42 von 83 Sitzen und damit die absolute Mehrheit allein**, ohne dass sich ihr Stimmenanteil um eine einzige Stimme veraendert haette. Grund ist ausschliesslich, dass an der Sperrklausel mehr Stimmen verfallen und auf die verbliebenen Parteien umgelegt werden.

In Szenario C gilt dasselbe in die andere Richtung: Kommt das BSW dazu, faellt die AfD auf 38 Sitze. Auch dann bleibt aber keine Mehrheit ohne sie uebrig, weil CDU, Linke, SPD und Gruene zusammen nur 41 Sitze haetten.

**Was daraus nicht folgt.** Keines dieser vier Szenarien ist eine Prognose. Sie zeigen die Empfindlichkeit der Sitzrechnung gegenueber der Sperrklausel, nicht den wahrscheinlichen Ausgang. Aus einer Umfrage laesst sich nicht ablesen, ob die Gruenen bei 4,9 oder bei 5,3 Prozent landen. Genau deshalb steht diese Frage hier vorne und nicht die Frage, ob die AfD 42 oder 43 Prozent erreicht.

**Und der Vorbehalt aus dem Abschnitt oben gilt weiter.** Alle Zahlen unterstellen 83 Sitze ohne Ueberhang- und Ausgleichsmandate. Bei einer Partei, die nach diesen Umfragen einen Grossteil der 41 Wahlkreise direkt gewinnen duerfte, ist das die kritische Annahme, und sie wirkt gerade in Szenario B und D auf die entscheidende Zahl. In der laufenden 8. Wahlperiode fuehrten Ueberhang und Ausgleich zu 97 statt 83 Sitzen.

## Was hier bewusst fehlt

- **Eine Prognose.** Die Zahlen sind Momentaufnahmen der Stimmung im Feldzeitraum. Die aelteste hier verwendete Erhebung endete am 6. August, also einen Monat vor dem Wahltag.
- **Eine Bewertung der Koalitionen.** Die Liste ist Arithmetik. Ob eine Kombination politisch in Betracht kommt, sagt sie nicht.
- **Ergebnisse auf Wahlkreisebene.** Dafür braucht es die Daten der Landeswahlleitung, die im Projekt noch nicht angebunden sind.
- **Die Ministerpräsidentenwahl.** Die Landesverfassung regelt eigene Mehrheitserfordernisse in mehreren Wahlgängen. Das ist nicht modelliert.

## Grafische Umsetzung im Generator

Der Build erzeugt für jede Parlamentsseite fünf Diagramme, alle als statisches SVG ohne JavaScript und ohne Zeichenbibliothek:

1. **Kennzahlenband** mit Umfragezahl, jüngstem Feldende, Vorsprung im Trend und Gesamtzahl der Befragten.
2. **Verlaufsdiagramm** aller Umfragen mit eingezeichneter Sperrklausel. Fehlende Werte erzeugen Lücken statt Nulllinien.
3. **Vergleich mit der letzten Wahl** als Paarbalken mit Differenz in Prozentpunkten.
4. **Sitzbogen**, ein Punkt je Sitz, mit Mehrheitslinie.
5. **Koalitionsbalken** und **Szenariovergleich** zur Sperrklausel.

Der Szenariovergleich entsteht automatisch und rechnet die Sperrklausel in **beide** Richtungen: Der Build sucht Parteien, die im Trend hoechstens zwei Prozentpunkte **unter** der Huerde liegen und deshalb einziehen koennten, und ebenso Parteien, die hoechstens zwei Prozentpunkte **ueber** der Huerde liegen und deshalb herausfallen koennten. Fuer jede davon entsteht eine eigene Sitzverteilung.

Bis zum 27.08.2026 kannte der Build nur die erste Richtung. Damit fehlte in Sachsen-Anhalt ausgerechnet das folgenreichste Szenario, naemlich das Herausfallen der Gruenen. Nach dem Stand vom 25.08. erscheinen dort fuenf Szenarien: Basis, BSW zieht ein, FDP zieht ein, beide ziehen ein, Gruene verfehlt die Huerde.

Alle Diagramme tragen `title`-Elemente für Screenreader, laufen im hellen und dunklen Modus und funktionieren im Ausdruck.
