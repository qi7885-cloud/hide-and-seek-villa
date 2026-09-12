// spectator.js — 藏家视角：上帝环绕相机（放置期）+ 第三人称跟随（画中画观战）
import * as THREE from 'three';

// ---------- 上帝视角环绕相机 ----------
export class GodCamera {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3(0, 0, 0);
    this.azimuth = Math.PI;        // 绕Y角
    this.polar = 0.95;             // 俯仰角（0=正上方偏）
    this.dist = 15;
    this.enabled = false;
    this.onClickPick = null;       // 点击拾取回调（与拖动区分）

    this._down = null;
    this._dragged = false;
    dom.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this._down = { x: e.clientX, y: e.clientY, btn: e.button, az: this.azimuth, po: this.polar, tg: this.target.clone() };
      this._dragged = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this._down) return;
      const dx = e.clientX - this._down.x, dy = e.clientY - this._down.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) this._dragged = true;
      if (this._down.btn === 0) {          // 左键旋转
        this.azimuth = this._down.az - dx * 0.006;
        this.polar = THREE.MathUtils.clamp(this._down.po + dy * 0.004, 0.15, 1.35);
      } else {                             // 右键平移
        const scale = this.dist * 0.0016;
        const sin = Math.sin(this.azimuth), cos = Math.cos(this.azimuth);
        this.target.x = THREE.MathUtils.clamp(this._down.tg.x + (dx * cos - dy * sin * 0.5) * scale, -9, 9);
        this.target.z = THREE.MathUtils.clamp(this._down.tg.z + (-dx * sin - dy * cos * 0.5) * scale, -7, 7);
      }
    });
    window.addEventListener('mouseup', () => {
      if (!this.enabled) { this._down = null; return; }
      if (this._down && !this._dragged && this._down.btn === 0 && this.onClickPick) {
        this.onClickPick(this._down.x, this._down.y);
      }
      this._down = null;
    });
    dom.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.dist = THREE.MathUtils.clamp(this.dist + e.deltaY * 0.012, 6, 30);
    }, { passive: false });
  }

  update() {
    if (!this.enabled) return;
    if (this.autoRotate) this.azimuth += 0.0016;   // 菜单展示用慢速环绕
    const sinP = Math.sin(this.polar);
    this.camera.position.set(
      this.target.x + this.dist * sinP * Math.sin(this.azimuth),
      this.target.y + this.dist * Math.cos(this.polar),
      this.target.z + this.dist * sinP * Math.cos(this.azimuth)
    );
    this.camera.lookAt(this.target);
  }
}

// ---------- 找家角色替身（仅画中画层可见，layer 1） ----------
export function createAvatar() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.85, 6, 12), new THREE.MeshLambertMaterial({ color: 0xd97b4a }));
  body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), new THREE.MeshLambertMaterial({ color: 0xe8b88f }));
  head.position.y = 1.5;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x4a6a8a }));
  cap.position.y = 1.52;
  g.add(body, head, cap);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.layers.set(1); } });
  return g;
}

// ---------- 画中画第三人称观战相机 ----------
export class SpectatorPiP {
  constructor() {
    this.cam = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 100);
    this.cam.layers.enable(1);   // 能看到角色替身
    this.enabled = false;
  }

  update(playerPos, playerYaw, dt) {
    if (!this.enabled) return;
    // 在玩家后上方，随 yaw 平滑跟随
    const back = 3.0, up = 2.1;
    const tx = playerPos.x + Math.sin(playerYaw) * back;
    const tz = playerPos.z + Math.cos(playerYaw) * back;
    const k = Math.min(1, dt * 4);
    this.cam.position.x += (tx - this.cam.position.x) * k;
    this.cam.position.y += (up - this.cam.position.y) * k;
    this.cam.position.z += (tz - this.cam.position.z) * k;
    this.cam.lookAt(playerPos.x, playerPos.y + 1.2, playerPos.z);
  }

  // 主渲染循环里调用：右下角画中画
  render(renderer, scene, width, height) {
    if (!this.enabled) return;
    const w = 280, h = 210, margin = 14;
    renderer.setScissorTest(true);
    renderer.setViewport(width - w - margin, margin, w, h);
    renderer.setScissor(width - w - margin, margin, w, h);
    renderer.render(scene, this.cam);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
  }
}
