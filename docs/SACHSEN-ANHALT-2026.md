# Sachsen-Anhalt, Landtagswahl am 6. September 2026

Stand dieses Dokuments: **15. September 2026**, neun Tage nach der Wahl. Alle Zahlen mit Quelle. Was hier nicht belegt ist, steht nicht drin.

Dieses Dokument war bis zum 27. August eine Vorschau. Es ist jetzt beides: die Darstellung des amtlichen Ergebnisses und die Nachprüfung dessen, was hier vorher stand. Der Vorher-Teil wurde **nicht** nachträglich geglättet. Wo eine frühere Einschätzung danebenlag, steht das ausdrücklich da. Ein Dokument, das im Nachhinein immer recht gehabt hat, wäre wertlos.

## Das amtliche Ergebnis

Quelle: Statistisches Landesamt Sachsen-Anhalt, Landeswahlleiterin. Die Rohdateien liegen im Repository unter `quellen/sachsen-anhalt-2026/`, eingelesen von `scripts/import-wahlergebnis.mjs`, Ergebnis in `config/wahlergebnisse/sachsen-anhalt-2026.json` samt Prüfsummen der Quelldateien.

**Vorbehalt zum Stand.** Die Quelldateien weisen durchgängig die Ergebnisart `V` aus. Dass der Landeswahlausschuss das Ergebnis endgültig festgestellt hat, lässt sich daraus nicht belegen. Es wird deshalb als **vorläufiges amtliches Ergebnis** geführt, Stand der Dateien 7. September 2026. Wer die Feststellung nachträgt, setzt in der erzeugten Datei `status.endgueltig` auf `true` und trägt Datum und Fundstelle ein; der Selbsttest erzwingt dann beide Angaben.

### Beteiligung

| Angabe | Wert |
|---|---|
| Wahlberechtigte | 1.706.851 |
| Wähler | 1.328.211 |
| Wahlbeteiligung | 77,82 Prozent |
| Gültige Zweitstimmen | 1.315.315 |
| Ungültige Zweitstimmen | 12.896 (0,97 Prozent) |

Die Wahlbeteiligung der Landtagswahl 2021 ist im Projekt bisher **nicht erfasst** und wird hier bewusst nicht aus dem Gedächtnis ergänzt, obwohl ein Vergleich naheläge.

Unabhängig davon gilt: Eine Sonntagsfrage erhebt die Stimmabsicht der Befragten, nicht die Zusammensetzung derer, die am Wahltag tatsächlich hingehen. Änderungen der Beteiligung schlagen deshalb nicht in die Umfragewerte durch und gehören zu den Gründen, warum Umfrage und Ergebnis auseinanderfallen können.

### Zweitstimmen

| Partei | Stimmen | Anteil | 2021 | Veränderung |
|---|---|---|---|---|
| AfD | 576.037 | 43,79 | 20,8 | +22,99 |
| CDU | 226.622 | 17,23 | 37,1 | −19,87 |
| SPD | 122.303 | 9,30 | 8,4 | +0,90 |
| Grüne | 117.498 | 8,93 | 5,9 | +3,03 |
| Linke | 112.541 | 8,56 | 11,0 | −2,44 |
| BSW | 69.291 | 5,27 | — | neu |
| FDP | 33.969 | 2,58 | 6,4 | −3,82 |
| Freie Wähler | 15.430 | 1,17 | 3,1 | −1,93 |

Über der Sperrklausel: AfD, CDU, SPD, Grüne, Linke, BSW. Darunter: FDP und alle übrigen.

### Sitzverteilung

Der Landtag der 9. Wahlperiode hat **83 Sitze**, also genau die gesetzliche Mindestzahl.

| Partei | Sitze | davon direkt | davon Liste |
|---|---|---|---|
| AfD | 39 | 38 | 1 |
| CDU | 15 | 0 | 15 |
| Linke | 8 | 3 | 5 |
| SPD | 8 | 0 | 8 |
| Grüne | 8 | 0 | 8 |
| BSW | 5 | 0 | 5 |
| **Summe** | **83** | **41** | **42** |

**Keine Überhang- und Ausgleichsmandate.** Das ist die bemerkenswerteste Einzelheit dieser Wahl aus Sicht des Wahlrechts, und sie war keineswegs sicher. Der Abschnitt „Die entscheidende Einschränkung" weiter unten hat diesen Fall vor der Wahl ausdrücklich als die kritische Annahme benannt. Sie hat gehalten — knapp.

