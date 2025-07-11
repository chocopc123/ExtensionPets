const canvas = new OffscreenCanvas(32, 32);
const ctx = canvas.getContext('2d');

let backgroundAnimationInterval = null;
let backgroundCurrentFrameIndex = 0;
let backgroundAnimationFrames = [];
let animationDisplayInterval = 200; // デフォルトのアニメーション間隔を200msに設定
let isAnimating = false; // アニメーションが実行中かどうかを追跡

// 新しいアニメーションセット管理用変数
let savedAnimationSets = {}; // { animationName: { frames: [...], interval: NNN } }
let currentActiveAnimationName = null;
let currentPreviewFrames = []; // 未保存のアップロードされたフレーム用

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
  chrome.storage.local.get(['animationFrames', 'currentFrameIndex', 'animationInterval', 'isAnimating', 'savedAnimationSets', 'currentActiveAnimationName'], (result) => {
    savedAnimationSets = result.savedAnimationSets || {};
    currentActiveAnimationName = result.currentActiveAnimationName || null;

    let framesToLoad = [];
    let intervalToLoad = result.animationInterval || 200;
    let shouldAnimate = result.isAnimating || false;

    if (currentActiveAnimationName && savedAnimationSets[currentActiveAnimationName]) {
      // アクティブなアニメーションセットがある場合、それをロード
      framesToLoad = savedAnimationSets[currentActiveAnimationName].frames;
      intervalToLoad = savedAnimationSets[currentActiveAnimationName].interval;
      console.log(`アクティブなアニメーション「${currentActiveAnimationName}」をロードしました。`);
    } else if (result.animationFrames && result.animationFrames.length > 0) {
      // アクティブなアニメーションがない場合、または最初のロード時に、以前の単一のアニメーションフレームをロード
      framesToLoad = result.animationFrames;
      console.log('以前の単一のアニメーションフレームをロードしました。');
    }

    if (framesToLoad.length > 0) {
      backgroundAnimationFrames = framesToLoad;
      backgroundCurrentFrameIndex = result.currentFrameIndex || 0;
      animationDisplayInterval = intervalToLoad;
      isAnimating = shouldAnimate;

      if (isAnimating) {
        startBackgroundAnimation();
        createKeepAliveAlarm();
        console.log('保存されたアニメーションをロードして再開しました。');
      } else {
        console.log('保存されたアニメーションは停止状態です。');
        // アニメーションが停止している場合は、現在のフレームをアイコンに設定
        const imageDataUrl = backgroundAnimationFrames[backgroundCurrentFrameIndex];
        if (imageDataUrl) {
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
  } else if (message.type === 'updateFramesPreview') {
    // これはオプションページでのプレビュー用なので、ストレージには一時的に保存
    currentPreviewFrames = message.animationFrames;
    chrome.storage.local.set({ currentPreviewFrames: currentPreviewFrames });
    sendResponse({ success: true });
  } else if (message.type === 'saveAnimation') {
    const { animationName, animationFrames, animationInterval } = message;
    chrome.storage.local.get(['savedAnimationSets'], (result) => {
      const existingSets = result.savedAnimationSets || {};
      existingSets[animationName] = { frames: animationFrames, interval: animationInterval };
      chrome.storage.local.set({ savedAnimationSets: existingSets }, () => {
        console.log(`アニメーション「${animationName}」を保存しました。`);
        sendResponse({ success: true });
      });
    });
    return true; // sendResponseを非同期で呼び出すため
  } else if (message.type === 'loadAnimation') {
    const { animationName } = message;
    chrome.storage.local.get(['savedAnimationSets'], (result) => {
      const savedSets = result.savedAnimationSets || {};
      if (savedSets[animationName]) {
        backgroundAnimationFrames = savedSets[animationName].frames;
        animationDisplayInterval = savedSets[animationName].interval;
        backgroundCurrentFrameIndex = 0; // 新しいアニメーションをロードしたら最初のフレームから
        currentActiveAnimationName = animationName;
        chrome.storage.local.set({ currentActiveAnimationName: animationName, animationInterval: animationDisplayInterval, animationFrames: backgroundAnimationFrames, currentFrameIndex: 0 }, () => {
          console.log(`アニメーション「${animationName}」をアクティブにしました。`);
          // 必要であればアニメーションを開始
          if (isAnimating) {
            startBackgroundAnimation();
          }
          sendResponse({ success: true });
        });
      } else {
        console.error(`アニメーション「${animationName}」が見つかりませんでした。`);
        sendResponse({ success: false });
      }
    });
    return true; // sendResponseを非同期で呼び出すため
  } else if (message.type === 'deleteAnimation') {
    const { animationName } = message;
    chrome.storage.local.get(['savedAnimationSets', 'currentActiveAnimationName'], (result) => {
      const existingSets = result.savedAnimationSets || {};
      let activeName = result.currentActiveAnimationName;

      if (existingSets[animationName]) {
        delete existingSets[animationName];
        const updates = { savedAnimationSets: existingSets };
        if (activeName === animationName) {
          // 削除されたアニメーションが現在アクティブな場合、アクティブなものをリセット
          updates.currentActiveAnimationName = null;
          stopBackgroundAnimation(); // アニメーションも停止
          // デフォルトアイコンに戻す、または何もしない
        }
        chrome.storage.local.set(updates, () => {
          console.log(`アニメーション「${animationName}」を削除しました。`);
          sendResponse({ success: true });
        });
      } else {
        console.error(`アニメーション「${animationName}」が見つかりませんでした。`);
        sendResponse({ success: false });
      }
    });
    return true; // sendResponseを非同期で呼び出すため
  } else if (message.type === 'updateCurrentAnimationInterval') {
    // 現在アクティブなアニメーションの速度を更新
    const newInterval = message.interval;
    if (currentActiveAnimationName && savedAnimationSets[currentActiveAnimationName]) {
      savedAnimationSets[currentActiveAnimationName].interval = newInterval;
      chrome.storage.local.set({ savedAnimationSets: savedAnimationSets }, () => {
        console.log(`アクティブなアニメーション「${currentActiveAnimationName}」の速度を${newInterval}msに更新しました。`);
      });
    }
    // 現在再生中のアニメーションの間隔も更新
    animationDisplayInterval = newInterval;
    if (isAnimating) {
      stopBackgroundAnimation();
      startBackgroundAnimation();
    }
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
