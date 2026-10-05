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
    // unter Windows reservierte Namen (CON, NUL, COM1 …) gehen nicht als Dateiname
    if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(n)) n = n.replace(/^[^.]+/, (m) => m + '_');
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

  // Stellen, die auf der Oberseite eines Teils offen sind (Taschen, Nuten, Falze, Sacklöcher, gewölbte Flächen) –
  // nach dem Wenden um Y liegen sie unten: dort hält kein Sauger. Gespiegelt in die Koordinaten der anderen Seite (X → L − x).
  function openZones(p) {
    const L = p.L;
    const mx = (q) => [L - q[0], q[1]];
    const rect = (x0, y0, x1, y1) => ({ poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(mx) });
    const zones = [];
    for (const k of p.pockets || []) {
      const pts = [];
      for (const q of k.segs) for (const t of PanelAnalyzer.segPoints(q)) pts.push(t);
      zones.push({ poly: pts.map(mx) });
    }
    for (const d of p.drills || []) if (d.face === 'Top' && !d.through) zones.push({ c: mx([d.x, d.y]), r: d.d / 2 });
    for (const g of p.grooves || []) zones.push(g.dir === 'X' ? rect(0, g.from, L, g.to) : rect(g.from, 0, g.to, p.W));
    for (const r of p.rebates || []) {
      // abgesetzter Falz: nur zwischen den Enden (from/to in Plattenkoordinaten vor dem Wenden)
      const a = r.from === null || r.from === undefined ? 0 : r.from;
      const ex = r.to === null || r.to === undefined ? null : r.to;
      if (r.edge === 'Front') zones.push(rect(a, 0, ex === null ? L : ex, r.width));
      else if (r.edge === 'Back') zones.push(rect(a, p.W - r.width, ex === null ? L : ex, p.W));
      else if (r.edge === 'Left') zones.push(rect(0, a, r.width, ex === null ? p.W : ex));
      else if (r.edge === 'Right') zones.push(rect(L - r.width, a, L, ex === null ? p.W : ex));
    }
    for (const c of p.curvedSurfaces || []) for (const r of c.rects) zones.push(rect(r.x0, r.y0, r.x1, r.y1));
    for (const g of p.clamex || []) {
      if (g.n[2] < 0.5) continue; // nur Nuten in der Oberseite liegen nach dem Wenden unten
      const hx = Math.abs(g.a[0]) * g.w / 2 + Math.abs(g.a[1]) * g.chord / 2;
      const hy = Math.abs(g.a[1]) * g.w / 2 + Math.abs(g.a[0]) * g.chord / 2;
      zones.push(rect(g.c[0] - hx, g.c[1] - hy, g.c[0] + hx, g.c[1] + hy));
    }
    return zones;
  }

  function placeMesh(options, panel) {
    if (!options.meshes || !panel.curvedSurfaces || !panel.curvedSurfaces.length) return null;
    const OM = typeof OcctMesh !== 'undefined' ? OcctMesh : require('./occtmesh.js');
    return OM.place(options.meshes, panel.tf, panel);
  }

  function result(solid, fileName, panel, out) {
    return { name: solid.name, fileName: fileName, panel: panel,
      xcs: out.text, ops: out.ops, warnings: out.warnings, field: out.field, groups: out.groups,
      defaultGroups: out.defaultGroups, suction: out.suction, suppressed: out.suppressed || [], error: null };
  }

  /*
   * Ein Teil umwandeln. options: orientation, field, overrides (Seite 1: tools, steps, order, depths, twoStep, curved,
   * suppress, twoSided), overrides2 (Seite 2: tools, steps, order, depths, suppress), meshes (OpenCascade).
   * Gibt es Bearbeitungen von unten, wird die Gegenseite (um Y gewendet) mit berechnet: ihre offenen Stellen sperren die
   * Sauger auf Seite 1; mit twoSided entsteht zusätzlich das Programm für Seite 2 (Ergebnis.side2, Dateien _S1/_S2).
   */
  function convertSolid(solid, settings, options) {
    options = options || {};
    // Werkstück-Profil (Werkzeuge/Strategie je Material) über die Einstellungen legen
    if (options.profile !== undefined && options.profile !== null) settings = XcsWriter.applyProfile(settings, options.profile);
    try {
      const cfgO = Object.assign({}, XcsWriter.DEFAULTS, settings || {});
      const panel = PanelAnalyzer.analyze(solid, options.orientation, { orientRule: cfgO.orientRule, fieldWidth: cfgO.fieldWidth });
      const ov = options.overrides || {};
      let other = null;
      if (panel.bottom.length) other = PanelAnalyzer.analyze(solid, PanelAnalyzer.turnOverY(solid, panel.orientation));
      const two = !!(ov.twoSided && other);
      const out = XcsWriter.write(panel, settings, { field: options.field, tools: ov.tools, steps: ov.steps, order: ov.order, depths: ov.depths, tech: ov.tech,
        twoStep: ov.twoStep, rebateReturn: ov.rebateReturn, tabs: ov.tabs, curved: ov.curved, mesh: placeMesh(options, panel), suppress: ov.suppress,
        avoid: other ? openZones(other) : null, twoSided: two });
      const base = safeFileName(solid.name);
      const res = result(solid, base + (two ? '_S1' : '') + '.xcs', panel, out);
      res.canTwoSided = !!other;
      if (two) {
        const ov2 = options.overrides2 || {};
        const out2 = XcsWriter.write(other, settings, { side: 2, field: options.field, tools: ov2.tools, steps: ov2.steps, order: ov2.order,
          depths: ov2.depths, tech: ov2.tech, rebateReturn: ov.rebateReturn, tabs: ov2.tabs, curved: ov.curved, mesh: placeMesh(options, other), suppress: ov2.suppress, avoid: openZones(panel) });
        res.side2 = result(solid, base + '_S2.xcs', other, out2);
        res.side2.side = 2;
      }
      return res;
    } catch (err) {
      return { name: solid.name, fileName: safeFileName(solid.name) + '.xcs', panel: null, xcs: '',
        ops: [], warnings: [], error: err.message || String(err) };
    }
  }

  /*
   * DXF (2D-Zeichnung) → Teil. Ohne Layer: die größte geschlossene Kontur ist das Teil, alles darin wird vorgeschlagen
   * (DxfReader.analyze). options wie convertSolid, dazu overrides.dxf = { T (Dicke), rot (0–3), features: { id: { kind, depth } } }.
   */
  function convertDxf(text, sourceName, settings, options) {
    options = options || {};
    const DR = typeof DxfReader !== 'undefined' ? DxfReader : require('./dxf.js');
    if (options.profile !== undefined && options.profile !== null) settings = XcsWriter.applyProfile(settings, options.profile);
    const name = partName(String(sourceName || 'DXF').replace(/^.*[\\/]/, '').replace(/\.dxf$/i, ''));
    const solid = { name: name };
    try {
      const ov = options.overrides || {};
      const dx = ov.dxf || {};
      const cfg = Object.assign({}, XcsWriter.DEFAULTS, settings || {});
      const panel = DR.analyze(text, { name: name, T: dx.T, rot: dx.rot, features: dx.features, drills: cfg.drillsVertical });
      const out = XcsWriter.write(panel, settings, { field: options.field, tools: ov.tools, steps: ov.steps, order: ov.order, depths: ov.depths, tech: ov.tech,
        twoStep: ov.twoStep, rebateReturn: ov.rebateReturn, tabs: ov.tabs, suppress: ov.suppress });
      const res = result(solid, safeFileName(name) + '.xcs', panel, out);
      res.dxf = panel.dxf;
      return res;
    } catch (err) {
      return { name: name, fileName: safeFileName(name) + '.xcs', panel: null, xcs: '', ops: [], warnings: [], error: err.message || String(err) };
    }
  }

  function convert(stepText, settings, sourceName) {
    return readParts(stepText, sourceName).map((s) => convertSolid(s, settings));
  }

  // Batch-Datei für den X-Konverter (Handbuch Kap. 8, Modus 0 = XCS-Import → PGMX).
  // Wandelt alle .xcs im Ordner der .bat um. Enthalten die Pfade Umlaute o. Ä., stellt die .bat
  // die Konsole auf UTF-8 um (chcp 65001), sonst bleibt sie reines ASCII.
  function makeBatch(settings) {
    const cfg = Object.assign({}, XcsWriter.DEFAULTS, settings || {});
    const ascii = (s) => String(s).replace(/[\r\n"]/g, '');
    const out = cfg.pgmxDir ? ascii(cfg.pgmxDir) : '%~dp0pgmx';
    const utf8 = /[^\x20-\x7e]/.test([cfg.xconverterPath, cfg.toolsFile, cfg.pgmxDir].join(''));
    const lines = [
      '@echo off',
      utf8 ? 'chcp 65001 >nul' : null,
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
    return lines.filter((l) => l !== null).join('\r\n');
  }

  return { convert: convert, readParts: readParts, convertSolid: convertSolid, convertDxf: convertDxf, safeFileName: safeFileName, partName: partName,
    makeBatch: makeBatch };
});
