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

  function safeFileName(name) {
    return String(name).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'Teil';
  }

  // Liest alle Volumenkörper; Fehler einzelner Teile werden im Teil gemeldet.
  function readParts(stepText) {
    const { solids } = StepReader.readStep(stepText);
    if (!solids.length) throw new Error('Die STEP-Datei enthält keinen Volumenkörper.');
    return solids;
  }

  function convertSolid(solid, settings, options) {
    options = options || {};
    try {
      const panel = PanelAnalyzer.analyze(solid, options.orientation);
      const ov = options.overrides || {};
      const out = XcsWriter.write(panel, settings, { field: options.field, tools: ov.tools, steps: ov.steps, order: ov.order });
      return { name: solid.name, fileName: safeFileName(solid.name) + '.xcs', panel: panel,
        xcs: out.text, ops: out.ops, warnings: out.warnings, field: out.field, groups: out.groups,
        defaultGroups: out.defaultGroups, error: null };
    } catch (err) {
      return { name: solid.name, fileName: safeFileName(solid.name) + '.xcs', panel: null, xcs: '',
        ops: [], warnings: [], error: err.message || String(err) };
    }
  }

  function convert(stepText, settings) {
    return readParts(stepText).map((s) => convertSolid(s, settings));
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

  return { convert: convert, readParts: readParts, convertSolid: convertSolid, safeFileName: safeFileName,
    makeBatch: makeBatch };
});
