import * as THREE from "three";

const SHOW_MS = 1200; // 落ちたアイテムをその場で見せる時間（プレイヤーがドロップに気づくため）
const COLLECT_MS = 400; // 手持ちに吸い込まれるまでの時間
// 吸い込み先。カメラから見た座標（画面の下寄り、少し手前）
const COLLECT_POINT = new THREE.Vector3(0, -0.2, -0.3);
const _target = new THREE.Vector3();

// 存在しているアイテムを管理する配列
const activeItems = [];

/**
 * 敵が倒れた位置にアイテムをスポーンさせる。
 * しばらく見せた後、カメラ（プレイヤー）へ吸い込まれて消え、onCollect(item) が呼ばれる
 * @param {THREE.Scene} scene
 * @param {THREE.Vector3} position 敵がいた座標
 * @param {{ item: object, onCollect?: (item: object) => void }} options item は ITEMS の要素
 */
export function spawnItem(scene, position, { item, onCollect }) {
  // --- デモ用アイテムの作成（コイン風ポリゴン） ---
  // 将来的に自作3Dモデルに差し替える場合はここをGLTFLoader処理に変更します
  const geometry = new THREE.CylinderGeometry(0.05, 0.05, 0.015, 24);
  const material = new THREE.MeshStandardMaterial({
    color: item.color,
    metalness: 0.8,
    roughness: 0.2,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.rotation.x = Math.PI / 2; // 面をカメラ側に向けて、コインだと分かるようにする

  scene.add(mesh);

  activeItems.push({
    mesh,
    scene,
    item,
    onCollect,
    baseY: position.y,
    bornAt: performance.now(),
    from: null, // 吸い込みを始めた位置
  });
}

/** シーンから外してメモリを解放する */
function removeItem(index) {
  const { mesh, scene } = activeItems[index];
  scene.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.dispose();
  activeItems.splice(index, 1);
}

/**
 * 毎フレーム呼び出して、アイテムを浮かせる → 吸い込む → 拾う、と進める
 * @param {THREE.Camera} camera 吸い込み先の基準
 */
export function updateItems(camera) {
  const now = performance.now();

  for (let i = activeItems.length - 1; i >= 0; i--) {
    const entry = activeItems[i];
    const { mesh } = entry;
    const age = now - entry.bornAt;
    mesh.rotation.z += 0.05; // くるくる回る

    // 1. 見せる: 上下にふわふわ揺れる
    if (age < SHOW_MS) {
      mesh.position.y = entry.baseY + Math.sin(age * 0.005) * 0.02;
      continue;
    }

    // 2. 吸い込む: 画面下へ加速しながら飛んで小さくなる
    if (!entry.from) entry.from = mesh.position.clone();
    const t = Math.min((age - SHOW_MS) / COLLECT_MS, 1);
    camera.localToWorld(_target.copy(COLLECT_POINT));
    mesh.position.lerpVectors(entry.from, _target, t * t);
    mesh.scale.setScalar(1 - t * 0.7);
    if (t < 1) continue;

    // 3. 拾う: 消して手持ちに入れる
    removeItem(i);
    entry.onCollect?.(entry.item);
  }
}

/**
 * シーン破棄時のクリーンアップ処理（拾われずに残ったアイテムも消す）
 */
export function clearItems() {
  for (let i = activeItems.length - 1; i >= 0; i--) removeItem(i);
}