Der Grund ist Arithmetik: Der AfD standen nach Zweitstimmen 39 Sitze zu, sie gewann 38 Direktmandate. Solange die Zahl der gewonnenen Wahlkreise die nach Zweitstimmen zustehenden Sitze nicht übersteigt, entsteht kein Überhang. Der Abstand betrug **genau einen Sitz**. Bei einem geringfügig anderen Zweitstimmenergebnis wäre der Landtag größer geworden, und sämtliche Sitzrechnungen dieses Dokuments hätten eine andere Grundgesamtheit gehabt.

### Direktmandate

Die AfD gewann 38 Wahlkreise, die Linke drei: Magdeburg II, Halle II und Halle III. Die CDU gewann keinen einzigen, obwohl sie landesweit auf 23,96 Prozent der Erststimmen kam und in 38 der 41 Wahlkreise auf dem zweiten Platz landete. In den drei übrigen, den von der Linken gewonnenen, war die AfD zweite. Der knappste Wahlkreis war Magdeburg III mit 3,5 Prozentpunkten Vorsprung.

Wie viele Wahlkreise die CDU 2021 gewonnen hatte, ist im Projekt nicht erfasst und wird hier nicht aus dem Gedächtnis ergänzt.

Eine Auffälligkeit im Verhältnis von Erst- zu Zweitstimmen:

| Partei | Zweitstimmen | Erststimmen | Differenz |
|---|---|---|---|
| CDU | 17,23 | 23,96 | +6,73 |
| Linke | 8,56 | 12,03 | +3,47 |
| AfD | 43,79 | 44,33 | +0,54 |
| BSW | 5,27 | 3,18 | −2,09 |
| Grüne | 8,93 | 3,45 | −5,48 |

CDU und Linke schnitten bei den Erststimmen deutlich besser ab als bei den Zweitstimmen, die Grünen deutlich schlechter. Der Befund ist rein deskriptiv: Welche Wählermotive dahinterstehen, lässt sich aus Stimmzahlen nicht ablesen, und es wird hier auch nicht behauptet.

## Was die Umfragen sagten und was eintrat

Maßgeblich ist der letzte hier dokumentierte Stand, der Trend vom **25. August 2026** aus vier Instituten mit zusammen 6615 Befragten. Die Tabelle dazu steht unten unter „Datenlage".

**Wo die Seite andere Zahlen zeigt als dieses Dokument.** Die Nachkontrolle auf `/wahl/landtagswahl-sachsen-anhalt-2026/` rechnet bei jedem Bau neu, auf dem Bestand, der zu diesem Zeitpunkt vorliegt. Wird die Seite aus der mitgelieferten Datei `seed/sachsen-anhalt.json` gebaut, kennt sie nur drei Umfragen mit Stand 8. August und kommt auf einen mittleren Fehler von 2,60 Prozentpunkten statt der 2,40 aus diesem Dokument. Beide Werte sind richtig; sie beruhen auf unterschiedlich vielen Umfragen. Maßgeblich ist immer die erzeugte Seite — dieses Dokument hält den Stand fest, gegen den argumentiert wird.

| Partei | Trend 25.08. | amtlich | Differenz |
|---|---|---|---|
| AfD | 42,5 | 43,79 | +1,3 |
| CDU | 21,9 | 17,23 | **−4,7** |
| Linke | 12,0 | 8,56 | **−3,4** |
| SPD | 7,3 | 9,30 | +2,0 |
| Grüne | 5,3 | 8,93 | **+3,6** |
| BSW | 4,1 | 5,27 | +1,2 |
| FDP | 3,2 | 2,58 | −0,6 |

Mittlere absolute Abweichung des Trends: **2,40 Prozentpunkte**. Zum Vergleich: Bei der Landtagswahl 2021 lag der entsprechende Wert der Nachkontrolle bei 2,32 Prozentpunkten. Die Größenordnung ist also dieselbe geblieben.

Positive Differenz bedeutet: Die Partei wurde unterschätzt.

### Die Sperrklausel im Rückblick

Die Vorwahlfassung stellte die Frage nach der Fünfprozenthürde bewusst an die erste Stelle. Das Ergebnis gibt ihr teilweise recht:

| Partei | Trend 25.08. | nach Trend | amtlich | tatsächlich |
|---|---|---|---|---|
| Grüne | 5,3 | knapp drin | 8,93 | drin |
| BSW | 4,1 | draußen | 5,27 | **drin** |
| FDP | 3,2 | draußen | 2,58 | draußen |

