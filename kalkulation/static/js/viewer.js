// 3D-Ansicht & Rendering mit Three.js
// Datenachsen: x = Breite, y = Tiefe (Front bei y<0), z = Höhe  →  Three: (x, z, -y), Einheit Meter
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const S = 0.001; // mm → m
const ACHSE_3 = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 0, -1), z: new THREE.Vector3(0, 1, 0) };
const IDX = { x: 0, y: 1, z: 2 };

function nachDaten(v) { return [v.x / S, -v.z / S, v.y / S]; }

// Prozedurale, in u-Richtung verlaufende Holzmaserung (kachelbar), wenn keine Textur hinterlegt ist
function holzTextur(farbe) {
  const n = 512, c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  const basis = {};
  new THREE.Color(farbe).getRGB(basis, THREE.SRGBColorSpace); // Canvas-Werte sind sRGB
  const img = g.createImageData(n, n);
  const zufall = (i) => Math.sin(i * 127.1) * 43758.5453 % 1;
  const wellen = [...Array(6)].map((_, i) => ({ f: 1 + i, p: Math.abs(zufall(i + 1)) * 6.28, a: 2 + Math.abs(zufall(i + 7)) * 6 }));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = y / n * 26 * Math.PI;
      for (const w of wellen) v += Math.sin((x / n) * 2 * Math.PI * w.f + w.p) * w.a * 0.045;
      const ring = 0.5 + 0.5 * Math.sin(v + 3 * Math.sin(y / n * 2 * Math.PI * 3));
      const fein = 0.5 + 0.5 * Math.sin(y / n * 2 * Math.PI * 61 + Math.sin(x / n * 2 * Math.PI * 2) * 2);
      const k = 0.9 + ring * 0.1 + fein * 0.04;
      const i = (y * n + x) * 4;
      img.data[i] = Math.min(255, basis.r * 255 * k);
      img.data[i + 1] = Math.min(255, basis.g * 255 * k * 0.98);
      img.data[i + 2] = Math.min(255, basis.b * 255 * k * 0.95);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// UVs eines Quaders so setzen, dass die Maserung entlang der Faserachse läuft und der
// Maßstab der realen Texturgröße entspricht.
function faserUVs(geo, teil, texMm) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  const c = [teil.pos[0] + teil.dim[0] / 2, teil.pos[1] + teil.dim[1] / 2, teil.pos[2] + teil.dim[2] / 2];
  const faser = IDX[teil.achsen.l];
  for (let i = 0; i < pos.count; i++) {
    const d = nachDaten(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    const w = [d[0] + c[0], d[1] + c[1], d[2] + c[2]];
    const n = nachDaten(new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i))).map(Math.abs);
    const normAchse = n.indexOf(Math.max(...n));
    const ebene = [0, 1, 2].filter((a) => a !== normAchse);
    let uA, vA;
    if (ebene.includes(faser)) { uA = faser; vA = ebene.find((a) => a !== faser); } else { [uA, vA] = ebene; }
    uv.setXY(i, w[uA] / texMm, w[vA] / texMm);
  }
  uv.needsUpdate = true;
}

