import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Editor } from '../src/ui/editor.js';
import { EditorStore } from '../src/model/store.js';
import { Library } from '../src/storage/library.js';
import { memoryBackend } from '../src/storage/backends.js';
import { makeClip, createProject } from '../src/model/project.js';
import * as T from '../src/model/timeline.js';

describe('Layout Stability on Timeline Selection', () => {
  let root;
  let library;
  let store;
  let editor;

  beforeEach(() => {
    document.body.replaceChildren();
    root = document.createElement('div');
    root.id = 'root';
    root.style.width = '1920px';
    root.style.height = '1080px';
    document.body.append(root);

    const project = createProject({ name: 'Stability Test' });
    // Add assets
    project.assets['v1'] = { id: 'v1', name: 'video.mp4', kind: 'video', duration: 10_000_000, hasAudio: true };
    project.assets['a1'] = { id: 'a1', name: 'audio.mp3', kind: 'audio', duration: 10_000_000 };

    // Add clips across tracks
    const videoClip = makeClip('video', { assetId: 'v1', start: 0, duration: 5_000_000 });
    const audioClip = makeClip('audio', { assetId: 'a1', start: 0, duration: 5_000_000 });
    const textClip = makeClip('text', { text: 'Hello World', start: 1_000_000, duration: 3_000_000 });

    project.tracks[0].clips.push(videoClip);
    project.tracks.push({ id: 't-audio', kind: 'audio', name: 'Audio 1', clips: [audioClip] });
    project.tracks.push({ id: 't-text', kind: 'text', name: 'Text 1', clips: [textClip] });

    store = new EditorStore(project);
    library = new Library(memoryBackend());

    // Mock resize observer and bounds measurement for jsdom
    editor = new Editor(root, {
      project,
      library,
      store,
      account: {},
    });
  });

  afterEach(() => {
    editor?.dispose?.();
    document.body.replaceChildren();
  });

  it('maintains strict layout structure (.editor-body and .workspace)', () => {
    const editorEl = root.querySelector('.editor');
    expect(editorEl).toBeTruthy();

    const editorBody = editorEl.querySelector('.editor-body');
    expect(editorBody).toBeTruthy();

    const workspace = editorBody.querySelector('.workspace');
    expect(workspace).toBeTruthy();

    const upper = workspace.querySelector('.upper');
    expect(upper).toBeTruthy();

    const timeline = workspace.querySelector('.timeline-panel');
    expect(timeline).toBeTruthy();
  });

  it('keeps panel dimensions and CSS variables invariant when selecting timeline clips', () => {
    const editorEl = root.querySelector('.editor');
    const getCssVar = (name) => editorEl.style.getPropertyValue(name);

    const initialLeftW = getCssVar('--left-w');
    const initialRightW = getCssVar('--right-w');
    const initialUpper = getCssVar('--upper');

    expect(initialLeftW).toBeTruthy();
    expect(initialRightW).toBeTruthy();
    expect(initialUpper).toBeTruthy();

    // Find the clips
    const clips = T.allClips(store.project);
    expect(clips.length).toBeGreaterThanOrEqual(3);

    const [videoClip, audioClip, textClip] = clips;

    // 1. Select video clip (populates inspector with multiple top-tabs and video controls)
    store.select(videoClip.id);
    expect(store.selected?.clip?.id).toBe(videoClip.id);
    expect(editorEl.querySelector('.inspector-body')).toBeTruthy();

    expect(getCssVar('--left-w')).toBe(initialLeftW);
    expect(getCssVar('--right-w')).toBe(initialRightW);
    expect(getCssVar('--upper')).toBe(initialUpper);

    // 2. Select text clip (inspector switches to text controls)
    store.select(textClip.id);
    expect(store.selected?.clip?.id).toBe(textClip.id);

    expect(getCssVar('--left-w')).toBe(initialLeftW);
    expect(getCssVar('--right-w')).toBe(initialRightW);
    expect(getCssVar('--upper')).toBe(initialUpper);

    // 3. Select audio clip (inspector switches to audio controls)
    store.select(audioClip.id);
    expect(store.selected?.clip?.id).toBe(audioClip.id);

    expect(getCssVar('--left-w')).toBe(initialLeftW);
    expect(getCssVar('--right-w')).toBe(initialRightW);
    expect(getCssVar('--upper')).toBe(initialUpper);

    // 4. Clear selection (inspector switches back to project settings)
    store.clearSelection();
    expect(store.selected).toBeNull();

    expect(getCssVar('--left-w')).toBe(initialLeftW);
    expect(getCssVar('--right-w')).toBe(initialRightW);
    expect(getCssVar('--upper')).toBe(initialUpper);

    // 5. Select clips rapidly back and forth
    for (let i = 0; i < 5; i++) {
      store.select(videoClip.id);
      store.select(audioClip.id);
      store.select(textClip.id);
      store.clearSelection();
    }

    expect(getCssVar('--left-w')).toBe(initialLeftW);
    expect(getCssVar('--right-w')).toBe(initialRightW);
    expect(getCssVar('--upper')).toBe(initialUpper);
  });

  it('does not trigger narrow tablet mode or detach inspector during timeline selection', () => {
    const editorEl = root.querySelector('.editor');
    const upper = editorEl.querySelector('.upper');
    const inspector = editorEl.querySelector('.inspector');

    // In desktop mode, inspector is directly inside .upper
    expect(upper.contains(inspector)).toBe(true);

    const clips = T.allClips(store.project);
    for (const c of clips) {
      store.select(c.id);
      expect(upper.contains(inspector)).toBe(true);
      expect(editorEl.dataset.layout).not.toBe('tablet');
      expect(editorEl.dataset.layout).not.toBe('phone');
    }

    store.clearSelection();
    expect(upper.contains(inspector)).toBe(true);
  });
});
