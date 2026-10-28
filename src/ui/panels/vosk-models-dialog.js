/**
 * Language Models Manager Dialog (Vosk Offline STT)
 *
 * Provides a user-friendly interface to search, download, import,
 * and manage offline Vosk models directly from https://alphacephei.com/vosk/models.
 */

import { h } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { openDialog, toast } from '../dialog.js';
import {
  listVoskModels,
  downloadVoskModel,
  cancelVoskDownload,
  selectAndImportModel,
  deleteVoskModel,
} from '../../media/vosk.js';

// Language flag/code mapping for friendly visual indicators
const LANG_EMOJIS = {
  fa: '🇮🇷',
  en: '🇺🇸',
  'en-us': '🇺🇸',
  'en-in': '🇮🇳',
  ar: '🇸🇦',
  'ar-tn': '🇹🇳',
  es: '🇪🇸',
  fr: '🇫🇷',
  de: '🇩🇪',
  it: '🇮🇹',
  pt: '🇧🇷',
  ru: '🇷🇺',
  tr: '🇹🇷',
  uk: '🇺🇦',
  hi: '🇮🇳',
  zh: '🇨🇳',
  ja: '🇯🇵',
  ko: '🇰🇷',
  nl: '🇳🇱',
  sv: '🇸🇪',
  pl: '🇵🇱',
  vi: '🇻🇳',
  id: '🇮🇩',
  th: '🇹🇭',
  el: '🇬🇷',
  he: '🇮🇱',
  ur: '🇵🇰',
  tg: '🇹🇯',
  uz: '🇺🇿',
  kk: '🇰🇿',
};


const SEARCH_ALIASES = {
  persian: ['fa', 'farsi', 'iran'],
  farsi: ['fa', 'persian', 'iran'],
  spanish: ['es', 'espanol', 'español'],
  french: ['fr', 'francais', 'français'],
  german: ['de', 'deutsch'],
  russian: ['ru'],
  arabic: ['ar'],
  chinese: ['zh'],
  japanese: ['ja'],
  korean: ['ko'],
  turkish: ['tr'],
  hindi: ['hi'],
  italian: ['it'],
  portuguese: ['pt'],
  ukrainian: ['uk'],
  dutch: ['nl'],
  swedish: ['sv'],
  polish: ['pl'],
  vietnamese: ['vi'],
  indonesian: ['id'],
};

export function getLangEmoji(lang) {
  if (!lang) return '🌐';
  const l = String(lang).toLowerCase();
  return LANG_EMOJIS[l] || '🌐';
}

/**
 * Open the Model Manager Dialog
 *
 * @param {Object} ctx - Video studio context
 * @param {Object} options
 * @param {string} options.activeModelId - Currently selected model ID
 * @param {Function} options.onSelectModel - Callback when a model is selected
 */
