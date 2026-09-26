import * as THREE from "three";
import { createHitEffect, updateHitEffects } from "./hitEffect";

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
    alpha: true,
    antialias: true,
  });
  renderer.setClearColor(0x000000, 0);
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
  // ★ 追加: ゲーム状態の管理変数
  // ===============================
  let projectiles = []; // 飛翔中の魔法弾
  let isDefeated = false; // 撃破状態フラグ

  // ===============================
  // ★ 変更: ダメージ演出（エフェクト呼び出し追加）
  // ===============================
  const playDamageEffect = (hitPosition) => {
    // 1. キューブを真っ白（発光）にする
    testCube.material.color.setHex(0xffffff);

    // 2. 0.15秒後に元の色(0xff5533)に戻す
    setTimeout(() => {
      // running（描画ループ中）の時だけ色を戻す（エラー防止）
      if (running) {
        testCube.material.color.setHex(0xff5533);
      }
    }, 150);

    // 3. キューブを揺らす（潰す変形）
    testCube.scale.set(1.3, 0.8, 1.3);
    setTimeout(() => {
      if (running && !isDefeated) testCube.scale.set(1, 1, 1);
    }, 100);

    // 4. hitEffect.jsのエフェクトを発生させる
    const targetPos = hitPosition || testCube.position;
    createHitEffect(scene, camera, targetPos);
  };

  // ===============================
  // ★ 追加: 魔法の発射関数
  // ===============================
  const shootMagic = (onHitCallback) => {
    const projGeom = new THREE.SphereGeometry(0.1, 16, 16);
    const projMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const projectile = new THREE.Mesh(projGeom, projMat);

    // ARなので「現在のカメラの位置・向き」を基準に、手前・少し下から発射させる
    projectile.position.copy(camera.position);
    projectile.translateY(-0.3); // カメラより少し下
    projectile.translateZ(-0.5); // カメラより少し前

    scene.add(projectile);

    projectiles.push({
      mesh: projectile,
      target: testCube,
      onHit: onHitCallback,
    });
  };

  // ===============================
  // ★ 追加: 撃破演出関数
  // ===============================
  const playDefeatEffect = () => {
    isDefeated = true;
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

  // ===============================
  // ★ 変更: アニメーションループ（飛翔・撃破・エフェクト更新）
  // ===============================

  let rafId = 0;
  let running = true;
  const loop = () => {
    if (!running) return;
    onFrame?.(camera);

    // 1. キューブのアニメーション（通常 or 撃破時）
    if (!isDefeated) {
      testCube.rotation.y += 0.01;
    } else {
      testCube.rotation.x += 0.1;
      testCube.rotation.y += 0.1;
      if (testCube.scale.x > 0.05) {
        testCube.scale.multiplyScalar(0.9);
      } else {
        testCube.visible = false;
      }
    }

    // 2. 魔法弾の追尾＆着弾判定
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const proj = projectiles[i];
      proj.mesh.position.lerp(proj.target.position, 0.15); // 対象へ滑らかに移動

      // 着弾判定（キューブサイズが 0.4 なので、距離 0.3 以下でヒットとする）
      if (proj.mesh.position.distanceTo(proj.target.position) < 0.3) {
        scene.remove(proj.mesh);
        proj.mesh.geometry.dispose();
        proj.mesh.material.dispose();
        projectiles.splice(i, 1);

        playDamageEffect(proj.mesh.position);
        if (proj.onHit) proj.onHit(); // App.jsx側のHP減算を実行
      }
    }

    // 3. hitEffect.js のエフェクトアニメーションを更新
    updateHitEffects();

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
    shootMagic, // ★ 追加: App.jsxから呼べるようにする
    playDefeatEffect, // ★ 追加: App.jsxから呼べるようにする
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
