import * as THREE from 'three'

const WIDTH = 0.12 // ゲージの横幅 [m]
const HEIGHT = 0.014 // ゲージの高さ [m]
const BORDER = 0.0025 // 黒い縁取りの太さ [m]
const FOLLOW_SPEED = 0.2 // 表示中の値が目標の値に近づく速さ（1 フレームで差の何割を詰めるか）

// 残り HP の割合に応じた色（多い順に判定）
const COLORS = [
  { min: 0.5, color: new THREE.Color(0x4caf50) }, // 緑
  { min: 0.25, color: new THREE.Color(0xffc107) }, // 黄
  { min: 0, color: new THREE.Color(0xf44336) }, // 赤
]

/** 敵に隠れないよう、奥行きを無視して常に手前に描く板を作る */
const createPlane = (width, height, color, opacity, renderOrder) => {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false }),
  )
  mesh.renderOrder = renderOrder // 縁 → 空の部分 → 残りの部分 の順に重ねる
  return mesh
}

/**
 * 敵の頭上に出す HP ゲージを作る。
 * 敵モデルの子にすると、ダメージ演出の変形や撃破演出の回転に巻き込まれるので、
 * scene に直接置き、毎フレーム update() で位置と向きを合わせる。
 * 戻り値: { group, setRatio(ratio), update(camera, position), dispose() }
 */
export const createHpBar = () => {
  const group = new THREE.Group()
  const frame = createPlane(WIDTH + BORDER * 2, HEIGHT + BORDER * 2, 0x000000, 0.6, 10)
  const empty = createPlane(WIDTH, HEIGHT, 0x442222, 0.9, 11)
  const fill = createPlane(WIDTH, HEIGHT, COLORS[0].color, 1, 12)
  // 左端を基準に縮むよう、板の原点を左端にずらす
  fill.geometry.translate(WIDTH / 2, 0, 0)
  fill.position.x = -WIDTH / 2
  group.add(frame, empty, fill)

  let target = 1 // 目標の割合（setRatio で受け取った値）
  let shown = 1 // 表示中の割合（target へ少しずつ近づけて、減る様子を見せる）

  return {
    group,

    /** 残り HP の割合（0〜1）を設定する */
    setRatio(ratio) {
      target = THREE.MathUtils.clamp(ratio, 0, 1)
    },

    /** 毎フレーム呼ぶ。position（頭上の点）に置いてカメラの方を向け、ゲージを進める */
    update(camera, position) {
      group.position.copy(position)
      group.quaternion.copy(camera.quaternion) // 常に画面と平行にする

      shown += (target - shown) * FOLLOW_SPEED
      if (Math.abs(target - shown) < 0.001) shown = target
      fill.scale.x = Math.max(shown, 0.0001) // 0 にすると行列が壊れるので、ごく小さい値で止める
      fill.material.color.copy(COLORS.find(({ min }) => shown >= min).color)
    },

    dispose() {
      group.removeFromParent()
      for (const mesh of [frame, empty, fill]) {
        mesh.geometry.dispose()
        mesh.material.dispose()
      }
    },
  }
}
