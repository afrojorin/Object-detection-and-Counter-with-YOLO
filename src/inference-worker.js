import { env, pipeline, RawImage } from '@huggingface/transformers';

env.allowLocalModels = false;

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
  'manta ray', 'stingray', 'ray', 'shark', 'dolphin', 'whale', 'sea turtle', 'seal', 'sea lion',
  'octopus', 'squid', 'jellyfish', 'crab', 'lobster', 'eel', 'seahorse',
])];

let detectorPromise = null;
let classifierPromise = null;

function reportProgress(label, value) {
  self.postMessage({ type: 'progress', label, value });
}

function createPipeline(task, model, progressLabel) {
  return pipeline(task, model, {
    dtype: 'q4',
    progress_callback: (progress) => {
      if (progress.status === 'progress' && progress.total) {
        reportProgress(progressLabel, (progress.loaded / progress.total) * 15);
      }
    },
  });
}

function getDetector() {
  if (!detectorPromise) {
    detectorPromise = createPipeline(
      'zero-shot-object-detection',
      'onnx-community/owlvit-base-patch32-ONNX',
      'Downloading object detector',
    );
  }
  return detectorPromise;
}

function getClassifier() {
  if (!classifierPromise) {
    classifierPromise = createPipeline(
      'zero-shot-image-classification',
      'Xenova/clip-vit-base-patch32',
      'Downloading object classifier',
    );
  }
  return classifierPromise;
}

function cropImage(image, left, top, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((top + row) * image.width + left) * 4;
    const destinationStart = row * width * 4;
    data.set(image.data.subarray(sourceStart, sourceStart + width * 4), destinationStart);
  }
  return new RawImage(data, width, height, 4);
}

function isDuplicateBox(first, second) {
  const intersectionWidth = Math.max(0, Math.min(first.xmax, second.xmax) - Math.max(first.xmin, second.xmin));
  const intersectionHeight = Math.max(0, Math.min(first.ymax, second.ymax) - Math.max(first.ymin, second.ymin));
  const intersection = intersectionWidth * intersectionHeight;
  const firstArea = (first.xmax - first.xmin) * (first.ymax - first.ymin);
  const secondArea = (second.xmax - second.xmin) * (second.ymax - second.ymin);
  const smallerArea = Math.min(firstArea, secondArea);
  const largerArea = Math.max(firstArea, secondArea);
  if (!smallerArea || !largerArea) return false;
  const intersectionOverUnion = intersection / (firstArea + secondArea - intersection);
  const containment = intersection / smallerArea;
  return intersectionOverUnion >= 0.65 || (smallerArea / largerArea >= 0.08 && containment >= 0.88);
}

async function classifyDetections(image, detections, frameNumber, totalFrames) {
  const proposals = [];
  for (const detection of [...detections].sort((first, second) => second.score - first.score)) {
    if (!proposals.some((proposal) => isDuplicateBox(proposal.box, detection.box))) proposals.push(detection);
  }

  const crops = proposals.map(({ box }) => {
    const left = Math.max(0, Math.floor(box.xmin));
    const top = Math.max(0, Math.floor(box.ymin));
    const right = Math.min(image.width, Math.ceil(box.xmax));
    const bottom = Math.min(image.height, Math.ceil(box.ymax));
    if (right <= left || bottom <= top) return null;
    return cropImage(image, left, top, right - left, bottom - top);
  });
  const validCrops = crops.map((crop, index) => ({ crop, index })).filter(({ crop }) => crop);
  if (!validCrops.length) return [];

  const classifier = await getClassifier();
  const classifiedDetections = [];
  for (let start = 0; start < validCrops.length; start += 4) {
    const batch = validCrops.slice(start, start + 4);
    const predictions = await classifier(batch.map(({ crop }) => crop), objectCandidates);
    batch.forEach(({ index }, batchIndex) => {
      const bestMatch = predictions[batchIndex]?.[0];
      if (!bestMatch || bestMatch.score < 0.12) {
        classifiedDetections.push({ ...proposals[index], label: 'unidentified object', classificationScore: bestMatch?.score ?? 0 });
      } else {
        classifiedDetections.push({ ...proposals[index], label: bestMatch.label, classificationScore: bestMatch.score });
      }
    });
    const classificationProgress = Math.min(start + 4, validCrops.length) / validCrops.length;
    const frameProgress = (frameNumber - 1 + 0.8 + classificationProgress * 0.2) / totalFrames;
    reportProgress('Classifying detected objects', 15 + frameProgress * 85);
  }
  return classifiedDetections;
}

async function analyzeFrame({ pixels, width, height, threshold, frameNumber, totalFrames }) {
  const image = new RawImage(new Uint8ClampedArray(pixels), width, height, 4);
  const detector = await getDetector();
  const tileWidth = Math.ceil(width * 0.6);
  const tileHeight = Math.ceil(height * 0.6);
  const left = width - tileWidth;
  const top = height - tileHeight;
  const regions = [
    { x: 0, y: 0, width, height },
    { x: 0, y: 0, width: tileWidth, height: tileHeight },
    { x: left, y: 0, width: tileWidth, height: tileHeight },
    { x: 0, y: top, width: tileWidth, height: tileHeight },
    { x: left, y: top, width: tileWidth, height: tileHeight },
  ];
  const detections = [];

  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    const tile = cropImage(image, region.x, region.y, region.width, region.height);
    const frameLabel = totalFrames > 1 ? `Frame ${frameNumber} of ${totalFrames} · crop ${index + 1} of ${regions.length}` : `Scanning crop ${index + 1} of ${regions.length}`;
    const frameProgress = (frameNumber - 1 + ((index + 1) / regions.length) * 0.8) / totalFrames;
    const progress = 15 + frameProgress * 85;
    reportProgress(frameLabel, progress);
    const tileDetections = await detector(tile, objectCandidates, { threshold });
    detections.push(...tileDetections.map((detection) => ({
      ...detection,
      box: {
        xmin: detection.box.xmin + region.x,
        ymin: detection.box.ymin + region.y,
        xmax: detection.box.xmax + region.x,
        ymax: detection.box.ymax + region.y,
      },
    })));
  }

  return classifyDetections(image, detections, frameNumber, totalFrames);
}

self.postMessage({ type: 'ready', candidateCount: objectCandidates.length });
self.addEventListener('message', async ({ data }) => {
  if (data.type !== 'analyze') return;
  try {
    const detections = await analyzeFrame(data);
    self.postMessage({ type: 'result', detections });
  } catch (error) {
    detectorPromise = null;
    classifierPromise = null;
    self.postMessage({ type: 'error', message: error.message || 'Object analysis failed.' });
  }
});