/*
 * Minimaler STEP-Leser (ISO 10303-21) für B-Rep-Volumenkörper.
 *
 * Liest die Topologie (Körper → Flächen → Kanten) mit analytischer Geometrie
 * (Ebene, Zylinder, Linie, Kreis). Alle Längen werden nach Millimeter umgerechnet.
 * Läuft im Browser (window.StepReader) und in Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StepReader = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- Parser

  function Ref(id) { this.id = id; }
  function Enum(v) { this.v = v; }
  function Typed(type, args) { this.type = type; this.args = args; }

  function stripComments(s) {
    let out = '';
    let i = 0;
    let inStr = false;
    while (i < s.length) {
      const c = s[i];
      if (inStr) {
        out += c;
        if (c === "'") {
          if (s[i + 1] === "'") { out += "'"; i += 2; continue; }
          inStr = false;
        }
        i++;
      } else if (c === "'") {
        inStr = true; out += c; i++;
      } else if (c === '/' && s[i + 1] === '*') {
        const end = s.indexOf('*/', i + 2);
        i = end < 0 ? s.length : end + 2;
      } else {
        out += c; i++;
      }
    }
    return out;
  }

  // Teilt den DATA-Abschnitt in Anweisungen (getrennt durch ';' außerhalb von Strings).
  function splitStatements(s) {
    const out = [];
    let start = 0;
    let inStr = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (c === "'") {
          if (s[i + 1] === "'") i++;
          else inStr = false;
        }
      } else if (c === "'") {
        inStr = true;
      } else if (c === ';') {
        out.push(s.slice(start, i));
        start = i + 1;
      }
    }
    return out;
  }

  function Lexer(s) { this.s = s; this.i = 0; }
  Lexer.prototype.ws = function () {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  };
  Lexer.prototype.peek = function () { this.ws(); return this.s[this.i]; };
  Lexer.prototype.expect = function (c) {
    this.ws();
    if (this.s[this.i] !== c) throw new Error('STEP: "' + c + '" erwartet bei ' + this.s.slice(this.i, this.i + 40));
    this.i++;
  };
  Lexer.prototype.keyword = function () {
    this.ws();
    const m = /^[A-Za-z_][A-Za-z0-9_\-]*/.exec(this.s.slice(this.i, this.i + 200));
    if (!m) throw new Error('STEP: Schlüsselwort erwartet bei ' + this.s.slice(this.i, this.i + 40));
    this.i += m[0].length;
    return m[0].toUpperCase();
  };
  Lexer.prototype.list = function () {
    this.expect('(');
    const items = [];
    if (this.peek() === ')') { this.i++; return items; }
    for (;;) {
      items.push(this.value());
      const c = this.peek();
      if (c === ',') { this.i++; continue; }
      if (c === ')') { this.i++; return items; }
      throw new Error('STEP: "," oder ")" erwartet bei ' + this.s.slice(this.i, this.i + 40));
    }
  };
  Lexer.prototype.value = function () {
    const c = this.peek();
    const s = this.s;
    if (c === '(') return this.list();
    if (c === '#') {
      this.i++;
      const m = /^\d+/.exec(s.slice(this.i, this.i + 20));
      this.i += m[0].length;
      return new Ref(+m[0]);
    }
    if (c === "'") {
      this.i++;
      let str = '';
      for (;;) {
        const ch = s[this.i++];
        if (ch === undefined) throw new Error('STEP: offener String');
        if (ch === "'") {
          if (s[this.i] === "'") { str += "'"; this.i++; continue; }
          break;
        }
        str += ch;
      }
      return decodeStepString(str);
    }
    if (c === '.') {
      const end = s.indexOf('.', this.i + 1);
      const v = s.slice(this.i + 1, end);
      this.i = end + 1;
      return new Enum(v.toUpperCase());
    }
    if (c === '$') { this.i++; return null; }
    if (c === '*') { this.i++; return '*'; }
    if (c === '"') {
      const end = s.indexOf('"', this.i + 1);
      const v = s.slice(this.i + 1, end);
      this.i = end + 1;
      return v;
    }
    if (/[0-9+\-.]/.test(c)) {
      const m = /^[+\-]?(\d+\.?\d*|\.\d+)([eE][+\-]?\d+)?/.exec(s.slice(this.i, this.i + 40));
      this.i += m[0].length;
      return parseFloat(m[0]);
    }
    if (/[A-Za-z_]/.test(c)) {
      const kw = this.keyword();
      return new Typed(kw, this.list());
    }
    throw new Error('STEP: unerwartetes Zeichen "' + c + '"');
  };

  // \X2\00FC\X0\ (UTF-16-Hex) und \X\FC (ISO-8859-1) dekodieren.
  function decodeStepString(str) {
    if (str.indexOf('\\') < 0) return str;
    return str
      .replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, function (_, hex) {
        let out = '';
        for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
        return out;
      })
      .replace(/\\X\\([0-9A-Fa-f]{2})/g, function (_, hex) { return String.fromCharCode(parseInt(hex, 16)); })
      .replace(/\\\\/g, '\\');
  }

  function parseEntities(text) {
    const clean = stripComments(text);
    const dataStart = clean.search(/\bDATA\s*(\([^)]*\))?\s*;/i);
    if (dataStart < 0) throw new Error('Keine STEP-Datei (DATA-Abschnitt fehlt).');
    const afterData = clean.indexOf(';', dataStart) + 1;
    const statements = splitStatements(clean.slice(afterData));
    const entities = new Map();
    for (const st of statements) {
      const m = /^\s*#(\d+)\s*=/.exec(st);
      if (!m) continue;
      const lx = new Lexer(st.slice(m[0].length));
      const id = +m[1];
      if (lx.peek() === '(') {
        // Komplexe Instanz: ( TYP1(...) TYP2(...) )
        lx.i++;
        const parts = {};
        while (lx.peek() !== ')') {
          const kw = lx.keyword();
          parts[kw] = lx.list();
        }
        entities.set(id, { id: id, type: null, args: null, parts: parts });
      } else {
        const kw = lx.keyword();
        entities.set(id, { id: id, type: kw, args: lx.list(), parts: null });
      }
    }
    return entities;
  }

  // ---------------------------------------------------------------- Modell

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function norm(a) { const l = Math.hypot(a[0], a[1], a[2]); return l > 0 ? scale(a, 1 / l) : a; }

  function lengthUnitFactor(entities) {
    // Faktor Datei-Einheit → mm
    for (const e of entities.values()) {
      if (!e.parts || !e.parts.LENGTH_UNIT) continue;
      if (e.parts.SI_UNIT) {
        const prefix = e.parts.SI_UNIT[0];
        const p = prefix instanceof Enum ? prefix.v : null;
        const f = { MILLI: 1, CENTI: 10, DECI: 100, KILO: 1e6, MICRO: 1e-3 };
        return p ? (f[p] !== undefined ? f[p] : 1) : 1000;
      }
      if (e.parts.CONVERSION_BASED_UNIT) {
        const name = String(e.parts.CONVERSION_BASED_UNIT[0] || '').toUpperCase();
        if (name.indexOf('INCH') >= 0) return 25.4;
        if (name.indexOf('FOOT') >= 0) return 304.8;
        const mRef = e.parts.CONVERSION_BASED_UNIT[1];
        const m = mRef instanceof Ref ? entities.get(mRef.id) : null;
        if (m && m.args) {
          const v = m.args[0] instanceof Typed ? m.args[0].args[0] : m.args[0];
          if (typeof v === 'number') return v; // Annahme: Basis mm
        }
      }
    }
    return 1; // Standard: mm
  }

  function Model(entities) {
    this.e = entities;
    this.unit = lengthUnitFactor(entities);
    this.warnings = [];
    this._cache = new Map();
  }

  Model.prototype.get = function (ref) {
    const id = ref instanceof Ref ? ref.id : ref;
    const e = this.e.get(id);
    if (!e) throw new Error('STEP: Verweis #' + id + ' fehlt');
    return e;
  };

  Model.prototype.point = function (ref) {
    const e = this.get(ref);
    const c = e.args[1];
    return [(c[0] || 0) * this.unit, (c[1] || 0) * this.unit, (c[2] || 0) * this.unit];
  };

  Model.prototype.direction = function (ref) {
    const e = this.get(ref);
    const c = e.args[1];
    return norm([c[0] || 0, c[1] || 0, c[2] || 0]);
  };

  Model.prototype.placement = function (ref) {
    const e = this.get(ref);
    const o = this.point(e.args[1]);
    const z = e.args[2] ? this.direction(e.args[2]) : [0, 0, 1];
    let x = e.args[3] ? this.direction(e.args[3]) : null;
    if (!x || Math.abs(dot(x, z)) > 0.999999) {
      x = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    }
    x = norm(sub(x, scale(z, dot(x, z))));
    return { o: o, z: z, x: x, y: cross(z, x) };
  };

  Model.prototype.curve = function (ref) {
    const e = this.get(ref);
    const t = e.type || (e.parts && Object.keys(e.parts).join('+')) || '?';
    switch (t) {
      case 'LINE': {
        const p = this.point(e.args[1]);
        const v = this.get(e.args[2]);
        return { type: 'line', p: p, d: this.direction(v.args[1]) };
      }
      case 'CIRCLE':
        return { type: 'circle', ax: this.placement(e.args[1]), r: e.args[2] * this.unit };
      case 'SURFACE_CURVE':
      case 'SEAM_CURVE':
      case 'BOUNDED_SURFACE_CURVE':
        return this.curve(e.args[1]);
      case 'TRIMMED_CURVE':
        return this.curve(e.args[1]);
      default:
        return { type: 'other', name: t };
    }
  };

  Model.prototype.surface = function (ref) {
    const e = this.get(ref);
    const t = e.type || (e.parts && Object.keys(e.parts).join('+')) || '?';
    switch (t) {
      case 'PLANE':
        return { type: 'plane', ax: this.placement(e.args[1]) };
      case 'CYLINDRICAL_SURFACE':
        return { type: 'cylinder', ax: this.placement(e.args[1]), r: e.args[2] * this.unit };
      case 'CONICAL_SURFACE':
        return { type: 'cone', ax: this.placement(e.args[1]), r: e.args[2] * this.unit, angle: e.args[3] };
      default:
        return { type: 'other', name: t };
    }
  };

  Model.prototype.edge = function (orientedRef) {
    const oe = this.get(orientedRef);
    if (oe.type !== 'ORIENTED_EDGE') throw new Error('STEP: ORIENTED_EDGE erwartet, gefunden ' + oe.type);
    const orient = oe.args[4] instanceof Enum ? oe.args[4].v === 'T' : true;
    const ec = this.get(oe.args[3]);
    let edge = this._cache.get(ec.id);
    if (!edge) {
      const v1 = this.point(this.get(ec.args[1]).args[1]);
      const v2 = this.point(this.get(ec.args[2]).args[1]);
      const same = ec.args[4] instanceof Enum ? ec.args[4].v === 'T' : true;
      edge = { id: ec.id, v1: v1, v2: v2, curve: this.curve(ec.args[3]), same: same };
      this._cache.set(ec.id, edge);
    }
    // Durchlaufrichtung im Loop
    return orient
      ? { id: edge.id, start: edge.v1, end: edge.v2, curve: edge.curve, forward: edge.same }
      : { id: edge.id, start: edge.v2, end: edge.v1, curve: edge.curve, forward: !edge.same };
  };

  Model.prototype.face = function (ref) {
    const e = this.get(ref);
    if (e.type !== 'ADVANCED_FACE' && e.type !== 'FACE_SURFACE') {
      throw new Error('STEP: Flächentyp ' + e.type + ' nicht unterstützt');
    }
    const bounds = [];
    for (const bRef of e.args[1]) {
      const b = this.get(bRef);
      const loop = this.get(b.args[1]);
      const orient = b.args[2] instanceof Enum ? b.args[2].v === 'T' : true;
      if (loop.type !== 'EDGE_LOOP') continue; // VERTEX_LOOP (Kegelspitze) ignorieren
      let edges = loop.args[1].map((r) => this.edge(r));
      if (!orient) {
        edges = edges.reverse().map((ed) => ({ id: ed.id, start: ed.end, end: ed.start, curve: ed.curve, forward: !ed.forward }));
      }
      bounds.push({ outer: b.type === 'FACE_OUTER_BOUND', edges: edges });
    }
    const same = e.args[3] instanceof Enum ? e.args[3].v === 'T' : true;
    return { id: e.id, surface: this.surface(e.args[2]), same: same, bounds: bounds };
  };

  Model.prototype.solids = function () {
    const out = [];
    const productNames = this.productNamesByBrep();
    for (const e of this.e.values()) {
      if (e.type !== 'MANIFOLD_SOLID_BREP' && e.type !== 'BREP_WITH_VOIDS') continue;
      const shell = this.get(e.args[1]);
      const faces = shell.args[1].map((r) => this.face(r));
      const name = (e.args[0] && String(e.args[0]).trim()) || productNames.get(e.id) || '';
      out.push({ id: e.id, name: name, faces: faces });
    }
    out.forEach((s, i) => { if (!s.name) s.name = 'Teil ' + (i + 1); });
    return out;
  };

  // Ordnet Volumenkörpern den Produktnamen zu (best effort).
  Model.prototype.productNamesByBrep = function () {
    const result = new Map();
    const repOfBrep = new Map();
    const relatedReps = new Map();
    const productOfRep = new Map();
    for (const e of this.e.values()) {
      if (e.type && /SHAPE_REPRESENTATION$/.test(e.type) && Array.isArray(e.args[1])) {
        for (const item of e.args[1]) if (item instanceof Ref) repOfBrep.set(item.id, e.id);
      }
      const rel = e.type === 'SHAPE_REPRESENTATION_RELATIONSHIP' ? e.args
        : (e.parts && e.parts.REPRESENTATION_RELATIONSHIP) || null;
      if (rel && rel[2] instanceof Ref && rel[3] instanceof Ref) {
        relatedReps.set(rel[3].id, rel[2].id);
        relatedReps.set(rel[2].id, rel[3].id);
      }
      if (e.type === 'SHAPE_DEFINITION_REPRESENTATION') {
        try {
          const pds = this.get(e.args[0]);
          const pd = this.get(pds.args[2]);
          const pdf = this.get(pd.args[2]);
          const prod = this.get(pdf.args[2]);
          productOfRep.set(e.args[1].id, prod.args[1] || prod.args[0]);
        } catch (err) { /* ignorieren */ }
      }
    }
    for (const [brep, rep] of repOfBrep) {
      const name = productOfRep.get(rep) || productOfRep.get(relatedReps.get(rep));
      if (name) result.set(brep, name);
    }
    return result;
  };

  function readStep(text) {
    const model = new Model(parseEntities(text));
    return { unit: model.unit, solids: model.solids() };
  }

  return { readStep: readStep, parseEntities: parseEntities };
});
