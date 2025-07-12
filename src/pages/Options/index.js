// 画像のファイル名から連番を抽出するヘルパー関数
function extractSequenceNumber(filename) {
  const match = filename.match(/_(\d+)\.(png|jpg|jpeg)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

// アニメーション開始関数
function startAnimation() {
  chrome.runtime.sendMessage({ type: 'startAnimationBackground' });
  console.log('アニメーション開始メッセージをバックグラウンドに送信しました。');
}

// アニメーション停止関数
function stopAnimation() {
  chrome.runtime.sendMessage({ type: 'stopAnimationBackground' });
  console.log('アニメーション停止メッセージをバックグラウンドに送信しました。');
}

document.addEventListener('DOMContentLoaded', () => {
  // chromeオブジェクトの定義状況を確認
  console.log('Options script loaded.');
  if (typeof chrome !== 'undefined') {
    console.log('chrome object is defined.');
    if (typeof chrome.storage !== 'undefined') {
      console.log('chrome.storage is defined.');
      if (typeof chrome.storage.local !== 'undefined') {
        console.log('chrome.storage.local is defined.');
      } else {
        console.error('chrome.storage.local is undefined!');
      }
    } else {
      console.error('chrome.storage is undefined!');
    }
  } else {
    console.error('chrome object is undefined!');
  }

  const imageUpload = document.getElementById('imageUpload');
  const toggleAnimationBtn = document.getElementById('toggleAnimation');
  const animationIcon = document.getElementById('animationIcon');
  const animationContainer = document.getElementById('animation-container');
  const animationSpeedSlider = document.getElementById('animationSpeed');
  const currentSpeedSpan = document.getElementById('currentSpeed');
  const animationNameInput = document.getElementById('animationNameInput');
  const saveAnimationBtn = document.getElementById('saveAnimationBtn');
  const savedAnimationsList = document.getElementById('saved-animations-list');

  if (!imageUpload || !toggleAnimationBtn || !animationIcon || !animationContainer || !animationSpeedSlider || !currentSpeedSpan || !animationNameInput || !saveAnimationBtn || !savedAnimationsList) {
    console.error("必要なDOM要素が見つかりませんでした。HTMLファイルを確認してください。");
    return;
  }

  let isAnimating = false; // アニメーションの状態を追跡

  // 保存されたアニメーションをレンダリングする関数
  function renderSavedAnimations() {
    chrome.storage.local.get(['savedAnimationSets', 'currentActiveAnimationName'], (result) => {
      const savedSets = result.savedAnimationSets || {};
      const currentActiveAnimationName = result.currentActiveAnimationName || null;
      savedAnimationsList.innerHTML = ''; // リストをクリア

      if (Object.keys(savedSets).length === 0) {
        savedAnimationsList.innerHTML = '<p>保存されたアニメーションはありません。</p>';
        return;
      }

      for (const name in savedSets) {
        const div = document.createElement('div');
        div.style.display = 'flex'; // Flexboxを使って要素を横並びにする
        div.style.alignItems = 'center'; // 垂直方向の中央揃え
        div.style.marginBottom = '10px'; // 下部に余白を追加

        // サムネイル画像を作成
        const thumbnailImg = document.createElement('img');
        if (savedSets[name].frames && savedSets[name].frames.length > 0) {
          thumbnailImg.src = savedSets[name].frames[0]; // 最初のフレームをサムネイルとして使用
        } else {
          thumbnailImg.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; // 透明な1x1ピクセルGIF
        }
        thumbnailImg.style.width = '50px'; // サムネイルの幅
        thumbnailImg.style.height = '50px'; // サムネイルの高さ
        thumbnailImg.style.objectFit = 'cover'; // 画像がコンテナに収まるようにトリミング
        thumbnailImg.style.marginRight = '10px'; // 画像とテキストの間に余白
        thumbnailImg.style.border = '1px solid #ddd'; // 枠線を追加

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'savedAnimation';
        input.value = name;
        input.id = `anim-${name}`;
        input.checked = (name === currentActiveAnimationName);

        input.addEventListener('change', (event) => {
          if (event.target.checked) {
            // 選択されたアニメーションをロードしてアクティブにする
            chrome.runtime.sendMessage({ type: 'loadAnimation', animationName: name }, (response) => {
              if (response && response.success) {
                console.log(`アニメーション「${name}」をロードしました。`);
                // 現在のプレビューを更新
                animationContainer.innerHTML = '';
                savedSets[name].frames.forEach(frameSrc => {
                  const img = document.createElement('img');
                  img.src = frameSrc;
                  img.style.maxWidth = '100%';
                  img.style.maxHeight = '100%';
                  img.style.marginRight = '5px';
                  animationContainer.appendChild(img);
                });
                // 速度スライダーを更新
                animationSpeedSlider.value = savedSets[name].interval;
                currentSpeedSpan.textContent = `${savedSets[name].interval}ms`;
                // アニメーション状態も更新
                chrome.runtime.sendMessage({ type: 'getAnimationStatus' }, (responseStatus) => {
                  if (responseStatus && typeof responseStatus.isAnimating !== 'undefined') {
                    isAnimating = responseStatus.isAnimating;
                    animationIcon.textContent = isAnimating ? '❚❚' : '▶';
                  }
                });
              } else {
                console.error(`アニメーション「${name}」のロードに失敗しました。`);
              }
            });
          }
        });

        const label = document.createElement('label');
        label.htmlFor = `anim-${name}`;
        label.textContent = name;

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '削除';
        deleteBtn.style.marginLeft = '10px';
        deleteBtn.addEventListener('click', () => {
          // eslint-disable-next-line no-restricted-globals
          if (confirm(`アニメーション「${name}」を本当に削除しますか？`)) {
            chrome.runtime.sendMessage({ type: 'deleteAnimation', animationName: name }, (response) => {
              if (response && response.success) {
                console.log(`アニメーション「${name}」を削除しました。`);
                renderSavedAnimations(); // リストを再レンダリング
              } else {
                console.error(`アニメーション「${name}」の削除に失敗しました。`);
              }
            });
          }
        });

        div.appendChild(input);
        div.appendChild(thumbnailImg); // サムネイル画像を追加
        div.appendChild(label);
        div.appendChild(deleteBtn);
        savedAnimationsList.appendChild(div);
      }
    });
  }

  // バックグラウンドスクリプトから現在のアニメーション状態を取得し、ボタンを初期化
  chrome.runtime.sendMessage({ type: 'getAnimationStatus' }, (response) => {
    if (response && typeof response.isAnimating !== 'undefined') {
      isAnimating = response.isAnimating;
      animationIcon.textContent = isAnimating ? '❚❚' : '▶';
    }
  });

  // UI表示用にchrome.storageから保存されたアニメーションフレームと現在のフレームインデックスをロード
  chrome.storage.local.get(['animationFrames', 'currentFrameIndex'], (result) => {
    if (result.animationFrames && result.animationFrames.length > 0) {
      const animationFramesFromStorage = result.animationFrames;
      // animationContainerをクリアして、すべてのフレームを表示
      animationContainer.innerHTML = '';
      animationFramesFromStorage.forEach(frameSrc => {
        const img = document.createElement('img');
        img.src = frameSrc;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.marginRight = '5px'; // 必要に応じてマージンを追加
        animationContainer.appendChild(img);
      });
    }
  });

  // アニメーション速度の設定をロード
  chrome.storage.local.get(['animationInterval'], (result) => {
    const savedInterval = result.animationInterval || 200; // デフォルト値は200ms
    animationSpeedSlider.value = savedInterval;
    currentSpeedSpan.textContent = `${savedInterval}ms`;
  });

  // ファイルアップロードの処理
  imageUpload.addEventListener('change', (event) => {
    const files = Array.from(event.target.files);
    // ファイルを連番でソート
    files.sort((a, b) => {
      const numA = extractSequenceNumber(a.name);
      const numB = extractSequenceNumber(b.name);
      return numA - numB; // 昇順にソート
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
      // 全ての画像が読み込まれたら、バックグラウンドスクリプトにフレームデータを送信
      // ここでは直接アニメーションを更新せず、一時的な「現在のプレビュー」として扱う
      chrome.runtime.sendMessage({ type: 'updateFramesPreview', animationFrames: newAnimationFrames }, () => {
        console.log('アニメーションフレームをバックグラウンドに送信しました。(プレビュー用)');
        // オプションページのUIにすべてのフレームを表示
        animationContainer.innerHTML = ''; // 古い画像をクリア
        newAnimationFrames.forEach(frameSrc => {
          const img = document.createElement('img');
          img.src = frameSrc;
          img.style.maxWidth = '100%';
          img.style.maxHeight = '100%';
          img.style.marginRight = '5px'; // 必要に応じてマージンを追加
          animationContainer.appendChild(img);
        });
        // アニメーション速度スライダーの値を現在の値に設定
        chrome.storage.local.get(['animationInterval'], (result) => {
          const currentInterval = result.animationInterval || 200;
          animationSpeedSlider.value = currentInterval;
          currentSpeedSpan.textContent = `${currentInterval}ms`;
        });
      });
    });
  });

  // 現在のアニメーションを保存するイベントリスナー
  saveAnimationBtn.addEventListener('click', () => {
    const animationName = animationNameInput.value.trim();
    if (animationName) {
      // 現在のプレビューフレームと速度を取得して保存
      chrome.storage.local.get(['currentPreviewFrames', 'animationInterval'], (result) => {
        const framesToSave = result.currentPreviewFrames || [];
        const intervalToSave = result.animationInterval || 200;

        if (framesToSave.length > 0) {
          chrome.runtime.sendMessage({ type: 'saveAnimation', animationName: animationName, animationFrames: framesToSave, animationInterval: intervalToSave }, (response) => {
            if (response && response.success) {
              console.log(`アニメーション「${animationName}」を保存しました。`);
              animationNameInput.value = ''; // 入力フィールドをクリア
              renderSavedAnimations(); // 保存されたリストを再レンダリング
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

  // トグルボタンクリックイベントリスナー
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

  // アニメーション速度スライダーのイベントリスナー
  animationSpeedSlider.addEventListener('input', (event) => {
    const newSpeed = event.target.value;
    currentSpeedSpan.textContent = `${newSpeed}ms`;
    // バックグラウンドスクリプトに新しい速度を送信
    chrome.runtime.sendMessage({ type: 'updateAnimationInterval', interval: parseInt(newSpeed, 10) }, () => {
      console.log(`アニメーション速度をバックグラウンドに送信しました: ${newSpeed}ms`);
    });
    // ストレージに速度を保存
    chrome.storage.local.set({ animationInterval: parseInt(newSpeed, 10) }, () => {
      console.log(`アニメーション速度をストレージに保存しました: ${newSpeed}ms`);
      // 現在アクティブなアニメーションの速度も更新（もしあれば）
      chrome.runtime.sendMessage({ type: 'updateCurrentAnimationInterval', interval: parseInt(newSpeed, 10) });
    });
  });

  // ページロード時に保存されたアニメーションをロードして表示
  renderSavedAnimations();
});