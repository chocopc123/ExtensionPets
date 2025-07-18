export function extractSequenceNumber(filename: string): number {
  const match = filename.match(/_(\d+)\.(png|jpg|jpeg)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

export function estimateBase64SizeInBytes(base64Content: string | null): number {
  if (!base64Content) return 0;
  const padding = (base64Content.match(/=/g) || []).length;
  return (base64Content.length * 0.75) - padding;
}

export interface AnimationSet {
  frames: string[];
  interval: number;
}

export interface DOMCache {
  imageUpload: HTMLDivElement;
  actualImageUpload: HTMLInputElement;
  animationContainer: HTMLDivElement;
  savedAnimationsList: HTMLDivElement;
  animationNameModal: HTMLDivElement;
  modalAnimationNameInput: HTMLInputElement;
  cancelSaveAnimationBtn: HTMLButtonElement;
  confirmSaveAnimationBtn: HTMLButtonElement;
  totalUsageElement: HTMLSpanElement | null;
}

export function getDOMReferences(): DOMCache | null {
  const imageUpload = document.getElementById('imageUpload') as HTMLDivElement;
  const actualImageUpload = document.getElementById('actualImageUpload') as HTMLInputElement;
  const animationContainer = document.getElementById('animation-container') as HTMLDivElement;
  const savedAnimationsList = document.getElementById('saved-animations-list') as HTMLDivElement;
  const animationNameModal = document.getElementById('animationNameModal') as HTMLDivElement;
  const modalAnimationNameInput = document.getElementById('modalAnimationNameInput') as HTMLInputElement;
  const cancelSaveAnimationBtn = document.getElementById('cancelSaveAnimationBtn') as HTMLButtonElement;
  const confirmSaveAnimationBtn = document.getElementById('confirmSaveAnimationBtn') as HTMLButtonElement;
  const totalUsageElement = document.getElementById('storage-usage') as HTMLSpanElement;

  if (!imageUpload || !actualImageUpload || !animationContainer || !savedAnimationsList || !animationNameModal || !modalAnimationNameInput || !cancelSaveAnimationBtn || !confirmSaveAnimationBtn || !totalUsageElement) {
    console.error("必要なDOM要素が見つかりませんでした。HTMLファイルを確認してください。");
    return null;
  }
  return {
    imageUpload,
    actualImageUpload,
    animationContainer,
    savedAnimationsList,
    animationNameModal,
    modalAnimationNameInput,
    cancelSaveAnimationBtn,
    confirmSaveAnimationBtn,
    totalUsageElement
  };
}

export function renderAnimationFrames(frames: string[], container: HTMLDivElement): void {
  container.innerHTML = '';
  frames.forEach(frameSrc => {
    const img = document.createElement('img');
    img.src = frameSrc;
    img.className = 'w-[75px] h-[75px] object-cover mr-1.5';
    container.appendChild(img);
  });
}

export function loadCurrentAnimationState(animationContainer: HTMLDivElement): void {
  chrome.storage.local.get(['animationFrames', 'currentFrameIndex'], (result: { animationFrames?: string[]; currentFrameIndex?: number }) => {
    if (result.animationFrames && result.animationFrames.length > 0) {
      renderAnimationFrames(result.animationFrames, animationContainer);
    }
  });
}

export function extractBaseName(filename: string): string {
  const parts = filename.split('.');
  if (parts.length > 1) {
    const nameWithoutExt = parts.slice(0, -1).join('.');
    const match = nameWithoutExt.match(/^(.*?)_(\d+)$/);
    return match ? match[1] : nameWithoutExt;
  }
  return filename;
}

export async function handleImageUpload(event: Event, animationContainer: HTMLDivElement, animationNameModal: HTMLDivElement, modalAnimationNameInput: HTMLInputElement, renderFrames: (frames: string[], container: HTMLDivElement) => void, extractSeqNum: (filename: string) => number, extractBase: (filename: string) => string): Promise<void> {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files || []);
  files.sort((a, b) => {
    const numA = extractSeqNum(a.name);
    const numB = extractSeqNum(b.name);
    return numA - numB;
  });

  const fileReadPromises = files.map(file => {
    return new Promise<string | ArrayBuffer | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target?.result || null);
      };
      reader.readAsDataURL(file);
    });
  });

  const newAnimationFrames = await Promise.all(fileReadPromises);
  const filteredFrames = newAnimationFrames.filter((frame): frame is string => typeof frame === 'string');

  chrome.runtime.sendMessage({ type: 'updateFramesPreview', animationFrames: filteredFrames }, () => {
    renderFrames(filteredFrames, animationContainer);
    chrome.storage.local.set({ currentActiveAnimationName: null }, () => {
      animationNameModal.classList.remove('hidden');
      if (files.length > 0) {
        const firstFileName = files[0].name;
        const baseName = extractBase(firstFileName);
        modalAnimationNameInput.value = baseName;
      } else {
        modalAnimationNameInput.value = '';
      }
      modalAnimationNameInput.focus();
    });
  });
  target.value = '';
}

