# Wahlwerk

Statischer Generator für ein quellenbelegtes Portal zu deutschen Wahlumfragen.

Jede angezeigte Zahl trägt Institut, Auftraggeber, Befragungszeitraum, Fallzahl, Methode und eine Datensatz-ID. Jeder berechnete Wert ist per Hand nachrechenbar, weil die Rechenvorschrift offenliegt und die verwendeten Einzelumfragen samt Gewicht auf derselben Seite stehen.

Kein JavaScript im Frontend. Keine Cookies. Keine externen Requests. Keine Fremdschriften.

## Stand

Version 0.2. Was funktioniert:

- Abruf der Umfragedatenbank von dawum.de mit Aktualitätsprüfung über `last_update.txt`
- defensive Normalisierung mit protokollierten Datensatzfehlern statt stiller Ersatzwerte
- gewichteter Trend je Parlament mit vollständig offengelegter Formel
- Streuungsanalyse zwischen den Instituten
- Sitzverteilung nach Sainte-Laguë, Hare/Niemeyer und d'Hondt, gegen von Hand nachgerechnete Beispiele getestet
- Koalitionsrechner mit minimalen Mehrheiten, rein arithmetisch
- Szenarien zur Sperrklausel in beide Richtungen: knapp gescheiterte Parteien ziehen doch ein, knapp eingezogene fallen doch heraus
- fünf serverseitig gerenderte SVG-Diagramme je Parlamentsseite, ohne JavaScript und ohne Zeichenbibliothek
- **Wahlkalender und Wahlseiten**: alle künftigen Wahltermine aus der amtlichen Übersicht der Bundeswahlleiterin, je datiertem Termin mit Umfragen eine eigene Seite mit Countdown, Trend, Sitzmodell und Nachkontrolle
- **Nachkontrolle**: der Umfragestand kurz vor einer Wahl gegen das amtliche Ergebnis, mit demselben Verfahren und denselben Parametern gerechnet wie überall sonst. Für Sachsen-Anhalt 2021: mittlerer absoluter Fehler 2,32 Prozentpunkte, größte Abweichung −8,5 Punkte bei der CDU, nur vier von acht Parteien im 95-Prozent-Intervall
- **Chronik**: der vollständige Bestand nach Jahr und Monat, damit jede einzelne Umfrage erreichbar ist und nicht nur die jüngsten 200 je Tabelle
- **Auftraggeber und Erhebungsmethoden** als eigene Achsen, bisher standen beide nur in den Tabellen
- Seitentypen: Start, Wahlkalender, Wahl, Parlamentsübersicht, Parlament, Parlament × Institut, Institutsübersicht, Institut, Parteiübersicht, Partei, Auftraggeberübersicht, Auftraggeber, Methodenübersicht, Methode, Chronik, Jahr, Monat, Einzelumfrage, Methodik, Quellen, Daten, Datenschutz, 404 (die Impressumsseite ist über `legal.renderImpressum` abschaltbar und steht derzeit auf `false`, Begründung in `config/site.json`)
- Sitemap-Index mit automatischer Aufteilung, robots.txt, RSS-Feed, JSON- und CSV-Export
- JSON-LD je Seite: `Dataset`, `BreadcrumbList`, `CollectionPage`, `WebSite`
- 174 Selbsttests über Rechenverfahren und erzeugtes HTML. Neu darunter:
  - **Erreichbarkeit statt Existenz**: ein Durchlauf von der Startseite aus, Link für Link. Der Bau bricht ab, sobald eine einzige Seite nicht mehr erreichbar ist. Das ist bewusst schärfer als „irgendwo verlinkt“ — eine Seite, die nur von einer selbst unerreichbaren Seite verlinkt ist, wäre unter dem schwächeren Kriterium unauffällig und trotzdem nicht zu finden.
  - **Wahltag-Probe**: die Seite wird zweimal zusätzlich gebaut, mit künstlich gesetztem Bauzeitpunkt auf den Wahltag und den Tag danach. Damit laufen die beiden Zustände, die im Echtbetrieb genau einmal vorkommen, vorher mindestens einmal — statt erstmals am Wahlabend.
  - **Gliederung**: keine übersprungene Überschriftenebene, keine doppelt vergebene `id`, auf keiner der 4381 Seiten.
  - Der Wächter gegen externe Ressourcen prüft jetzt jedes einbindende Element statt nur des ersten Treffers. Vorher blieb er am Canonical-Link hängen und konnte gar nicht auslösen.

Was noch fehlt, steht ehrlich in [`docs/ROADMAP.md`](docs/ROADMAP.md). Die amtlichen Wahlergebnisse sind erst angefangen: `config/elections.json` trägt bisher nur Sachsen-Anhalt mit sechs Landtagswahlen, davon eine nach dem Zwei-Quellen-Kriterium verifiziert. Eine belegbare Institutsabweichung gibt es deshalb noch nicht.

