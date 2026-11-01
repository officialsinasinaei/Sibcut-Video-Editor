import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extensionRegistry } from '../src/extensions/registry.js';
import { ASSET_TABS } from '../src/ui/panels/index.js';
import { extensionsTab } from '../src/ui/panels/extensions.js';
import { ExtensionWorkspace } from '../src/ui/extension-workspace.js';
import {
  renderDeveloperGuide,
  generateDeveloperGuideMarkdown,
  copyDeveloperGuide,
} from '../src/ui/panels/extensions-guide.js';

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

  it('supports subscribing to registry changes', () => {
    const listener = vi.fn();
    const unsub = extensionRegistry.subscribe(listener);

    extensionRegistry.register({
      id: 'sub-test',
      name: 'Subscription Test',
      entry: 'test.html',
    });

    expect(listener).toHaveBeenCalledTimes(1);

    extensionRegistry.unregister('sub-test');
    expect(listener).toHaveBeenCalledTimes(2);

    unsub();
    extensionRegistry.register({
      id: 'sub-test-2',
      name: 'Subscription Test 2',
      entry: 'test2.html',
    });
    // Should not call listener after unsub
    expect(listener).toHaveBeenCalledTimes(2);

    extensionRegistry.unregister('sub-test-2');
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

  it('provides toolbar actions for Load Extension, Developer Guide, and Copy Guide', () => {
    const ctx = { editor: {} };
    const tab = extensionsTab(ctx);

    const loadBtn = tab.el.querySelector('.ext-toolbar-load-btn');
    expect(loadBtn).toBeDefined();
    expect(loadBtn.textContent).toContain('Load');

    const guideBtn = tab.el.querySelector('.ext-toolbar-guide-btn');
    expect(guideBtn).toBeDefined();
    expect(guideBtn.getAttribute('aria-label') || guideBtn.getAttribute('title')).toContain('Developer Guide');

    const copyBtn = tab.el.querySelector('.ext-toolbar-copy-btn');
    expect(copyBtn).toBeDefined();
    expect(copyBtn.getAttribute('aria-label') || copyBtn.getAttribute('title')).toContain('Copy Guide');

    tab.dispose();
  });

  it('renders the Developer Guide when the guide category is selected', () => {
    const ctx = { editor: {} };
    const tab = extensionsTab(ctx);

    tab.openGuide();
    const guideContainer = tab.el.querySelector('.ext-guide-container');
    expect(guideContainer).toBeDefined();

    expect(guideContainer.querySelector('#guide-architecture')).toBeDefined();
    expect(guideContainer.querySelector('#guide-structure')).toBeDefined();
    expect(guideContainer.querySelector('#guide-sdk')).toBeDefined();
    expect(guideContainer.querySelector('#guide-timeline')).toBeDefined();
    expect(guideContainer.querySelector('#guide-dos-donts')).toBeDefined();
    expect(guideContainer.querySelector('#guide-testing')).toBeDefined();

    tab.dispose();
  });
});

describe('Developer Guide & Tutorial Component', () => {
  it('renders all 6 documentation sections with copyable code and tutorial', () => {
    const onBack = vi.fn();
    const onOpenLoader = vi.fn();

    const guideEl = renderDeveloperGuide({ onBack, onOpenLoader });
    expect(guideEl).toBeDefined();

    // Check header and buttons
    const backBtn = guideEl.querySelector('.ext-guide-back-btn');
    expect(backBtn).toBeDefined();
    backBtn.click();
    expect(onBack).toHaveBeenCalled();

    const loadBtn = guideEl.querySelector('.ext-guide-load-btn');
    expect(loadBtn).toBeDefined();
    loadBtn.click();
    expect(onOpenLoader).toHaveBeenCalled();

    // Check code blocks
    const codeBlocks = guideEl.querySelectorAll('.ext-code-block');
    expect(codeBlocks.length).toBeGreaterThanOrEqual(3);

    // Check tutorial steps
    const tutorialSteps = guideEl.querySelectorAll('.ext-tutorial-steps li');
    expect(tutorialSteps.length).toBe(5);

    // Check Do's and Don'ts rules
    const doCards = guideEl.querySelectorAll('.ext-rule-card.do-card');
    const dontCards = guideEl.querySelectorAll('.ext-rule-card.dont-card');
    expect(doCards.length).toBeGreaterThanOrEqual(8);
    expect(dontCards.length).toBeGreaterThanOrEqual(8);

    // Check Copy Guide for AI button and interactive AI prompt strip
    const copyAiHeroBtn = guideEl.querySelector('.ext-guide-copy-ai-btn');
    expect(copyAiHeroBtn).toBeDefined();
    expect(copyAiHeroBtn.textContent).toContain('Copy');

    const aiStrip = guideEl.querySelector('.ext-guide-ai-strip');
    expect(aiStrip).toBeDefined();
    expect(aiStrip.textContent).toContain('Copy for AI');
  });

  it('generates complete AI prompt context in Markdown format for chatbots', () => {
    const md = generateDeveloperGuideMarkdown();
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(1500);

    // Verifies key sections and instructions for AI agents
    expect(md).toContain('Video Studio Extension Specification & AI Developer Context Prompt');
    expect(md).toContain('Extension Architecture & Sandbox Model');
    expect(md).toContain('manifest.json Specification');
    expect(md).toContain('Extension SDK Reference (`window.VideoStudioExtension`)');
    expect(md).toContain('VideoStudioExtension.addToTimeline');
    expect(md).toContain('VideoStudioExtension.recordCanvas');
    expect(md).toContain('How to Implement the "Add to Timeline" Button');
    expect(md).toContain('Architectural Do\'s and Don\'ts');
    expect(md).toContain('How to Load and Test');
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
      project: {
        width: 1920,
        height: 1080,
        fps: 30,
        name: 'Unit Test Project',
      },
      actions: {
        importFiles: importFilesMock,
      },
      editor: {
        importFiles: importFilesMock,
      },
    };
  });

  it('creates full-screen workspace element with navigation and action controls', () => {
    const ws = new ExtensionWorkspace(ctx);
    expect(ws.el).toBeDefined();
    expect(ws.el.classList.contains('extension-workspace')).toBe(true);

    const backBtn = ws.el.querySelector('.ext-back-btn');
    expect(backBtn).toBeDefined();
    expect(backBtn.textContent).toContain('Back to Editor');

    const addBtn = ws.el.querySelector('.ext-add-timeline-btn');
    expect(addBtn).toBeDefined();
    expect(addBtn.textContent).toContain('Add to Timeline');

    ws.dispose();
  });

  it('opens and closes extension cleanly with sandboxed iframe and navigation callback', () => {
    const onReturn = vi.fn();
    const ws = new ExtensionWorkspace(ctx, { onReturn });

    const ext = extensionRegistry.get('kinetic-typography');
    ws.open(ext);

    expect(ws.isOpen).toBe(true);
    expect(ws.el.hidden).toBe(false);

    const iframe = ws.el.querySelector('iframe.ext-workspace-iframe');
    expect(iframe).toBeDefined();
    expect(iframe.getAttribute('src')).toBe(ext.entry);
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');

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
