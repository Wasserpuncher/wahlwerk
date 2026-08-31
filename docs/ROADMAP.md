# Roadmap

Diese Liste sagt, was fehlt. Sie ist bewusst konkret, damit erkennbar bleibt, was das Projekt heute kann und was nicht.

## v0.2 Amtliche Ergebnisse — am 31.08.2026 zur Hälfte erledigt

**Erledigt:**

- Nachkontrolle des Trends gegen das amtliche Ergebnis ✔ (`scripts/lib/nachkontrolle.mjs`)
  - gerechnet mit demselben Verfahren und denselben Parametern wie überall sonst, ausdrücklich ohne nachträglich günstigere Wahl
  - es fließen ausschließlich Umfragen mit Feldende **vor** dem Wahltag ein, per Test erzwungen
  - eine Partei, die wegen abweichender Schreibweise nicht zugeordnet werden kann, ist ein **Testfehler**, keine Fußnote: ein stilles Weglassen ließe den mittleren Fehler zu gut aussehen. Die Zuordnung steht in `config/elections.json` unter `parteiAliasse`
- Neue Seite: Wahl ✔ (`/wahl/<slug>/`), je datiertem Termin mit Umfragen im Bestand
- Wahlkalender ✔ (`/wahlen/`) aus der amtlichen Übersicht der Bundeswahlleiterin, mit deren Vorbehalt im Wortlaut

Erstes Ergebnis, Landtagswahl Sachsen-Anhalt 2021: mittlerer absoluter Fehler **2,32 Prozentpunkte**, größte Abweichung **−8,5 Punkte bei der CDU** (Umfragen 28,6, amtlich 37,1), nur **vier von acht** Parteien im 95-Prozent-Intervall.

**Weiter offen:**

- Institutsgenauigkeit je Haus. Bewusst noch nicht gebaut: Mit **einem** verifizierten Wahlergebnis hat jedes Institut genau einen Datenpunkt. Daraus eine Rangfolge abzuleiten wäre eine Aussage, die die Datenlage nicht trägt. Sinnvoll ab etwa fünf verifizierten Wahlen je Institut.
- Import der Bundestagswahlergebnisse von der Bundeswahlleiterin als CSV
- `config/elections.json` trägt bisher nur Sachsen-Anhalt. Für Berlin und Mecklenburg-Vorpommern, wo am 20.09.2026 gewählt wird, fehlt das amtliche Ergebnis der vorangegangenen Wahl — die Nachkontrolle bleibt dort deshalb leer und sagt das auf der Seite.

  **Falle bei Berlin, vor dem Eintragen klären.** Die Landeswahlleitung Berlin führt neben der Wahl von 2021 eine eigene Rubrik „Berliner Wahlen 2023“ (am 31.08.2026 auf berlin.de/wahlen abgelesen). Für Berlin ist „die letzte Wahl zum Abgeordnetenhaus“ also **nicht selbstverständlich die von 2021**. Wer hier ungeprüft das Ergebnis von 2021 einträgt, vergleicht die Umfragen womöglich mit einer Wahl, die so nicht mehr gilt — und die Nachkontrolle wäre falsch, ohne dass ein Test das merken könnte, weil sie rechnerisch einwandfrei bliebe. Vor dem Eintrag ist bei der Landeswahlleitung zu klären, welches Ergebnis das maßgebliche ist und für welche Wahlkreise. Bis dahin bleibt Berlin bewusst leer.

  Dasselbe gilt sinngemäß für jedes Land: Der Eintrag in `elections.json` ist eine Behauptung darüber, **welche** Wahl die letzte war, nicht nur darüber, wie sie ausging.

Offene Frage: Für Landtagswahlen müssen 16 Landeswahlleitungen einzeln erschlossen werden. Uneinheitliche Formate, hoher Aufwand.

## v0.2.1 Erreichbarkeit — am 31.08.2026 erledigt

Der teuerste Fehler des Projekts war keiner, der falsch rechnete, sondern einer, der etwas unsichtbar machte.

