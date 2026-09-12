// player.js — 第一人称控制器：WASD + 鼠标视角 + 圆柱碰撞（对静态AABB滑行）
import * as THREE from 'three';

export class FPPlayer {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.pos = new THREE.Vector3(0, 0, 0);   // 脚底位置
    this.yaw = 0;
    this.pitch = 0;
    this.vy = 0;
    this.radius = 0.32;
    this.eyeHeight = 1.62;
    this.walkSpeed = 3.1;
    this.runSpeed = 5.2;
    this.enabled = false;
    this.keys = {};

    this._onMouseMove = (e) => {
      if (!this.enabled || document.pointerLockElement !== this.dom) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      const lim = Math.PI / 2 - 0.05;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    };
    this._onKeyDown = (e) => { this.keys[e.code] = true; };
    this._onKeyUp = (e) => { this.keys[e.code] = false; };
    this._onLockChange = () => {
      this.enabled = document.pointerLockElement === this.dom;
      this.dom.dispatchEvent(new CustomEvent('pointerlockstate', { detail: this.enabled }));
    };

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
    dom.addEventListener('click', () => {
      if (this.enabled || !this.canLock) return;
      this.dom.requestPointerLock();
    });
    this.canLock = true;
  }

  teleport(pos, yaw = 0) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.vy = 0;
  }

  setLock(allowed) { this.canLock = allowed; if (!allowed && document.pointerLockElement) document.exitPointerLock(); }

  update(dt, colliders) {
    if (!this.enabled) { this._applyCamera(); return; }
    const k = this.keys;
    let fx = 0, fz = 0;
    if (k['KeyW']) fz -= 1;
    if (k['KeyS']) fz += 1;
    if (k['KeyA']) fx -= 1;
    if (k['KeyD']) fx += 1;
    const moving = fx !== 0 || fz !== 0;
    const speed = (k['ShiftLeft'] || k['ShiftRight']) ? this.runSpeed : this.walkSpeed;

    if (moving) {
      const inv = 1 / Math.hypot(fx, fz);
      fx *= inv; fz *= inv;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // 相机前向为 -Z，绕 yaw 旋转
      const dx = (fx * cos + fz * sin) * speed * dt;
      const dz = (fz * cos - fx * sin) * speed * dt;
      this.pos.x += dx;
      this.pos.z += dz;
    }

    // 重力（地面 y=0）
    this.vy -= 18 * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; }

    // 圆柱 vs AABB 碰撞（两轮迭代处理拐角）
    for (let pass = 0; pass < 2; pass++) {
      for (const c of colliders) {
        if (c.maxY <= 0.12 || c.minY >= 1.75) continue; // 只挡身体高度内的箱子
        const nx = Math.max(c.minX, Math.min(this.pos.x, c.maxX));
        const nz = Math.max(c.minZ, Math.min(this.pos.z, c.maxZ));
        let dx = this.pos.x - nx, dz = this.pos.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= this.radius * this.radius) continue;
        if (d2 < 1e-8) {
          // 圆心在箱内：沿最浅穿透轴推出
          const px = Math.min(this.pos.x - c.minX, c.maxX - this.pos.x);
          const pz = Math.min(this.pos.z - c.minZ, c.maxZ - this.pos.z);
          if (px < pz) this.pos.x += (this.pos.x - (c.minX + c.maxX) / 2 > 0 ? px + this.radius : -(px + this.radius));
          else this.pos.z += (this.pos.z - (c.minZ + c.maxZ) / 2 > 0 ? pz + this.radius : -(pz + this.radius));
          continue;
        }
        const d = Math.sqrt(d2), push = (this.radius - d) / d;
        this.pos.x += dx * push;
        this.pos.z += dz * push;
      }
    }

    this._applyCamera();
  }

  _applyCamera() {
    this.camera.position.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  forwardDir() {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
  }

  dispose() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
