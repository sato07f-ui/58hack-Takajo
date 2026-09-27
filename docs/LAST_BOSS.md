# ラスボス出現 仕様書

## 0. 概要

親の端末の「ラスボスを呼ぶ」ボタンを押すと、子供の端末の AR 画面に**魔王城の門**がフェードインして重々しく開き、奥から**ラスボス「お金に支配された魔王ドラゴン」**が現れる。

| 担当範囲 | 内容 | 担当 |
|---|---|---|
| 呼び出し | 親のボタン → 子供の端末へ確実に届ける | 本仕様 |
| 演出 | 門が開くアニメーション → ラスボス出現 | 本仕様 |
| 3D モデル | 魔王ドラゴン（`boss_dragon.glb`） | 本仕様 |
| ラスボス戦 | HP・攻撃・勝敗など | ふぇるくん（6 章の受け渡し口につなぐ） |

親子の通信には、見守りモードの既存の Supabase Realtime チャンネル（`useLocationChannel` の `sendEvent` / `onEvent`）をそのまま使う。新しい通信の仕組みは追加していない。

---

## 1. 全体の流れ

```
親の画面 [ラスボスを呼ぶ]
   │ sendEvent('boss-summon', { key: ルームコード })
   │   └ 子供から 'boss-arrived' が返るまで 3 秒ごとに送り直す
   ▼
子供の端末 onEvent('boss-summon')
   ├─ 鍵（ルームコード）が一致したら受け付ける。振動
   ├─ 親へ sendEvent('boss-arrived') を返す（親のボタンが「ラスボスが出現した！」に変わる）
   ▼
AR 画面（ダンジョン内）
   ├─ bossPhase = 'gate'   : 画像認識・物体認識を停止。門の演出を開始
   ├─ 門が開ききる（約 5 秒）
   ├─ bossPhase = 'appear' : 出ている敵を消し、画面中央の 50cm 先に魔王ドラゴンを出す
   │                          → onEnemySpawn(BOSS)、onBossAppear(model) を呼ぶ ← ラスボス戦の開始
   └─ 門が消えて、カメラ映像とラスボスが見える（約 6.2 秒で演出終了）
```

子供がまだ「ダンジョンへ入る」前に呼ばれた場合は、見守り画面に「ラスボスがダンジョンで待っている！」と表示し、ダンジョンに入った瞬間に門の演出を始める。

---

## 2. ファイル構成

```
src/
  assets/
    boss_dragon.glb                 ← 新規: 魔王ドラゴンの 3D モデル（約 0.65MB）
  components/
    boss/
      BossGate.jsx                  ← 新規: 門が開く演出
      BossGate.css                  ← 新規: 門の見た目とアニメーション
    tracker/
      ParentView.jsx                ← 変更: 「ラスボスを呼ぶ」ボタン
      ChildView.jsx                 ← 変更: 呼び出しの受信・門の演出・ArScene へ段階を渡す
  utils/
    tracker/
      useBossSummon.js              ← 新規: 呼び出しの送信（親）/ 受信（子）
    ar/
      ArScene.jsx                   ← 変更: bossPhase で認識停止・ラスボス出現
    enemy/
      enemies.js                    ← 変更: ラスボス（id: 'boss'）を追加
  index.css                         ← 変更: ボタン・案内文のスタイル
3Dchara/（リポジトリ外）
  generate_boss_dragon.py           ← 魔王ドラゴンを生成する Blender スクリプト
```

---

## 3. 呼び出し（`useBossSummon.js`）

### 3-1. イベント

| イベント | 向き | payload | 意味 |
|---|---|---|---|
| `boss-summon` | 親 → 子 | `{ key: roomCode }` | ラスボスを呼ぶ |
| `boss-arrived` | 子 → 親 | なし | 呼び出しが届いた |

### 3-2. 親: `useBossSummonSender({ channel, roomCode })`

戻り値: `{ bossState, summon }`

| `bossState` | ボタンの表示 | 押せるか |
|---|---|---|
| `'idle'` | ラスボスを呼ぶ | 押せる（子供と接続中のみ） |
| `'summoning'` | 呼び出し中… | 押せない |
| `'arrived'` | ラスボスが出現した！ | 押せない |

- `summon()` で `boss-summon` を送り、`boss-arrived` が返るまで **`BOSS_RESEND_MS`（3 秒）ごとに送り直す**。Realtime の Broadcast は保存されないため、子供が一瞬オフラインでも届くようにする（`useReviveSender` の復活の鍵と同じ方式。`useHoldCondition` の `repeatMs` を使う）
- 一度呼んだら二度と送らない（連打しても送信は 1 回。ref で判定）

