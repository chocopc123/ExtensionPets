import React from 'react'; // React.RefObjectを使用するためにReactをインポート

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


export function renderAnimationFrames(frames: string[], container: HTMLDivElement): void {
  container.innerHTML = '';
  frames.forEach(frameSrc => {
    const img = document.createElement('img');
    img.src = frameSrc;
    img.className = 'w-[35px] h-[35px] object-cover mr-1.5';
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

export async function handleImageUpload(event: Event, animationNameModal: HTMLDivElement, modalAnimationNameInput: HTMLInputElement, renderFrames: (frames: string[], container: HTMLDivElement) => void, extractSeqNum: (filename: string) => number, extractBase: (filename: string) => string): Promise<void> {
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
    // renderFrames(filteredFrames, animationContainer); // アップロードタブではプレビュー不要のため削除
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
  target.value = '';
}

export function handleConfirmSaveAnimation(
  modalAnimationNameInput: HTMLInputElement,
  animationNameModal: HTMLDivElement,
  animationContainerRef: React.RefObject<HTMLDivElement>,
  onAnimationSaved: () => void
): void {
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

        // 保存成功後、currentActiveAnimationNameを設定し、アニメーションをロードしてレンダリング
        chrome.storage.local.set({ currentActiveAnimationName: animationName }, () => {
          chrome.runtime.sendMessage({ type: 'loadAnimation', animationName: animationName }, (loadResponse: { success: boolean }) => {
            if (loadResponse && loadResponse.success) {
              chrome.storage.local.get('savedAnimationSets', (result: { savedAnimationSets?: { [key: string]: AnimationSet } }) => {
                const sets = result.savedAnimationSets || {};
                if (animationContainerRef.current && sets[animationName]) {
                  renderAnimationFrames(sets[animationName].frames, animationContainerRef.current);
                }
                onAnimationSaved(); // アニメーション保存後にリストを更新するためのコールバックを呼び出す
              });
            } else {
              console.error(`アニメーション「${animationName}」のロードに失敗しました。`);
            }
          });
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