Bei **einer** Partei lag der Trend auf der falschen Seite der Hürde: dem BSW. Die Grünen wurden richtig eingeordnet, allerdings nur im letzten Stand. Die Fassung vom 16. August hatte sie bei 4,6 Prozent und damit unter der Hürde geführt; die Fassung vom 27. August korrigierte das auf 5,3 und hielt ausdrücklich fest, dass die ältere Aussage überholt sei. Ohne diese Korrektur stünde hier ein zweiter Fehltreffer.

**Was die Vorwahlfassung übersah.** Der Abschnitt „Warum 0,4 Prozentpunkte über alles entscheiden" richtete die gesamte Aufmerksamkeit auf die Parteien an der Hürde. Die beiden größten Fehler betrafen jedoch Parteien weit **oberhalb** davon: die CDU mit 4,7 und die Linke mit 3,4 Prozentpunkten. Bei beiden ging es nicht um die Frage „drin oder draußen", sondern um die schlichte Größenordnung — und genau diese Fehler haben die Mehrheitsverhältnisse verschoben, nicht die Hürdenfrage.

## Die Szenarien gegen die Wirklichkeit

Die Vorwahlfassung rechnete vier Szenarien, je nachdem, wer die Hürde nimmt. Eingetreten ist keines davon genau, weil die zugrunde liegenden Stimmanteile danebenlagen.

| Partei | Szenario A (Trend 25.08.) | tatsächlich | Differenz |
|---|---|---|---|
| AfD | 40 | 39 | −1 |
| CDU | 20 | 15 | **−5** |
| Linke | 11 | 8 | **−3** |
| SPD | 7 | 8 | +1 |
| Grüne | 5 | 8 | **+3** |
| BSW | — | 5 | +5 |

Die Sitzzahl der AfD traf das Modell auf einen Sitz genau. Bei CDU, Linke und Grünen lag es um drei bis fünf Sitze daneben, und das BSW kam gänzlich hinzu.

### Der Befund zu den Mehrheiten

Hier liegt die wichtigste Abweichung, und sie betrifft nicht eine Zahl, sondern eine Struktur.

**Was die Vorwahlfassung schrieb:** In Szenario A gebe es genau eine Mehrheit ohne die AfD, nämlich CDU + Linke + SPD + Grüne mit 43 Sitzen und einem Sitz Reserve. In den Szenarien B, C und D gebe es **keine**.

**Was tatsächlich gilt:** Eine Mehrheit ohne die AfD existiert, aber sie braucht einen Partner mehr als vorhergesagt:

| Kombination | Sitze | über der Mehrheit von 42 |
|---|---|---|
| CDU + Linke + SPD + Grüne + BSW | 44 | 2 |

CDU, Linke, SPD und Grüne allein kommen auf 39 Sitze und damit **nicht** auf eine Mehrheit — anders als in Szenario A vorhergesagt. Erst das BSW, das im Trend unter der Hürde lag, macht sie möglich.

Alle minimalen Mehrheiten mit bis zu vier Partnern enthalten dagegen die AfD:

| Kombination | Sitze | über der Mehrheit |
|---|---|---|
| AfD + CDU | 54 | 12 |
| AfD + Grüne | 47 | 5 |
| AfD + Linke | 47 | 5 |
| AfD + SPD | 47 | 5 |
| AfD + BSW | 44 | 2 |

Dies ist Arithmetik und keine Aussage darüber, welche Kombination politisch in Betracht kommt.

**Eine Falle im eigenen Code.** Der Koalitionsrechner sucht standardmäßig nur Mehrheiten mit bis zu vier Partnern. Angewandt auf dieses Ergebnis liefert er ausschließlich Kombinationen mit der AfD, woraus sich der falsche Schluss ziehen ließe, es gebe überhaupt keine Mehrheit ohne sie. Es gibt eine; sie braucht nur einen Partner mehr, als die Voreinstellung zeigt. Deshalb wurde `mehrheitOhne()` in `scripts/lib/coalitions.mjs` ergänzt: Die Funktion prüft unabhängig von der Partnerzahl, ob ohne eine bestimmte Partei eine Mehrheit besteht, und die Seite weist das Ergebnis aus. Der Fall ist als Test in `scripts/check.mjs` festgehalten.

## Der Rechenkern gegen die Wirklichkeit

Bisher war die Sitzrechnung des Projekts gegen die unabhängige Implementierung von dawum.de geprüft. Jetzt steht eine härtere Prüfung zur Verfügung: der Vergleich mit einem amtlich festgestellten Ergebnis.

Der Rechenkern erhält die amtlichen Zweitstimmen, wendet die Fünfprozenthürde an und verteilt 83 Sitze nach Hare/Niemeyer. Das Ergebnis stimmt **in allen sieben Positionen** mit der amtlich festgestellten Sitzverteilung überein. Die Rechnung im Einzelnen:

