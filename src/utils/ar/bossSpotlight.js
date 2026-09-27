import * as THREE from 'three'
import { createBossClouds } from './bossClouds'

const DARK_MS = 1000 // 周りが暗くなるまでの時間
const LIGHT_MS = 1200 // スポットライトが点くまでの時間
const DARK_CENTER = 0.55 // 画面中央の暗さ（0: そのまま, 1: 真っ黒）
const DARK_EDGE = 0.85 // 画面の端の暗さ（周辺を暗くして中央に目が行くようにする）
const STAGE_LIGHT_DIM = 0.1 // スポットライトが点いた後の、普段の照明（環境光など）の割合（点く前は 0 で真っ暗）
const ENV_DIM = 0.3 // 金属の映り込みもこの割合まで落とし、スポットライトの明暗を目立たせる
const BEAM_ABOVE = 1.4 // 光の出どころ：ボスの頭の上この高さ [m]
const BEAM_RADIUS = 0.75 // 光の筋の足元の半径（ボスの高さに対する割合）
const BEAM_COLOR = new THREE.Color(0xfff1c4) // 少し暖かい白
const BEAM_OPACITY = 0.5
const SPOT_INTENSITY = 90 // 距離で減衰するので強め（単位は cd）

// 画面全体を覆う暗幕。奥（深度 ≒ 1）に描くので、ボスや光の筋より後ろ（カメラ映像）だけが暗くなる
const darknessVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`
const darknessFragment = /* glsl */ `
  uniform float uFade;
  varying vec2 vUv;
  void main() {
    float d = length((vUv - 0.5) * vec2(1.0, 1.3));
    float a = mix(${DARK_CENTER.toFixed(2)}, ${DARK_EDGE.toFixed(2)}, smoothstep(0.15, 0.7, d));
    gl_FragColor = vec4(0.02, 0.0, 0.06, a * uFade); // ほんの少し紫がかった闇
  }
`

// 光の筋（円すい）。視線に正面を向いた面ほど濃く、上（光源）ほど明るく、足元で消える
const beamVertex = /* glsl */ `
  varying float vFacing;
  varying float vHeight;
  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mvPos.xyz)));
    vHeight = uv.y; // 0: 足元, 1: 光源
    gl_Position = projectionMatrix * mvPos;
  }
`
const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFacing;
  varying float vHeight;
  void main() {
    float a = pow(vFacing, 2.0) * mix(0.15, 1.0, vHeight) * smoothstep(0.0, 0.25, vHeight);
    gl_FragColor = vec4(uColor, a * uOpacity);
  }
`

/**
 * ラスボスにスポットライトを当てる演出。2 段階で進む。
 *   1. 作った直後: 周り（カメラ映像）を暗くし、ボスの照明も消す（闇の中で目など光る部分だけ見える）。
 *      周りには黒っぽい雲を漂わせ、胸から下は雲海で隠す（bossClouds.js）
 *   2. reveal(): 頭上からスポットライトが点き、ボスが闇から浮かび上がる
 * model: spawnEnemy() が返したボスのモデル（userData.center と userData.enemy.height を使う）
 * stageLights: 暗くする普段の照明の配列
 * camera: 雲海をプレイヤー側に広げるために使う
 * 戻り値: { update() 毎フレーム呼ぶ, reveal() スポットライトを点ける, dispose() 元の明るさに戻して消す }
 */
export function createBossSpotlight(scene, model, stageLights, camera) {
  const center = model.userData.center
  const height = model.userData.enemy.height
  const darkStart = performance.now()
  let lightStart = null // reveal() した時刻

  // 暗幕
  const darknessMat = new THREE.ShaderMaterial({
    uniforms: { uFade: { value: 0 } },
    vertexShader: darknessVertex,
    fragmentShader: darknessFragment,
    transparent: true,
    depthWrite: false,
  })
  const darkness = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), darknessMat)
  darkness.frustumCulled = false // 画面に直接描くので、カメラの向きで消されないように
  darkness.renderOrder = -1 // 光の筋より先に描く

  // 光の筋：頭上の光源から足元まで広がる円すい
  const top = center.y + height / 2 + BEAM_ABOVE
  const bottom = center.y - height / 2
  const beamHeight = top - bottom
  const beamRadius = height * BEAM_RADIUS
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: BEAM_COLOR }, uOpacity: { value: 0 } },
    vertexShader: beamVertex,
    fragmentShader: beamFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })
  const beam = new THREE.Mesh(new THREE.ConeGeometry(beamRadius, beamHeight, 48, 1, true), beamMat)
  beam.position.set(center.x, bottom + beamHeight / 2, center.z)

  // 実際にボスを照らす光（光の筋と同じ位置・広がり）
  const spot = new THREE.SpotLight(BEAM_COLOR, 0, 0, Math.atan(beamRadius / beamHeight) * 1.4, 0.6, 2)
  spot.position.set(center.x, top, center.z)
  spot.target.position.copy(center)

  scene.add(darkness, beam, spot, spot.target)
  const clouds = createBossClouds(scene, { center, height, camera, beamRadius })

  // 暗くする前の明るさを覚えておく
  const lights = stageLights.map((light) => ({ light, base: light.intensity }))
  const envMaterials = []
  model.traverse((obj) => {
    if (obj.material?.envMap) envMaterials.push({ mat: obj.material, base: obj.material.envMapIntensity })
  })

  // dark: 周りの暗さ, light: スポットライトの明るさ（どちらも 0〜1）
  const apply = (dark, light) => {
    darknessMat.uniforms.uFade.value = dark
    beamMat.uniforms.uOpacity.value = light * BEAM_OPACITY
    spot.intensity = light * SPOT_INTENSITY
    clouds.update(dark, light)
    // 暗くなるにつれて普段の照明を消し、スポットライトが点いたら少しだけ戻す
    const stage = 1 - dark + dark * light * STAGE_LIGHT_DIM
    for (const { light: l, base } of lights) l.intensity = base * stage
    const env = 1 - dark + dark * light * ENV_DIM
    for (const { mat, base } of envMaterials) mat.envMapIntensity = base * env
  }

  const progress = (start, ms) => (start === null ? 0 : Math.min((performance.now() - start) / ms, 1))

  return {
    update() {
      const dark = progress(darkStart, DARK_MS)
      const light = progress(lightStart, LIGHT_MS)
      // 暗くなるのはゆっくり始まりゆっくり終わる。スポットライトはパッと点いてから落ち着く
      apply(dark * dark * (3 - 2 * dark), 1 - (1 - light) ** 3)
    },
    reveal() {
      lightStart ??= performance.now()
    },
    dispose() {
      apply(0, 0)
      scene.remove(darkness, beam, spot, spot.target)
      darkness.geometry.dispose()
      darknessMat.dispose()
      beam.geometry.dispose()
      beamMat.dispose()
      spot.dispose()
      clouds.dispose()
    },
  }
}
