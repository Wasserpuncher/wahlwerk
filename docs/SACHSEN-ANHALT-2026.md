# Sachsen-Anhalt, Landtagswahl am 6. September 2026

Stand dieses Dokuments: 15. September 2026. Alle Zahlen mit Quelle. Was hier nicht belegt ist, steht nicht drin.

Dieses Dokument war ursprünglich eine Vorschau auf eine bevorstehende Wahl. Es ist jetzt beides: die Darstellung des amtlichen Ergebnisses und die Nachprüfung dessen, was hier vorher stand. Der Vorher-Teil wurde **nicht** nachträglich geglättet. Wo eine frühere Einschätzung danebenlag, steht das ausdrücklich da. Ein Dokument, das im Nachhinein immer recht gehabt hat, wäre wertlos.

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

Die Wahlbeteiligung der Landtagswahl 2021 ist im Projekt bisher **nicht erfasst**. Sie wird hier bewusst nicht aus dem Gedächtnis ergänzt, obwohl ein Vergleich naheläge. Wer sie nachträgt, holt sie aus derselben amtlichen Quelle und trägt sie in `config/elections.json` ein.

Unabhängig vom Vorjahresvergleich gilt: Eine Sonntagsfrage erhebt die Stimmabsicht der Befragten, nicht die Zusammensetzung derer, die am Wahltag tatsächlich hingehen. Änderungen der Beteiligung schlagen deshalb nicht in die Umfragewerte durch und gehören zu den Gründen, warum Umfrage und Ergebnis auseinanderfallen können.

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

**Keine Überhang- und Ausgleichsmandate.** Das ist die bemerkenswerteste Einzelheit dieser Wahl aus Sicht des Wahlrechts, und sie ist nicht selbstverständlich. In der 8. Wahlperiode war der Landtag durch solche Mandate von 83 auf 97 Sitze angewachsen. Diesmal gewann die AfD 38 der 41 Wahlkreise direkt, also fast alle, und trotzdem entstand kein Überhang.

Der Grund ist Arithmetik: Der AfD standen nach Zweitstimmen 39 Sitze zu, sie gewann 38 Direktmandate. Solange die Zahl der gewonnenen Wahlkreise die nach Zweitstimmen zustehenden Sitze nicht übersteigt, entsteht kein Überhang. Der Abstand betrug hier genau einen Sitz. Bei einem geringfügig anderen Zweitstimmenergebnis wäre die Sitzzahl des Landtags eine andere gewesen.

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

### Die Datenlage vor der Wahl

Drei Umfragen im Trendfenster, veröffentlicht zwischen dem 30. Juli und dem 12. August 2026, zusammen 4753 Befragte.

| Institut | Feldende | Tage vor der Wahl | AfD | CDU | Linke | SPD | Grüne | BSW | FDP |
|---|---|---|---|---|---|---|---|---|---|
| pollytix | 8.8. | 29 | 43,0 | 23,0 | 13,0 | 7,0 | 5,0 | 4,0 | 2,0 |
| INSA | 6.8. | 31 | 42,0 | 22,0 | 13,0 | 6,0 | 4,0 | 5,0 | 4,0 |
| Infratest dimap | 28.7. | 40 | 41,0 | 24,0 | 13,0 | 7,0 | 5,0 | 4,0 | n.a. |
| **Trend 12.8.** | | | **42,1** | **22,9** | **13,0** | **6,6** | **4,6** | **4,4** | **2,9** |
| **Amtlich** | | | **43,79** | **17,23** | **8,56** | **9,30** | **8,93** | **5,27** | **2,58** |
| **Differenz** | | | **+1,7** | **−5,7** | **−4,4** | **+2,7** | **+4,3** | **+0,9** | **−0,3** |

Quelle der Umfragen: dawum.de, ODbL. Auftraggeber: Campact (pollytix), BILD (INSA), MDR, WDR, Mitteldeutsche Zeitung und Volksstimme (Infratest dimap).

Die mittlere absolute Abweichung des Trends beträgt **2,86 Prozentpunkte**. Das ist zufällig derselbe Wert, der in der Vorwahlfassung dieses Dokuments für die Landtagswahl 2021 genannt wurde. Aus zwei gleichen Zahlen folgt keine Regel; es ist ein Zufall und wird hier nur erwähnt, damit niemand ihn für eine Gesetzmäßigkeit hält.

