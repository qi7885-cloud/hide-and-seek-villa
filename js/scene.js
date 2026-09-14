// scene.js — 渲染器、场景、灯光、渲染循环（M1）
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/jsm/environments/RoomEnvironment.js';

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 性能上限：像素比≤2
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // 电影级色调映射
  renderer.toneMappingExposure = 1.12;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cc2e0); // 天空蓝

  // 环境光照（PBR 材质的真实感来源）：室内辐射环境
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;   // 环境泛光减弱，避免室内过曝

  const camera = new THREE.PerspectiveCamera(
    70, window.innerWidth / window.innerHeight, 0.05, 200
  );
  camera.position.set(0, 3, 10);
  camera.lookAt(0, 1, 0);

  // 灯光：暖调半球光（环境泛光主要由 scene.environment 提供）+ 主方向光
  const hemi = new THREE.HemisphereLight(0xf2e9dc, 0x9a8a74, 0.4);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe7c4, 1.5);
  sun.position.set(12, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // 兜底地面（庭院 GLB 的草坪会盖在它上方；模型缺失时也有绿底）
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshLambertMaterial({ color: 0x9fb98a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  scene.add(ground);

  // 自适应窗口
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 渲染循环
  const clock = new THREE.Clock();
  const tickHandlers = [];
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05); // 钳制帧间隔，防切标签页后物理爆炸
    // 单个 handler 抛错不拖垮整帧渲染与后续 handler
    for (const fn of tickHandlers) {
      try { fn(dt); } catch (err) { console.error('[tick]', err); }
    }
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, sun, clock, tickHandlers, start: loop };
}
