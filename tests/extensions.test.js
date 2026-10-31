import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extensionRegistry } from '../src/extensions/registry.js';
import { ASSET_TABS } from '../src/ui/panels/index.js';
import { extensionsTab } from '../src/ui/panels/extensions.js';
import { ExtensionWorkspace } from '../src/ui/extension-workspace.js';

describe('Extension Architecture & Registry', () => {
  it('has built-in extensions registered with proper metadata', () => {
    const list = extensionRegistry.getAll();
    expect(list.length).toBeGreaterThanOrEqual(2);

    const kinetic = extensionRegistry.get('kinetic-typography');
    expect(kinetic).toBeDefined();
    expect(kinetic.name).toBe('Kinetic Typography');
    expect(kinetic.entry).toBe('extensions/kinetic-typography/index.html');
    expect(kinetic.capabilities).toContain('export-video');

    const lowerThirds = extensionRegistry.get('lower-thirds');
    expect(lowerThirds).toBeDefined();
    expect(lowerThirds.name).toBe('Lower Thirds & Overlays');
    expect(lowerThirds.capabilities).toContain('export-video');
  });

  it('supports registering new third-party extensions seamlessly', () => {
    extensionRegistry.register({
      id: 'audio-visualizer',
      name: 'Audio Wave Visualizer',
      version: '1.0.0',
      author: 'Community',
      category: 'graphics',
      icon: 'waveform',
      description: 'Generates spectrum waves',
      entry: 'extensions/audio-visualizer/index.html',
    });

    expect(extensionRegistry.get('audio-visualizer')).toBeDefined();
    const filtered = extensionRegistry.filter({ query: 'spectrum' });
    expect(filtered.some((e) => e.id === 'audio-visualizer')).toBe(true);

    // Clean up
    extensionRegistry.unregister('audio-visualizer');
    expect(extensionRegistry.get('audio-visualizer')).toBeNull();
  });

  it('filters extensions by category and search query', () => {
    const titles = extensionRegistry.filter({ category: 'titles' });
    expect(titles.every((e) => e.category === 'titles')).toBe(true);
    expect(titles.some((e) => e.id === 'kinetic-typography')).toBe(true);

    const searched = extensionRegistry.filter({ query: 'broadcast' });
    expect(searched.some((e) => e.id === 'lower-thirds')).toBe(true);
  });
});

describe('Extensions Tab (Replaces Avatars)', () => {
  it('completely replaces Avatars in ASSET_TABS with Extensions', () => {
    const avatarTab = ASSET_TABS.find((t) => t.id === 'avatars');
    expect(avatarTab).toBeUndefined();

    const extTab = ASSET_TABS.find((t) => t.id === 'extensions');
    expect(extTab).toBeDefined();
    expect(extTab.label).toBe('Extensions');
    expect(extTab.icon).toBe('blocks');
  });

  it('renders extension cards and triggers openExtension on click', () => {
    const openMock = vi.fn();
    const ctx = {
      editor: { openExtension: openMock },
    };

    const tab = extensionsTab(ctx);
    expect(tab.el).toBeDefined();

    const cards = tab.el.querySelectorAll('.ext-card');
    expect(cards.length).toBeGreaterThanOrEqual(2);

    const firstCard = cards[0];
    const openBtn = firstCard.querySelector('.ext-open-btn');
    expect(openBtn).toBeDefined();

    openBtn.click();
    expect(openMock).toHaveBeenCalledWith('kinetic-typography');

    tab.dispose();
  });
});

describe('Extension Full-Screen Workspace & API Bridge', () => {
  let ctx;
  let importFilesMock;

  beforeEach(() => {
    importFilesMock = vi.fn().mockResolvedValue([
      {
        id: 'asset_test_1',
        name: 'Exported Video.webm',
        kind: 'video',
        duration: 3.5,
        width: 1920,
        height: 1080,
      },
    ]);

    ctx = {
      store: {
        project: {
          name: 'My Project',
          settings: { width: 1920, height: 1080, fps: 30 },
        },
        time: 1_000_000,
      },
      actions: {
        importFiles: importFilesMock,
      },
      playerView: { relayout: vi.fn() },
      timeline: { render: vi.fn() },
    };
  });

  it('opens and closes the full-screen workspace properly', () => {
    const onReturn = vi.fn();
    const ws = new ExtensionWorkspace(ctx, { onReturn });

    expect(ws.isOpen).toBe(false);
    expect(ws.el.hidden).toBe(true);

    const ext = extensionRegistry.get('kinetic-typography');
    ws.open(ext);

    expect(ws.isOpen).toBe(true);
    expect(ws.el.hidden).toBe(false);

    // Iframe mounted
    const iframe = ws.el.querySelector('.ext-workspace-iframe');
    expect(iframe).toBeDefined();
    expect(iframe.src).toContain(ext.entry);

    // Close
    ws.close();
    expect(ws.isOpen).toBe(false);
    expect(ws.el.hidden).toBe(true);
    expect(onReturn).toHaveBeenCalled();

    ws.dispose();
  });

  it('handles VS_EXT_ADD_TO_TIMELINE and imports the exported video clip', async () => {
    const ws = new ExtensionWorkspace(ctx);
    const ext = extensionRegistry.get('kinetic-typography');
    ws.open(ext);

    const mockBlob = new Blob(['video data'], { type: 'video/webm' });
    const payload = {
      blob: mockBlob,
      name: 'Kinetic Motion.webm',
      mimeType: 'video/webm',
      duration: 3.5,
      width: 1920,
      height: 1080,
    };

    // Simulate postMessage handler call
    await ws._handleAddToTimeline(payload);

    expect(importFilesMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Kinetic Motion.webm',
          type: 'video/webm',
        }),
      ]),
      expect.objectContaining({
        addToTimeline: true,
        origin: 'extension:kinetic-typography',
      })
    );

    ws.dispose();
  });

  it('handles export errors gracefully without throwing', async () => {
    importFilesMock.mockRejectedValueOnce(new Error('Disk full'));

    const ws = new ExtensionWorkspace(ctx);
    ws.open(extensionRegistry.get('kinetic-typography'));

    const mockBlob = new Blob(['video'], { type: 'video/webm' });
    await ws._handleAddToTimeline({ blob: mockBlob, name: 'Failed.webm' });

    // Should not crash, and progress should be cleared
    expect(ws._isExporting).toBe(false);

    ws.dispose();
  });
});
