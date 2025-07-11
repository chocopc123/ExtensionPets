// 画像のファイル名から連番を抽出するヘルパー関数
function extractSequenceNumber(filename) {
  const match = filename.match(/_(\d+)\.(png|jpg|jpeg)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

// アニメーション開始関数
function startAnimation() {
  chrome.runtime.sendMessage({ type: 'startAnimationBackground' });
  console.log('アニメーション開始メッセージをバックグラウンドに送信しました。');
}

// アニメーション停止関数
function stopAnimation() {
  chrome.runtime.sendMessage({ type: 'stopAnimationBackground' });
  console.log('アニメーション停止メッセージをバックグラウンドに送信しました。');
}

document.addEventListener('DOMContentLoaded', () => {
  // chromeオブジェクトの定義状況を確認
  console.log('Options script loaded.');
  if (typeof chrome !== 'undefined') {
    console.log('chrome object is defined.');
    if (typeof chrome.storage !== 'undefined') {
      console.log('chrome.storage is defined.');
      if (typeof chrome.storage.local !== 'undefined') {
        console.log('chrome.storage.local is defined.');
      } else {
        console.error('chrome.storage.local is undefined!');
      }
    } else {
      console.error('chrome.storage is undefined!');
    }
  } else {
    console.error('chrome object is undefined!');
  }

  const imageUpload = document.getElementById('imageUpload');
  const startAnimationBtn = document.getElementById('startAnimation');
  const stopAnimationBtn = document.getElementById('stopAnimation');
  const animationFrame = document.getElementById('animation-frame');
  const animationSpeedSlider = document.getElementById('animationSpeed');
  const currentSpeedSpan = document.getElementById('currentSpeed');

  if (!imageUpload || !startAnimationBtn || !stopAnimationBtn || !animationFrame || !animationSpeedSlider || !currentSpeedSpan) {
    console.error("必要なDOM要素が見つかりませんでした。HTMLファイルを確認してください。");
    return;
  }

  // UI表示用にchrome.storageから保存されたアニメーションフレームと現在のフレームインデックスをロード
  chrome.storage.local.get(['animationFrames', 'currentFrameIndex'], (result) => {
    if (result.animationFrames && result.animationFrames.length > 0) {
      const animationFramesFromStorage = result.animationFrames;
      const currentFrameIndexFromStorage = result.currentFrameIndex || 0;
      animationFrame.src = animationFramesFromStorage[currentFrameIndexFromStorage];
    }
  });

  // アニメーション速度の設定をロード
  chrome.storage.local.get(['animationInterval'], (result) => {
    const savedInterval = result.animationInterval || 200; // デフォルト値は200ms
    animationSpeedSlider.value = savedInterval;
    currentSpeedSpan.textContent = `${savedInterval}ms`;
  });

  // ファイルアップロードの処理
  imageUpload.addEventListener('change', (event) => {
    const files = Array.from(event.target.files);
    let newAnimationFrames = [];

    // ファイルを連番でソート
    files.sort((a, b) => {
      const numA = extractSequenceNumber(a.name);
      const numB = extractSequenceNumber(b.name);
      return numA - numB; // 昇順にソート
    });

    let loadedCount = 0;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        newAnimationFrames.push(e.target.result);
        loadedCount++;
        if (loadedCount === files.length) {
          // 全ての画像が読み込まれたら、バックグラウンドスクリプトにフレームデータを送信
          chrome.runtime.sendMessage({ type: 'updateFrames', animationFrames: newAnimationFrames }, () => {
            console.log('アニメーションフレームをバックグラウンドに送信しました。');
            // オプションページのUIに最初のフレームを表示
            if (newAnimationFrames.length > 0) {
              animationFrame.src = newAnimationFrames[0];
            }
          });
          // オプションページが閉じられてもアニメーションが継続するように、ストレージにも保存
          chrome.storage.local.set({ animationFrames: newAnimationFrames, currentFrameIndex: 0 }, () => {
            console.log('アニメーションフレームがストレージに保存されました。');
          });
        }
      };
      reader.readAsDataURL(file);
    });
  });

  // ボタンクリックイベントリスナー
  startAnimationBtn.addEventListener('click', startAnimation);
  stopAnimationBtn.addEventListener('click', stopAnimation);

  // アニメーション速度スライダーのイベントリスナー
  animationSpeedSlider.addEventListener('input', (event) => {
    const newSpeed = event.target.value;
    currentSpeedSpan.textContent = `${newSpeed}ms`;
    // バックグラウンドスクリプトに新しい速度を送信
    chrome.runtime.sendMessage({ type: 'updateAnimationInterval', interval: parseInt(newSpeed, 10) }, () => {
      console.log(`アニメーション速度をバックグラウンドに送信しました: ${newSpeed}ms`);
    });
    // ストレージに速度を保存
    chrome.storage.local.set({ animationInterval: parseInt(newSpeed, 10) }, () => {
      console.log(`アニメーション速度をストレージに保存しました: ${newSpeed}ms`);
    });
  });
});