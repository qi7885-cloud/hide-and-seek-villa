// player.js — 第一人称控制器：WASD + 指针锁定鼠标视角（点击画面锁定）+ 圆柱碰撞
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
    this.enabled = false;  // 指针锁定时为 true（鼠标控制视角）
    this.frozen = false;   // 冻结时不接管相机（上帝视角用）
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

  // true=允许锁定（游戏阶段），false=解除锁定并禁止（菜单/过场）
  setLock(allowed) {
    this.canLock = allowed;
    if (!allowed && document.pointerLockElement) document.exitPointerLock();
  }

  update(dt, colliders) {
    if (this.frozen) return;
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
      const dx = (fx * cos + fz * sin) * speed * dt;
      const dz = (fz * cos - fx * sin) * speed * dt;
      this.pos.x += dx;
      this.pos.z += dz;
    }

    // ---- 多层支持物理：台阶自动上步 / 二楼楼板 / 楼梯 ----
    const STEP = 0.3;        // 可迈上的最大高度差
    const OVERLAP = 0.1;     // 作为支撑面所需的最小投影重叠深度
    const feet = this.pos.y;
    let support = 0;         // 脚下的支撑面高度（默认地面）
    for (let pass = 0; pass < 2; pass++) {
      for (const c of colliders) {
        // 圆 vs AABB 的 XZ 相交
        const nx = Math.max(c.minX, Math.min(this.pos.x, c.maxX));
        const nz = Math.max(c.minZ, Math.min(this.pos.z, c.maxZ));
        let dx = this.pos.x - nx, dz = this.pos.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= this.radius * this.radius) continue;
        if (c.maxY <= feet + STEP + 0.01) {
          // 台阶/矮台：圆与其投影重叠足够深（≥OVERLAP）才作为支撑面，轻擦不再瞬移上台；
          // 矮台永不横向阻挡。楼梯踏步进深0.29<半径0.32，且上一级台阶(高0.35)按"墙"推挤，
          // 圆心入投影的判据会卡死楼梯——上行时圆在下一级投影内最深可入约0.30m，取0.1m阈值
          // 既保证迈得上台阶，又防擦边上台
          if (d2 < (this.radius - OVERLAP) * (this.radius - OVERLAP)) {
            support = Math.max(support, c.maxY);
          }
          continue;
        }
        if (c.minY >= feet + 1.8) continue;  // 头顶以上的结构不碰撞
        // 阻挡：推出
        if (d2 < 1e-8) {
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

    // 重力 + 落到支撑面
    this.vy -= 18 * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= support && this.vy <= 0) {
      this.pos.y = support;
      this.vy = 0;
    }

    // 跟拍感：行走视点起伏 + 相机高度平滑
    if (moving && this.vy === 0) this._bob = (this._bob || 0) + dt * (speed * 2.1);
    const bobY = moving && this.vy === 0 ? Math.sin(this._bob || 0) * 0.032 : 0;
    const targetCamY = this.pos.y + this.eyeHeight + bobY;
    this._camY = (this._camY === undefined) ? targetCamY : this._camY + (targetCamY - this._camY) * Math.min(1, dt * 11);

    this._applyCamera();
  }

  _applyCamera() {
    this.camera.position.set(this.pos.x, this._camY ?? (this.pos.y + this.eyeHeight), this.pos.z);
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
