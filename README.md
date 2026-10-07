# Fieldnotes Object Counter

Upload an image or video and the model automatically labels, highlights, and counts detected objects. Detection runs in your browser with the public ONNX OWL-ViT model; your media is not uploaded.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The detector and its model weights download the first time you analyze a file, so that first analysis needs an internet connection. Later runs use the browser cache.

## Notes

- The detector compares objects against an internal list of common categories, including people, vehicles, animals, and produce such as potatoes. It can still mislabel or miss small, obscured, or unfamiliar objects, so review the marked image and confidence scores.
- Video analysis samples up to 120 frames. The displayed count is the peak number visible in a sampled frame, with the average per frame alongside it; it does not track unique objects across the clip.
- Supported media depends on the codecs your browser can decode. The app accepts image and video files and keeps the selected media on-device.
