import * as THREE from 'three'
import { loadEnemyModel } from '../enemy/loadEnemyModel'
import { loadModel } from '../item/loadModel'
import { findItem } from '../item/items'
import { createHitEffect, updateHitEffects } from './hitEffect'
import { createHpBar } from './hpBar'
import { perfStart } from '../debug/perfLog' // [perf]

const _zee = new THREE.Vector3(0, 0, 1)
const _euler = new THREE.Euler()
const _q0 = new THREE.Quaternion()
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)) // X 軸 -90° 補正
const DEG = Math.PI / 180

const SPAWN_DISTANCE = 0.5 // カメラから敵までの距離 [m]
const DAMAGE_FLASH_MS = 150 // ダメージ演出で白く光る時間
const DAMAGE_SQUASH_MS = 100 // ダメージ演出で潰れている時間
const DEFEAT_MIN_SCALE = 0.05 // 撃破演出でこの倍率まで縮んだら消す
const HP_BAR_GAP = 0.04 // 敵の頭のてっぺんから HP ゲージまでの距離 [m]
const PROJECTILE_HIT_DISTANCE = 0.15 // 魔法弾がこの距離 [m] まで近づいたら着弾
const PROJECTILE_LERP = 0.15 // 魔法弾が毎フレーム敵へ寄る割合
const DROP_FLOAT_Y = 0.15 // ドロップを敵の足元から浮かせる高さ [m]
const DROP_SPIN = 0.02 // ドロップの毎フレームの回転量 [rad]
const DROP_IDLE_MS = 800 // ドロップが足元で回って見えている時間。過ぎるとプレイヤーへ吸い寄せられる
const DROP_ATTRACT_LERP = 0.12 // 吸い寄せ中に毎フレーム手元へ寄る割合（魔法弾より少し遅い）
const DROP_ATTRACT_SHRINK = 0.93 // 吸い寄せ中に毎フレーム縮む倍率
const DROP_COLLECT_DISTANCE = 0.05 // 手元からこの距離 [m] まで来たら回収完了
const _raycaster = new THREE.Raycaster()
const _ndc = new THREE.Vector2()
const _box = new THREE.Box3()
const _size = new THREE.Vector3()
const _center = new THREE.Vector3()
const _barPos = new THREE.Vector3()
const _collectPoint = new THREE.Vector3(0, -0.15, -0.3) // ドロップの吸い寄せ先（カメラローカル：画面中央やや下、30cm 手前）
const _target = new THREE.Vector3() // 吸い寄せ先のワールド座標（毎フレーム計算）
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
 * onItemCollect(item): 敵が落としたアイテムがプレイヤーの手元に届いて消えたときに呼ばれる（item は ITEMS の要素）
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

  let enemyModel = null // 出ている敵のモデル（同時に出るのは 1 体だけ）
  let dropModel = null // 出ているドロップアイテムのモデル（同時に出るのは 1 個だけ）
  const projectiles = [] // 飛翔中の魔法弾 { mesh, target, onHit }
  let rafId = 0
  let running = true
  let damageTimer = 0
  let squashTimer = 0
  let isDefeated = false // 撃破演出中（縮んで消える途中）なら true
  let hasDropped = false // 今の敵のドロップ処理を済ませたら true

  /** モデルの中心（ワールド座標）を out に入れて返す */
  const centerOf = (model, out) => _box.setFromObject(model).getCenter(out)

  /**
   * 読み込んだモデルを AR 空間に置ける状態にする（敵・アイテム共通）。
   * マテリアルを個体ごとに複製し、表示サイズを height [m] に揃え、
   * 演出で scale を戻すときの基準 baseScale を記録する
   */
  const prepareModel = (model, height) => {
    // clone() はマテリアルを共有するので、この個体だけ色を変えられるよう複製する
    model.traverse((obj) => {
      if (obj.material) obj.material = obj.material.clone()
    })
    _box.setFromObject(model).getSize(_size)
    model.scale.setScalar(height / _size.y)
    model.userData.baseScale = model.scale.x
    return model
  }

  /**
   * 画面上の点 (screenX, screenY) の方向、カメラから SPAWN_DISTANCE 先に敵を出す。
   * 既に敵が出ていれば先に消してから出す。
   * enemy: ENEMIES の要素
   */
  const spawnEnemy = async (enemy, screenX, screenY) => {
    // 画面座標 → Three.js カメラからのレイ → レイ上の点
    _ndc.set((screenX / window.innerWidth) * 2 - 1, -(screenY / window.innerHeight) * 2 + 1)
    camera.updateMatrixWorld()
    _raycaster.setFromCamera(_ndc, camera)
    const center = _raycaster.ray.at(SPAWN_DISTANCE, new THREE.Vector3())

    const endLoad = perfStart(`${enemy.id} のモデル読み込み（検出 → 表示）`) // [perf]
    const model = await loadEnemyModel(enemy.modelUrl)
    endLoad() // [perf]
    if (!running) return null // 読み込み中に dispose された
    prepareModel(model, enemy.height)

    // 原点が足元なので、モデルの中心がレイ上の点に来るよう半分下げる
    model.position.set(center.x, center.y - enemy.height / 2, center.z)
    // 顔（+Z）をカメラに向ける。水平方向だけ回して傾かないようにする
    model.lookAt(camera.position.x, model.position.y, camera.position.z)

    model.userData.enemy = enemy
    // HP ゲージは敵の子にすると変形・回転に巻き込まれるので scene に直接置き、毎フレーム頭上に合わせる
    model.userData.hpBar = createHpBar()
    clearEnemy() // 前の敵が残っていれば入れ替える
    scene.add(model, model.userData.hpBar.group)
    enemyModel = model
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

  /** 出ているドロップを消す（いなければ何もしない） */
  const clearDrop = () => {
    if (!dropModel) return
    scene.remove(dropModel)
    dropModel.traverse((obj) => {
      obj.geometry?.dispose()
      obj.material?.dispose()
    })
    dropModel = null
  }

  /**
   * ドロップを回収する：消して onItemCollect(item) を呼ぶ。いなければ何もしない。
   * clearEnemy() 経由の片付けとは違い、こちらは「手に入れた」扱い
   */
  const collectDrop = () => {
    if (!dropModel) return
    const item = dropModel.userData.item
    clearDrop()
    if (running && item) onItemCollect?.(item)
  }

  /**
   * ドロップアイテムを position（敵の足元）の少し上に出す。
   * item: ITEMS の要素。既にドロップが出ていれば入れ替える。
   * 出た直後は 'idle'（その場で回転）、DROP_IDLE_MS 後に 'attract'（手元へ吸い寄せ）に移る
   */
  const spawnDrop = async (item, position) => {
    const model = await loadModel(item.modelUrl)
    if (!running || !model) return null // 読み込み中に dispose された、または modelUrl が無い
    prepareModel(model, item.height)

    // 敵と同じく足元を position に置く。原点が中心にあるモデルでも足元が揃うよう最下点分だけ持ち上げる
    _box.setFromObject(model)
    model.position.copy(position)
    model.position.y += DROP_FLOAT_Y - _box.min.y
    model.userData.item = item
    model.userData.state = 'idle'
    model.userData.spawnedAt = performance.now()

    clearDrop()
    scene.add(model)
    dropModel = model
    return model
  }

  /** 出ている敵を消す（いなければ何もしない）。HP ゲージ・ドロップ・魔法弾も一緒に消す */
  const clearEnemy = () => {
    clearDrop()
    clearProjectiles()
    if (enemyModel) {
      scene.remove(enemyModel)
      enemyModel.userData.hpBar?.dispose()
      enemyModel.traverse((obj) => {
        obj.geometry?.dispose()
        obj.material?.dispose()
      })
      enemyModel = null
    }
    isDefeated = false
    hasDropped = false
  }

  /** 出ている敵の HP ゲージを ratio（0〜1。残り HP ÷ 最大 HP）にする */
  const setEnemyHpRatio = (ratio) => {
    enemyModel?.userData.hpBar?.setRatio(ratio)
  }

  /** HP ゲージを敵の頭上に合わせ、減る様子を 1 フレーム進める */
  const updateHpBar = () => {
    if (!enemyModel) return
    _barPos.copy(enemyModel.position)
    _barPos.y += enemyModel.userData.enemy.height + HP_BAR_GAP // 原点が足元なので、身長ぶん上が頭のてっぺん
    enemyModel.userData.hpBar.update(camera, _barPos)
  }

  /** 出ている敵の emissive を color にする */
  const setEnemyEmissive = (color) => {
    enemyModel?.traverse((obj) => {
      obj.material?.emissive?.copy(color)
    })
  }

  /** 出ている敵の scale を基準の (sx, sy, sz) 倍にする */
  const setEnemySquash = (sx, sy, sz) => {
    if (!enemyModel) return
    const base = enemyModel.userData.baseScale ?? 1
    enemyModel.scale.set(base * sx, base * sy, base * sz)
  }

  /**
   * ダメージを受けた演出：敵を一瞬白く光らせ、潰して戻し、リングと粒子を出す。
   * hitPosition を省略すると敵の中心にエフェクトを出す。敵がいなければ何もしない
   */
  const playDamageEffect = (hitPosition) => {
    if (!enemyModel) return
    setEnemyEmissive(_white)
    clearTimeout(damageTimer)
    damageTimer = setTimeout(() => {
      if (running) setEnemyEmissive(_black)
    }, DAMAGE_FLASH_MS)

    if (!isDefeated) {
      setEnemySquash(1.3, 0.8, 1.3)
      clearTimeout(squashTimer)
      squashTimer = setTimeout(() => {
        if (running && !isDefeated) setEnemySquash(1, 1, 1)
      }, DAMAGE_SQUASH_MS)
    }

    createHitEffect(scene, camera, hitPosition ?? centerOf(enemyModel, _center))
  }

  /**
   * 魔法弾を撃つ。カメラの少し下・前から出て、出ている敵へ飛んでいく。
   * 着弾したら playDamageEffect と onHit() を呼ぶ。
   * 敵がいない・撃破演出中なら何もせず false を返す。撃てたら true
   */
  const shootMagic = (onHit) => {
    const target = enemyModel
    if (!target || isDefeated) return false

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
    return true
  }

  /** 撃破演出を開始する。以降、敵は回転しながら縮んで消え、消えたらアイテムを落とす（処理は loop 内） */
  const playDefeatEffect = () => {
    if (!enemyModel) return
    clearTimeout(squashTimer)
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

    // 1. 撃破演出：回転しながら縮み、十分小さくなったら非表示にしてドロップを出す
    if (isDefeated && enemyModel) {
      enemyModel.rotation.x += 0.1
      enemyModel.rotation.y += 0.1
      if (enemyModel.scale.x > (enemyModel.userData.baseScale ?? 1) * DEFEAT_MIN_SCALE) {
        enemyModel.scale.multiplyScalar(0.9)
      } else {
        enemyModel.visible = false
        enemyModel.userData.hpBar.group.visible = false
        // 敵が消えた直後に 1 回だけドロップを出す
        if (!hasDropped) {
          hasDropped = true
          const item = findItem(enemyModel.userData.enemy?.drop)
          if (item) spawnDrop(item, enemyModel.position)
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

    // 3. HP ゲージを頭上に追従させ、hitEffect.js のリング・粒子を進める
    updateHpBar()
    updateHitEffects()

    // 4. ドロップの演出：しばらく足元で回り、その後プレイヤーの手元へ吸い寄せられて消える
    if (dropModel) {
      const data = dropModel.userData
      if (data.state === 'idle') {
        dropModel.rotation.y += DROP_SPIN
        if (performance.now() - data.spawnedAt >= DROP_IDLE_MS) data.state = 'attract'
      } else if (data.state === 'attract') {
        // 吸い寄せ先はカメラ基準なので、端末を動かしても手元に追従する
        camera.localToWorld(_target.copy(_collectPoint))
        dropModel.position.lerp(_target, DROP_ATTRACT_LERP)
        dropModel.scale.multiplyScalar(DROP_ATTRACT_SHRINK)
        dropModel.rotation.y += DROP_SPIN * 3 // 速く回して勢いを出す
        const smallEnough = dropModel.scale.x < (data.baseScale ?? 1) * 0.05
        if (smallEnough || dropModel.position.distanceTo(_target) < DROP_COLLECT_DISTANCE) collectDrop()
      }
    }

    renderer.render(scene, camera)
    rafId = requestAnimationFrame(loop)
  }
  loop()

  return {
    scene,
    camera,
    renderer,
    spawnEnemy,
    clearEnemy,
    spawnDrop,
    clearDrop,
    collectDrop,
    setEnemyHpRatio,
    playDamageEffect,
    shootMagic,
    playDefeatEffect,
    dispose() {
      running = false
      cancelAnimationFrame(rafId)
      clearTimeout(damageTimer)
      clearTimeout(squashTimer)
      window.removeEventListener('resize', resize)
      clearEnemy()
      renderer.dispose()
    },
  }
}
