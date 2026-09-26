import * as THREE from 'three'
import { loadEnemyModel } from '../enemy/loadEnemyModel'
import { createHitEffect, updateHitEffects } from './hitEffect'

const _zee = new THREE.Vector3(0, 0, 1)
const _euler = new THREE.Euler()
const _q0 = new THREE.Quaternion()
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)) // X 軸 -90° 補正
const DEG = Math.PI / 180

const SPAWN_DISTANCE = 0.5 // カメラから敵までの距離 [m]
const DAMAGE_FLASH_MS = 150 // ダメージ演出で白く光る時間
const DAMAGE_SQUASH_MS = 100 // ダメージ演出で潰れる時間
const PROJECTILE_HIT_DISTANCE = 0.15 // 魔法弾がこの距離 [m] まで近づいたら着弾
const PROJECTILE_LERP = 0.15 // 魔法弾が毎フレーム敵へ寄る割合
const _raycaster = new THREE.Raycaster()
const _ndc = new THREE.Vector2()
const _box = new THREE.Box3()
const _size = new THREE.Vector3()
const _center = new THREE.Vector3()
const _white = new THREE.Color(0xffffff)
const _black = new THREE.Color(0x000000)

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

  // 照明: 全体を底上げする環境光 + 空/地面の色味 + カメラ側から当てる光
  scene.add(new THREE.AmbientLight(0xffffff, 0.8))
  scene.add(new THREE.HemisphereLight(0xffffff, 0x999999, 1.2))
  // カメラの子にして、端末をどちらに向けても敵の正面（プレイヤー側）が明るくなるようにする
  const frontLight = new THREE.DirectionalLight(0xffffff, 1.6)
  frontLight.position.set(0.5, 1, 0) // カメラから見て右上
  frontLight.target.position.set(0, 0, -1) // カメラの正面方向を照らす
  camera.add(frontLight, frontLight.target)
  scene.add(camera) // カメラの子の光を描画に含めるため

  const enemies = [] // 出ている敵のモデル
  const projectiles = [] // 飛翔中の魔法弾 { mesh, target, onHit }
  let rafId = 0
  let running = true
  let damageTimer = 0
  let squashTimer = 0
  let isDefeated = false // 撃破演出中なら true

  /** モデルの中心（ワールド座標）を out に入れて返す */
  const centerOf = (model, out) => _box.setFromObject(model).getCenter(out)

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
    model.userData.baseScale = model.scale.x // ダメージ演出で戻すときの基準

    // 原点が足元なので、モデルの中心がレイ上の点に来るよう半分下げる
    model.position.set(center.x, center.y - enemy.height / 2, center.z)
    // 顔（+Z）をカメラに向ける。水平方向だけ回して傾かないようにする
    model.lookAt(camera.position.x, model.position.y, camera.position.z)

    model.userData.enemy = enemy
    scene.add(model)
    enemies.push(model)
    return model
  }

  /** 飛んでいる魔法弾を全て消す */
  const clearProjectiles = () => {
    for (const proj of projectiles) {
      scene.remove(proj.mesh)
      proj.mesh.geometry.dispose()
      proj.mesh.material.dispose()
    }
    projectiles.length = 0
  }

  /** 出ている敵を全て消す */
  const clearEnemies = () => {
    clearProjectiles()
    for (const model of enemies) {
      scene.remove(model)
      model.traverse((obj) => {
        obj.geometry?.dispose()
        obj.material?.dispose()
      })
    }
    enemies.length = 0
    isDefeated = false
  }

  /** 出ている敵全員の emissive を color にする */
  const setEnemiesEmissive = (color) => {
    for (const model of enemies) {
      model.traverse((obj) => {
        obj.material?.emissive?.copy(color)
      })
    }
  }

  /** 出ている敵全員の scale を基準の (sx, sy, sz) 倍にする */
  const setEnemiesSquash = (sx, sy, sz) => {
    for (const model of enemies) {
      const base = model.userData.baseScale ?? 1
      model.scale.set(base * sx, base * sy, base * sz)
    }
  }

  /**
   * ダメージを受けた演出：敵を一瞬白く光らせ、潰して戻し、リングと粒子を出す。
   * hitPosition を省略すると各敵の中心にエフェクトを出す
   */
  const playDamageEffect = (hitPosition) => {
    setEnemiesEmissive(_white)
    clearTimeout(damageTimer)
    damageTimer = setTimeout(() => {
      if (running) setEnemiesEmissive(_black)
    }, DAMAGE_FLASH_MS)

    if (!isDefeated) {
      setEnemiesSquash(1.3, 0.8, 1.3)
      clearTimeout(squashTimer)
      squashTimer = setTimeout(() => {
        if (running && !isDefeated) setEnemiesSquash(1, 1, 1)
      }, DAMAGE_SQUASH_MS)
    }

    if (hitPosition) {
      createHitEffect(scene, camera, hitPosition)
    } else {
      for (const model of enemies) createHitEffect(scene, camera, centerOf(model, _center))
    }
  }

  /**
   * 魔法弾を撃つ。カメラの少し下・前から出て、一番手前の敵へ飛んでいく。
   * 着弾したら playDamageEffect と onHit() を呼ぶ。敵がいなければ何もしない
   */
  const shootMagic = (onHit) => {
    const target = enemies[0]
    if (!target || isDefeated) return

    const projectile = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x00ffff }),
    )
    // AR なので「現在のカメラの位置・向き」を基準に、手前・少し下から発射させる
    projectile.position.copy(camera.position)
    projectile.quaternion.copy(camera.quaternion)
    projectile.translateY(-0.1)
    projectile.translateZ(-0.1)

    scene.add(projectile)
    projectiles.push({ mesh: projectile, target, onHit })
  }

  /** 撃破演出を開始する。以降、敵は回転しながら縮んで消える */
  const playDefeatEffect = () => {
    isDefeated = true
    clearProjectiles()
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

    // 1. 撃破演出：回転しながら縮み、十分小さくなったら非表示にする
    if (isDefeated) {
      for (const model of enemies) {
        model.rotation.x += 0.1
        model.rotation.y += 0.1
        if (model.scale.x > (model.userData.baseScale ?? 1) * 0.05) {
          model.scale.multiplyScalar(0.9)
        } else {
          model.visible = false
        }
      }
    }

    // 2. 魔法弾の追尾と着弾判定
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const proj = projectiles[i]
      centerOf(proj.target, _center)
      proj.mesh.position.lerp(_center, PROJECTILE_LERP)

      if (proj.mesh.position.distanceTo(_center) < PROJECTILE_HIT_DISTANCE) {
        scene.remove(proj.mesh)
        proj.mesh.geometry.dispose()
        proj.mesh.material.dispose()
        projectiles.splice(i, 1)

        playDamageEffect(proj.mesh.position)
        proj.onHit?.() // App.jsx 側の HP 減算など
      }
    }

    // 3. hitEffect.js のリング・粒子を進める
    updateHitEffects()

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
    shootMagic,
    playDefeatEffect,
    dispose() {
      running = false
      cancelAnimationFrame(rafId)
      clearTimeout(damageTimer)
      clearTimeout(squashTimer)
      window.removeEventListener('resize', resize)
      clearEnemies()
      renderer.dispose()
    },
  }
}
