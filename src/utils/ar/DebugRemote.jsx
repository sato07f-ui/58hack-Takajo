import { useEffect, useState } from 'react'

const STEP = 0.2

/**
 * 実機検証用のデバッグリモコン。
 * - キューブを上下左右前後に動かす / 初期位置に戻す
 * - DeviceOrientation の生の値・権限・環境情報を表示する
 *
 * props.sceneRef: createScene() の戻り値を持つ ref
 * props.orientationRef: useDeviceOrientation() の orientationRef
 * props.permission: useDeviceOrientation() の permission
 */
export function DebugRemote({ sceneRef, orientationRef, permission }) {
  const [info, setInfo] = useState(null)

  // センサー値は ref なので 100ms ごとにポーリングして表示する
  useEffect(() => {
    const id = setInterval(() => {
      const o = orientationRef.current
      setInfo({
        alpha: o.alpha?.toFixed(1),
        beta: o.beta?.toFixed(1),
        gamma: o.gamma?.toFixed(1),
        absolute: String(o.absolute),
        angle: screen.orientation?.angle ?? window.orientation ?? '-',
      })
    }, 100)
    return () => clearInterval(id)
  }, [orientationRef])

  const move = (dx, dy, dz) => sceneRef.current?.moveCube(dx, dy, dz)
  const reset = () => sceneRef.current?.resetCube()

  return (
    <div className="debug-remote">
      <div className="debug-info">
        <div>perm: {permission} / https: {String(window.isSecureContext)}</div>
        <div>
          α {info?.alpha ?? '-'} β {info?.beta ?? '-'} γ {info?.gamma ?? '-'}
        </div>
        <div>
          abs: {info?.absolute ?? '-'} / screen: {info?.angle ?? '-'}°
        </div>
        <div className="debug-ua">{navigator.userAgent}</div>
      </div>

      <div className="debug-remote-body">
        {/* 十字キー: 上下左右 */}
        <div className="debug-dpad">
          <button type="button" className="dpad-up" onClick={() => move(0, STEP, 0)} aria-label="上">▲</button>
          <button type="button" className="dpad-left" onClick={() => move(-STEP, 0, 0)} aria-label="左">◀</button>
          <button type="button" className="dpad-center" onClick={reset} aria-label="リセット">●</button>
          <button type="button" className="dpad-right" onClick={() => move(STEP, 0, 0)} aria-label="右">▶</button>
          <button type="button" className="dpad-down" onClick={() => move(0, -STEP, 0)} aria-label="下">▼</button>
        </div>
        {/* 奥 / 手前 */}
        <div className="debug-depth">
          <button type="button" className="depth-btn" onClick={() => move(0, 0, -STEP)}>奥</button>
          <button type="button" className="depth-btn" onClick={() => move(0, 0, STEP)}>手前</button>
        </div>
      </div>
    </div>
  )
}
