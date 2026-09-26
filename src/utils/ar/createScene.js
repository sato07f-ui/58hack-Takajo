import * as THREE from 'three'
import { loadEnemyModel } from '../enemy/loadEnemyModel'
import { createHitEffect, updateHitEffects } from './hitEffect'
import { spawnItem, updateItems, clearItems } from './itemDrop'
import { ITEMS } from '../item/items'

const _zee = new THREE.Vector3(0, 0, 1)
const _euler = new THREE.Euler()
const _q0 = new THREE.Quaternion()
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)) // X 軸 -90° 補正
const DEG = Math.PI / 180

const SPAWN_DISTANCE = 0.5 // カメラから敵までの距離 [m]
const DAMAGE_FLASH_MS = 150 // ダメージ演出で白く光る時間
const DAMAGE_SQUASH_MS = 100 // ダメージ演出で潰れている時間
const DEFEAT_MIN_SCALE = 0.05 // 撃破演出でこの倍率まで縮んだら消す
const _raycaster = new THREE.Raycaster()
const _ndc = new THREE.Vector2()
const _box = new THREE.Box3()
const _size = new THREE.Vector3()
const _white = new THREE.Color(0xffffff)
const _black = new THREE.Color(0x000000)
const _hitPos = new THREE.Vector3()

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
 * onItemCollect(item): 敵が落としたアイテムをプレイヤーが拾ったときに呼ばれる（item は ITEMS の要素）
 * 戻り値の dispose() を呼ぶと全て停止・破棄する。
 */
export const createScene = (canvas, { onFrame, onItemCollect } = {}) => {
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

  // 照明: 全体を底上げする環境光 + 空/地面の色味 + カメラ側から当てる光
  scene.add(new THREE.AmbientLight(0xffffff, 0.8))
  scene.add(new THREE.HemisphereLight(0xffffff, 0x999999, 1.2))
  // カメラの子にして、端末をどちらに向けても敵の正面（プレイヤー側）が明るくなるようにする
  const frontLight = new THREE.DirectionalLight(0xffffff, 1.6)
  frontLight.position.set(0.5, 1, 0) // カメラから見て右上
  frontLight.target.position.set(0, 0, -1) // カメラの正面方向を照らす
  camera.add(frontLight, frontLight.target)
  scene.add(camera) // カメラの子の光を描画に含めるため

  const enemies = []
  let rafId = 0
  let running = true
  let damageTimer = 0
  let squashTimer = 0
  let isDefeated = false // 撃破演出中（縮んで消える途中）か

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

    // clone() はマテリアルを共有するので、この個体だけ色を変えられるよう複製する
    model.traverse((obj) => {
      if (obj.material) obj.material = obj.material.clone()
    })

    // 表示サイズを enemy.height [m] に揃える
    _box.setFromObject(model).getSize(_size)
    model.scale.setScalar(enemy.height / _size.y)

    // 原点が足元なので、モデルの中心がレイ上の点に来るよう半分下げる
    model.position.set(center.x, center.y - enemy.height / 2, center.z)
    // 顔（+Z）をカメラに向ける。水平方向だけ回して傾かないようにする
    model.lookAt(camera.position.x, model.position.y, camera.position.z)

    model.userData.enemy = enemy
    model.userData.baseScale = model.scale.x // 変形・撃破演出で元の大きさに戻すため
    isDefeated = false
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
        obj.material?.dispose()
      })
    }
    enemies.length = 0
  }

  /** 出ている敵全員の emissive を color にする */
  const setEnemiesEmissive = (color) => {
    for (const model of enemies) {
      model.traverse((obj) => {
        obj.material?.emissive?.copy(color)
      })
    }
  }

  /** 出ている敵全員を、元の大きさに対して (x, y, z) 倍にする */
  const setEnemiesScale = (x, y, z) => {
    for (const model of enemies) {
      const base = model.userData.baseScale
      model.scale.set(base * x, base * y, base * z)
    }
  }

  /** ダメージを受けた演出：出ている敵を一瞬白く光らせ、潰し、ヒットエフェクトを出す */
  const playDamageEffect = () => {
    if (isDefeated) return

    setEnemiesEmissive(_white)
    clearTimeout(damageTimer)
    damageTimer = setTimeout(() => {
      if (running) setEnemiesEmissive(_black)
    }, DAMAGE_FLASH_MS)

    setEnemiesScale(1.3, 0.8, 1.3)
    clearTimeout(squashTimer)
    squashTimer = setTimeout(() => {
      if (running && !isDefeated) setEnemiesScale(1, 1, 1)
    }, DAMAGE_SQUASH_MS)

    // 原点が足元なので、エフェクトは体の中心に出す
    for (const model of enemies) {
      _hitPos.copy(model.position)
      _hitPos.y += model.userData.enemy.height / 2
      createHitEffect(scene, camera, _hitPos)
    }
  }

  /** 撃破演出：出ている敵を回転しながら縮ませ、消えたらアイテムを落とす（処理は loop 内） */
  const playDefeatEffect = () => {
    if (enemies.length === 0) return
    clearTimeout(squashTimer)
    isDefeated = true
  }

  /** 撃破演出を 1 フレーム進める */
  const updateDefeat = () => {
    if (!isDefeated) return
    for (const model of enemies) {
      model.rotation.y += 0.1
      model.scale.multiplyScalar(0.9)
    }
    if (enemies[0].scale.x > enemies[0].userData.baseScale * DEFEAT_MIN_SCALE) return

    // 消えきったら、体の中心があった位置にアイテムを落とす
    for (const model of enemies) {
      _hitPos.copy(model.position)
      _hitPos.y += model.userData.enemy.height / 2
      const item = ITEMS[model.userData.enemy.dropItemId]
      if (item) spawnItem(scene, _hitPos, { item, onCollect: onItemCollect })
    }
    clearEnemies()
    isDefeated = false
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

  const loop = () => {
    if (!running) return
    onFrame?.(camera)
    updateDefeat()
    updateHitEffects()
    updateItems(camera)
    renderer.render(scene, camera)
    rafId = requestAnimationFrame(loop)
  }
  loop()

  return {
    scene,
    camera,
    renderer,
    spawnEnemy,
    clearEnemies,
    playDamageEffect,
    playDefeatEffect,
    dispose() {
      running = false
      cancelAnimationFrame(rafId)
      clearTimeout(damageTimer)
      clearTimeout(squashTimer)
      window.removeEventListener('resize', resize)
      clearEnemies()
      clearItems()
      renderer.dispose()
    },
  }
}
