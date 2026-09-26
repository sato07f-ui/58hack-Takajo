import * as THREE from "three";

const _zee = new THREE.Vector3(0, 0, 1);
const _euler = new THREE.Euler();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // X 軸 -90° 補正
const DEG = Math.PI / 180;

/**
 * DeviceOrientation の値をカメラの quaternion に反映する。
 * screenAngle: screen.orientation.angle（度）
 */
export function applyDeviceOrientation(
  camera,
  { alpha, beta, gamma },
  screenAngle = 0,
) {
  _euler.set(beta * DEG, alpha * DEG, -gamma * DEG, "YXZ");
  camera.quaternion.setFromEuler(_euler);
  camera.quaternion.multiply(_q1); // 端末を「立てて持つ」姿勢を正面にする
  camera.quaternion.multiply(_q0.setFromAxisAngle(_zee, -screenAngle * DEG)); // 画面回転の補正
}

/**
 * Three.js の scene / camera / renderer を作り、描画ループを開始する。
 * onFrame(camera): 毎フレーム描画前に呼ばれる（向き追従などに使う）
 * 戻り値の dispose() を呼ぶと全て停止・破棄する。
 */
export const createScene = (canvas, { onFrame } = {}) => {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false, // ★ 修正: PCでテストしやすいように、背景を不透明の暗いグレーにする
    antialias: true,
  });
  // ★ 修正: 第一引数をグレー(0x222222)、第二引数(透明度)を 1 にする
  renderer.setClearColor(0x222222, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); //GPU 負荷対策

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  // ★ 追加: PCでセンサーがなくてもキューブが見えるように、カメラを少し上に設定
  camera.position.set(0, 0, 0); //カメラの座標を原点固定（後で変更可能）
  camera.lookAt(0, -0.3, -2); // キューブの方向を向かせる
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));

  //テスト用オブジェクト
  const testCube = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.4, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xff5533 }),
  );
  const CUBE_HOME = new THREE.Vector3(0, -0.3, -2);
  testCube.position.copy(CUBE_HOME);
  scene.add(testCube);

  /** キューブを相対移動する（デバッグ用リモコンから呼ぶ） */
  const moveCube = (dx = 0, dy = 0, dz = 0) => {
    testCube.position.x += dx;
    testCube.position.y += dy;
    testCube.position.z += dz;
  };
  const resetCube = () => testCube.position.copy(CUBE_HOME);

  // ===============================
  // ★追加：ダメージを受けた時の演出関数
  // ===============================
  const playDamageEffect = () => {
    // 1. キューブを真っ白（発光）にする
    testCube.material.color.setHex(0xffffff);

    // 2. 0.15秒後に元の色(0xff5533)に戻す
    setTimeout(() => {
      // running（描画ループ中）の時だけ色を戻す（エラー防止）
      if (running) {
        testCube.material.color.setHex(0xff5533);
      }
    }, 150);
  };

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  let rafId = 0;
  let running = true;
  const loop = () => {
    if (!running) return;
    onFrame?.(camera);
    testCube.rotation.y += 0.01;
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(loop);
  };
  loop();

  return {
    scene,
    camera,
    renderer,
    moveCube,
    resetCube,
    playDamageEffect, // ★追加：App.jsxから呼び出せるように公開する
    dispose() {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      testCube.geometry.dispose();
      testCube.material.dispose();
      renderer.dispose();
    },
  };
};
