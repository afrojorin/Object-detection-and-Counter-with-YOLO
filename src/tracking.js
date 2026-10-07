function boxCenter(box) {
  return { x: (box.xmin + box.xmax) / 2, y: (box.ymin + box.ymax) / 2 };
}

function boxArea(box) {
  return Math.max(1, (box.xmax - box.xmin) * (box.ymax - box.ymin));
}

function boxIoU(first, second) {
  const width = Math.max(0, Math.min(first.xmax, second.xmax) - Math.max(first.xmin, second.xmin));
  const height = Math.max(0, Math.min(first.ymax, second.ymax) - Math.max(first.ymin, second.ymin));
  const intersection = width * height;
  return intersection / (boxArea(first) + boxArea(second) - intersection);
}

function voteTrackLabel(track, detection) {
  const label = detection.label;
  const score = Math.max(0.05, detection.classificationScore ?? detection.score);
  track.labelVotes[label] = (track.labelVotes[label] ?? 0) + score;
  track.label = Object.entries(track.labelVotes).sort((first, second) => second[1] - first[1])[0][0];
}

export class ObjectTracker {
  constructor(maxMissedFrames = 3) {
    this.maxMissedFrames = maxMissedFrames;
    this.reset();
  }

  reset() {
    this.tracks = [];
    this.nextTrackId = 1;
  }

  update(detections, frameNumber) {
    const activeTracks = this.tracks.filter((track) => frameNumber - track.lastFrame <= this.maxMissedFrames);
    const possibleMatches = [];

    activeTracks.forEach((track) => {
      const gap = frameNumber - track.lastFrame;
      const predictedCenter = {
        x: track.center.x + track.velocity.x * gap,
        y: track.center.y + track.velocity.y * gap,
      };
      const scale = Math.max(28, Math.sqrt(boxArea(track.box)));
      detections.forEach((detection, detectionIndex) => {
        const center = boxCenter(detection.box);
        const distance = Math.hypot(center.x - predictedCenter.x, center.y - predictedCenter.y);
        const maximumDistance = scale * (1.25 + 0.45 * (gap - 1));
        const overlap = boxIoU(track.box, detection.box);
        if (overlap >= 0.08 || distance <= maximumDistance) {
          possibleMatches.push({
            track,
            detection,
            detectionIndex,
            cost: distance / maximumDistance - overlap * 0.75,
          });
        }
      });
    });

    possibleMatches.sort((first, second) => first.cost - second.cost);
    const matchedTracks = new Set();
    const matchedDetections = new Set();

    possibleMatches.forEach(({ track, detection, detectionIndex }) => {
      if (matchedTracks.has(track.id) || matchedDetections.has(detectionIndex)) return;
      const previousCenter = track.center;
      const gap = frameNumber - track.lastFrame;
      const currentCenter = boxCenter(detection.box);
      const measuredVelocity = {
        x: (currentCenter.x - previousCenter.x) / gap,
        y: (currentCenter.y - previousCenter.y) / gap,
      };
      track.velocity = {
        x: track.velocity.x * 0.45 + measuredVelocity.x * 0.55,
        y: track.velocity.y * 0.45 + measuredVelocity.y * 0.55,
      };
      track.center = currentCenter;
      track.box = detection.box;
      track.lastFrame = frameNumber;
      track.observations += 1;
      voteTrackLabel(track, detection);
      detection.trackId = track.id;
      detection.label = track.label;
      matchedTracks.add(track.id);
      matchedDetections.add(detectionIndex);
    });

    detections.forEach((detection, index) => {
      if (matchedDetections.has(index)) return;
      const center = boxCenter(detection.box);
      const track = {
        id: this.nextTrackId++,
        label: detection.label,
        labelVotes: {},
        box: detection.box,
        center,
        velocity: { x: 0, y: 0 },
        lastFrame: frameNumber,
        observations: 1,
      };
      voteTrackLabel(track, detection);
      detection.trackId = track.id;
      detection.label = track.label;
      this.tracks.push(track);
    });

    return detections;
  }
}