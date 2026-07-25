import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from 'gsap';

/* ------------------------------------------------------------------
   The room, in metres. Looking down from above:
     north (-z) = window wall      east (+x) = bed + posters
     south (+z) = door + wardrobe  west (-x) = desk, bookcase, shelves
------------------------------------------------------------------ */
const ROOM = { w: 3.5, d: 3.5, h: 2.8 };
const HW = ROOM.w / 2;
const HD = ROOM.d / 2;
const STORE_KEY = 'room-layout-v2';

const C = {
  wall: 0xf0ece5,
  ceiling: 0xf6f3ee,
  trim: 0xfbf9f6,
  floor: 0xcbbfa8,
  plank: 0xc2b59c,
  oak: 0xc9a271,       // light oak — desk, shelves, bookcase
  oakDark: 0xa8814f,
  brownDark: 0x5f462f, // wardrobe
  chair: 0x4a2f22,     // dark chairs
  seat: 0x7c5c46,
  bedBase: 0x8a7150,
  head: 0xa79a86,
  blanket: 0xb9b7b4,
  linen: 0xf2efe9,
  curtain: 0x8d7365,
  metal: 0x9fa4a8,
  door: 0xd9c9ab,
};

/* ------------------------------------------------------------------ */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14120f);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
/* Start where you stand in your own doorway, looking at the window:
   desk on the left, window in the middle, bed on the right. */
const HOME = { pos: new THREE.Vector3(-0.9, 1.72, 5.0), target: new THREE.Vector3(0.25, 1.15, -1.6) };
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.copy(HOME.target);
controls.minDistance = 1.0;
controls.maxDistance = 11;
controls.maxPolarAngle = Math.PI * 0.495;

/* ------------------------------------------------------------------
   Light — day through the window, or the warm ceiling bulb at night
------------------------------------------------------------------ */
const hemi = new THREE.HemisphereLight(0xffffff, 0x6a5c4a, 1.1);
scene.add(hemi);

const ambient = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffeed6, 2.4);
sun.position.set(-0.6, 3.4, -5.0);
sun.target.position.set(0, 0.8, 0.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 16;
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3.4, bottom: -1 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

const skyFill = new THREE.PointLight(0xdaeaff, 6, 6, 2);
skyFill.position.set(-0.1, 1.6, -HD + 0.5);
scene.add(skyFill);

const bulb = new THREE.PointLight(0xffd9a5, 0, 8, 2);
bulb.position.set(0, 2.62, 0);
scene.add(bulb);

/* ------------------------------------------------------------------
   Building blocks
------------------------------------------------------------------ */
function mat(color, rough = 0.85, metal = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function box(w, h, d, color, x = 0, y = 0, z = 0, rough) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, rough));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(r, h, color, x = 0, y = 0, z = 0, rough = 0.6, metal = 0.4) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mat(color, rough, metal));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/* Things stuck to a wall must vanish when that wall is between you and
   the room, otherwise they float in mid-air. */
const wallDecor = [];
function onWall(obj, normal, planePoint) {
  wallDecor.push({ obj, n: normal.clone(), p: (planePoint || obj.position).clone() });
  scene.add(obj);
  return obj;
}

/* Fixtures are part of the room — you can tap them, but not drag them. */
const fixtures = [];
function fixture(obj, name, desc) {
  obj.userData = { name, desc, fixed: true };
  fixtures.push(obj);
  return obj;
}
const N_NORTH = new THREE.Vector3(0, 0, 1);
const N_SOUTH = new THREE.Vector3(0, 0, -1);
const N_EAST = new THREE.Vector3(-1, 0, 0);
const N_WEST = new THREE.Vector3(1, 0, 0);

/* ------------------------------------------------------------------
   Shell — one box seen from the inside, so near walls disappear
------------------------------------------------------------------ */
const shellMats = [
  mat(C.wall), mat(C.wall),
  mat(C.ceiling), mat(C.floor, 0.75),
  mat(C.wall), mat(C.wall),
];
shellMats.forEach((m) => { m.side = THREE.BackSide; });

const shell = new THREE.Mesh(new THREE.BoxGeometry(ROOM.w, ROOM.h, ROOM.d), shellMats);
shell.position.y = ROOM.h / 2;
shell.receiveShadow = true;
scene.add(shell);

// floor planks running towards the door
const plankMat = mat(C.plank, 0.9);
for (let i = 1; i < 16; i++) {
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.012, ROOM.d), plankMat);
  line.rotation.x = -Math.PI / 2;
  line.position.set(-HW + i * (ROOM.w / 16), 0.003, 0);
  scene.add(line);
}

// white cornice where the walls meet the ceiling
const corniceY = ROOM.h - 0.07;
[[ROOM.w, 0, -HD + 0.05, N_NORTH], [ROOM.w, 0, HD - 0.05, N_SOUTH]].forEach(([w, x, z, n]) => {
  const c = box(w, 0.14, 0.1, C.trim, x, corniceY, z, 0.9);
  onWall(c, n);
});
[[-HW + 0.05, N_WEST], [HW - 0.05, N_EAST]].forEach(([x, n]) => {
  const c = box(0.1, 0.14, ROOM.d, C.trim, x, corniceY, 0, 0.9);
  onWall(c, n);
});

// ceiling light
const lampDisc = new THREE.Mesh(
  new THREE.CylinderGeometry(0.16, 0.19, 0.07, 24),
  new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: 0.4, emissive: 0xffd9a5, emissiveIntensity: 0 })
);
lampDisc.position.set(0, ROOM.h - 0.04, 0);
scene.add(lampDisc);

/* ------------------------------------------------------------------
   Window (north wall) + curtain
------------------------------------------------------------------ */
const WIN = { x: -0.1, w: 1.0, bottom: 0.9, top: 2.15, reveal: 0.26 };
const glassMat = new THREE.MeshStandardMaterial({
  color: 0xcfe4f2, roughness: 0.15, emissive: 0xbdd9ec, emissiveIntensity: 0.9,
});

const windowGroup = new THREE.Group();
{
  const h = WIN.top - WIN.bottom;
  const cy = (WIN.top + WIN.bottom) / 2;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w, h), glassMat);
  glass.position.set(WIN.x, cy, -HD + 0.01);
  windowGroup.add(glass);

  // the wall is thick, so the opening has a sill and side returns
  const rev = mat(C.trim, 0.9);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(WIN.w + 0.24, 0.06, WIN.reveal), rev);
  sill.position.set(WIN.x, WIN.bottom - 0.03, -HD + WIN.reveal / 2);
  sill.castShadow = true;
  sill.receiveShadow = true;
  windowGroup.add(sill);

  [-1, 1].forEach((s) => {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.1, h + 0.12, WIN.reveal), rev);
    jamb.position.set(WIN.x + s * (WIN.w / 2 + 0.05), cy, -HD + WIN.reveal / 2);
    jamb.castShadow = true;
    windowGroup.add(jamb);
  });
  const head = new THREE.Mesh(new THREE.BoxGeometry(WIN.w + 0.24, 0.1, WIN.reveal), rev);
  head.position.set(WIN.x, WIN.top + 0.05, -HD + WIN.reveal / 2);
  windowGroup.add(head);

  // white casement frame
  const fr = mat(C.trim, 0.7);
  [[WIN.w, 0.05, 0, -h / 2 + 0.02], [WIN.w, 0.05, 0, h / 2 - 0.02],
   [0.05, h, -WIN.w / 2 + 0.02, 0], [0.05, h, WIN.w / 2 - 0.02, 0],
   [0.04, h, 0.06, 0]].forEach(([w, hh, dx, dy]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 0.04), fr);
    b.position.set(WIN.x + dx, cy + dy, -HD + 0.03);
    windowGroup.add(b);
  });
}
onWall(windowGroup, N_NORTH, new THREE.Vector3(0, 0, -HD));
fixture(windowGroup, 'Window', 'In the middle of the far wall, between the desk and the bed. Deep sill because the wall is thick.');

