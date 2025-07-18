import {
  extractSequenceNumber,
  estimateBase64SizeInBytes,
  AnimationSet,
  DOMCache,
  getDOMReferences,
  renderAnimationFrames,
  loadCurrentAnimationState,
  extractBaseName,
  handleImageUpload,
  handleConfirmSaveAnimation,
  handleCancelSaveAnimation,
  handleAnimationModalClick,
  createAnimationListItem,
  renderSavedAnimations
} from '../../utils/animationUtils';

let dom: DOMCache;

document.addEventListener('DOMContentLoaded', () => {
  const references = getDOMReferences();
  if (!references) {
    return;
  }
  dom = references;

  loadCurrentAnimationState(dom.animationContainer);
  renderSavedAnimations(dom);


  dom.actualImageUpload.addEventListener('change', (event) => {
    handleImageUpload(event, dom.animationContainer, dom.animationNameModal, dom.modalAnimationNameInput, renderAnimationFrames, extractSequenceNumber, extractBaseName);
  });

  dom.imageUpload.addEventListener('dragover', (event) => {
    event.preventDefault();
    dom.imageUpload.classList.add('border-blue-500', 'border-2');
  });

  dom.imageUpload.addEventListener('dragleave', () => {
    dom.imageUpload.classList.remove('border-blue-500', 'border-2');
  });

  dom.imageUpload.addEventListener('drop', (event) => {
    event.preventDefault();
    dom.imageUpload.classList.remove('border-blue-500', 'border-2');

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      handleImageUpload({ target: { files: files } } as unknown as Event, dom.animationContainer, dom.animationNameModal, dom.modalAnimationNameInput, renderAnimationFrames, extractSequenceNumber, extractBaseName);
    }
  });

  dom.confirmSaveAnimationBtn.addEventListener('click', () => handleConfirmSaveAnimation(dom.modalAnimationNameInput, dom.animationNameModal, () => renderSavedAnimations(dom)));
  dom.cancelSaveAnimationBtn.addEventListener('click', () => handleCancelSaveAnimation(dom.modalAnimationNameInput, dom.modalAnimationNameInput));
  dom.animationNameModal.addEventListener('click', (event) => handleAnimationModalClick(event, dom.animationNameModal, dom.modalAnimationNameInput));
});
