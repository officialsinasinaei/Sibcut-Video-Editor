'use strict';

import { h } from '../lib/dom.js';
import { icon, appIcon } from '../lib/icons.js';
import { openDialog } from './dialog.js';
import {
  APP_NAME,
  APP_VERSION,
  APP_DESCRIPTION,
  CREATOR_NAME,
  CREATOR_EMAIL,
  ORIGINAL_PROJECT_NAME,
  ORIGINAL_PROJECT_AUTHOR,
  ORIGINAL_PROJECT_URL,
  COPYRIGHT_NOTICE,
} from '../lib/version.js';

/**
 * Open the Open-Source Licenses & Acknowledgements modal dialog.
 */
export function openLicensesDialog() {
  const content = h('div.licenses-dialog-body',
    h('div.license-block',
      h('h3.license-heading', 'Original Project: Everything (HeyPuter)'),
      h('p.license-sub', 'Sibcut Video Editor is based on the Everything project created by HeyPuter.'),
      h('p.license-meta', 'License: MIT License · ',
        h('a.license-url', {
          href: ORIGINAL_PROJECT_URL,
          target: '_blank',
          rel: 'noopener noreferrer',
        }, 'github.com/HeyPuter/everything')
      ),
      h('pre.license-text', `Copyright (c) 2024 HeyPuter

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`)
    ),
    h('div.license-block',
      h('h3.license-heading', 'Sibcut Video Editor Application License'),
      h('p.license-sub', `${APP_NAME} — Created by ${CREATOR_NAME}`),
      h('p.license-meta', 'License: GNU General Public License v3.0 (GPL-3.0)'),
      h('pre.license-text', `Copyright (C) 2026 ${CREATOR_NAME}

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.`)
    ),
    h('div.license-block',
      h('h3.license-heading', 'Third-Party Components & Libraries'),
      h('ul.license-list',
        h('li', h('strong', '@mediapipe/tasks-vision'), ' (Apache-2.0) — Machine learning vision models'),
        h('li', h('strong', 'onnxruntime-web'), ' (MIT) — Accelerated web machine learning runtime'),
        h('li', h('strong', 'mediabunny'), ' (MIT) — Video muxing & container utilities'),
        h('li', h('strong', 'koffi'), ' (MIT) — Fast Node.js native C FFI'),
        h('li', h('strong', 'lucide'), ' (ISC) — Vector glyph icons'),
        h('li', h('strong', 'yauzl'), ' (MIT) — ZIP extraction engine'),
        h('li', h('strong', 'libvosk / Vosk API'), ' (Apache-2.0) — Speech recognition engine'),
        h('li', h('strong', 'Google & Persian Fonts'), ' (OFL-1.1 / Apache-2.0) — Typography resources')
      )
    )
  );

  const closeBtn = h('button.btn.primary', { type: 'button' }, 'Close');
  const d = openDialog({
    title: 'Open-Source Licenses & Acknowledgements',
    body: content,
    actions: [closeBtn],
    wide: true,
    className: 'licenses-modal',
  });
  closeBtn.addEventListener('click', () => d.close());
  return d;
}

/**
 * Open the dedicated, professional About Sibcut Video Editor dialog.
 */
export function openAboutDialog() {
  const versionText = `Version ${APP_VERSION}`;

  // External link click helper using safe target=_blank handling
  const createExternalLink = (url, text, iconName = 'externalLink') => {
    const a = h('a.about-link', {
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
    }, text, iconName ? h('span.about-link-icon', icon(iconName, 12)) : null);
    a.addEventListener('click', (e) => {
      // In Electron environment, window.open triggers setWindowOpenHandler
      if (typeof window !== 'undefined' && window.open) {
        e.preventDefault();
        window.open(url, '_blank');
      }
    });
    return a;
  };

  const emailLink = h('a.about-link', {
    href: `mailto:${CREATOR_EMAIL}`,
  }, CREATOR_EMAIL, h('span.about-link-icon', icon('mail', 12)));
  emailLink.addEventListener('click', (e) => {
    if (typeof window !== 'undefined' && window.open) {
      e.preventDefault();
      window.open(`mailto:${CREATOR_EMAIL}`, '_blank');
    }
  });

  const licensesBtn = h('button.btn.small.about-licenses-btn', { type: 'button' },
    icon('bookOpen', 14),
    'Open-source licenses'
  );

  const body = h('div.about-container',
    // Header with app icon and title
    h('div.about-header',
      h('div.about-logo-frame', appIcon(64, 'about-app-icon')),
      h('div.about-header-text',
        h('h2.about-app-title', APP_NAME),
        h('div.about-version-badge', versionText),
        h('p.about-tagline', APP_DESCRIPTION)
      )
    ),

    h('div.about-divider'),

    // Creator Attribution
    h('div.about-section',
      h('span.about-section-label', 'Created by'),
      h('div.about-section-value',
        h('strong.about-creator-name', CREATOR_NAME),
        h('div.about-contact-row',
          h('span.about-contact-label', 'Contact:'),
          emailLink
        )
      )
    ),

    h('div.about-divider'),

    // Original Project Attribution
    h('div.about-section',
      h('span.about-section-label', 'Based on'),
      h('div.about-section-value',
        h('p.about-original-attribution', `Based on the ${ORIGINAL_PROJECT_NAME} project by ${ORIGINAL_PROJECT_AUTHOR}.`),
        h('div.about-github-row',
          h('span.about-contact-label', 'GitHub:'),
          createExternalLink(ORIGINAL_PROJECT_URL, 'github.com/HeyPuter/everything')
        )
      )
    ),

    h('div.about-divider'),

    // Open Source & Copyright Footer
    h('div.about-footer-section',
      h('div.about-licenses-row', licensesBtn),
      h('div.about-copyright', COPYRIGHT_NOTICE)
    )
  );

  licensesBtn.addEventListener('click', () => {
    openLicensesDialog();
  });

  const closeBtn = h('button.btn.primary', { type: 'button' }, 'Close');
  const d = openDialog({
    title: `About ${APP_NAME}`,
    body,
    actions: [h('span.spacer'), closeBtn],
    className: 'about-dialog-custom small',
  });

  closeBtn.addEventListener('click', () => d.close());
  return d;
}
