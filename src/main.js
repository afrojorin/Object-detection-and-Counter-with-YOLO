import './style.css';
import { ObjectTracker } from './tracking.js';

const fileInput = document.querySelector('#file-input');
const dropzone = document.querySelector('#dropzone');
const sampleLibrary = document.querySelector('.sample-library');
const sampleVideoSelect = document.querySelector('#sample-video');
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
let inferenceWorker = null;
let pendingInference = null;
let isAnalyzing = false;
let activeDetections = [];
const videoTracker = new ObjectTracker();
let zoomLevel = 1;
let panX = 0;
let panY = 0;
let dragOrigin = null;

function setZoom(value) {
  zoomLevel = Math.min(3, Math.max(0.5, value));
  if (zoomLevel <= 1) {
    panX = 0;
    panY = 0;
  }
  stage.style.setProperty('--preview-zoom', zoomLevel);
  stage.style.setProperty('--preview-pan-x', `${panX}px`);
  stage.style.setProperty('--preview-pan-y', `${panY}px`);
  stage.classList.toggle('zoomed', zoomLevel > 1);
  limitPan();
  zoomResetButton.textContent = `${Math.round(zoomLevel * 100)}%`;
  zoomOutButton.disabled = zoomLevel <= 0.5;
  zoomInButton.disabled = zoomLevel >= 3;
}

function limitPan() {
  const media = getMediaElement();
  if (!media || zoomLevel <= 1) return;
  const maxX = Math.max(0, (media.offsetWidth * zoomLevel - stage.clientWidth) / 2);
  const maxY = Math.max(0, (media.offsetHeight * zoomLevel - stage.clientHeight) / 2);
  panX = Math.min(maxX, Math.max(-maxX, panX));
  panY = Math.min(maxY, Math.max(-maxY, panY));
  stage.style.setProperty('--preview-pan-x', `${panX}px`);
  stage.style.setProperty('--preview-pan-y', `${panY}px`);
}

function setProgress(label, value) {
  progressRow.classList.remove('hidden');
  progressLabel.textContent = label;
  progressValue.textContent = `${Math.round(value)}%`;
  progressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
}

function setFile(file, sampleName = '') {
  if (!file || (!file.type.startsWith('image/') && !file.type.startsWith('video/'))) {
    showError('Choose an image or video file your browser can open.');
    return;
  }

  clearFile();
  selectedFile = file;
  sampleLibrary.classList.add('hidden');
  sampleVideoSelect.value = sampleName;
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
  videoTracker.reset();
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
  sampleLibrary.classList.remove('hidden');
  sampleVideoSelect.value = '';
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
  return { width, height, pixels: inferenceContext.getImageData(0, 0, width, height).data };
}

function getInferenceWorker() {
  if (inferenceWorker) return inferenceWorker;
  inferenceWorker = new Worker(new URL('./inference-worker.js', import.meta.url), { type: 'module' });
  inferenceWorker.addEventListener('message', ({ data }) => {
    if (data.type === 'ready') {
      document.querySelector('#candidate-count').textContent = `${data.candidateCount} OBJECT CATEGORIES`;
    } else if (data.type === 'progress') {
      setProgress(data.label, data.value);
    } else if (data.type === 'result' || data.type === 'error') {
      const request = pendingInference;
      pendingInference = null;
      if (data.type === 'result') request?.resolve(data.detections);
      else request?.reject(new Error(data.message));
    }
  });
  inferenceWorker.addEventListener('error', (event) => {
    pendingInference?.reject(new Error(event.message || 'Background analysis stopped unexpectedly.'));
    pendingInference = null;
    inferenceWorker?.terminate();
    inferenceWorker = null;
  });
  return inferenceWorker;
}

