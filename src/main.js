import './style.css';

const fileInput = document.querySelector('#file-input');
const dropzone = document.querySelector('#dropzone');
const preview = document.querySelector('#preview');
const imagePreview = document.querySelector('#image-preview');
const videoPreview = document.querySelector('#video-preview');
const overlay = document.querySelector('#overlay');
const stage = document.querySelector('#preview-stage');
const zoomOutButton = document.querySelector('#zoom-out');
const zoomResetButton = document.querySelector('#zoom-reset');
const zoomInButton = document.querySelector('#zoom-in');
const inferenceCanvas = document.createElement('canvas');
const inferenceContext = inferenceCanvas.getContext('2d', { willReadFrequently: true });
const analyzeButton = document.querySelector('#analyze-button');
const analyzeLabel = document.querySelector('#analyze-label');
const removeFileButton = document.querySelector('#remove-file');
const confidenceInput = document.querySelector('#confidence-input');
const confidenceValue = document.querySelector('#confidence-value');
const progressRow = document.querySelector('#progress-row');
const progressLabel = document.querySelector('#progress-label');
const progressValue = document.querySelector('#progress-value');
const progressBar = document.querySelector('#progress-bar');
const errorMessage = document.querySelector('#error-message');
const results = document.querySelector('#results');
const resultsContent = document.querySelector('#results-content');
const resultsMeta = document.querySelector('#results-meta');
const videoSetting = document.querySelector('#video-setting');
const mediaDimensions = document.querySelector('#media-dimensions');

let selectedFile = null;
let fileUrl = null;
let detectorPromise = null;
let isAnalyzing = false;
let activeDetections = [];
let zoomLevel = 1;

const objectCandidates = [...new Set([
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'street sign', 'stop sign', 'parking meter', 'bench',
  'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe',
  'hat', 'backpack', 'umbrella', 'shoe', 'eyeglasses', 'handbag', 'tie', 'suitcase',
  'frisbee', 'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
  'skateboard', 'surfboard', 'tennis racket', 'bottle', 'plate', 'wine glass', 'cup', 'fork',
  'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange', 'broccoli', 'carrot',
  'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch', 'potted plant', 'bed', 'mirror',
  'dining table', 'window', 'desk', 'toilet', 'door', 'television', 'laptop', 'computer mouse',
  'remote control', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
  'refrigerator', 'blender', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair dryer',
  'toothbrush', 'hair brush', 'potato', 'tomato', 'onion', 'cucumber', 'bell pepper', 'corn',
  'lettuce', 'cabbage', 'cauliflower', 'eggplant', 'garlic', 'ginger', 'sweet potato', 'pumpkin',
  'zucchini', 'green beans', 'peas', 'mushroom', 'avocado', 'lemon', 'lime', 'strawberry',
  'grapes', 'watermelon', 'pineapple', 'mango', 'peach', 'pear', 'kiwi', 'bread', 'egg', 'cheese',
  'fish', 'rice', 'flower', 'plant', 'tree', 'box', 'bag', 'toy', 'candle', 'basket',
])];

function setZoom(value) {
  zoomLevel = Math.min(3, Math.max(0.5, value));
  stage.style.setProperty('--preview-zoom', zoomLevel);
  zoomResetButton.textContent = `${Math.round(zoomLevel * 100)}%`;
  zoomOutButton.disabled = zoomLevel <= 0.5;
  zoomInButton.disabled = zoomLevel >= 3;
}

function setProgress(label, value) {
  progressRow.classList.remove('hidden');
  progressLabel.textContent = label;
  progressValue.textContent = `${Math.round(value)}%`;
  progressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
}

