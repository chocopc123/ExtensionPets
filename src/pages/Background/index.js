const canvas = new OffscreenCanvas(32, 32);
const ctx = canvas.getContext('2d');

let backgroundAnimationInterval = null;
let backgroundCurrentFrameIndex = 0;
let backgroundAnimationFrames = [];
let animationDisplayInterval = 200; // デフォルトのアニメーション間隔を200msに設定
let isAnimating = false; // アニメーションが実行中かどうかを追跡

const KEEP_ALIVE_ALARM_NAME = 'animationKeepAlive';

// Service Workerをアクティブに保つためのアラームを作成する関数
function createKeepAliveAlarm() {
  chrome.alarms.get(KEEP_ALIVE_ALARM_NAME, (alarm) => {
    if (typeof alarm === 'undefined') {
      chrome.alarms.create(KEEP_ALIVE_ALARM_NAME, {
        periodInMinutes: 0.5 // 30秒ごとにアラームを発火してService Workerをアクティブに保つ
      });
      console.log('キープアライブアラームを作成しました。');
    }
  });
}

// アニメーションの状態をロードし、アニメーションを開始する共通関数
function loadAndStartAnimation() {
  chrome.storage.local.get(['animationFrames', 'currentFrameIndex', 'animationInterval', 'isAnimating'], (result) => {
    if (result.animationFrames && result.animationFrames.length > 0) {
      backgroundAnimationFrames = result.animationFrames;
      backgroundCurrentFrameIndex = result.currentFrameIndex || 0;
      if (result.animationInterval) {
        animationDisplayInterval = result.animationInterval;
      }
      // 保存されたisAnimatingの状態に基づいてアニメーションを開始または停止
      isAnimating = result.isAnimating || false;
      if (isAnimating) {
        startBackgroundAnimation();
        createKeepAliveAlarm();
        console.log('保存されたアニメーションをロードして再開しました。');
      } else {
        console.log('保存されたアニメーションは停止状態です。');
        // アニメーションが停止している場合は、最初のフレームをアイコンに設定
        const imageDataUrl = backgroundAnimationFrames[backgroundCurrentFrameIndex];
        fetch(imageDataUrl)
          .then(response => response.blob())
          .then(blob => createImageBitmap(blob))
          .then(imgBitmap => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(imgBitmap, 0, 0, canvas.width, canvas.height);
            chrome.action.setIcon({
              imageData: ctx.getImageData(0, 0, canvas.width, canvas.height)
            });
          })
          .catch(error => console.error('Error setting initial icon when not animating:', error));
      }
    } else {
      console.log('保存されたアニメーションフレームが見つかりませんでした。');
    }
  });
}

function startBackgroundAnimation() {
  if (backgroundAnimationFrames.length === 0) {
    console.warn('バックグラウンドアニメーションフレームがありません。');
    return;
  }

  if (backgroundAnimationInterval) {
    clearInterval(backgroundAnimationInterval);
  }

  isAnimating = true;
  chrome.storage.local.set({ isAnimating: true });

  // アニメーション開始時に現在のフレームを即座にアイコンに設定
  const initialImageDataUrl = backgroundAnimationFrames[backgroundCurrentFrameIndex];
  fetch(initialImageDataUrl)
    .then(response => response.blob())
    .then(blob => createImageBitmap(blob))
    .then(imgBitmap => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(imgBitmap, 0, 0, canvas.width, canvas.height);
      chrome.action.setIcon({
        imageData: ctx.getImageData(0, 0, canvas.width, canvas.height)
      });
      console.log(`初期アイコンをフレーム ${backgroundCurrentFrameIndex} で設定しました。`);
    })
    .catch(error => console.error('Error setting initial icon for animation:', error));

  backgroundAnimationInterval = setInterval(() => {
    backgroundCurrentFrameIndex = (backgroundCurrentFrameIndex + 1) % backgroundAnimationFrames.length;
    const imageDataUrl = backgroundAnimationFrames[backgroundCurrentFrameIndex];

    fetch(imageDataUrl)
      .then(response => response.blob())
      .then(blob => createImageBitmap(blob))
      .then(imgBitmap => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imgBitmap, 0, 0, canvas.width, canvas.height);
        chrome.action.setIcon({
          imageData: ctx.getImageData(0, 0, canvas.width, canvas.height)
        });
      })
      .catch(error => console.error('Error updating icon from background animation:', error));
  }, animationDisplayInterval); // 設定されたアニメーション間隔を使用
}

