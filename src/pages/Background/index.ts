const canvas: OffscreenCanvas = new OffscreenCanvas(32, 32);
const ctx: OffscreenCanvasRenderingContext2D | null = canvas.getContext('2d');

interface AnimationSet {
  frames: string[];
  interval: number;
}

interface BackgroundState {
  animationInterval: number | null;
  currentFrameIndex: number;
  animationFrames: string[];
  displayInterval: number;
  isAnimating: boolean;
  savedAnimationSets: { [key: string]: AnimationSet };
  currentActiveAnimationName: string | null;
  currentPreviewFrames: string[];
}

const state: BackgroundState = {
  animationInterval: null,
  currentFrameIndex: 0,
  animationFrames: [],
  displayInterval: 200,
  isAnimating: false,
  savedAnimationSets: {},
  currentActiveAnimationName: null,
  currentPreviewFrames: [],
};

const KEEP_ALIVE_ALARM_NAME: string = 'animationKeepAlive';

async function drawIcon(imageDataUrl: string): Promise<void> {
  if (!ctx) {
    console.error('2Dコンテキストが利用できません。');
    return;
  }
  try {
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();
    const imgBitmap = await createImageBitmap(blob);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgBitmap, 0, 0, canvas.width, canvas.height);
    chrome.action.setIcon({
      imageData: ctx.getImageData(0, 0, canvas.width, canvas.height)
    });
  } catch (error) {
    console.error('アイコンの描画または処理中にエラーが発生しました:', error);
  }
}

function createKeepAliveAlarm(): void {
  chrome.alarms.get(KEEP_ALIVE_ALARM_NAME, (alarm?: chrome.alarms.Alarm) => {
    if (typeof alarm === 'undefined') {
      chrome.alarms.create(KEEP_ALIVE_ALARM_NAME, {
        periodInMinutes: 0.5
      });
    }
  });
}

function startBackgroundAnimation(): void {
  if (state.animationFrames.length === 0) {
    return;
  }

  if (state.animationInterval) {
    clearInterval(state.animationInterval);
  }

  state.isAnimating = true;
  chrome.storage.local.set({ isAnimating: true });

  drawIcon(state.animationFrames[state.currentFrameIndex]);

  state.animationInterval = setInterval(() => {
    state.currentFrameIndex = (state.currentFrameIndex + 1) % state.animationFrames.length;
    drawIcon(state.animationFrames[state.currentFrameIndex]);
  }, state.displayInterval);
}

function stopBackgroundAnimation(): void {
  if (state.animationInterval) {
    clearInterval(state.animationInterval);
    state.animationInterval = null;
  }
  state.isAnimating = false;
  chrome.storage.local.set({ isAnimating: false });
  chrome.alarms.clear(KEEP_ALIVE_ALARM_NAME, (wasCleared: boolean) => {
    // console.log('Keep alive alarm cleared:', wasCleared);
  });
}

async function loadAnimationStateFromStorage(): Promise<void> {
  const result = await chrome.storage.local.get(['animationFrames', 'currentFrameIndex', 'animationInterval', 'isAnimating', 'savedAnimationSets', 'currentActiveAnimationName']);

  state.savedAnimationSets = result.savedAnimationSets || {};
  state.currentActiveAnimationName = result.currentActiveAnimationName || null;

  let framesToLoad: string[] = [];
  let intervalToLoad: number = result.animationInterval || 200;
  let shouldAnimate: boolean = result.isAnimating || false;

  if (state.currentActiveAnimationName && state.savedAnimationSets[state.currentActiveAnimationName]) {
    framesToLoad = state.savedAnimationSets[state.currentActiveAnimationName].frames;
    intervalToLoad = state.savedAnimationSets[state.currentActiveAnimationName].interval;
  } else if (result.animationFrames && result.animationFrames.length > 0) {
    framesToLoad = result.animationFrames;
  }

  if (framesToLoad.length > 0) {
    state.animationFrames = framesToLoad;
    state.currentFrameIndex = result.currentFrameIndex || 0;
    state.displayInterval = intervalToLoad;
    state.isAnimating = shouldAnimate;

    if (state.isAnimating) {
      startBackgroundAnimation();
      createKeepAliveAlarm();
    } else {
      drawIcon(state.animationFrames[state.currentFrameIndex]);
    }
  }
}

// Message Handlers
function handleUpdateIcon(message: any): void {
  drawIcon(message.imageData);
}

function handleStartAnimationBackground(): void {
  startBackgroundAnimation();
  createKeepAliveAlarm();
}

function handleStopAnimationBackground(): void {
  stopBackgroundAnimation();
}

function handleUpdateFrames(message: any): void {
  state.animationFrames = message.animationFrames;
  if (state.animationInterval) {
    stopBackgroundAnimation();
    startBackgroundAnimation();
  } else if (state.animationFrames.length > 0) {
    drawIcon(state.animationFrames[0]);
  }
}

function handleGetAnimationStatus(sendResponse: (response?: any) => void): void {
  sendResponse({ isAnimating: state.isAnimating });
}

function handleSetAnimationStatus(message: any): void {
  state.isAnimating = message.isAnimating;
  chrome.storage.local.set({ isAnimating: state.isAnimating });
}

