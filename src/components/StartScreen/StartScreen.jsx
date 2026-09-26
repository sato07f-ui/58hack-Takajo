import { useState } from "react";
import styles from "./StartScreen.module.css";
import logoImg from "../../assets/logo.png";

export const StartScreen = ({ onStart }) => {
  // あそびかたを表示中かどうかのフラグ
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  // 画面のどこかをタップした時の処理
  const handleScreenTap = () => {
    // すでにモーダルが開いている時は重ねて実行しない
    if (!showHowToPlay) {
      setShowHowToPlay(true);
    }
  };

  // モーダルの「OK」を押した時にゲームを開始する
  const handleConfirmHowToPlay = (e) => {
    e.stopPropagation(); // 画面全体のタップイベントが再発火するのを防ぐ
    onStart(); // ArSceneへ遷移
  };

  return (
    <div className={styles.container} onClick={handleScreenTap}>
      {/* 上部余白 */}
      <div className={styles.spacer} />

      {/* 中央：ロゴエリア */}
      <div className={styles.logoArea}>
        <div className={styles.logoBox}>
          {/* 2. テキストから画像タグに差し替え */}
          <img src={logoImg} alt="Mart Quest" className={styles.logoImage} />
        </div>
      </div>

      {/* 下部：TAP TO START テキスト */}
      <div className={styles.tapToStartArea}>
        <p className={styles.tapText}>- TAP TO START -</p>
      </div>

      {/* モーダル：あそびかた（タップ後に自動表示） */}
      {showHowToPlay && (
        <div className={styles.modalOverlay}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.modalTitle}>あそびかた</h2>
            <div className={styles.instructionList}>
              <p>
                <span className={styles.emoji}>1️⃣ 📱</span> かざす
              </p>
              <p>
                <span className={styles.emoji}>2️⃣ 👾</span> てきがでる
              </p>
              <p>
                <span className={styles.emoji}>3️⃣ ⚔️</span> たおす
              </p>
            </div>
            <button
              className={styles.closeButton}
              onClick={handleConfirmHowToPlay}
            >
              OK (ゲーム開始)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
