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
      const out = XcsWriter.write(panel, settings, { field: options.field });
      return { name: solid.name, fileName: safeFileName(solid.name) + '.xcs', panel: panel,
        xcs: out.text, ops: out.ops, warnings: out.warnings, field: out.field, error: null };
    } catch (err) {
      return { name: solid.name, fileName: safeFileName(solid.name) + '.xcs', panel: null, xcs: '',
        ops: [], warnings: [], error: err.message || String(err) };
    }
  }

  function convert(stepText, settings) {
    return readParts(stepText).map((s) => convertSolid(s, settings));
  }

  return { convert: convert, readParts: readParts, convertSolid: convertSolid, safeFileName: safeFileName };
});
