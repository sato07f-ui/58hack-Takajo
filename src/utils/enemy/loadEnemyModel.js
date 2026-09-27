import * as THREE from 'three'
import { loadModel } from '../item/loadModel'

/**
 * モデルがまだ無い敵の仮モデル（黄色いカプセル）。
 * glb と同じく原点を足元にし、顔の向き（+Z）に目印の黒い点を付ける。
 */
const createPlaceholderModel = () => {
  const group = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.15, 0.4, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.6 }),
  )
  body.position.y = 0.35 // 高さ 0.7 の半分だけ上げて、足元を原点にする
  group.add(body)
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
  for (const x of [-0.05, 0.05]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), eyeMaterial)
    eye.position.set(x, 0.45, 0.145)
    group.add(eye)
  }
  return group
}

/**
 * 敵の glb を読み込み、シーンに追加できる Object3D（複製）を返す。
 * 読み込みとキャッシュは loadModel に任せる。
 * url が null の敵（モデル未作成）は仮モデルを返す。
 */
export const loadEnemyModel = async (url) => (await loadModel(url)) ?? createPlaceholderModel()