Verifizierte Sitzzuteilungen: **Bundestag, Berlin, Brandenburg, Sachsen, Sachsen-Anhalt, Thüringen, Mecklenburg-Vorpommern, Baden-Württemberg, Hessen, Rheinland-Pfalz, Saarland, Nordrhein-Westfalen, Niedersachsen, Schleswig-Holstein und Hamburg** — je Eintrag mit Sitzzahl, Verfahren, Sperrklausel, Paragrafenstelle, Quelle und Prüfdatum, abgelesen am Gesetzeswortlaut.

Zwei Parlamente bleiben **bewusst gesperrt**, obwohl ihre Regeln geprüft sind. In **Bayern** zählen Erst- und Zweitstimmen zusammen, zugeteilt wird siebenmal getrennt nach Wahlkreisen mit festen Kontingenten, und Überhang entsteht auf Wahlkreisebene. In **Bremen** gibt es überhaupt kein landesweites Zuteilungsverfahren: Bremen und Bremerhaven werden getrennt gerechnet, mit je eigener Sperrklausel — eine Partei kann mit 2,4 Prozent landesweit einziehen und mit über 5 Prozent leer ausgehen. Aus einer landesweiten Sonntagsfrage ist beides nicht ableitbar. Die Begründung steht auf der jeweiligen Seite, statt dass der Abschnitt kommentarlos leer bleibt.

Eine verifizierte Regel heißt nicht, dass überall eine Sitzverteilung erscheint. Der Trend verlangt drei Umfragen innerhalb von 45 Tagen; zu Ländern ohne bevorstehende Wahl wird seltener gefragt. Derzeit zeigen vier Parlamente eine Modellrechnung, die übrigen sagen auf ihrer Seite, dass die Regel steht und nur die Datengrundlage fehlt. Zur Landtagswahl Sachsen-Anhalt am 6. September 2026 gibt es eine ausgearbeitete Fachnotiz mit Datenlage, Szenarien und Fallstricken in [`docs/SACHSEN-ANHALT-2026.md`](docs/SACHSEN-ANHALT-2026.md).

## Schnellstart

```bash
git clone <repo-url> && cd wahlwerk
node --version            # 20 oder neuer

# Variante A: mit echten Daten
npm run fetch
npm run build
npm run check
npm run serve             # http://localhost:4321

# Variante B: offline, mit synthetischen Testdaten
node scripts/make-fixture.mjs
npm run fetch:fixture
npm run build
```

Keine Abhängigkeiten. `npm install` ist nicht nötig, `node_modules` gibt es nicht.

## Vor dem ersten Deploy

Diese vier Punkte sind Pflicht, sonst ist der Build unbrauchbar oder rechtlich angreifbar.

1. **`config/site.json` → `baseUrl`** auf die echte Domain setzen. Solange dort `example.invalid` steht, zeigen Canonical-Tags und Sitemap ins Leere. Der Build warnt.
2. **`config/site.json` → `legal.verantwortlicher`** ausfüllen. Die Platzhalter `BITTE AUSFUELLEN` landen sonst wörtlich in der Datenschutzerklärung.
3. **`config/site.json` → `hosting`** mit den tatsächlichen Angaben füllen. Eine Datenschutzerklärung mit falschen Hosting-Angaben ist ein eigener Verstoß.
4. **Niemals einen Fixture-Build veröffentlichen.** Er enthält frei erfundene Zahlen, ist aber an jedem Warnbanner erkennbar.

## Deploy auf Netlify

[`netlify.toml`](netlify.toml) ist fertig konfiguriert: Build-Befehl `npm run fetch && npm run build && npm run check`, Ausgabeverzeichnis `dist`, Node 22. Schlagen die Selbsttests fehl, bricht Netlify den Deploy ab und die alte Version bleibt online.

Nach dem Verbinden des Repositories sind zwei Dinge zu tun:

1. **`baseUrl` auf die Netlify-Domain setzen.** Die endgültige Adresse steht erst nach dem ersten Deploy fest. Also einmal deployen, dann `config/site.json` anpassen und erneut deployen. Bis dahin sind Sitemap und Canonical-Tags wertlos, der Build warnt entsprechend.
2. **Regelmäßigen Neubau einrichten.** Netlify baut nur bei einem Push. Ohne Auslöser bleiben die Umfragezahlen auf dem Stand des letzten Commits stehen. Abhilfe: In den Netlify-Einstellungen unter *Build & deploy → Build hooks* eine Hook-URL erzeugen und diese von einem Zeitplan aufrufen lassen, etwa per `curl -X POST` aus einem GitHub-Actions-Cron.

