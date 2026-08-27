# Wahlwerk

Statischer Generator für ein quellenbelegtes Portal zu deutschen Wahlumfragen.

Jede angezeigte Zahl trägt Institut, Auftraggeber, Befragungszeitraum, Fallzahl, Methode und eine Datensatz-ID. Jeder berechnete Wert ist per Hand nachrechenbar, weil die Rechenvorschrift offenliegt und die verwendeten Einzelumfragen samt Gewicht auf derselben Seite stehen.

Kein JavaScript im Frontend. Keine Cookies. Keine externen Requests. Keine Fremdschriften.

## Stand

Version 0.1. Was funktioniert:

- Abruf der Umfragedatenbank von dawum.de mit Aktualitätsprüfung über `last_update.txt`
- defensive Normalisierung mit protokollierten Datensatzfehlern statt stiller Ersatzwerte
- gewichteter Trend je Parlament mit vollständig offengelegter Formel
- Streuungsanalyse zwischen den Instituten
- Sitzverteilung nach Sainte-Laguë, Hare/Niemeyer und d'Hondt, gegen von Hand nachgerechnete Beispiele getestet
- Koalitionsrechner mit minimalen Mehrheiten, rein arithmetisch
- Szenarien zur Sperrklausel in beide Richtungen: knapp gescheiterte Parteien ziehen doch ein, knapp eingezogene fallen doch heraus
- fünf serverseitig gerenderte SVG-Diagramme je Parlamentsseite, ohne JavaScript und ohne Zeichenbibliothek
- Seitentypen: Start, Parlamentsübersicht, Parlament, Parlament × Institut, Institutsübersicht, Institut, Parteiübersicht, Partei, Einzelumfrage, Methodik, Quellen, Daten, Datenschutz, 404 (die Impressumsseite ist über `legal.renderImpressum` abschaltbar und steht derzeit auf `false`, Begründung in `config/site.json`)
- Sitemap-Index mit automatischer Aufteilung, robots.txt, RSS-Feed, JSON- und CSV-Export
- JSON-LD je Seite: `Dataset`, `BreadcrumbList`, `CollectionPage`, `WebSite`
- 96 Selbsttests über Rechenverfahren und erzeugtes HTML

Was noch fehlt, steht ehrlich in [`docs/ROADMAP.md`](docs/ROADMAP.md). Die amtlichen Wahlergebnisse sind erst angefangen: `config/elections.json` trägt bisher nur Sachsen-Anhalt mit sechs Landtagswahlen, davon eine nach dem Zwei-Quellen-Kriterium verifiziert. Eine belegbare Institutsabweichung gibt es deshalb noch nicht.

Verifizierte Sitzzuteilungen: Bundestag und Sachsen-Anhalt. Die übrigen 15 Landtage liegen mit 1268 Umfragen in den Daten, ihre Sitzzuteilungsregeln sind aber noch nicht verifiziert; solange bleibt der Abschnitt dort leer statt geraten. Zur Landtagswahl Sachsen-Anhalt am 6. September 2026 gibt es eine ausgearbeitete Fachnotiz mit Datenlage, Szenarien und Fallstricken in [`docs/SACHSEN-ANHALT-2026.md`](docs/SACHSEN-ANHALT-2026.md).

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
config/          Site- und Parlamentskonfiguration
content/         Inhaltsseiten als HTML mit Platzhaltern
scripts/         Abruf, Build, Tests, Vorschauserver
scripts/lib/     Rechenkern: dawum, trend, seats, coalitions, render, util
src/styles/      Stylesheet
fixtures/        synthetische Testdaten
data/            erzeugt, nicht versioniert
dist/            erzeugt, nicht versioniert
docs/            Rechtliches, Testfälle, Roadmap
```

## Grundregel des Projekts

Lieber keine Zahl als eine erfundene. Wo eine Angabe nicht verifiziert ist, bleibt der Abschnitt leer und sagt warum. Das gilt insbesondere für Sitzverteilungen: In `config/parliaments.json` ist bisher nur der Bundestag als verifiziert markiert. Alle anderen Parlamente zeigen keine Sitzrechnung, bis jemand die Sitzzahl und das Zuteilungsverfahren gegen das jeweilige Wahlgesetz geprüft und die Quelle eingetragen hat.
