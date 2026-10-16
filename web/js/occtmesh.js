/*
 * Dreiecksnetz eines STEP-Bauteils aus OpenCascade (occt-import-js) in Plattenkoordinaten.
 * Gemeinsam für die 3D-Ansicht und das Kugelfräsen gewölbter Flächen; im Browser liefert View3D.load()
 * die OpenCascade-Instanz, in Node lädt loadNode() sie aus web/js/vendor.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OcctMesh = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const cache = new Map(); // STEP-Text → Ergebnis von OpenCascade
  let nodeOcct = null;

  // OpenCascade in Node laden (einmal)
  function loadNode() {
    if (!nodeOcct) {
      const fs = require('fs');
      const path = require('path');
      const zlib = require('zlib');
      const dir = path.join(__dirname, 'vendor');
      const src = fs.readFileSync(path.join(dir, 'occt-wasm.js'), 'utf8');
      const wasm = zlib.gunzipSync(Buffer.from(src.slice(src.indexOf('"') + 1, src.lastIndexOf('"')), 'base64'));
      nodeOcct = require(path.join(dir, 'occt-import-js.js'))({ wasmBinary: wasm });
      nodeOcct.catch(() => { nodeOcct = null; });
    }
    return nodeOcct;
  }

  // alle Netze der STEP-Datei (Modellkoordinaten)
  function read(occt, text) {
    let r = cache.get(text);
    if (!r) {
      r = occt.ReadStepFile(new TextEncoder().encode(text), {
        linearUnit: 'millimeter', linearDeflectionType: 'absolute_value', linearDeflection: 0.05, angularDeflection: 0.12,
      });
      if (!r || !r.success) throw new Error('OpenCascade konnte die STEP-Datei nicht lesen.');
      if (cache.size > 20) cache.clear();
      cache.set(text, r);
    }
    return r.meshes;
  }

  // Netz in Plattenkoordinaten bringen und das zum Teil passende Netz wählen (Mehrteiler).
  // Ergebnis je Netz und Lage zwischengespeichert (gleiches Objekt → Bahnen bleiben im Zwischenspeicher)
  const placed = typeof WeakMap === 'function' ? new WeakMap() : null;
  function place(meshes, tf, panel) {
    const key = JSON.stringify([tf.m, tf.t, panel.L, panel.W, panel.T]);
    let m = placed && placed.get(meshes);
    if (!m) { m = new Map(); if (placed) placed.set(meshes, m); }
    if (!m.has(key)) m.set(key, placeNow(meshes, tf, panel));
    return m.get(key);
  }

  function placeNow(meshes, tf, panel) {
    const P = (x, y, z) => [
      tf.m[0][0] * x + tf.m[0][1] * y + tf.m[0][2] * z + tf.t[0],
      tf.m[1][0] * x + tf.m[1][1] * y + tf.m[1][2] * z + tf.t[1],
      tf.m[2][0] * x + tf.m[2][1] * y + tf.m[2][2] * z + tf.t[2],
    ];
    let best = null;
    for (const m of meshes) {
      const a = m.attributes.position.array;
      const pos = new Float32Array(a.length);
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < a.length; i += 3) {
        const q = P(a[i], a[i + 1], a[i + 2]);
        for (let k = 0; k < 3; k++) { pos[i + k] = q[k]; if (q[k] < lo[k]) lo[k] = q[k]; if (q[k] > hi[k]) hi[k] = q[k]; }
      }
      const err = Math.abs(lo[0]) + Math.abs(lo[1]) + Math.abs(lo[2]) + Math.abs(hi[0] - panel.L) + Math.abs(hi[1] - panel.W) + Math.abs(hi[2] - panel.T);
      if (!best || err < best.err) best = { m: m, pos: pos, lo: lo, err: err };
    }
    if (!best) return null;
    // Baugruppe mit eigener Lage: auf den Nullpunkt schieben (Drehung bleibt wie erkannt)
    if (best.err > 1) {
      for (let i = 0; i < best.pos.length; i += 3) for (let k = 0; k < 3; k++) best.pos[i + k] -= best.lo[k];
    }
    const nrm = best.m.attributes.normal ? best.m.attributes.normal.array : null;
    let normals = null;
    if (nrm) {
      normals = new Float32Array(nrm.length);
      for (let i = 0; i < nrm.length; i += 3) {
        for (let k = 0; k < 3; k++) normals[i + k] = tf.m[k][0] * nrm[i] + tf.m[k][1] * nrm[i + 1] + tf.m[k][2] * nrm[i + 2];
      }
    }
    return { pos: best.pos, normals: normals, index: best.m.index.array, err: best.err };
  }

  return { loadNode: loadNode, read: read, place: place };
});
