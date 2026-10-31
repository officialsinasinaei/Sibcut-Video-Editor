import './styles/fonts.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/editor.css';
import './styles/timeline.css';
import './styles/home.css';
import './styles/responsive.css';
import { h } from './lib/dom.js';
import { icon, appIcon } from './lib/icons.js';
import { applyTheme } from './ui/prefs.js';
import { Library } from './storage/library.js';
import { opfsBackend, opfsAvailable, memoryBackend } from './storage/backends.js';
import { Home } from './ui/home.js';
import { importProjectBundle } from './storage/bundle.js';
import { toast, confirmDialog } from './ui/dialog.js';
import { loadDsp } from './media/dsp.js';
import { parseReviewHash } from './review/protocol.js';
import { confirmLeave, finishUploads } from './ui/leave.js';

const root = document.getElementById('app');
applyTheme();
loadDsp();

let library = null;
let account = null;
let view = null;
// Set once the user chose to leave the page (signing out, closing the window): no more questions.
let leaving = false;

function loading(text) {
  root.setAttribute('aria-busy', 'true');
  root.replaceChildren(h('div.splash', { role: 'status' }, appIcon(56), h('div.spinner'), h('p', text)));
}

function errorScreen(title, message, retry) {
  root.removeAttribute('aria-busy');
  root.replaceChildren(h('main#main.splash', icon('cloudOff', 32), h('h1.splash-title', title), h('p.splash-sub', message), retry ? h('button.btn.primary', { type: 'button', onclick: retry }, 'Try again') : null));
}