| Partei | exakte Quote | ganze Sitze | Rest |
|---|---|---|---|
| AfD | 39,0520 | 39 | 0,0520 |
| CDU | 15,3637 | 15 | 0,3637 |
| SPD | 8,2914 | 8 | 0,2914 |
| Grüne | 7,9657 | 7 | 0,9657 |
| Linke | 7,6296 | 7 | 0,6296 |
| BSW | 4,6975 | 4 | 0,6975 |

Aus der Vorabrundung ergeben sich 80 Sitze. Die drei verbleibenden gehen nach größtem Rest an Grüne (0,9657), BSW (0,6975) und Linke (0,6296). Damit stehen AfD 39, CDU 15, SPD 8, Grüne 8, Linke 8, BSW 5. Kein Rest liegt nahe genug an einem anderen, als dass ein Losfall entstünde.

Der Abgleich läuft als Regressionstest in `npm run check` mit. Eine stille Änderung am Rechenkern fällt damit gegen die Wirklichkeit auf, nicht nur gegen ein zweites Programm.

## Grenzen der Namensangaben

abgeordnetenwatch.de hat für die 9. Wahlperiode noch keine Mandate erfasst; das geschieht üblicherweise erst nach der konstituierenden Sitzung. Erfasst sind 307 Kandidaturen zur Wahl 2026 und die 41 Wahlkreise.

Die Namen der direkt Gewählten werden deshalb abgeleitet: Amtlich steht fest, welche Partei einen Wahlkreis gewonnen hat; bei abgeordnetenwatch.de ist hinterlegt, wer für diese Partei dort kandidiert hat. Ist die Zuordnung eindeutig, wird der Name genannt und als abgeleitet gekennzeichnet. Ist sie es nicht, bleibt das Feld leer. Sobald Mandate erfasst sind, haben sie Vorrang.

Zwei Fallstricke, die beim Anbinden auftraten und als Test festgehalten sind:

1. **Ein unsichtbares Zeichen.** abgeordnetenwatch.de führt die Grünen als `BÜNDNIS 90/[U+00AD]DIE GRÜNEN`, mit einem weichen Trennzeichen hinter dem Schrägstrich. Jeder Zeichenkettenvergleich scheitert daran, und zwar unsichtbar: Die Bezeichnung sieht in jedem Protokoll völlig normal aus. Die Zuordnung bereinigt solche Zeichen jetzt ausdrücklich.
2. **Zwei Personen gleichen Namens.** In den Wahlkreisen Stendal und Staßfurt kandidierten zwei verschiedene Personen namens Matthias Büttner, beide für die AfD. Es sind unterschiedliche Personen mit eigenen Profilen. Wer über den Namen zuordnet, erzeugt hier einen Fehler; die Zuordnung läuft deshalb über Wahlkreis und Partei.

Eine dritte Falle wurde vermieden, weil die Rohdaten nachgerechnet statt übernommen wurden: Die mitgelieferte Datei `Vergleichstabellen_LT_2026.xlsx` trägt als Erstellungsdatum den 10. Juli 2026, also einen Zeitpunkt vor der Wahl, und führt in ihrer Zeichenkettentabelle noch Gewinnernamen mit CDU-Zuordnung. Wer sie ungeprüft als Quelle für die Direktmandate 2026 genommen hätte, hätte 41 falsche Namen veröffentlicht. Die Wahlkreissieger werden deshalb aus den Erststimmen der amtlichen Ergebnisdatei selbst ermittelt und gegen die amtlich ausgewiesenen Direktmandate geprüft.

## Reproduzieren

```bash
# Amtliches Ergebnis aus den Rohdateien einlesen
npm run import:wahl

# Wahlkreise und Kandidaturen von abgeordnetenwatch.de holen
# (haelt 2,5 Sekunden Abstand je Anfrage, Limit sind 30 je Minute)
npm run fetch:aw

# Umfragen, Seiten, Selbsttests
npm run fetch
npm run build
npm run check
```

Der Import schreibt keine Datei, wenn eine der vier Kontrollsummen fehlschlägt. Der Build läuft auch ohne die Daten von abgeordnetenwatch.de durch; dann fehlen nur die Namen.

---

# Der Stand vor der Wahl

Alles Folgende ist die Fassung vom **27. August 2026**, zehn Tage vor der Wahl, unverändert erhalten. Sie steht hier, damit nachvollziehbar bleibt, was das Projekt vor der Wahl behauptet hat — einschließlich der Stellen, an denen es danebenlag.

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