function setFile(file) {
  if (!file || (!file.type.startsWith('image/') && !file.type.startsWith('video/'))) {
    showError('Choose an image or video file your browser can open.');
    return;
  }

  clearFile();
  selectedFile = file;
  fileUrl = URL.createObjectURL(file);
  dropzone.classList.add('hidden');
  preview.classList.remove('hidden');
  document.querySelector('#file-name').textContent = file.name;
  document.querySelector('#file-kind').textContent = file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE';
  videoSetting.classList.toggle('hidden', !file.type.startsWith('video/'));
  results.classList.add('hidden');
  errorMessage.classList.add('hidden');
  activeDetections = [];
  clearOverlay();
  analyzeButton.disabled = true;
  analyzeLabel.textContent = 'Loading preview...';

  if (file.type.startsWith('video/')) {
    imagePreview.classList.add('hidden');
    videoPreview.classList.remove('hidden');
    videoPreview.src = fileUrl;
    videoPreview.onloadedmetadata = () => {
      mediaDimensions.textContent = `${videoPreview.videoWidth} × ${videoPreview.videoHeight} · ${formatDuration(videoPreview.duration)}`;
      syncOverlay();
      analyzeButton.disabled = false;
      analyzeLabel.textContent = 'Detect objects';
    };
    videoPreview.onerror = () => showError('This video format could not be opened by your browser.');
  } else {
    videoPreview.pause();
    videoPreview.removeAttribute('src');
    videoPreview.load();
    videoPreview.classList.add('hidden');
    imagePreview.classList.remove('hidden');
    imagePreview.onload = () => {
      mediaDimensions.textContent = `${imagePreview.naturalWidth} × ${imagePreview.naturalHeight}`;
      syncOverlay();
      analyzeButton.disabled = false;
      analyzeLabel.textContent = 'Detect objects';
    };
    imagePreview.onerror = () => showError('This image format could not be opened by your browser.');
    imagePreview.src = fileUrl;
  }
}

