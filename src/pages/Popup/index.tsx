import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import {
  extractSequenceNumber,
  estimateBase64SizeInBytes,
  AnimationSet,
  renderAnimationFrames,
  extractBaseName,
  handleImageUpload,
  handleConfirmSaveAnimation,
  handleCancelSaveAnimation,
  handleAnimationModalClick
} from '../../utils/animationUtils';

// AnimationListItemコンポーネントを定義
interface AnimationListItemProps {
  name: string;
  animationSet: AnimationSet;
  currentActiveAnimationName: string | null;
  animationContainerRef: React.RefObject<HTMLDivElement>;
  onAnimationChange: () => void; // アニメーションが変更されたときに親に通知するコールバック
}

const AnimationListItem: React.FC<AnimationListItemProps> = ({
  name,
  animationSet,
  currentActiveAnimationName,
  animationContainerRef,
  onAnimationChange
}) => {
  const animationSpeedSliderRef = useRef<HTMLInputElement>(null);
  const currentSpeedSpanRef = useRef<HTMLSpanElement>(null);

  const handleRadioChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      chrome.runtime.sendMessage({ type: 'loadAnimation', animationName: name }, (response: { success: boolean }) => {
        if (response && response.success) {
          if (animationContainerRef.current) {
            renderAnimationFrames(animationSet.frames, animationContainerRef.current);
          }
          onAnimationChange(); // 親コンポーネントにアニメーションが変更されたことを通知
        } else {
          console.error(`アニメーション「${name}」のロードに失敗しました。`);
        }
      });
    }
  };

  const handleSpeedChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newSpeed = event.target.value;
    if (currentSpeedSpanRef.current) {
      currentSpeedSpanRef.current.textContent = `${newSpeed}ms`;
    }
    chrome.runtime.sendMessage({ type: 'updateSavedAnimationInterval', animationName: name, interval: parseInt(newSpeed, 10) }, (response: { success: boolean }) => {
      if (!response || !response.success) {
        console.error(`アニメーション「${name}」の速度更新に失敗しました。`);
      }
    });
  };

  const handleDelete = () => {
    // eslint-disable-next-line no-restricted-globals
    if (confirm(`アニメーション「${name}」を本当に削除しますか？`)) {
      chrome.runtime.sendMessage({ type: 'deleteAnimation', animationName: name }, (response: { success: boolean }) => {
        if (response && response.success) {
          onAnimationChange(); // 親コンポーネントにアニメーションが変更されたことを通知
        } else {
          console.error(`アニメーション「${name}」の削除に失敗しました。`);
        }
      });
    }
  };

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

  return (
    <div className="flex flex-col p-3 mb-3 bg-white rounded-lg shadow-sm border border-indigo-100 transition-all duration-200 hover:shadow-md hover:border-indigo-200">
      <div className="flex items-center justify-between w-full">
        <label htmlFor={`anim-${name}`} className="flex items-center cursor-pointer flex-grow text-indigo-800">
          <input
            type="radio"
            name="savedAnimation"
            value={name}
            id={`anim-${name}`}
            checked={name === currentActiveAnimationName}
            onChange={handleRadioChange}
            className="form-radio h-4 w-4 text-indigo-600 transition duration-150 ease-in-out"
          />
          <img
            src={animationSet.frames && animationSet.frames.length > 0 ? animationSet.frames[0] : 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='}
            className="w-8 h-8 object-cover ml-1 mr-3 rounded-md border border-gray-200 shadow-sm"
            alt="thumbnail"
          />
          <span className="text-base font-semibold text-indigo-700 truncate">{name}</span>
        </label>

        <div className="flex items-center flex-shrink-0 ml-4">
          <input
            type="range"
            ref={animationSpeedSliderRef}
            min="20"
            max="300"
            step="10"
            value={animationSet.interval.toString()}
            onChange={handleSpeedChange}
            className="w-24 h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer mr-2"
          />
          <span ref={currentSpeedSpanRef} className="text-sm font-medium text-indigo-600 w-12 text-right">
            {`${animationSet.interval}ms`}
          </span>
        </div>

        <span className="text-gray-500 text-xs ml-4">約 {animationSizeKB}KB</span>

        <button
          onClick={handleDelete}
          className="ml-4 px-3 py-1 bg-red-500 text-white text-sm font-semibold rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 transition-colors duration-200"
        >
          削除
        </button>
      </div>
    </div>
  );
};


