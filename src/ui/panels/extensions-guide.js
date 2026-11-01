/**
 * Developer Guide & Tutorial Component for Video Studio Extensions
 * Provides a comprehensive, interactive reference for developing independent web extensions,
 * integrating the Extension SDK, implementing "Add to Timeline" video export, and adhering
 * to architectural best practices (Do's and Don'ts).
 */

import { h } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { openDialog, toast } from '../dialog.js';

/**
 * Returns the complete Developer Guide and Extension SDK specification
 * formatted as clean, structured Markdown suitable for pasting directly
 * into an AI chatbot (ChatGPT, Claude, Cursor, Gemini, etc.) as context.
 */
export function generateDeveloperGuideMarkdown() {
  return `# Video Studio Extension Specification & AI Developer Context Prompt

> System Prompt Context: You are an expert web developer specializing in HTML5 Canvas, WebGL, Web Audio, CSS, and modern web application development. Your task is to develop a complete, standalone extension for the Video Studio video editor following the exact architecture, SDK methods, and rules documented below.

---

## 1. Extension Architecture & Sandbox Model
Video Studio extensions are independent web applications built with standard web technologies (HTML, CSS, JavaScript) or bundled frontend frameworks (Vite, React, Svelte, Vue).

- **Full-Screen Workspace**: When opened, each extension runs in a dedicated full-viewport workspace (\`100vw × 100vh\`), NOT inside cramped sidebars, popups, or small widgets.
- **Sandbox Isolation**: Each extension executes inside a secured iframe sandbox (\`sandbox="allow-scripts allow-same-origin allow-downloads allow-forms"\`). Extension styles and global variables never leak to or collide with the main Video Studio application.
- **Controlled Communication**: All communication between the extension and Video Studio occurs through \`window.VideoStudioExtension\`, a lightweight postMessage bridge SDK. Never attempt to access \`parent.document\` or the host window directly.

---

## 2. Directory Structure & manifest.json

Every extension resides in its own isolated folder:
\`\`\`
my-extension/
├── manifest.json       # Required metadata, category, and permissions
├── index.html          # Entry HTML page and responsive layout
├── style.css           # Custom CSS styling (scoped entirely to the extension)
├── script.js           # JavaScript logic, canvas animation loop, and export handler
└── assets/             # (Optional) local fonts, textures, audio, SVGs
\`\`\`

### manifest.json Specification
\`\`\`json
{
  "id": "my-extension-id",
  "name": "My Extension Name",
  "version": "1.0.0",
  "author": "Your Studio / Developer",
  "category": "titles",
  "icon": "sparkles",
  "accentColor": "#6366f1",
  "badge": "Custom",
  "description": "Short description of what the extension creates or animates.",
  "entry": "index.html",
  "capabilities": ["export-video", "export-transparent"]
}
\`\`\`

*Valid categories*: \`"titles"\`, \`"effects"\`, \`"generators"\`, \`"captions"\`, \`"audio"\`, \`"tools"\`.

---

## 3. Extension SDK Reference (\`window.VideoStudioExtension\`)

In \`index.html\`, include the Extension SDK:
\`\`\`html
<script src="../shared/extension-sdk.js"></script>
\`\`\`

The global \`window.VideoStudioExtension\` provides the following methods:

1. \`VideoStudioExtension.onInit(callback)\`
   - Fires once when the host workspace mounts the extension.
   - \`callback(context)\` receives \`{ project: { width, height, fps, name }, theme: 'dark'|'light' }\`.

2. \`VideoStudioExtension.addToTimeline(videoBlob, options)\`
   - Sends the exported video Blob directly into Video Studio's timeline as an editable video clip.
   - \`options\`: \`{ name: string, duration: number, width: number, height: number }\`.
   - Returns a Promise resolving with clip metadata.

3. \`VideoStudioExtension.recordCanvas(canvas, options)\`
   - Built-in recorder that captures HTML5 or WebGL canvas frames into a high-quality WebM video Blob (VP9/VP8, up to 12-16 Mbps).
   - \`options\`: \`{ durationSec: number, fps: number, bitrate?: number, onProgress?: (ratio, status) => void }\`.
   - Returns a Promise resolving to \`Blob\`.

4. \`VideoStudioExtension.reportProgress(percentage, statusText)\`
   - Updates the host workspace header progress bar (0–100) and displays real-time status feedback.

5. \`VideoStudioExtension.onExportRequested(callback)\`
   - Fired when the user clicks the host workspace top-bar "Add to Timeline" button.

6. \`VideoStudioExtension.onCancelExport(callback)\`
   - Fired when the user cancels an export in progress.

7. \`VideoStudioExtension.toast(message, kind)\`
   - Displays a native host toast notification (\`'info'\`, \`'success'\`, or \`'error'\`).

8. \`VideoStudioExtension.close()\`
   - Closes the full-screen extension workspace and returns to the editor.

---

## 4. How to Implement the "Add to Timeline" Button

Here is the exact, production-ready implementation pattern for your extension's \`script.js\`:

\`\`\`javascript
const canvas = document.getElementById('preview-canvas');
const addTimelineBtn = document.getElementById('add-timeline-btn');

let isExporting = false;
let cancelExportFlag = false;

// 1. Listen for host workspace top-bar button and in-page button
VideoStudioExtension.onExportRequested(() => triggerAddToTimeline());
VideoStudioExtension.onCancelExport(() => {
  cancelExportFlag = true;
  isExporting = false;
  addTimelineBtn.disabled = false;
  addTimelineBtn.textContent = 'Add to Timeline';
  VideoStudioExtension.reportProgress(0, 'Export cancelled');
});

addTimelineBtn.addEventListener('click', () => triggerAddToTimeline());

async function triggerAddToTimeline() {
  if (isExporting) return;
  isExporting = true;
  cancelExportFlag = false;

  addTimelineBtn.disabled = true;
  addTimelineBtn.textContent = 'Exporting...';

  try {
    const durationSec = 4.0; // Desired animation duration in seconds
    const targetFps = 30;

    // Step 1: Initialize progress
    VideoStudioExtension.reportProgress(5, 'Preparing render canvas...');

    // Step 2: Record canvas frames
    const videoBlob = await VideoStudioExtension.recordCanvas(canvas, {
      durationSec,
      fps: targetFps,
      bitrate: 12_000_000, // 12 Mbps for broadcast clarity
      onProgress: (ratio, status) => {
        if (cancelExportFlag) throw new Error('Export cancelled by user');
        const pct = Math.round(ratio * 90);
        VideoStudioExtension.reportProgress(pct, \`Recording frames: \${pct}%\`);
      }
    });

    if (cancelExportFlag) return;

    // Step 3: Send exported video to the timeline
    VideoStudioExtension.reportProgress(95, 'Inserting video into timeline...');
    const clipName = \`Export_\${Date.now().toString().slice(-4)}.webm\`;

    const result = await VideoStudioExtension.addToTimeline(videoBlob, {
      name: clipName,
      duration: durationSec,
      width: canvas.width || 1920,
      height: canvas.height || 1080
    });

    // Step 4: Finished!
    VideoStudioExtension.reportProgress(100, 'Added to timeline!');
    VideoStudioExtension.toast('Video clip successfully added to timeline!', 'success');
  } catch (err) {
    console.error('Export failed:', err);
    if (!cancelExportFlag) {
      VideoStudioExtension.toast(\`Export failed: \${err.message}\`, 'error');
    }
  } finally {
    isExporting = false;
    addTimelineBtn.disabled = false;
    addTimelineBtn.textContent = 'Add to Timeline';
  }
}
\`\`\`

---

## 5. Architectural Do's and Don'ts (Strict Rules)

### DO:
1. **DO use the official Extension SDK**: Always use \`window.VideoStudioExtension\` for timeline imports, progress reporting, and host configuration.
2. **DO use relative asset paths**: Reference \`./style.css\`, \`./script.js\`, \`./assets/...\`.
3. **DO report live export progress**: Continually call \`VideoStudioExtension.reportProgress(pct, status)\` during rendering.
4. **DO design for full-screen responsive layouts**: Use CSS Grid or Flexbox that adapts smoothly across 1080p, 1440p, and 4K displays.
5. **DO preserve full resolution and high bitrate**: Export at 1080p (1920×1080) or 4K with 8–16 Mbps bitrate for pristine video quality.
6. **DO clean up animations and timers**: Call \`cancelAnimationFrame\` or clear timers when exports complete or when the extension closes.
7. **DO support transparency for graphic overlays**: Export WebM with alpha channel (\`video/webm;codecs=vp9\`) for lower thirds, animated titles, and overlays.
8. **DO use requestAnimationFrame or async ticks**: Render smoothly without locking the browser UI thread.

### DON'T:
1. **DON'T touch \`parent.document\` directly**: Cross-frame DOM manipulation violates sandbox security and will fail.
2. **DON'T hardcode local machine paths**: Never use \`C:\\...\` or \`file:///\` URLs.
3. **DON'T run silent multi-second operations**: Never let the interface sit motionless without updating progress.
4. **DON'T constrain the layout to tiny fixed boxes**: Do not hardcode container widths to 300px or 400px.
5. **DON'T downsample or compress videos arbitrarily**: Do not resize canvas or degrade visual quality prior to export.
6. **DON'T leave runaway animation loops running**: Always cancel background loops when idle or closed.
7. **DON'T dispatch empty or corrupted blobs**: Always verify valid MediaRecorder chunks before invoking \`addToTimeline\`.
8. **DON'T use synchronous blocking while loops**: Never use \`while (Date.now() < t)\` loops.

---

## 6. How to Load and Test in Video Studio
1. In Video Studio, click the **Extensions** tab in the left panel.
2. Click **Load Extension** in the toolbar.
3. Select your local folder containing \`manifest.json\`, \`index.html\`, \`style.css\`, and \`script.js\` (or enter your local dev server URL, e.g. \`http://localhost:5173\`).
4. Click your extension card to open it in the full-screen workspace, test controls, and export directly into the timeline!
`;
}

