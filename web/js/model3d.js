/*
 * Möbel-3D: alle Bauteile einer STEP-Baugruppe zusammengebaut (Modellkoordinaten, Z oben) – drehen, verschieben,
 * zoomen, Bauteile ein-/ausblenden, Transparenz, Explosionsansicht, Nummern am Bauteil, Bauteil anklicken, Messen mit
 * Fang (Endpunkt, Kantenmitte, Kreismitte, Kante, Fläche). three.js und OrbitControls kommen aus View3D.load().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Model3D = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Holztöne je Bauteil (leicht verschieden, damit Nachbarteile unterscheidbar sind)
  const TONES = ['#d4ae7b', '#caa16c', '#dab886', '#c69c66', '#d0a874', '#c9a26f'];

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
    this.measurePts = [];
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
    for (const p of this.parts) p.edges.material.color.set(dark ? 0x1a120a : 0x4a3520);
    if (this.box) this.groundFor(this.box);
  };

  // parts: [{ num, name, mesh: { pos: Float32Array (Modell, mm), index: Uint32Array|Array, normals?: Float32Array } }]
  Viewer.prototype.setParts = function (parts) {
    const T = this.THREE;
    for (const p of this.parts) { p.obj.geometry.dispose(); p.obj.material.dispose(); p.edges.geometry.dispose(); p.edges.material.dispose(); p.label.remove(); }
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
      const mat = window.View3D && View3D.woodMaterial ? View3D.woodMaterial(T, g, TONES[i % TONES.length])
        : new T.MeshStandardMaterial({ color: TONES[i % TONES.length], roughness: 0.6, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      mat.side = T.DoubleSide;
      const color = new T.Color(0xffffff);
      const obj = new T.Mesh(g, mat);
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.userData.num = src.num;
      const edges = new T.LineSegments(new T.EdgesGeometry(g, 24), new T.LineBasicMaterial({ color: this.dark ? 0x1a120a : 0x4a3520, transparent: true, opacity: 0.75 }));
      this.root.add(obj, edges);
      const center = new T.Vector3();
      g.boundingBox.getCenter(center);
      const lab = document.createElement('span');
      lab.className = 'mlab';
      lab.textContent = src.num;
      lab.title = src.num + ' – ' + src.name;
      this.labelEl.appendChild(lab);
      this.parts.push({ num: src.num, name: src.name, obj: obj, edges: edges, color: color, center: center, label: lab, visible: true,
        feat: snapFeatures(edges.geometry.getAttribute('position').array), offset: new T.Vector3() });
      box.union(g.boundingBox);
    });
    this.box = box;
    this.setExplode(this.explode, true);
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
      p.obj.material.color.copy(sel ? new T.Color(0x6f9fff) : p.color);
      p.obj.material.emissive = new T.Color(sel ? 0x0b2a5a : 0x000000);
      p.obj.material.transparent = a < 0.999;
      p.obj.material.opacity = a;
      p.obj.material.depthWrite = a >= 0.999;
      p.obj.renderOrder = a < 0.999 ? 1 : 0;
      p.edges.material.opacity = Math.max(0.15, 0.8 * a);
      p.obj.material.needsUpdate = true;
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
      this.drawMeasure();
      return;
    }
    const h = this.hit(cx, cy);
    this.select(h ? h.num : null);
  };

  Viewer.prototype.setMeasuring = function (on) {
    this.measuring = on;
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
      tag(m.dist.toFixed(1) + ' mm', a.clone().add(b).multiplyScalar(0.5));
      if (this.onMeasure) this.onMeasure(Object.assign(m, { exploded: this.explode > 0 }));
    } else if (this.measurePts.length === 1) {
      const hv = this.hover;
      if (hv) {
        line(pts[0], hv.world, true);
        const m = measureOf(this.measurePts[0], hv);
        tag(m.dist.toFixed(1), pts[0].clone().add(hv.world).multiplyScalar(0.5), 'live');
      }
      if (this.onMeasure) this.onMeasure({ first: true, kind: this.measurePts[0].kind });
    }
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
