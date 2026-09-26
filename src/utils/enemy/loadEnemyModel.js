import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const loader = new GLTFLoader()
const cache = new Map() // url → Promise<gltf>

/**
 * glb を読み込み、シーンに追加できる Object3D（複製）を返す。
 * 同じモデルは 2 回目以降ダウンロードしない。
 */
export const loadEnemyModel = async (url) => {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url))
  const gltf = await cache.get(url)
  return gltf.scene.clone(true)
}
