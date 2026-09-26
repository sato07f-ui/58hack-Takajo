import * as THREE from "three";

// 存在しているアイテムを管理する配列
const activeItems = [];

/**
 * 敵が倒れた位置にデモ用アイテムをスポーンさせる
 * @param {THREE.Scene} scene
 * @param {THREE.Vector3} position 敵がいた座標
 */
export function spawnItem(scene, position) {
  // --- デモ用アイテムの作成（金色のコイン風ポリゴン） ---
  // 将来的に自作3Dモデルに差し替える場合はここをGLTFLoader処理に変更します
  const geometry = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffd700, // ゴールド
    metalness: 0.8,
    roughness: 0.2,
  });

  const item = new THREE.Mesh(geometry, material);
  item.position.copy(position);
  item.rotation.x = Math.PI / 4; // 少し斜めに傾ける

  scene.add(item);

  // 出現時のポップアップ効果（ポンッと飛び出す演出用データ）
  activeItems.push({
    mesh: item,
    baseY: position.y,
    timeOffset: Math.random() * Math.PI * 2, // 浮遊アニメーションの位相ズレ
    scene,
  });
}

/**
 * 毎フレーム呼び出してアイテムを回したりふわふわ浮かせたりする
 */
export function updateItems() {
  const time = Date.now() * 0.003;

  activeItems.forEach((item) => {
    // 1. Y軸回転（くるくる回る）
    item.mesh.rotation.y += 0.02;

    // 2. 上下浮遊（サイン波でふわふわ揺れる）
    item.mesh.position.y = item.baseY + Math.sin(time + item.timeOffset) * 0.08;
  });
}

/**
 * シーン破棄時のクリーンアップ処理
 */
export function clearItems() {
  activeItems.forEach((item) => {
    item.scene.remove(item.mesh);
    item.mesh.geometry.dispose();
    item.mesh.material.dispose();
  });
  activeItems.length = 0;
}
