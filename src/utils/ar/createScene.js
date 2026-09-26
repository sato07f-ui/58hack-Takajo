import * as THREE from 'three'
import { loadEnemyModel } from '../enemy/loadEnemyModel'

const _zee = new THREE.Vector3(0, 0, 1)
const _euler = new THREE.Euler()
const _q0 = new THREE.Quaternion()
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)) // X 軸 -90° 補正
const DEG = Math.PI / 180

const SPAWN_DISTANCE = 2 // カメラから敵までの距離 [m]
const _raycaster = new THREE.Raycaster()
const _ndc = new THREE.Vector2()
const _box = new THREE.Box3()
const _size = new THREE.Vector3()

/**
 * DeviceOrientation の値をカメラの quaternion に反映する。
 * screenAngle: screen.orientation.angle（度）
 */
export function applyDeviceOrientation(camera, { alpha, beta, gamma }, screenAngle = 0) {
  _euler.set(beta * DEG, alpha * DEG, -gamma * DEG, 'YXZ')
  camera.quaternion.setFromEuler(_euler)
  camera.quaternion.multiply(_q1) // 端末を「立てて持つ」姿勢を正面にする
  camera.quaternion.multiply(_q0.setFromAxisAngle(_zee, -screenAngle * DEG)) // 画面回転の補正
}


/**
 * Three.js の scene / camera / renderer を作り、描画ループを開始する。
 * onFrame(camera): 毎フレーム描画前に呼ばれる（向き追従などに使う）
 * 戻り値の dispose() を呼ぶと全て停止・破棄する。
 */
export const createScene = (canvas, { onFrame } = {}) => {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true, //背景を透明にしてカメラ映像を透かす
    antialias: true,
  })
  renderer.setClearColor(0x000000, 0) //透明クリア
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) //GPU 負荷対策

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  camera.position.set(0, 0, 0) //カメラの座標を原点固定（後で変更可能）
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2))

  //テスト用オブジェクト
  const testCube = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.4, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xff5533 }),
  )
  const CUBE_HOME = new THREE.Vector3(0, -0.3, -2)
  testCube.position.copy(CUBE_HOME)
  scene.add(testCube)

  /** キューブを相対移動する（デバッグ用リモコンから呼ぶ） */
  const moveCube = (dx = 0, dy = 0, dz = 0) => {
    testCube.position.x += dx
    testCube.position.y += dy
    testCube.position.z += dz
  }
  const resetCube = () => testCube.position.copy(CUBE_HOME)

  const enemies = []

  /**
   * 画面上の点 (screenX, screenY) の方向、カメラから SPAWN_DISTANCE 先に敵を出す。
   * enemy: ENEMIES の要素
   */
  const spawnEnemy = async (enemy, screenX, screenY) => {
    // 画面座標 → Three.js カメラからのレイ → レイ上の点
    _ndc.set((screenX / window.innerWidth) * 2 - 1, -(screenY / window.innerHeight) * 2 + 1)
    camera.updateMatrixWorld()
    _raycaster.setFromCamera(_ndc, camera)
    const center = _raycaster.ray.at(SPAWN_DISTANCE, new THREE.Vector3())

    const model = await loadEnemyModel(enemy.modelUrl)
    if (!running) return null // 読み込み中に dispose された

    // 表示サイズを enemy.height [m] に揃える
    _box.setFromObject(model).getSize(_size)
    model.scale.setScalar(enemy.height / _size.y)

    // 原点が足元なので、モデルの中心がレイ上の点に来るよう半分下げる
    model.position.set(center.x, center.y - enemy.height / 2, center.z)
    // 顔（+Z）をカメラに向ける。水平方向だけ回して傾かないようにする
    model.lookAt(camera.position.x, model.position.y, camera.position.z)

    model.userData.enemy = enemy
    scene.add(model)
    enemies.push(model)
    return model
  }

  /** 出ている敵を全て消す */
  const clearEnemies = () => {
    for (const model of enemies) {
      scene.remove(model)
      model.traverse((obj) => {
        obj.geometry?.dispose()
      })
    }
    enemies.length = 0
  }

  const resize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)

  let rafId = 0
  let running = true
  const loop = () => {
    if(!running) return
    onFrame?.(camera)
    testCube.rotation.y += 0.01
    renderer.render(scene, camera)
    rafId = requestAnimationFrame(loop)
  }
  loop()

  return {
    scene,
    camera,
    renderer,
    moveCube,
    resetCube,
    spawnEnemy,
    clearEnemies,
    dispose() {
      running = false
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      clearEnemies()
      testCube.geometry.dispose()
      testCube.material.dispose()
      renderer.dispose()
    },
  }
}