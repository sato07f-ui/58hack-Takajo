import { useState } from 'react'
import { RoleSelect } from './RoleSelect'
import { ParentView } from './ParentView'
import { ChildView } from './ChildView'

/**
 * 見守りモードの入口。役割選択 → 親 / 子の画面。
 * props.onExit(): ゲームの開始画面に戻る
 * props.ar: { orientationRef, requestPermission }（子供が AR ゲームを開くために使う）
 */
export function TrackerMode({ onExit, ar }) {
  const [role, setRole] = useState(null)
  if (role === 'parent') return <ParentView onBack={() => setRole(null)} />
  if (role === 'child') return <ChildView onBack={() => setRole(null)} ar={ar} />
  return <RoleSelect onSelect={setRole} onBack={onExit} />
}
