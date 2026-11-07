# Roadmap

Diese Liste sagt, was fehlt. Sie ist bewusst konkret, damit erkennbar bleibt, was das Projekt heute kann und was nicht.

## v0.2 Amtliche Ergebnisse — am 15.09.2026 erledigt

**Erledigt:**

- Nachkontrolle des Trends gegen das amtliche Ergebnis ✔ (`scripts/lib/nachkontrolle.mjs`)
  - gerechnet mit demselben Verfahren und denselben Parametern wie überall sonst, ausdrücklich ohne nachträglich günstigere Wahl
  - es fließen ausschließlich Umfragen mit Feldende **vor** dem Wahltag ein, per Test erzwungen
  - eine Partei, die wegen abweichender Schreibweise nicht zugeordnet werden kann, ist ein **Testfehler**, keine Fußnote: ein stilles Weglassen ließe den mittleren Fehler zu gut aussehen. Die Zuordnung steht in `config/elections.json` unter `parteiAliasse`
- Neue Seite: Wahl ✔ (`/wahl/<slug>/`), je datiertem Termin mit Umfragen im Bestand
- Wahlkalender ✔ (`/wahlen/`) aus der amtlichen Übersicht der Bundeswahlleiterin, mit deren Vorbehalt im Wortlaut
- **Import amtlicher Ergebnisse ✔** (`scripts/import-wahlergebnis.mjs`), am 15.09.2026 ergänzt
  - liest die veröffentlichten Dateien der Landeswahlleitung; **keine Zahl wird abgetippt**
  - vier erzwungene Kontrollsummen, darunter: die aus den Erststimmen selbst ermittelten Wahlkreissieger müssen mit den amtlich ausgewiesenen Direktmandaten übereinstimmen. Schlägt eine fehl, entsteht **keine** Datei
  - genau diese Kontrolle hat sich sofort bezahlt gemacht: Die mitgelieferte `Vergleichstabellen_LT_2026.xlsx` stammt vom 10.07.2026, also von **vor** der Wahl, und führt noch Gewinnernamen mit CDU-Zuordnung. Ungeprüft übernommen hätte sie 41 falsche Direktmandate ergeben
  - die Rohdateien liegen als Beleg unter `quellen/`, ihre Prüfsummen in der erzeugten Datei
- **Wahlkreise und Direktmandate ✔** auf der Wahlseite, verknüpft mit Kandidaturen von abgeordnetenwatch.de (`scripts/fetch-abgeordnetenwatch.mjs`)

Erstes Ergebnis, Landtagswahl Sachsen-Anhalt 2021: mittlerer absoluter Fehler **2,32 Prozentpunkte**, größte Abweichung **−8,5 Punkte bei der CDU** (Umfragen 28,6, amtlich 37,1), nur **vier von acht** Parteien im 95-Prozent-Intervall.

Zweites Ergebnis, Landtagswahl Sachsen-Anhalt 2026: Der Rechenkern reproduziert aus den amtlichen Zweitstimmen **exakt** die amtlich festgestellte Sitzverteilung, in allen sieben Positionen. Die Sitzrechnung ist damit nicht mehr nur gegen eine zweite Implementierung geprüft, sondern gegen die Wirklichkeit. Der Abgleich läuft als Regressionstest mit.

**Weiter offen:**

