/**
 * Extensions Tab: Displays available extensions that run as independent web
 * applications in their own sandboxed full-screen workspaces.
 * Includes Developer Guide & Tutorial and Load Extension capability.
 */

import { h } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { extensionRegistry, EXTENSION_CATEGORIES } from '../../extensions/registry.js';
import { tabLayout, emptyState } from './common.js';
import { renderDeveloperGuide, copyDeveloperGuide } from './extensions-guide.js';
import { openLoadExtensionDialog } from './extensions-loader.js';
import '../../styles/extensions.css';

export function extensionsTab(ctx) {
  function openExt(ext) {
    if (ctx.editor?.openExtension) {
      ctx.editor.openExtension(ext.id);
    } else {
      console.warn('Editor workspace openExtension not available', ext);
    }
  }

  function openLoader() {
    openLoadExtensionDialog(ctx, {
      onLoaded: (newExt) => {
        layout.refresh?.();
      },
    });
  }

  function renderExtensionCard(ext) {
    const iconNode = icon(ext.icon || 'blocks', 22);
    const badgeEl = ext.badge ? h('span.ext-card-badge', ext.badge) : null;
    const versionEl = h('span.ext-card-version', `v${ext.version || '1.0'}`);

    // If custom extension, allow removing it
    let removeBtn = null;
    if (ext.isCustom) {
      removeBtn = h('button.icon-btn.small.ext-card-remove-btn', {
        type: 'button',
        'aria-label': `Remove ${ext.name}`,
        title: 'Remove loaded extension',
      }, icon('close', 12));

      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        extensionRegistry.unregister(ext.id);
        layout.refresh?.();
      });
    }

    const card = h('article.ext-card', {
      tabindex: '0',
      role: 'button',
      'aria-label': `Open extension ${ext.name}`,
    },
      h('div.ext-card-header',
        h('div.ext-card-icon-wrap', { style: { '--ext-accent': ext.accentColor || 'var(--accent)' } }, iconNode),
        h('div.ext-card-meta',
          h('div.ext-card-title-row',
            h('h3.ext-card-title', ext.name),
            badgeEl,
            removeBtn
          ),
          h('span.ext-card-author', ext.author || 'Video Studio')
        )
      ),
      h('p.ext-card-desc', ext.description),
      h('div.ext-card-footer',
        h('div.ext-card-tags',
          versionEl,
          h('span.ext-card-category', ext.category)
        ),
        h('button.btn.small.primary.ext-open-btn', {
          type: 'button',
          'aria-label': `Launch ${ext.name}`,
        },
          icon('fullscreen', 14),
          h('span', 'Open')
        )
      )
    );

    // Clicking either the card or the button launches the extension workspace
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      openExt(ext);
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openExt(ext);
      }
    });

    return card;
  }

  // Toolbar actions (Load Extension and Developer Guide)
  const loadBtn = h('button.btn.small.primary.ext-toolbar-load-btn', {
    type: 'button',
    'aria-label': 'Load extension from folder or URL',
    title: 'Load custom extension',
  },
    icon('folderUp', 14),
    h('span', 'Load Extension')
  );
  loadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openLoader();
  });

  const guideBtn = h('button.btn.small.ext-toolbar-guide-btn', {
    type: 'button',
    'aria-label': 'View extension developer guide and tutorial',
    title: 'Developer Guide & Tutorial',
  },
    icon('bookOpen', 14),
    h('span', 'Developer Guide')
  );
  guideBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    layout.select('guide');
  });

  const copyGuideBtn = h('button.btn.small.ext-toolbar-copy-btn', {
    type: 'button',
    'aria-label': 'Copy full extension developer guide for AI chatbot prompt context',
    title: 'Copy Guide for AI Context (ChatGPT, Claude, etc.)',
  },
    icon('copy', 14),
    h('span', 'Copy Guide')
  );
  copyGuideBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyDeveloperGuide(copyGuideBtn);
  });

  const toolbar = h('div.ext-toolbar-actions', loadBtn, guideBtn, copyGuideBtn);

  const layout = tabLayout({
    title: 'Extensions',
    id: 'extensions',
    categories: EXTENSION_CATEGORIES,
    toolbar,
    search: true,
    searchLabel: 'Search extensions...',
    render(cat, q) {
      // 1. If Developer Guide category is selected, render the full developer documentation
      if (cat === 'guide') {
        return renderDeveloperGuide({
          onBack: () => layout.select('all'),
          onOpenLoader: () => openLoader(),
        });
      }

      // 2. Otherwise render the extension cards grid
      const list = extensionRegistry.filter({ category: cat, query: q });

      if (!list.length) {
        return h('div.ext-empty-wrap',
          emptyState('blocks', 'No extensions found', 'Try searching for another term, select another category, or load a custom extension.'),
          h('div.ext-empty-actions',
            h('button.btn.primary', {
              type: 'button',
              onclick: () => openLoader(),
            }, icon('folderUp', 14), 'Load Extension'),
            h('button.btn', {
              type: 'button',
              onclick: () => layout.select('guide'),
            }, icon('bookOpen', 14), 'Developer Guide')
          )
        );
      }

      const helpGuideBtn = h('button.btn.small.ext-help-guide-btn', {
        type: 'button',
      }, icon('bookOpen', 14), h('span', 'Read Guide & Tutorial'));
      helpGuideBtn.addEventListener('click', () => layout.select('guide'));

      const helpLoadBtn = h('button.btn.small.primary.ext-help-load-btn', {
        type: 'button',
      }, icon('folderUp', 14), h('span', 'Load Extension'));
      helpLoadBtn.addEventListener('click', () => openLoader());

      return h('div.ext-grid-container',
        h('div.ext-grid', { role: 'list', 'aria-label': 'Extensions' },
          list.map((ext) => h('div.ext-grid-item', { role: 'listitem' }, renderExtensionCard(ext)))
        ),
        h('div.ext-help-box',
          icon('bookOpen', 20),
          h('div.ext-help-content',
            h('strong', 'Independent Extensions Architecture & Tutorial'),
            h('p', 'Each extension runs in its own isolated folder with its own HTML, CSS, and JavaScript. Extensions open in a full-screen workspace with direct video export to your timeline.')
          ),
          h('div.ext-help-actions',
            helpGuideBtn,
            helpLoadBtn
          )
        )
      );
    },
  });

  // Subscribe to registry changes (custom extensions loaded or removed)
  const unsubscribeRegistry = extensionRegistry.subscribe(() => {
    layout.refresh?.();
  });

  return {
    el: layout.el,
    show: () => layout.refresh?.(),
    openLoader,
    openGuide: () => layout.select('guide'),
    dispose: () => {
      unsubscribeRegistry();
      layout.dispose?.();
    },
  };
}