export async function openVoskModelManager(ctx, { activeModelId = null, onSelectModel = null } = {}) {
  let modelsData = { installed: [], available: [] };
  let filterQuery = '';
  let activeTab = 'all'; // 'all' | 'installed' | 'small' | 'big'
  const downloadingModels = new Map(); // name -> { percent, speedText, status }

  const searchInput = h('input.vosk-search-input', {
    type: 'search',
    placeholder: 'Search language (e.g. Persian, English, Arabic, Spanish)...',
    'aria-label': 'Search models',
  });

  const tabAll = h('button.vosk-filter-tab.active', { type: 'button' }, 'All Models');
  const tabInstalled = h('button.vosk-filter-tab', { type: 'button' }, 'Installed');
  const tabSmall = h('button.vosk-filter-tab', { type: 'button' }, 'Small (Fast)');
  const tabBig = h('button.vosk-filter-tab', { type: 'button' }, 'High Accuracy');

  const filterTabs = [
    { el: tabAll, id: 'all' },
    { el: tabInstalled, id: 'installed' },
    { el: tabSmall, id: 'small' },
    { el: tabBig, id: 'big' },
  ];

  filterTabs.forEach(({ el, id }) => {
    el.addEventListener('click', () => {
      filterTabs.forEach((t) => t.el.classList.remove('active'));
      el.classList.add('active');
      activeTab = id;
      renderModelList();
    });
  });

  const importBtn = h('button.btn.small', { type: 'button' }, icon('folder', 14), 'Import .zip');
  importBtn.title = 'Import a downloaded .zip model from your computer';
  importBtn.addEventListener('click', async () => {
    try {
      importBtn.disabled = true;
      toast('Selecting model zip file...', { kind: 'info' });
      const imported = await selectAndImportModel();
      if (imported) {
        toast(`Imported model: ${imported.name}`, { kind: 'success' });
        await reloadData(false);
        if (onSelectModel) onSelectModel(imported);
      }
    } catch (err) {
      console.error(err);
      toast(err.message || 'Failed to import model', { kind: 'error' });
    } finally {
      importBtn.disabled = false;
    }
  });

  const refreshBtn = h('button.btn.small.ghost', { type: 'button', 'aria-label': 'Refresh catalog' }, icon('refresh', 14));
  refreshBtn.title = 'Refresh model list from Alphacephei';
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    try {
      await reloadData(true);
      toast('Model catalog updated', { kind: 'info' });
    } finally {
      refreshBtn.disabled = false;
    }
  });

  const listContainer = h('div.vosk-models-list');
  const statusEl = h('div.vosk-status-bar');

  const dialogBody = h(
    'div.vosk-manager-body',
    h('div.vosk-toolbar',
      h('div.vosk-search-wrap', icon('search', 14), searchInput),
      importBtn,
      refreshBtn
    ),
    h('div.vosk-filter-bar', tabAll, tabInstalled, tabSmall, tabBig),
    listContainer,
    statusEl
  );

  const closeBtn = h('button.btn', { type: 'button' }, 'Close');

  const dlg = openDialog({
    title: 'Offline Speech Recognition Models',
    body: dialogBody,
    actions: [closeBtn],
    className: 'medium vosk-dialog',
  });

  closeBtn.addEventListener('click', () => dlg.close());

  searchInput.addEventListener('input', () => {
    filterQuery = searchInput.value.trim().toLowerCase();
    renderModelList();
  });

  async function reloadData(refreshOnline = false) {
    statusEl.textContent = 'Loading models...';
    try {
      modelsData = await listVoskModels(refreshOnline);
      statusEl.textContent = `${modelsData.installed.length} installed • ${modelsData.available.length} available online`;
      renderModelList();
    } catch (err) {
      statusEl.textContent = 'Failed to load models list.';
      console.error(err);
    }
  }

  function getCombinedList() {
    const installedMap = new Map(modelsData.installed.map((m) => [m.id, m]));
    const list = [];

        // Format language name nicely
    const formatLang = (lang, text) => {
      if (lang === 'fa' || text?.toLowerCase() === 'farsi') return 'Persian (Farsi)';
      if (lang === 'en-us') return 'English (US)';
      if (lang === 'en-in') return 'English (India)';
      if (lang === 'ar-tn') return 'Arabic (Tunisian)';
      return text || lang.toUpperCase();
    };

    // First include all installed models
    for (const inst of modelsData.installed) {
      list.push({
        ...inst,
        langText: formatLang(inst.lang, inst.langText),
        isInstalled: true,
        url: modelsData.available.find((a) => a.name === inst.id)?.url || null,
      });
    }

    // Then include catalog models that aren't already listed as installed
    for (const item of modelsData.available) {
      if (!installedMap.has(item.name)) {
        list.push({
          id: item.name,
          name: item.name,
          lang: item.lang,
          langText: formatLang(item.lang, item.lang_text),
          type: item.type?.includes('small') ? 'small' : 'big',
          sizeText: item.size_text,
          url: item.url,
          version: item.version,
          isInstalled: false,
        });
      }
    }

    return list;
  }

  function renderModelList() {
    listContainer.replaceChildren();
    let items = getCombinedList();

    // Filter by query
    if (filterQuery) {
      items = items.filter((m) => {
        const q = filterQuery;
        const aliases = SEARCH_ALIASES[q] || [];
        return (
          m.name.toLowerCase().includes(q) ||
          m.lang.toLowerCase().includes(q) ||
          (m.langText && m.langText.toLowerCase().includes(q)) ||
          aliases.some((a) => m.lang.toLowerCase().includes(a) || (m.langText && m.langText.toLowerCase().includes(a)))
        );
      });
    }

    // Filter by tab
    if (activeTab === 'installed') {
      items = items.filter((m) => m.isInstalled);
    } else if (activeTab === 'small') {
      items = items.filter((m) => m.type === 'small');
    } else if (activeTab === 'big') {
      items = items.filter((m) => m.type !== 'small');
    }

    // Sort: installed first, then small models, then alphabetical by language
    items.sort((a, b) => {
      if (a.isInstalled !== b.isInstalled) return a.isInstalled ? -1 : 1;
      const langA = a.langText || a.lang;
      const langB = b.langText || b.lang;
      return langA.localeCompare(langB);
    });

    if (!items.length) {
      listContainer.append(
        h('div.vosk-empty-list',
          icon('search', 24),
          h('p', filterQuery ? `No models matching "${filterQuery}"` : 'No models in this category.')
        )
      );
      return;
    }

    for (const model of items) {
      const card = renderModelCard(model);
      listContainer.append(card);
    }
  }

  function renderModelCard(model) {
    const emoji = getLangEmoji(model.lang);
    const isDownloading = downloadingModels.has(model.name);
    const dlInfo = downloadingModels.get(model.name);

    const flagEl = h('span.vosk-card-flag', emoji);
    const titleEl = h('div.vosk-card-title',
      h('span.vosk-card-lang', model.langText || model.lang.toUpperCase()),
      h('span.vosk-card-name', model.name)
    );

    const typeBadge = h(
      'span.vosk-badge',
      { dataset: { type: model.type } },
      model.type === 'small' ? '⚡ Small (Fast)' : '🎯 High Accuracy'
    );
    const sizeBadge = h('span.vosk-badge.size', model.sizeText || '');

    const badges = h('div.vosk-card-badges', typeBadge, sizeBadge);
    const leftCol = h('div.vosk-card-left', flagEl, titleEl, badges);

    // Right Action Column
    const rightCol = h('div.vosk-card-right');

    if (isDownloading) {
      const pct = dlInfo?.percent || 0;
      const pBar = h('div.vosk-dl-bar', h('div.vosk-dl-fill', { style: `width: ${pct}%` }));
      const pText = h(
        'div.vosk-dl-text',
        h('span', dlInfo?.status === 'extracting' ? 'Extracting...' : `${pct}% • ${dlInfo?.speedText || ''}`),
        h('button.btn.small.ghost.vosk-cancel-btn', { type: 'button' }, 'Cancel')
      );

      pText.querySelector('button').addEventListener('click', async () => {
        await cancelVoskDownload(model.name);
        downloadingModels.delete(model.name);
        renderModelList();
      });

      rightCol.append(h('div.vosk-dl-wrap', pBar, pText));
    } else if (model.isInstalled) {
      const isSelected = activeModelId === model.id;
      const selectBtn = h(
        'button.btn.small' + (isSelected ? '.primary' : ''),
        { type: 'button' },
        isSelected ? 'Selected' : 'Select'
      );

      selectBtn.addEventListener('click', () => {
        if (onSelectModel) onSelectModel(model);
        dlg.close(model);
      });

      const deleteBtn = h('button.btn.small.ghost.danger', { type: 'button', 'aria-label': 'Delete model' }, icon('trash', 14));
      deleteBtn.title = 'Delete this model to free disk space';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Delete model "${model.name}" from your computer?`)) {
          const ok = await deleteVoskModel(model.id);
          if (ok) {
            toast('Model deleted', { kind: 'info' });
            await reloadData(false);
          }
        }
      });

      rightCol.append(
        h('span.vosk-installed-tag', icon('check', 12), 'Installed'),
        selectBtn,
        deleteBtn
      );
    } else {
      const dlBtn = h('button.btn.small.primary', { type: 'button' }, icon('download', 14), 'Download');
      dlBtn.addEventListener('click', async () => {
        if (!model.url) {
          toast('No download URL available for this model.', { kind: 'error' });
          return;
        }

        downloadingModels.set(model.name, { percent: 0, speedText: '', status: 'starting' });
        renderModelList();

        try {
          const installed = await downloadVoskModel(model, (prog) => {
            downloadingModels.set(model.name, prog);
            renderModelList();
          });
          downloadingModels.delete(model.name);
          toast(`Successfully installed ${model.langText || model.name}!`, { kind: 'success' });
          await reloadData(false);
          if (onSelectModel) onSelectModel(installed);
        } catch (err) {
          downloadingModels.delete(model.name);
          renderModelList();
          if (err.message !== 'Download cancelled') {
            console.error(err);
            toast(err.message || 'Download failed', { kind: 'error' });
          }
        }
      });

      rightCol.append(dlBtn);
    }

    const card = h('div.vosk-card', { dataset: { installed: String(model.isInstalled) } }, leftCol, rightCol);
    return card;
  }

  // Initial load
  await reloadData(false);
  searchInput.focus();

  return dlg;
}
