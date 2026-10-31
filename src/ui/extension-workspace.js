/**
 * Dedicated Full-Screen Extension Workspace
 * 
 * Provides an isolated, responsive, full-viewport application environment
 * for Video Studio extensions with:
 *  - Native application navigation and instant return to editor
 *  - High-performance isolated iframe container
 *  - Bi-directional Extension API message bridge
 *  - Direct timeline integration and export progress visualization
 */

import { h, announce } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { toast } from './dialog.js';
import { getTheme } from './prefs.js';
import '../styles/extensions.css';

export class ExtensionWorkspace {
  constructor(ctx, { onReturn } = {}) {
    this.ctx = ctx;
    this.onReturn = onReturn || (() => {});
    this._currentExt = null;
    this._isOpen = false;
    this._isExporting = false;

    // Header elements
    this._backBtn = h('button.btn.ext-back-btn', { type: 'button', 'aria-label': 'Return to video editor' },
      icon('back', 16),
      h('span', 'Back to Editor')
    );
    this._backBtn.addEventListener('click', () => this.close());

    this._iconWrap = h('span.ext-header-icon', icon('blocks', 18));
    this._titleEl = h('h2.ext-header-title', 'Extension');
    this._badgeEl = h('span.ext-header-badge', 'v1.0');
    this._tagEl = h('span.ext-header-tag', 'Custom');

    // Progress elements
    this._progressText = h('span.ext-progress-text', 'Ready');
    this._progressFill = h('div.ext-progress-fill', { style: { width: '0%' } });
    this._progressBar = h('div.ext-progress-bar', this._progressFill);
    this._progressWrap = h('div.ext-progress-wrap', { hidden: true },
      this._progressText,
      this._progressBar
    );

    // Action buttons
    this._cancelBtn = h('button.btn.small.ext-cancel-btn', { type: 'button', hidden: true }, icon('close', 14), 'Cancel');
    this._cancelBtn.addEventListener('click', () => this._cancelExport());

    this._addTimelineBtn = h('button.btn.primary.ext-add-timeline-btn', { type: 'button' },
      icon('timelinePlus', 16),
      h('span', 'Add to Timeline')
    );
    this._addTimelineBtn.addEventListener('click', () => this._triggerExport());

    this._reloadBtn = h('button.icon-btn.ext-reload-btn', { type: 'button', 'aria-label': 'Reload extension', 'data-tip': 'Reload extension' },
      icon('refresh', 16)
    );
    this._reloadBtn.addEventListener('click', () => this._reloadIframe());

    // Top navigation bar
    this._header = h('header.ext-workspace-header',
      h('div.ext-header-left',
        this._backBtn,
        h('div.ext-header-divider'),
        h('div.ext-header-info',
          this._iconWrap,
          h('div.ext-header-texts',
            h('div.ext-header-title-row',
              this._titleEl,
              this._badgeEl
            ),
            this._tagEl
          )
        )
      ),
      h('div.ext-header-center',
        this._progressWrap
      ),
      h('div.ext-header-right',
        this._cancelBtn,
        this._addTimelineBtn,
        this._reloadBtn
      )
    );

    // Frame container
    this._frameContainer = h('div.ext-workspace-frame-container');
    this._iframe = null;

    // Full workspace container
    this.el = h('section.extension-workspace', {
      role: 'region',
      'aria-label': 'Extension Workspace',
      hidden: true,
      tabindex: '-1',
    },
      this._header,
      this._frameContainer
    );

    // Bound message handler
    this._onMessage = (e) => this._handleMessage(e);
    this._onKeyDown = (e) => {
      if (this._isOpen && e.key === 'Escape' && !this._isExporting) {
        e.preventDefault();
        this.close();
      }
    };
  }

  get isOpen() {
    return this._isOpen;
  }

  /**
   * Open an extension in the full-screen workspace
   * @param {Object} extensionDef 
   */
  open(extensionDef) {
    if (!extensionDef) return;
    this._currentExt = extensionDef;
    this._isOpen = true;

    // Update header details
    this._titleEl.textContent = extensionDef.name;
    this._badgeEl.textContent = `v${extensionDef.version || '1.0'}`;
    this._tagEl.textContent = extensionDef.description || 'Extension Application';
    this._iconWrap.replaceChildren(icon(extensionDef.icon || 'blocks', 18));

    const canExport = extensionDef.capabilities?.includes('export-video') ?? true;
    this._addTimelineBtn.hidden = !canExport;

    // Reset progress
    this._hideProgress();

    // Mount iframe
    this._mountIframe(extensionDef.entry);

    // Reveal workspace
    this.el.hidden = false;
    window.addEventListener('message', this._onMessage);
    window.addEventListener('keydown', this._onKeyDown);

    announce(`Opened ${extensionDef.name} extension workspace`);
  }

  /**
   * Close the extension workspace and return to the main interface
   */
  close() {
    if (!this._isOpen) return;
    this._isOpen = false;
    this.el.hidden = true;

    window.removeEventListener('message', this._onMessage);
    window.removeEventListener('keydown', this._onKeyDown);

    // Clean up iframe to free GPU and memory resources
    this._clearIframe();

    announce('Returned to video editor');
    this.onReturn();
  }

  _mountIframe(entryUrl) {
    this._clearIframe();

    const iframe = h('iframe.ext-workspace-iframe', {
      src: entryUrl,
      title: this._currentExt?.name || 'Extension',
      allow: 'clipboard-read; clipboard-write; fullscreen',
      // Sandbox with necessary permissions for standard web apps
      sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads',
    });

    this._iframe = iframe;
    this._frameContainer.replaceChildren(iframe);
  }

