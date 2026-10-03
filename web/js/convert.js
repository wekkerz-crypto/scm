/*
 * Gemeinsamer Einstieg: STEP-Text → Liste von Teilen mit XCS-Programm.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./step.js'), require('./panel.js'), require('./xcs.js'));
  } else {
    root.StepToXcs = factory(root.StepReader, root.PanelAnalyzer, root.XcsWriter);
  }
})(typeof self !== 'undefined' ? self : this, function (StepReader, PanelAnalyzer, XcsWriter) {
  'use strict';

  // Teilename für Anzeige, .xcs und .pgmx: Umlaute umschreiben, Leerzeichen → _, nur Zeichen, die überall gehen
  const UMLAUT = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss', 'ẞ': 'SS' };
  function partName(name) {
    let n = String(name || '').replace(/[äöüÄÖÜßẞ]/g, (c) => UMLAUT[c]);
    n = n.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // é → e usw.
    n = n.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_.-]/g, '_').replace(/_+/g, '_').replace(/^[_.]+|[_.]+$/g, '');
    return n || 'Teil';
  }
  const safeFileName = partName;

  // Nichtssagende Namen aus dem CAD (Onshape „Part 1“, „Body“ …) → Dateiname der STEP verwenden
  function genericName(n) {
    return !n || /^(part|teil|body|k(ö|oe)rper|solid|bauteil)[\s_-]*\d*$/i.test(String(n).trim()) || /open cascade/i.test(n);
  }

  // Liest alle Volumenkörper und gibt ihnen den Namen aus der STEP (Teilename, sonst Dateiname),
  // bereinigt und eindeutig. sourceName = Name der STEP-Datei.
  function readParts(stepText, sourceName) {
    const { solids } = StepReader.readStep(stepText);
    if (!solids.length) throw new Error('Die STEP-Datei enthält keinen Volumenkörper.');
    const base = sourceName ? String(sourceName).replace(/^.*[\\/]/, '').replace(/\.(step|stp)$/i, '') : '';
    const used = new Set();
    solids.forEach((s, i) => {
      s.stepName = s.name;
      let n = genericName(s.name) ? (base ? base + (solids.length > 1 ? '_' + (i + 1) : '') : s.name || 'Teil') : s.name;
      n = partName(n);
      let k = n;
      for (let j = 2; used.has(k.toLowerCase()); j++) k = n + '_' + j;
      used.add(k.toLowerCase());
      s.name = k;
    });
    return solids;
  }

  function convertSolid(solid, settings, options) {
    options = options || {};
    try {
      const panel = PanelAnalyzer.analyze(solid, options.orientation);
      const ov = options.overrides || {};
      const out = XcsWriter.write(panel, settings, { field: options.field, tools: ov.tools, steps: ov.steps, order: ov.order, depths: ov.depths });
      return { name: solid.name, fileName: safeFileName(solid.name) + '.xcs', panel: panel,
        xcs: out.text, ops: out.ops, warnings: out.warnings, field: out.field, groups: out.groups,
        defaultGroups: out.defaultGroups, error: null };
    } catch (err) {
      return { name: solid.name, fileName: safeFileName(solid.name) + '.xcs', panel: null, xcs: '',
        ops: [], warnings: [], error: err.message || String(err) };
    }
  }

  function convert(stepText, settings, sourceName) {
    return readParts(stepText, sourceName).map((s) => convertSolid(s, settings));
  }

  // Batch-Datei für den X-Konverter (Handbuch Kap. 8, Modus 0 = XCS-Import → PGMX).
  // Wandelt alle .xcs im Ordner der .bat um. Nur ASCII-Text, damit cmd.exe sie in jeder Codepage liest.
  function makeBatch(settings) {
    const cfg = Object.assign({}, XcsWriter.DEFAULTS, settings || {});
    const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, '?');
    const out = cfg.pgmxDir ? ascii(cfg.pgmxDir) : '%~dp0pgmx';
    const lines = [
      '@echo off',
      'rem Erzeugt vom STEP-zu-XCS Konverter.',
      'rem Wandelt alle .xcs-Dateien in diesem Ordner mit dem Maestro X-Konverter in .pgmx um.',
      'rem Pfade bei Bedarf hier anpassen:',
      'setlocal',
      'set "XCONV=' + ascii(cfg.xconverterPath) + '"',
      'set "TOOLS=' + ascii(cfg.toolsFile) + '"',
      'set "OUT=' + out + '"',
      '',
      'if not exist "%XCONV%" goto noconv',
      'if not exist "%TOOLS%" goto notools',
      'if not exist "%OUT%" mkdir "%OUT%"',
      'set /a OK=0',
      'set /a ERR=0',
      '',
      'for %%F in ("%~dp0*.xcs") do call :convert "%%~fF" "%%~nF"',
      '',
      'echo.',
      'echo Fertig: %OK% umgewandelt, %ERR% mit Fehler.',
      'echo Ausgabe: %OUT%',
      'pause',
      'exit /b %ERR%',
      '',
      ':convert',
      'echo Wandle um: %~2.xcs',
      'if exist "%OUT%\\%~2.pgmx" del "%OUT%\\%~2.pgmx"',
      'call "%XCONV%" -s -m 0 -t "%TOOLS%" -i "%~1" -o "%OUT%\\%~2.pgmx"',
      'if exist "%OUT%\\%~2.pgmx" (',
      '  set /a OK+=1',
      ') else (',
      '  echo   FEHLER: keine .pgmx erzeugt',
      '  set /a ERR+=1',
      ')',
      'exit /b 0',
      '',
      ':noconv',
      'echo X-Konverter nicht gefunden:',
      'echo %XCONV%',
      'echo Bitte den Pfad oben in dieser Datei (XCONV) anpassen.',
      'pause',
      'exit /b 1',
      '',
      ':notools',
      'echo Werkzeugdatei nicht gefunden:',
      'echo %TOOLS%',
      'echo Bitte den Pfad oben in dieser Datei (TOOLS) anpassen.',
      'pause',
      'exit /b 1',
      '',
    ];
    return lines.join('\r\n');
  }

  return { convert: convert, readParts: readParts, convertSolid: convertSolid, safeFileName: safeFileName, partName: partName,
    makeBatch: makeBatch };
});