### Je Institut

Verglichen wird die jeweils letzte Umfrage eines Instituts vor dem Wahltag, auf der gemeinsamen Grundmenge aus AfD, CDU, Linke, SPD, Grüne und BSW. Die FDP bleibt außen vor, weil Infratest dimap sie nicht auswies; sonst stünden ungleiche Grundmengen nebeneinander.

| Institut | mittlere absolute Abweichung | größter Einzelfehler |
|---|---|---|
| pollytix | 3,1 Pp | CDU −5,8 |
| INSA | 3,3 Pp | Grüne +4,9 |
| Infratest dimap | 3,6 Pp | CDU −6,8 |

**Was diese Rangfolge nicht sagt.** Sie ist die Momentaufnahme einer einzigen Wahl. Ein Institut mit einer größeren Abweichung ist deshalb nicht schlechter als eines mit einer kleineren; dafür bräuchte es viele Wahlen. Hinzu kommt, dass die letzten Umfragen 29 bis 40 Tage vor dem Wahltag endeten. Die gemessene Differenz enthält damit zwei Anteile, die sich nicht trennen lassen: den Fehler der Erhebung und die tatsächliche Meinungsänderung in den Wochen danach. Wer aus dieser Tabelle ein Gütesiegel macht, überdehnt sie.

### Der entscheidende Punkt: die Sperrklausel

Die Vorwahlfassung dieses Dokuments stellte fest, die Spanne bei Grünen und BSW sei „genau die Spanne, die über den Einzug entscheidet", und schloss: „Aus einer Umfrage lässt sich deshalb nicht ablesen, ob Grüne oder BSW im Landtag sitzen werden."

Das hat sich bestätigt, und zwar deutlicher als erwartet. Beide zogen ein, und beide lagen am Ende nicht knapp über der Hürde, sondern klar darüber:

| Partei | Trend | amtlich | nach Trend | tatsächlich |
|---|---|---|---|---|
| Grüne | 4,6 | 8,93 | verfehlt | genommen |
| BSW | 4,4 | 5,27 | verfehlt | genommen |

Bei den Grünen betrug der Fehler 4,3 Prozentpunkte. Der Trend sah sie unter der Hürde und damit im Modell bei null Sitzen; tatsächlich wurden es acht.

**Was dagegen niemand auf dem Schirm hatte:** Der größte Einzelfehler betraf nicht die Parteien an der Hürde, sondern die CDU mit 5,7 Prozentpunkten und die Linke mit 4,4. Beide lagen weit über der Sperrklausel, bei beiden ging es also nicht um die Frage „drin oder draußen", sondern um die schlichte Größenordnung. Die Vorwahlfassung richtete ihre Aufmerksamkeit ganz auf die Hürde und übersah, dass ein Fehler in der Mitte des Feldes die Mehrheitsverhältnisse ebenso umwirft.

## Die vier Szenarien gegen die Wirklichkeit

Die Vorwahlfassung rechnete vier Szenarien, je nachdem, wer die Sperrklausel nimmt. Eingetreten ist Szenario D: Grüne und BSW beide im Landtag. Die Sitzverteilung traf es trotzdem nicht.

| Partei | Szenario D | tatsächlich | Differenz |
|---|---|---|---|
| AfD | 37 | 39 | +2 |
| CDU | 20 | 15 | −5 |
| Linke | 12 | 8 | −4 |
| SPD | 6 | 8 | +2 |
| Grüne | 4 | 8 | +4 |
| BSW | 4 | 5 | +1 |

Das richtige Szenario zu treffen genügte also nicht. Die Sitzverteilung innerhalb des Szenarios lag bei vier von sechs Parteien um vier oder fünf Sitze daneben, weil die zugrunde liegenden Stimmanteile danebenlagen.

### Der Befund zu den Mehrheiten

Hier liegt die größte Abweichung zwischen Vorschau und Wirklichkeit, und sie betrifft nicht eine Zahl, sondern eine Struktur.

**Was die Vorwahlfassung schrieb:** „Konstant über alle vier Szenarien: Eine Mehrheit ohne die AfD erfordert mindestens CDU, Linke und SPD gemeinsam, und sie liegt in drei von vier Szenarien bei null bis zwei Sitzen Reserve."