- Die Tabellen brechen nach 200 Zeilen ab. Der ältere Bestand war dadurch zwar erzeugt und in der Sitemap verzeichnet, aber von **keiner** Seite aus verlinkt: **1036 von 3918** Belegseiten waren nur erreichbar, wer die Adresse ohnehin kannte.
- Keine der bis dahin 117 Prüfungen sah das, weil alle fragten, ob eine Seite **existiert**, und keine, ob jemand **hinkommt**. ✔ behoben durch die Chronik (`/chronik/<jahr>/<monat>/`), verwaiste Seiten jetzt: 0
- Neuer Wächter in `scripts/check.mjs`: Der Bau bricht ab, sobald eine Seite von der Startseite aus nicht mehr erreichbar ist. ✔ Bewusst als **Erreichbarkeit** gemessen, nicht als „irgendwo verlinkt“ — der Unterschied ist kein Wortklauben, sondern genau die Lücke, durch die eine nur von einer Waise verlinkte Seite geschlüpft wäre. Gegenprobe gemacht: eine Umfrage überall ausgehängt, der Wächter meldet sie namentlich.
- Zwei neue Ordnungsachsen, die im Bestand längst vorhanden waren, aber nicht nachschlagbar: **Auftraggeber** (115) und **Erhebungsmethode** (6). ✔

## v0.3 Verifizierte Sitzverteilungen — am 27.08.2026 erledigt

- `config/parliaments.json` Zeile für Zeile gegen die Landeswahlgesetze geprüft ✔
- Je Eintrag Sitzzahl, Verfahren, Sperrklausel, Fundstelle und Prüfdatum ✔
- Sonderfälle behandelt oder ausdrücklich ausgeschlossen ✔
  - Bayern mit Gesamtstimmen und sieben getrennten Zuteilungen: **ausgeschlossen**, mit Begründung auf der Seite
  - Bremen mit getrennten Wahlbereichen: **ausgeschlossen**, mit Begründung auf der Seite
  - Schleswig-Holstein mit der SSW-Befreiung: **umgesetzt** über `exemptFromThreshold`
  - Grundmandatsklauseln: durchgehend **nicht modelliert** und je Eintrag als solche benannt, weil sie sich aus einer Zweitstimmenumfrage nicht ableiten lassen

15 Parlamente sind freigeschaltet, zwei bewusst gesperrt. Zwei Verfahrensangaben, bei denen verbreitete Quellen veraltet sind: Sachsen rechnet seit 2023 nach Sainte-Laguë statt d'Hondt, Niedersachsen seit März 2026. Das Saarland ist das letzte Land mit d'Hondt.

## v0.4 Was an der Unsicherheitsrechnung noch fehlt

Der ausgewiesene effektive Stichprobenumfang nach Kish entspricht bei annähernd gleichen Gewichten fast der Summe der Befragten. Die Varianz **zwischen** den Instituten geht nicht ein; gerechnet wird, als wären alle Befragten eine einzige Zufallsstichprobe. Das ist auf der Seite als untere Schranke gekennzeichnet, aber es bleibt eine Untertreibung der wahren Unsicherheit.

- `trend.designEffect` steht auf 1,0 und damit auf der unteren Schranke. Ein höherer Wert braucht einen **belegten** Quellennachweis, sonst ist er geraten.
- Eine saubere Alternative wäre eine Varianzzerlegung: Stichprobenfehler plus gemessene Streuung zwischen den Instituten im selben Fenster. Die Streuung wird bereits erhoben und angezeigt, geht aber nicht in das Intervall ein.
- Solange beides offen ist, gilt: Die Fehlerbalken sind zu schmal. Wer sie zitiert, muss das mitzitieren.

## v0.5 Zeitreihen und Verlauf

- Verlaufsdiagramm je Partei und Parlament als serverseitig gerendertes SVG, weiterhin ohne JavaScript
- LOESS oder gleitender gewichteter Mittelwert, Verfahren offengelegt und getestet
- Vergleich zweier Institute im selben Zeitraum

## v0.6 Abdeckung erweitern

- abgeordnetenwatch-API für Abgeordnete, Wahlkreise und Kandidaturen, Fair Use mit 30 Anfragen pro Minute beachten
- Bundestag Open Data für Abstimmungen und Drucksachen
- Strukturdaten der Wahlkreise für Korrelationen, die es sonst nirgends gibt

## Offene Grundsatzfragen

**Zeitreihen vor 2017.** Die genutzte Quelle beginnt 2017. Für längere Reihen bräuchte es eine zweite Quelle mit klarer Lizenz. Das Auslesen fremder Tabellenseiten ist lizenzrechtlich nicht sauber und deshalb keine Option.

**Seitenanzahl.** Bei starkem Wachstum können tausende Einzelumfrageseiten als minderwertiger Inhalt eingestuft werden. Dann `build.generateSurveyPages` abschalten und Einzelumfragen nur in Tabellen führen. Die Belege bleiben über den Datenexport erhalten.

**Hauseffekte.** Eine Korrektur systematischer Institutsabweichungen wäre statistisch interessant, würde aber aus der Wiedergabe eine Modellrechnung machen. Falls sie kommt, dann nur als klar getrennte, zusätzliche Ansicht, niemals als Ersatz für die veröffentlichten Werte.
