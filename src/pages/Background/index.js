const canvas = new OffscreenCanvas(32, 32);
const ctx = canvas.getContext('2d');

const imageUrl = chrome.runtime.getURL('stickman.png');

const totalFrames = 13; // フレームの総数
let currentFrame = 0;

fetch(imageUrl)
  .then(response => response.blob())
  .then(blob => createImageBitmap(blob))
  .then(imgBitmap => {
    const frameWidth = imgBitmap.width; // 縦分割なので幅は画像の元の幅
    const frameHeight = imgBitmap.height / totalFrames;

    console.log(`Image Width: ${imgBitmap.width}`);
    console.log(`Image Height: ${imgBitmap.height}`);
    console.log(`Total Frames: ${totalFrames}`);
    console.log(`Calculated Frame Width: ${frameWidth}`);
    console.log(`Calculated Frame Height: ${frameHeight}`);

    setInterval(() => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(
        imgBitmap,
        0, // sourceX
        currentFrame * frameHeight, // sourceY
        frameWidth,
        frameHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      chrome.action.setIcon({
        imageData: ctx.getImageData(0, 0, canvas.width, canvas.height)
      });

      currentFrame = (currentFrame + 1) % totalFrames;
    }, 100);
  })
  .catch(error => console.error('Error loading or processing image:', error));

console.log('This is the background page.');
console.log('Put the background scripts here.');
