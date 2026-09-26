import { useState } from "react";
import styles from "./StartScreen.module.css";
import logoImg from "../../assets/logo.png";

/**
 * タイトル画面。画面をタップすると「あそびかた」が開き、OK でゲームを始める。
 * props.onStart: OK を押したときに呼ばれる（センサー権限の要求はこのタップの中で行う）
 * props.onOpenTracker: 「見守りモード」を押したときに呼ばれる（任意。無ければボタンを出さない）
 * props.notice: 開始できなかった理由など、あそびかたの中に出すメッセージ（任意）
 */
export const StartScreen = ({ onStart, onOpenTracker, notice }) => {
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
        {onOpenTracker && (
          <button
            type="button"
            className={styles.trackerButton}
            onClick={(e) => {
              e.stopPropagation(); // 画面タップ扱いにして、あそびかたを開かないようにする
              onOpenTracker();
            }}
          >
            見守りモード
          </button>
        )}
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
            {notice && <p className={styles.notice}>{notice}</p>}
            <button
              type="button"
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