const curtainGroup = new THREE.Group();
{
  const rod = cyl(0.014, 1.9, C.metal, 0, 0, 0, 0.4, 0.8);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(WIN.x - 0.2, 2.42, -HD + 0.12);
  curtainGroup.add(rod);

  // a gathered panel: a plane with a gentle wave pushed into its points
  const g = new THREE.PlaneGeometry(0.6, 1.72, 20, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, Math.sin(pos.getX(i) * 22) * 0.045);
  }
  g.computeVertexNormals();
  const panel = new THREE.Mesh(g, mat(C.curtain, 0.95));
  panel.castShadow = true;
  panel.position.set(WIN.x - 0.82, 1.56, -HD + 0.14);
  curtainGroup.add(panel);

  const panel2 = panel.clone();
  panel2.position.x = WIN.x + 0.82;
  curtainGroup.add(panel2);
}
onWall(curtainGroup, N_NORTH, new THREE.Vector3(0, 0, -HD));

/* ------------------------------------------------------------------
   Door (south wall)
------------------------------------------------------------------ */
const doorGroup = new THREE.Group();
{
  const DX = -0.5, DW = 0.86, DH = 2.08;
  const leaf = box(DW, DH, 0.05, C.door, DX, DH / 2, HD - 0.04, 0.8);
  doorGroup.add(leaf);
  for (let i = 1; i <= 5; i++) {
    doorGroup.add(box(DW - 0.1, 0.018, 0.01, 0x2a2622, DX, i * (DH / 6) + 0.14, HD - 0.07, 0.6));
  }
  const fr = mat(C.trim, 0.85);
  [[DW + 0.14, 0.07, DX, DH + 0.03], [0.07, DH + 0.07, DX - DW / 2 - 0.035, DH / 2],
   [0.07, DH + 0.07, DX + DW / 2 + 0.035, DH / 2]].forEach(([w, h, x, y]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.09), fr);
    b.position.set(x, y, HD - 0.05);
    b.castShadow = true;
    doorGroup.add(b);
  });
  const knob = cyl(0.028, 0.1, C.metal, DX - DW / 2 + 0.1, 1.05, HD - 0.11);
  knob.rotation.x = Math.PI / 2;
  doorGroup.add(knob);

  // light switch, at hand height, with a socket to its right
  doorGroup.add(box(0.086, 0.086, 0.014, 0xf3f0ea, 0.22, 0.92, HD - 0.02, 0.7));
  doorGroup.add(box(0.05, 0.05, 0.008, 0xe4e0d8, 0.22, 0.92, HD - 0.028, 0.7));
  doorGroup.add(box(0.086, 0.086, 0.014, 0xf3f0ea, 0.36, 0.92, HD - 0.02, 0.7));
  [-0.017, 0.017].forEach((dx) => {
    const hole = cyl(0.008, 0.01, 0x2c2924, 0.36 + dx, 0.92, HD - 0.028, 0.8, 0);
    hole.rotation.x = Math.PI / 2;
    doorGroup.add(hole);
  });
}
onWall(doorGroup, N_SOUTH, new THREE.Vector3(0, 0, HD));
fixture(doorGroup, 'Door', 'The way in. Straight ahead of you is the bookshelf, the built-in closet is on your right.');

/* ------------------------------------------------------------------
   Built-in closet — a recess in the door wall, so it takes no floor
   space. Doors shut, one of them mirrored.
------------------------------------------------------------------ */
const closetGroup = new THREE.Group();
{
  const X0 = 0.5, X1 = HW, W = X1 - X0, CX = (X0 + X1) / 2, H = 2.06;
  const zf = HD - 0.05;

  // recessed panel sitting in the wall
  closetGroup.add(box(W, H, 0.06, 0x3f2e1e, CX, H / 2, HD - 0.03, 0.85));

  // left-hand door (the +X half, as you face the closet) is the mirror
  const mirror = new THREE.Mesh(
    new THREE.PlaneGeometry(W / 2 - 0.05, H - 0.1),
    mat(0x8a969c, 0.06, 0.95)
  );
  mirror.position.set(CX + W / 4, H / 2, zf - 0.005);
  mirror.rotation.y = Math.PI;
  closetGroup.add(mirror);

  const leaf = box(W / 2 - 0.05, H - 0.1, 0.03, C.brownDark, CX - W / 4, H / 2, zf, 0.8);
  closetGroup.add(leaf);

  // dark wooden surround, standing a little proud of the wall like the real one
  const fr = mat(0x4a3624, 0.8);
  [[W + 0.08, 0.08, CX, H + 0.03], [0.08, H + 0.08, X0 - 0.03, H / 2], [0.05, H, CX, H / 2]]
    .forEach(([w, h, x, y]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.18), fr);
      b.position.set(x, y, HD - 0.09);
      b.castShadow = true;
      b.receiveShadow = true;
      closetGroup.add(b);
    });

  // two tall cupboard doors above it, up to the cornice
  const topH = ROOM.h - H - 0.16;
  closetGroup.add(box(W, topH, 0.09, 0x3f2e1e, CX, H + topH / 2 + 0.04, HD - 0.05, 0.85));
  [-1, 1].forEach((s) => {
    closetGroup.add(box(W / 2 - 0.05, topH - 0.06, 0.03, C.brownDark, CX + s * W / 4, H + topH / 2 + 0.04, HD - 0.1, 0.8));
  });
  closetGroup.add(box(0.02, topH - 0.06, 0.04, 0x2f2216, CX, H + topH / 2 + 0.04, HD - 0.11, 0.8));
  [-0.06, 0.06].forEach((dx) => closetGroup.add(cyl(0.012, 0.1, C.metal, CX + dx, H + 0.16, HD - 0.13)));
  [-0.1, 0.1].forEach((dx) => closetGroup.add(cyl(0.012, 0.14, C.metal, CX + dx, H / 2, zf - 0.03)));
}
onWall(closetGroup, N_SOUTH, new THREE.Vector3(0, 0, HD));
fixture(closetGroup, 'Closet', 'Built into the wall next to the door, so it takes no floor space. Sliding doors, one mirrored — shut.');

