const canvas = new OffscreenCanvas(32, 32);
const ctx = canvas.getContext('2d');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'updateIcon') {
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
    // オプションページが閉じられた後にバックグラウンドでアニメーションを継続するためのロジック（オプション）
    // 必要に応じてここに実装を追加
    console.log("バックグラウンドでのアニメーション開始リクエストを受信しました。");
  } else if (message.type === 'stopAnimationBackground') {
    // オプションページが閉じられた後にバックグラウンドでのアニメーションを停止するためのロジック（オプション）
    // 必要に応じてここに実装を追加
    console.log("バックグラウンドでのアニメーション停止リクエストを受信しました。");
  }
});

console.log('This is the background page.');
console.log('Put the background scripts here.');