function detectFrame(media, frameNumber, totalFrames) {
  const { width, height, pixels } = captureFrame(media);
  return new Promise((resolve, reject) => {
    pendingInference = { resolve, reject };
    try {
      getInferenceWorker().postMessage({
        type: 'analyze',
        width,
        height,
        pixels: pixels.buffer,
        threshold: Number(confidenceInput.value) / 100,
        frameNumber,
        totalFrames,
      }, [pixels.buffer]);
    } catch (error) {
      pendingInference = null;
      reject(error);
    }
  });
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
    const confidence = detection.classificationScore ?? detection.score;
    const trackLabel = detection.trackId ? `#${detection.trackId} ` : '';
    const label = `${trackLabel}${detection.label} ${Math.round(confidence * 100)}%`;
    const textWidth = context.measureText(label).width;
    const labelY = Math.max(0, ymin - 27 * scale);
    context.fillStyle = color;
    context.fillRect(xmin, labelY, textWidth + 16 * scale, 25 * scale);
    context.fillStyle = '#17211b';
    context.fillText(label, xmin + 8 * scale, labelY + 17 * scale);
  });
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
  const labels = [...new Set(isVideo
    ? videoTracker.tracks.map((track) => track.label)
    : frameCounts.flatMap((frame) => frame.detections.map((detection) => detection.label)))].sort();
  const rows = labels.map((label, index) => {
    const perFrame = frameCounts.map((frame) => frame.detections.filter((detection) => detection.label === label).length);
    const peak = Math.max(0, ...perFrame);
    const total = perFrame.reduce((sum, count) => sum + count, 0);
    const average = frameCounts.length ? (total / frameCounts.length).toFixed(1) : '0';
    const uniqueTracks = videoTracker.tracks.filter((track) => track.label === label).length;
    return `<div class="result-row">
      <span class="result-number">${String(index + 1).padStart(2, '0')}</span>
      <span class="result-name">${escapeHtml(label.toUpperCase())}</span>
      <span class="result-detail">${isVideo ? `${peak} PEAK VISIBLE · ${average} AVG / FRAME` : 'IN THIS IMAGE'}</span>
      <span class="result-count">${isVideo ? uniqueTracks : peak}<small>${isVideo ? 'UNIQUE' : 'FOUND'}</small></span>
    </div>`;
  });
  resultsContent.innerHTML = rows.join('') || '<p class="no-results">No supported objects were detected. Try a clearer image or lower the confidence threshold.</p>';
  resultsMeta.textContent = isVideo ? `${frameCounts.length} FRAMES SAMPLED · TRACKED OBJECTS COUNTED ONCE` : 'SINGLE FRAME · IMAGE';
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
    setProgress('Starting background model', 0);
    const media = getMediaElement();

    if (isVideo) {
      const duration = videoPreview.duration;
      const totalFrames = Math.min(120, Math.max(1, Math.ceil(duration)));
      const interval = duration > 120 ? duration / totalFrames : 1;
      videoPreview.pause();
      for (let frame = 0; frame < totalFrames; frame += 1) {
        const time = Math.min(frame * interval, Math.max(0, duration - 0.05));
        await waitForSeek(videoPreview, time);
        progressLabel.textContent = `Inspecting frame ${frame + 1} of ${totalFrames}`;
        const detections = await detectFrame(media, frame + 1, totalFrames);
        const trackedDetections = videoTracker.update(detections, frame + 1);
        frameCounts.push({ detections: trackedDetections });
        activeDetections = trackedDetections;
        syncOverlay();
      }
    } else {
      activeDetections = await detectFrame(media, 1, 1);
      frameCounts.push({ detections: activeDetections });
      syncOverlay();
      setProgress('Analysis complete', 100);
    }

    renderResults(frameCounts, isVideo);
  } catch (error) {
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

async function loadSampleVideo() {
  const sampleName = sampleVideoSelect.value;
  if (!sampleName) return;
  try {
    const response = await fetch(`/videos/${encodeURIComponent(sampleName)}`);
    if (!response.ok) throw new Error('The sample video could not be loaded.');
    const blob = await response.blob();
    setFile(new File([blob], sampleName, { type: blob.type || 'video/mp4' }), sampleName);
  } catch (error) {
    showError(error.message || 'The sample video could not be loaded.');
  }
}

fileInput.addEventListener('change', (event) => setFile(event.target.files?.[0]));
sampleVideoSelect.addEventListener('change', loadSampleVideo);
removeFileButton.addEventListener('click', clearFile);
analyzeButton.addEventListener('click', analyze);
zoomOutButton.addEventListener('click', () => setZoom(zoomLevel - 0.25));
zoomResetButton.addEventListener('click', () => setZoom(1));
zoomInButton.addEventListener('click', () => setZoom(zoomLevel + 0.25));
stage.addEventListener('pointerdown', (event) => {
  const media = getMediaElement();
  if (zoomLevel <= 1 || event.button !== 0 || event.target !== media) return;
  if (media === videoPreview && event.offsetY > media.clientHeight - 48) return;
  dragOrigin = { x: event.clientX - panX, y: event.clientY - panY };
  stage.classList.add('dragging');
  stage.setPointerCapture(event.pointerId);
  event.preventDefault();
});
stage.addEventListener('pointermove', (event) => {
  if (!dragOrigin) return;
  panX = event.clientX - dragOrigin.x;
  panY = event.clientY - dragOrigin.y;
  limitPan();
});
function finishPan(event) {
  if (!dragOrigin) return;
  dragOrigin = null;
  stage.classList.remove('dragging');
  if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
}
stage.addEventListener('pointerup', finishPan);
stage.addEventListener('pointercancel', finishPan);
confidenceInput.addEventListener('input', () => {
  confidenceValue.value = `${confidenceInput.value}%`;
});
window.addEventListener('resize', syncOverlay);
window.addEventListener('resize', limitPan);
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
