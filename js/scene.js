// scene.js — 渲染器、场景、灯光、渲染循环（M1）
import * as THREE from 'three';

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 性能上限：像素比≤2
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5e0); // 天空蓝

  const camera = new THREE.PerspectiveCamera(
    70, window.innerWidth / window.innerHeight, 0.05, 200
  );
  camera.position.set(0, 3, 10);
  camera.lookAt(0, 1, 0);

  // 灯光：半球环境光 + 主方向光（带阴影）
  const hemi = new THREE.HemisphereLight(0xdfeaf5, 0x8a7a66, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2d9, 1.6);
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

  // 临时地面（M2 会换成真正的地板与别墅）
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshLambertMaterial({ color: 0x9fb98a })
  );
  ground.rotation.x = -Math.PI / 2;
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
  const hooks = { pipRender: null };   // main 层注入的渲染后钩子（画中画）
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05); // 钳制帧间隔，防切标签页后物理爆炸
    for (const fn of tickHandlers) fn(dt);
    renderer.render(scene, camera);
    if (hooks.pipRender) hooks.pipRender(renderer, scene);
  }

  return { renderer, scene, camera, sun, clock, tickHandlers, hooks, start: loop };
}
