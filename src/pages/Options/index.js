let animationInterval;
let currentFrameIndex = 0;
let animationFrames = [];

// 画像のファイル名から連番を抽出するヘルパー関数
function extractSequenceNumber(filename) {
  const match = filename.match(/_(\d+)\.(png|jpg|jpeg)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

// アニメーション開始関数
function startAnimation() {
  if (animationFrames.length === 0) {
    console.warn('アニメーションフレームがありません。');
    return;
  }

  if (animationInterval) {
    clearInterval(animationInterval);
  }

  animationInterval = setInterval(() => {
    currentFrameIndex = (currentFrameIndex + 1) % animationFrames.length;
    document.getElementById('animation-frame').src = animationFrames[currentFrameIndex];

    // バックグラウンドスクリプトに現在のフレームを送信
    chrome.runtime.sendMessage({ type: 'updateIcon', imageData: animationFrames[currentFrameIndex] });

    chrome.storage.local.set({ currentFrameIndex: currentFrameIndex });
  }, 100); // 100msごとにフレームを更新
}

// アニメーション停止関数
function stopAnimation() {
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
    console.log('アニメーションが停止しました。');
  }
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

  if (!imageUpload || !startAnimationBtn || !stopAnimationBtn || !animationFrame) {
    console.error("必要なDOM要素が見つかりませんでした。HTMLファイルを確認してください。");
    return;
  }

  // chrome.storageから保存されたアニメーションフレームと現在のフレームインデックスをロード
  chrome.storage.local.get(['animationFrames', 'currentFrameIndex'], (result) => {
    if (result.animationFrames) {
      animationFrames = result.animationFrames;
      currentFrameIndex = result.currentFrameIndex || 0;
      if (animationFrames.length > 0) {
        animationFrame.src = animationFrames[currentFrameIndex];
      }
    }
  });

  // ファイルアップロードの処理
  imageUpload.addEventListener('change', (event) => {
    const files = Array.from(event.target.files);

    // ファイルを連番でソート
    files.sort((a, b) => {
      const numA = extractSequenceNumber(a.name);
      const numB = extractSequenceNumber(b.name);
      return numA - numB; // 昇順にソート
    });

    animationFrames = []; // 新しいアップロードで既存のフレームをクリア

    let loadedCount = 0;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        animationFrames.push(e.target.result);
        loadedCount++;
        if (loadedCount === files.length) {
          // 全ての画像が読み込まれたら保存
          chrome.storage.local.set({ animationFrames: animationFrames }, () => {
            console.log('アニメーションフレームが保存されました。');
            // アニメーションを開始していない場合は最初のフレームを表示
            if (!animationInterval && animationFrames.length > 0) {
              animationFrame.src = animationFrames[0];
            }
          });
        }
      };
      reader.readAsDataURL(file);
    });
  });

  // ボタンクリックイベントリスナー
  startAnimationBtn.addEventListener('click', startAnimation);
  stopAnimationBtn.addEventListener('click', stopAnimation);
});