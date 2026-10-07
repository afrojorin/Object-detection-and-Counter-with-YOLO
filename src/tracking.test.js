import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectTracker } from './tracking.js';

function detection(x, label = 'person') {
  return {
    label,
    score: 0.9,
    classificationScore: 0.8,
    box: { xmin: x, ymin: 20, xmax: x + 50, ymax: 100 },
  };
}

test('keeps the same object id as it moves and skips a sampled frame', () => {
  const tracker = new ObjectTracker();
  const first = tracker.update([detection(20)], 1)[0];
  tracker.update([detection(50)], 2);
  tracker.update([detection(110)], 4);
  const last = tracker.update([detection(140)], 5)[0];

  assert.equal(last.trackId, first.trackId);
  assert.equal(tracker.tracks.length, 1);
  assert.equal(tracker.tracks[0].observations, 4);
});

test('keeps separate moving objects in separate tracks', () => {
  const tracker = new ObjectTracker();
  const firstFrame = tracker.update([detection(20), detection(320, 'car')], 1);
  const nextFrame = tracker.update([detection(45), detection(345, 'car')], 2);

  assert.notEqual(firstFrame[0].trackId, firstFrame[1].trackId);
  assert.equal(nextFrame[0].trackId, firstFrame[0].trackId);
  assert.equal(nextFrame[1].trackId, firstFrame[1].trackId);
});