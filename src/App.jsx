import { useState } from "react";
import { ArScene } from "./utils/ar/Arscene";
import { StartScreen } from "./components/StartScreen/StartScreen"; // フォルダを分けて管理

function App() {
  const [isStarted, setIsStarted] = useState(false);

  // STARTボタンが押された時の処理
  const handleGameStart = () => {
    setIsStarted(true);
  };

  return (
    <>{!isStarted ? <StartScreen onStart={handleGameStart} /> : <ArScene />}</>
  );
}

export default App;