### 3-3. 子供: `useBossSummonReceiver({ channel, roomCode })`

戻り値: `{ summoned }`

- `boss-summon` の `key` が自分の `roomCode` と一致したときだけ受け付ける
- `summoned` が `true` になるのは **1 回だけ**（送り直しで何度届いても演出は 1 回）
- `boss-arrived` は受け取るたびに毎回返す（最初の応答が親に届かなかった場合でも、親の送り直しを止められるように）
- 受け付けた瞬間に振動する（`navigator.vibrate`）

---

## 4. 門が開く演出（`BossGate.jsx` / `BossGate.css`）

3D ではなく、カメラ映像の上に重ねる HTML / CSS で作っている（調整しやすく、端末差が出にくい）。画像ファイルは使わず、石のアーチ・木の扉・鉄の帯・鋲・取っ手の輪をすべて CSS で描いている。

### 4-1. タイムライン

| 時間 | 段階（class） | 演出 |
|---|---|---|
| 0〜1.2 秒 | `boss-gate--appear` | 画面が紫がかった暗さになり、閉じた門がフェードイン |
| 1.2〜2.2 秒 | `boss-gate--rumble` | 門が小刻みに揺れる。スマホも振動 |
| 2.2〜5.0 秒 | `boss-gate--open` | 左右の扉が奥へ開く（最初は重く、途中から勢いよく）。奥から紫の光、「ラスボスがあらわれた！」 |
| 5.0 秒 | `boss-gate--reveal` | `onOpened()` を呼ぶ（ここでラスボスを出す）。門が手前に広がりながら消える |
| 6.2 秒 | — | `onDone()` を呼ぶ。`BossGate` を外す |

時間は `BossGate.jsx` の `TIMELINE`、扉が開く速さは `BossGate.css` の `--open-ms` で調整する（2 つは合わせること）。

### 4-2. props

| prop | 呼ばれるタイミング |
|---|---|
| `onOpened()` | 扉が開ききったとき（1 回） |
| `onDone()` | 演出が終わったとき（1 回） |

- 演出中は後ろのボタンを押せない（`pointer-events: auto`）
- `z-index: 5`（脱出画面・復活バナーより手前）
- 端末の「動きを減らす」設定がオンなら揺れを止める

---

## 5. AR 画面との連携（`ArScene.jsx` / `ChildView.jsx`）

### 5-1. `bossPhase`（ChildView → ArScene）

| 値 | 条件 | ArScene の動き |
|---|---|---|
| `'none'` | 呼ばれていない、またはダンジョン外 | 通常どおり（画像認識・物体認識で敵が出る） |
| `'gate'` | 呼ばれた & ダンジョン内 & 門が開ききる前 | 画像認識・物体認識を停止。普通の敵は出さない。「食材の画像に〜」の案内も消す |
| `'appear'` | 門が開ききった | 出ている敵を消し、画面中央の 50cm 先にラスボスを 1 体だけ出す |

### 5-2. ラスボスの出現

- `spawnEnemy(BOSS, 画面中央)` で出す。ほかの敵と同じく、顔をプレイヤーに向けて空間に固定される
- 出現したら `onEnemySpawn(BOSS)` と `onBossAppear(model)` を呼ぶ
- StrictMode の二重実行でも 1 体しか出ない（ref で判定）

---

## 6. ラスボス戦への受け渡し（ふぇるくん向け）

ラスボスが出現した瞬間に、[ChildView.jsx](../src/components/tracker/ChildView.jsx) の次の関数が呼ばれる。**今は中身が空**なので、ここからラスボス戦の処理につなぐ。

```jsx
/** ラスボスが出現した（ここからラスボス戦。戦闘の処理はここにつなぐ） */
function handleBossAppear() {}
```

- 引数 `model`: 出現したラスボスの Three.js オブジェクト（`model.userData.enemy.id === 'boss'`）
- ダメージ・撃破の演出は、既存の `createScene` の `playDamageEffect()` / `playDefeatEffect()` を使える（`ArScene` に `sceneRef` を渡すと取得できる）
- 勝敗を親に知らせたい場合は、同じチャンネルで `sendEvent('boss-defeated')` などのイベントを追加する

---

## 7. ラスボスの 3D モデル（`boss_dragon.glb`）

### 7-1. デザイン

参考: ボスキャラ案「お金に支配された魔王ドラゴン」。目の前に巨大な上半身が浮かんで見下ろしてくる演出のため、**下半身の無いバストアップ**にしている。

