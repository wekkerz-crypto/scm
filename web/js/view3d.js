/*
 * 3D-Ansicht: STEP-Bauteil (Netz aus OpenCascade, occt-import-js) mit three.js,
 * dazu Rohteil, Nullpunkt und die Werkzeugbahn als Animation in 3D.
 *
 * Alles lokal (web/js/vendor), lädt erst beim ersten Umschalten auf 3D – auch offline und aus der .exe.
 * Koordinaten: Plattenkoordinaten wie im Programm (X Länge, Y Breite, Z Dicke, Ursprung vorne links unten).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.View3D = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VENDOR = ['three.min.js', 'OrbitControls.js', 'RoomEnvironment.js', 'LineSegmentsGeometry.js', 'LineGeometry.js',
    'LineMaterial.js', 'LineSegments2.js', 'Line2.js', 'occt-import-js.js', 'occt-wasm.js'];

  let loading = null;

  function vendorBase() {
    const s = document.querySelector('script[src*="view3d.js"]');
    return s ? s.src.replace(/view3d\.js.*$/, 'vendor/') : 'js/vendor/';
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error('Datei fehlt: ' + src));
      document.head.appendChild(el);
    });
  }

  // Bibliotheken und OpenCascade laden (einmal)
  function load() {
    if (!loading) {
      loading = (async () => {
        const base = vendorBase();
        for (const f of VENDOR) await loadScript(base + f); // nacheinander (hängen voneinander ab)
        if (typeof DecompressionStream === 'undefined') throw new Error('Browser zu alt für die 3D-Ansicht (DecompressionStream fehlt).');
        const gz = Uint8Array.from(atob(window.OCCT_WASM_GZ), (c) => c.charCodeAt(0));
        const wasm = new Uint8Array(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
        return window.occtimportjs({ wasmBinary: wasm });
      })();
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  const OM = typeof OcctMesh !== 'undefined' ? OcctMesh : (typeof require === 'function' ? require('./occtmesh.js') : null);
  const stepMeshes = (occt, text) => OM.read(occt, text);
  const placeMesh = (meshes, tf, panel) => OM.place(meshes, tf, panel);

  /*
   * Plattenfarben (Einstellung „Plattenfarbe“, je Bauteil änderbar): Holz mit Maserung (grain 0…1) oder Dekor einfarbig.
   * Schlüssel = id; eigene Farbe als '#rrggbb' (mit Maserung) bzw. '#rrggbb/u' (einfarbig).
   */
  const MATERIALS = [
    { id: 'eiche', name: 'Eiche hell', color: '#d4ae7b', grain: 1 },
    { id: 'buche', name: 'Buche', color: '#dcae84', grain: 0.7 },
    { id: 'ahorn', name: 'Ahorn / Birke', color: '#e8d3ad', grain: 0.55 },
    { id: 'kirsche', name: 'Kirschbaum', color: '#b8764c', grain: 0.9 },
    { id: 'nuss', name: 'Nussbaum', color: '#7b5539', grain: 1 },
    { id: 'mdf', name: 'MDF roh', color: '#a8865f', grain: 0 },
    { id: 'weiss', name: 'Weiß', color: '#eeede8', grain: 0 },
    { id: 'grau', name: 'Lichtgrau', color: '#c8cac6', grain: 0 },
    { id: 'anthrazit', name: 'Anthrazit', color: '#4a4d50', grain: 0 },
    { id: 'schwarz', name: 'Schwarz', color: '#2a2b2d', grain: 0 },
  ];
  // Schlüssel → { color, grain, name, edge, edgeName, edgeColor }; Oberfläche wie MATERIALS (unbekannt → Eiche hell),
  // Kanten (Schmalflächen) nach '|': 'span' | 'multiplex' | 'mdf' | '#rrggbb' (Kantenband) – ohne = wie Oberfläche
  const EDGES = [
    { id: 'same', name: 'Wie Oberfläche' },
    { id: 'span', name: 'Spanplatte', color: '#cbb289' },
    { id: 'multiplex', name: 'Multiplex', color: '#e2c896' },
    { id: 'mdf', name: 'MDF', color: '#a8865f' },
  ];
  function boardOf(key) {
    const parts = typeof key === 'string' ? key.split('|') : [key];
    const sk = parts[0];
    let surf;
    if (typeof sk === 'string' && /^#[0-9a-f]{6}(\/u)?$/i.test(sk)) surf = { id: sk, color: sk.slice(0, 7).toLowerCase(), grain: /\/u$/i.test(sk) ? 0 : 1, name: 'Eigene Farbe' };
    else surf = MATERIALS.find((m) => m.id === sk) || MATERIALS[0];
    const ek = parts[1] && (EDGES.some((e) => e.id === parts[1]) || /^#[0-9a-f]{6}$/i.test(parts[1])) ? parts[1] : 'same';
    const e = EDGES.find((x) => x.id === ek);
    return { id: surf.id, color: surf.color, grain: surf.grain, name: surf.name, edge: ek,
      edgeName: e ? e.name : 'Kantenband', edgeColor: ek === 'same' ? surf.color : e ? e.color : ek.toLowerCase() };
  }
  // Schlüssel zusammensetzen (Oberfläche + Kanten)
  const boardKey = (surface, edge) => surface + (edge && edge !== 'same' ? '|' + edge : '');

  // Holzmaserung als Textur (Fasern in X); grain 0 = einfarbig (Dekor), 1 = volle Maserung
  function woodCanvas(base, grain) {
    if (grain === undefined) grain = 1;
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 512;
    const c = cv.getContext('2d');
    c.fillStyle = base;
    c.fillRect(0, 0, cv.width, cv.height);
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < (grain > 0 ? 150 : 0); i++) {
      const y0 = rnd() * cv.height;
      const amp = 1 + rnd() * 5;
      const freq = 0.003 + rnd() * 0.008;
      const dark = rnd() < 0.62;
      c.strokeStyle = dark ? 'rgba(110,62,18,' + ((0.1 + rnd() * 0.2) * grain).toFixed(3) + ')' : 'rgba(255,246,228,' + ((0.06 + rnd() * 0.1) * grain).toFixed(3) + ')';
      c.lineWidth = 0.6 + rnd() * 2.2;
      c.beginPath();
      for (let x = 0; x <= cv.width; x += 4) {
        const y = y0 + Math.sin(x * freq + i) * amp + Math.sin(x * freq * 3.3) * amp * 0.35;
        if (x) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
    }
    return cv;
  }

  // Schmalflächen-Texturen: Spanplatte (Späne), Multiplex (Furnierlagen quer zur Dicke), MDF (fein), Kantenband (einfarbig)
  function edgeCanvas(kind, base) {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 512;
    const c = cv.getContext('2d');
    c.fillStyle = base;
    c.fillRect(0, 0, 512, 512);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    if (kind === 'span') {
      for (let i = 0; i < 9000; i++) {
        const l = rnd();
        c.fillStyle = l < 0.45 ? 'rgba(92,64,30,' + (0.15 + rnd() * 0.35).toFixed(2) + ')' : 'rgba(255,240,205,' + (0.15 + rnd() * 0.35).toFixed(2) + ')';
        const w = 1 + rnd() * (rnd() < 0.15 ? 9 : 4);
        c.fillRect(rnd() * 512, rnd() * 512, w, 1 + rnd() * 3);
      }
    } else if (kind === 'mdf') {
      for (let i = 0; i < 6000; i++) {
        c.fillStyle = rnd() < 0.5 ? 'rgba(70,45,20,0.12)' : 'rgba(255,235,200,0.12)';
        c.fillRect(rnd() * 512, rnd() * 512, 1.5, 1.5);
      }
    } else if (kind === 'multiplex') {
      // 13 Lagen über die Texturhöhe (= 19,5 mm), abwechselnd heller/dunkler, Leimfugen dunkel
      const n = 13;
      const h = 512 / n;
      for (let k = 0; k < n; k++) {
        c.fillStyle = k % 2 ? '#d6b783' : '#ead2a4';
        c.fillRect(0, k * h, 512, h);
        for (let i = 0; i < 18; i++) {
          c.fillStyle = 'rgba(120,80,35,' + (0.05 + rnd() * 0.12).toFixed(2) + ')';
          c.fillRect(0, k * h + rnd() * h, 512, 0.6 + rnd());
        }
        c.fillStyle = 'rgba(80,52,22,0.55)';
        c.fillRect(0, k * h, 512, 1.4);
      }
    }
    return cv;
  }

  /*
   * Lage der Platte im Netz: Dickenrichtung t = Normale der größten Fläche (nach Fläche gewichtet), in der Plattenebene
   * die lange Seite L und die kurze S. Damit läuft die Maserung immer längs der langen Seite (auch bei schrägen Teilen).
   */
  function boardFrame(g) {
    const pos = g.getAttribute('position').array;
    const idx = g.index ? g.index.array : null;
    const nTri = idx ? idx.length / 3 : pos.length / 9;
    const vi = (t, k) => (idx ? idx[t * 3 + k] : t * 3 + k) * 3;
    const buckets = new Map();
    for (let t = 0; t < nTri; t++) {
      const a = vi(t, 0);
      const b = vi(t, 1);
      const c = vi(t, 2);
      const ux = pos[b] - pos[a]; const uy = pos[b + 1] - pos[a + 1]; const uz = pos[b + 2] - pos[a + 2];
      const wx = pos[c] - pos[a]; const wy = pos[c + 1] - pos[a + 1]; const wz = pos[c + 2] - pos[a + 2];
      let nx = uy * wz - uz * wy; let ny = uz * wx - ux * wz; let nz = ux * wy - uy * wx;
      const A = Math.hypot(nx, ny, nz);
      if (A < 1e-9) continue;
      nx /= A; ny /= A; nz /= A;
      // Richtung ohne Vorzeichen (größte Komponente positiv)
      const m = Math.abs(nx) >= Math.abs(ny) && Math.abs(nx) >= Math.abs(nz) ? nx : Math.abs(ny) >= Math.abs(nz) ? ny : nz;
      if (m < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const k = Math.round(nx * 20) + ',' + Math.round(ny * 20) + ',' + Math.round(nz * 20);
      const e = buckets.get(k) || { a: 0, x: 0, y: 0, z: 0 };
      e.a += A; e.x += nx * A; e.y += ny * A; e.z += nz * A;
      buckets.set(k, e);
    }
    let best = null;
    for (const e of buckets.values()) if (!best || e.a > best.a) best = e;
    let t = best ? [best.x, best.y, best.z] : [0, 0, 1];
    const tl = Math.hypot(t[0], t[1], t[2]) || 1;
    t = t.map((v) => v / tl);
    // Achse der Plattenebene: die Modellachse mit der längsten Projektion, dann die Senkrechte dazu
    let e1 = null;
    for (const ax of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      const d = ax[0] * t[0] + ax[1] * t[1] + ax[2] * t[2];
      const p = [ax[0] - d * t[0], ax[1] - d * t[1], ax[2] - d * t[2]];
      const l = Math.hypot(p[0], p[1], p[2]);
      if (!e1 || l > e1.l + 1e-6) e1 = { v: p.map((x) => x / l), l: l };
    }
    const a1 = e1.v;
    const a2 = [t[1] * a1[2] - t[2] * a1[1], t[2] * a1[0] - t[0] * a1[2], t[0] * a1[1] - t[1] * a1[0]];
    const ext = (ax) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < pos.length; i += 3) { const d = pos[i] * ax[0] + pos[i + 1] * ax[1] + pos[i + 2] * ax[2]; if (d < lo) lo = d; if (d > hi) hi = d; }
      return [lo, hi];
    };
    const r1 = ext(a1);
    const r2 = ext(a2);
    const rt = ext(t);
    const long1 = r1[1] - r1[0] >= r2[1] - r2[0];
    return { t: t, L: long1 ? a1 : a2, S: long1 ? a2 : a1, t0: rt[0] };
  }

  /*
   * UV und Gruppen: Gruppe 0 = Deck-/Unterseite (Normale ∥ Dicke), Gruppe 1 = Schmalflächen. Faser (Textur-X) längs der
   * langen Seite; auf Schmalflächen quer dazu die Dicke (Multiplex: 1 Texturhöhe = 19,5 mm ab Unterseite).
   */
  function boardUV(T, g, edgeKind) {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.index) { const n = g.getAttribute('position').count; const ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new T.BufferAttribute(ix, 1)); }
    const F = g.userData.boardFrame || (g.userData.boardFrame = boardFrame(g));
    const pos = g.getAttribute('position').array;
    const nrm = g.getAttribute('normal').array;
    const S = 1 / 700;
    const ev = edgeKind === 'multiplex' ? 1 / 19.5 : edgeKind === 'span' || edgeKind === 'mdf' ? 1 / 60 : S * 2;
    const eu = edgeKind === 'span' || edgeKind === 'mdf' ? 1 / 60 : S;
    const dot = (i, a) => pos[i] * a[0] + pos[i + 1] * a[1] + pos[i + 2] * a[2];
    const nd = (i, a) => nrm[i] * a[0] + nrm[i + 1] * a[1] + nrm[i + 2] * a[2];
    const n = pos.length / 3;
    const uv = new Float32Array(n * 2);
    const face = new Uint8Array(n);
    for (let v = 0; v < n; v++) {
      const i = v * 3;
      if (Math.abs(nd(i, F.t)) > 0.9) { face[v] = 1; uv[v * 2] = dot(i, F.L) * S; uv[v * 2 + 1] = dot(i, F.S) * S * 2; continue; }
      // Schmalfläche: Faser längs L, an der Stirnseite (Normale ∥ L) längs S
      const along = Math.abs(nd(i, F.L)) > 0.7 ? F.S : F.L;
      uv[v * 2] = dot(i, along) * eu;
      uv[v * 2 + 1] = (dot(i, F.t) - F.t0) * ev;
    }
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    // Dreiecke sortieren: erst Flächen, dann Schmalflächen
    const idx = g.index.array;
    const a = [];
    const b = [];
    for (let k = 0; k < idx.length; k += 3) {
      const f = face[idx[k]] + face[idx[k + 1]] + face[idx[k + 2]];
      (f >= 2 ? a : b).push(idx[k], idx[k + 1], idx[k + 2]);
    }
    g.setIndex(new T.BufferAttribute(new Uint32Array(a.concat(b)), 1));
    g.clearGroups();
    g.addGroup(0, a.length, 0);
    g.addGroup(a.length, b.length, 1);
  }

  const texCache = new Map();
  function cachedTex(T, key, make) {
    let tex = texCache.get(key);
    if (!tex) {
      tex = new T.CanvasTexture(make());
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      tex.encoding = T.sRGBEncoding;
      tex.anisotropy = 8;
      texCache.set(key, tex);
    }
    return tex;
  }
  const matOpts = { metalness: 0, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };

  // Holz-Material (Maserung als Textur) – gleich für die Teil-Ansicht und Möbel 3D
  function woodMaterial(T, g, base, grain) {
    if (grain === undefined) grain = 1;
    if (g) boardUV(T, g, 'same');
    return new T.MeshStandardMaterial(Object.assign({ map: cachedTex(T, 'w' + base + '/' + grain, () => woodCanvas(base, grain)),
      roughness: grain > 0 ? 0.58 : 0.5 }, matOpts));
  }

  /*
   * Materialien einer Platte aus dem Schlüssel (boardOf): [Oberfläche, Schmalflächen]; setzt UV und Gruppen am Netz.
   * color = Oberflächenfarbe (für leichte Helligkeitsunterschiede je Bauteil schon abgewandelt), sonst aus dem Schlüssel.
   */
  function boardMaterials(T, g, key, color) {
    const bd = boardOf(key);
    const base = color || bd.color;
    boardUV(T, g, bd.edge);
    const surf = woodMaterial(T, null, base, bd.grain);
    if (bd.edge === 'same') return [surf, surf];
    const kind = /^#/.test(bd.edge) ? 'band' : bd.edge;
    const edge = new T.MeshStandardMaterial(Object.assign({ map: cachedTex(T, 'e' + kind + bd.edgeColor, () => edgeCanvas(kind, bd.edgeColor)),
      roughness: kind === 'band' ? 0.45 : 0.85 }, matOpts));
    return [surf, edge];
  }

  // Spannuten-Streifen für drehende Werkzeuge
  function fluteCanvas() {
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 128;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, '#8d969f'); g.addColorStop(0.5, '#eef1f4'); g.addColorStop(1, '#8d969f');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    c.strokeStyle = 'rgba(30,35,40,0.55)';
    c.lineWidth = 10;
    for (let k = -2; k < 4; k++) { c.beginPath(); c.moveTo(k * 64, 128); c.lineTo(k * 64 + 128, 0); c.stroke(); }
    return cv;
  }

  function Viewer(container) {
    const THREE = window.THREE;
    this.THREE = THREE;
    this.el = container;
    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.92;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 100000);
    this.camera.up.set(0, 0, 1);
    this.controls = new THREE.OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x887766, 0.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.groups = {};
    for (const g of ['part', 'raw', 'trails', 'tool', 'ground', 'fixture', 'suppressed']) { this.groups[g] = new THREE.Group(); this.scene.add(this.groups[g]); }
    this.fluteTex = new THREE.CanvasTexture(fluteCanvas());
    this.fluteTex.wrapS = this.fluteTex.wrapT = THREE.RepeatWrapping;
    this.fluteTex.encoding = THREE.sRGBEncoding;
    this.toolCache = new Map();
    this.trailObjs = [];
    this.lineMats = [];
    this.showRaw = true;
    this.dark = false;
    this.lastKey = null;
    this._raf = 0;
    this._alive = true;
    const loop = () => {
      if (!this._alive) return;
      this._raf = requestAnimationFrame(loop);
      this.resize();
      this.controls.update();
      if (this.onFrame) this.onFrame();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  Viewer.prototype.resize = function () {
    const w = Math.max(1, this.el.clientWidth);
    const h = Math.max(1, this.el.clientHeight);
    if (this._w === w && this._h === h) return;
    this._w = w;
    this._h = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const m of this.lineMats) m.resolution.set(w, h);
  };

  Viewer.prototype.lineMat = function (opts) {
    const m = new this.THREE.LineMaterial(opts);
    m.resolution.set(this._w || 800, this._h || 600);
    this.lineMats.push(m);
    return m;
  };

  Viewer.prototype.clear = function (name) {
    const g = this.groups[name];
    while (g.children.length) {
      const o = g.children.pop();
      o.traverse((x) => {
        if (x.geometry) x.geometry.dispose();
        for (const m of x.material ? [].concat(x.material) : []) {
          if (m.keep) continue;
          const i = this.lineMats.indexOf(m);
          if (i >= 0) this.lineMats.splice(i, 1);
          m.dispose();
        }
      });
    }
  };

  Viewer.prototype.setTheme = function (dark, colors) {
    const changed = this.dark !== dark;
    this.dark = dark;
    if (changed && this.opts) { this.setPart(this.opts); } // Tisch/Raster in den neuen Farben
    const T = this.THREE;
    this.scene.background = new T.Color(dark ? 0x141a19 : 0xe6e9e3);
    this.colors = colors || this.colors;
    if (this.edgeMat) this.edgeMat.color.set(dark ? 0x1a120a : 0x4a3520);
  };

  // Teil anzeigen. opts: { meshes, panel, tf, moves, colors (Token → Farbe), opColor(op), raw (Aufmaß), board }
  Viewer.prototype.setPart = function (opts) {
    const T = this.THREE;
    const p = opts.panel;
    this.panel = p;
    this.opts = opts;
    this.clear('part');
    this.clear('raw');
    this.clear('ground');
    this.clear('fixture');
    this.clear('suppressed');
    this.clearTrails();
    // gelöschte (unterdrückte) Bearbeitungen: rot dort, wo sie wären – breites, durchscheinendes Band und gestrichelte Mittellinie
    for (const m of opts.suppressed || []) {
      if (m.type === 'rapid' || !m.pts3 || m.pts3.length < 2) continue;
      const flat = [];
      for (const q of m.pts3) flat.push(q[0], q[1], Math.max(q[2], 0) + 0.4);
      const width = m.disc ? Math.max(1.5, m.disc.thick) : Math.max(1, (m.d || 4) * 0.92);
      const red = new T.Color(opts.suppressedColor || '#d0453a');
      const band = new T.LineGeometry();
      band.setPositions(flat);
      const wide = new T.Line2(band, this.lineMat({ color: red, linewidth: width, worldUnits: true, transparent: true, opacity: 0.45, depthWrite: false }));
      wide.renderOrder = 3;
      const mid = new T.LineGeometry();
      mid.setPositions(flat);
      const dash = new T.Line2(mid, this.lineMat({ color: red, linewidth: 2.2, dashed: true, dashSize: 6, gapSize: 4, transparent: true, opacity: 0.95, depthWrite: false }));
      dash.computeLineDistances();
      dash.renderOrder = 4;
      this.groups.suppressed.add(wide, dash);
    }
    // Haltestege: Klötzchen quer über der Fräsbahn, vom Boden bis zur Steghöhe (dort bleibt Material stehen)
    if (opts.tabs && opts.tabs.length) {
      const mat = new T.MeshBasicMaterial({ color: new T.Color(opts.tabColor || '#c25a00') }); // unbeleuchtet: Farbe bleibt kräftig
      for (const t of opts.tabs) {
        const box = new T.Mesh(new T.BoxGeometry(t.len, t.w, t.h), mat);
        box.position.set(t.c[0], t.c[1], t.h / 2);
        box.rotation.z = Math.atan2(t.t[1], t.t[0]);
        box.castShadow = true;
        this.groups.suppressed.add(box);
      }
    }
    // Sauger (Vorschlag) unter der Platte, darunter die Konsolen; der Tisch liegt unter den Konsolen
    const CUP_H = 75;
    const BAR_H = 45;
    let floorZ = -0.2;
    if (opts.suction && opts.suction.bars && opts.suction.bars.length) {
      floorZ = -(CUP_H + BAR_H) - 0.2;
      const rubber = new T.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.85, metalness: 0.05 });
      const body = new T.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.45, metalness: 0.6 });
      const barMat = new T.MeshStandardMaterial({ color: 0x5d666f, roughness: 0.5, metalness: 0.55 });
      for (const b of opts.suction.bars) {
        const bar = new T.Mesh(new T.BoxGeometry(90, p.W + 400, BAR_H), barMat);
        bar.position.set(b.x, p.W / 2, -CUP_H - BAR_H / 2);
        bar.castShadow = bar.receiveShadow = true;
        this.groups.fixture.add(bar);
        for (const c of b.cups) {
          // Drehachse bei (b.x, c.y); exzentrisch: rundes Gehäuse, Saugfläche um e versetzt (bei 0° in +Y)
          const g = new T.Group();
          const e = c.e || 0;
          let cup;
          if (e > 0) {
            cup = new T.Mesh(new T.CylinderGeometry((c.h || c.sx) / 2, (c.h || c.sx) / 2, CUP_H - 8, 48), body);
            cup.rotation.x = Math.PI / 2;
          } else cup = new T.Mesh(new T.BoxGeometry(c.sx, c.sy, CUP_H - 8), body);
          cup.position.z = -(CUP_H - 8) / 2 - 8;
          const pad = new T.Mesh(new T.BoxGeometry(c.sx - 4, c.sy - 4, 8), rubber);
          pad.position.set(0, e, -4);
          g.add(cup, pad);
          g.position.set(b.x, c.y, -0.3);
          g.rotation.z = ((c.rot !== undefined ? c.rot : c.angle) * Math.PI) / 180;
          g.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = true; } });
          this.groups.fixture.add(g);
        }
      }
    }
    this.floorZ = floorZ;
    const placed = placeMesh(opts.meshes, opts.tf, p);
    if (placed) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(placed.pos, 3));
      if (placed.normals) g.setAttribute('normal', new T.BufferAttribute(placed.normals, 3));
      g.setIndex(new T.BufferAttribute(new Uint32Array(placed.index), 1));
      if (!placed.normals) g.computeVertexNormals();
      const mat = boardMaterials(T, g, opts.board);
      const mesh = new T.Mesh(g, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.groups.part.add(mesh);
      // Körperkanten (CAD-Optik)
      const eg = new T.LineSegmentsGeometry().fromEdgesGeometry(new T.EdgesGeometry(g, 24));
      this.edgeMat = this.lineMat({ color: this.dark ? 0x1a120a : 0x4a3520, linewidth: 1.3, transparent: true, opacity: 0.75 });
      this.groups.part.add(new T.LineSegments2(eg, this.edgeMat));
    }
    // Rohteil als Umriss, Nullpunkt mit Achsen
    const o = opts.raw || 0;
    const box = new T.BoxGeometry(p.L + 2 * o, p.W + 2 * o, p.T);
    box.translate(p.L / 2, p.W / 2, p.T / 2);
    const rawLines = new T.LineSegments(new T.EdgesGeometry(box), new T.LineDashedMaterial({ color: 0x8a9590, dashSize: 6, gapSize: 4, transparent: true, opacity: 0.8 }));
    rawLines.computeLineDistances();
    this.groups.raw.add(rawLines);
    this.groups.raw.visible = this.showRaw;
    const axLen = Math.max(40, Math.min(p.L, p.W) * 0.18);
    const axes = [[1, 0, 0, 0xd94a3a], [0, 1, 0, 0x2e9a52], [0, 0, 1, 0x2a78d6]];
    for (const [x, y, z, c] of axes) {
      const arrow = new T.ArrowHelper(new T.Vector3(x, y, z), new T.Vector3(0, 0, 0), axLen, c, axLen * 0.22, axLen * 0.12);
      this.groups.raw.add(arrow);
    }
    const zero = new T.Mesh(new T.SphereGeometry(Math.max(3, axLen * 0.07), 24, 16), new T.MeshStandardMaterial({ color: 0xd94a3a, roughness: 0.4 }));
    this.groups.raw.add(zero);
    // Maschinentisch: Schattenfänger und dezentes Raster
    const size = Math.max(p.L, p.W) * 3 + 600;
    const shadow = new T.Mesh(new T.PlaneGeometry(size, size), new T.ShadowMaterial({ opacity: this.dark ? 0.45 : 0.22 }));
    shadow.position.set(p.L / 2, p.W / 2, floorZ);
    shadow.receiveShadow = true;
    this.groups.ground.add(shadow);
    const grid = new T.GridHelper(size, Math.round(size / 100), this.dark ? 0x2c3633 : 0xc4cbc4, this.dark ? 0x222a28 : 0xd5dbd4);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(p.L / 2, p.W / 2, floorZ - 0.2);
    grid.material.transparent = true;
    grid.material.opacity = this.dark ? 0.35 : 0.7;
    this.groups.ground.add(grid);
    // Licht passend zur Teilgröße
    const R = Math.hypot(p.L, p.W, p.T);
    this.sun.position.set(p.L / 2 - R * 0.6, p.W / 2 - R * 0.9, R * 1.4);
    this.sun.target.position.set(p.L / 2, p.W / 2, 0);
    const sc = this.sun.shadow.camera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = R * 5;
    sc.updateProjectionMatrix();
    const key = p.L + 'x' + p.W + 'x' + p.T;
    if (this.lastKey !== key) { this.lastKey = key; this.view('iso'); }
  };

  Viewer.prototype.view = function (which) {
    const p = this.panel;
    if (!p) return;
    const c = new this.THREE.Vector3(p.L / 2, p.W / 2, p.T / 2);
    const R = Math.hypot(p.L, p.W, p.T) / 2;
    const dist = R / Math.sin((this.camera.fov * Math.PI) / 360);
    let dir;
    if (which === 'top') dir = new this.THREE.Vector3(0, -0.001, 1);
    else if (which === 'front') dir = new this.THREE.Vector3(0, -1, 0.18);
    else dir = new this.THREE.Vector3(-0.55, -1, 0.75);
    dir.normalize();
    // Abstand so wählen, dass alle Ecken des Rohteils ins Bild passen (90 % der Fläche)
    const o = (this.opts && this.opts.raw) || 0;
    const corners = [];
    for (const x of [-o, p.L + o]) for (const y of [-o, p.W + o]) for (const z of [0, p.T]) corners.push(new this.THREE.Vector3(x, y, z));
    let d = dist;
    for (let k = 0; k < 6; k++) {
      this.camera.position.copy(c).addScaledVector(dir, d);
      this.camera.lookAt(c);
      this.camera.updateMatrixWorld();
      let mx = 0;
      for (const q of corners) { const v = q.clone().project(this.camera); mx = Math.max(mx, Math.abs(v.x), Math.abs(v.y)); }
      d *= mx / 0.86;
    }
    this.camera.position.copy(c).addScaledVector(dir, d);
    this.controls.target.copy(c);
    this.camera.near = Math.max(0.5, d / 200);
    this.camera.far = d * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  };

  Viewer.prototype.setRaw = function (on) { this.showRaw = on; this.groups.raw.visible = on; };

  Viewer.prototype.clearTrails = function () {
    this.clear('trails');
    this.trailObjs = [];
    this.live = null;
    this.trailUpTo = 0;
  };

  function along(pts, f) {
    if (pts.length === 1) return { at: pts[0], part: [pts[0]], dir: null };
    let total = 0;
    const seg = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); seg.push(l); total += l; }
    let rest = total * Math.max(0, Math.min(1, f));
    const part = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dir = seg[i - 1] > 1e-9 ? [(b[0] - a[0]) / seg[i - 1], (b[1] - a[1]) / seg[i - 1], (b[2] - a[2]) / seg[i - 1]] : null;
      if (rest <= seg[i - 1] || i === pts.length - 1) {
        const k = seg[i - 1] > 1e-9 ? Math.min(1, rest / seg[i - 1]) : 1;
        const at = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
        part.push(at);
        return { at: at, part: part, dir: dir, i: i, k: k };
      }
      rest -= seg[i - 1];
      part.push(b);
    }
    return { at: pts[pts.length - 1], part: part, dir: null };
  }

  // Bahnspur einer Bewegung (Breite = Werkzeug, Farbe = Bearbeitungsart)
  Viewer.prototype.trail = function (m, pts) {
    const T = this.THREE;
    if (pts.length < 2) return null;
    const flat = [];
    for (const q of pts) flat.push(q[0], q[1], Math.max(q[2], 0) + 0.3); // unter dem Teil (Durchfräsen) an der Unterseite zeigen
    const g = new T.LineGeometry();
    g.setPositions(flat);
    const width = m.disc ? Math.max(1.5, m.disc.thick) : Math.max(1, (m.d || 4) * 0.92);
    const mat = this.lineMat({ color: new T.Color(this.opts.colorOf(m)), linewidth: width, worldUnits: true, transparent: true, opacity: 0.6, depthWrite: false });
    const line = new T.Line2(g, mat);
    line.computeLineDistances();
    line.renderOrder = 2;
    this.groups.trails.add(line);
    return line;
  };

  // Werkzeugmodell (Fräser, Bohrer) entlang +Z ab der Spitze
  Viewer.prototype.toolModel = function (d, len, drill, ball) {
    const T = this.THREE;
    const key = d.toFixed(2) + '|' + len.toFixed(1) + '|' + drill + '|' + !!ball;
    if (this.toolCache.has(key)) return this.toolCache.get(key);
    const r = Math.max(0.6, d / 2);
    const grp = new T.Group();
    const spin = new T.Group();
    grp.add(spin);
    const steel = new T.MeshStandardMaterial({ map: this.fluteTex, metalness: 0.85, roughness: 0.28 });
    steel.keep = true;
    const cyl = ball ? Math.max(1, len - r) : len; // Kugelfräser: Halbkugel an der Spitze
    const cutter = new T.Mesh(new T.CylinderGeometry(r, r, cyl, 40, 1), steel);
    cutter.rotation.x = Math.PI / 2;
    cutter.position.z = cyl / 2 + (drill ? r * 0.6 : 0) + (ball ? r : 0);
    spin.add(cutter);
    if (ball) {
      const tip = new T.Mesh(new T.SphereGeometry(r, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), steel);
      tip.rotation.x = Math.PI / 2;
      tip.position.z = r;
      spin.add(tip);
    }
    if (drill) {
      const tip = new T.Mesh(new T.ConeGeometry(r, r * 0.6 * 2, 40), steel);
      tip.rotation.x = -Math.PI / 2;
      tip.position.z = r * 0.6;
      spin.add(tip);
    }
    const base = len + (drill ? r * 0.6 : 0);
    const shankR = Math.max(r * 0.8, 3);
    const dark = new T.MeshStandardMaterial({ color: 0x3a4148, metalness: 0.7, roughness: 0.35 });
    dark.keep = true;
    const shank = new T.Mesh(new T.CylinderGeometry(shankR, shankR, 25, 32), new T.MeshStandardMaterial({ color: 0xc9cfd5, metalness: 0.9, roughness: 0.25 }));
    shank.rotation.x = Math.PI / 2;
    shank.position.z = base + 12.5;
    grp.add(shank);
    const nut = new T.Mesh(new T.CylinderGeometry(shankR * 2.2, shankR * 1.6, 22, 40), dark);
    nut.rotation.x = Math.PI / 2;
    nut.position.z = base + 25 + 11;
    grp.add(nut);
    const spindle = new T.Mesh(new T.CylinderGeometry(shankR * 3.2, shankR * 3.2, 70, 48), new T.MeshStandardMaterial({ color: 0x2b3137, metalness: 0.5, roughness: 0.45 }));
    spindle.rotation.x = Math.PI / 2;
    spindle.position.z = base + 47 + 35;
    grp.add(spindle);
    const ring = new T.Mesh(new T.TorusGeometry(r + 1.2, Math.max(0.5, r * 0.08), 10, 48), new T.MeshBasicMaterial({ color: 0xffffff }));
    grp.add(ring);
    grp.traverse((x) => { if (x.isMesh) x.castShadow = true; });
    const tool = { grp: grp, spin: spin, ring: ring };
    this.toolCache.set(key, tool);
    return tool;
  };

  // Sägeblatt: Scheibe in der Ebene (Fahrtrichtung, up)
  Viewer.prototype.discModel = function (D, thick) {
    const T = this.THREE;
    const key = 'disc|' + D + '|' + thick;
    if (this.toolCache.has(key)) return this.toolCache.get(key);
    const R = D / 2;
    const grp = new T.Group();
    const spin = new T.Group();
    grp.add(spin);
    const blade = new T.Mesh(new T.CylinderGeometry(R, R, thick, 96), new T.MeshStandardMaterial({ map: this.fluteTex, metalness: 0.9, roughness: 0.22, transparent: true, opacity: 0.92 }));
    blade.rotation.x = Math.PI / 2;
    spin.add(blade);
    const hub = new T.Mesh(new T.CylinderGeometry(R * 0.22, R * 0.22, thick * 3, 48), new T.MeshStandardMaterial({ color: 0x2b3137, metalness: 0.6, roughness: 0.4 }));
    hub.rotation.x = Math.PI / 2;
    grp.add(hub);
    const ring = new T.Mesh(new T.TorusGeometry(R + 1.5, Math.max(0.8, thick * 0.4), 10, 96), new T.MeshBasicMaterial({ color: 0xffffff }));
    grp.add(ring);
    grp.traverse((x) => { if (x.isMesh) x.castShadow = true; });
    const tool = { grp: grp, spin: spin, ring: ring, disc: true };
    this.toolCache.set(key, tool);
    return tool;
  };

  // Zustand der Animation zeigen: Spuren bis Bewegung i, Werkzeug an Bruchteil f der Bewegung i
  Viewer.prototype.setTime = function (moves, i, f, active, spinAngle, toolInfo) {
    const T = this.THREE;
    if (!active) {
      if (this.trailObjs.length) this.clearTrails();
      this.groups.tool.visible = false;
      return;
    }
    const done = i < 0 ? moves.length : i;
    if (done < this.trailUpTo) this.clearTrails();
    for (let k = this.trailUpTo; k < done; k++) {
      const m = moves[k];
      if (m.type !== 'rapid' && m.pts3) this.trailObjs.push(this.trail(m, m.pts3));
    }
    this.trailUpTo = Math.max(this.trailUpTo, done);
    if (this.live) { this.groups.trails.remove(this.live); this.live.geometry.dispose(); this.live.material.dispose(); this.live = null; }
    this.groups.tool.visible = false;
    if (i < 0 || i >= moves.length) return;
    const m = moves[i];
    if (!m.pts3) return;
    const pos = along(m.pts3, f);
    if (m.type !== 'rapid' && pos.part.length > 1) this.live = this.trail(m, pos.part);
    // Werkzeug
    while (this.groups.tool.children.length) this.groups.tool.remove(this.groups.tool.children[0]);
    let ax3 = m.ax3 || [0, 0, 1];
    if (m.ax3s && pos.i !== undefined && m.ax3s[pos.i]) {
      // Achse je Punkt: zwischen den Punkten überblenden
      const a = m.ax3s[pos.i - 1];
      const b = m.ax3s[pos.i];
      ax3 = [a[0] + (b[0] - a[0]) * pos.k, a[1] + (b[1] - a[1]) * pos.k, a[2] + (b[2] - a[2]) * pos.k];
    } else if (m.ax3s && m.type !== 'rapid') ax3 = m.ax3s[0];
    const ax = new T.Vector3(...ax3).normalize();
    const color = m.type === 'rapid' ? 0x9aa5a0 : this.opts.colorOf(m);
    if (m.disc) {
      const tool = this.discModel(m.disc.d, m.disc.thick);
      const up = new T.Vector3(...m.disc.up).normalize();
      let dir = pos.dir ? new T.Vector3(...pos.dir) : new T.Vector3(1, 0, 0);
      dir.addScaledVector(up, -dir.dot(up));
      if (dir.lengthSq() < 1e-9) dir = new T.Vector3(1, 0, 0);
      dir.normalize();
      const n = new T.Vector3().crossVectors(dir, up).normalize();
      tool.grp.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), n);
      const at = new T.Vector3(...pos.at);
      tool.grp.position.copy(at).addScaledVector(up, m.disc.d / 2 - (m.type === 'rapid' ? -10 : m.disc.reach));
      tool.spin.rotation.z = -spinAngle;
      tool.ring.material.color.set(color);
      this.groups.tool.add(tool.grp);
    } else {
      const info = (toolInfo && toolInfo[m.tool]) || {};
      const d = info.d || m.d || 8;
      const len = m.len3 || Math.max(12, Math.min(info.len || 30, (m.z || 10) + 12));
      const drill = m.kind === 'drill' || /^Bohr/.test(m.tool || '') || (this.opts.isDrill && this.opts.isDrill(m));
      const tool = this.toolModel(d, len, drill, !!m.ball);
      tool.grp.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), ax);
      tool.grp.position.set(...pos.at);
      tool.spin.rotation.z = spinAngle;
      tool.ring.material.color.set(color);
      this.groups.tool.add(tool.grp);
    }
    this.groups.tool.visible = true;
  };

  Viewer.prototype.dispose = function () {
    this._alive = false;
    cancelAnimationFrame(this._raf);
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
  };

  return { load: load, stepMeshes: stepMeshes, Viewer: Viewer, placeMesh: placeMesh, woodMaterial: woodMaterial,
    MATERIALS: MATERIALS, EDGES: EDGES, boardOf: boardOf, boardKey: boardKey, boardMaterials: boardMaterials, boardFrame: boardFrame };
});
