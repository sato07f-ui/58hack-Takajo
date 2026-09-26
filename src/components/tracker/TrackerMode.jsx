import { useState } from 'react'
import { RoleSelect } from './RoleSelect'
import { ParentView } from './ParentView'
import { ChildView } from './ChildView'

/**
 * 見守りモードの入口。役割選択 → 親 / 子の画面。
 * props.onExit(): ゲームの開始画面に戻る
 */
export function TrackerMode({ onExit }) {
  const [role, setRole] = useState(null)
  if (role === 'parent') return <ParentView onBack={() => setRole(null)} />
  if (role === 'child') return <ChildView onBack={() => setRole(null)} />
  return <RoleSelect onSelect={setRole} onBack={onExit} />
}
