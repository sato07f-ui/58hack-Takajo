import * as THREE from "three";

// 進行中のエフェクトを保持する配列
const activeEffects = [];

/**
 * 被弾エフェクト（リング＋スパーク）を生成する
 */
export function createHitEffect(scene, camera, position) {
  // 1. 衝撃波リング
  const ringGeom = new THREE.RingGeometry(0.1, 0.2, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.position.copy(position);
  ring.lookAt(camera.position);
  scene.add(ring);

  // 2. 弾ける粒子（スパーク）
  const particleCount = 20;
  const particles = [];
  const particleGeom = new THREE.SphereGeometry(0.04, 8, 8);
  const particleMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });

  for (let i = 0; i < particleCount; i++) {
    const p = new THREE.Mesh(particleGeom, particleMat);
    p.position.copy(position);

    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.2,
    );

    scene.add(p);
    particles.push({ mesh: p, velocity });
  }

  // 管理リストに追加
  activeEffects.push({
    ring,
    particles,
    life: 1.0,
    scene,
  });
}

/**
 * 毎フレーム呼び出してエフェクトをアニメーションさせる
 */
export function updateHitEffects() {
  for (let i = activeEffects.length - 1; i >= 0; i--) {
    const effect = activeEffects[i];
    effect.life -= 0.05;

    // リングの拡大とフェードアウト
    if (effect.ring) {
      effect.ring.scale.addScalar(0.15);
      effect.ring.material.opacity = effect.life;
    }

    // 粒子の拡散と縮小
    effect.particles.forEach((p) => {
      p.mesh.position.add(p.velocity);
      p.mesh.scale.multiplyScalar(0.92);
    });

    // 寿命が尽きたら削除してメモリ解放
    if (effect.life <= 0) {
      effect.scene.remove(effect.ring);
      effect.ring.geometry.dispose();
      effect.ring.material.dispose();

      effect.particles.forEach((p) => {
        effect.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      });

      activeEffects.splice(i, 1);
    }
  }
}