Der mitgelieferte Workflow [`.github/workflows/build.yml`](.github/workflows/build.yml) veröffentlicht auf GitHub Pages, nicht auf Netlify. Beide Wege lassen sich parallel betreiben; dann sollte `baseUrl` auf die Adresse zeigen, die tatsächlich beworben wird, damit die Canonical-Tags nicht auf zwei Domains verweisen.

## Zwei Lizenzen, sauber getrennt

| Teil | Lizenz | Pflicht bei Weiterverwendung |
|---|---|---|
| Quellcode | AGPL-3.0-or-later | Änderungen offenlegen, auch beim Betrieb als Netzwerkdienst |
| Umfragedatenbank | ODC-ODbL 1.0 | dawum.de und Lizenz nennen und verlinken, abgeleitete Datenbanken ebenfalls unter ODbL |

Die ODbL-Pflicht ist keine Formalie. Sie ergibt sich aus den Nutzungsbedingungen der Quelle und ist im Footer, im JSON-Export, im CSV-Kopf und in den JSON-LD-Blöcken hinterlegt. Wer die Attribution entfernt, verliert das Nutzungsrecht.

## Rechtliches

Siehe [`docs/RECHTLICHES.md`](docs/RECHTLICHES.md). Kurzfassung zum Impressum: Das Weglassen lässt sich in der Konfiguration einstellen, ist aber nicht zu empfehlen. Art. 13 DSGVO verlangt Name und Kontakt des Verantwortlichen ohnehin in der Datenschutzerklärung, das Weglassen spart also keine Angabe, erhöht aber das Abmahnrisiko nach § 5 DDG erheblich. Nichts davon ist Rechtsberatung.

## SEO, realistisch betrachtet

Technisch umgesetzt ist alles, was sich umsetzen lässt: vorgerendertes HTML ohne Client-Rendering, eindeutige Titel und Beschreibungen je Seite (durch Test erzwungen), Canonical-Tags, strukturierte Daten, Breadcrumbs, dichte interne Verlinkung, Sitemap-Index, RSS, keine Render-blockierenden Ressourcen, unter 10 KB CSS und null Byte JavaScript.

Was niemand zusichern kann: dass Google indexiert. Indexierung ist eine Entscheidung der Suchmaschine, nicht eine Eigenschaft der Seite. Zwei ehrliche Risiken bei diesem Seitentyp:

- **Thin Content.** Tausende sich stark ähnelnde Umfrageseiten können als minderwertig eingestuft werden. Gegenmaßnahme im Build: jede Einzelseite trägt Belegblock, methodische Einordnung und individuelle Beschreibung. Wenn der Bestand stark wächst, kann es sinnvoll sein, `build.generateSurveyPages` abzuschalten und Einzelumfragen nur noch in Tabellen zu führen.
- **Duplicate Content gegenüber der Quelle.** dawum.de zeigt dieselben Zahlen. Unterscheidbar wird die Seite durch das, was hier zusätzlich passiert: offengelegte Gewichtung, Streuungsanalyse, verifizierungspflichtige Sitzrechnung.

## Struktur

```
config/          Site, Parlamente, amtliche Ergebnisse, Wahltermine, Wahlleitungen
content/         Inhaltsseiten als HTML mit Platzhaltern
scripts/         Abruf, Build, Tests, Vorschauserver
scripts/lib/     Rechenkern: dawum, trend, seats, coalitions, charts, stats,
                 archive, wahltermine, nachkontrolle, render, util
src/styles/      Stylesheet
fixtures/        synthetische Testdaten
data/            erzeugt, nicht versioniert
dist/            erzeugt, nicht versioniert
docs/            Rechtliches, Testfälle, Roadmap
```

## Grundregel des Projekts

Lieber keine Zahl als eine erfundene. Wo eine Angabe nicht verifiziert ist, bleibt der Abschnitt leer und sagt warum. Das gilt insbesondere für Sitzverteilungen: In `config/parliaments.json` sind 15 Parlamente als verifiziert markiert, zwei sind trotz geprüfter Regel bewusst gesperrt (Bayern, Bremen). Ein Parlament ohne geprüfte Rechtsgrundlage zeigt keine Sitzrechnung, bis jemand Sitzzahl und Zuteilungsverfahren gegen das jeweilige Wahlgesetz geprüft und die Quelle eingetragen hat. Dasselbe gilt für amtliche Wahlergebnisse: ohne verifiziertes Ergebnis bleibt die Nachkontrolle leer und sagt warum, statt gegen eine ungeprüfte Zahl zu vergleichen.
