# Video Studio

A high-performance, multi-track desktop video editor — a fast, private, portable alternative to CapCut. Trim and arrange clips on a timeline, add text, graphics, effects, filters, transitions, keyframed motion, and export finished videos. Operates 100% locally with zero cloud dependencies; all projects and media stay securely on your device.

The editor provides an assets panel, video player and inspector panel on top, with a multi-track timeline below.

## Features

- **Media**: Import local video, audio, and images; record webcam or screen (with teleprompter); generated backdrops; folders and bins; drag to timeline or player; relink and clean up unused media.
- **Timelines**: Multiple timelines per project sharing media, each with its own aspect ratio, resolution and frame rate; duplicate to try alternative cuts or nest as compound clips.
- **Timeline**: Base track with ripple editing, overlay video, text, effects, filters, color layers and audio tracks; handles with live frame preview; split (Ctrl+B), cut/copy/paste, attributes copy/paste; snapping with guides; markers with notes; in/out range; marquee selection; compound clips and multi-cam.
- **Clip tools**: Speed (0.1x to 100x), speed curves and velocity ramps, smooth slow motion, reverse, freeze frame, detach audio, crop, masks with feather and invert, chroma key, automatic background removal, object removal, people retouch (skin, face, body, makeup), motion blur, noise reduction, and relighting.
- **Smart tools**: Split at scene changes, silence removal, audio sync for two cameras, auto-reframe, stabilization, deflicker, and motion tracking.
- **Color & Style**: Looks and art styles live on device shaders (sketch, watercolor, comic, oil, halftone, neon, pencil); color wheels, curves, HSL ranges, and 3D .cube LUTs.
- **Motion**: Keyframes for position, scale, rotation, opacity and volume with customizable easing curves; 41 in/out/loop animations.
- **Text & Audio**: Styled presets, word art, speech bubbles, animated text templates; audio waveforms, fades, loudness normalization, voice enhancement, voice changer presets, and voiceover recording.
- **Presenter avatars**: Animated presenters with lip-sync computed directly on device from voice audio tracks.
- **Player**: Real-time WebGL2 playback, zoom/pan, safe zones, rulers, guides, and snapshot capture to media.
- **Proxy media**: Smooth editing of 4K and heavy footage with background 720p proxy generation into local device storage.
- **Export**: Full project, in/out range or selection; H.264, HEVC, VP9, AV1; MP4, WebM, MOV, animated GIF, or audio WAV/M4A/OGG.
- **Portable & Offline**: Single-file portable Windows executable (`VideoStudio-Portable.exe`). No installation required. Runs anywhere.
- **Built-in Auto Updater**: Automatic check for updates against the GitHub repository with clean user-friendly update prompt.

## Technology Stack

| Area | Technology |
| --- | --- |
| Preview compositing, grading, effects, transitions | WebGL2 (`src/engine/compositor.js`, `src/engine/shaders.js`) |
| Preview decoding | Hardware-decoded media elements with WebCodecs |
| Thumbnails & waveforms | WebCodecs in Web Workers (`src/workers/media-worker.js`) |
| Proxy generation & export | WebCodecs decode/encode via Mediabunny |
| Background removal & landmarks | MediaPipe Tasks runtime running on device WebAssembly |
| Audio math (peaks, mixing, resampling, limiting) | Rust compiled to WebAssembly with SIMD (`wasm/dsp`) |
| Storage | Origin Private File System (OPFS) and local memory |
| Desktop App | Portable Electron packaging with loopback server |

## Building from Source

```sh
npm install
npm run dev               # Run local Vite dev server
npm run build:electron    # Bundle application for desktop
npx electron-builder --win portable  # Package single-file portable .exe
```
