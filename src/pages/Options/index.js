// 画像のファイル名から連番を抽出するヘルパー関数
function extractSequenceNumber(filename) {
  const match = filename.match(/_(\d+)\.(png|jpg|jpeg)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

// ベース64コンテンツのバイトサイズを概算する関数
function estimateBase64SizeInBytes(base64Content) {
  if (!base64Content) return 0;
  // ベース64エンコードされた文字列のバイトサイズを概算
  // 末尾のパディング(=)は2バイトとして数えない
  const padding = (base64Content.match(/=/g) || []).length;
  return (base64Content.length * 0.75) - padding;
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
  // 既存のオプションページ読み込みロジックなどがある場合はここに保持

  // ストレージ使用量の表示ロジックはrenderSavedAnimations内で処理されるため削除
  // chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
  //   const usageElement = document.getElementById('storage-usage');
  //   if (chrome.runtime.lastError) {
  //     usageElement.textContent = 'エラー: ' + chrome.runtime.lastError.message;
  //   } else {
  //     const kilobytes = (bytesInUse / 1024).toFixed(2);
  //     usageElement.textContent = `${kilobytes} KB`;
  //   }
  // });

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
    let totalAnimationBytes = 0; // アニメーションの合計バイト数
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
        // Change from 'flex items-center mb-2.5' to 'flex flex-col mb-2.5'
        div.className = 'flex flex-col mb-2.5 w-full'; // w-full を追加

        // Create a wrapper div for the label and delete button to keep them in a row
        const headerRowDiv = document.createElement('div');
        headerRowDiv.className = 'flex items-center w-full gap-x-2.5'; // Full width, flex row, gap-x-2.5 を追加

        // Create a label to wrap the radio button, thumbnail, and text
        const animationGroupLabel = document.createElement('label');
        animationGroupLabel.htmlFor = `anim-${name}`;
        animationGroupLabel.className = 'flex items-center cursor-pointer flex-shrink-0 mr-auto'; // mr-auto を追加

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
                  img.className = 'w-[75px] h-[75px] object-cover mr-1.5'; // Tailwind classes for preview images
                  animationContainer.appendChild(img);
                });
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

        const thumbnailImg = document.createElement('img');
        if (savedSets[name].frames && savedSets[name].frames.length > 0) {
          thumbnailImg.src = savedSets[name].frames[0]; // 最初のフレームをサムネイルとして使用
        } else {
          thumbnailImg.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; // 透明な1x1ピクセルGIF
        }
        thumbnailImg.className = 'w-[35px] h-[35px] object-cover ml-1 mr-2.5 border border-gray-300'; // Tailwind classes for thumbnail

        const animationNameSpan = document.createElement('span'); // Use a span for the text content
        animationNameSpan.textContent = name;
        animationNameSpan.className = 'mr-2.5 font-bold';

        // このアニメーションのサイズを計算
        let animationSize = 0;
        if (savedSets[name].frames) {
          for (const frameSrc of savedSets[name].frames) {
            const parts = frameSrc.split(',');
            if (parts.length > 1) {
              animationSize += estimateBase64SizeInBytes(parts[1]);
            }
          }
        }
        const animationSizeKB = (animationSize / 1024).toFixed(2); // 小数点以下2桁まで表示
        totalAnimationBytes += animationSize; // 合計に加算

        // Append elements to animationGroupLabel
        animationGroupLabel.appendChild(input);
        animationGroupLabel.appendChild(thumbnailImg);
        animationGroupLabel.appendChild(animationNameSpan);

        // 新しい速度コントロール用のdiv
        const speedControlDiv = document.createElement('div');
        speedControlDiv.className = 'flex items-center w-1/2 flex-none gap-x-2.5 mr-5' // mr-2.5 を削除, gap-x-2.5 を追加
        
        const animationSpeedSlider = document.createElement('input');
        animationSpeedSlider.type = 'range';
        animationSpeedSlider.id = `speed-${name}`;
        animationSpeedSlider.min = '20';
        animationSpeedSlider.max = '300';
        animationSpeedSlider.step = '10';
        animationSpeedSlider.value = savedSets[name].interval; // 保存された速度を初期値として設定
        animationSpeedSlider.className = 'h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-lg w-full'; // w-full を維持
        speedControlDiv.appendChild(animationSpeedSlider);

        const currentSpeedSpan = document.createElement('span');
        currentSpeedSpan.id = `currentSpeed-${name}`;
        currentSpeedSpan.className = 'text-gray-700 font-medium'; // ml-2 を削除
        currentSpeedSpan.textContent = `${savedSets[name].interval}ms`;
        speedControlDiv.appendChild(currentSpeedSpan);

        animationSpeedSlider.addEventListener('input', (event) => {
          const newSpeed = event.target.value;
          currentSpeedSpan.textContent = `${newSpeed}ms`;
          // バックグラウンドスクリプトに、このアニメーションの新しい速度を送信
          chrome.runtime.sendMessage({ type: 'updateSavedAnimationInterval', animationName: name, interval: parseInt(newSpeed, 10) }, (response) => {
            if (response && response.success) {
              console.log(`アニメーション「${name}」の速度を${newSpeed}msに更新しました。`);
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

        // Append elements to headerRowDiv in desired order
        headerRowDiv.appendChild(animationGroupLabel);
        headerRowDiv.appendChild(speedControlDiv); // 速度コントロールをここに移動
        headerRowDiv.appendChild(sizeSpan); // サイズ表示をここに移動
        headerRowDiv.appendChild(deleteBtn);

        // Append headerRowDiv to the main div
        div.appendChild(headerRowDiv);
        savedAnimationsList.appendChild(div);
      }

      // 全体のストレージ使用量表示をアニメーションの合計容量に更新
      const totalAnimationKB = (totalAnimationBytes / 1024).toFixed(2); // 小数点以下2桁まで表示
      const totalUsageElement = document.getElementById('storage-usage');
      if (totalUsageElement) {
        totalUsageElement.textContent = `Approx. ${totalAnimationKB}KB`;
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
        img.style.width = '75px'; // 画像サイズを大きく
        img.style.height = '75px'; // 画像サイズを大きく
        img.style.objectFit = 'cover'; // アスペクト比を保ちつつ表示
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
          img.style.width = '75px'; // 画像サイズを大きく
          img.style.height = '75px'; // 画像サイズを大きく
          img.style.objectFit = 'cover'; // アスペクト比を保ちつつ表示
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
      chrome.storage.local.get(['currentPreviewFrames', 'animationInterval', 'savedAnimationSets'], (result) => {
        const framesToSave = result.currentPreviewFrames || [];
        const intervalToSave = result.animationInterval || 200;
        const existingSets = result.savedAnimationSets || {};

        if (framesToSave.length > 0) {
          if (existingSets[animationName]) {
            // 同一名のアニメーションが既に存在する場合、確認ポップアップを表示
            // eslint-disable-next-line no-restricted-globals
            if (!confirm(`アニメーション「${animationName}」は既に存在します。上書きしますか？`)) {
              console.log('アニメーションの保存がキャンセルされました。');
              return; // ユーザーがキャンセルした場合、処理を中断
            }
          }

          chrome.runtime.sendMessage({ type: 'saveAnimation', animationName: animationName, animationFrames: framesToSave, animationInterval: intervalToSave }, (response) => {
            if (response && response.success) {
              console.log(`アニメーション「${animationName}」を保存しました。`);
              animationNameInput.value = ''; // 入力フィールドをクリア
              renderSavedAnimations(); // 保存されたリストを再レンダリング

              // 保存後、上書きされたアニメーションを再度ロードして表示を更新
              chrome.runtime.sendMessage({ type: 'loadAnimation', animationName: animationName }, (loadResponse) => {
                if (loadResponse && loadResponse.success) {
                  console.log(`アニメーション「${animationName}」を再ロードし、表示を更新しました。`);
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
      // chrome.runtime.sendMessage({ type: 'updateCurrentAnimationInterval', interval: parseInt(newSpeed, 10) }); // この行を削除またはコメントアウト
    });
  });

  // ページロード時に保存されたアニメーションをロードして表示
  renderSavedAnimations();
});