/**
 * Copies the guide markdown to clipboard with rich UI feedback and fallback
 */
export function copyDeveloperGuide(btn) {
  const markdown = generateDeveloperGuideMarkdown();
  
  function setSuccessState() {
    if (btn) {
      const origHtml = btn.innerHTML;
      btn.innerHTML = '';
      btn.append(icon('check', 14), h('span', 'Copied Guide for AI!'));
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = origHtml;
        btn.classList.remove('copied');
      }, 2500);
    }
    toast('Copied full guide! Paste it into your AI chatbot (ChatGPT, Claude, etc.) to build extensions.', {
      kind: 'success',
      duration: 3500,
    });
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(markdown).then(setSuccessState).catch(() => {
      fallbackCopy(markdown, setSuccessState);
    });
  } else {
    fallbackCopy(markdown, setSuccessState);
  }
}

function fallbackCopy(text, onSuccess) {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (successful) {
      onSuccess();
      return;
    }
  } catch (e) {
    console.warn('Fallback copy failed', e);
  }
  toast('Could not access clipboard automatically. Please select and copy manually.', { kind: 'error' });
}

export function renderDeveloperGuide({ onBack, onOpenLoader }) {
  function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = '';
      btn.append(icon('check', 14), h('span', 'Copied!'));
      btn.classList.add('copied');
      toast('Copied to clipboard', { kind: 'success', duration: 1800 });
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.classList.remove('copied');
      }, 2000);
    }).catch(() => {
      toast('Failed to copy to clipboard', { kind: 'error' });
    });
  }

  function codeBlock(codeText, language = 'javascript') {
    const copyBtn = h('button.ext-copy-code-btn', {
      type: 'button',
      'aria-label': 'Copy code',
      title: 'Copy code snippet',
    }, icon('copy', 14), h('span', 'Copy'));

    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(codeText, copyBtn);
    });

    const pre = h('pre.ext-code-pre',
      h('code', { class: `language-${language}` }, codeText)
    );

    return h('div.ext-code-block',
      h('div.ext-code-header',
        h('span.ext-code-lang', language.toUpperCase()),
        copyBtn
      ),
      pre
    );
  }

  // Header banner: Compact, well-aligned, space-efficient toolbar
  const copyAiBtnHeader = h('button.btn.small.primary.ext-guide-copy-ai-btn', {
    type: 'button',
    'aria-label': 'Copy full guide for AI context',
    title: 'Copy complete specification and prompt for ChatGPT, Claude, etc.',
  }, icon('copy', 13), h('span.ext-btn-text', 'Copy for AI'));

  copyAiBtnHeader.addEventListener('click', (e) => {
    e.stopPropagation();
    copyDeveloperGuide(copyAiBtnHeader);
  });

  const expandBtn = h('button.icon-btn.small.ext-guide-expand-btn', {
    type: 'button',
    'aria-label': 'Open guide in full view dialog',
    title: 'Full View Dialog',
  }, icon('fullscreen', 14));

  expandBtn.addEventListener('click', () => {
    const dlg = openDialog({
      title: 'Extension Developer Guide & Tutorial',
      body: renderDeveloperGuide({ onBack: () => dlg.close(), onOpenLoader }),
      wide: true,
      className: 'ext-guide-full-dialog',
    });
  });

  const backBtn = h('button.icon-btn.small.ext-guide-back-btn', {
    type: 'button',
    'aria-label': 'Back to extensions catalog',
    title: 'Back to catalog',
  }, icon('arrowLeft', 14));
  backBtn.addEventListener('click', onBack);

  const loadExtBtn = h('button.icon-btn.small.ext-guide-load-btn', {
    type: 'button',
    'aria-label': 'Load custom extension',
    title: 'Load Custom Extension',
  }, icon('folderUp', 14));
  loadExtBtn.addEventListener('click', onOpenLoader);

  // Compact AI Prompt Callout Strip (Single interactive tip, saves massive vertical space)
  const aiStrip = h('div.ext-guide-ai-strip', {
    role: 'button',
    tabindex: '0',
    title: 'Click to copy full developer guide formatted for ChatGPT or Claude',
    'aria-label': 'Click to copy developer guide for AI',
  },
    icon('sparkles', 13, 'ext-ai-sparkle'),
    h('span.ext-ai-strip-text',
      h('strong', 'Building with AI? '),
      'Click ',
      h('em', 'Copy for AI'),
      ' above to paste complete context into ChatGPT, Claude, or Gemini.'
    )
  );

  aiStrip.addEventListener('click', (e) => {
    e.stopPropagation();
    copyDeveloperGuide(copyAiBtnHeader);
  });

  aiStrip.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      copyDeveloperGuide(copyAiBtnHeader);
    }
  });

  // Top header assembly: Clean responsive hierarchy that never collides
  const header = h('header.ext-guide-hero',
    h('div.ext-guide-hero-header',
      h('div.ext-guide-title-row',
        backBtn,
        h('h2.ext-guide-hero-title', 'Developer Guide'),
        h('span.ext-guide-badge', 'SDK v1')
      ),
      h('div.ext-guide-action-toolbar',
        copyAiBtnHeader,
        expandBtn,
        loadExtBtn
      )
    ),
    aiStrip,
    // Table of Contents: Compact responsive pill bar
    h('nav.ext-guide-toc', { 'aria-label': 'Guide table of contents' },
      h('a.ext-toc-pill', { href: '#guide-architecture' }, icon('blocks', 11), '1. Architecture'),
      h('a.ext-toc-pill', { href: '#guide-structure' }, icon('folder', 11), '2. Structure'),
      h('a.ext-toc-pill', { href: '#guide-sdk' }, icon('code', 11), '3. SDK'),
      h('a.ext-toc-pill', { href: '#guide-timeline' }, icon('timelinePlus', 11), '4. Timeline Tutorial'),
      h('a.ext-toc-pill', { href: '#guide-dos-donts' }, icon('check', 11), '5. Do\'s & Don\'ts'),
      h('a.ext-toc-pill', { href: '#guide-testing' }, icon('wand', 11), '6. Testing')
    )
  );

  header.querySelector('.ext-guide-expand-btn')?.addEventListener('click', () => {
    const dlg = openDialog({
      title: 'Extension Developer Guide & Tutorial',
      body: renderDeveloperGuide({ onBack: () => dlg.close(), onOpenLoader }),
      wide: true,
      className: 'ext-guide-full-dialog',
    });
  });
  header.querySelector('.ext-guide-back-btn')?.addEventListener('click', onBack);
  header.querySelector('.ext-guide-load-btn')?.addEventListener('click', onOpenLoader);

  // SECTION 1: Architecture & Isolation
  const sectionArchitecture = h('section.ext-guide-section', { id: 'guide-architecture' },
    h('div.ext-guide-section-header',
      h('span.ext-guide-sec-num', '01'),
      h('h2.ext-guide-sec-title', 'Extension Architecture & Isolation')
    ),
    h('p.ext-guide-text',
      'Video Studio extensions are independent web applications. Unlike traditional plugins that run in restricted sidebars or small popups, ' +
      'Video Studio extensions open in a dedicated full-screen workspace, giving you complete freedom to build custom responsive layouts, ' +
      'complex controls, and high-framerate visual previews.'
    ),
    h('div.ext-guide-feature-grid',
      h('div.ext-feature-card',
        icon('scan', 20),
        h('strong', 'Full-Screen Workspace'),
        h('p', 'Runs in a dedicated full-viewport container with native navigation and zero cramped container constraints.')
      ),
      h('div.ext-feature-card',
        icon('lock', 20),
        h('strong', 'Complete Sandbox Isolation'),
        h('p', 'Each extension operates in its own sandboxed iframe. Your styles and scripts will never leak into or conflict with the main editor.')
      ),
      h('div.ext-feature-card',
        icon('timelinePlus', 20),
        h('strong', 'Seamless Timeline Integration'),
        h('p', 'Exported videos are ingested via the editor’s standard asset pipeline and placed onto the timeline as fully editable clips.')
      )
    )
  );

  // SECTION 2: Folder Structure & Manifest
  const manifestJsonExample = `{
  "id": "my-custom-title-maker",
  "name": "Custom Title Maker",
  "version": "1.0.0",
  "author": "Your Studio / Name",
  "category": "titles",
  "icon": "text",
  "accentColor": "#6366f1",
  "badge": "Custom",
  "description": "Create customizable neon text titles with timeline video export.",
  "entry": "index.html",
  "capabilities": ["export-video", "export-transparent"]
}`;

  const sectionStructure = h('section.ext-guide-section', { id: 'guide-structure' },
    h('div.ext-guide-section-header',
      h('span.ext-guide-sec-num', '02'),
      h('h2.ext-guide-sec-title', 'Extension Folder Structure & Manifest')
    ),
    h('p.ext-guide-text',
      'Every extension resides in its own self-contained directory with separate HTML, CSS, JavaScript, and asset files. ' +
      'A manifest file (manifest.json) specifies metadata, categories, and entry points.'
    ),
    h('div.ext-folder-tree',
      h('div.ext-tree-item.folder', icon('folderOpen', 16), h('strong', 'my-extension-folder/')),
      h('div.ext-tree-item.file', { style: { paddingLeft: '24px' } }, icon('script', 14), h('span', 'manifest.json'), h('em', '— Extension metadata and permissions')),
      h('div.ext-tree-item.file', { style: { paddingLeft: '24px' } }, icon('fileVideo', 14), h('span', 'index.html'), h('em', '— Entry point and UI layout')),
      h('div.ext-tree-item.file', { style: { paddingLeft: '24px' } }, icon('effects', 14), h('span', 'style.css'), h('em', '— Custom styling')),
      h('div.ext-tree-item.file', { style: { paddingLeft: '24px' } }, icon('code', 14), h('span', 'script.js'), h('em', '— Logic, rendering loop & export handler')),
      h('div.ext-tree-item.folder', { style: { paddingLeft: '24px' } }, icon('folder', 14), h('span', 'assets/'), h('em', '— Local fonts, SVGs, textures, audio'))
    ),
    h('h3.ext-subhead', 'manifest.json Specification'),
    codeBlock(manifestJsonExample, 'json')
  );

  // SECTION 3: Extension SDK Integration
  const sdkIncludeCode = `<!-- In your index.html head or body: -->
<script src="../shared/extension-sdk.js"></script>

<!-- The SDK exposes the global "VideoStudioExtension" object. -->
<script>
  window.addEventListener('DOMContentLoaded', () => {
    // Listen for host initialization
    VideoStudioExtension.onInit((context) => {
      console.log('Video Studio context initialized:', context);
      console.log('Project resolution:', context.project.width, 'x', context.project.height);
      console.log('Timeline FPS:', context.project.fps);
      console.log('Current UI theme:', context.theme); // 'dark' | 'light'
    });
  });
</script>`;

  const sectionSDK = h('section.ext-guide-section', { id: 'guide-sdk' },
    h('div.ext-guide-section-header',
      h('span.ext-guide-sec-num', '03'),
      h('h2.ext-guide-sec-title', 'Connecting the Extension SDK')
    ),
    h('p.ext-guide-text',
      'The Extension SDK is a lightweight, zero-dependency bridge library loaded via window.VideoStudioExtension. ' +
      'It manages bidirectional postMessage communication between your extension and the host Video Studio workspace.'
    ),
    codeBlock(sdkIncludeCode, 'html'),
    h('div.ext-sdk-table-wrap',
      h('table.ext-sdk-table',
        h('thead',
          h('tr',
            h('th', 'SDK Method'),
            h('th', 'Arguments'),
            h('th', 'Description')
          )
        ),
        h('tbody',
          h('tr',
            h('td', h('code', 'onInit(cb)')),
            h('td', h('span', 'callback(context)')),
            h('td', 'Fires when host workspace connects; supplies resolution, FPS, theme.')
          ),
          h('tr',
            h('td', h('code', 'addToTimeline(blob, opts)')),
            h('td', h('span', 'blob, { name, duration, width, height }')),
            h('td', 'Exports video blob directly to the editor timeline as an editable clip.')
          ),
          h('tr',
            h('td', h('code', 'recordCanvas(canvas, opts)')),
            h('td', h('span', 'canvas, { durationSec, fps, bitrate, onProgress }')),
            h('td', 'Captures HTML5 canvas to high-quality WebM (VP9/VP8) video blob.')
          ),
          h('tr',
            h('td', h('code', 'reportProgress(pct, status)')),
            h('td', h('span', 'number (0-100), string')),
            h('td', 'Updates the workspace header progress bar and status text.')
          ),
          h('tr',
            h('td', h('code', 'onExportRequested(cb)')),
            h('td', h('span', 'callback()')),
            h('td', 'Fires when user clicks "Add to Timeline" in the top workspace bar.')
          ),
          h('tr',
            h('td', h('code', 'onCancelExport(cb)')),
            h('td', h('span', 'callback()')),
            h('td', 'Fires when the user cancels an ongoing export render.')
          ),
          h('tr',
            h('td', h('code', 'toast(message, kind)')),
            h('td', h('span', 'string, "info"|"success"|"error"')),
            h('td', 'Displays a native application toast notification.')
          ),
          h('tr',
            h('td', h('code', 'close()')),
            h('td', h('span', '—')),
            h('td', 'Closes the extension workspace and returns to the main editor.')
          )
        )
      )
    )
  );

  // SECTION 4: Implementing "Add to Timeline" Tutorial
  const tutorialCode = `/**
 * Complete, production-ready "Add to Timeline" implementation
 */
const canvas = document.getElementById('preview-canvas');
const addTimelineBtn = document.getElementById('add-timeline-btn');

let isExporting = false;
let cancelExportFlag = false;

// Listen for workspace header "Add to Timeline" button as well as in-page button
VideoStudioExtension.onExportRequested(() => triggerAddToTimeline());
VideoStudioExtension.onCancelExport(() => {
  cancelExportFlag = true;
  isExporting = false;
  addTimelineBtn.disabled = false;
  addTimelineBtn.textContent = 'Add to Timeline';
  VideoStudioExtension.reportProgress(0, 'Export cancelled');
});

addTimelineBtn.addEventListener('click', () => triggerAddToTimeline());

async function triggerAddToTimeline() {
  if (isExporting) return;
  isExporting = true;
  cancelExportFlag = false;

  addTimelineBtn.disabled = true;
  addTimelineBtn.textContent = 'Exporting...';

  try {
    const durationSec = 4.0; // 4 seconds animation
    const targetFps = 30;

    // 1. Report starting status
    VideoStudioExtension.reportProgress(5, 'Preparing render canvas...');

    // 2. Record the canvas using the high-quality SDK recorder
    const videoBlob = await VideoStudioExtension.recordCanvas(canvas, {
      durationSec,
      fps: targetFps,
      bitrate: 12_000_000, // 12 Mbps for broadcast clarity
      onProgress: (ratio, status) => {
        if (cancelExportFlag) throw new Error('Export cancelled by user');
        const pct = Math.round(ratio * 90); // 0-90% during recording
        VideoStudioExtension.reportProgress(pct, \`Recording frames: \${pct}%\`);
      }
    });

    if (cancelExportFlag) return;

    // 3. Finalize and send to the Video Studio timeline
    VideoStudioExtension.reportProgress(95, 'Inserting video into timeline...');

    const clipName = \`Animation_\${Date.now().toString().slice(-4)}.webm\`;
    const result = await VideoStudioExtension.addToTimeline(videoBlob, {
      name: clipName,
      duration: durationSec,
      width: canvas.width || 1920,
      height: canvas.height || 1080
    });

    // 4. Finished! Report 100% and notify user
    VideoStudioExtension.reportProgress(100, 'Added to timeline!');
    VideoStudioExtension.toast('Video clip successfully added to timeline!', 'success');
    console.log('Clip imported successfully:', result);

  } catch (err) {
    console.error('Export failed:', err);
    if (!cancelExportFlag) {
      VideoStudioExtension.toast(\`Export failed: \${err.message}\`, 'error');
    }
  } finally {
    isExporting = false;
    addTimelineBtn.disabled = false;
    addTimelineBtn.textContent = 'Add to Timeline';
  }
}`;

  const sectionTimeline = h('section.ext-guide-section', { id: 'guide-timeline' },
    h('div.ext-guide-section-header',
      h('span.ext-guide-sec-num', '04'),
      h('h2.ext-guide-sec-title', 'Tutorial: Implementing the "Add to Timeline" Button')
    ),
    h('p.ext-guide-text',
      'The "Add to Timeline" workflow turns your extension into a high-value video creation tool. ' +
      'Follow these steps to record your extension output and send it directly into the host editor:'
    ),
    h('ol.ext-tutorial-steps',
      h('li',
        h('strong', 'Step 1: Create the Export UI'),
        h('p', 'Add a clear primary button labeled "Add to Timeline" inside your extension controls, with an optional duration or resolution selector.')
      ),
      h('li',
        h('strong', 'Step 2: Capture Frames to Video'),
        h('p', 'Use VideoStudioExtension.recordCanvas(canvas, options) to capture your HTML5 or WebGL canvas. It automatically configures MediaRecorder with optimal WebM VP9/VP8 codecs and high bitrate (12Mbps).')
      ),
      h('li',
        h('strong', 'Step 3: Report Live Progress'),
        h('p', 'Call VideoStudioExtension.reportProgress(percentage, statusText) inside your render loop. The workspace header displays a synchronized progress bar.')
      ),
      h('li',
        h('strong', 'Step 4: Dispatch to the Timeline'),
        h('p', 'Call await VideoStudioExtension.addToTimeline(videoBlob, metadata). The host application receives the blob, registers it into the project assets, and inserts it onto the timeline.')
      ),
      h('li',
        h('strong', 'Step 5: Handle Cancellation & Cleanup'),
        h('p', 'Listen for VideoStudioExtension.onCancelExport() to cancel heavy render loops if the user aborts.')
      )
    ),
    h('h3.ext-subhead', 'Complete Working Example'),
    codeBlock(tutorialCode, 'javascript')
  );

  // SECTION 5: Do's and Don'ts
  const dosAndDonts = [
    {
      doTitle: 'Use the Official Extension SDK',
      doDesc: 'Always communicate via window.VideoStudioExtension for timeline imports, progress reporting, and host configuration.',
      dontTitle: 'Never Access parent.document Directly',
      dontDesc: 'Do not attempt to touch parent window elements or editor internals. Cross-frame DOM tampering breaks sandbox boundaries.',
    },
    {
      doTitle: 'Use Relative Asset Paths',
      doDesc: 'Reference all stylesheets, fonts, images, and worker scripts relatively (e.g. ./assets/font.woff2, style.css).',
      dontTitle: 'Never Hardcode Machine Absolute Paths',
      dontDesc: 'Do not use C:\\Users\\... or file:/// URLs. Absolute paths will fail when packaged or run on other devices.',
    },
    {
      doTitle: 'Report Live Export Progress',
      doDesc: 'Update VideoStudioExtension.reportProgress(pct, status) during video rendering so the user receives continuous feedback.',
      dontTitle: 'Don\'t Run Silent Multi-Second Freezes',
      dontDesc: 'Do not perform long rendering tasks without updating progress; users will assume the application has frozen.',
    },
    {
      doTitle: 'Design for Full-Screen Responsiveness',
      doDesc: 'Extensions run in a dedicated full workspace. Use flexible CSS (Flexbox / CSS Grid) so controls adapt gracefully across 1080p, 1440p, and 4K.',
      dontTitle: 'Don\'t Hardcode Fixed Micro Container Sizes',
      dontDesc: 'Avoid fixing the outermost container to 300px or 400px width. Give your users the full benefit of the workspace.',
    },
    {
      doTitle: 'Export at Full Resolution & Quality',
      doDesc: 'Maintain full canvas resolution (1920×1080 or 4K) and high encoding bitrates (8-16 Mbps) for crisp, professional timeline playback.',
      dontTitle: 'Don\'t Downsample or Compress Arbitrarily',
      dontDesc: 'Never downscale the user\'s preview canvas before recording unless explicitly selected as a low-res preview mode.',
    },
    {
      doTitle: 'Clean Up Timers, Audio, and Contexts',
      doDesc: 'Cancel animation frames (cancelAnimationFrame) and pause audio when export finishes or when the workspace is closed.',
      dontTitle: 'Don\'t Leave Infinite Loops Running',
      dontDesc: 'Do not allow background render loops to spin CPU or GPU cores when the extension is hidden or unmounted.',
    },
    {
      doTitle: 'Support Transparent Backgrounds for Overlays',
      doDesc: 'For lower thirds, badges, or sticker graphics, export WebM with alpha channel (video/webm;codecs=vp9) so they overlay video seamlessly.',
      dontTitle: 'Don\'t Send 0-Byte or Incomplete Blobs',
      dontDesc: 'Always verify that MediaRecorder has cleanly finished and emitted chunks before calling addToTimeline().',
    },
    {
      doTitle: 'Use requestAnimationFrame or Async Stepping',
      doDesc: 'Step through frames smoothly using requestAnimationFrame or async timeouts to keep the browser thread responsive.',
      dontTitle: 'Don\'t Use Synchronous While Loops',
      dontDesc: 'Never use blocking while (Date.now() < end) loops to measure time. This freezes the UI thread and halts recording.',
    },
  ];

  const sectionDosDonts = h('section.ext-guide-section', { id: 'guide-dos-donts' },
    h('div.ext-guide-section-header',
      h('span.ext-guide-sec-num', '05'),
      h('h2.ext-guide-sec-title', 'Extension Development Do\'s and Don\'ts')
    ),
    h('p.ext-guide-text',
      'Follow these critical development guidelines to ensure your extension delivers high performance, ' +
      'rock-solid stability, and seamless timeline integration across all platforms.'
    ),
    h('div.ext-dos-donts-grid',
      dosAndDonts.map((item) => h('div.ext-rule-row',
        h('div.ext-rule-card.do-card',
          h('div.ext-rule-badge.do', icon('check', 14), h('span', 'DO')),
          h('strong.ext-rule-title', item.doTitle),
          h('p.ext-rule-desc', item.doDesc)
        ),
        h('div.ext-rule-card.dont-card',
          h('div.ext-rule-badge.dont', icon('close', 14), h('span', 'DON\'T')),
          h('strong.ext-rule-title', item.dontTitle),
          h('p.ext-rule-desc', item.dontDesc)
        )
      ))
    )
  );

  // SECTION 6: Loading & Live Testing
  const sectionTesting = h('section.ext-guide-section', { id: 'guide-testing' },
    h('div.ext-guide-section-header',
      h('span.ext-guide-sec-num', '06'),
      h('h2.ext-guide-sec-title', 'Loading & Live Testing Your Extension')
    ),
    h('p.ext-guide-text',
      'You can load and test your extension directly inside Video Studio using two convenient methods:'
    ),
    h('div.ext-testing-cards',
      h('div.ext-test-card',
        icon('folderUp', 22),
        h('h3', 'Method 1: Load Local Extension Folder'),
        h('p', 'Click the "Load Extension" button in the Extensions tab toolbar. Select your extension\'s folder containing index.html, style.css, script.js, and manifest.json. Video Studio will automatically bundle and mount it in the workspace.'),
        h('button.btn.small.primary.ext-test-load-btn', { type: 'button' }, icon('folderUp', 14), 'Load Local Folder Now')
      ),
      h('div.ext-test-card',
        icon('wand', 22),
        h('h3', 'Method 2: Connect Local Dev Server (Hot-Reload)'),
        h('p', 'If you are building your extension using Vite, Webpack, or live-server, select "Development URL" in the loader dialog and enter http://localhost:5173. You can develop with instant hot-module replacement directly inside the full-screen workspace!'),
        h('button.btn.small.ext-test-dev-btn', { type: 'button' }, icon('code', 14), 'Connect Dev Server URL')
      )
    ),
    h('div.ext-samples-box',
      icon('info', 16),
      h('div',
        h('strong', 'Explore Built-In Reference Extensions'),
        h('p', 'Check out public/extensions/kinetic-typography/ and public/extensions/lower-thirds/ in the repository for complete, working sample code demonstrating canvas animations and timeline export.')
      )
    )
  );

  sectionTesting.querySelector('.ext-test-load-btn')?.addEventListener('click', onOpenLoader);
  sectionTesting.querySelector('.ext-test-dev-btn')?.addEventListener('click', onOpenLoader);

  // Container
  const container = h('div.ext-guide-container',
    header,
    sectionArchitecture,
    sectionStructure,
    sectionSDK,
    sectionTimeline,
    sectionDosDonts,
    sectionTesting
  );

  return container;
}
