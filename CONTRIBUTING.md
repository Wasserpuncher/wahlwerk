# Mitarbeit

## Die eine Regel

Keine Zahl ohne Beleg. Wer eine Zahl, eine Sitzverteilung oder eine Regel einträgt, trägt die Quelle mit ein. Ein Pull Request, der eine Konfiguration von `verified: false` auf `true` setzt, ohne Fundstelle und Prüfdatum anzugeben, wird nicht gemerged.

## Vor jedem Pull Request

```bash
node scripts/make-fixture.mjs
npm run fetch:fixture
npm run build
npm run check
```

`npm run check` muss vollständig grün sein.

## Neue Rechenverfahren

Jedes neue Verfahren braucht einen Testfall in `scripts/check.mjs` und eine von Hand nachgerechnete Herleitung in `docs/TESTFAELLE.md`. Ein Verfahren, das nur der Code kennt, ist kein offengelegtes Verfahren.

## Was nicht aufgenommen wird

- Tracking, Analytics, Werbung, externe Schriften, externe Skripte
- Schätzungen, Interpolationen oder aufgefüllte Lücken
- politische Bewertungen von Parteien, Koalitionen oder Instituten
- Abhängigkeiten ohne zwingenden Grund. Das Projekt kommt bisher mit null Laufzeitabhängigkeiten aus, und das soll so bleiben.

## Stil

Deutsche Kommentare und Texte, keine Gedankenstriche als Satzzeichen. Zwei Leerzeichen Einrückung. Keine Formatter-Abhängigkeit.
