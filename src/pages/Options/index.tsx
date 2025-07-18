function extractSequenceNumber(filename: string): number {
  const match = filename.match(/_(\d+)\.(png|jpg|jpeg)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

function estimateBase64SizeInBytes(base64Content: string | null): number {
  if (!base64Content) return 0;
  const padding = (base64Content.match(/=/g) || []).length;
  return (base64Content.length * 0.75) - padding;
}

interface AnimationSet {
  frames: string[];
  interval: number;
}

interface DOMCache {
  imageUpload: HTMLDivElement; // HTMLInputElement から HTMLDivElement に変更
  actualImageUpload: HTMLInputElement; // 新しく追加
  animationContainer: HTMLDivElement;
  savedAnimationsList: HTMLDivElement;
  animationNameModal: HTMLDivElement;
  modalAnimationNameInput: HTMLInputElement;
  cancelSaveAnimationBtn: HTMLButtonElement;
  confirmSaveAnimationBtn: HTMLButtonElement;
  totalUsageElement: HTMLSpanElement | null;
}

let dom: DOMCache;

function getDOMReferences(): DOMCache | null {
  const imageUpload = document.getElementById('imageUpload') as HTMLDivElement; // HTMLInputElement から HTMLDivElement に変更
  const actualImageUpload = document.getElementById('actualImageUpload') as HTMLInputElement; // 新しく追加
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
    actualImageUpload, // 追加
    animationContainer,
    savedAnimationsList,
    animationNameModal,
    modalAnimationNameInput,
    cancelSaveAnimationBtn,
    confirmSaveAnimationBtn,
    totalUsageElement
  };
}

function renderAnimationFrames(frames: string[], container: HTMLDivElement): void {
  container.innerHTML = '';
  frames.forEach(frameSrc => {
    const img = document.createElement('img');
    img.src = frameSrc;
    img.className = 'w-[75px] h-[75px] object-cover mr-1.5';
    container.appendChild(img);
  });
}

function loadCurrentAnimationState(animationContainer: HTMLDivElement): void {
  chrome.storage.local.get(['animationFrames', 'currentFrameIndex'], (result: { animationFrames?: string[]; currentFrameIndex?: number }) => {
    if (result.animationFrames && result.animationFrames.length > 0) {
      renderAnimationFrames(result.animationFrames, animationContainer);
    }
  });
}

function extractBaseName(filename: string): string {
  const parts = filename.split('.');
  if (parts.length > 1) {
    const nameWithoutExt = parts.slice(0, -1).join('.');
    const match = nameWithoutExt.match(/^(.*?)_(\d+)$/);
    return match ? match[1] : nameWithoutExt;
  }
  return filename;
}

async function handleImageUpload(event: Event, animationContainer: HTMLDivElement, animationNameModal: HTMLDivElement, modalAnimationNameInput: HTMLInputElement, renderFrames: (frames: string[], container: HTMLDivElement) => void, extractSeqNum: (filename: string) => number, extractBase: (filename: string) => string): Promise<void> {
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

function handleConfirmSaveAnimation(modalAnimationNameInput: HTMLInputElement, animationNameModal: HTMLDivElement, renderSavedAnimations: () => void): void {
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
              renderSavedAnimations();
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

function handleCancelSaveAnimation(modalAnimationNameInput: HTMLInputElement, animationNameModal: HTMLDivElement): void {
  animationNameModal.classList.add('hidden');
  modalAnimationNameInput.value = '';
}

function handleAnimationModalClick(event: MouseEvent, animationNameModal: HTMLDivElement, modalAnimationNameInput: HTMLInputElement): void {
  if (event.target === animationNameModal) {
    animationNameModal.classList.add('hidden');
    modalAnimationNameInput.value = '';
  }
}

function createAnimationListItem(name: string, animationSet: AnimationSet, currentActiveAnimationName: string | null, animationContainer: HTMLDivElement, renderAnimationFrames: (frames: string[], container: HTMLDivElement) => void, estimateBase64SizeInBytes: (base64Content: string | null) => number, renderSavedAnimations: () => void): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'flex flex-col mb-2.5 w-full';

  const headerRowDiv = document.createElement('div');
  headerRowDiv.className = 'flex items-center w-full gap-x-2.5';

  const animationGroupLabel = document.createElement('label');
  animationGroupLabel.htmlFor = `anim-${name}`;
  animationGroupLabel.className = 'flex items-center cursor-pointer flex-shrink-0 mr-auto';

  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'savedAnimation';
  input.value = name;
  input.id = `anim-${name}`;
  input.checked = (name === currentActiveAnimationName);

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
  thumbnailImg.className = 'w-[35px] h-[35px] object-cover ml-1 mr-2.5 border border-gray-300';

  const animationNameSpan = document.createElement('span');
  animationNameSpan.textContent = name;
  animationNameSpan.className = 'mr-2.5 font-bold';

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
  speedControlDiv.className = 'flex items-center w-1/2 flex-none gap-x-2.5 mr-5'
  
  const animationSpeedSliderPerItem = document.createElement('input');
  animationSpeedSliderPerItem.type = 'range';
  animationSpeedSliderPerItem.id = `speed-${name}`;
  animationSpeedSliderPerItem.min = '20';
  animationSpeedSliderPerItem.max = '300';
  animationSpeedSliderPerItem.step = '10';
  animationSpeedSliderPerItem.value = animationSet.interval.toString();
  animationSpeedSliderPerItem.className = 'h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-lg w-full';
  speedControlDiv.appendChild(animationSpeedSliderPerItem);

  const currentSpeedSpanPerItem = document.createElement('span');
  currentSpeedSpanPerItem.id = `currentSpeed-${name}`;
  currentSpeedSpanPerItem.className = 'text-gray-700 font-medium';
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
  sizeSpan.textContent = `Approx. ${animationSizeKB}KB`;
  sizeSpan.className = 'text-gray-500 text-sm';

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '削除';
  deleteBtn.className = 'px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2';
  deleteBtn.addEventListener('click', () => {
    // eslint-disable-next-line no-restricted-globals
    if (confirm(`アニメーション「${name}を本当に削除しますか？`)) {
      chrome.runtime.sendMessage({ type: 'deleteAnimation', animationName: name }, (response: { success: boolean }) => {
        if (response && response.success) {
          renderSavedAnimations();
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

function renderSavedAnimations(): void {
  let totalAnimationBytes: number = 0;
  chrome.storage.local.get(['savedAnimationSets', 'currentActiveAnimationName'], (result: {
    savedAnimationSets?: { [key: string]: AnimationSet };
    currentActiveAnimationName?: string;
  }) => {
    const savedSets = result.savedAnimationSets || {};
    const currentActiveAnimationName = result.currentActiveAnimationName || null;
    dom.savedAnimationsList.innerHTML = '';

    const animationNames = Object.keys(savedSets).sort(); // アニメーション名をソートして、最も古いものを特定

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

    // 現在アクティブなアニメーションが削除された、または存在しない場合、最も古いアニメーションを選択
    if (!currentActiveAnimationName || !savedSets[currentActiveAnimationName]) {
      newActiveAnimationName = animationNames[0]; // ソートされたリストの最初の要素が最も古い
      if (newActiveAnimationName) { // newActiveAnimationName が null でないことを確認
        chrome.runtime.sendMessage({ type: 'loadAnimation', animationName: newActiveAnimationName }, (loadResponse: { success: boolean }) => {
          if (loadResponse && loadResponse.success) {
            chrome.storage.local.set({ currentActiveAnimationName: newActiveAnimationName }, () => {
              if (newActiveAnimationName && savedSets[newActiveAnimationName]) { // ここで再度チェック
                renderAnimationFrames(savedSets[newActiveAnimationName].frames, dom.animationContainer);
              }
              // 再度renderSavedAnimationsを呼び出してラジオボタンの状態を更新
              renderSavedAnimations();
            });
          } else {
            console.error(`アニメーション「${newActiveAnimationName}」のロードに失敗しました。`);
          }
        });
        return; // ロード処理が非同期なので、ここで一度抜ける
      }
    }

    for (const name of animationNames) {
      const animationSet = savedSets[name];
      const listItem = createAnimationListItem(name, animationSet, newActiveAnimationName, dom.animationContainer, renderAnimationFrames, estimateBase64SizeInBytes, renderSavedAnimations);
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

document.addEventListener('DOMContentLoaded', () => {
  const references = getDOMReferences();
  if (!references) {
    return;
  }
  dom = references;

  loadCurrentAnimationState(dom.animationContainer);
  renderSavedAnimations();

  // ドラッグ＆ドロップエリアのクリックでファイル選択ダイアログを開く
  dom.imageUpload.addEventListener('click', () => {
    dom.actualImageUpload.click();
  });

  // 実際のファイル入力の変更イベントを処理
  dom.actualImageUpload.addEventListener('change', (event) => {
    handleImageUpload(event, dom.animationContainer, dom.animationNameModal, dom.modalAnimationNameInput, renderAnimationFrames, extractSequenceNumber, extractBaseName);
    dom.actualImageUpload.value = ''; // ファイル選択後にinputをクリア
  });

  // ドラッグ＆ドロップイベントリスナーを追加
  dom.imageUpload.addEventListener('dragover', (event) => {
    event.preventDefault(); // デフォルトの動作をキャンセルしてドロップを許可
    dom.imageUpload.classList.add('border-blue-500', 'border-2'); // ドラッグオーバー時のスタイル
  });

  dom.imageUpload.addEventListener('dragleave', () => {
    dom.imageUpload.classList.remove('border-blue-500', 'border-2'); // ドラッグリーブ時のスタイルを元に戻す
  });

  dom.imageUpload.addEventListener('drop', (event) => {
    event.preventDefault(); // デフォルトの動作をキャンセル
    dom.imageUpload.classList.remove('border-blue-500', 'border-2'); // スタイルを元に戻す

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      // DataTransferItemListをFileListに変換してhandleImageUploadに渡す
      handleImageUpload({ target: { files: files } } as unknown as Event, dom.animationContainer, dom.animationNameModal, dom.modalAnimationNameInput, renderAnimationFrames, extractSequenceNumber, extractBaseName);
    }
  });

  dom.confirmSaveAnimationBtn.addEventListener('click', () => handleConfirmSaveAnimation(dom.modalAnimationNameInput, dom.animationNameModal, renderSavedAnimations));
  dom.cancelSaveAnimationBtn.addEventListener('click', () => handleCancelSaveAnimation(dom.modalAnimationNameInput, dom.modalAnimationNameInput));
  dom.animationNameModal.addEventListener('click', (event) => handleAnimationModalClick(event, dom.animationNameModal, dom.modalAnimationNameInput));
});