/* socket on the wall between the bed and the closet, low down */
const bedSocket = new THREE.Group();
{
  bedSocket.add(box(0.014, 0.086, 0.086, 0xf3f0ea, HW - 0.01, 0.2, 1.05, 0.7));
  [-0.017, 0.017].forEach((dz) => {
    const hole = cyl(0.008, 0.01, 0x2c2924, HW - 0.019, 0.2, 1.05 + dz, 0.8, 0);
    hole.rotation.z = Math.PI / 2;
    bedSocket.add(hole);
  });
}
onWall(bedSocket, N_EAST, new THREE.Vector3(HW, 0, 0));

/* ------------------------------------------------------------------
   Posters — drawn on the fly, no image files needed
------------------------------------------------------------------ */
function poster(draw, w, h, x, y, z, normal, res = 240) {
  const c = document.createElement('canvas');
  c.width = res;
  c.height = Math.round(res * (h / w));
  draw(c.getContext('2d'), c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  m.position.set(x, y, z);
  if (normal === N_EAST) m.rotation.y = -Math.PI / 2;
  else if (normal === N_WEST) m.rotation.y = Math.PI / 2;
  else if (normal === N_SOUTH) m.rotation.y = Math.PI;
  onWall(m, normal);
  return m;
}

const fill = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

// big cyan/blue anime print
poster((g, w, h) => {
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#101a3a'); grad.addColorStop(1, '#2a1140');
  fill(g, grad, 0, 0, w, h);
  g.fillStyle = '#38e0d8';
  g.beginPath(); g.ellipse(w * 0.52, h * 0.38, w * 0.34, h * 0.26, -0.5, 0, 7); g.fill();
  g.fillStyle = '#0d1230';
  g.beginPath(); g.ellipse(w * 0.5, h * 0.42, w * 0.22, h * 0.17, -0.4, 0, 7); g.fill();
  g.fillStyle = '#ff5aa8';
  g.beginPath(); g.moveTo(w * 0.1, h); g.lineTo(w * 0.45, h * 0.6); g.lineTo(w * 0.6, h); g.fill();
  g.strokeStyle = 'rgba(120,220,255,0.55)'; g.lineWidth = 2;
  for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(0, h * (0.62 + i * 0.05)); g.lineTo(w, h * (0.58 + i * 0.05)); g.stroke(); }
}, 0.62, 0.9, HW - 0.02, 1.95, 0.95, N_EAST);

// red poster
poster((g, w, h) => {
  fill(g, '#c0342b', 0, 0, w, h);
  fill(g, '#1c1c1c', w * 0.18, h * 0.16, w * 0.5, h * 0.55);
  g.fillStyle = '#e8ded0';
  g.beginPath(); g.arc(w * 0.42, h * 0.3, w * 0.13, 0, 7); g.fill();
  fill(g, '#f3e9d8', w * 0.1, h * 0.8, w * 0.8, h * 0.05);
  fill(g, '#f3e9d8', w * 0.1, h * 0.89, w * 0.55, h * 0.04);
}, 0.42, 0.58, HW - 0.02, 2.02, 0.42, N_EAST);

// two small paintings
poster((g, w, h) => {
  fill(g, '#f4efe4', 0, 0, w, h);
  ['#e2622f', '#d8a13a', '#7a3f8c', '#2f7a6b'].forEach((c, i) => {
    g.fillStyle = c;
    g.beginPath(); g.ellipse(w * (0.25 + i * 0.17), h * (0.4 + (i % 2) * 0.2), w * 0.19, h * 0.16, i, 0, 7); g.fill();
  });
}, 0.34, 0.26, HW - 0.02, 1.76, 0.2, N_EAST);

poster((g, w, h) => {
  fill(g, '#f0d979', 0, 0, w, h);
  g.fillStyle = '#2f5fd0';
  g.beginPath(); g.ellipse(w * 0.5, h * 0.62, w * 0.22, h * 0.3, 0, 0, 7); g.fill();
  g.beginPath(); g.arc(w * 0.5, h * 0.26, w * 0.13, 0, 7); g.fill();
  g.fillStyle = '#d84a4a';
  g.beginPath(); g.arc(w * 0.7, h * 0.3, w * 0.1, 0, 7); g.fill();
}, 0.3, 0.26, HW - 0.02, 1.76, -0.15, N_EAST);

// the scratch-off anime grid — right above the pillows, so it's over your
// head when you're lying down
poster((g, w, h) => {
  fill(g, '#1a1a1c', 0, 0, w, h);
  fill(g, '#e6e2da', w * 0.08, h * 0.05, w * 0.84, h * 0.07);
  const cols = 8, rows = 11;
  for (let r = 0; r < rows; r++) for (let c2 = 0; c2 < cols; c2++) {
    const hue = ((r * cols + c2) * 37) % 360;
    g.fillStyle = `hsl(${hue} 55% ${45 + ((r + c2) % 3) * 8}%)`;
    g.fillRect(w * (0.07 + c2 * 0.108), h * (0.16 + r * 0.073), w * 0.09, h * 0.06);
  }
}, 0.42, 0.58, 1.07, 1.82, -HD + 0.02, N_NORTH);

// small calendar + print near the bed head
poster((g, w, h) => {
  fill(g, '#faf7f0', 0, 0, w, h);
  fill(g, '#3d6b4a', 0, 0, w, h * 0.3);
  g.fillStyle = '#c9c4bb';
  for (let r = 0; r < 5; r++) for (let c2 = 0; c2 < 7; c2++) g.fillRect(w * (0.08 + c2 * 0.125), h * (0.4 + r * 0.11), w * 0.08, h * 0.07);
}, 0.24, 0.3, HW - 0.02, 1.74, -1.4, N_EAST);

// Evangelion pair, left of the door
poster((g, w, h) => {
  fill(g, '#e8dccb', 0, 0, w, h);
  g.fillStyle = '#d94f3d';
  g.beginPath(); g.ellipse(w * 0.36, h * 0.55, w * 0.2, h * 0.34, 0.2, 0, 7); g.fill();
  g.fillStyle = '#2f4fa0';
  g.beginPath(); g.ellipse(w * 0.68, h * 0.6, w * 0.17, h * 0.3, -0.2, 0, 7); g.fill();
  fill(g, '#1d1d1d', w * 0.06, h * 0.06, w * 0.88, h * 0.09);
}, 0.34, 0.46, 0.22, 1.66, HD - 0.02, N_SOUTH);

poster((g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#2b57b8'); grad.addColorStop(0.55, '#7fb3e8'); grad.addColorStop(1, '#e9d98a');
  fill(g, grad, 0, 0, w, h);
  g.fillStyle = '#f6f1e2';
  g.beginPath(); g.moveTo(w * 0.2, h); g.lineTo(w * 0.5, h * 0.42); g.lineTo(w * 0.82, h); g.fill();
}, 0.3, 0.42, 0.95, 1.62, HD - 0.13, N_SOUTH);

// sticker cluster under them
poster((g, w, h) => {
  fill(g, '#efece6', 0, 0, w, h);
  const cs = ['#d95f5f', '#4f8fd9', '#d9b14f', '#6fbf7a', '#a06fc4', '#e08a4f'];
  cs.forEach((c, i) => { g.fillStyle = c; g.fillRect(w * (0.04 + (i % 3) * 0.32), h * (0.08 + Math.floor(i / 3) * 0.46), w * 0.28, h * 0.4); });
}, 0.32, 0.16, 0.22, 1.3, HD - 0.02, N_SOUTH);

