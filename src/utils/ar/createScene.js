import * as THREE from 'three'

export const createScene = (canvas) => {
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
  testCube.position.set(0, -0.3, -2)
  scene.add(testCube)

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
    testCube.rotation.y += 0.01
    renderer.render(scene, camera)
    rafId = requestAnimationFrame(loop)
  }
  loop()

  return {
    scene,
    camera,
    renderer,
    testCube, // デバッグ用。MoveButton から位置を動かすために公開
    dispose() {
      running = false
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      testCube.geometry.dispose()
      testCube.material.dispose()
      renderer.dispose()
    },
  }
}