- Institutsgenauigkeit je Haus. Bewusst noch nicht gebaut: Mit **einem** verifizierten Wahlergebnis hat jedes Institut genau einen Datenpunkt. Daraus eine Rangfolge abzuleiten wäre eine Aussage, die die Datenlage nicht trägt. Sinnvoll ab etwa fünf verifizierten Wahlen je Institut.
- Import der Bundestagswahlergebnisse von der Bundeswahlleiterin als CSV
- Die übrigen fünfzehn Landeswahlleitungen. Der Importer ist auf das Format des Statistischen Landesamtes Sachsen-Anhalt zugeschnitten; jedes weitere Land braucht eine eigene Zuordnung der Spalten und Parteibezeichnungen
- `config/elections.json` trägt bisher nur Sachsen-Anhalt. Für Berlin und Mecklenburg-Vorpommern, wo am 20.09.2026 gewählt wird, fehlt das amtliche Ergebnis der vorangegangenen Wahl — die Nachkontrolle bleibt dort deshalb leer und sagt das auf der Seite.

  **Falle bei Berlin, vor dem Eintragen klären.** Die Landeswahlleitung Berlin führt neben der Wahl von 2021 eine eigene Rubrik „Berliner Wahlen 2023“ (am 31.08.2026 auf berlin.de/wahlen abgelesen). Für Berlin ist „die letzte Wahl zum Abgeordnetenhaus“ also **nicht selbstverständlich die von 2021**. Wer hier ungeprüft das Ergebnis von 2021 einträgt, vergleicht die Umfragen womöglich mit einer Wahl, die so nicht mehr gilt — und die Nachkontrolle wäre falsch, ohne dass ein Test das merken könnte, weil sie rechnerisch einwandfrei bliebe. Vor dem Eintrag ist bei der Landeswahlleitung zu klären, welches Ergebnis das maßgebliche ist und für welche Wahlkreise. Bis dahin bleibt Berlin bewusst leer.

  Dasselbe gilt sinngemäß für jedes Land: Der Eintrag in `elections.json` ist eine Behauptung darüber, **welche** Wahl die letzte war, nicht nur darüber, wie sie ausging.

**Anmerkung zur Institutsgenauigkeit, 15.09.2026.** Beim Anbinden des Ergebnisses 2026 wurde eine Auswertung je Institut gebaut und wieder verworfen, weil die oben stehende Begründung sie trägt: Auch mit zwei verifizierten Wahlen hat jedes Institut zwei Datenpunkte, und eine nach mittlerem Fehler sortierte Tabelle liest sich als Rangfolge, gleichgültig welcher Vorbehalt danebensteht. Ein Detail aus der verworfenen Arbeit ist trotzdem festzuhalten, weil es beim späteren Bau wieder auftritt: Ein Zeitfenster von 30 Tagen vor der Wahl hätte Infratest dimap vollständig ausgeschlossen, deren letzte Umfrage 40 Tage vor dem Wahltag endete — ohne dass das auf der Seite sichtbar geworden wäre. Wer diese Auswertung später baut, muss das Fenster begründen und die dadurch ausgeschlossenen Institute ausweisen.

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

- ~~abgeordnetenwatch-API für Abgeordnete, Wahlkreise und Kandidaturen, Fair Use mit 30 Anfragen pro Minute beachten~~ — **erledigt am 15.09.2026**, siehe `scripts/fetch-abgeordnetenwatch.mjs`. Angebunden sind Wahlperioden, Wahlkreise, Kandidaturen und Mandate. Der Abruf hält 2,5 Sekunden Abstand je Anfrage und damit rund 24 statt 30 je Minute
- Weitere Entitäten derselben API: Ausschüsse, Abstimmungsverhalten, Politikerprofile
- Mandate der 9. Wahlperiode Sachsen-Anhalt nachziehen, sobald abgeordnetenwatch.de sie erfasst hat. Bis dahin sind die Namen der direkt Gewählten abgeleitet und als solche gekennzeichnet. Ein erneutes `npm run fetch:aw` genügt, der Vorrang der erfassten Mandate ist im Code angelegt
- Bundestag Open Data für Abstimmungen und Drucksachen
- Strukturdaten der Wahlkreise für Korrelationen, die es sonst nirgends gibt

## Offene Grundsatzfragen

**Zeitreihen vor 2017.** Die genutzte Quelle beginnt 2017. Für längere Reihen bräuchte es eine zweite Quelle mit klarer Lizenz. Das Auslesen fremder Tabellenseiten ist lizenzrechtlich nicht sauber und deshalb keine Option.

**Seitenanzahl.** Bei starkem Wachstum können tausende Einzelumfrageseiten als minderwertiger Inhalt eingestuft werden. Dann `build.generateSurveyPages` abschalten und Einzelumfragen nur in Tabellen führen. Die Belege bleiben über den Datenexport erhalten.

**Hauseffekte.** Eine Korrektur systematischer Institutsabweichungen wäre statistisch interessant, würde aber aus der Wiedergabe eine Modellrechnung machen. Falls sie kommt, dann nur als klar getrennte, zusätzliche Ansicht, niemals als Ersatz für die veröffentlichten Werte.
