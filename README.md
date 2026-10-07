# Fieldnotes Object Counter

Upload an image or video and the models automatically label, highlight, and count detected objects. OWL-ViT finds object regions and CLIP classifies each crop; inference runs in your browser and your media is not uploaded.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Detector and classifier weights download the first time you analyze a file, so that first analysis needs an internet connection. Later runs use the browser cache. Model inference runs in a background worker to keep the page interactive.
- The detector compares objects against an internal list of common categories, including people, vehicles, animals, produce, and sea life. A second model classifies each detected crop to refine broad labels. Results can still be uncertain or incorrect, especially for small, obscured, or unfamiliar objects, so review the marked image and confidence scores.

## Notes

- Video analysis samples up to 120 frames. Motion-linked IDs keep objects associated across frames; video class counts represent unique tracks, with peak simultaneous count and per-frame average alongside them. Tracking can split an object if it disappears for several sampled frames or moves too far between samples.
- The bundled clips in `videos/` are available from the sample-video picker. Training a custom model requires labeled examples; the supplied folders currently contain media but no ground-truth annotations.
- The detector scans overlapping crops to improve recall for smaller objects. Zoom the preview and drag it to inspect details.
- Supported media depends on the codecs your browser can decode. The app accepts image and video files and keeps the selected media on-device.