/* a few more prints on the other side of the door */
poster((g, w, h) => {
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#1d2f5c'); grad.addColorStop(1, '#8e3f6b');
  fill(g, grad, 0, 0, w, h);
  g.fillStyle = '#f2c14e';
  g.beginPath(); g.arc(w * 0.62, h * 0.3, w * 0.18, 0, 7); g.fill();
  g.fillStyle = '#12172c';
  g.beginPath(); g.moveTo(0, h); g.lineTo(w * 0.35, h * 0.5); g.lineTo(w * 0.7, h); g.fill();
}, 0.36, 0.5, -1.22, 1.72, HD - 0.02, N_SOUTH);

poster((g, w, h) => {
  fill(g, '#f6f1e6', 0, 0, w, h);
  g.fillStyle = '#c8433a';
  g.beginPath(); g.ellipse(w * 0.5, h * 0.45, w * 0.3, h * 0.28, 0.3, 0, 7); g.fill();
  g.fillStyle = '#2f4f8f';
  for (let i = 0; i < 4; i++) g.fillRect(w * 0.12, h * (0.72 + i * 0.06), w * (0.7 - i * 0.12), h * 0.035);
}, 0.28, 0.36, -1.58, 1.28, HD - 0.02, N_SOUTH);

poster((g, w, h) => {
  fill(g, '#20232b', 0, 0, w, h);
  const cs = ['#e8574f', '#4f8fe8', '#5fbf6a', '#e8b07a'];
  cs.forEach((c, i) => {
    g.fillStyle = c;
    g.beginPath(); g.arc(w * (0.25 + (i % 2) * 0.5), h * (0.28 + Math.floor(i / 2) * 0.44), w * 0.16, 0, 7); g.fill();
  });
}, 0.26, 0.3, -1.55, 1.78, HD - 0.02, N_SOUTH);

/* trig tables taped to the wall under the shelves */
poster((g, w, h) => {
  fill(g, '#fbf8f0', 0, 0, w, h);
  g.fillStyle = '#1f1c19';
  g.font = 'bold 26px Inter, sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText('sin · cos · tg · ctg', 16, 26);

  const fmt = (v) => (!isFinite(v) || Math.abs(v) > 99 ? '∞' : v.toFixed(2));
  const rows = ['°', 'sin', 'cos', 'tg', 'ctg'];
  const blocks = [
    Array.from({ length: 13 }, (_, i) => i * 15),
    Array.from({ length: 12 }, (_, i) => 195 + i * 15),
  ];
  g.font = '17px Inter, sans-serif';
  blocks.forEach((angles, bi) => {
    const top = 56 + bi * 172;
    const colW = (w - 100) / angles.length;
    rows.forEach((label, r) => {
      const y = top + r * 32;
      g.fillStyle = r === 0 ? '#1f1c19' : '#4a453f';
      g.textAlign = 'right';
      g.fillText(label, 78, y);
      g.textAlign = 'center';
      angles.forEach((a, ci) => {
        const rad = (a * Math.PI) / 180;
        const val = r === 0 ? String(a)
          : r === 1 ? fmt(Math.sin(rad))
          : r === 2 ? fmt(Math.cos(rad))
          : r === 3 ? fmt(Math.tan(rad))
          : fmt(1 / Math.tan(rad));
        g.fillText(val, 96 + colW * (ci + 0.5), y);
      });
    });
    g.strokeStyle = '#cfc7b8';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(20, top + 16); g.lineTo(w - 20, top + 16); g.stroke();
  });
}, 0.62, 0.4, -HW + 0.02, 1.02, -0.5, N_WEST, 900);

/* ------------------------------------------------------------------
   Furniture you can pick up and move
------------------------------------------------------------------ */
const items = [];

function addItem(name, desc, builder, x, z, rotY = 0) {
  const g = builder();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  g.userData = { name, desc, id: name.toLowerCase().replace(/\s+/g, '-') };
  scene.add(g);
  items.push(g);
  return g;
}

// half-size of a piece as it sits right now, used to keep it inside the walls
function halfSize(obj) {
  const bb = new THREE.Box3().setFromObject(obj);
  return { x: (bb.max.x - bb.min.x) / 2, z: (bb.max.z - bb.min.z) / 2 };
}

/* Bed — 1.3 × 2.1, headboard at the -z (window) end */
function buildBed() {
  const g = new THREE.Group();
  const W = 1.3, L = 2.1;
  g.add(box(W, 0.36, L, C.bedBase, 0, 0.18, 0, 0.8));           // storage base
  g.add(box(W - 0.04, 0.2, L - 0.06, C.linen, 0, 0.46, 0));      // mattress
  // grey ribbed blanket
  const bl = box(W + 0.03, 0.09, L * 0.72, C.blanket, 0, 0.55, L * 0.13, 0.95);
  g.add(bl);
  for (let i = 0; i < 16; i++) {
    g.add(box(W + 0.035, 0.012, 0.03, 0xa9a7a4, 0, 0.598, -L * 0.22 + i * 0.09, 0.95));
  }
  // pillows at the window end
  g.add(box(0.56, 0.13, 0.34, 0xfaf7f1, -0.3, 0.61, -L / 2 + 0.28));
  g.add(box(0.56, 0.13, 0.34, 0xfaf7f1, 0.3, 0.61, -L / 2 + 0.28));
  // padded headboard, three panels
  g.add(box(W + 0.06, 0.66, 0.09, C.head, 0, 0.86, -L / 2 - 0.03, 0.95));
  for (let i = -1; i <= 1; i++) {
    g.add(box(W / 3 - 0.05, 0.5, 0.05, 0xb6a894, i * (W / 3), 0.9, -L / 2 - 0.06, 0.95));
  }
  return g;
}

/* A wire that sags between two points */
function cable(pts, color = 0x2b2b2b, r = 0.006) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, r, 6, false), mat(color, 0.9));
  m.castShadow = true;
  return m;
}

/* Desk: laptop faces the chair, drawer handle on the working side, and
   all the stuff that actually lives on it. */