function clearFile() {
  setZoom(1);
  if (fileUrl) URL.revokeObjectURL(fileUrl);
  fileUrl = null;
  selectedFile = null;
  imagePreview.onload = null;
  imagePreview.onerror = null;
  videoPreview.onloadedmetadata = null;
  videoPreview.onerror = null;
  imagePreview.removeAttribute('src');
  videoPreview.pause();
  videoPreview.removeAttribute('src');
  videoPreview.load();
  imagePreview.classList.add('hidden');
  videoPreview.classList.add('hidden');
  preview.classList.add('hidden');
  dropzone.classList.remove('hidden');
  results.classList.add('hidden');
  progressRow.classList.add('hidden');
  errorMessage.classList.add('hidden');
  videoSetting.classList.remove('hidden');
  mediaDimensions.textContent = 'WAITING FOR ANALYSIS';
  analyzeButton.disabled = true;
  analyzeLabel.textContent = 'Choose a file first';
  activeDetections = [];
  clearOverlay();
  fileInput.value = '';
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return 'VIDEO';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function getMediaElement() {
  return selectedFile?.type.startsWith('video/') ? videoPreview : imagePreview;
}

function captureFrame(media) {
  const width = selectedFile.type.startsWith('video/') ? videoPreview.videoWidth : imagePreview.naturalWidth;
  const height = selectedFile.type.startsWith('video/') ? videoPreview.videoHeight : imagePreview.naturalHeight;
  if (!width || !height) throw new Error('The selected media has no readable frame.');
  inferenceCanvas.width = width;
  inferenceCanvas.height = height;
  inferenceContext.drawImage(media, 0, 0, width, height);
  return inferenceCanvas;
}

function syncOverlay() {
  const media = getMediaElement();
  if (!media || media.classList.contains('hidden')) return;
  const mediaLeft = media.offsetLeft;
  const mediaTop = media.offsetTop;
  const mediaWidth = media.offsetWidth;
  const mediaHeight = media.offsetHeight;
  const sourceWidth = selectedFile?.type.startsWith('video/') ? videoPreview.videoWidth : imagePreview.naturalWidth;
  const sourceHeight = selectedFile?.type.startsWith('video/') ? videoPreview.videoHeight : imagePreview.naturalHeight;
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.min(mediaWidth / sourceWidth, mediaHeight / sourceHeight);
  const displayWidth = sourceWidth * scale;
  const displayHeight = sourceHeight * scale;
  overlay.style.left = `${mediaLeft + (mediaWidth - displayWidth) / 2}px`;
  overlay.style.top = `${mediaTop + (mediaHeight - displayHeight) / 2}px`;
  overlay.style.width = `${displayWidth}px`;
  overlay.style.height = `${displayHeight}px`;
  drawDetections();
}

function clearOverlay() {
  const context = overlay.getContext('2d');
  context.clearRect(0, 0, overlay.width, overlay.height);
}

function drawDetections() {
  const width = selectedFile?.type.startsWith('video/') ? videoPreview.videoWidth : imagePreview.naturalWidth;
  const height = selectedFile?.type.startsWith('video/') ? videoPreview.videoHeight : imagePreview.naturalHeight;
  if (!width || !height) return;
  if (overlay.width !== width || overlay.height !== height) {
    overlay.width = width;
    overlay.height = height;
  }
  const context = overlay.getContext('2d');
  context.clearRect(0, 0, width, height);
  const scale = Math.max(1, width / 900);
  context.lineWidth = 2 * scale;
  context.font = `600 ${Math.max(13, 14 * scale)}px 'DM Mono', monospace`;
  activeDetections.forEach((detection, index) => {
    const color = ['#c7f36b', '#ff795c', '#7edbd4', '#f4d36a'][index % 4];
    const { xmin, ymin, xmax, ymax } = detection.box;
    const boxWidth = xmax - xmin;
    const boxHeight = ymax - ymin;
    context.strokeStyle = color;
    context.strokeRect(xmin, ymin, boxWidth, boxHeight);
    const label = `${detection.label} ${Math.round(detection.score * 100)}%`;
    const textWidth = context.measureText(label).width;
    const labelY = Math.max(0, ymin - 27 * scale);
    context.fillStyle = color;
    context.fillRect(xmin, labelY, textWidth + 16 * scale, 25 * scale);
    context.fillStyle = '#17211b';
    context.fillText(label, xmin + 8 * scale, labelY + 17 * scale);
  });
}

function getDetector() {
  if (!detectorPromise) {
    detectorPromise = import('@huggingface/transformers').then(({ pipeline, env }) => {
      env.allowLocalModels = false;
      return pipeline('zero-shot-object-detection', 'onnx-community/owlvit-base-patch32-ONNX', {
        dtype: 'q4',
        progress_callback: (progress) => {
          if (progress.status === 'progress' && progress.total) {
            setProgress('Downloading object detector', (progress.loaded / progress.total) * 100);
          }
        },
      });
    });
  }
  return detectorPromise;
}

async function waitForSeek(video, time) {
  if (Math.abs(video.currentTime - time) < 0.05) return;
  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Timed out while reading a video frame.')), 10000);
    video.addEventListener('seeked', () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
    video.currentTime = time;
  });
}