export function handleConfirmSaveAnimation(modalAnimationNameInput: HTMLInputElement, animationNameModal: HTMLDivElement, renderSavedAnimations: (dom: DOMCache) => void): void {
  const animationName = modalAnimationNameInput.value.trim();
  if (!animationName) {
    alert('アニメーション名を入力してください。');
    return;
  }

  chrome.storage.local.get(['currentPreviewFrames', 'animationInterval', 'savedAnimationSets'], (result: {
    currentPreviewFrames?: string[];
    animationInterval?: number;
    savedAnimationSets?: { [key: string]: AnimationSet };
  }) => {
    const framesToSave = result.currentPreviewFrames || [];
    const intervalToSave = result.animationInterval !== undefined ? result.animationInterval : 100;
    const existingSets = result.savedAnimationSets || {};

    if (framesToSave.length === 0) {
      alert('保存するアニメーションフレームがありません。画像をアップロードしてください。');
      return;
    }

    if (existingSets[animationName]) {
      // eslint-disable-next-line no-restricted-globals
      if (!confirm(`アニメーション「${animationName}」は既に存在します。上書きしますか？`)) {
        return;
      }
    }

    chrome.runtime.sendMessage({ type: 'saveAnimation', animationName: animationName, animationFrames: framesToSave, animationInterval: intervalToSave }, (response: { success: boolean }) => {
      if (response && response.success) {
        modalAnimationNameInput.value = '';
        animationNameModal.classList.add('hidden');

        chrome.runtime.sendMessage({ type: 'loadAnimation', animationName: animationName }, (loadResponse: { success: boolean }) => {
          if (loadResponse && loadResponse.success) {
            chrome.storage.local.set({ currentActiveAnimationName: animationName }, () => {
              const currentDom = getDOMReferences();
              if (currentDom) {
                renderSavedAnimations(currentDom);
              }
            });
          } else {
            console.error(`アニメーション「${animationName}」の再ロードに失敗しました。`);
          }
        });

      } else {
        console.error(`アニメーション「${animationName}」の保存に失敗しました。`);
      }
    });
  });
}

export function handleCancelSaveAnimation(modalAnimationNameInput: HTMLInputElement, animationNameModal: HTMLDivElement): void {
  animationNameModal.classList.add('hidden');
  modalAnimationNameInput.value = '';
}

export function handleAnimationModalClick(event: MouseEvent, animationNameModal: HTMLDivElement, modalAnimationNameInput: HTMLInputElement): void {
  if (event.target === animationNameModal) {
    animationNameModal.classList.add('hidden');
    modalAnimationNameInput.value = '';
  }
}