const UploadPage: React.FC = () => {
  const imageUploadRef = useRef<HTMLLabelElement>(null); // label要素なのでHTMLLabelElement
  const actualImageUploadRef = useRef<HTMLInputElement>(null);
  const animationNameModalRef = useRef<HTMLDivElement>(null);
  const modalAnimationNameInputRef = useRef<HTMLInputElement>(null);
  const confirmSaveAnimationBtnRef = useRef<HTMLButtonElement>(null);
  const cancelSaveAnimationBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const imageUpload = imageUploadRef.current;
    const actualImageUpload = actualImageUploadRef.current;
    const animationNameModal = animationNameModalRef.current;
    const modalAnimationNameInput = modalAnimationNameInputRef.current;
    const confirmSaveAnimationBtn = confirmSaveAnimationBtnRef.current;
    const cancelSaveAnimationBtn = cancelSaveAnimationBtnRef.current;

    if (!imageUpload || !actualImageUpload || !animationNameModal || !modalAnimationNameInput || !confirmSaveAnimationBtn || !cancelSaveAnimationBtn) {
      console.error("UploadPage: 必要なDOM要素のRefが見つかりませんでした。");
      return;
    }

    // イベントリスナーの設定
    const handleUploadChange = (event: Event) => {
      handleImageUpload(event, animationNameModal, modalAnimationNameInput, renderAnimationFrames, extractSequenceNumber, extractBaseName);
    };
    actualImageUpload.addEventListener('change', handleUploadChange);

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      imageUpload.classList.add('border-blue-500', 'border-2');
    };
    imageUpload.addEventListener('dragover', handleDragOver);

    const handleDragLeave = () => {
      imageUpload.classList.remove('border-blue-500', 'border-2');
    };
    imageUpload.addEventListener('dragleave', handleDragLeave);

    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      imageUpload.classList.remove('border-blue-500', 'border-2');

      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        handleImageUpload({ target: { files: files } } as unknown as Event, animationNameModal, modalAnimationNameInput, renderAnimationFrames, extractSequenceNumber, extractBaseName);
      }
    };
    imageUpload.addEventListener('drop', handleDrop);

    const handleConfirm = () => handleConfirmSaveAnimation(modalAnimationNameInput, animationNameModal);
    confirmSaveAnimationBtn.addEventListener('click', handleConfirm);

    const handleCancel = () => handleCancelSaveAnimation(modalAnimationNameInput, animationNameModal);
    cancelSaveAnimationBtn.addEventListener('click', handleCancel);

    const handleModalClick = (event: MouseEvent) => handleAnimationModalClick(event, animationNameModal, modalAnimationNameInput);
    animationNameModal.addEventListener('click', handleModalClick);

    // クリーンアップ関数
    return () => {
      actualImageUpload.removeEventListener('change', handleUploadChange);
      imageUpload.removeEventListener('dragover', handleDragOver);
      imageUpload.removeEventListener('dragleave', handleDragLeave);
      imageUpload.removeEventListener('drop', handleDrop);
      confirmSaveAnimationBtn.removeEventListener('click', handleConfirm);
      cancelSaveAnimationBtn.removeEventListener('click', handleCancel);
      animationNameModal.removeEventListener('click', handleModalClick);
    };
  }, []); // 空の依存配列でマウント時に一度だけ実行

  return (
    <div className="upload-page">
      <h1 className="text-2xl font-extrabold mb-5 text-center text-indigo-700">アップロード</h1>
      <p className="mb-5 text-center text-gray-600 text-sm">アニメーションに使用するPNGまたはJPG画像をアップロードしてください。<br />ファイル名は連番（例: image_0001.png, image_0002.png）である必要があります。</p>

      <div className="mb-6">
        <label htmlFor="actualImageUpload" ref={imageUploadRef} className="flex flex-col items-center justify-center w-full h-65 border-2 border-dashed border-indigo-300 rounded-lg cursor-pointer bg-indigo-50 hover:bg-indigo-100 transition-colors duration-300 ease-in-out">
          <svg className="w-10 h-10 text-indigo-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.9 6L16 6a3 3 0 013 3v10a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2z"></path></svg>
          <p className="mb-1 text-sm text-indigo-600"><span className="font-bold">クリック</span> または <span className="font-bold">ドラッグアンドドロップ</span> してアップロード</p>
          <p className="text-xs text-indigo-500">PNG, JPG, JPEG</p>
          <input type="file" id="actualImageUpload" ref={actualImageUploadRef} multiple accept=".png,.jpg,.jpeg" className="hidden" />
        </label>
      </div>

      <div id="animationNameModal" ref={animationNameModalRef} className="fixed inset-0 bg-gray-800/60 flex items-center justify-center hidden p-4">
        <div className="bg-white p-7 rounded-xl shadow-2xl w-full max-w-sm transform transition-all duration-300 scale-95">
          <h3 className="text-xl font-bold mb-4 text-indigo-700 text-center">アニメーション名を保存</h3>
          <p className="mb-5 text-gray-600 text-sm text-center">このアニメーションに名前を付けて保存してください。</p>
          <input type="text" id="modalAnimationNameInput" ref={modalAnimationNameInputRef} placeholder="アニメーション名を入力" className="w-full p-3 border border-indigo-300 rounded-lg mb-5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-700" />
          <div className="flex justify-end space-x-3">
            <button id="cancelSaveAnimationBtn" ref={cancelSaveAnimationBtnRef} className="px-5 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors duration-200">キャンセル</button>
            <button id="confirmSaveAnimationBtn" ref={confirmSaveAnimationBtnRef} className="px-5 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200">保存</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AnimationListPage: React.FC = () => {
  const savedAnimationsListRef = useRef<HTMLDivElement>(null);
  const animationContainerRef = useRef<HTMLDivElement>(null); // AnimationListItemに渡すため
  const totalUsageElementRef = useRef<HTMLParagraphElement>(null); // pタグのRefに変更

  const [savedAnimationSets, setSavedAnimationSets] = useState<{ [key: string]: AnimationSet }>({});
  const [currentActiveAnimationName, setCurrentActiveAnimationName] = useState<string | null>(null);

  const fetchAnimations = () => {
    chrome.storage.local.get(['savedAnimationSets', 'currentActiveAnimationName'], (result: {
      savedAnimationSets?: { [key: string]: AnimationSet };
      currentActiveAnimationName?: string;
    }) => {
      const sets = result.savedAnimationSets || {};
      const activeName = result.currentActiveAnimationName || null;
      setSavedAnimationSets(sets);
      setCurrentActiveAnimationName(activeName);

      // 総使用量の計算と表示
      let totalAnimationBytes: number = 0;
      for (const name in sets) {
        const animationSet = sets[name];
        if (animationSet.frames) {
          for (const frameSrc of animationSet.frames) {
            const parts = frameSrc.split(',');
            if (parts.length > 1) {
              totalAnimationBytes += estimateBase64SizeInBytes(parts[1]);
            }
          }
        }
      }
      const totalAnimationKB = (totalAnimationBytes / 1024).toFixed(2);
      if (totalUsageElementRef.current) {
        totalUsageElementRef.current.textContent = `約 ${totalAnimationKB}KB`;
      }

      // アクティブなアニメーションが設定されていない場合、最初のものをロード
      if (!activeName && Object.keys(sets).length > 0) {
        const firstAnimationName = Object.keys(sets).sort()[0];
        chrome.runtime.sendMessage({ type: 'loadAnimation', animationName: firstAnimationName }, (loadResponse: { success: boolean }) => {
          if (loadResponse && loadResponse.success) {
            chrome.storage.local.set({ currentActiveAnimationName: firstAnimationName }, () => {
              setCurrentActiveAnimationName(firstAnimationName);
              if (animationContainerRef.current && sets[firstAnimationName]) {
                renderAnimationFrames(sets[firstAnimationName].frames, animationContainerRef.current);
              }
            });
          } else {
            console.error(`アニメーション「${firstAnimationName}」のロードに失敗しました。`);
          }
        });
      } else if (activeName && sets[activeName] && animationContainerRef.current) {
        // 現在アクティブなアニメーションをレンダリング
        renderAnimationFrames(sets[activeName].frames, animationContainerRef.current);
      } else if (!activeName && Object.keys(sets).length === 0 && animationContainerRef.current) {
        // アニメーションがない場合、コンテナをクリア
        renderAnimationFrames([], animationContainerRef.current);
      }
    });
  };

  useEffect(() => {
    fetchAnimations(); // コンポーネントマウント時にアニメーションをフェッチ

    // アニメーションが変更されたときに再フェッチするためのリスナー
    const onStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      // areaName はここでは使用しない
      if (changes.savedAnimationSets || changes.currentActiveAnimationName) {
        fetchAnimations();
      }
    };
    chrome.storage.local.onChanged.addListener(onStorageChange);

    return () => {
      chrome.storage.local.onChanged.removeListener(onStorageChange);
    };
  }, []);

  return (
    <div className="animation-list-page">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-indigo-700">アニメーション一覧</h2>
        <p id="storage-usage" ref={totalUsageElementRef} className="text-gray-600 text-sm font-semibold">読み込み中...</p>
      </div>
      <div id="animation-container" ref={animationContainerRef} className="border border-indigo-300 rounded-lg p-2 mb-4 flex overflow-x-auto whitespace-nowrap min-h-[70px] max-h-[70px] items-start bg-white shadow-inner">
        {/* Animation frames will be rendered here */}
      </div>
      <div id="saved-animations-list" ref={savedAnimationsListRef} className="space-y-3">
        {Object.keys(savedAnimationSets).length === 0 ? (
          <p className="text-gray-500 text-sm">保存されたアニメーションはありません。</p>
        ) : (
          Object.keys(savedAnimationSets).sort().map(name => (
            <AnimationListItem
              key={name}
              name={name}
              animationSet={savedAnimationSets[name]}
              currentActiveAnimationName={currentActiveAnimationName}
              animationContainerRef={animationContainerRef}
              onAnimationChange={fetchAnimations} // アニメーション変更時に親のfetchAnimationsを呼び出す
            />
          ))
        )}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<'upload' | 'list'>('list'); // 初期選択を'list'に変更

  useEffect(() => {
    // 初期ロード時に現在のDOMの状態をロード
    // loadCurrentAnimationState(references.animationContainer); // Refに移行したため不要
  }, []);

  return (
    <div className="w-full max-w-[600px] mx-auto p-4 pb-8"> {/* ナビゲーションの高さ分だけ下部にパディングを追加 */}
      <div className="bg-white p-6 rounded-xl shadow-lg transform transition-all duration-300 hover:scale-[1.01]">
        {currentPage === 'upload' ? <UploadPage /> : <AnimationListPage />}
      </div>
      <Navigation currentPage={currentPage} setCurrentPage={setCurrentPage} />
    </div>
  );
};

const Navigation: React.FC<{ currentPage: 'upload' | 'list'; setCurrentPage: (page: 'upload' | 'list') => void }> = ({ currentPage, setCurrentPage }) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 bg-indigo-50 border-t border-indigo-200 flex justify-around shadow-xl">
      <button
        className={`flex flex-col items-center justify-center flex-grow py-2 text-indigo-800 relative transition-colors duration-200 ${currentPage === 'list' ? 'text-indigo-600' : 'hover:text-indigo-500'}`}
        onClick={() => setCurrentPage('list')}
      >
        <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
        <span className="text-xs font-medium">アニメーション一覧</span>
        {currentPage === 'list' && <span className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600"></span>}
      </button>
      <button
        className={`flex flex-col items-center justify-center flex-grow py-2 text-indigo-800 relative transition-colors duration-200 ${currentPage === 'upload' ? 'text-indigo-600' : 'hover:text-indigo-500'}`}
        onClick={() => setCurrentPage('upload')}
      >
        <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
        <span className="text-xs font-medium">アップロード</span>
        {currentPage === 'upload' && <span className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600"></span>}
      </button>
    </nav>
  );
};

const container = document.getElementById('app');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(<App />);
}