| パーツ | 内容 |
|---|---|
| 頭 | 前に伸びたワニのような顎（開いた下あご・金の牙）、顔に貼り付いた赤く光るスリット状の吊り目、金の眉と鼻筋の装甲、後頭部へ伸びる金の大角、7 本の棘の王冠。14° うつむいて見下ろす |
| 胸 | 大胸筋が盛り上がった分厚い胸板。中央の溝に、光条の棘と赤い宝石が付いた巨大な金のコインを埋め込む |
| 肩 | 3 枚重ねの分厚い金の肩当て。上・外・前後へスパイク |
| 腕 | 左手は金の爪を立てて前に突き出し、右手はコインの付いた金の杖を握る |
| 翼 | 横幅約 3.8m のコウモリの翼。先端が前へ回り込み、プレイヤーを包み込む。関節と指先に金の爪 |
| マント | 首を囲む赤い高い襟（金の縁取り）と、背中に垂れるマント |

### 7-2. 技術仕様

| 項目 | 値 |
|---|---|
| ファイルサイズ | 約 0.65MB（WebAR 用に 1MB 未満） |
| 頂点数 | 約 9,200 |
| テクスチャ | 使わない（マテリアルの色分けのみ） |
| マテリアル | 黒（体・翼）、金（Metallic 1.0 / Roughness 0.22）、赤（マント）、赤い発光（目・宝石） |
| 向き | 正面 -Y（glb では +Z）。ほかの敵と同じで、`spawnEnemy` でプレイヤーの方を向く |
| 原点 | 胸の下端が Z=0。全パーツが Z ≥ 0（`spawnEnemy` の「原点 = 下端」の前提どおり） |
| 表示サイズ | `enemies.js` の `height: 0.5`（ツノ・杖を含む全体の高さを 0.5m に縮める） |

### 7-3. 再生成

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --python 3Dchara/generate_boss_dragon.py -- 3Dchara/boss_dragon.glb
```

生成後、`58hack-Takajo/src/assets/boss_dragon.glb` にコピーする。目の位置・太さ・吊り上がりはスクリプト冒頭付近の `EYE_ANGLE` / `EYE_HALF_HEIGHT` / `EYE_SLANT` で調整できる。

### 7-4. 敵の定義（`enemies.js`）

```js
import bossUrl from '../../assets/boss_dragon.glb?url'

{ id: 'boss', name: '魔王ドラゴン', modelUrl: bossUrl, targetUrl: null, height: 0.5 },
```

`targetUrl` も `detectClass` も持たないので、画像認識・物体認識では出現せず、親の呼び出しでのみ出る。

---

## 8. 動作確認チェックリスト

| 項目 | 結果 |
|---|---|
| 親のボタンが「ラスボスを呼ぶ → 呼び出し中… → ラスボスが出現した！」と変わる | ☐ |
| ボタンを連打しても子供の演出は 1 回だけ | ☐ |
| 子供の電波が一瞬途切れても、戻ったら届く | ☐ |
| 子供の画面で門がフェードイン → 揺れ → 開く（振動あり） | ☐ |
| 門が開ききったタイミングで魔王ドラゴンが画面中央に出る | ☐ |
| 演出中・ラスボス出現後に、にんじん等が割り込んで出ない | ☐ |
| ダンジョンに入る前に呼ばれた場合、入った瞬間に演出が始まる | ☐ |
| 魔王ドラゴンの金・赤い目が実機で見栄えよく見える | ☐ |

開発中の確認（済み）: lint / build、偽の通信路での送受信（取りこぼし時の送り直し・連打・別コードの無視）、`ArScene` に組み込んだ状態での門の演出 → ラスボス 1 体出現 → `onBossAppear` の流れ（StrictMode あり）。

---

## 9. 注意点

- **金の見え方**: 3D 画面には映り込み用の環境が無いため、実機ではプレビューより暗い金に見える可能性がある。気になる場合は `createScene.js` で `scene.environment` に `RoomEnvironment` を設定する
- **大きさ**: 翼は画面の左右に大きくはみ出す（包み込む見せ方）。見え方は `enemies.js` の `height` で調整する
- **2 回目の呼び出し**: 今は 1 回呼んだら終わり。ラスボス戦後にもう一度呼べるようにするには、親の `bossState` と子供の `summoned` を戻す処理が必要
- **仮モデル**: `modelUrl` が `null` の敵は黄色いカプセルで出る仕組み（`loadEnemyModel.js`）は残してあるが、現在ラスボスを含め全敵にモデルがある
