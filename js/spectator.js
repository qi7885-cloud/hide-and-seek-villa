// spectator.js — 菜单背后的上帝视角环绕相机（自动旋转展示）
// 注：画中画观战/角色替身功能已移除（此前处于永久停用状态）
import * as THREE from 'three';

export class GodCamera {
  constructor(camera) {
    this.camera = camera;
    this.target = new THREE.Vector3(0, 0, 0);
    this.azimuth = Math.PI;        // 绕Y角
    this.polar = 0.95;             // 俯仰角（0=正上方偏）
    this.dist = 15;
    this.enabled = false;
    this.autoRotate = false;
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
