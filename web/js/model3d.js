/*
 * Möbel-3D: alle Bauteile einer STEP-Baugruppe zusammengebaut (Modellkoordinaten, Z oben) – drehen, verschieben,
 * zoomen, Bauteile ein-/ausblenden, Transparenz, Nummern am Bauteil, Bauteil anklicken, Messen (zwei Punkte, rastet
 * auf Ecken ein). three.js und OrbitControls kommen aus View3D.load() (web/js/vendor).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Model3D = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Holztöne je Bauteil (leicht verschieden, damit Nachbarteile unterscheidbar sind)
  const TONES = ['#c79a63', '#b98a55', '#d1a771', '#b08050', '#c99d68', '#bd8f5a'];

  function Viewer(host, labels) {
    const THREE = window.THREE;
    this.THREE = THREE;
    this.host = host;
    this.labelEl = labels;
    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.85;
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
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x887766, 0.45));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.scene.add(this.sun);
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
    this._alive = true;
    // Klick (ohne Ziehen): Bauteil wählen bzw. Messpunkt setzen
    let down = null;
    r.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    r.domElement.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || e.button > 0) { down = null; return; }
      down = null;
      this.click(e.clientX, e.clientY);
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
    for (const p of this.parts) p.edges.material.color.set(dark ? 0x0d0a06 : 0x3d2b17);
  };

  // parts: [{ num, name, mesh: { pos: Float32Array (Modell, mm), index: Uint32Array|Array, normals?: Float32Array } }]
  Viewer.prototype.setParts = function (parts) {
    const T = this.THREE;
    for (const p of this.parts) { p.obj.geometry.dispose(); p.obj.material.dispose(); p.edges.geometry.dispose(); p.edges.material.dispose(); }
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
      const color = new T.Color(TONES[i % TONES.length]);
      const mat = new T.MeshStandardMaterial({ color: color, roughness: 0.62, metalness: 0, envMapIntensity: 0.5,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: T.DoubleSide });
      const obj = new T.Mesh(g, mat);
      obj.userData.num = src.num;
      const edges = new T.LineSegments(new T.EdgesGeometry(g, 24), new T.LineBasicMaterial({ color: this.dark ? 0x0d0a06 : 0x3d2b17, transparent: true, opacity: 0.8 }));
      this.root.add(obj, edges);
      const center = new T.Vector3();
      g.boundingBox.getCenter(center);
      const lab = document.createElement('span');
      lab.className = 'mlab';
      lab.textContent = src.num;
      lab.title = src.num + ' – ' + src.name;
      this.labelEl.appendChild(lab);
      this.parts.push({ num: src.num, name: src.name, obj: obj, edges: edges, color: color, center: center, label: lab, visible: true });
      box.union(g.boundingBox);
    });
    this.box = box;
    this.applyLook();
    this.view('iso');
  };

  Viewer.prototype.part = function (num) { return this.parts.find((p) => p.num === num) || null; };

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
      p.obj.material.color.copy(sel ? new T.Color(0x6aa7ff).lerp(p.color, 0.35) : p.color);
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
    let box = this.box;
    if (onlyNum !== undefined && onlyNum !== null) { const p = this.part(onlyNum); if (p) box = p.obj.geometry.boundingBox; }
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
    this.sun.position.copy(c).add(new T.Vector3(-R, -R * 1.5, R * 2));
    this.sun.target.position.copy(c);
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
      v.copy(p.center).project(this.camera);
      if (v.z > 1) { p.label.style.display = 'none'; continue; }
      p.label.style.display = '';
      p.label.style.transform = 'translate(' + ((v.x + 1) / 2 * w).toFixed(1) + 'px,' + ((1 - v.y) / 2 * h).toFixed(1) + 'px) translate(-50%,-50%)';
      p.label.classList.toggle('sel', p.num === this.selected);
    }
    for (const m of this.measureLabels || []) {
      v.copy(m.at).project(this.camera);
      m.el.style.display = v.z > 1 ? 'none' : '';
      m.el.style.transform = 'translate(' + ((v.x + 1) / 2 * w).toFixed(1) + 'px,' + ((1 - v.y) / 2 * h).toFixed(1) + 'px) translate(-50%,-130%)';
    }
  };

  // Treffer unter dem Mauszeiger (nur sichtbare Bauteile); beim Messen auf die nächste Ecke des Dreiecks einrasten
  Viewer.prototype.hit = function (cx, cy) {
    const T = this.THREE;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new T.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const objs = this.parts.filter((p) => p.visible).map((p) => p.obj);
    const hits = this.raycaster.intersectObjects(objs, false);
    if (!hits.length) return null;
    const h = hits[0];
    let pt = h.point.clone();
    let snapped = false;
    if (h.face) {
      const pos = h.object.geometry.getAttribute('position');
      let best = null;
      for (const k of [h.face.a, h.face.b, h.face.c]) {
        const q = new T.Vector3().fromBufferAttribute(pos, k);
        const s = q.clone().project(this.camera);
        const px = Math.hypot(((s.x + 1) / 2) * rect.width - (cx - rect.left), ((1 - s.y) / 2) * rect.height - (cy - rect.top));
        if (px < 12 && (!best || px < best.px)) best = { q: q, px: px };
      }
      if (best) { pt = best.q; snapped = true; }
    }
    return { num: h.object.userData.num, point: pt, snapped: snapped };
  };

  Viewer.prototype.click = function (cx, cy) {
    const h = this.hit(cx, cy);
    if (this.measuring) {
      if (!h) return;
      if (this.measurePts.length >= 2) this.clearMeasure();
      this.measurePts.push(h.point);
      this.drawMeasure();
      return;
    }
    this.select(h ? h.num : null);
  };

  Viewer.prototype.setMeasuring = function (on) {
    this.measuring = on;
    this.renderer.domElement.style.cursor = on ? 'crosshair' : '';
    if (!on) this.clearMeasure();
  };

  Viewer.prototype.clearMeasure = function () {
    this.measurePts = [];
    this.measureGroup.clear();
    for (const m of this.measureLabels || []) m.el.remove();
    this.measureLabels = [];
    if (this.onMeasure) this.onMeasure(null);
  };

  Viewer.prototype.drawMeasure = function () {
    const T = this.THREE;
    this.measureGroup.clear();
    for (const m of this.measureLabels || []) m.el.remove();
    this.measureLabels = [];
    const R = this.box ? this.box.getSize(new T.Vector3()).length() / 400 : 2;
    const dotMat = new T.MeshBasicMaterial({ color: 0xe0442c, depthTest: false });
    for (const q of this.measurePts) {
      const s = new T.Mesh(new T.SphereGeometry(Math.max(1.2, R), 16, 12), dotMat);
      s.position.copy(q);
      s.renderOrder = 10;
      this.measureGroup.add(s);
    }
    if (this.measurePts.length === 2) {
      const [a, b] = this.measurePts;
      const line = new T.Line(new T.BufferGeometry().setFromPoints([a, b]), new T.LineBasicMaterial({ color: 0xe0442c, depthTest: false }));
      line.renderOrder = 10;
      this.measureGroup.add(line);
      const d = b.clone().sub(a);
      const el = document.createElement('span');
      el.className = 'mlab meas';
      el.textContent = d.length().toFixed(1) + ' mm';
      this.labelEl.appendChild(el);
      this.measureLabels.push({ el: el, at: a.clone().add(b).multiplyScalar(0.5) });
      if (this.onMeasure) this.onMeasure({ dist: d.length(), dx: Math.abs(d.x), dy: Math.abs(d.y), dz: Math.abs(d.z) });
    } else if (this.onMeasure) this.onMeasure({ first: true });
  };

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

  return { Viewer: Viewer, assign: assign };
});
