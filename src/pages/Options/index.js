function extractSequenceNumber(filename) {
  const match = filename.match(/_(\d+)\.(png|jpg|jpeg)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

function estimateBase64SizeInBytes(base64Content) {
  if (!base64Content) return 0;
  const padding = (base64Content.match(/=/g) || []).length;
  return (base64Content.length * 0.75) - padding;
}

function startAnimation() {
  chrome.runtime.sendMessage({ type: 'startAnimationBackground' });
}

function stopAnimation() {
  chrome.runtime.sendMessage({ type: 'stopAnimationBackground' });
}

document.addEventListener('DOMContentLoaded', () => {
  const imageUpload = document.getElementById('imageUpload');
  const toggleAnimationBtn = document.getElementById('toggleAnimation');
  const animationIcon = document.getElementById('animationIcon');
  const animationContainer = document.getElementById('animation-container');
  const animationSpeedSlider = document.getElementById('animationSpeed');
  const currentSpeedSpan = document.getElementById('currentSpeed');
  const savedAnimationsList = document.getElementById('saved-animations-list');
  const animationNameModal = document.getElementById('animationNameModal');
  const modalAnimationNameInput = document.getElementById('modalAnimationNameInput');
  const cancelSaveAnimationBtn = document.getElementById('cancelSaveAnimationBtn');
  const confirmSaveAnimationBtn = document.getElementById('confirmSaveAnimationBtn');

  if (!imageUpload || !toggleAnimationBtn || !animationIcon || !animationContainer || !animationSpeedSlider || !currentSpeedSpan || !savedAnimationsList || !animationNameModal || !modalAnimationNameInput || !cancelSaveAnimationBtn || !confirmSaveAnimationBtn) {
    console.error("必要なDOM要素が見つかりませんでした。HTMLファイルを確認してください。");
    return;
  }

  let isAnimating = false;

  function renderSavedAnimations() {
    let totalAnimationBytes = 0;
    chrome.storage.local.get(['savedAnimationSets', 'currentActiveAnimationName'], (result) => {
      const savedSets = result.savedAnimationSets || {};
      const currentActiveAnimationName = result.currentActiveAnimationName || null;
      savedAnimationsList.innerHTML = '';

      if (Object.keys(savedSets).length === 0) {
        savedAnimationsList.innerHTML = '<p>保存されたアニメーションはありません。</p>';
        return;
      }

      for (const name in savedSets) {
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

        input.addEventListener('change', (event) => {
          if (event.target.checked) {
            chrome.runtime.sendMessage({ type: 'loadAnimation', animationName: name }, (response) => {
              if (response && response.success) {
                animationContainer.innerHTML = '';
                savedSets[name].frames.forEach(frameSrc => {
                  const img = document.createElement('img');
                  img.src = frameSrc;
                  img.className = 'w-[75px] h-[75px] object-cover mr-1.5';
                  animationContainer.appendChild(img);
                });
                chrome.runtime.sendMessage({ type: 'getAnimationStatus' }, (responseStatus) => {
                  if (responseStatus && typeof responseStatus.isAnimating !== 'undefined') {
                    isAnimating = responseStatus.isAnimating;
                    animationIcon.textContent = isAnimating ? '❚❚' : '▶';
                  }
                });
                animationSpeedSlider.value = savedSets[name].interval;
                currentSpeedSpan.textContent = `${savedSets[name].interval}ms`;
              } else {
                console.error(`アニメーション「${name}」のロードに失敗しました。`);
              }
            });
          }
        });

        const thumbnailImg = document.createElement('img');
        if (savedSets[name].frames && savedSets[name].frames.length > 0) {
          thumbnailImg.src = savedSets[name].frames[0];
        } else {
          thumbnailImg.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        }
        thumbnailImg.className = 'w-[35px] h-[35px] object-cover ml-1 mr-2.5 border border-gray-300';

        const animationNameSpan = document.createElement('span');
        animationNameSpan.textContent = name;
        animationNameSpan.className = 'mr-2.5 font-bold';

        let animationSize = 0;
        if (savedSets[name].frames) {
          for (const frameSrc of savedSets[name].frames) {
            const parts = frameSrc.split(',');
            if (parts.length > 1) {
              animationSize += estimateBase64SizeInBytes(parts[1]);
            }
          }
        }
        const animationSizeKB = (animationSize / 1024).toFixed(2);
        totalAnimationBytes += animationSize;

        animationGroupLabel.appendChild(input);
        animationGroupLabel.appendChild(thumbnailImg);
        animationGroupLabel.appendChild(animationNameSpan);

        const speedControlDiv = document.createElement('div');
        speedControlDiv.className = 'flex items-center w-1/2 flex-none gap-x-2.5 mr-5'
        
        const animationSpeedSlider = document.createElement('input');
        animationSpeedSlider.type = 'range';
        animationSpeedSlider.id = `speed-${name}`;
        animationSpeedSlider.min = '20';
        animationSpeedSlider.max = '300';
        animationSpeedSlider.step = '10';
        animationSpeedSlider.value = savedSets[name].interval;
        animationSpeedSlider.className = 'h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-lg w-full';
        speedControlDiv.appendChild(animationSpeedSlider);

        const currentSpeedSpan = document.createElement('span');
        currentSpeedSpan.id = `currentSpeed-${name}`;
        currentSpeedSpan.className = 'text-gray-700 font-medium';
        currentSpeedSpan.textContent = `${savedSets[name].interval}ms`;
        speedControlDiv.appendChild(currentSpeedSpan);

        animationSpeedSlider.addEventListener('input', (event) => {
          const newSpeed = event.target.value;
          currentSpeedSpan.textContent = `${newSpeed}ms`;
          chrome.runtime.sendMessage({ type: 'updateSavedAnimationInterval', animationName: name, interval: parseInt(newSpeed, 10) }, (response) => {
            if (response && response.success) {
            } else {
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
          if (confirm(`アニメーション「${name}」を本当に削除しますか？`)) {
            chrome.runtime.sendMessage({ type: 'deleteAnimation', animationName: name }, (response) => {
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
        savedAnimationsList.appendChild(div);
      }

      const totalAnimationKB = (totalAnimationBytes / 1024).toFixed(2);
      const totalUsageElement = document.getElementById('storage-usage');
      if (totalUsageElement) {
        totalUsageElement.textContent = `Approx. ${totalAnimationKB}KB`;
      }
    });
  }

  chrome.runtime.sendMessage({ type: 'getAnimationStatus' }, (response) => {
    if (response && typeof response.isAnimating !== 'undefined') {
      isAnimating = response.isAnimating;
      animationIcon.textContent = isAnimating ? '❚❚' : '▶';
    }
  });

  chrome.storage.local.get(['animationFrames', 'currentFrameIndex'], (result) => {
    if (result.animationFrames && result.animationFrames.length > 0) {
      const animationFramesFromStorage = result.animationFrames;
      animationContainer.innerHTML = '';
      animationFramesFromStorage.forEach(frameSrc => {
        const img = document.createElement('img');
        img.src = frameSrc;
        img.style.width = '75px';
        img.style.height = '75px';
        img.style.objectFit = 'cover';
        img.style.marginRight = '5px';
        animationContainer.appendChild(img);
      });
    }
  });

  chrome.storage.local.get(['animationInterval'], (result) => {
    const savedInterval = result.animationInterval !== undefined ? result.animationInterval : 100;
    animationSpeedSlider.value = savedInterval;
    currentSpeedSpan.textContent = `${savedInterval}ms`;
  });

  imageUpload.addEventListener('change', (event) => {
    function extractBaseName(filename) {
      const parts = filename.split('.');
      if (parts.length > 1) {
        const nameWithoutExt = parts.slice(0, -1).join('.');
        const match = nameWithoutExt.match(/^(.*?)_(\d+)$/);
        return match ? match[1] : nameWithoutExt;
      }
      return filename;
    }

    const files = Array.from(event.target.files);
    files.sort((a, b) => {
      const numA = extractSequenceNumber(a.name);
      const numB = extractSequenceNumber(b.name);
      return numA - numB;
    });

    const fileReadPromises = files.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve(e.target.result);
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(fileReadPromises).then(newAnimationFrames => {
      chrome.runtime.sendMessage({ type: 'updateFramesPreview', animationFrames: newAnimationFrames }, () => {
        animationContainer.innerHTML = '';
        newAnimationFrames.forEach(frameSrc => {
          const img = document.createElement('img');
          img.src = frameSrc;
          img.style.width = '75px';
          img.style.height = '75px';
          img.style.objectFit = 'cover';
          img.style.marginRight = '5px';
          animationContainer.appendChild(img);
        });
        const currentInterval = 100;
        animationSpeedSlider.value = currentInterval;
        currentSpeedSpan.textContent = `${currentInterval}ms`;
        chrome.storage.local.set({ animationInterval: currentInterval });

        animationNameModal.classList.remove('hidden');
        if (files.length > 0) {
          const firstFileName = files[0].name;
          const baseName = extractBaseName(firstFileName);
          modalAnimationNameInput.value = baseName;
        } else {
          modalAnimationNameInput.value = '';
        }
        modalAnimationNameInput.focus();
      });
      event.target.value = '';
    });
  });

  confirmSaveAnimationBtn.addEventListener('click', () => {
    const animationName = modalAnimationNameInput.value.trim();
    if (animationName) {
      chrome.storage.local.get(['currentPreviewFrames', 'animationInterval', 'savedAnimationSets'], (result) => {
        const framesToSave = result.currentPreviewFrames || [];
        const intervalToSave = result.animationInterval !== undefined ? result.animationInterval : 100;
        const existingSets = result.savedAnimationSets || {};

        if (framesToSave.length > 0) {
          if (existingSets[animationName]) {
            if (!confirm(`アニメーション「${animationName}」は既に存在します。上書きしますか？`)) {
              return;
            }
          }

          chrome.runtime.sendMessage({ type: 'saveAnimation', animationName: animationName, animationFrames: framesToSave, animationInterval: intervalToSave }, (response) => {
            if (response && response.success) {
              modalAnimationNameInput.value = '';
              animationNameModal.classList.add('hidden');
              renderSavedAnimations();

              chrome.runtime.sendMessage({ type: 'loadAnimation', animationName: animationName }, (loadResponse) => {
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
        } else {
          alert('保存するアニメーションフレームがありません。画像をアップロードしてください。');
        }
      });
    } else {
      alert('アニメーション名を入力してください。');
    }
  });

  cancelSaveAnimationBtn.addEventListener('click', () => {
    animationNameModal.classList.add('hidden');
    modalAnimationNameInput.value = '';
  });

  animationNameModal.addEventListener('click', (event) => {
    if (event.target === animationNameModal) {
      animationNameModal.classList.add('hidden');
      modalAnimationNameInput.value = '';
    }
  });

  toggleAnimationBtn.addEventListener('click', () => {
    if (isAnimating) {
      stopAnimation();
      animationIcon.textContent = '▶';
      isAnimating = false;
      chrome.runtime.sendMessage({ type: 'setAnimationStatus', isAnimating: false });
    } else {
      startAnimation();
      animationIcon.textContent = '❚❚';
      isAnimating = true;
      chrome.runtime.sendMessage({ type: 'setAnimationStatus', isAnimating: true });
    }
  });

  animationSpeedSlider.addEventListener('input', (event) => {
    const newSpeed = event.target.value;
    currentSpeedSpan.textContent = `${newSpeed}ms`;
    chrome.runtime.sendMessage({ type: 'updateAnimationInterval', interval: parseInt(newSpeed, 10) }, () => {
    });
    chrome.storage.local.set({ animationInterval: parseInt(newSpeed, 10) }, () => {
    });
  });

  renderSavedAnimations();
});
