// player.js — 第三人称控制器：WASD + 指针锁定鼠标视角 + 圆柱碰撞 + 角色模型跟随
import * as THREE from 'three';

export class FPPlayer {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.pos = new THREE.Vector3(0, 0, 0);   // 脚底位置
    this.spawnPitch = -0.15;
    this._maxPitch = 0.45;   // 仰视上限 ~26°，防止穿天花板
    this._minPitch = -0.6;   // 俯视下限 ~34°，防止穿地板
    this.yaw = 0;
    this.pitch = this.spawnPitch;
    this.vy = 0;
    this.radius = 0.32;
    this.eyeHeight = 1.62;
    this.walkSpeed = 3.1;
    this.runSpeed = 5.2;
    this.enabled = false;
    this.frozen = false;
    this.keys = {};
    this._camDist = 2.2;
    this._camHeight = 0.15;
    this.avatar = this._buildAvatar();
    this.avatar.visible = true;

    this._onMouseMove = (e) => {
      if (!this.enabled || document.pointerLockElement !== this.dom) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(this._minPitch, Math.min(this._maxPitch, this.pitch));
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

  _buildAvatar() {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8c099, roughness: 0.7 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x3a6b8c, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.85 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.42, 4, 8), cloth);
    body.position.y = 0.75; g.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), skin);
    head.position.y = 1.22; g.add(head);

    const mkLimb = (x, mat, y) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 6), mat);
      m.position.set(x, y, 0); return m;
    };
    const legL = mkLimb(-0.09, dark, 0.32), legR = mkLimb(0.09, dark, 0.32);
    g.add(legL, legR);
    const armL = mkLimb(-0.27, cloth, 0.82), armR = mkLimb(0.27, cloth, 0.82);
    g.add(armL, armR);

    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData.legs = [legL, legR];
    g.userData.arms = [armL, armR];
    return g;
  }

  teleport(pos, yaw = 0) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.pitch = this.spawnPitch;
    this.vy = 0;
  }

  setLock(allowed) {
    this.canLock = allowed;
    if (!allowed && document.pointerLockElement) document.exitPointerLock();
  }

  update(dt, colliders) {
    if (this.frozen) return;
    if (!this.enabled) { this._updateAvatar(); this._applyCamera(colliders); return; }
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

    const STEP = 0.3, OVERLAP = 0.1;
    const feet = this.pos.y;
    let support = 0;
    // 空间分区：只检测角色附近的 colliders
    const cr = this.radius + 0.3;
    const nearbyCol = colliders.filter(c =>
      c.maxX > this.pos.x - cr && c.minX < this.pos.x + cr &&
      c.maxZ > this.pos.z - cr && c.minZ < this.pos.z + cr &&
      c.maxY > feet - 0.5 && c.minY < feet + 2.5
    );
    for (let pass = 0; pass < 2; pass++) {
      for (const c of nearbyCol) {
        const nx = Math.max(c.minX, Math.min(this.pos.x, c.maxX));
        const nz = Math.max(c.minZ, Math.min(this.pos.z, c.maxZ));
        let dx = this.pos.x - nx, dz = this.pos.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= this.radius * this.radius) continue;
        if (c.maxY <= feet + STEP + 0.01) {
          if (d2 < (this.radius - OVERLAP) * (this.radius - OVERLAP)) {
            support = Math.max(support, c.maxY);
          }
          continue;
        }
        if (c.minY >= feet + 1.8) continue;
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

    this.vy -= 18 * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= support && this.vy <= 0) {
      // Y 平滑过渡：上台阶时不再硬跳到台阶面，而是 lerp 过渡
      if (this._smoothY === undefined) this._smoothY = this.pos.y;
      this._smoothY += (support - this._smoothY) * Math.min(1, dt * 12);
      this.pos.y = this._smoothY;
      this.vy = 0;
    } else {
      this._smoothY = this.pos.y;
    }

    if (moving && this.vy === 0) this._bob = (this._bob || 0) + dt * (speed * 2.1);
    this._updateAvatar(moving);
    this._applyCamera(colliders);
  }

  _updateAvatar(moving) {
    this.avatar.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.avatar.rotation.y = this.yaw;
    const swing = moving && this.vy === 0 ? Math.sin(this._bob || 0) * 0.35 : 0;
    const [legL, legR] = this.avatar.userData.legs;
    const [armL, armR] = this.avatar.userData.arms;
    legL.rotation.x = swing; legR.rotation.x = -swing;
    armL.rotation.x = -swing; armR.rotation.x = swing;
  }

  _applyCamera(colliders) {
    // Spring Arm 球扫检测：从角色头部向相机理想方向发射带半径的射线，
    // 遇到墙/地板/天花板就缩短臂长，把相机放到碰撞点前
    const anchorY = this.pos.y + this.eyeHeight + this._camHeight;
    const dist = this._camDist;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // 相机理想位置（背后+微俯视）
    const dx = sy * cp, dz = cy * cp, dy = -sp;
    const idealX = this.pos.x + dx * dist;
    const idealZ = this.pos.z + dz * dist;
    const idealY = anchorY + dy * dist;

    let actualDist = dist;
    if (colliders) {
      const probe = 0.2;
      // 只检测角色附近的 colliders（球扫范围 + 2m 余量），避免遍历全屋
      const range = dist + 2;
      const nearby = colliders.filter(c =>
        c.maxX > this.pos.x - range && c.minX < this.pos.x + range &&
        c.maxZ > this.pos.z - range && c.minZ < this.pos.z + range &&
        c.maxY > this.pos.y - 1 && c.minY < anchorY + range
      );
      const steps = 16;
      let hitDist = dist;
      for (let i = 1; i <= steps; i++) {
        const f = (i / steps) * dist;
        const px = this.pos.x + dx * f;
        const py = anchorY + dy * f;
        const pz = this.pos.z + dz * f;
        let blocked = false;
        for (const c of nearby) {
          if (px > c.minX - probe && px < c.maxX + probe &&
              pz > c.minZ - probe && pz < c.maxZ + probe &&
              py > c.minY - probe && py < c.maxY + probe) {
            blocked = true; break;
          }
        }
        if (blocked) { hitDist = f - probe; break; }
      }
      actualDist = Math.max(0.3, Math.min(dist, hitDist));
    }

    // lerp 平滑过渡：避免碰撞切换时相机跳变
    const tx = this.pos.x + dx * actualDist;
    const ty = anchorY + dy * actualDist;
    const tz = this.pos.z + dz * actualDist;
    if (!this._camLerp) this._camLerp = { x: tx, y: ty, z: tz };
    const l = Math.min(1, 0.25);
    this._camLerp.x += (tx - this._camLerp.x) * l;
    this._camLerp.y += (ty - this._camLerp.y) * l;
    this._camLerp.z += (tz - this._camLerp.z) * l;
    this.camera.position.set(this._camLerp.x, this._camLerp.y, this._camLerp.z);
    this.camera.lookAt(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
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