export class Viewer {
  constructor(container, { beiAuswahl } = {}) {
    this.container = container;
    this.beiAuswahl = beiAuswahl;
    this.meshes = new Map();
    this.ausgeblendet = new Set();
    this.schnitt = { x: null, y: null, z: null };
    this.schnittUmkehren = { x: false, y: true, z: false };
    this.texCache = new Map();
    this.auswahl = null;
    this.ortho = false;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 0.85;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.localClippingEnabled = true;
    container.appendChild(r.domElement);

    const sc = (this.scene = new THREE.Scene());
    this.hintergrund = new THREE.Color("#eceae5");
    sc.background = this.hintergrund;
    const pmrem = new THREE.PMREMGenerator(r);
    sc.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    sc.environmentIntensity = 0.55;
    sc.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a4, 0.45));
    const sonne = (this.sonne = new THREE.DirectionalLight(0xfff6ea, 1.5));
    sonne.position.set(-1.2, 3, 2.2);
    sonne.castShadow = true;
    sonne.shadow.mapSize.set(2048, 2048);
    sonne.shadow.radius = 6;
    sonne.shadow.bias = -0.0004;
    sc.add(sonne, sonne.target);
    this.boden = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.22 }));
    this.boden.rotation.x = -Math.PI / 2;
    this.boden.receiveShadow = true;
    sc.add(this.boden);
    this.gruppe = new THREE.Group();
    sc.add(this.gruppe);

    this.perspCam = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    this.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    this.camera = this.perspCam;
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.ebenen = [];

    // Auswahl per Klick (nicht beim Drehen)
    let start = null;
    r.domElement.addEventListener("pointerdown", (e) => (start = [e.clientX, e.clientY]));
    r.domElement.addEventListener("pointerup", (e) => {
      if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 4) return;
      this.klick(e);
    });

    this.ro = new ResizeObserver(() => this.groesse());
    this.ro.observe(container);
    this.groesse();
    this.laeuft = true;
    const schleife = () => {
      if (!this.laeuft) return;
      this.controls.update();
      r.render(sc, this.camera);
      requestAnimationFrame(schleife);
    };
    schleife();
  }

  zerstoeren() {
    this.laeuft = false;
    this.ro.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  groesse() {
    const w = this.container.clientWidth || 600, h = this.container.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.perspCam.aspect = w / h;
    this.perspCam.updateProjectionMatrix();
    this.orthoAnpassen(w / h);
  }

  orthoAnpassen(aspekt) {
    const h = (this.groesseM || 1.5) * 0.75;
    Object.assign(this.orthoCam, { left: -h * aspekt, right: h * aspekt, top: h, bottom: -h });
    this.orthoCam.updateProjectionMatrix();
  }

  textur(platte) {
    if (platte.glas) return null;
    const key = (platte.textur || "") + "|" + platte.farbe + "|" + platte.faser;
    if (this.texCache.has(key)) return this.texCache.get(key);
    let t = null;
    if (platte.textur) {
      t = new THREE.TextureLoader().load("/texturen/" + platte.textur);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
    } else if (platte.faser) {
      t = holzTextur(platte.farbe || "#b98b5b");
    }
    this.texCache.set(key, t);
    return t;
  }

  material(platte) {
    const tex = this.textur(platte);
    const m = new THREE.MeshStandardMaterial({
      color: tex && platte.textur ? 0xffffff : tex ? 0xffffff : new THREE.Color(platte.farbe || "#dddddd"),
      map: tex,
      roughness: platte.rauheit ?? 0.6,
      metalness: 0,
      clippingPlanes: this.ebenen,
      clipShadows: true,
    });
    if (platte.glas) Object.assign(m, { transparent: true, opacity: 0.28, roughness: 0.05, color: new THREE.Color(platte.farbe || "#cfe6ea") });
    return m;
  }

  setTeile(bauteile, platten, { ansichtBehalten = true } = {}) {
    const pl = Object.fromEntries(platten.map((p) => [p.id, p]));
    for (const m of this.meshes.values()) { m.geometry.dispose(); m.material.dispose(); }
    this.gruppe.clear();
    this.meshes.clear();
    const kantenMat = new THREE.LineBasicMaterial({ color: 0x3a3530, transparent: true, opacity: 0.35, clippingPlanes: this.ebenen });
    for (const t of bauteile) {
      const p = pl[t.material] || { farbe: "#ff00ff" };
      const geo = new THREE.BoxGeometry(t.dim[0] * S, t.dim[2] * S, t.dim[1] * S);
      faserUVs(geo, t, p.textur_mm || 1000);
      const mesh = new THREE.Mesh(geo, this.material(p));
      mesh.position.set((t.pos[0] + t.dim[0] / 2) * S, (t.pos[2] + t.dim[2] / 2) * S, -(t.pos[1] + t.dim[1] / 2) * S);
      mesh.castShadow = !p.glas;
      mesh.receiveShadow = true;
      mesh.userData.teil = t;
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), kantenMat));
      mesh.visible = !this.ausgeblendet.has(t.key);
      this.gruppe.add(mesh);
      this.meshes.set(t.key, mesh);
    }
    const box = new THREE.Box3().setFromObject(this.gruppe);
    this.box = box.isEmpty() ? new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(0.6, 0.8, 0.6)) : box;
    this.groesseM = this.box.getSize(new THREE.Vector3()).length();
    this.orthoAnpassen(this.perspCam.aspect);
    const c = this.box.getCenter(new THREE.Vector3());
    this.sonne.target.position.copy(c);
    this.sonne.position.copy(c).add(new THREE.Vector3(-1.4, 2.6, 2.2).multiplyScalar(Math.max(1, this.groesseM)));
    const sh = this.sonne.shadow.camera, g = this.groesseM * 1.2;
    Object.assign(sh, { left: -g, right: g, top: g, bottom: -g, near: 0.1, far: 20 });
    sh.updateProjectionMatrix();
    if (!ansichtBehalten || !this.ersteAnsicht) { this.ansicht("iso"); this.ersteAnsicht = bauteile.length > 0; }
    if (this.auswahl && this.meshes.has(this.auswahl)) this.waehle(this.auswahl, false);
    else this.auswahl = null;
    this.schnittAnwenden();
  }

  ansicht(name) {
    const c = this.box.getCenter(new THREE.Vector3());
    const d = Math.max(this.groesseM, 0.5) * 1.9;
    const richt = { front: [0, 0, 1], seite: [1, 0, 0], links: [-1, 0, 0], oben: [0, 1, 0.0001], hinten: [0, 0, -1], iso: [0.75, 0.55, 1.1] }[name] || [0.75, 0.55, 1.1];
    const v = new THREE.Vector3(...richt).normalize().multiplyScalar(d);
    for (const cam of [this.perspCam, this.orthoCam]) {
      cam.position.copy(c).add(v);
      cam.up.set(0, 1, 0);
      cam.lookAt(c);
      cam.zoom = 1;
      cam.updateProjectionMatrix();
    }
    this.controls.target.copy(c);
    this.controls.update();
  }

  setOrtho(an) {
    this.ortho = an;
    const alt = this.camera;
    this.camera = an ? this.orthoCam : this.perspCam;
    this.camera.position.copy(alt.position);
    this.camera.quaternion.copy(alt.quaternion);
    this.controls.object = this.camera;
    this.controls.update();
  }

  setAusgeblendet(keys) {
    this.ausgeblendet = new Set(keys);
    for (const [k, m] of this.meshes) m.visible = !this.ausgeblendet.has(k);
  }

  setSchnitt(achse, wert, umkehren) {
    this.schnitt[achse] = wert;
    if (umkehren !== undefined) this.schnittUmkehren[achse] = umkehren;
    this.schnittAnwenden();
  }

  schnittAnwenden() {
    this.ebenen.length = 0;
    for (const a of ["x", "y", "z"]) {
      const w = this.schnitt[a];
      if (w === null || w === undefined) continue;
      const v = ACHSE_3[a];
      // behalten: Koordinate <= w (bzw. >= w bei Umkehrung)
      this.ebenen.push(this.schnittUmkehren[a] ? new THREE.Plane(v.clone(), -w * S) : new THREE.Plane(v.clone().negate(), w * S));
    }
  }

  klick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const maus = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(maus, this.camera);
    const treffer = ray.intersectObjects([...this.meshes.values()].filter((m) => m.visible), false)
      .filter((h) => this.ebenen.every((p) => p.distanceToPoint(h.point) >= -1e-6));
    const key = treffer.length ? treffer[0].object.userData.teil.key : null;
    this.waehle(key);
  }

  waehle(key, melden = true) {
    if (this.auswahl && this.meshes.has(this.auswahl)) this.meshes.get(this.auswahl).material.emissive.set(0x000000);
    this.auswahl = key;
    if (key && this.meshes.has(key)) this.meshes.get(key).material.emissive.set(0x2a5db0).multiplyScalar(0.55);
    if (melden && this.beiAuswahl) this.beiAuswahl(key);
  }

  // Hochauflösender Bildexport (PNG), optional mit transparentem Hintergrund
  bild({ breite = 2400, hoehe = 1600, transparent = false, ohneKanten = false } = {}) {
    const r = this.renderer;
    const alt = { w: r.domElement.width, h: r.domElement.height, pr: r.getPixelRatio() };
    const auswahl = this.auswahl;
    this.waehle(null, false);
    if (transparent) this.scene.background = null;
    if (ohneKanten) this.meshes.forEach((m) => (m.children[0].visible = false));
    r.setPixelRatio(1);
    r.setSize(breite, hoehe, false);
    this.perspCam.aspect = breite / hoehe;
    this.perspCam.updateProjectionMatrix();
    this.orthoAnpassen(breite / hoehe);
    r.render(this.scene, this.camera);
    const url = r.domElement.toDataURL("image/png");
    this.scene.background = this.hintergrund;
    this.meshes.forEach((m) => (m.children[0].visible = true));
    r.setPixelRatio(alt.pr);
    this.groesse();
    if (auswahl) this.waehle(auswahl, false);
    return url;
  }
}