export function createAnimationListItem(name: string, animationSet: AnimationSet, currentActiveAnimationName: string | null, animationContainer: HTMLDivElement, renderAnimationFrames: (frames: string[], container: HTMLDivElement) => void, estimateBase64SizeInBytes: (base64Content: string | null) => number, renderSavedAnimations: (dom: DOMCache) => void): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'flex flex-col p-3 mb-3 bg-white rounded-lg shadow-sm border border-indigo-100 transition-all duration-200 hover:shadow-md hover:border-indigo-200';

  const headerRowDiv = document.createElement('div');
  headerRowDiv.className = 'flex items-center justify-between w-full mb-2';

  const animationGroupLabel = document.createElement('label');
  animationGroupLabel.htmlFor = `anim-${name}`;
  animationGroupLabel.className = 'flex items-center cursor-pointer flex-grow text-indigo-800';

  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'savedAnimation';
  input.value = name;
  input.id = `anim-${name}`;
  input.checked = (name === currentActiveAnimationName);
  input.className = 'form-radio h-4 w-4 text-indigo-600 transition duration-150 ease-in-out';

  input.addEventListener('change', (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.checked) {
      chrome.runtime.sendMessage({ type: 'loadAnimation', animationName: name }, (response: { success: boolean }) => {
        if (response && response.success) {
          renderAnimationFrames(animationSet.frames, animationContainer);
        } else {
          console.error(`アニメーション「${name}」のロードに失敗しました。`);
        }
      });
    }
  });

  const thumbnailImg = document.createElement('img');
  if (animationSet.frames && animationSet.frames.length > 0) {
    thumbnailImg.src = animationSet.frames[0];
  } else {
    thumbnailImg.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  }
  thumbnailImg.className = 'w-10 h-10 object-cover ml-1 mr-3 rounded-md border border-gray-200 shadow-sm';

  const animationNameSpan = document.createElement('span');
  animationNameSpan.textContent = name;
  animationNameSpan.className = 'text-base font-semibold text-indigo-700 truncate';

  let animationSize: number = 0;
  if (animationSet.frames) {
    for (const frameSrc of animationSet.frames) {
      const parts = frameSrc.split(',');
      if (parts.length > 1) {
        animationSize += estimateBase64SizeInBytes(parts[1]);
      }
    }
  }
  const animationSizeKB = (animationSize / 1024).toFixed(2);

  animationGroupLabel.appendChild(input);
  animationGroupLabel.appendChild(thumbnailImg);
  animationGroupLabel.appendChild(animationNameSpan);

  const speedControlDiv = document.createElement('div');
  speedControlDiv.className = 'flex items-center flex-shrink-0 ml-4';
  
  const animationSpeedSliderPerItem = document.createElement('input');
  animationSpeedSliderPerItem.type = 'range';
  animationSpeedSliderPerItem.id = `speed-${name}`;
  animationSpeedSliderPerItem.min = '20';
  animationSpeedSliderPerItem.max = '300';
  animationSpeedSliderPerItem.step = '10';
  animationSpeedSliderPerItem.value = animationSet.interval.toString();
  animationSpeedSliderPerItem.className = 'w-24 h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer mr-2';
  speedControlDiv.appendChild(animationSpeedSliderPerItem);

  const currentSpeedSpanPerItem = document.createElement('span');
  currentSpeedSpanPerItem.id = `currentSpeed-${name}`;
  currentSpeedSpanPerItem.className = 'text-sm font-medium text-indigo-600 w-12 text-right';
  currentSpeedSpanPerItem.textContent = `${animationSet.interval}ms`;
  speedControlDiv.appendChild(currentSpeedSpanPerItem);

  animationSpeedSliderPerItem.addEventListener('input', (event: Event) => {
    const target = event.target as HTMLInputElement;
    const newSpeed = target.value;
    currentSpeedSpanPerItem.textContent = `${newSpeed}ms`;
    chrome.runtime.sendMessage({ type: 'updateSavedAnimationInterval', animationName: name, interval: parseInt(newSpeed, 10) }, (response: { success: boolean }) => {
      if (!response || !response.success) {
        console.error(`アニメーション「${name}」の速度更新に失敗しました。`);
      }
    });
  });

  const sizeSpan = document.createElement('span');
  sizeSpan.textContent = `約 ${animationSizeKB}KB`;
  sizeSpan.className = 'text-gray-500 text-xs ml-4';

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '削除';
  deleteBtn.className = 'ml-4 px-3 py-1 bg-red-500 text-white text-sm font-semibold rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 transition-colors duration-200';
  deleteBtn.addEventListener('click', () => {
    // eslint-disable-next-line no-restricted-globals
    if (confirm(`アニメーション「${name}」を本当に削除しますか？`)) {
      chrome.runtime.sendMessage({ type: 'deleteAnimation', animationName: name }, (response: { success: boolean }) => {
        if (response && response.success) {
          const currentDom = getDOMReferences();
          if (currentDom) {
            renderSavedAnimations(currentDom);
          }
        } else {
          console.error(`アニメーション「${name}」の削除に失敗しました。`);
        }
      });
    }
  });

  headerRowDiv.appendChild(animationGroupLabel);
  headerRowDiv.appendChild(speedControlDiv);
  headerRowDiv.appendChild(sizeSpan);
  headerRowDiv.appendChild(deleteBtn);

  div.appendChild(headerRowDiv);
  return div;
}