function buildDesk() {
  const g = new THREE.Group();
  const L = 1.7, D = 0.6;
  const TOP = 0.775;                    // surface height
  g.add(box(D, 0.05, L, C.oak, 0, 0.75, 0, 0.7));
  g.add(box(D - 0.06, 0.66, 0.52, C.oak, 0.02, 0.4, -0.5, 0.75));   // open bay — no handle, nothing in it
  g.add(box(D - 0.06, 0.66, 0.5, C.oak, 0.02, 0.4, 0.55, 0.75));    // the drawer unit
  g.add(box(0.02, 0.03, 0.2, C.metal, D / 2 - 0.01, 0.6, 0.55));     // its handle, on the room side
  g.add(box(0.06, 0.7, 0.04, C.oakDark, 0, 0.37, L / 2 - 0.02, 0.8));

  /* laptop — turned a quarter so the screen faces the chair (+x) */
  const lap = new THREE.Group();
  lap.add(box(0.28, 0.016, 0.21, 0x2f3338, 0, TOP + 0.008, 0));
  const lid = box(0.28, 0.2, 0.012, 0x3a4046, 0, TOP + 0.105, -0.115);
  lid.rotation.x = 0.28;
  const screen = box(0.26, 0.18, 0.004, 0x1b2b3a, 0, TOP + 0.105, -0.108);
  screen.rotation.x = 0.28;
  lap.add(lid, screen);
  lap.rotation.y = Math.PI / 2;
  lap.position.set(0.0, 0, -0.42);
  g.add(lap);

  /* anime mousepad + black mouse */
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), (() => {
    const c = document.createElement('canvas');
    c.width = 176; c.height = 240;
    const x = c.getContext('2d');
    const grad = x.createLinearGradient(0, 0, 176, 240);
    grad.addColorStop(0, '#f2a6c4'); grad.addColorStop(1, '#5b4f8f');
    x.fillStyle = grad; x.fillRect(0, 0, 176, 240);
    x.fillStyle = '#fdf6ef';
    x.beginPath(); x.arc(88, 96, 44, 0, 7); x.fill();
    x.fillStyle = '#2b2233';
    x.beginPath(); x.ellipse(88, 62, 46, 30, 0, 0, 7); x.fill();
    x.fillStyle = '#3f6fd8';
    x.beginPath(); x.arc(72, 100, 9, 0, 7); x.fill();
    x.beginPath(); x.arc(106, 100, 9, 0, 7); x.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  })());
  pad.rotation.x = -Math.PI / 2;
  pad.rotation.z = Math.PI / 2;
  pad.position.set(0.04, TOP + 0.002, -0.05);
  g.add(pad);

  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), mat(0x22242a, 0.5));
  mouse.scale.set(0.75, 0.5, 1.15);
  mouse.position.set(0.04, TOP + 0.017, -0.05);
  mouse.castShadow = true;
  g.add(mouse);
  g.add(cable([[0.04, TOP + 0.02, -0.13], [0.02, TOP + 0.03, -0.26], [-0.02, TOP + 0.02, -0.4]], 0x1f1f1f, 0.004));

  /* pink Red Bull */
  g.add(cyl(0.032, 0.135, 0xe86aa0, -0.14, TOP + 0.068, -0.72, 0.35, 0.55));
  g.add(cyl(0.028, 0.008, 0xb9bcc0, -0.14, TOP + 0.139, -0.72, 0.3, 0.8));

  /* half-drunk Pepsi Zero — you can see where the drink stops */
  g.add(cyl(0.035, 0.1, 0x141922, -0.16, TOP + 0.05, 0.2, 0.25, 0.1));
  const empty = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 18),
    new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.1, transparent: true, opacity: 0.4 }));
  empty.position.set(-0.16, TOP + 0.15, 0.2);
  g.add(empty);
  g.add(cyl(0.014, 0.04, 0x1b4fa0, -0.16, TOP + 0.22, 0.2, 0.4));
  g.add(cyl(0.036, 0.03, 0x2f6fd0, -0.16, TOP + 0.05, 0.2, 0.5));

  /* mini pink fan, plugged into the laptop */
  const fan = new THREE.Group();
  fan.add(cyl(0.045, 0.02, 0xe07aa8, 0, TOP + 0.01, 0, 0.6));
  fan.add(cyl(0.008, 0.07, 0xe07aa8, 0, TOP + 0.055, 0, 0.6));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 8, 20), mat(0xf0a8c6, 0.6));
  ring.position.set(0, TOP + 0.11, 0);
  ring.rotation.y = Math.PI / 2;
  fan.add(ring);
  for (let i = 0; i < 5; i++) {
    const blade = box(0.004, 0.04, 0.018, 0xfbd6e5, 0, TOP + 0.11, 0, 0.5);
    blade.rotation.x = (i / 5) * Math.PI * 2;
    blade.position.y = TOP + 0.11 + Math.cos((i / 5) * Math.PI * 2) * 0.024;
    blade.position.z = Math.sin((i / 5) * Math.PI * 2) * 0.024;
    fan.add(blade);
  }
  fan.position.set(-0.16, 0, -0.24);
  g.add(fan);
  g.add(cable([[-0.16, TOP + 0.01, -0.24], [-0.12, TOP + 0.01, -0.33], [-0.06, TOP + 0.02, -0.4]], 0xf0a8c6, 0.004));

  /* socket under the desk, with the charger running up to the laptop */
  g.add(box(0.014, 0.086, 0.086, 0xf3f0ea, -D / 2 + 0.007, 0.25, -0.2, 0.7));
  [-0.017, 0.017].forEach((dz) => {
    const hole = cyl(0.008, 0.01, 0x2c2924, -D / 2 + 0.016, 0.25, -0.2 + dz, 0.8, 0);
    hole.rotation.z = Math.PI / 2;
    g.add(hole);
  });
  g.add(box(0.05, 0.045, 0.05, 0x2a2a2a, -D / 2 + 0.05, 0.25, -0.2, 0.85));
  g.add(cable([
    [-D / 2 + 0.075, 0.25, -0.2], [-0.16, 0.12, -0.3], [-0.2, 0.3, -0.45],
    [-0.24, 0.62, -0.5], [-0.16, TOP + 0.02, -0.5], [-0.08, TOP + 0.012, -0.46],
  ], 0x1f1f1f, 0.005));

  return g;
}

/* Tall bookcase with cupboard doors at the bottom */
function buildBookcase() {
  const g = new THREE.Group();
  const W = 0.92, H = 2.12, D = 0.4;
  g.add(box(D, H, 0.05, C.oak, 0, H / 2, -W / 2, 0.8));
  g.add(box(D, H, 0.05, C.oak, 0, H / 2, W / 2, 0.8));
  g.add(box(0.04, H, W, C.oakDark, -D / 2, H / 2, 0, 0.85));
  [0.02, 0.72, 1.1, 1.48, 1.86, H - 0.02].forEach((y) => g.add(box(D, 0.04, W, C.oak, 0, y, 0, 0.8)));
  // cupboard doors
  g.add(box(0.03, 0.66, W / 2 - 0.02, C.oak, D / 2 - 0.01, 0.38, -W / 4, 0.7));
  g.add(box(0.03, 0.66, W / 2 - 0.02, C.oak, D / 2 - 0.01, 0.38, W / 4, 0.7));
  g.add(cyl(0.012, 0.12, C.metal, D / 2 + 0.01, 0.6, -0.06));
  g.add(cyl(0.012, 0.12, C.metal, D / 2 + 0.01, 0.6, 0.06));
  // books
  const spines = [0xb0453f, 0x2f5f9e, 0xd6a83c, 0x477a4e, 0x8a4a9c, 0x2f2f2f, 0xc96a3a, 0x4f7f9e];
  [0.76, 1.14, 1.52, 1.9].forEach((y, row) => {
    for (let i = 0; i < 11; i++) {
      const hgt = 0.24 + ((i + row) % 3) * 0.04;
      g.add(box(0.2, hgt, 0.035, spines[(i + row * 3) % spines.length], -0.06, y + hgt / 2, -W / 2 + 0.08 + i * 0.07, 0.9));
    }
  });
  return g;
}

