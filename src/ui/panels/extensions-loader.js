/**
 * Custom Extension Loader Dialog
 * Enables developers and users to load custom extensions from a local folder
 * or connect directly to a live development server (e.g. Vite / Webpack / live-server).
 */

import { h } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { openDialog, toast } from '../dialog.js';
import { extensionRegistry } from '../../extensions/registry.js';

export function openLoadExtensionDialog(ctx, { onLoaded } = {}) {
  let activeTab = 'folder'; // 'folder' | 'url'
  let selectedFiles = [];
  let detectedManifest = null;
  let entryFile = null;

  // DOM elements
  const tabFolderBtn = h('button.ext-loader-tab-btn.active', { type: 'button' },
    icon('folder', 14),
    h('span', 'Local Folder / Package')
  );

  const tabUrlBtn = h('button.ext-loader-tab-btn', { type: 'button' },
    icon('wand', 14),
    h('span', 'Live Dev Server URL')
  );

  const folderSection = h('div.ext-loader-section');
  const urlSection = h('div.ext-loader-section', { hidden: true });

  // Tab switching
  tabFolderBtn.addEventListener('click', () => {
    activeTab = 'folder';
    tabFolderBtn.classList.add('active');
    tabUrlBtn.classList.remove('active');
    folderSection.hidden = false;
    urlSection.hidden = true;
  });

  tabUrlBtn.addEventListener('click', () => {
    activeTab = 'url';
    tabUrlBtn.classList.add('active');
    tabFolderBtn.classList.remove('active');
    urlSection.hidden = false;
    folderSection.hidden = true;
  });

  // --- TAB 1: LOCAL FOLDER IMPLEMENTATION ---
  const folderInput = h('input', {
    type: 'file',
    webkitdirectory: '',
    directory: '',
    multiple: '',
    style: { display: 'none' },
  });

  const filesInput = h('input', {
    type: 'file',
    accept: '.html,.json,.js,.css,.png,.jpg,.svg,.woff2',
    multiple: '',
    style: { display: 'none' },
  });

  const dropZone = h('div.ext-loader-dropzone', { tabindex: '0', role: 'button', 'aria-label': 'Select extension folder' },
    icon('folderUp', 36),
    h('strong.ext-dropzone-title', 'Choose Extension Folder'),
    h('p.ext-dropzone-sub', 'Select a folder containing index.html, style.css, script.js, and manifest.json'),
    h('div.ext-dropzone-actions',
      h('button.btn.small.primary.ext-browse-folder-btn', { type: 'button' }, icon('folder', 14), 'Browse Folder...'),
      h('button.btn.small.ext-browse-files-btn', { type: 'button' }, icon('script', 14), 'Select Files...')
    )
  );

  const fileStatusEl = h('div.ext-loader-file-status', { hidden: true });

  // Form fields for folder metadata
  const nameInput = h('input.input', { type: 'text', placeholder: 'e.g. My Custom Extension' });
  const descInput = h('textarea.input', { placeholder: 'Description of what this extension does...', rows: '2' });
  const categorySelect = h('select.input',
    h('option', { value: 'titles' }, 'Text & Titles'),
    h('option', { value: 'graphics' }, 'Overlays & Graphics'),
    h('option', { value: 'fx' }, 'Visual Effects'),
    h('option', { value: 'tools', selected: true }, 'Tools & Utilities')
  );
  const versionInput = h('input.input', { type: 'text', value: '1.0.0', placeholder: '1.0.0' });

  const metadataForm = h('div.ext-loader-meta-form', { hidden: true },
    h('div.field', h('label.field-label', 'Extension Name'), nameInput),
    h('div.field-row',
      h('div.field', h('label.field-label', 'Category'), categorySelect),
      h('div.field', h('label.field-label', 'Version'), versionInput)
    ),
    h('div.field', h('label.field-label', 'Description'), descInput)
  );

  // File selection triggers
  dropZone.addEventListener('click', (e) => {
    if (e.target.closest('.ext-browse-files-btn')) {
      filesInput.click();
    } else {
      folderInput.click();
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer?.files?.length) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  });

  folderInput.addEventListener('change', () => {
    if (folderInput.files?.length) {
      handleFiles(Array.from(folderInput.files));
    }
  });

  filesInput.addEventListener('change', () => {
    if (filesInput.files?.length) {
      handleFiles(Array.from(filesInput.files));
    }
  });

  async function handleFiles(files) {
    if (!files || !files.length) return;
    selectedFiles = files;

    // Look for manifest.json and index.html
    const manifestFile = files.find((f) => f.name.toLowerCase() === 'manifest.json');
    entryFile = files.find((f) => f.name.toLowerCase() === 'index.html' || f.name.toLowerCase().endsWith('.html'));

    if (!entryFile) {
      fileStatusEl.hidden = false;
      fileStatusEl.className = 'ext-loader-file-status error';
      fileStatusEl.textContent = 'Error: No index.html file found in the selected files.';
      metadataForm.hidden = true;
      return;
    }

    let manifest = null;
    if (manifestFile) {
      try {
        const text = await manifestFile.text();
        manifest = JSON.parse(text);
        detectedManifest = manifest;
      } catch (err) {
        console.warn('Could not parse manifest.json:', err);
      }
    }

    // Prepopulate metadata
    const folderName = files[0].webkitRelativePath
      ? files[0].webkitRelativePath.split('/')[0]
      : 'Custom Extension';

    nameInput.value = manifest?.name || folderName || 'Custom Extension';
    descInput.value = manifest?.description || 'Loaded custom extension';
    if (manifest?.category) {
      categorySelect.value = manifest.category;
    }
    versionInput.value = manifest?.version || '1.0.0';

    fileStatusEl.hidden = false;
    fileStatusEl.className = 'ext-loader-file-status success';
    fileStatusEl.innerHTML = '';
    fileStatusEl.append(
      icon('check', 16),
      h('span', `Detected ${files.length} file(s). Entry point: ${entryFile.name} ${manifest ? '(with manifest.json)' : ''}`)
    );

    metadataForm.hidden = false;
    confirmBtn.disabled = false;
  }

  folderSection.append(
    folderInput,
    filesInput,
    dropZone,
    fileStatusEl,
    metadataForm
  );

  // --- TAB 2: LIVE DEV SERVER URL IMPLEMENTATION ---
  const urlInput = h('input.input', {
    type: 'url',
    placeholder: 'http://localhost:5173 or http://127.0.0.1:8080',
    value: 'http://localhost:5173',
  });
  const urlNameInput = h('input.input', { type: 'text', placeholder: 'e.g. My Dev Extension', value: 'Dev Extension' });
  const urlCategorySelect = h('select.input',
    h('option', { value: 'titles' }, 'Text & Titles'),
    h('option', { value: 'graphics' }, 'Overlays & Graphics'),
    h('option', { value: 'fx' }, 'Visual Effects'),
    h('option', { value: 'tools', selected: true }, 'Tools & Utilities')
  );
  const urlDescInput = h('textarea.input', {
    placeholder: 'Live development extension with hot reloading',
    rows: '2',
    value: 'Live development extension with hot reloading',
  });

  urlSection.append(
    h('div.ext-loader-url-info',
      icon('info', 16),
      h('p', 'Connect to a local development server (such as Vite, Webpack, or Python http.server) with live hot module replacement.')
    ),
    h('div.field', h('label.field-label', 'Development Server URL'), urlInput),
    h('div.field-row',
      h('div.field', h('label.field-label', 'Extension Name'), urlNameInput),
      h('div.field', h('label.field-label', 'Category'), urlCategorySelect)
    ),
    h('div.field', h('label.field-label', 'Description'), urlDescInput)
  );

  // Modal body
  const body = h('div.ext-loader-body',
    h('nav.ext-loader-tabs', tabFolderBtn, tabUrlBtn),
    folderSection,
    urlSection
  );

  const confirmBtn = h('button.btn.primary.ext-loader-confirm-btn', { type: 'button' },
    icon('folderUp', 14),
    h('span', 'Load & Register')
  );

  const cancelBtn = h('button.btn', { type: 'button' }, 'Cancel');

  const dialog = openDialog({
    title: 'Load Custom Extension',
    body,
    actions: [cancelBtn, confirmBtn],
    wide: true,
  });

  cancelBtn.addEventListener('click', () => dialog.close());

  confirmBtn.addEventListener('click', async () => {
    try {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Loading...';

      if (activeTab === 'folder') {
        if (!entryFile) {
          toast('Please select an extension folder with index.html', { kind: 'error' });
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Load & Register';
          return;
        }

        // Build virtual asset mapping
        const assetMap = new Map();
        for (const file of selectedFiles) {
          const blobUrl = URL.createObjectURL(file);
          // Key by relative path and simple filename
          const simpleName = file.name;
          const relPath = file.webkitRelativePath
            ? file.webkitRelativePath.split('/').slice(1).join('/')
            : file.name;

          assetMap.set(simpleName, blobUrl);
          if (relPath) assetMap.set(relPath, blobUrl);
          assetMap.set(`./${simpleName}`, blobUrl);
          if (relPath) assetMap.set(`./${relPath}`, blobUrl);
        }

        // Read entry HTML
        let html = await entryFile.text();

        // Rewrite relative link and script tags to blob URLs
        for (const [key, blobUrl] of assetMap) {
          if (key === entryFile.name) continue;
          // Escape key for RegExp
          const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          html = html.replace(new RegExp(`(src|href)=["'](\\./)?${escaped}["']`, 'g'), `$1="${blobUrl}"`);
        }

        // Ensure SDK script tag resolves
        // Map common relative SDK paths to the hosted sdk if not provided
        const sdkBlobUrl = assetMap.get('extension-sdk.js') || 'extensions/shared/extension-sdk.js';
        html = html.replace(/src=["'][^"']*extension-sdk\.js["']/g, `src="${sdkBlobUrl}"`);

        // If the HTML does not contain extension-sdk.js at all, inject it before </head> or <body>
        if (!html.includes('extension-sdk.js')) {
          const scriptTag = `<script src="${sdkBlobUrl}"></script>`;
          if (html.includes('</head>')) {
            html = html.replace('</head>', `${scriptTag}\n</head>`);
          } else if (html.includes('<body')) {
            html = html.replace('<body', `${scriptTag}\n<body`);
          } else {
            html = `${scriptTag}\n${html}`;
          }
        }

        const mainBlob = new Blob([html], { type: 'text/html' });
        const entryUrl = URL.createObjectURL(mainBlob);

        const extId = detectedManifest?.id || `custom-${Date.now()}`;
        const extName = nameInput.value.trim() || 'Custom Extension';
        const newExt = {
          id: extId,
          name: extName,
          version: versionInput.value.trim() || '1.0.0',
          author: detectedManifest?.author || 'Local Developer',
          category: categorySelect.value || 'tools',
          description: descInput.value.trim() || 'Custom loaded extension',
          icon: detectedManifest?.icon || 'puzzle',
          badge: 'Custom',
          accentColor: detectedManifest?.accentColor || '#10b981',
          entry: entryUrl,
          isCustom: true,
          capabilities: detectedManifest?.capabilities || ['export-video', 'export-transparent'],
        };

        extensionRegistry.register(newExt);
        toast(`Extension "${extName}" successfully loaded!`, { kind: 'success' });
        dialog.close(newExt);
        onLoaded?.(newExt);

      } else {
        // Dev Server URL mode
        const url = urlInput.value.trim();
        if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
          toast('Please enter a valid URL starting with http:// or https://', { kind: 'error' });
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Load & Register';
          return;
        }

        const extName = urlNameInput.value.trim() || 'Dev Extension';
        const extId = `dev-${Date.now()}`;
        const newExt = {
          id: extId,
          name: extName,
          version: 'dev',
          author: 'Local Server',
          category: urlCategorySelect.value || 'tools',
          description: urlDescInput.value.trim() || `Live development extension (${url})`,
          icon: 'code',
          badge: 'Live Dev',
          accentColor: '#f59e0b',
          entry: url,
          isCustom: true,
          capabilities: ['export-video', 'export-transparent'],
        };

        extensionRegistry.register(newExt);
        toast(`Dev extension "${extName}" connected!`, { kind: 'success' });
        dialog.close(newExt);
        onLoaded?.(newExt);
      }

    } catch (err) {
      console.error('Error loading extension:', err);
      toast(`Failed to load extension: ${err.message}`, { kind: 'error' });
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Load & Register';
    }
  });
}
