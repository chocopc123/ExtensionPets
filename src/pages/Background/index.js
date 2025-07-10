const canvas = new OffscreenCanvas(32, 32);
const ctx = canvas.getContext('2d');

let backgroundAnimationInterval = null;
let backgroundCurrentFrameIndex = 0;
let backgroundAnimationFrames = [];

function startBackgroundAnimation() {
  if (backgroundAnimationFrames.length === 0) {
    console.warn('バックグラウンドアニメーションフレームがありません。');
    return;
  }

  if (backgroundAnimationInterval) {
    clearInterval(backgroundAnimationInterval);
  }

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
  }, 100); // 100msごとにフレームを更新
}

function stopBackgroundAnimation() {
  if (backgroundAnimationInterval) {
    clearInterval(backgroundAnimationInterval);
    backgroundAnimationInterval = null;
    console.log('バックグラウンドアニメーションが停止しました。');
  }
}

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
  }
});

// 拡張機能が起動されたときに、保存されたアニメーション状態をロードして再開
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['animationFrames', 'currentFrameIndex'], (result) => {
        if (result.animationFrames && result.animationFrames.length > 0) {
            backgroundAnimationFrames = result.animationFrames;
            backgroundCurrentFrameIndex = result.currentFrameIndex || 0;
            startBackgroundAnimation();
        }
    });
});

console.log('This is the background page.');
console.log('Put the background scripts here.');
