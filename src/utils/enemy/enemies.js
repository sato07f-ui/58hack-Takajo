import carrotUrl from '../../assets/carrot.glb?url'
import greenpepperUrl from '../../assets/greenpepper.glb?url'
import spinachUrl from '../../assets/spinach.glb?url'
import bananaUrl from '../../assets/banana.glb?url'
import bossUrl from '../../assets/boss_dragon.glb?url'

/**
 * 敵の定義。
 * modelUrl: 3D モデル（glb）。
 *           null の敵は仮モデル（黄色いカプセル）で出る
 * targetUrl: この敵を出現させる画像の .mind（public/targets/ に 1 画像 1 ファイルで置く）。
 *            null の敵は画像認識では出現しない
 * detectClass: YOLO の物体認識で出現させるときのクラス名（COCO の 80 クラス。本物の物をカメラに映して出す特別な敵）
 * height: AR 空間で表示する高さ [m]（モデルの実寸に関係なくこの高さに揃える）
 * envMapIntensity: 金属などの映り込みの強さ（任意）。指定した敵だけ明るく照らされる
 * spawnDistance: カメラから出現位置までの距離 [m]（任意。省略時は 0.5m）
 * spawnLift: 出現位置を真上に持ち上げる量 [m]（任意）。高い位置の敵はプレイヤーを見下ろす姿勢になる
 * spawnScreenY: 呼び出しで出す敵を、画面のどの高さの方向に出すか（0: 上端〜1: 下端。任意、省略時は 0.5 = 中央）
 */
export const ENEMIES = [
  { id: 'carrot', name: 'にんじん', modelUrl: carrotUrl, targetUrl: '/targets/carrot.mind', height: 0.3 },
  { id: 'greenpepper', name: 'ピーマン', modelUrl: greenpepperUrl, targetUrl: '/targets/greenpepper.mind', height: 0.25 },
  { id: 'spinach', name: 'ほうれん草', modelUrl: spinachUrl, targetUrl: '/targets/spinach.mind', height: 0.35 },
  // 特別な敵: 本物のバナナを YOLO で検出して出す（画像認識では出さないので targetUrl は null）
  { id: 'banana', name: 'バナナ', modelUrl: bananaUrl, targetUrl: null, detectClass: 'banana', height: 0.3 },
  // ラスボス「お金に支配された魔王ドラゴン」: 親の「ラスボスを呼ぶ」で出る（認識では出さない）
  // 画面いっぱいに迫るよう大きく出す。近すぎるとマズルがカメラに迫って歪むので、少し遠くに大きく置く。
  // 黒と金が暗くならないよう映り込みを当てる
  // spawnLift で高い位置に出して、プレイヤーを見下ろさせる
  // 画面の少し下（spawnScreenY）を狙って高い位置（spawnLift）に出し、顔が画面の上側に来て、胸が下にはみ出すくらい迫らせる
  { id: 'boss', name: '魔王ドラゴン', modelUrl: bossUrl, targetUrl: null, height: 1.9, spawnDistance: 1.2, spawnLift: 0.2, spawnScreenY: 0.62, envMapIntensity: 0.9 },
]
