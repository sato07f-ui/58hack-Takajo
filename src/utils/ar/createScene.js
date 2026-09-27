import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { loadEnemyModel } from '../enemy/loadEnemyModel'
import { loadModel } from '../item/loadModel'
import { findItem } from '../item/items'
import { createHitEffect, updateHitEffects } from './hitEffect'
import { createHpBar } from './hpBar'
import { ENEMY_FOLLOW } from './enemyFollow'
import { createBossSpotlight } from './bossSpotlight'
import { ATTACK_WINDUP_MS } from '../battle/enemyAttackRule'
import { perfStart } from '../debug/perfLog' // [perf]

const _zee = new THREE.Vector3(0, 0, 1)
const _euler = new THREE.Euler()
const _q0 = new THREE.Quaternion()
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)) // X 軸 -90° 補正
const DEG = Math.PI / 180

const FACE_TILT = 1.0 // fixed の敵をカメラの方へ傾ける割合（0: まっすぐ立つ, 1: 顔がカメラを真正面に見る）
const MAX_FACE_TILT_DEG = 60 // 傾ける角度の上限（真上・真下から見たときに倒れすぎないように）
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
const ENEMY_SHOT_LERP = 0.07 // 敵弾が毎フレーム手元へ寄る割合（魔法弾より遅くして、飛んでくるのを見せる）
const ENEMY_SHOT_HIT_DISTANCE = 0.05 // 手元からこの距離 [m] まで来たら被弾
const ENEMY_SHOT_RADIUS = 0.04 // 敵弾の半径 [m]
const ENEMY_SHOT_COLOR = 0xff3366
const WINDUP_BLINK_MS = 100 // 溜め中に赤く点滅する周期の半分
const WINDUP_SWELL = 1.1 // 溜め中に膨らむ倍率
const _raycaster = new THREE.Raycaster()
const _ndc = new THREE.Vector2()
const _box = new THREE.Box3()
const _size = new THREE.Vector3()
const _center = new THREE.Vector3()
const _barPos = new THREE.Vector3()
const _collectPoint = new THREE.Vector3(0, -0.15, -0.3) // ドロップの吸い寄せ先（カメラローカル：画面中央やや下、30cm 手前）
const _target = new THREE.Vector3() // 吸い寄せ先・敵弾の行き先のワールド座標（毎フレーム計算）
const _playerPoint = new THREE.Vector3(0, -0.03, -0.2) // 敵弾の行き先（カメラローカル：画面中央やや下、20cm 手前）
const _up = new THREE.Vector3(0, 1, 0)
const _faceMatrix = new THREE.Matrix4()
const _modelUp = new THREE.Vector3()
const _screenUp = new THREE.Vector3() // 画面の上方向（ワールド座標）
const _followTarget = new THREE.Vector3() // 追従先（敵の中心を置きたい位置）
const _prevAnchor = new THREE.Vector3()
const _screenCenterDir = new THREE.Vector3(0, 0, -1) // カメラローカルの画面中央方向
const _lineStart = new THREE.Vector3(0, -0.08, -0.15) // 追従線の始点（カメラローカル：手元のやや下）
const _toCamera = new THREE.Vector3()
const _white = new THREE.Color(0xffffff)
const _black = new THREE.Color(0x000000)
const _red = new THREE.Color(0xaa0000) // 溜め中の emissive

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
 * 戻り値の enemyAttack({ onHit, onEnd }) で敵に攻撃させ、cancelEnemyAttack() で攻撃を取り消す。
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
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x999999, 1.2)
  scene.add(ambientLight, hemisphereLight)
  // カメラの子にして、端末をどちらに向けても敵の正面（プレイヤー側）が明るくなるようにする
  const frontLight = new THREE.DirectionalLight(0xffffff, 1.6)
  frontLight.position.set(0.5, 1, 0) // カメラから見て右上
  frontLight.target.position.set(0, 0, -1) // カメラの正面方向を照らす
  camera.add(frontLight, frontLight.target)
  scene.add(camera) // カメラの子の光を描画に含めるため

  // 金属の映り込み用の環境（部屋の照明を模したもの）。enemy.envMapIntensity を持つ敵にだけ当てる
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()

  let enemyModel = null // 出ている敵のモデル（同時に出るのは 1 体だけ）
  // 手元から敵の中心までの線（位置の調整用。ENEMY_FOLLOW.showLine で表示を切り替える）
  const followLine = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)),
    new THREE.LineBasicMaterial({ color: 0xff00ff, depthTest: false }),
  )
  followLine.renderOrder = 1 // 敵より手前に描く
  followLine.frustumCulled = false // 頂点を毎フレーム書き換えるので、古い範囲で消されないようにする
  followLine.visible = false
  scene.add(followLine)
  let dropModel = null // 出ているドロップアイテムのモデル（同時に出るのは 1 個だけ）
  const projectiles = [] // 飛翔中の魔法弾 { mesh, target, onHit }
  let rafId = 0
  let running = true
  let damageTimer = 0
  let squashTimer = 0
  let isDefeated = false // 撃破演出中（縮んで消える途中）なら true
  let hasDropped = false // 今の敵のドロップ処理を済ませたら true
  let defeatDropId = null // 撃破した敵が落とすアイテムの id（playDefeatEffect で決まる）
  let spotlight = null // ラスボスのスポットライト演出（出ている間だけ）
  // 敵の攻撃 { state: 'windup' | 'fly', startedAt, mesh, onHit, onEnd }。攻撃していなければ null（同時に 1 つだけ）
  let enemyAttack = null

  /** モデルの中心（ワールド座標）を out に入れて返す */
  const centerOf = (model, out) => _box.setFromObject(model).getCenter(out)

  /**
   * 読み込んだモデルを AR 空間に置ける状態にする（敵・アイテム共通）。
   * マテリアルを個体ごとに複製し、表示サイズを height [m] に揃え、
   * 演出で scale を戻すときの基準 baseScale を記録する。
   * envMapIntensity を渡すと映り込みの環境を当てる（暗くなりやすい黒い体・金属の金を明るく見せる）
   */
  const prepareModel = (model, height, envMapIntensity) => {
    // clone() はマテリアルを共有するので、この個体だけ色を変えられるよう複製する
    model.traverse((obj) => {
      if (!obj.material) return
      obj.material = obj.material.clone()
      // 演出で emissive を変えた後に戻す色（ラスボスの目・宝石のように元から光っている部分を消さないため）
      obj.material.userData.baseEmissive = obj.material.emissive?.clone()
      if (envMapIntensity) {
        obj.material.envMap = envMap
        obj.material.envMapIntensity = envMapIntensity
      }
    })
    _box.setFromObject(model).getSize(_size)
    model.scale.setScalar(height / _size.y)
    model.userData.baseScale = model.scale.x
    return model
  }

  /** 画面の上方向（ワールド座標）を _screenUp に入れて返す */
  const screenUp = () => _screenUp.copy(_up).applyQuaternion(camera.quaternion)

  /**
   * 敵の顔（+Z）をカメラに向け、頭を画面の上に向ける。見上げても見下ろしても、端末を傾けても正面が見える。
   * 世界の真上（+Y）を基準にすると、真下付近を見たときに少しの傾きで上下逆になるため、画面の上方向を基準にする。
   * 回転の中心はモデルの中心（userData.anchor）。原点は足元なので、回した分だけ足元の位置をずらす
   */
  const faceCamera = (model) => {
    const { anchor, enemy } = model.userData
    // Matrix4.lookAt(eye, target) は -Z を target に向けるので、逆向きに渡して +Z をカメラに向ける
    _faceMatrix.lookAt(camera.position, anchor, screenUp())
    model.quaternion.setFromRotationMatrix(_faceMatrix)
    // 足元 = 中心から「モデルの上方向」に身長の半分だけ下
    model.position.copy(anchor).addScaledVector(_modelUp.copy(_up).applyQuaternion(model.quaternion), -enemy.height / 2)
  }

  /**
   * 敵の中心（userData.anchor）を、カメラから伸びる線の上の目標位置へ寄せる。
   * 線の向きは出現時の画面位置（userData.localDir）、距離・ずらし・追従の速さは ENEMY_FOLLOW で決まる
   */
  const followCamera = (model) => {
    const { anchor, localDir } = model.userData
    const { distance, offsetX, offsetY, smooth, keepSpawnDirection } = ENEMY_FOLLOW
    // カメラローカルで目標を作り、カメラの向き・位置でワールド座標にする
    _followTarget
      .copy(keepSpawnDirection ? localDir : _screenCenterDir)
      .multiplyScalar(distance)
    _followTarget.x += offsetX
    _followTarget.y += offsetY
    _followTarget.applyQuaternion(camera.quaternion).add(camera.position)

    _prevAnchor.copy(anchor)
    anchor.lerp(_followTarget, smooth)
    // 撃破演出中は向きを変えない（faceCamera を呼ばない）ので、動いた分だけ位置をずらして一緒に運ぶ
    model.position.add(_prevAnchor.sub(anchor).negate())
  }

  /**
   * fixed の敵（ラスボス）の向きを出現時に 1 回だけ決める。顔（+Z）を水平にカメラへ向け、
   * カメラを見上げる（見下ろす）角度だけ体を後ろ（前）に傾ける。体は世界の上方向を基準に立つので、スポットライトの光の筋とずれない
   */
  const faceCameraUpright = (model) => {
    const { anchor, enemy } = model.userData
    model.position.copy(anchor)
    model.lookAt(camera.position.x, anchor.y, camera.position.z)
    _toCamera.subVectors(camera.position, anchor)
    const pitch = Math.atan2(_toCamera.y, Math.hypot(_toCamera.x, _toCamera.z)) // カメラが上にあると正
    const maxTilt = MAX_FACE_TILT_DEG * DEG
    model.rotateX(-THREE.MathUtils.clamp(pitch * FACE_TILT, -maxTilt, maxTilt))
    // 原点が足元なので、体の中心が anchor に来るよう、傾けた体の上方向に半分ずらす
    model.position.addScaledVector(_modelUp.copy(_up).applyQuaternion(model.quaternion), -enemy.height / 2)
  }

  /** 追従線（手元 → 敵の中心）を今の位置に合わせる。ENEMY_FOLLOW.showLine が false か敵がいなければ隠す */
  const updateFollowLine = () => {
    followLine.visible = Boolean(ENEMY_FOLLOW.showLine && enemyModel?.visible)
    if (!followLine.visible) return
    const points = followLine.geometry.attributes.position
    _followTarget.copy(_lineStart).applyQuaternion(camera.quaternion).add(camera.position)
    points.setXYZ(0, _followTarget.x, _followTarget.y, _followTarget.z)
    const { anchor } = enemyModel.userData
    points.setXYZ(1, anchor.x, anchor.y, anchor.z)
    points.needsUpdate = true
  }

  /**
   * 画面上の点 (screenX, screenY) の方向、カメラから ENEMY_FOLLOW.distance（enemy.spawnDistance があればその距離）先に敵を出す。
   * 以降はカメラに追従し、画面の同じ位置に居続ける（followCamera）。enemy.fixed の敵は出た位置に留まる。
   * 既に敵が出ていれば先に消してから出す。
   * enemy: ENEMIES の要素
   */
  const spawnEnemy = async (enemy, screenX, screenY) => {
    // 画面座標 → Three.js カメラからのレイ → レイ上の点
    _ndc.set((screenX / window.innerWidth) * 2 - 1, -(screenY / window.innerHeight) * 2 + 1)
    camera.updateMatrixWorld()
    _raycaster.setFromCamera(_ndc, camera)
    const center = _raycaster.ray.at(enemy.spawnDistance ?? ENEMY_FOLLOW.distance, new THREE.Vector3())
    // spawnLift [m] だけ真上に持ち上げる。カメラより高い位置に出た fixed の敵は、こちらを見下ろす姿勢になる
    center.y += enemy.spawnLift ?? 0
    // 追従用に、レイの向きをカメラローカルで覚えておく（画面上のどこに出たか）
    const localDir = _raycaster.ray.direction.clone().applyQuaternion(camera.quaternion.clone().invert())

    const endLoad = perfStart(`${enemy.id} のモデル読み込み（検出 → 表示）`) // [perf]
    const model = await loadEnemyModel(enemy.modelUrl)
    endLoad() // [perf]
    if (!running) return null // 読み込み中に dispose された
    prepareModel(model, enemy.height, enemy.envMapIntensity)

    // モデルの中心をレイ上の点に置き、顔をカメラに向ける（fixed でなければ以降も毎フレーム追従して向け直す）
    model.userData.enemy = enemy
    model.userData.anchor = center
    model.userData.center = center // 体の中心（bossSpotlight.js が光を当てる位置）
    model.userData.localDir = localDir
    if (enemy.fixed) faceCameraUpright(model)
    else faceCamera(model)
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

  /**
   * 周りを暗くし、model（ラスボス）を闇に包む。revealSpotlight() でスポットライトを当てる。
   * 敵が消えると元に戻る
   */
  const startSpotlight = (model) => {
    spotlight?.dispose()
    spotlight = createBossSpotlight(scene, model, [ambientLight, hemisphereLight, frontLight], camera)
  }

  /** スポットライト演出を消して元の明るさに戻す（出ていなければ何もしない） */
  const clearSpotlight = () => {
    spotlight?.dispose()
    spotlight = null
  }

  /** 出ている敵を消す（いなければ何もしない）。HP ゲージ・ドロップ・魔法弾・スポットライト・敵の攻撃も一緒に消す */
  const clearEnemy = () => {
    cancelEnemyAttack() // 見た目を戻すので、敵を消す前に呼ぶ
    clearDrop()
    clearProjectiles()
    clearSpotlight()
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
    // 中心から画面の上方向に身長の半分だけ行ったところが頭のてっぺん
    const { anchor, enemy } = enemyModel.userData
    _barPos.copy(anchor).addScaledVector(screenUp(), enemy.height / 2 + HP_BAR_GAP)
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

  /** 出ている敵の emissive を元の色（prepareModel で保存したもの）に戻す */
  const restoreEnemyEmissive = () => {
    enemyModel?.traverse((obj) => {
      obj.material?.emissive?.copy(obj.material.userData.baseEmissive ?? _black)
    })
  }

  /** 溜めの見た目（赤い点滅・膨らみ）を元に戻す */
  const endWindup = () => {
    restoreEnemyEmissive()
    setEnemySquash(1, 1, 1)
  }

  /**
   * 敵が溜めてから弾を撃つ（処理は loop 内）。当たったら onHit()、攻撃が終わったら（当たった・ひるんだ）onEnd(result) を 1 回呼ぶ。
   * result は 'hit' | 'interrupted'（溜め中に魔法が当たった）。
   * 敵がいない・撃破演出中・既に攻撃中なら何もせず false を返す。始められたら true
   */
  const startEnemyAttack = ({ onHit, onEnd } = {}) => {
    if (!enemyModel || isDefeated || enemyAttack) return false
    enemyAttack = { state: 'windup', startedAt: performance.now(), mesh: null, onHit, onEnd }
    return true
  }

  /** 敵の攻撃を取り消す（溜めも飛んでいる弾も消す）。onEnd は呼ばない。攻撃していなければ何もしない */
  const cancelEnemyAttack = () => {
    if (!enemyAttack) return
    if (enemyAttack.state === 'windup') endWindup()
    if (enemyAttack.mesh) {
      scene.remove(enemyAttack.mesh)
      enemyAttack.mesh.geometry.dispose()
      enemyAttack.mesh.material.dispose()
    }
    enemyAttack = null
  }

  /**
   * ダメージを受けた演出：敵を一瞬白く光らせ、潰して戻し、リングと粒子を出す。
   * hitPosition を省略すると敵の中心にエフェクトを出す。敵がいなければ何もしない
   */
  const playDamageEffect = (hitPosition) => {
    if (!enemyModel) return
    // 溜め中に当たったらひるんで攻撃をやめる（弾は出ない）
    if (enemyAttack?.state === 'windup') {
      endWindup()
      const { onEnd } = enemyAttack
      enemyAttack = null
      onEnd?.('interrupted')
    }

    setEnemyEmissive(_white)
    clearTimeout(damageTimer)
    damageTimer = setTimeout(() => {
      if (running) restoreEnemyEmissive()
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

  /**
   * 撃破演出を開始する。以降、敵は回転しながら縮んで消え、消えたら dropId のアイテムを落とす（処理は loop 内）。
   * dropId: 落とすアイテムの id（null なら落とさない）。省略時は敵ごとの drop
   */
  const playDefeatEffect = (dropId = enemyModel?.userData.enemy?.drop ?? null) => {
    if (!enemyModel) return
    defeatDropId = dropId
    clearTimeout(squashTimer)
    cancelEnemyAttack() // isDefeated にする前に呼ぶ（溜めの膨らみを戻す）
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
        clearSpotlight() // ラスボスを倒したら周りを元の明るさに戻す
        // 敵が消えた直後に 1 回だけドロップを出す
        if (!hasDropped) {
          hasDropped = true
          const item = findItem(defeatDropId)
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

    // 2.5 敵の攻撃：溜め（赤く点滅して膨らむ）→ 弾がプレイヤーの手元へ飛んでくる
    if (enemyAttack && enemyModel) {
      if (enemyAttack.state === 'windup') {
        const elapsed = performance.now() - enemyAttack.startedAt
        if (Math.floor(elapsed / WINDUP_BLINK_MS) % 2) restoreEnemyEmissive()
        else setEnemyEmissive(_red)
        setEnemySquash(WINDUP_SWELL, WINDUP_SWELL, WINDUP_SWELL)
        if (elapsed >= ATTACK_WINDUP_MS) {
          endWindup()
          const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(ENEMY_SHOT_RADIUS, 16, 16),
            new THREE.MeshBasicMaterial({ color: ENEMY_SHOT_COLOR }), // 光の影響を受けないので、スポットライト演出の闇でも見える
          )
          // 翼の大きいラスボスでは箱の中心が体からずれるので、centerOf() ではなく体の中心から撃つ
          mesh.position.copy(enemyModel.userData.center)
          scene.add(mesh)
          enemyAttack.mesh = mesh
          enemyAttack.state = 'fly'
        }
      } else if (enemyAttack.state === 'fly') {
        // 行き先はカメラ基準なので、端末を動かしても手元に向かってくる
        camera.localToWorld(_target.copy(_playerPoint))
        const { mesh } = enemyAttack
        mesh.position.lerp(_target, ENEMY_SHOT_LERP)
        if (mesh.position.distanceTo(_target) < ENEMY_SHOT_HIT_DISTANCE) {
          const { onHit, onEnd } = enemyAttack
          cancelEnemyAttack() // 弾を消す
          onHit?.()
          onEnd?.('hit')
        }
      }
    }

    // 3. 敵をカメラに追従させ、正面をカメラに向け続ける（撃破演出中は回転させたいので向きは変えない）。
    //    onFrame でカメラの向きが変わった後に呼ぶ。fixed の敵（ラスボス）は出た位置・向きのまま
    if (enemyModel && !enemyModel.userData.enemy.fixed) {
      followCamera(enemyModel)
      if (!isDefeated) faceCamera(enemyModel)
    }
    updateFollowLine()

    // 4. HP ゲージを頭上に追従させ、hitEffect.js のリング・粒子を進める
    updateHpBar()
    updateHitEffects()
    spotlight?.update()

    // 5. ドロップの演出：しばらく足元で回り、その後プレイヤーの手元へ吸い寄せられて消える
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
    startSpotlight,
    revealSpotlight: () => spotlight?.reveal(),
    spawnDrop,
    clearDrop,
    collectDrop,
    setEnemyHpRatio,
    playDamageEffect,
    shootMagic,
    enemyAttack: startEnemyAttack,
    cancelEnemyAttack,
    playDefeatEffect,
    dispose() {
      running = false
      cancelAnimationFrame(rafId)
      clearTimeout(damageTimer)
      clearTimeout(squashTimer)
      window.removeEventListener('resize', resize)
      clearEnemy()
      followLine.geometry.dispose()
      followLine.material.dispose()
      envMap.dispose()
      renderer.dispose()
    },
  }
}