function stopBackgroundAnimation() {
  if (backgroundAnimationInterval) {
    clearInterval(backgroundAnimationInterval);
    backgroundAnimationInterval = null;
    console.log('バックグラウンドアニメーションが停止しました。');
  }
  isAnimating = false;
  chrome.storage.local.set({ isAnimating: false });
  // アニメーション停止時にキープアライブアラームもクリア
  chrome.alarms.clear(KEEP_ALIVE_ALARM_NAME, (wasCleared) => {
    if (wasCleared) {
      console.log('キープアライブアラームをクリアしました。');
    } else {
      console.log('キープアライブアラームは存在しませんでした。');
    }
  });
}

// キープアライブアラームが発火した際のリスナー
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEP_ALIVE_ALARM_NAME) {
    // Service Workerをアクティブに保つための軽量な処理
    // chrome.runtime.getPlatformInfo()のようなAPI呼び出しがService Workerのタイマーをリセットする
    chrome.runtime.getPlatformInfo(() => {
      console.log('キープアライブアラーム発火: Service Workerアクティブを維持。');
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'updateIcon') {
    // この部分はオプションページからのアイコン更新メッセージ用（一時的なものか、あるいは即時更新用）
    // メインのアニメーションロジックはstartBackgroundAnimation/stopBackgroundAnimationに移す
    const imageDataUrl = message.imageData;

    fetch(imageDataUrl)
      .then(response => response.blob())
      .then(blob => createImageBitmap(blob))
      .then(imgBitmap => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imgBitmap, 0, 0, canvas.width, canvas.height);
        chrome.action.setIcon({
          imageData: ctx.getImageData(0, 0, canvas.width, canvas.height)
        });
      })
      .catch(error => console.error('Error loading or processing image for icon update:', error));
  } else if (message.type === 'startAnimationBackground') {
    startBackgroundAnimation();
    createKeepAliveAlarm(); // 開始メッセージ受信時もキープアライブを確実に開始
  } else if (message.type === 'stopAnimationBackground') {
    stopBackgroundAnimation();
  } else if (message.type === 'updateFrames') {
    backgroundAnimationFrames = message.animationFrames;
    // フレームデータが更新されたら、現在のアニメーションをリセットまたは再開
    if (backgroundAnimationInterval) {
      stopBackgroundAnimation();
      startBackgroundAnimation();
    } else if (backgroundAnimationFrames.length > 0) {
        // アニメーションが停止している場合は最初のフレームを表示
        const imageDataUrl = backgroundAnimationFrames[0];
        fetch(imageDataUrl)
        .then(response => response.blob())
        .then(blob => createImageBitmap(blob))
        .then(imgBitmap => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(imgBitmap, 0, 0, canvas.width, canvas.height);
            chrome.action.setIcon({
                imageData: ctx.getImageData(0, 0, canvas.width, canvas.height)
            });
        })
        .catch(error => console.error('Error setting initial icon from background update:', error));
    }
  } else if (message.type === 'updateAnimationInterval') {
    animationDisplayInterval = message.interval; // 新しいアニメーション間隔を更新
    console.log(`バックグラウンドでアニメーション間隔を更新しました: ${animationDisplayInterval}ms`);
    if (backgroundAnimationInterval) {
      // アニメーションが実行中の場合、新しい間隔で再起動
      stopBackgroundAnimation();
      startBackgroundAnimation();
    }
  } else if (message.type === 'getAnimationStatus') {
    sendResponse({ isAnimating: isAnimating });
  } else if (message.type === 'setAnimationStatus') {
    isAnimating = message.isAnimating;
    chrome.storage.local.set({ isAnimating: isAnimating });
  }
});

// 拡張機能がインストールされたときにアニメーションをロードして再開
chrome.runtime.onInstalled.addListener(() => {
  console.log('chrome.runtime.onInstalled fired. Attempting to load animation.');
  loadAndStartAnimation();
});

// ブラウザが起動したときにアニメーションをロードして再開
chrome.runtime.onStartup.addListener(() => {
  console.log('chrome.runtime.onStartup fired. Attempting to restart animation.');
  loadAndStartAnimation();
});

// Service Workerがアクティブになったときに、保存されたアニメーション状態をロードして再開
// このリスナーは、Service Workerがアイドル状態から再起動された際にアニメーションを再開するために残しておく
chrome.runtime.onConnect.addListener(() => {
  console.log('chrome.runtime.onConnect fired. Attempting to restart animation.');
  loadAndStartAnimation();
});


console.log('This is the background page.');
console.log('Put the background scripts here.');