  _clearIframe() {
    if (this._iframe) {
      try {
        this._iframe.src = 'about:blank';
      } catch (_) {}
      this._iframe.remove();
      this._iframe = null;
    }
    this._frameContainer.replaceChildren();
  }

  _reloadIframe() {
    if (this._currentExt) {
      this._mountIframe(this._currentExt.entry);
      toast(`Reloaded ${this._currentExt.name}`, { kind: 'info', duration: 2000 });
    }
  }

  /** Handle postMessage communication from the extension */
  async _handleMessage(event) {
    // Only process messages with a valid object type
    const data = event.data;
    if (!data || typeof data !== 'object' || !data.type) return;

    // Verify source is our mounted iframe
    if (this._iframe && event.source !== this._iframe.contentWindow) {
      return;
    }

    switch (data.type) {
      case 'VS_EXT_READY':
        this._sendInitContext();
        break;

      case 'VS_EXT_PROGRESS':
        this._showProgress(data.payload?.progress || 0, data.payload?.statusText || '');
        break;

      case 'VS_EXT_ADD_TO_TIMELINE':
        await this._handleAddToTimeline(data.payload);
        break;

      case 'VS_EXT_CLOSE':
        this.close();
        break;

      case 'VS_EXT_TOAST':
        if (data.payload?.message) {
          toast(data.payload.message, { kind: data.payload.kind || 'info' });
        }
        break;

      default:
        break;
    }
  }

  /** Send current project environment and settings to extension */
  _sendInitContext() {
    if (!this._iframe || !this._iframe.contentWindow) return;

    const { store } = this.ctx;
    const settings = store.project?.settings || {};

    const contextPayload = {
      project: {
        name: store.project?.name || 'Untitled Project',
        width: settings.width || 1920,
        height: settings.height || 1080,
        fps: settings.fps || 30,
        time: store.time || 0,
      },
      theme: getTheme?.() || 'dark',
      extensionId: this._currentExt?.id,
    };

    this._postToIframe({
      type: 'VS_EXT_INIT',
      payload: contextPayload,
    });
  }

  _postToIframe(message) {
    if (this._iframe && this._iframe.contentWindow) {
      this._iframe.contentWindow.postMessage(message, '*');
    }
  }

  _showProgress(ratio, text) {
    this._isExporting = true;
    this._progressWrap.hidden = false;
    this._cancelBtn.hidden = false;
    this._addTimelineBtn.disabled = true;

    const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
    this._progressFill.style.width = `${pct}%`;
    this._progressText.textContent = text || `Exporting (${pct}%)...`;
  }

  _hideProgress() {
    this._isExporting = false;
    this._progressWrap.hidden = true;
    this._cancelBtn.hidden = true;
    this._addTimelineBtn.disabled = false;
    this._progressFill.style.width = '0%';
    this._progressText.textContent = '';
  }

  _triggerExport() {
    if (this._isExporting) return;
    this._showProgress(0, 'Preparing export...');
    this._postToIframe({ type: 'VS_EXT_TRIGGER_EXPORT' });
  }

  _cancelExport() {
    this._postToIframe({ type: 'VS_EXT_CANCEL_EXPORT' });
    this._hideProgress();
    toast('Export cancelled', { kind: 'info' });
  }

  /**
   * Import exported video from extension into the project's media library
   * and place it on the timeline as a normal video clip.
   */
  async _handleAddToTimeline(payload) {
    if (!payload || !payload.blob) {
      toast('Invalid export received from extension.', { kind: 'error' });
      this._postToIframe({ type: 'VS_EXT_EXPORT_ERROR', error: 'No video blob provided' });
      this._hideProgress();
      return;
    }

    try {
      this._showProgress(0.9, 'Importing clip into timeline...');

      const defaultName = `${this._currentExt?.name || 'Extension'} Export.webm`;
      const fileName = payload.name || defaultName;
      const mimeType = payload.mimeType || payload.blob.type || 'video/webm';

      // Create a valid File object from the Blob
      const videoFile = payload.blob instanceof File
        ? payload.blob
        : new File([payload.blob], fileName, { type: mimeType });

      // Use the standard application import mechanism:
      // imports file to project media library and adds it as a regular video clip to the timeline!
      const assets = await this.ctx.actions.importFiles([videoFile], {
        addToTimeline: true,
        origin: `extension:${this._currentExt?.id || 'unknown'}`,
      });

      if (!assets || !assets.length) {
        throw new Error('Could not import exported video into project library.');
      }

      const importedAsset = assets[0];

      // Acknowledge success to the extension
      this._postToIframe({
        type: 'VS_EXT_EXPORT_SUCCESS',
        payload: {
          assetId: importedAsset.id,
          name: importedAsset.name,
          duration: importedAsset.duration,
          width: importedAsset.width,
          height: importedAsset.height,
        },
      });

      this._hideProgress();
      toast(`Added "${importedAsset.name}" to timeline!`, { kind: 'success', duration: 5000 });
      announce(`Added ${importedAsset.name} to timeline`);
    } catch (err) {
      console.error('[Extension Workspace Export Error]', err);
      this._hideProgress();
      this._postToIframe({
        type: 'VS_EXT_EXPORT_ERROR',
        error: err.message || 'Timeline insertion failed',
      });
      toast(`Export failed: ${err.message || 'Unknown error'}`, { kind: 'error', duration: 6000 });
    }
  }

  dispose() {
    this.close();
    this.el.remove();
  }
}