function showHome() {
  view?.dispose?.();
  library?.backend?.setActiveProject?.(null);
  if (/#(project|review)=/.test(location.hash)) history.replaceState(null, '', `${location.pathname}${location.search}`);
  view = new Home(root, {
    library,
    account,
    onOpen: (id) => openProject(id),
    onCreate: (opts) => createProject(opts),
    onImportFiles: (files) => createProject({ ratio: 'original' }, files),
  });
}

async function openProject(id, files) {
  view?.dispose?.();
  loading('Opening project...');
  let project;
  try {
    project = await library.openProject(id);
    library?.backend?.setActiveProject?.(id);
  } catch (err) {
    toast(err?.message || "Couldn't open the project.", { kind: 'error' });
    showHome();
    return;
  }
  if (project.deletedAt) {
    toast(`${project.name} is in the Trash. Restore it to open it.`, { kind: 'error' });
    history.replaceState(null, '', '#trash');
    showHome();
    return;
  }
  // Open in another tab too: edits in both would overwrite each other, so ask first.
  const claim = await library.claimProject(id);
  if (!claim.held) {
    const ok = await confirmDialog({
      title: 'Project open in another tab',
      message: `${project.name} is already open in another tab or window. Changes made in both places overwrite each other. Open it here anyway?`,
      confirm: 'Open anyway',
      cancel: 'Go back',
    });
    if (!ok) {
      claim.release();
      showHome();
      return;
    }
  }
  const { Editor } = await import('./ui/editor.js');
  view = new Editor(root, {
    library,
    project,
    claim,
    account,
    onExit: () => showHome(),
    onNewProject: () => createProject({ ratio: 'original' }),
    onOpenProject: (other) => openProject(other),
  });
  history.replaceState(null, '', `#project=${encodeURIComponent(id)}`);
  if (files?.length) {
    const assets = await view.ctx.actions.importFiles(files);
    let first = true;
    for (const a of assets) {
      view.ctx.actions.addAsset(a, { start: view.ctx.store.duration, adoptRatio: first });
      first = false;
    }
    view.ctx.store.seek(0);
  }
}

async function createProject(opts = {}, files) {
  loading('Creating project...');
  try {
    const project = await library.createProject({ name: await library.nextProjectName(), ratio: opts.ratio || 'original' });
    await openProject(project.id, files);
  } catch (err) {
    console.error(err);
    toast("Couldn't create a project.", { kind: 'error' });
    showHome();
  }
}

async function openBundle(file) {
  loading('Opening project file...');
  try {
    const { project } = await importProjectBundle(library, file);
    await openProject(project.id);
  } catch (err) {
    console.error(err);
    toast(err?.message || "Couldn't open the project file.", { kind: 'error' });
    showHome();
  }
}

/**
 * The page is about to go away: save the open project and wait for media
 * uploads, asking first when something couldn't be stored. Resolves false
 * to stay.
 */
async function leavePage() {
  if (leaving) return true;
  if (view?.prepareToLeave) {
    if (!(await view.prepareToLeave({ waitForUploads: true }))) return false;
  } else {
    const media = await finishUploads(library);
    if (media && !(await confirmLeave(library, { media }))) return false;
  }
  leaving = true;
  if (view) view.pageLeaving = true;
  return true;
}

async function handleElectronOpenDialog() {
  if (!window.projectStorageAPI?.showOpenProjectDialog) return;
  const res = await window.projectStorageAPI.showOpenProjectDialog();
  if (!res.canceled && res.filePaths?.[0]) {
    const filePath = res.filePaths[0];
    const lower = filePath.toLowerCase();
    try {
      if (lower.endsWith('.vsproj')) {
        const raw = await window.projectStorageAPI.readJSON(null, { absPath: filePath });
        if (!raw) throw new Error('Could not read project file or file is empty.');
        const { normalizeProject } = await import('./model/project.js');
        const project = normalizeProject(raw);
        await library.saveProject(project);
        await openProject(project.id);
        toast(`Opened ${project.name}`);
      } else if (lower.endsWith('.zip')) {
        const buffer = await window.projectStorageAPI.readBinary(null, { absPath: filePath });
        if (!buffer) throw new Error('Could not read bundle file.');
        const blob = new Blob([buffer], { type: 'application/zip' });
        await openBundle(blob);
      } else {
        toast('Unsupported file type. Please select a .vsproj or .zip file.', { kind: 'error' });
      }
    } catch (err) {
      console.error(err);
      toast(err?.message || "Couldn't open the project file.", { kind: 'error' });
    }
  }
}

async function handleElectronChangeDir() {
  if (!window.projectStorageAPI?.setProjectsDir) return;
  const res = await window.projectStorageAPI.setProjectsDir();
  if (res && res.dir) {
    toast(`Projects folder changed to: ${res.dir}`);
    if (!location.hash.includes('project=')) {
      showHome();
    }
  }
}

function setupElectronMenuHandlers() {
  if (!window.projectStorageAPI?.onMenuAction) return;
  window.projectStorageAPI.onMenuAction(async (action) => {
    switch (action) {
      case 'new-project':
        if (view?.ctx?.newProject) view.ctx.newProject();
        else createProject({ ratio: 'original' });
        break;
      case 'open-project':
        if (view?.openProjectFileDialog) view.openProjectFileDialog();
        else handleElectronOpenDialog();
        break;
      case 'save-project':
        if (view?.saver) {
          await view.saver.save();
          toast('Project saved');
        }
        break;
      case 'save-project-as':
        if (view?.saveProjectAs) view.saveProjectAs();
        break;
      case 'export-bundle':
        if (view?.exportBundle) view.exportBundle();
        break;
      case 'export-video':
        if (view?.ctx?.openExport) view.ctx.openExport();
        break;
      case 'open-projects-folder':
        window.projectStorageAPI.openInExplorer();
        break;
      case 'change-projects-folder':
        handleElectronChangeDir();
        break;
    }
  });
}

async function startLocal() {
  const isElec = typeof window !== 'undefined' && Boolean(window.projectStorageAPI?.isElectron);
  let backend;
  if (isElec) {
    const { electronBackend } = await import('./storage/electron-backend.js');
    backend = electronBackend();
  } else if (opfsAvailable()) {
    backend = opfsBackend();
  } else {
    backend = memoryBackend();
  }
  library = new Library(backend);
  account = {
    user: null,
    env: 'local',
    picture: null,
    onSignIn: null,
  };

  if (isElec) {
    const { migrateFromOpfsIfNeeded } = await import('./storage/migration.js');
    const migrated = await migrateFromOpfsIfNeeded(library, backend).catch(() => 0);
    if (migrated > 0) {
      toast(`Restored ${migrated} project${migrated === 1 ? '' : 's'} from previous session`, { kind: 'success' });
    }
    setupElectronMenuHandlers();
  }

  route();
}

/** A review link (#review=...): the focused review screen, for reviewers and the owner alike. */
async function openReview(link) {
  // A review link pasted over the editor: save first, and stay if the user wants to after a failed save.
  if (view?.prepareToLeave) {
    if (!(await view.prepareToLeave())) {
      history.replaceState(null, '', `#project=${encodeURIComponent(view.store.project.id)}`);
      return;
    }
    await view.saveCover?.();
  }
  view?.dispose?.();
  loading('Opening review...');
  const { ReviewPage } = await import('./ui/review/review-page.js');
  view = new ReviewPage(root, {
    account,
    link,
    onHome: () => showHome(),
    onSignedIn: () => location.reload(),
  });
}

function route() {
  let review = null;
  try {
    review = parseReviewHash(location.hash);
  } catch (err) {
    errorScreen('This review link does not work', err.message, null);
    return;
  }
  const m = /#project=([^&]+)/.exec(location.hash);
  if (review) openReview(review);
  else if (m) openProject(decodeURIComponent(m[1]));
  else showHome();
}

async function boot() {
  startLocal();
}

// A review link pasted into an open tab only changes the hash.
window.addEventListener('hashchange', () => {
  if (!library) return;
  let link = null;
  try {
    link = parseReviewHash(location.hash);
  } catch {
    return;
  }
  if (link && (view?.link?.review !== link.review || link.token)) openReview(link);
});

// Media still uploading (or waiting to be tried again) after leaving the editor: warn before the page closes.
window.addEventListener('beforeunload', (e) => {
  if (leaving || !library?.unsavedMedia) return;
  e.preventDefault();
  e.returnValue = '';
});

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
});

if (typeof window !== 'undefined' && !window.__VIDEO_STUDIO_TEST__) boot();

// Development hook: drive the app from the console or browser automation.
//   await vs.importDev(['clip-a.mp4', 'music.mp3'], { add: true })
if (import.meta.env.DEV) {
  window.vs = {
    get view() {
      return view;
    },
    get ctx() {
      return view?.ctx;
    },
    // What signing out and closing the Puter window do before the page goes.
    leavePage: () => leavePage(),
    async importDev(names, { add = false } = {}) {
      const files = [];
      for (const n of names) {
        const blob = await (await fetch(`/.dev-media/${n}`)).blob();
        files.push(new File([blob], n, { type: blob.type }));
      }
      return view.ctx.actions.importFiles(files, { addToTimeline: add });
    },
  };
}
