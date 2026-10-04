// player.js — 第三人称控制器：WASD + 指针锁定鼠标视角 + 圆柱碰撞 + 角色模型跟随
import * as THREE from 'three';
import { buildCharacter } from './character.js';

export class FPPlayer {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.pos = new THREE.Vector3(0, 0, 0);   // 脚底位置
    this.spawnPitch = -0.32;                 // 默认俯仰：准星落在人物前方 ~3.3m 的地面/家具上（低于身高）
    this._maxPitch = 0.45;   // 仰视上限 ~26°，防止穿天花板
    this._minPitch = -0.6;   // 俯视下限 ~34°，防止穿地板
    this.yaw = 0;
    this.pitch = this.spawnPitch;
    this.vy = 0;
    this.radius = 0.32;
    this.walkSpeed = 3.1;
    this.runSpeed = 5.2;
    this.enabled = false;
    this.frozen = false;
    this.keys = {};
    this._camDist = 3.0;      // 臂长≈2.2倍身高（UE/Unity模板量级）
    this.pivotHeight = 1.05;  // 相机枢轴=角色胸口（UE/Unity TPS 枢轴在胸口不在头顶）
    this.shoulder = 0.4;      // 右肩偏移：人物偏画面左侧，准星越肩指向前方地面/家具
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
    const g = buildCharacter();
    this._rig = g.userData.rig;
    this._gaitPhase = 0;   // 步态相位（按移动速度累加，快跑步频更高）
    this._idleT = 0;       // 待机呼吸时间
    return g;
  }

  teleport(pos, yaw = 0) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.pitch = this.spawnPitch;
    this.vy = 0;
    this._armDist = this._camDist;   // 传送后相机直接就位，不从旧位置滑过来
  }

  setLock(allowed) {
    this.canLock = allowed;
    if (!allowed && document.pointerLockElement) document.exitPointerLock();
  }

  update(dt, colliders) {
    if (this.frozen) return;
    if (!this.enabled) { this._updateAvatar(false, 0, dt); this._applyCamera(dt, colliders); return; }
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
    this._updateAvatar(moving, speed, dt);
    this._applyCamera(dt, colliders);
  }

  _updateAvatar(moving, speed = 0, dt = 0) {
    this.avatar.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.avatar.rotation.y = this.yaw;

    const rig = this._rig;
    const grounded = this.vy === 0;
    const runFactor = Math.min(1, speed / this.runSpeed);   // 0.6=步行 1=奔跑

    // 步态相位按实际速度累加（跑动步频更高）；停止时摆动幅度平滑归零，切换不跳帧
    if (moving && grounded) this._gaitPhase += dt * (4.4 + speed * 1.6);
    this._idleT = (moving && grounded) ? 0 : (this._idleT || 0) + dt;
    const targetAmp = (moving && grounded) ? 1 : 0;
    this._amp = (this._amp || 0) + (targetAmp - (this._amp || 0)) * Math.min(1, dt * 9);
    const amp = this._amp;
    const idle = 1 - amp;
    const t = this._gaitPhase;
    const sL = Math.sin(t), sR = Math.sin(t + Math.PI);

    // 腿：大腿前后摆 + 膝盖在迈步相（垂直过渡）弯曲
    const thighA = 0.6 * amp * (0.55 + 0.45 * runFactor);
    rig.legs[0].rotation.x = -sL * thighA;
    rig.legs[1].rotation.x = -sR * thighA;
    const kneeA = 0.92 * amp * (0.45 + 0.55 * runFactor);
    rig.knees[0].rotation.x = Math.pow(Math.max(0, Math.cos(t)), 0.7) * kneeA;
    rig.knees[1].rotation.x = Math.pow(Math.max(0, Math.cos(t + Math.PI)), 0.7) * kneeA;

    // 臂：与同侧腿反相；手肘常弯、跑动弯更多；静止时自然垂坠微晃
    const armA = 0.48 * amp * (0.55 + 0.45 * runFactor);
    rig.arms[0].rotation.x = sL * armA;
    rig.arms[1].rotation.x = sR * armA;
    rig.arms[0].rotation.z = -0.1 - idle * Math.sin(this._idleT * 1.7) * 0.015;
    rig.arms[1].rotation.z = 0.1 + idle * Math.sin(this._idleT * 1.7 + 1.3) * 0.015;
    rig.elbows[0].rotation.x = -(0.3 + Math.max(0, -sL) * 0.5) * (0.4 + 0.6 * amp);
    rig.elbows[1].rotation.x = -(0.3 + Math.max(0, -sR) * 0.5) * (0.4 + 0.6 * amp);

    // 躯干：跑动前倾 + 迈步起伏；待机呼吸 + 缓慢环顾
    rig.bodyRoot.rotation.x = -0.09 * runFactor * amp;
    rig.bodyRoot.position.y = Math.abs(Math.cos(t)) * 0.045 * amp + idle * Math.sin(this._idleT * 1.9) * 0.008;
    rig.headPivot.rotation.x = 0.05 * runFactor * amp + idle * Math.sin(this._idleT * 0.6) * 0.03;
    rig.headPivot.rotation.y = idle * Math.sin(this._idleT * 0.43) * 0.14;
  }

  _applyCamera(dt, colliders) {
    // UE/Unity 式越肩 Spring Arm：枢轴在角色胸口，相机 = 枢轴 + 右肩偏移 + 臂方向 × 臂长，
    // 视线沿臂方向看出去（不再 lookAt 角色）——准星自然落在人物前方的地面/家具上，
    // 高度低于人物且被人形让开，藏东西时视野不被人形挡住
    const pivotY = this.pos.y + this.pivotHeight;
    const dist = this._camDist;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // 臂方向（枢轴→相机）：背后 + 随俯仰升降（pitch 负=相机升高俯视）
    const dx = sy * cp, dz = cy * cp, dy = -sp;
    // 右肩偏移（视向的水平右方）
    const rx = cy * this.shoulder, rz = -sy * this.shoulder;

    const probe = 0.12;   // 水平膨胀（原 0.2 会隔着门框就误拦）
    const yPad = 0.06;    // 竖向膨胀收小：从门楣(2.15)下方过门时不被误拦
    let nearby = null;
    if (colliders) {
      // 合并"仅相机避让"碰撞（楼梯扶手等细长装饰）；玩家碰撞列表不受影响
      const all = (this.camColliders && this.camColliders.length)
        ? colliders.concat(this.camColliders) : colliders;
      // 只检测角色附近的 colliders（球扫范围 + 2m 余量），避免遍历全屋
      const range = dist + 2;
      nearby = all.filter(c =>
        c.maxX > this.pos.x - range && c.minX < this.pos.x + range &&
        c.maxZ > this.pos.z - range && c.minZ < this.pos.z + range &&
        c.maxY > this.pos.y - 1 && c.minY < pivotY + range
      );
    }
    const hitAt = (sx, sy2, sz) => {
      if (!nearby) return false;
      for (const c of nearby) {
        if (sx > c.minX - probe && sx < c.maxX + probe &&
            sz > c.minZ - probe && sz < c.maxZ + probe &&
            sy2 > c.minY - yPad && sy2 < c.maxY + yPad) return true;
      }
      return false;
    };

    // 探测线：从"枢轴+右肩偏移"沿臂方向到理想相机位
    let actualDist = dist;
    if (nearby) {
      const steps = 16;
      let hitDist = dist;
      for (let i = 1; i <= steps; i++) {
        const f = (i / steps) * dist;
        if (hitAt(this.pos.x + rx + dx * f, pivotY + dy * f, this.pos.z + rz + dz * f)) {
          hitDist = f - probe;
          break;
        }
      }
      actualDist = Math.max(0.3, Math.min(dist, hitDist));
    }

    // 臂长平滑：小幅转动时收臂慢（过门/贴墙不猛拉近）、放臂快；
    // 大幅甩动视角（>0.15rad/帧）时直接跳到受约束臂长——相机不做长距离滑移，
    // 物理上就不会扫穿楼板/墙（闪现"穿过二楼地面"的根源）
    const dAngle = this._prevDir
      ? Math.acos(Math.min(1, Math.max(-1, this._prevDir.x * dx + this._prevDir.y * dy + this._prevDir.z * dz)))
      : 0;
    this._prevDir = { x: dx, y: dy, z: dz };
    if (this._armDist === undefined || dAngle > 0.15) this._armDist = actualDist;
    else {
      const rate = actualDist < this._armDist ? 8 : 14;
      this._armDist += (actualDist - this._armDist) * (1 - Math.exp(-(dt || 0.016) * rate));
    }
    const tx = this.pos.x + rx + dx * this._armDist;
    const ty = pivotY + dy * this._armDist;
    const tz = this.pos.z + rz + dz * this._armDist;
    this.camera.position.set(tx, ty, tz);
    // 视线沿臂方向看出去（越过右肩指向前方，不 lookAt 角色）
    this.camera.lookAt(tx - dx, ty - dy, tz - dz);

    // 细长装饰杆（窗帘杆/楼梯扶手）贴近相机时淡出：
    // 它们不在碰撞表里，靠得太近时会以大斜角切过整个画面（看起来像 bug）
    if (this.rodMeshes && this.rodMeshes.length) {
      const cx = this.camera.position.x, cy = this.camera.position.y, cz = this.camera.position.z;
      for (const m of this.rodMeshes) {
        if (!m.userData._rodBox) m.userData._rodBox = new THREE.Box3().setFromObject(m);
        const bb = m.userData._rodBox;
        const px = Math.max(bb.min.x, Math.min(cx, bb.max.x));
        const py = Math.max(bb.min.y, Math.min(cy, bb.max.y));
        const pz = Math.max(bb.min.z, Math.min(cz, bb.max.z));
        const ddx = cx - px, ddy = cy - py, ddz = cz - pz;
        const near = (ddx * ddx + ddy * ddy + ddz * ddz) < 1.2;   // 相机距杆 <1.1m
        if (near && !m.userData._faded) {
          m.userData._faded = true;
          m.material.transparent = true;
          m.material.opacity = 0.12;
          m.material.depthWrite = false;
          m.castShadow = false;
        } else if (!near && m.userData._faded) {
          m.userData._faded = false;
          m.material.opacity = 1;
          m.material.transparent = false;
          m.material.depthWrite = true;
          m.castShadow = true;
        }
      }
    }
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
