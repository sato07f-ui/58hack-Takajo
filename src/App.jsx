import { useState, useEffect } from "react";
import { ArScene } from "./utils/ar/ArScene";
import { useDeviceOrientation } from "./utils/ar/useDeviceOrientation";
import "./App.css";

function App() {
  const [started, setStarted] = useState(false);
  const { orientationRef, permission, requestPermission } =
    useDeviceOrientation();

  // ===============================
  // ★追加：バトル用の状態（State）管理
  // ===============================
  const [enemyHp, setEnemyHp] = useState(100); // 敵のHP
  const [mp, setMp] = useState(50); // プレイヤーのMP
  const [isCooldown, setIsCooldown] = useState(false); // クールダウン中かどうか

  // ★追加：魔法を撃つ処理
  const handleAttack = () => {
    // クールダウン中、またはMPが足りない(10未満)なら何もしない
    if (isCooldown || mp < 10) return;

    // MPを10減らし、敵のHPを20減らす
    setMp((prev) => prev - 10);
    setEnemyHp((prev) => Math.max(prev - 20, 0)); // 0以下にならないようにMath.maxを使用

    // クールダウン開始
    setIsCooldown(true);
  };

  // ★追加：クールダウンのタイマー処理（isCooldownが変化するたびに実行される）
  useEffect(() => {
    if (isCooldown) {
      // 1秒(1000ミリ秒)後に isCooldown を false に戻す
      const timer = setTimeout(() => setIsCooldown(false), 1000);
      // クリーンアップ関数（コンポーネントが消えた時などにタイマーをリセットする）
      return () => clearTimeout(timer);
    }
  }, [isCooldown]);

  // ===============================

  // タップハンドラ内でセンサー権限を要求する（iOS の制約）
  async function handleStart() {
    const result = await requestPermission();
    if (result === "denied") return;
    // 'unsupported'（PC ブラウザ等）はカメラ確認のため進める
    setStarted(true); // ArScene のマウント時にカメラ権限が要求される
  }

  if (!started) {
    return (
      <div className="start-screen">
        <h1>スーパーダンジョン</h1>
        <button type="button" onClick={handleStart}>
          冒険をはじめる
        </button>
        {permission === "denied" && (
          <p>
            センサーの使用が拒否されました。設定 › Safari ›
            モーションと画面の向きのアクセス を確認してください。
          </p>
        )}
        {permission === "unsupported" && (
          <p>この端末は向きセンサーに対応していません。</p>
        )}
      </div>
    );
  }

  return (
    <>
      <ArScene orientationRef={orientationRef} />

      {/* UIレイヤー：ARの手前にボタンを配置 */}
      <div className="ui-layer">
        {/* ★追加：画面の左上にステータスを表示する箱（インラインスタイルで簡易的に配置） */}
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "20px",
            color: "white",
            background: "rgba(0,0,0,0.5)",
            padding: "10px",
            borderRadius: "8px",
          }}
        >
          <p style={{ margin: 0 }}>敵のHP: {enemyHp}</p>
          <p style={{ margin: 0 }}>MP: {mp}</p>
        </div>

        {/* ★修正：onClickをhandleAttackに変更し、disabled属性でボタンを無効化できるようにする */}
        <button
          className="attack-button"
          onClick={handleAttack}
          disabled={isCooldown || mp < 10}
        >
          {isCooldown ? "チャージ中..." : "魔法を撃つ (MP-10)"}
        </button>
      </div>
    </>
  );
}

export default App;
