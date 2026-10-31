/**
 * Extensions Tab: Displays available extensions that run as independent web
 * applications in their own sandboxed full-screen workspaces.
 */

import { h } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { extensionRegistry, EXTENSION_CATEGORIES } from '../../extensions/registry.js';
import { tabLayout, emptyState } from './common.js';
import '../../styles/extensions.css';

export function extensionsTab(ctx) {
  function openExt(ext) {
    if (ctx.editor?.openExtension) {
      ctx.editor.openExtension(ext.id);
    } else {
      console.warn('Editor workspace openExtension not available', ext);
    }
  }

  function renderExtensionCard(ext) {
    const iconNode = icon(ext.icon || 'blocks', 22);
    const badgeEl = ext.badge ? h('span.ext-card-badge', ext.badge) : null;
    const versionEl = h('span.ext-card-version', `v${ext.version || '1.0'}`);

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
            badgeEl
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

  const layout = tabLayout({
    title: 'Extensions',
    id: 'extensions',
    categories: EXTENSION_CATEGORIES,
    search: true,
    searchLabel: 'Search extensions...',
    render(cat, q) {
      const list = extensionRegistry.filter({ category: cat, query: q });

      if (!list.length) {
        return emptyState('blocks', 'No extensions found', 'Try searching for another term or select another category.');
      }

      return h('div.ext-grid-container',
        h('div.ext-grid', { role: 'list', 'aria-label': 'Extensions' },
          list.map((ext) => h('div.ext-grid-item', { role: 'listitem' }, renderExtensionCard(ext)))
        ),
        h('div.ext-help-box',
          icon('info', 16),
          h('div.ext-help-content',
            h('strong', 'Independent Extensions Architecture'),
            h('p', 'Each extension runs in its own isolated folder with its own HTML, CSS, and JavaScript. Extensions open in a full-screen workspace with direct video export to your timeline.')
          )
        )
      );
    },
  });

  return {
    el: layout.el,
    show: () => layout.refresh?.(),
    dispose: () => layout.dispose?.(),
  };
}
