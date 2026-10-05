/*
 * Möbel-3D: alle Bauteile einer STEP-Baugruppe zusammengebaut (Modellkoordinaten, Z oben) – drehen, verschieben,
 * zoomen, Bauteile ein-/ausblenden, Transparenz, Explosionsansicht, Nummern am Bauteil, Bauteil anklicken, Messen und
 * Bemaßen (Maße bleiben stehen) mit Fang (Endpunkt, Kantenmitte, Kreismitte, Kante, Fläche). three.js und OrbitControls kommen aus View3D.load().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Model3D = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Helligkeit je Bauteil leicht verschieden, damit Nachbarteile gleicher Farbe unterscheidbar sind
  const SHADE = [1, 0.95, 1.03, 0.93, 1.01, 0.97];

  // Materialien eines Netzes immer als Liste (Oberfläche und Schmalflächen können verschieden sein)
  const mats = (o) => [...new Set([].concat(o.material))];

  // Material eines Bauteils aus der Plattenfarbe (Schlüssel wie View3D.boardOf) – Holz wie in der Teil-Ansicht
  function boardLook(T, g, board, i) {
    const bd = window.View3D && View3D.boardOf ? View3D.boardOf(board) : { color: '#d4ae7b', grain: 1 };
    const c = new T.Color(bd.color);
    const hsl = {};
    c.getHSL(hsl);
    c.setHSL(hsl.h, hsl.s, Math.min(0.97, hsl.l * SHADE[i % SHADE.length]));
    const hex = '#' + c.getHexString();
    // [Oberfläche, Schmalflächen] – Maserung längs der langen Seite, Kanten je nach Einstellung (Spanplatte, Multiplex …)
    const mat = window.View3D && View3D.boardMaterials ? View3D.boardMaterials(T, g, board, hex)
      : [new T.MeshStandardMaterial({ color: hex, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })];
    for (const m of mat) m.side = T.DoubleSide;
    // Kanten: deutlich dunkler als die Platte (auf Weiß grau, auf Nussbaum fast schwarz)
    const edge = new T.Color(bd.color).multiplyScalar(hsl.l > 0.5 ? 0.42 : 0.3);
    return { mat: mat, edge: edge };
  }

  function Viewer(host, labels) {
    const THREE = window.THREE;
    this.THREE = THREE;
    this.host = host;
    this.labelEl = labels;
    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.92;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(r.domElement);
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 200000);
    this.camera.up.set(0, 0, 1);
    this.controls = new THREE.OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    // Licht, Schatten und Tisch wie in der Teil-Ansicht (view3d.js)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x887766, 0.35));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.ground = new THREE.Group();
    this.scene.add(this.ground);
    this.scene.add(this.sun.target);
    this.root = new THREE.Group();
    this.measureGroup = new THREE.Group();
    this.scene.add(this.root, this.measureGroup);
    this.parts = [];
    this.opacity = 1;
    this.showLabels = true;
    this.selected = null;
    this.measuring = false;
    this.mode = null; // 'measure' = Messen (vorübergehend), 'dim' = Bemaßen (bleibt stehen)
    this.measurePts = [];
    this.dims = [];
    this.dimAxis = 'aligned';
    this.dimLabels = [];
    this.onDims = null;
    this.onPick = null;
    this.onMeasure = null;
    this.raycaster = new THREE.Raycaster();
    this.explode = 0;
    this.hover = null;
    this._alive = true;
    // Fang-Markierung unter dem Mauszeiger beim Messen (HTML über der Ansicht)
    this.snapEl = document.createElement('span');
    this.snapEl.className = 'msnap';
    this.snapEl.hidden = true;
    labels.appendChild(this.snapEl);
    let moveAt = null;
    r.domElement.addEventListener('pointermove', (e) => {
      if (!this.measuring) return;
      if (!moveAt) requestAnimationFrame(() => { const m = moveAt; moveAt = null; if (this.measuring && this._alive) this.setHover(this.snapAt(m[0], m[1], m[2])); });
      moveAt = [e.clientX, e.clientY, e.altKey];
    });
    r.domElement.addEventListener('pointerleave', () => { if (this.measuring) this.setHover(null); });
    // Klick (ohne Ziehen): Bauteil wählen bzw. Messpunkt setzen
    let down = null;
    r.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    r.domElement.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || e.button > 0) { down = null; return; }
      down = null;
      this.click(e.clientX, e.clientY, e.altKey);
    });
    const loop = () => {
      if (!this._alive) return;
      this._raf = requestAnimationFrame(loop);
      this.resize();
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.placeLabels();
    };
    loop();
  }

  Viewer.prototype.resize = function () {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    if (this._w === w && this._h === h) return;
    this._w = w;
    this._h = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  Viewer.prototype.setTheme = function (dark) {
    this.dark = dark;
    this.scene.background = new this.THREE.Color(dark ? 0x1b2120 : 0xeef0ee);
    if (this.box) this.groundFor(this.worldBox ? this.worldBox() : this.box);
    if (this.dims && this.dims.length) this.drawDims();
  };

  // parts: [{ num, name, mesh: { pos: Float32Array (Modell, mm), index: Uint32Array|Array, normals?: Float32Array } }]
  Viewer.prototype.setParts = function (parts) {
    const T = this.THREE;
    for (const p of this.parts) { p.obj.geometry.dispose(); mats(p.obj).forEach((m) => m.dispose()); p.edges.geometry.dispose(); p.edges.material.dispose(); p.label.remove(); }
    this.root.clear();
    this.parts = [];
    this.clearMeasure();
    const box = new T.Box3();
    parts.forEach((src, i) => {
      if (!src.mesh) return;
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(src.mesh.pos, 3));
      if (src.mesh.normals) g.setAttribute('normal', new T.BufferAttribute(src.mesh.normals, 3));
      g.setIndex(new T.BufferAttribute(src.mesh.index instanceof Uint32Array ? src.mesh.index : new Uint32Array(src.mesh.index), 1));
      if (!src.mesh.normals) g.computeVertexNormals();
      g.computeBoundingBox();
      // Holz wie in der Teil-Ansicht; je Bauteil ein leicht anderer Ton, damit Nachbarteile unterscheidbar sind
      const look = boardLook(T, g, src.board, i);
      const mat = look.mat;
      const color = new T.Color(0xffffff);
      const obj = new T.Mesh(g, mat);
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.userData.num = src.num;
      const edges = new T.LineSegments(new T.EdgesGeometry(g, 24), new T.LineBasicMaterial({ color: look.edge, transparent: true, opacity: 0.75 }));
      this.root.add(obj, edges);
      const center = new T.Vector3();
      g.boundingBox.getCenter(center);
      const lab = document.createElement('span');
      lab.className = 'mlab';
      lab.textContent = src.num;
      lab.title = src.num + ' – ' + src.name;
      this.labelEl.appendChild(lab);
      this.parts.push({ num: src.num, name: src.name, board: src.board, index: i, obj: obj, edges: edges, color: color, center: center, label: lab, visible: true,
        feat: snapFeatures(edges.geometry.getAttribute('position').array), offset: new T.Vector3() });
      box.union(g.boundingBox);
    });
    this.box = box;
    this.setExplode(this.explode, true);
    this.setDims(this.dims);
    this.applyLook();
    this.view('iso');
  };

  // Boden unter dem Möbel: Schattenfänger und dezentes Raster (wie der Maschinentisch der Teil-Ansicht)
  Viewer.prototype.groundFor = function (box) {
    const T = this.THREE;
    this.ground.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.ground.clear();
    if (!box || box.isEmpty()) return;
    const c = box.getCenter(new T.Vector3());
    const sz = box.getSize(new T.Vector3());
    const size = Math.max(sz.x, sz.y) * 3 + 600;
    const z = box.min.z - 0.5;
    const shadow = new T.Mesh(new T.PlaneGeometry(size, size), new T.ShadowMaterial({ opacity: this.dark ? 0.45 : 0.22 }));
    shadow.position.set(c.x, c.y, z);
    shadow.receiveShadow = true;
    const grid = new T.GridHelper(size, Math.round(size / 100), this.dark ? 0x2c3633 : 0xc4cbc4, this.dark ? 0x222a28 : 0xd5dbd4);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(c.x, c.y, z - 0.2);
    grid.material.transparent = true;
    grid.material.opacity = this.dark ? 0.35 : 0.7;
    this.ground.add(shadow, grid);
    const R = sz.length();
    this.sun.position.set(c.x - R * 0.6, c.y - R * 0.9, c.z + R * 1.4);
    this.sun.target.position.copy(c);
    const sc = this.sun.shadow.camera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = R * 5;
    sc.updateProjectionMatrix();
  };

  // Plattenfarbe ändern (boards: num → Schlüssel), ohne neu zu laden
  Viewer.prototype.setBoards = function (boards) {
    const T = this.THREE;
    for (const p of this.parts) {
      const b = boards[p.num];
      if (b === undefined || b === p.board) continue;
      const look = boardLook(T, p.obj.geometry, b, p.index);
      mats(p.obj).forEach((m) => m.dispose());
      p.obj.material = look.mat;
      p.edges.material.color.copy(look.edge);
      p.board = b;
    }
    this.applyLook();
  };

  Viewer.prototype.part = function (num) { return this.parts.find((p) => p.num === num) || null; };

  // Explosionsansicht: jedes Bauteil rückt von der Mitte der Baugruppe weg (f = 0 zusammengebaut … 1 = Abstand verdoppelt)
  Viewer.prototype.setExplode = function (f, noView) {
    const T = this.THREE;
    this.explode = f;
    if (!this.box || this.box.isEmpty()) { this.groundFor(this.box); return; }
    const c = this.box.getCenter(new T.Vector3());
    for (const p of this.parts) {
      p.offset.copy(p.center).sub(c).multiplyScalar(f);
      p.obj.position.copy(p.offset);
      p.edges.position.copy(p.offset);
      p.obj.updateMatrixWorld();
      p.edges.updateMatrixWorld();
    }
    this.groundFor(this.worldBox());
    if (this.measurePts.length) this.drawMeasure();
    this.drawDims();
    if (!noView) this.setHover(null);
  };

  // Hüllquader wie gerade angezeigt (mit Explosion), ganz oder für ein Bauteil
  Viewer.prototype.worldBox = function (num) {
    const T = this.THREE;
    const box = new T.Box3();
    for (const p of this.parts) {
      if (num !== undefined && num !== null && p.num !== num) continue;
      box.union(p.obj.geometry.boundingBox.clone().translate(p.offset));
    }
    return box;
  };

  Viewer.prototype.setVisible = function (num, on) {
    const p = this.part(num);
    if (!p) return;
    p.visible = on;
    p.obj.visible = on;
    p.edges.visible = on;
    if (!on && this.selected === num) this.select(null);
    if (this.dims.length) this.drawDims();
  };

  Viewer.prototype.setOpacity = function (a) { this.opacity = a; this.applyLook(); };
  Viewer.prototype.setLabels = function (on) { this.showLabels = on; };

  Viewer.prototype.select = function (num) {
    this.selected = num;
    this.applyLook();
    if (this.onPick) this.onPick(num);
  };

  // Aussehen: gewähltes Teil kräftig (Akzent) und immer deckend, übrige mit der eingestellten Transparenz
  Viewer.prototype.applyLook = function () {
    const T = this.THREE;
    for (const p of this.parts) {
      const sel = p.num === this.selected;
      const a = sel ? 1 : this.opacity;
      for (const m of mats(p.obj)) {
        m.color.copy(sel ? new T.Color(0x6f9fff) : p.color);
        m.emissive = new T.Color(sel ? 0x0b2a5a : 0x000000);
        m.transparent = a < 0.999;
        m.opacity = a;
        m.depthWrite = a >= 0.999;
        m.needsUpdate = true;
      }
      p.obj.renderOrder = a < 0.999 ? 1 : 0;
      p.edges.material.opacity = Math.max(0.15, 0.8 * a);
    }
  };

  Viewer.prototype.view = function (which, onlyNum) {
    const T = this.THREE;
    let box = this.worldBox();
    if (onlyNum !== undefined && onlyNum !== null && this.part(onlyNum)) box = this.worldBox(onlyNum);
    if (!box || box.isEmpty()) return;
    const c = new T.Vector3();
    box.getCenter(c);
    const size = new T.Vector3();
    box.getSize(size);
    const R = Math.max(size.length() / 2, 10);
    let dir;
    if (which === 'top') dir = new T.Vector3(0, -0.001, 1);
    else if (which === 'front') dir = new T.Vector3(0, -1, 0.02);
    else if (which === 'right') dir = new T.Vector3(1, 0, 0.02);
    else dir = new T.Vector3(-0.6, -1, 0.7);
    dir.normalize();
    const dist = R / Math.sin((this.camera.fov * Math.PI) / 360) * 1.05;
    this.camera.position.copy(c).addScaledVector(dir, dist);
    this.camera.near = Math.max(0.5, dist / 500);
    this.camera.far = dist * 50;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(c);
    this.camera.lookAt(c);
  };

  // Nummern über den Bauteilen (HTML über der Ansicht, je Bild neu gesetzt)
  Viewer.prototype.placeLabels = function () {
    const w = this._w;
    const h = this._h;
    if (!w) return;
    const v = new this.THREE.Vector3();
    for (const p of this.parts) {
      const show = this.showLabels && p.visible;
      if (!show) { p.label.style.display = 'none'; continue; }
      v.copy(p.center).add(p.offset).project(this.camera);
      if (v.z > 1) { p.label.style.display = 'none'; continue; }
      p.label.style.display = '';
      p.label.style.transform = 'translate(' + ((v.x + 1) / 2 * w).toFixed(1) + 'px,' + ((1 - v.y) / 2 * h).toFixed(1) + 'px) translate(-50%,-50%)';
      p.label.classList.toggle('sel', p.num === this.selected);
    }
    for (const m of this.measureLabels || []) {
      v.copy(m.at).project(this.camera);
      m.el.style.display = v.z > 1 ? 'none' : '';
      m.el.style.transform = 'translate(' + ((v.x + 1) / 2 * w).toFixed(1) + 'px,' + ((1 - v.y) / 2 * h).toFixed(1) + 'px) translate(-50%,' + (m.el.classList.contains('dot') ? '-50%' : '-130%') + ')';
    }
    if (this.dimShapes && (this.dimShapes.length || (this.dimSvg && this.dimSvg.firstChild))) this.drawDimSvg();
    for (const m of this.dimLabels) {
      v.copy(m.at).project(this.camera);
      m.el.style.display = v.z > 1 ? 'none' : '';
      m.el.style.transform = 'translate(' + ((v.x + 1) / 2 * w).toFixed(1) + 'px,' + ((1 - v.y) / 2 * h).toFixed(1) + 'px) translate(-50%,-50%)';
    }
    if (this.hover && !this.snapEl.hidden) {
      v.copy(this.hover.world).project(this.camera);
      this.snapEl.style.transform = 'translate(' + ((v.x + 1) / 2 * w).toFixed(1) + 'px,' + ((1 - v.y) / 2 * h).toFixed(1) + 'px)';
    }
  };

  // Bildschirm-Pixel eines Weltpunkts (relativ zur Ansicht)
  Viewer.prototype.toScreen = function (q, rect) {
    const s = q.clone().project(this.camera);
    return [((s.x + 1) / 2) * rect.width, ((1 - s.y) / 2) * rect.height, s.z];
  };

  // Treffer unter dem Mauszeiger (nur sichtbare Bauteile) – zum Wählen
  Viewer.prototype.hit = function (cx, cy) {
    const T = this.THREE;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new T.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.parts.filter((p) => p.visible).map((p) => p.obj), false);
    return hits.length ? { num: hits[0].object.userData.num, hit: hits[0] } : null;
  };

  // Ist der Weltpunkt q von der Kamera aus sichtbar (nicht von einem deckenden Bauteil verdeckt)?
  Viewer.prototype.visibleAt = function (q) {
    if (this.opacity < 0.999) return true;
    const T = this.THREE;
    const o = this.camera.position;
    const d = q.clone().sub(o);
    const len = d.length();
    const rc = new T.Raycaster(o.clone(), d.normalize(), 0, len);
    const hits = rc.intersectObjects(this.parts.filter((p) => p.visible).map((p) => p.obj), false);
    return !hits.length || hits[0].distance >= len - Math.max(0.3, len * 2e-4);
  };

  /*
   * Fang: Punkt unter dem Mauszeiger, eingerastet auf (Rangfolge) Endpunkt/Ecke, Kreismitte, Kantenmitte (Radius 14 px),
   * sonst auf eine Kante (8 px), sonst Punkt auf der Fläche. Alt gedrückt = ohne Fang.
   * Ergebnis { num, world, local (ohne Explosion), kind: 'end'|'center'|'mid'|'edge'|'face', normal? }.
   */
  Viewer.prototype.snapAt = function (cx, cy, free) {
    const T = this.THREE;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mx = cx - rect.left;
    const my = cy - rect.top;
    const h = this.hit(cx, cy);
    const face = h ? { num: h.num, world: h.hit.point.clone(), kind: 'face',
      normal: h.hit.face ? h.hit.face.normal.clone() : null } : null;
    const finish = (r) => {
      if (!r) return null;
      const p = this.part(r.num);
      r.local = r.world.clone().sub(p.offset);
      r.name = p.name;
      return r;
    };
    if (free) return finish(face);
    // Bauteile, deren Fangpunkte in Frage kommen: das getroffene, sonst alle sichtbaren (Kante am Umriss)
    const cand = (h ? this.parts.filter((p) => p.num === h.num) : []).concat(
      this.parts.filter((p) => p.visible && (!h || p.num !== h.num) && this.nearBox(p, mx, my, rect, 14)));
    const PRI = { end: 0, center: 0, mid: 3 };
    const pts = [];
    const v = new T.Vector3();
    for (const p of cand) {
      const f = p.feat;
      for (const q of f.points) {
        v.set(q.p[0], q.p[1], q.p[2]).add(p.offset);
        const s = this.toScreen(v, rect);
        if (s[2] > 1) continue;
        const px = Math.hypot(s[0] - mx, s[1] - my);
        if (px < 14) pts.push({ num: p.num, world: v.clone(), kind: q.kind, r: q.r, score: px + PRI[q.kind], depth: s[2] });
      }
    }
    pts.sort((a, b) => a.score - b.score || a.depth - b.depth);
    for (const q of pts.slice(0, 8)) if (this.visibleAt(q.world)) return finish(q);
    // auf Kanten: nächster Punkt zwischen Sehstrahl und Kantenstück
    const ray = this.raycaster.ray;
    let best = null;
    const a = new T.Vector3();
    const b = new T.Vector3();
    const onSeg = new T.Vector3();
    for (const p of cand) {
      const s = p.feat.segs;
      for (let i = 0; i < s.length; i += 6) {
        a.set(s[i], s[i + 1], s[i + 2]).add(p.offset);
        b.set(s[i + 3], s[i + 4], s[i + 5]).add(p.offset);
        ray.distanceSqToSegment(a, b, null, onSeg);
        const sc = this.toScreen(onSeg, rect);
        if (sc[2] > 1) continue;
        const px = Math.hypot(sc[0] - mx, sc[1] - my);
        if (px < 8 && (!best || px < best.px - 0.5 || (px < best.px + 0.5 && sc[2] < best.depth))) best = { num: p.num, world: onSeg.clone(), kind: 'edge', px: px, depth: sc[2] };
      }
    }
    if (best && this.visibleAt(best.world)) return finish(best);
    return finish(face);
  };

  // Liegt der Mauszeiger (mit Rand) im Bildschirm-Rechteck des Bauteils?
  Viewer.prototype.nearBox = function (p, mx, my, rect, pad) {
    const bb = p.obj.geometry.boundingBox;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const v = new this.THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).add(p.offset);
      const s = this.toScreen(v, rect);
      x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]);
    }
    return mx > x0 - pad && mx < x1 + pad && my > y0 - pad && my < y1 + pad;
  };

  const SNAP_NAMES = { end: 'Endpunkt', center: 'Kreismitte', mid: 'Mitte', edge: 'Kante', face: 'Fläche' };

  // Fang-Markierung und Gummiband vom ersten Punkt zum Mauszeiger
  Viewer.prototype.setHover = function (hv) {
    this.hover = hv;
    const el = this.snapEl;
    el.hidden = !hv;
    if (hv) {
      el.dataset.kind = hv.kind;
      el.textContent = SNAP_NAMES[hv.kind] + (hv.kind === 'center' && hv.r ? ' R ' + (Math.round(hv.r * 10) / 10) : '');
    }
    if (this.measurePts.length === 1) this.drawMeasure();
    if (this.onHover) this.onHover(hv ? { kind: hv.kind, name: SNAP_NAMES[hv.kind] } : null);
  };

  Viewer.prototype.click = function (cx, cy, free) {
    if (this.measuring) {
      const h = this.snapAt(cx, cy, free);
      if (!h) return;
      if (this.measurePts.length >= 2) this.clearMeasure();
      this.measurePts.push(h);
      if (this.mode === 'dim' && this.measurePts.length === 2) {
        const [a, b] = this.measurePts;
        this.clearMeasure();
        this.addDim(a, b, this.dimAxis);
        return;
      }
      this.drawMeasure();
      return;
    }
    const h = this.hit(cx, cy);
    this.select(h ? h.num : null);
  };

  Viewer.prototype.setMeasuring = function (on, mode) {
    this.measuring = on;
    this.mode = on ? mode || 'measure' : null;
    this.clearMeasure();
    this.renderer.domElement.style.cursor = on ? 'crosshair' : '';
    if (!on) { this.clearMeasure(); this.setHover(null); }
  };

  Viewer.prototype.clearMeasure = function () {
    this.measurePts = [];
    this.measureGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.measureGroup.clear();
    for (const m of this.measureLabels || []) m.el.remove();
    this.measureLabels = [];
    if (this.onMeasure) this.onMeasure(null);
  };

  // Weltpunkt eines Messpunkts (wandert mit der Explosion mit)
  Viewer.prototype.worldOf = function (m) {
    const p = this.part(m.num);
    return m.local.clone().add(p ? p.offset : new this.THREE.Vector3());
  };

  /*
   * Maße immer wie zusammengebaut (Punkte ohne Explosion), gezeichnet an den angezeigten Stellen.
   * Zwei Flächenpunkte mit parallelen Flächen: zusätzlich der senkrechte Abstand der Flächen.
   */
  function measureOf(a, b) {
    const d = b.local.clone().sub(a.local);
    const out = { dist: d.length(), dx: Math.abs(d.x), dy: Math.abs(d.y), dz: Math.abs(d.z), kinds: [a.kind, b.kind] };
    if (a.kind === 'face' && b.kind === 'face' && a.normal && b.normal && Math.abs(a.normal.dot(b.normal)) > 0.999) {
      out.normal = Math.abs(d.dot(a.normal));
    }
    return out;
  }

  Viewer.prototype.drawMeasure = function () {
    const T = this.THREE;
    this.measureGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.measureGroup.clear();
    for (const m of this.measureLabels || []) m.el.remove();
    this.measureLabels = [];
    const R = this.box ? this.box.getSize(new T.Vector3()).length() / 400 : 2;
    const pts = this.measurePts.map((m) => this.worldOf(m));
    const line = (a, b, dashed) => {
      const mat = dashed ? new T.LineDashedMaterial({ color: 0xe0442c, depthTest: false, dashSize: R * 3, gapSize: R * 2 })
        : new T.LineBasicMaterial({ color: 0xe0442c, depthTest: false });
      const l = new T.Line(new T.BufferGeometry().setFromPoints([a, b]), mat);
      if (dashed) l.computeLineDistances();
      l.renderOrder = 10;
      this.measureGroup.add(l);
    };
    const tag = (text, at, cls) => {
      const el = document.createElement('span');
      el.className = 'mlab meas' + (cls ? ' ' + cls : '');
      el.textContent = text;
      this.labelEl.appendChild(el);
      this.measureLabels.push({ el: el, at: at });
    };
    // Messpunkte als Punkte fester Bildschirmgröße
    for (const q of pts) tag('', q, 'dot');
    if (this.measurePts.length === 2) {
      const [a, b] = pts;
      line(a, b);
      const m = measureOf(this.measurePts[0], this.measurePts[1]);
      tag(num1(m.dist) + ' mm', a.clone().add(b).multiplyScalar(0.5));
      if (this.onMeasure) this.onMeasure(Object.assign(m, { exploded: this.explode > 0 }));
    } else if (this.measurePts.length === 1) {
      const hv = this.hover;
      if (hv) {
        line(pts[0], hv.world, true);
        const m = measureOf(this.measurePts[0], hv);
        const ax = this.mode === 'dim' ? this.dimAxis : 'aligned';
        tag((ax === 'aligned' ? '' : ax.toUpperCase() + ' ') + num1(ax === 'aligned' ? m.dist : m['d' + ax]), pts[0].clone().add(hv.world).multiplyScalar(0.5), 'live');
      }
      if (this.onMeasure) this.onMeasure({ first: true, kind: this.measurePts[0].kind });
    }
  };

  // Zahl mit einer Nachkommastelle, deutsch (462 bzw. 12,5)
  function num1(v) { return String(Math.round(v * 10) / 10).replace('.', ','); }

  /*
   * Bemaßen: Maße bleiben stehen (auch beim Drehen, Ausblenden, in der Explosion). axis 'aligned' = direkter Abstand,
   * 'x'/'y'/'z' = Abstand in der Achse (Maßlinie in Achsrichtung ab Punkt a, Hilfslinie zum Punkt b).
   * Wert immer wie zusammengebaut (lokale Punkte ohne Explosion).
   */
  let dimSeq = 0;
  Viewer.prototype.addDim = function (a, b, axis) {
    const m = measureOf(a, b);
    const d = { id: ++dimSeq, a: a, b: b, axis: axis || 'aligned' };
    d.value = d.axis === 'aligned' ? m.dist : m['d' + d.axis];
    this.dims.push(d);
    this.drawDims();
    if (this.onDims) this.onDims(this.dims);
    return d;
  };
  Viewer.prototype.removeDim = function (id) {
    this.dims = this.dims.filter((d) => d.id !== id);
    this.drawDims();
    if (this.onDims) this.onDims(this.dims);
  };
  Viewer.prototype.clearDims = function () { this.dims = []; this.drawDims(); if (this.onDims) this.onDims(this.dims); };
  // Maße nach neuem Laden der Bauteile wieder setzen (nur wenn Nummer und Name noch passen)
  Viewer.prototype.setDims = function (list) {
    this.dims = (list || []).filter((d) => { const pa = this.part(d.a.num); const pb = this.part(d.b.num); return pa && pb && pa.name === d.a.name && pb.name === d.b.name; });
    this.drawDims();
    if (this.onDims) this.onDims(this.dims);
  };
  /*
   * Maße zeichnen wie in einer Zeichnung: Maßlinie nach außen versetzt (weg von der Mitte der Baugruppe), Hilfslinien
   * von den Punkten, Pfeile – als SVG über der Ansicht (feste Strichstärke), je Bild neu projiziert (drawDimSvg).
   */
  Viewer.prototype.drawDims = function () {
    const T = this.THREE;
    for (const m of this.dimLabels) m.el.remove();
    this.dimLabels = [];
    this.dimShapes = [];
    if (!this.dimSvg) {
      this.dimSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.dimSvg.setAttribute('class', 'mdimsvg');
      this.labelEl.insertBefore(this.dimSvg, this.labelEl.firstChild);
    }
    const wb = this.worldBox();
    const c = wb.isEmpty() ? new T.Vector3() : wb.getCenter(new T.Vector3());
    const off = wb.isEmpty() ? 20 : Math.max(20, wb.getSize(new T.Vector3()).length() * 0.06);
    const tag = (text, at, cls, title) => {
      const el = document.createElement('span');
      el.className = 'mlab dim' + (cls ? ' ' + cls : '');
      el.textContent = text;
      if (title) el.title = title;
      this.labelEl.appendChild(el);
      this.dimLabels.push({ el: el, at: at });
    };
    const AX = { x: new T.Vector3(1, 0, 0), y: new T.Vector3(0, 1, 0), z: new T.Vector3(0, 0, 1) };
    this.dims.forEach((d, i) => {
      const pa = this.part(d.a.num);
      const pb = this.part(d.b.num);
      if (!pa || !pb || !pa.visible || !pb.visible) return;
      const a = this.worldOf(d.a);
      const b = this.worldOf(d.b);
      // Richtung der Maßlinie und Versatz nach außen (senkrecht dazu)
      const dir = d.axis === 'aligned' ? b.clone().sub(a) : AX[d.axis].clone().multiplyScalar(b.clone().sub(a).dot(AX[d.axis]));
      const len = dir.length();
      const u = len > 1e-6 ? dir.clone().divideScalar(len) : new T.Vector3(1, 0, 0);
      const mid = a.clone().addScaledVector(dir, 0.5);
      let n = mid.clone().sub(c);
      n.addScaledVector(u, -n.dot(u));
      if (n.length() < 1e-3) { n = (Math.abs(u.z) < 0.9 ? new T.Vector3(0, 0, 1) : new T.Vector3(0, -1, 0)); n.addScaledVector(u, -n.dot(u)); }
      n.normalize();
      // Maßlinie: von a (versetzt) in Richtung u um die Maßlänge; Hilfslinie von b bis zum Ende der Maßlinie
      const A = a.clone().addScaledVector(n, off);
      const E = A.clone().add(dir);
      const over = off * 0.18;
      const B = b.clone().addScaledVector(E.clone().sub(b).normalize(), E.distanceTo(b) + over);
      this.dimShapes.push({ dim: [A, E], ext: [[a, A.clone().addScaledVector(n, over)], [b, B]] });
      tag('', a, 'dot');
      tag('', b, 'dot');
      tag((d.axis === 'aligned' ? '' : d.axis.toUpperCase() + ' ') + num1(d.value), A.clone().add(E).multiplyScalar(0.5), '',
        'Maß ' + (i + 1) + ': Bauteil ' + d.a.num + (d.b.num !== d.a.num ? ' → ' + d.b.num : ''));
    });
    if (!this.dimShapes.length) this.dimSvg.innerHTML = '';
  };

  // Maßlinien als SVG für die aktuelle Kamera
  Viewer.prototype.drawDimSvg = function () {
    if (!this.dimSvg) return;
    const w = this._w;
    const h = this._h;
    const sc = (q) => { const v = q.clone().project(this.camera); return v.z > 1 ? null : [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h]; };
    const f = (v) => v.toFixed(1);
    let ext = '';
    let dim = '';
    let arr = '';
    for (const s of this.dimShapes || []) {
      for (const [p, q] of s.ext) { const P = sc(p); const Q = sc(q); if (P && Q) ext += 'M' + f(P[0]) + ' ' + f(P[1]) + 'L' + f(Q[0]) + ' ' + f(Q[1]); }
      const A = sc(s.dim[0]);
      const E = sc(s.dim[1]);
      if (!A || !E) continue;
      dim += 'M' + f(A[0]) + ' ' + f(A[1]) + 'L' + f(E[0]) + ' ' + f(E[1]);
      const L = Math.hypot(E[0] - A[0], E[1] - A[1]);
      if (L < 4) continue;
      const ux = (E[0] - A[0]) / L;
      const uy = (E[1] - A[1]) / L;
      const k = Math.min(10, L / 3);
      for (const [P, sx] of [[A, 1], [E, -1]]) {
        const bx = P[0] + ux * k * sx;
        const by = P[1] + uy * k * sx;
        arr += 'M' + f(P[0]) + ' ' + f(P[1]) + 'L' + f(bx - uy * k * 0.32) + ' ' + f(by + ux * k * 0.32) + 'L' + f(bx + uy * k * 0.32) + ' ' + f(by - ux * k * 0.32) + 'Z';
      }
    }
    this.dimSvg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    this.dimSvg.innerHTML = ext || dim ? '<path class="ext" d="' + ext + '"/><path class="dim" d="' + dim + '"/><path class="arr" d="' + arr + '"/>' : '';
  };

  /*
   * Fangpunkte eines Bauteils aus seinen Kanten (Strecken wie EdgesGeometry: x1,y1,z1,x2,y2,z2 …):
   * Ecken (Knick > 30° oder Abzweig), Mitte jeder Kante zwischen zwei Ecken, Mittelpunkt von Kreisen und Bögen.
   * Rückgabe { points: [{ p: [x,y,z], kind, r? }], segs }.
   */
  function snapFeatures(segs) {
    const key = (i) => Math.round(segs[i] * 100) + ',' + Math.round(segs[i + 1] * 100) + ',' + Math.round(segs[i + 2] * 100);
    const ids = new Map();
    const P = [];
    const adj = [];
    const node = (i) => {
      const k = key(i);
      let n = ids.get(k);
      if (n === undefined) { n = P.length; ids.set(k, n); P.push([segs[i], segs[i + 1], segs[i + 2]]); adj.push([]); }
      return n;
    };
    for (let i = 0; i < segs.length; i += 6) {
      const a = node(i);
      const b = node(i + 3);
      if (a === b || adj[a].includes(b)) continue;
      adj[a].push(b);
      adj[b].push(a);
    }
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const len = (a) => Math.hypot(a[0], a[1], a[2]);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const corner = P.map((p, n) => {
      if (adj[n].length !== 2) return true;
      const u = sub(p, P[adj[n][0]]);
      const w = sub(P[adj[n][1]], p);
      return dot(u, w) / (len(u) * len(w) || 1) < Math.cos(Math.PI / 6);
    });
    const points = [];
    P.forEach((p, n) => { if (corner[n] && adj[n].length) points.push({ p: p, kind: 'end' }); });
    const used = new Set();
    const ek = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
    // Kreis bzw. Bogen durch die Punkte? → Mittelpunkt und Radius (Abweichung ≤ 2 %)
    const circle = (pts) => {
      if (pts.length < 4) return null;
      const a = pts[0];
      const b = pts[Math.floor(pts.length / 3)];
      const c = pts[Math.floor((2 * pts.length) / 3)];
      const ab = sub(b, a);
      const ac = sub(c, a);
      const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const nn = dot(n, n);
      if (nn < 1e-9) return null;
      const t1 = dot(ac, ac);
      const t2 = dot(ab, ab);
      const x = [(t1 * (n[1] * ab[2] - n[2] * ab[1]) - t2 * (n[1] * ac[2] - n[2] * ac[1])),
        (t1 * (n[2] * ab[0] - n[0] * ab[2]) - t2 * (n[2] * ac[0] - n[0] * ac[2])),
        (t1 * (n[0] * ab[1] - n[1] * ab[0]) - t2 * (n[0] * ac[1] - n[1] * ac[0]))];
      const cen = [a[0] + x[0] / (2 * nn), a[1] + x[1] / (2 * nn), a[2] + x[2] / (2 * nn)];
      const r = len(sub(a, cen));
      if (!(r > 0.2) || r > 5000) return null;
      const nl = Math.sqrt(nn);
      for (const q of pts) {
        const d = sub(q, cen);
        if (Math.abs(len(d) - r) > r * 0.02 + 0.01 || Math.abs(dot(d, n)) / nl > r * 0.02 + 0.01) return null;
      }
      return { c: cen, r: r };
    };
    const addChain = (chain, closed) => {
      const pts = chain.map((n) => P[n]);
      const cir = circle(pts);
      if (cir) points.push({ p: cir.c, kind: 'center', r: cir.r });
      if (closed) return;
      // Kantenmitte (halbe Länge entlang der Kante)
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += len(sub(pts[i], pts[i - 1]));
      let run = 0;
      for (let i = 1; i < pts.length; i++) {
        const l = len(sub(pts[i], pts[i - 1]));
        if (run + l >= total / 2 - 1e-9) {
          const t = l ? (total / 2 - run) / l : 0;
          points.push({ p: pts[i - 1].map((v, k) => v + (pts[i][k] - v) * t), kind: 'mid' });
          break;
        }
        run += l;
      }
    };
    // Ketten zwischen Ecken
    P.forEach((p, s) => {
      if (!corner[s]) return;
      for (const first of adj[s]) {
        if (used.has(ek(s, first))) continue;
        const chain = [s];
        let prev = s;
        let cur = first;
        used.add(ek(s, first));
        while (true) {
          chain.push(cur);
          if (corner[cur]) break;
          const next = adj[cur][0] === prev ? adj[cur][1] : adj[cur][0];
          if (used.has(ek(cur, next))) break;
          used.add(ek(cur, next));
          prev = cur;
          cur = next;
        }
        addChain(chain, false);
      }
    });
    // geschlossene Ringe ohne Ecke (Bohrungen, Kreise)
    P.forEach((p, s) => {
      if (corner[s] || used.has(ek(s, adj[s][0]))) return;
      const chain = [s];
      let prev = s;
      let cur = adj[s][0];
      used.add(ek(s, cur));
      while (cur !== s) {
        chain.push(cur);
        const next = adj[cur][0] === prev ? adj[cur][1] : adj[cur][0];
        if (used.has(ek(cur, next))) break;
        used.add(ek(cur, next));
        prev = cur;
        cur = next;
      }
      addChain(chain, true);
    });
    return { points: points, segs: segs };
  }

  Viewer.prototype.dispose = function () {
    this._alive = false;
    cancelAnimationFrame(this._raf);
    this.renderer.dispose();
  };

  /*
   * Netze den Bauteilen zuordnen: je Bauteil das Netz, dessen Hüllquader (Modellkoordinaten) am besten passt.
   * meshes = Ergebnis von OpenCascade (attributes.position.array, index.array), boxes = [{ lo, hi }] je Bauteil.
   */
  function assign(meshes, boxes) {
    const mb = meshes.map((m) => {
      const a = m.attributes.position.array;
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { if (a[i + k] < lo[k]) lo[k] = a[i + k]; if (a[i + k] > hi[k]) hi[k] = a[i + k]; }
      return { lo: lo, hi: hi };
    });
    const used = new Set();
    return boxes.map((b) => {
      let best = -1;
      let err = Infinity;
      mb.forEach((m, j) => {
        if (used.has(j)) return;
        const e = [0, 1, 2].reduce((s, k) => s + Math.abs(m.lo[k] - b.lo[k]) + Math.abs(m.hi[k] - b.hi[k]), 0);
        if (e < err) { err = e; best = j; }
      });
      if (best < 0 || err > 5) return null;
      used.add(best);
      const m = meshes[best];
      return { pos: new Float32Array(m.attributes.position.array), index: m.index.array,
        normals: m.attributes.normal ? new Float32Array(m.attributes.normal.array) : null };
    });
  }

  return { Viewer: Viewer, assign: assign, snapFeatures: snapFeatures };
});