function renderResults(frameCounts, isVideo) {
  const labels = [...new Set(frameCounts.flatMap((frame) => frame.detections.map((detection) => detection.label)))].sort();
  const rows = labels.map((label, index) => {
    const perFrame = frameCounts.map((frame) => frame.detections.filter((detection) => detection.label === label).length);
    const peak = Math.max(0, ...perFrame);
    const total = perFrame.reduce((sum, count) => sum + count, 0);
    const average = frameCounts.length ? (total / frameCounts.length).toFixed(1) : '0';
    return `<div class="result-row">
      <span class="result-number">${String(index + 1).padStart(2, '0')}</span>
      <span class="result-name">${escapeHtml(label.toUpperCase())}</span>
      <span class="result-detail">${isVideo ? `${average} AVG / FRAME` : 'IN THIS IMAGE'}</span>
      <span class="result-count">${peak}<small>FOUND</small></span>
    </div>`;
  });
  resultsContent.innerHTML = rows.join('') || '<p class="no-results">No supported objects were detected. Try a clearer image or lower the confidence threshold.</p>';
  resultsMeta.textContent = isVideo ? `${frameCounts.length} FRAMES SAMPLED · PEAK PER FRAME` : 'SINGLE FRAME · IMAGE';
  results.classList.remove('hidden');
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

async function analyze() {
  if (!selectedFile || isAnalyzing) return;
  isAnalyzing = true;
  analyzeButton.disabled = true;
  removeFileButton.disabled = true;
  errorMessage.classList.add('hidden');
  results.classList.add('hidden');
  activeDetections = [];
  clearOverlay();
  const isVideo = selectedFile.type.startsWith('video/');
  const frameCounts = [];

  try {
    setProgress('Loading object detector', 0);
    const detector = await getDetector();
    const media = getMediaElement();

    if (isVideo) {
      const duration = videoPreview.duration;
      const totalFrames = Math.min(120, Math.max(1, Math.ceil(duration)));
      const interval = duration > 120 ? duration / totalFrames : 1;
      for (let frame = 0; frame < totalFrames; frame += 1) {
        const time = Math.min(frame * interval, Math.max(0, duration - 0.05));
        await waitForSeek(videoPreview, time);
        progressLabel.textContent = `Inspecting frame ${frame + 1} of ${totalFrames}`;
        const detections = await detector(captureFrame(media), objectCandidates, { threshold: Number(confidenceInput.value) / 100 });
        const accepted = detections.filter((detection) => detection.score >= Number(confidenceInput.value) / 100);
        frameCounts.push({ detections: accepted });
        activeDetections = accepted;
        syncOverlay();
        setProgress(`Inspecting frame ${frame + 1} of ${totalFrames}`, ((frame + 1) / totalFrames) * 100);
      }
    } else {
      const detections = await detector(captureFrame(media), objectCandidates, { threshold: Number(confidenceInput.value) / 100 });
      activeDetections = detections.filter((detection) => detection.score >= Number(confidenceInput.value) / 100);
      frameCounts.push({ detections: activeDetections });
      syncOverlay();
      setProgress('Analysis complete', 100);
    }

    renderResults(frameCounts, isVideo);
  } catch (error) {
    detectorPromise = null;
    showError(error.message?.includes('fetch') || error.message?.includes('Failed')
      ? 'The detector could not be downloaded. Check your connection and try again.'
      : `Analysis failed: ${error.message || 'Unexpected error.'}`);
  } finally {
    isAnalyzing = false;
    analyzeButton.disabled = false;
    removeFileButton.disabled = false;
    analyzeLabel.textContent = 'Analyze again';
    window.setTimeout(() => progressRow.classList.add('hidden'), 1200);
  }
}

fileInput.addEventListener('change', (event) => setFile(event.target.files?.[0]));
removeFileButton.addEventListener('click', clearFile);
analyzeButton.addEventListener('click', analyze);
document.querySelector('#candidate-count').textContent = `${objectCandidates.length} OBJECT CATEGORIES`;
zoomOutButton.addEventListener('click', () => setZoom(zoomLevel - 0.25));
zoomResetButton.addEventListener('click', () => setZoom(1));
zoomInButton.addEventListener('click', () => setZoom(zoomLevel + 0.25));
confidenceInput.addEventListener('input', () => {
  confidenceValue.value = `${confidenceInput.value}%`;
});
window.addEventListener('resize', syncOverlay);
imagePreview.addEventListener('load', syncOverlay);
videoPreview.addEventListener('seeked', syncOverlay);

dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});
dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzone.classList.add('dragging');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.classList.remove('dragging');
  setFile(event.dataTransfer.files?.[0]);
});