/* Long wall shelves above the desk */
function buildShelves() {
  const g = new THREE.Group();
  const L = 1.75, D = 0.28;
  [1.26, 1.63, 2.0].forEach((y, k) => {
    const len = k === 2 ? L * 0.8 : L;
    g.add(box(D, 0.035, len, C.oak, 0, y, 0, 0.8));
    if (k < 2) g.add(box(0.03, 0.34, len, C.oak, -D / 2 + 0.02, y + 0.19, 0, 0.85));
  });
  g.add(box(D, 0.36, 0.03, C.oak, 0, 1.45, -L / 2 + 0.02, 0.8));
  g.add(box(D, 0.36, 0.03, C.oak, 0, 1.45, 0.1, 0.8));
  // stuff on the shelves
  const spines = [0x9e4038, 0x35608f, 0xc99a35, 0x3f7048, 0x7a4090, 0x2b2b2b];
  for (let i = 0; i < 13; i++) {
    const hgt = 0.2 + (i % 3) * 0.04;
    g.add(box(0.16, hgt, 0.03, spines[i % spines.length], -0.02, 1.295 + hgt / 2, -L / 2 + 0.1 + i * 0.06, 0.9));
  }
  for (let i = 0; i < 8; i++) {
    g.add(box(0.14, 0.14, 0.11, [0x6fa8c9, 0xd98f5a, 0xd0d4c8, 0x9a7fc0][i % 4], -0.02, 1.72, -L / 2 + 0.16 + i * 0.17, 0.85));
  }
  /* Saya, 1/7 scale — about 22 cm tall with the base */
  const saya = new THREE.Group();
  {
    const skin = 0xf6dfd2, dress = 0xf7f4ee, hair = 0x2b2230;
    saya.add(cyl(0.045, 0.012, 0x1e1c22, 0, 0.006, 0, 0.4, 0.2));      // display base
    saya.add(cyl(0.014, 0.055, skin, -0.012, 0.04, 0, 0.7, 0));         // legs
    saya.add(cyl(0.014, 0.055, skin, 0.012, 0.04, 0, 0.7, 0));
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.075, 14), mat(dress, 0.85));
    skirt.position.y = 0.105;
    saya.add(skirt);
    saya.add(cyl(0.026, 0.06, dress, 0, 0.165, 0, 0.85, 0));            // body
    saya.add(cyl(0.009, 0.055, skin, -0.032, 0.165, 0, 0.7, 0));        // arms
    saya.add(cyl(0.009, 0.055, skin, 0.032, 0.165, 0, 0.7, 0));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), mat(skin, 0.7));
    head.position.y = 0.222;
    saya.add(head);
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.029, 16, 12), mat(hair, 0.6));
    bob.position.set(0, 0.229, -0.004);
    bob.scale.set(1, 1, 1.05);
    saya.add(bob);
    // the long hair down her back
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, 0.1, 4, 10), mat(hair, 0.6));
    tail.position.set(0, 0.16, -0.026);
    saya.add(tail);
    saya.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  saya.position.set(0.02, 1.278, 0.62);
  saya.rotation.y = -Math.PI / 2;
  g.add(saya);

  /* medicine on the first shelf */
  g.add(box(0.1, 0.075, 0.05, 0xf2f4f6, 0.0, 1.316, 0.16, 0.85));      // white box
  g.add(box(0.02, 0.05, 0.04, 0x3f8fd0, 0.041, 1.316, 0.16, 0.7));     // blue stripe on it
  g.add(box(0.09, 0.06, 0.042, 0xe4dbc9, 0.0, 1.308, 0.245, 0.85));    // cardboard box
  g.add(box(0.086, 0.014, 0.038, 0xc4553f, 0.0, 1.332, 0.245, 0.8));
  const bottle = cyl(0.022, 0.075, 0xd8752f, 0.0, 1.316, 0.33, 0.5, 0);
  g.add(bottle);
  g.add(cyl(0.014, 0.014, 0xf0ece4, 0.0, 1.36, 0.33, 0.7, 0));         // white cap
  // blister pack
  const blister = box(0.06, 0.006, 0.09, 0xe8eef2, 0.0, 1.281, 0.43, 0.6);
  g.add(blister);
  for (let i = 0; i < 4; i++) {
    g.add(cyl(0.007, 0.008, 0xc9cdd2, -0.012 + (i % 2) * 0.024, 1.288, 0.41 + Math.floor(i / 2) * 0.03, 0.5, 0.3));
  }

  // vase with dried flowers on top
  g.add(cyl(0.05, 0.18, 0x8a8f86, 0, 2.11, 0.35, 0.8, 0.1));
  [[-0.05, 0.3], [0.03, 0.42], [0, 0.36]].forEach(([dz, dx], i) => {
    const stem = cyl(0.006, 0.3, 0x6b7a4a, dx * 0 + 0, 2.32 + i * 0.02, 0.35 + dz, 0.9, 0);
    stem.rotation.x = (i - 1) * 0.15;
    g.add(stem);
    g.add(box(0.05, 0.05, 0.05, [0xd9a441, 0xc4726f, 0xb08fc0][i], 0, 2.47 + i * 0.02, 0.35 + dz * 1.8, 0.9));
  });
  return g;
}

/* Dark wooden chair with the tall slatted back */
function buildChair() {
  const g = new THREE.Group();
  g.add(box(0.44, 0.05, 0.44, C.seat, 0, 0.45, 0, 0.9));
  g.add(box(0.44, 0.04, 0.06, C.chair, 0, 0.72, -0.2));
  g.add(box(0.44, 0.04, 0.06, C.chair, 0, 0.98, -0.2));
  for (let i = -2; i <= 2; i++) g.add(box(0.03, 0.28, 0.04, C.chair, i * 0.09, 0.85, -0.2));
  [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]].forEach(([x, z], i) => {
    const h = i < 2 ? 0.98 : 0.44;
    g.add(box(0.045, h, 0.045, C.chair, x, h / 2, z));
  });
  return g;
}

const bed = addItem('Bed', 'Head against the window wall, running down the right-hand side. Grey ribbed blanket, storage drawers underneath.',
  buildBed, HW - 0.68, -HD + 1.14);

const desk = addItem('Desk', 'Light oak, pushed up towards the window. Laptop facing the chair, fan and charger plugged in.',
  buildDesk, -HW + 0.3, -0.8);

const bookcase = addItem('Bookcase', 'Tall oak bookcase — manga, folders and medals, cupboards at the bottom.',
  buildBookcase, -HW + 0.23, 0.95);

const shelves = addItem('Wall shelves', 'Three long boards above the desk: books, medicine, the Saya figure, dried flowers on top.',
  buildShelves, -HW + 0.14, -0.85);

const chair = addItem('Desk chair', 'Dark wood with the tall slatted back, pulled up to the desk facing the laptop.',
  buildChair, -HW + 0.95, -0.8, -Math.PI / 2);

items.forEach((i) => { i.userData.half = halfSize(i); });