function handleUpdateFramesPreview(message: any, sendResponse: (response?: any) => void): boolean {
  state.currentPreviewFrames = message.animationFrames;
  chrome.storage.local.set({ currentPreviewFrames: state.currentPreviewFrames }, () => {
    sendResponse({ success: true });
  });
  return true;
}

function handleSaveAnimation(message: any, sendResponse: (response?: any) => void): boolean {
  const { animationName, animationFrames, animationInterval } = message;
  chrome.storage.local.get(['savedAnimationSets'], (result: { savedAnimationSets?: { [key: string]: AnimationSet } }) => {
    const existingSets = result.savedAnimationSets || {};
    existingSets[animationName] = { frames: animationFrames, interval: animationInterval };
    chrome.storage.local.set({ savedAnimationSets: existingSets }, () => {
      state.savedAnimationSets = existingSets;
      sendResponse({ success: true });
    });
  });
  return true;
}

function handleLoadAnimation(message: any, sendResponse: (response?: any) => void): boolean {
  const { animationName } = message;
  chrome.storage.local.get(['savedAnimationSets'], (result: { savedAnimationSets?: { [key: string]: AnimationSet } }) => {
    const savedSets = result.savedAnimationSets || {};
    if (savedSets[animationName]) {
      state.animationFrames = savedSets[animationName].frames;
      state.displayInterval = savedSets[animationName].interval;
      state.currentFrameIndex = 0;
      state.currentActiveAnimationName = animationName;
      state.savedAnimationSets = savedSets;
      chrome.storage.local.set({ currentActiveAnimationName: animationName, animationFrames: state.animationFrames, currentFrameIndex: 0 }, () => {
        if (state.isAnimating) {
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
}

function handleDeleteAnimation(message: any, sendResponse: (response?: any) => void): boolean {
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
        state.savedAnimationSets = existingSets;
        sendResponse({ success: true });
      });
    } else {
      console.error(`アニメーション「${animationName}」が見つかりませんでした。`);
      sendResponse({ success: false });
    }
  });
  return true;
}

function handleUpdateSavedAnimationInterval(message: any, sendResponse: (response?: any) => void): boolean {
  const { animationName, interval: newInterval } = message;
  chrome.storage.local.get(['savedAnimationSets'], (result: { savedAnimationSets?: { [key: string]: AnimationSet } }) => {
    const currentSavedSets = result.savedAnimationSets || {};
    if (currentSavedSets[animationName]) {
      currentSavedSets[animationName].interval = newInterval;
      chrome.storage.local.set({ savedAnimationSets: currentSavedSets }, () => {
        state.savedAnimationSets = currentSavedSets;
        sendResponse({ success: true });
      });
      if (state.currentActiveAnimationName === animationName) {
        state.displayInterval = newInterval;
        if (state.isAnimating) {
          stopBackgroundAnimation();
          startBackgroundAnimation();
        }
      }
    } else {
      console.error(`アニメーション「${animationName}」が見つかりませんでした。`);
      sendResponse({ success: false });
    }
  });
  return true;
}

function handleUpdateAnimationInterval(message: any, sendResponse: (response?: any) => void): boolean {
  const { interval: newInterval } = message;
  state.displayInterval = newInterval;
  chrome.storage.local.set({ animationInterval: newInterval }, () => {
    sendResponse({ success: true });
  });
  if (state.isAnimating) {
    stopBackgroundAnimation();
    startBackgroundAnimation();
  }
  return true;
}

chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
  if (alarm.name === KEEP_ALIVE_ALARM_NAME) {
    chrome.runtime.getPlatformInfo(() => {
      // This is a no-op to keep the service worker alive.
    });
  }
});

chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  switch (message.type) {
    case 'updateIcon':
      handleUpdateIcon(message);
      break;
    case 'startAnimationBackground':
      handleStartAnimationBackground();
      break;
    case 'stopAnimationBackground':
      handleStopAnimationBackground();
      break;
    case 'updateFrames':
      handleUpdateFrames(message);
      break;
    case 'getAnimationStatus':
      handleGetAnimationStatus(sendResponse);
      break;
    case 'setAnimationStatus':
      handleSetAnimationStatus(message);
      break;
    case 'updateFramesPreview':
      return handleUpdateFramesPreview(message, sendResponse);
    case 'saveAnimation':
      return handleSaveAnimation(message, sendResponse);
    case 'loadAnimation':
      return handleLoadAnimation(message, sendResponse);
    case 'deleteAnimation':
      return handleDeleteAnimation(message, sendResponse);
    case 'updateSavedAnimationInterval':
      return handleUpdateSavedAnimationInterval(message, sendResponse);
    case 'updateAnimationInterval':
      return handleUpdateAnimationInterval(message, sendResponse);
    default:
      console.warn('不明なメッセージタイプ:', message.type);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  loadAnimationStateFromStorage();
});

chrome.runtime.onStartup.addListener(() => {
  loadAnimationStateFromStorage();
});

chrome.runtime.onConnect.addListener(() => {
  loadAnimationStateFromStorage();
});