**Was tatsächlich gilt:** Im gewählten Landtag reichen CDU, Linke und SPD zusammen nicht mehr. Sie kommen auf 31 der 83 Sitze. Die einzige Mehrheit ohne die AfD umfasst **fünf Parteien**:

| Kombination | Sitze | über der Mehrheit von 42 |
|---|---|---|
| CDU + Linke + SPD + Grüne + BSW | 44 | 2 |

Alle minimalen Mehrheiten mit bis zu vier Partnern enthalten dagegen die AfD:

| Kombination | Sitze | über der Mehrheit |
|---|---|---|
| AfD + CDU | 54 | 12 |
| AfD + Grüne | 47 | 5 |
| AfD + Linke | 47 | 5 |
| AfD + SPD | 47 | 5 |
| AfD + BSW | 44 | 2 |

Dies ist Arithmetik und keine Aussage darüber, welche Kombination politisch in Betracht kommt.

**Eine Falle im eigenen Code.** Der Koalitionsrechner des Projekts sucht standardmäßig nur Mehrheiten mit bis zu vier Partnern. Angewandt auf dieses Ergebnis liefert er ausschließlich Kombinationen mit der AfD, woraus sich der falsche Schluss ziehen ließe, es gebe überhaupt keine Mehrheit ohne sie. Es gibt eine; sie braucht nur einen Partner mehr, als die Voreinstellung zeigt. Deshalb wurde `mehrheitOhne()` in `scripts/lib/coalitions.mjs` ergänzt: Die Funktion prüft unabhängig von der Partnerzahl, ob ohne eine bestimmte Partei eine Mehrheit besteht, und die Parlamentsseite weist das Ergebnis aus. Der Fall ist als Test in `scripts/check.mjs` festgehalten.

## Rechtsrahmen, verifiziert

| Angabe | Wert | Quelle |
|---|---|---|
| Wahltag | 6. September 2026 | Beschluss des Landtags vom 13. Mai 2025 |
| Sitze, gesetzliche Mindestzahl | 83 | Landeswahlleitung Sachsen-Anhalt, Wahlsystem |
| davon Direktmandate | 41 aus 41 Wahlkreisen | § 10 LWG LSA |
| davon Listenmandate | mindestens 42 | Landeswahlleitung |
| Zuteilungsverfahren | Hare/Niemeyer | Landeswahlleitung |
| Sperrklausel | 5 Prozent der gültigen Zweitstimmen | Landeswahlleitung |
| Mehrheit | 42 Sitze | 83 / 2 aufgerundet |

Quelle für die Systemangaben: <https://wahlen.sachsen-anhalt.de/zu-den-wahlen/allgemeine-informationen-zur-landtagswahl/wahlsystem>

Der Rahmen ist durch das Ergebnis bestätigt: 41 Direktmandate, 42 Listenmandate, 83 Sitze, Hare/Niemeyer.

### Der Rechenkern gegen die Wirklichkeit

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

## Was hier bewusst fehlt

- **Eine Erklärung des Wahlausgangs.** Warum Menschen so gewählt haben, lässt sich aus Stimmzahlen nicht ablesen. Dieses Dokument beschreibt, was gezählt wurde.
- **Eine Bewertung der Koalitionen.** Die Listen sind Arithmetik. Ob eine Kombination politisch in Betracht kommt, sagen sie nicht.
- **Die Ministerpräsidentenwahl.** Die Landesverfassung regelt eigene Mehrheitserfordernisse in mehreren Wahlgängen. Das ist nicht modelliert.
- **Ergebnisse unterhalb der Wahlkreisebene.** Die Quelldateien enthalten Gemeinden und Wahlbezirke. Angebunden ist die Wahlkreisebene. Ein Seitenbestand mit 654 Gemeinden oder 2661 Wahlbezirken wäre genau der Fall, vor dem der Abschnitt zum Thin Content in der README warnt.
- **Namen der Abgeordneten aus amtlicher Quelle.** Die Landeswahlleitung veröffentlicht sie; angebunden sind sie nicht. Die auf der Seite genannten Namen der direkt Gewählten stammen von abgeordnetenwatch.de und sind derzeit abgeleitet, siehe unten.

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