/* ------------------------------------------------------------------
   Name tags — only shown in the top-down plan
------------------------------------------------------------------ */
function makeTag(text, ink = '#f4efe8', wide = 0.62) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(18,16,14,0.85)';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = ink;
  g.font = '700 34px Inter, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  spr.scale.set(wide, wide / 4, 1);
  return spr;
}

const labels = [];
function addLabel(text, anchor) {
  const spr = makeTag(text);
  spr.visible = false;
  scene.add(spr);
  labels.push({ spr, anchor });
  return spr;
}

items.forEach((i) => addLabel(i.userData.name, i.position));
addLabel('Window', new THREE.Vector3(WIN.x, 0, -HD + 0.3));
addLabel('Door', new THREE.Vector3(-0.5, 0, HD - 0.3));
addLabel('Closet', new THREE.Vector3(1.12, 0, HD - 0.3));

/* ------------------------------------------------------------------
   Measuring grid — zero is the middle of the floor.
   X runs left/right, Z runs towards the door, Y is up. In metres.
------------------------------------------------------------------ */
const AX = { x: '#e8574f', y: '#5fbf6a', z: '#4f8fe8' };
const axesGroup = new THREE.Group();
axesGroup.visible = false;
{
  const bar = (w, h, d, hex) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ color: hex }));
    m.position.y = 0.02;
    return m;
  };
  axesGroup.add(bar(ROOM.w, 0.016, 0.016, AX.x));
  axesGroup.add(bar(0.016, 0.016, ROOM.d, AX.z));
  const up = bar(0.016, ROOM.h - 0.1, 0.016, AX.y);
  up.position.y = (ROOM.h - 0.1) / 2;
  axesGroup.add(up);

  // half-metre grid on the floor
  const grid = new THREE.GridHelper(ROOM.w, ROOM.w / 0.5, 0x8a8378, 0x5b554d);
  grid.position.y = 0.006;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  axesGroup.add(grid);

  const put = (t, ink, x, y, z, w) => {
    const s = makeTag(t, ink, w);
    s.position.set(x, y, z);
    axesGroup.add(s);
  };
  put('+X', AX.x, HW - 0.22, 0.2, 0, 0.44);
  put('−X', AX.x, -HW + 0.22, 0.2, 0, 0.44);
  put('+Z', AX.z, 0, 0.2, HD - 0.22, 0.44);
  put('−Z', AX.z, 0, 0.2, -HD + 0.22, 0.44);
  put('+Y', AX.y, 0, ROOM.h - 0.16, 0, 0.44);
  put('0,0', '#f4efe8', 0.18, 0.16, 0.18, 0.4);
  // one-metre marks
  [1, -1].forEach((v) => {
    put(`${v}`, AX.x, v, 0.13, 0.16, 0.3);
    put(`${v}`, AX.z, 0.16, 0.13, v, 0.3);
  });
  // which wall is which
  put('wall +X', AX.x, HW - 0.06, 1.7, 0, 0.72);
  put('wall −X', AX.x, -HW + 0.06, 1.7, 0, 0.72);
  put('wall +Z', AX.z, 0, 1.9, HD - 0.06, 0.72);
  put('wall −Z', AX.z, 0, 2.35, -HD + 0.06, 0.72);
}
scene.add(axesGroup);

/* ------------------------------------------------------------------
   Selection
------------------------------------------------------------------ */
const outline = new THREE.Box3Helper(new THREE.Box3(), 0xe8b07a);
outline.visible = false;
scene.add(outline);

let selected = null;

const num = (v) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2);

function showCoords(item) {
  const bb = new THREE.Box3().setFromObject(item);
  const c = bb.getCenter(new THREE.Vector3());
  cardCoords.textContent = `x ${num(c.x)}  ·  z ${num(c.z)}  ·  ${(bb.max.x - bb.min.x).toFixed(2)} × ${(bb.max.z - bb.min.z).toFixed(2)} m`;
  cardCoords.hidden = false;
}

function updateOutline() {
  if (!selected) return;
  outline.box.setFromObject(selected).expandByScalar(0.03);
}

