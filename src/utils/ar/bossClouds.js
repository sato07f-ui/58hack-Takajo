import * as THREE from 'three'

const TEXTURE_SIZE = 256
const TEXTURE_VARIANTS = 4 // 雲の形の種類（同じ形ばかり並ばないように）
const SEA_COUNT = 22 // ボスの胸元を隠す雲海の雲の数
const SEA_WIDTH = 4.5 // 雲海の横幅 [m]
const SEA_DEPTH = 1.6 // 雲海の奥行き [m]（ボスの少し奥から手前まで）
const SEA_LEVEL = 0.22 // 雲海の高さ：ボスの下端からこの高さ [m]
const DRIFT_COUNT = 9 // ボスの周りを漂う雲の数
const DRIFT_SPEED = 0.06 // 雲が横に流れる速さ [m/秒]
const RISE = 0.4 // 出現時に、雲海が下からせり上がってくる高さ [m]
const COLOR_LIT = new THREE.Color(0x77767f) // スポットライトの下の雲（少し明るい灰色）
const COLOR_DARK = new THREE.Color(0x2b2a31) // 光から離れた雲（黒に近い灰色）

// 何度作っても同じ見た目になるよう、決まった順に数を出す乱数
const createRandom = (seed) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

/**
 * もこもこした雲の形のテクスチャを canvas で描く。
 * 白い半透明の丸をたくさん重ね、上を明るく・下を暗くして立体感を出す（色はスプライト側で付ける）
 */
const createCloudTexture = (random) => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TEXTURE_SIZE
  const ctx = canvas.getContext('2d')
  const c = TEXTURE_SIZE / 2
  for (let i = 0; i < 26; i++) {
    // 横長の楕円の中に丸を散らし、下側は平らにする
    const angle = random() * Math.PI * 2
    const dist = Math.sqrt(random())
    const x = c + Math.cos(angle) * dist * c * 0.55
    const y = c + Math.min(Math.sin(angle) * dist * c * 0.3, c * 0.12)
    const r = c * (0.14 + random() * 0.2)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.8)')
    g.addColorStop(0.55, 'rgba(255,255,255,0.45)')
    g.addColorStop(0.85, 'rgba(255,255,255,0.08)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  }
  // 上から光が当たっているように、下側を暗くする（描いた部分の透明度はそのまま）
  ctx.globalCompositeOperation = 'source-atop'
  const shade = ctx.createLinearGradient(0, c * 0.5, 0, c * 1.4)
  shade.addColorStop(0, '#ffffff')
  shade.addColorStop(1, '#6a6a6a')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * ラスボスの周りに黒っぽい灰色の雲を漂わせる。ボスは胸から下が無いので、胸元は雲海で隠す。
 * center: ボスの体の中心, height: ボスの高さ [m], camera: 雲を並べる向き（プレイヤー側）を決める
 * beamRadius: スポットライトの半径。光の中にある雲ほど明るい色にする
 * 戻り値: { update(t, light) t は 0〜1 の出現の度合い、light は 0〜1 のスポットライトの明るさ, dispose() }
 */
export function createBossClouds(scene, { center, height, camera, beamRadius }) {
  const random = createRandom(7)
  const textures = Array.from({ length: TEXTURE_VARIANTS }, () => createCloudTexture(random))
  const group = new THREE.Group()
  scene.add(group)

  // ボスから見た「プレイヤーの方向」と「横方向」（水平面上）
  const toCamera = new THREE.Vector3(camera.position.x - center.x, 0, camera.position.z - center.z).normalize()
  const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), toCamera)
  const bottom = center.y - height / 2

  const clouds = []
  const addCloud = ({ x, y, z, size, opacity, sea }) => {
    const material = new THREE.SpriteMaterial({
      map: textures[Math.floor(random() * TEXTURE_VARIANTS)],
      transparent: true,
      depthWrite: false,
      opacity: 0,
    })
    material.rotation = (random() - 0.5) * 0.3
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(size, size * 0.55, 1)
    clouds.push({ sprite, x, y, z, opacity, sea, phase: random() * Math.PI * 2, speed: DRIFT_SPEED * (0.6 + random() * 0.8) })
    group.add(sprite)
  }

  // 雲海：ボスの下端の高さに、横一面に敷き詰める。手前の雲ほど大きく、ボスの胸元を覆う
  for (let i = 0; i < SEA_COUNT; i++) {
    const z = (random() - 0.35) * SEA_DEPTH // 正: プレイヤー側
    addCloud({
      x: (i / (SEA_COUNT - 1) - 0.5) * SEA_WIDTH + (random() - 0.5) * 0.3,
      y: SEA_LEVEL + (random() - 0.5) * 0.25,
      z,
      size: 1.1 + random() * 0.8 + Math.max(z, 0) * 0.5,
      opacity: 0.85 + random() * 0.15,
      sea: true,
    })
  }
  // 漂う雲：ボスの後ろや横の、胴から頭の高さに薄めに浮かべる
  for (let i = 0; i < DRIFT_COUNT; i++) {
    const x = (random() - 0.5) * SEA_WIDTH
    addCloud({
      x,
      y: height * (0.35 + random() * 0.75),
      z: -0.5 - random() * 1.0, // ボスより奥に置き、顔を隠さない
      size: 0.8 + random() * 0.7,
      opacity: 0.35 + random() * 0.3,
      sea: false,
    })
  }

  const halfWidth = SEA_WIDTH / 2
  const place = (cloud, t, light, time) => {
    // 横に流し、端まで行ったら反対の端へ戻す
    const x = THREE.MathUtils.euclideanModulo(cloud.x + cloud.speed * time + halfWidth, SEA_WIDTH) - halfWidth
    const bob = Math.sin(time * 0.5 + cloud.phase) * 0.04 // ゆっくり上下にゆれる
    const rise = cloud.sea ? (1 - t) * -RISE : 0
    cloud.sprite.position
      .set(center.x, bottom + cloud.y + bob + rise, center.z)
      .addScaledVector(side, x)
      .addScaledVector(toCamera, cloud.z)
    // 端で急に消えたり出たりしないよう、両端では薄くする
    // 光の筋の中（ボスの近く）ほど明るい灰色、外ほど黒に近い灰色。スポットライトが点くまでは全部暗い
    const lit = 1 - THREE.MathUtils.smoothstep(Math.hypot(x, cloud.z), beamRadius * 0.4, beamRadius * 1.3)
    cloud.sprite.material.color.lerpColors(COLOR_DARK, COLOR_LIT, lit * light)
    const edgeFade = THREE.MathUtils.smoothstep(halfWidth - Math.abs(x), 0, 0.6)
    cloud.sprite.material.opacity = cloud.opacity * t * edgeFade
  }

  const startTime = performance.now()
  return {
    update(t, light) {
      const time = (performance.now() - startTime) / 1000
      for (const cloud of clouds) place(cloud, t, light, time)
    },
    dispose() {
      scene.remove(group)
      for (const { sprite } of clouds) sprite.material.dispose()
      for (const texture of textures) texture.dispose()
    },
  }
}