export function renderSavedAnimations(dom: DOMCache): void {
  let totalAnimationBytes: number = 0;
  chrome.storage.local.get(['savedAnimationSets', 'currentActiveAnimationName'], (result: {
    savedAnimationSets?: { [key: string]: AnimationSet };
    currentActiveAnimationName?: string;
  }) => {
    const savedSets = result.savedAnimationSets || {};
    const currentActiveAnimationName = result.currentActiveAnimationName || null;
    dom.savedAnimationsList.innerHTML = '';

    const animationNames = Object.keys(savedSets).sort();

    if (animationNames.length === 0) {
      dom.savedAnimationsList.innerHTML = '<p>保存されたアニメーションはありません。</p>';
      chrome.storage.local.set({ currentActiveAnimationName: null, animationFrames: [], currentFrameIndex: 0 });
      renderAnimationFrames([], dom.animationContainer);
      if (dom.totalUsageElement) {
        dom.totalUsageElement.textContent = `Approx. 0.00KB`;
      }
      return;
    }

    let newActiveAnimationName = currentActiveAnimationName;

    if (!currentActiveAnimationName || !savedSets[currentActiveAnimationName]) {
      newActiveAnimationName = animationNames[0];
      if (newActiveAnimationName) {
        chrome.runtime.sendMessage({ type: 'loadAnimation', animationName: newActiveAnimationName }, (loadResponse: { success: boolean }) => {
          if (loadResponse && loadResponse.success) {
            chrome.storage.local.set({ currentActiveAnimationName: newActiveAnimationName }, () => {
              if (newActiveAnimationName && savedSets[newActiveAnimationName]) {
                renderAnimationFrames(savedSets[newActiveAnimationName].frames, dom.animationContainer);
              }
              renderSavedAnimations(dom);
            });
          } else {
            console.error(`アニメーション「${newActiveAnimationName}」のロードに失敗しました。`);
          }
        });
        return;
      }
    }

    for (const name of animationNames) {
      const animationSet = savedSets[name];
      const listItem = createAnimationListItem(name, animationSet, newActiveAnimationName, dom.animationContainer, renderAnimationFrames, estimateBase64SizeInBytes, (dom: DOMCache) => renderSavedAnimations(dom));
      dom.savedAnimationsList.appendChild(listItem);

      let animationSize: number = 0;
      if (animationSet.frames) {
        for (const frameSrc of animationSet.frames) {
          const parts = frameSrc.split(',');
          if (parts.length > 1) {
            animationSize += estimateBase64SizeInBytes(parts[1]);
          }
        }
      }
      totalAnimationBytes += animationSize;
    }

    const totalAnimationKB = (totalAnimationBytes / 1024).toFixed(2);
    if (dom.totalUsageElement) {
      dom.totalUsageElement.textContent = `Approx. ${totalAnimationKB}KB`;
    }
  });
}