function select(item) {
  selected = item;
  if (!item) {
    outline.visible = false;
    card.hidden = true;
    cardCoords.hidden = true;
    return;
  }
  outline.visible = true;
  updateOutline();
  actRotate.hidden = mode !== 'move' || !!item.userData.fixed;
  cardTitle.textContent = item.userData.name;
  cardDesc.textContent = item.userData.desc;
  showCoords(item);
  card.hidden = false;
  gsap.fromTo(card, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out' });
}

/* ------------------------------------------------------------------
   Camera moves
------------------------------------------------------------------ */
function flyTo(pos, target, duration = 1.2) {
  gsap.to(camera.position, { x: pos.x, y: pos.y, z: pos.z, duration, ease: 'power3.inOut' });
  gsap.to(controls.target, { x: target.x, y: target.y, z: target.z, duration, ease: 'power3.inOut' });
}

function zoomToItem(item) {
  if (planMode) setPlan(false);
  const bb = new THREE.Box3().setFromObject(item);
  const center = bb.getCenter(new THREE.Vector3());
  const size = bb.getSize(new THREE.Vector3()).length();
  // stand back towards the middle of the room so we look at it from inside
  const dir = center.clone().setY(0).negate();
  if (dir.lengthSq() < 0.01) dir.set(1, 0, 1);
  dir.normalize();
  const dist = Math.max(size * 1.15, 1.3);
  const pos = center.clone().add(dir.multiplyScalar(dist));
  pos.y = Math.min(center.y + size * 0.35 + 0.3, ROOM.h - 0.3);
  flyTo(pos, center);
}

function goHome() {
  setPlan(false);
  flyTo(HOME.pos, HOME.target);
}

/* Straight down on the room, with every piece named — the quickest way
   to see whether the layout is actually right. */
let planMode = false;
function setPlan(on) {
  planMode = on;
  labels.forEach((l) => { l.spr.visible = on; });
  btnPlan.classList.toggle('is-active', on);
  if (on) flyTo(new THREE.Vector3(0, 6.4, 0.01), new THREE.Vector3(0, 0, 0));
}

/* ------------------------------------------------------------------
   Pointer
------------------------------------------------------------------ */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();
const dragOffset = new THREE.Vector3();

let mode = 'look';
let dragging = null;
let dragHalf = null;
let downAt = null;

function setPointer(e) {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
}

function pickItem() {
  raycaster.setFromCamera(pointer, camera);
  const targets = items.concat(fixtures.filter((f) => f.visible));
  const hits = raycaster.intersectObjects(targets, true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o.parent && !targets.includes(o)) o = o.parent;
  return targets.includes(o) ? o : null;
}

canvas.addEventListener('pointerdown', (e) => {
  setPointer(e);
  downAt = { x: e.clientX, y: e.clientY };
  if (mode !== 'move') return;

  const item = pickItem();
  if (!item) return;
  if (!items.includes(item)) { select(item); return; } // fixtures stay put

  dragging = item;
  dragHalf = halfSize(item); // measured now, so rotated pieces clamp correctly
  select(item);
  controls.enabled = false;
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(floorPlane, hitPoint);
  dragOffset.copy(item.position).sub(hitPoint);
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  setPointer(e);
  raycaster.setFromCamera(pointer, camera);
  if (!raycaster.ray.intersectPlane(floorPlane, hitPoint)) return;

  const limX = Math.max(HW - dragHalf.x, 0.05);
  const limZ = Math.max(HD - dragHalf.z, 0.05);
  dragging.position.x = THREE.MathUtils.clamp(hitPoint.x + dragOffset.x, -limX, limX);
  dragging.position.z = THREE.MathUtils.clamp(hitPoint.z + dragOffset.z, -limZ, limZ);
  updateOutline();
  showCoords(dragging);
});

function endDrag(e) {
  if (!dragging) return;
  saveLayout();
  dragging = null;
  controls.enabled = true;
  if (e && canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
}

canvas.addEventListener('pointerup', (e) => {
  const moved = downAt ? Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) : 99;
  const wasDrag = !!dragging;
  endDrag(e);

  if (!wasDrag && moved < 6) {
    setPointer(e);
    const item = pickItem();
    if (item) {
      select(item);
      if (mode === 'look') zoomToItem(item);
    } else {
      select(null);
    }
  }
  downAt = null;
});

canvas.addEventListener('pointercancel', endDrag);

/* ------------------------------------------------------------------
   Remember the layout
------------------------------------------------------------------ */
function saveLayout() {
  const data = {};
  items.forEach((i) => { data[i.userData.id] = [i.position.x, i.position.z, i.rotation.y]; });
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (_) {}
}

function loadLayout() {
  let data;
  try { data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (_) { return; }
  if (!data) return;
  items.forEach((i) => {
    const v = data[i.userData.id];
    if (!v) return;
    i.position.x = v[0];
    i.position.z = v[1];
    i.rotation.y = v[2];
  });
}

const defaults = items.map((i) => [i.position.x, i.position.z, i.rotation.y]);
loadLayout();

/* ------------------------------------------------------------------
   UI
------------------------------------------------------------------ */
const card = document.getElementById('card');
const cardTitle = document.getElementById('card-title');
const cardDesc = document.getElementById('card-desc');
const cardCoords = document.getElementById('card-coords');
const btnAxes = document.getElementById('toggle-axes');
const btnLook = document.getElementById('mode-look');
const btnMove = document.getElementById('mode-move');
const btnLight = document.getElementById('toggle-light');
const btnPlan = document.getElementById('view-plan');
const hint = document.getElementById('hint');
const actRotate = document.getElementById('act-rotate');

function setMode(next) {
  mode = next;
  btnLook.classList.toggle('is-active', next === 'look');
  btnMove.classList.toggle('is-active', next === 'move');
  actRotate.hidden = next !== 'move' || !selected || !!selected.userData.fixed;
  hint.textContent = next === 'move'
    ? 'Drag a piece to slide it around · Rotate turns it'
    : 'Drag to spin · pinch or scroll to zoom · tap anything';
  hint.classList.remove('is-hidden');
  clearTimeout(hint._t);
  hint._t = setTimeout(() => hint.classList.add('is-hidden'), 5000);
}

let night = false;
function setNight(on) {
  night = on;
  btnLight.textContent = on ? 'Day' : 'Night';
  const d = 1.1;
  gsap.to(sun, { intensity: on ? 0.06 : 2.4, duration: d });
  gsap.to(hemi, { intensity: on ? 0.28 : 1.1, duration: d });
  gsap.to(ambient, { intensity: on ? 0.12 : 0.35, duration: d });
  gsap.to(skyFill, { intensity: on ? 0.6 : 6, duration: d });
  gsap.to(bulb, { intensity: on ? 14 : 0, duration: d });
  gsap.to(lampDisc.material, { emissiveIntensity: on ? 1.4 : 0, duration: d });
  gsap.to(glassMat.color, { r: on ? 0.09 : 0.81, g: on ? 0.11 : 0.89, b: on ? 0.18 : 0.95, duration: d });
  gsap.to(glassMat, { emissiveIntensity: on ? 0.12 : 0.9, duration: d });
  gsap.to(scene.background, { r: on ? 0.04 : 0.08, g: on ? 0.04 : 0.07, b: on ? 0.05 : 0.06, duration: d });
}

btnLook.addEventListener('click', () => setMode('look'));
btnMove.addEventListener('click', () => setMode('move'));
btnLight.addEventListener('click', () => setNight(!night));
btnPlan.addEventListener('click', () => setPlan(!planMode));
btnAxes.addEventListener('click', () => {
  axesGroup.visible = !axesGroup.visible;
  btnAxes.classList.toggle('is-active', axesGroup.visible);
  hint.textContent = axesGroup.visible
    ? 'Zero is the middle of the floor · each grid square is half a metre'
    : 'Drag to spin · pinch or zoom · tap anything';
  hint.classList.remove('is-hidden');
  clearTimeout(hint._t);
  hint._t = setTimeout(() => hint.classList.add('is-hidden'), 6000);
});
document.getElementById('card-close').addEventListener('click', () => select(null));
document.getElementById('act-back').addEventListener('click', () => { select(null); goHome(); });
document.getElementById('reset-view').addEventListener('click', goHome);

actRotate.addEventListener('click', () => {
  if (!selected || selected.userData.fixed) return;
  gsap.to(selected.rotation, {
    y: selected.rotation.y + Math.PI / 12,
    duration: 0.5,
    ease: 'power2.out',
    onUpdate: updateOutline,
    onComplete: saveLayout,
  });
});

document.getElementById('reset-room').addEventListener('click', () => {
  items.forEach((i, n) => {
    const [x, z, r] = defaults[n];
    gsap.to(i.position, { x, z, duration: 0.9, ease: 'power3.inOut', onUpdate: updateOutline });
    gsap.to(i.rotation, { y: r, duration: 0.9, ease: 'power3.inOut' });
  });
  try { localStorage.removeItem(STORE_KEY); } catch (_) {}
  select(null);
  goHome();
});

setMode('look');

/* ------------------------------------------------------------------
   Resize + render loop
------------------------------------------------------------------ */
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < 640 ? 62 : 48;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const camDelta = new THREE.Vector3();
function hideNearWallDecor() {
  for (const d of wallDecor) {
    camDelta.copy(camera.position).sub(d.p);
    d.obj.visible = camDelta.dot(d.n) > 0;
  }
}

renderer.setAnimationLoop(() => {
  controls.update();
  hideNearWallDecor();
  if (planMode) {
    for (const l of labels) l.spr.position.set(l.anchor.x, 2.5, l.anchor.z);
  }
  renderer.render(scene, camera);
});

/* exposed so the scene can be checked headlessly */
export const __test = { scene, camera, controls, items, fixtures, ROOM, axesGroup, select, zoomToItem, saveLayout, setNight, wallDecor, hideNearWallDecor };

/* fade the loader once the first frame is on screen */
requestAnimationFrame(() => requestAnimationFrame(() => {
  const l = document.getElementById('loader');
  l.classList.add('is-gone');
  setTimeout(() => l.remove(), 700);
  gsap.from(camera.position, { y: 4.2, z: 7.8, duration: 1.8, ease: 'power3.out' });
}));
