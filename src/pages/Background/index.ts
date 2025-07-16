const canvas: OffscreenCanvas = new OffscreenCanvas(32, 32);
const ctx: OffscreenCanvasRenderingContext2D | null = canvas.getContext('2d');

let backgroundAnimationInterval: NodeJS.Timeout | null = null;
let backgroundCurrentFrameIndex: number = 0;
let backgroundAnimationFrames: string[] = [];
let animationDisplayInterval: number = 200;
let isAnimating: boolean = false;

interface AnimationSet {
  frames: string[];
  interval: number;
}

let savedAnimationSets: { [key: string]: AnimationSet } = {};
let currentActiveAnimationName: string | null = null;
let currentPreviewFrames: string[] = [];

const KEEP_ALIVE_ALARM_NAME: string = 'animationKeepAlive';

function createKeepAliveAlarm(): void {
  chrome.alarms.get(KEEP_ALIVE_ALARM_NAME, (alarm?: chrome.alarms.Alarm) => {
    if (typeof alarm === 'undefined') {
      chrome.alarms.create(KEEP_ALIVE_ALARM_NAME, {
        periodInMinutes: 0.5
      });
    }
  });
}

function loadAndStartAnimation(): void {
  chrome.storage.local.get(['animationFrames', 'currentFrameIndex', 'animationInterval', 'isAnimating', 'savedAnimationSets', 'currentActiveAnimationName'], (result: {
    animationFrames?: string[];
    currentFrameIndex?: number;
    animationInterval?: number;
    isAnimating?: boolean;
    savedAnimationSets?: { [key: string]: AnimationSet };
    currentActiveAnimationName?: string;
  }) => {
    savedAnimationSets = result.savedAnimationSets || {};
    currentActiveAnimationName = result.currentActiveAnimationName || null;

    let framesToLoad: string[] = [];
    let intervalToLoad: number = result.animationInterval || 200;
    let shouldAnimate: boolean = result.isAnimating || false;

    if (currentActiveAnimationName && savedAnimationSets[currentActiveAnimationName]) {
      framesToLoad = savedAnimationSets[currentActiveAnimationName].frames;
      intervalToLoad = savedAnimationSets[currentActiveAnimationName].interval;
    } else if (result.animationFrames && result.animationFrames.length > 0) {
      framesToLoad = result.animationFrames;
    }

    if (framesToLoad.length > 0) {
      backgroundAnimationFrames = framesToLoad;
      backgroundCurrentFrameIndex = result.currentFrameIndex || 0;
      animationDisplayInterval = intervalToLoad;
      isAnimating = shouldAnimate;

      if (isAnimating) {
        startBackgroundAnimation();
        createKeepAliveAlarm();
      } else {
        const imageDataUrl = backgroundAnimationFrames[backgroundCurrentFrameIndex];
        if (imageDataUrl && ctx) {
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
    }
  });
}

function startBackgroundAnimation(): void {
  if (backgroundAnimationFrames.length === 0) {
    return;
  }

  if (backgroundAnimationInterval) {
    clearInterval(backgroundAnimationInterval);
  }

  isAnimating = true;
  chrome.storage.local.set({ isAnimating: true });

  const initialImageDataUrl = backgroundAnimationFrames[backgroundCurrentFrameIndex];
  if (initialImageDataUrl && ctx) {
    fetch(initialImageDataUrl)
      .then(response => response.blob())
      .then(blob => createImageBitmap(blob))
      .then(imgBitmap => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imgBitmap, 0, 0, canvas.width, canvas.height);
        chrome.action.setIcon({
          imageData: ctx.getImageData(0, 0, canvas.width, canvas.height)
        });
      })
      .catch(error => console.error('Error setting initial icon for animation:', error));
  }

  backgroundAnimationInterval = setInterval(() => {
    backgroundCurrentFrameIndex = (backgroundCurrentFrameIndex + 1) % backgroundAnimationFrames.length;
    const imageDataUrl = backgroundAnimationFrames[backgroundCurrentFrameIndex];

    if (imageDataUrl && ctx) {
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
    }
  }, animationDisplayInterval);
}

function stopBackgroundAnimation(): void {
  if (backgroundAnimationInterval) {
    clearInterval(backgroundAnimationInterval);
    backgroundAnimationInterval = null;
  }
  isAnimating = false;
  chrome.storage.local.set({ isAnimating: false });
  chrome.alarms.clear(KEEP_ALIVE_ALARM_NAME, (wasCleared: boolean) => {
    // console.log('Keep alive alarm cleared:', wasCleared);
  });
}

chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
  if (alarm.name === KEEP_ALIVE_ALARM_NAME) {
    chrome.runtime.getPlatformInfo(() => {
      // This is a no-op to keep the service worker alive.
    });
  }
});

chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (message.type === 'updateIcon') {
    const imageDataUrl: string = message.imageData;

    if (ctx) {
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
    }
  } else if (message.type === 'startAnimationBackground') {
    startBackgroundAnimation();
    createKeepAliveAlarm();
  } else if (message.type === 'stopAnimationBackground') {
    stopBackgroundAnimation();
  } else if (message.type === 'updateFrames') {
    backgroundAnimationFrames = message.animationFrames;
    if (backgroundAnimationInterval) {
      stopBackgroundAnimation();
      startBackgroundAnimation();
    } else if (backgroundAnimationFrames.length > 0) {
        const imageDataUrl = backgroundAnimationFrames[0];
        if (imageDataUrl && ctx) {
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
  } else if (message.type === 'getAnimationStatus') {
    sendResponse({ isAnimating: isAnimating });
  } else if (message.type === 'setAnimationStatus') {
    isAnimating = message.isAnimating;
    chrome.storage.local.set({ isAnimating: isAnimating });
  } else if (message.type === 'updateFramesPreview') {
    currentPreviewFrames = message.animationFrames;
    chrome.storage.local.set({ currentPreviewFrames: currentPreviewFrames }, () => {
      sendResponse({ success: true });
    });
    return true;
  } else if (message.type === 'saveAnimation') {
    const { animationName, animationFrames, animationInterval } = message;
    chrome.storage.local.get(['savedAnimationSets'], (result: { savedAnimationSets?: { [key: string]: AnimationSet } }) => {
      const existingSets = result.savedAnimationSets || {};
      existingSets[animationName] = { frames: animationFrames, interval: animationInterval };
      chrome.storage.local.set({ savedAnimationSets: existingSets }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (message.type === 'loadAnimation') {
    const { animationName } = message;
    chrome.storage.local.get(['savedAnimationSets'], (result: { savedAnimationSets?: { [key: string]: AnimationSet } }) => {
      const savedSets = result.savedAnimationSets || {};
      if (savedSets[animationName]) {
        backgroundAnimationFrames = savedSets[animationName].frames;
        animationDisplayInterval = savedSets[animationName].interval;
        backgroundCurrentFrameIndex = 0;
        currentActiveAnimationName = animationName;
        chrome.storage.local.set({ currentActiveAnimationName: animationName, animationFrames: backgroundAnimationFrames, currentFrameIndex: 0 }, () => {
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
    return true;
  } else if (message.type === 'deleteAnimation') {
    const { animationName } = message;
    chrome.storage.local.get(['savedAnimationSets', 'currentActiveAnimationName'], (result: { savedAnimationSets?: { [key: string]: AnimationSet }, currentActiveAnimationName?: string }) => {
      const existingSets = result.savedAnimationSets || {};
      let activeName = result.currentActiveAnimationName;

      if (existingSets[animationName]) {
        delete existingSets[animationName];
        const updates: { savedAnimationSets: { [key: string]: AnimationSet }; currentActiveAnimationName?: string | null } = { savedAnimationSets: existingSets };
        if (activeName === animationName) {
          updates.currentActiveAnimationName = null;
          stopBackgroundAnimation();
        }
        chrome.storage.local.set(updates, () => {
          sendResponse({ success: true });
        });
      } else {
        console.error(`アニメーション「${animationName}」が見つかりませんでした。`);
        sendResponse({ success: false });
      }
    });
    return true;
  } else if (message.type === 'updateSavedAnimationInterval') {
    const { animationName, interval: newInterval } = message;
    if (savedAnimationSets[animationName]) {
      savedAnimationSets[animationName].interval = newInterval;
      chrome.storage.local.set({ savedAnimationSets: savedAnimationSets }, () => {
        sendResponse({ success: true });
      });
      if (currentActiveAnimationName === animationName) {
        animationDisplayInterval = newInterval;
        if (isAnimating) {
          stopBackgroundAnimation();
          startBackgroundAnimation();
        }
      }
    } else {
      console.error(`アニメーション「${animationName}」が見つかりませんでした。`);
      sendResponse({ success: false });
    }
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  loadAndStartAnimation();
});

chrome.runtime.onStartup.addListener(() => {
  loadAndStartAnimation();
});

chrome.runtime.onConnect.addListener(() => {
  loadAndStartAnimation();
});
