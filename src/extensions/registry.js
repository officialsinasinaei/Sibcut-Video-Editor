/**
 * Extension Registry: Manages registered extensions for Video Studio.
 * Extensions are independent mini-web applications (HTML, CSS, JS) running
 * in isolated sandboxes with a controlled communication bridge.
 */

export const EXTENSION_CATEGORIES = [
  { id: 'all', label: 'All Extensions', icon: 'blocks' },
  { id: 'titles', label: 'Text & Titles', icon: 'text' },
  { id: 'graphics', label: 'Overlays & Graphics', icon: 'sticker' },
  { id: 'fx', label: 'Visual Effects', icon: 'effects' },
  { id: 'tools', label: 'Tools & Utilities', icon: 'wand' },
];

/** Built-in extensions provided out of the box */
export const BUILTIN_EXTENSIONS = [
  {
    id: 'kinetic-typography',
    name: 'Kinetic Typography',
    version: '1.2.0',
    author: 'Video Studio Labs',
    category: 'titles',
    icon: 'text',
    badge: 'Popular',
    accentColor: '#6366f1',
    description: 'Create dynamic animated text, kinetic titles, and neon typography with real-time canvas rendering and timeline video export.',
    entry: 'extensions/kinetic-typography/index.html',
    capabilities: ['export-video', 'export-transparent'],
  },
  {
    id: 'lower-thirds',
    name: 'Lower Thirds & Overlays',
    version: '1.1.0',
    author: 'Video Studio Labs',
    category: 'graphics',
    icon: 'clapper',
    badge: 'Broadcast',
    accentColor: '#0ea5e9',
    description: 'Design sleek broadcast lower thirds, speaker badges, and social callouts with customizable themes and animated accent graphics.',
    entry: 'extensions/lower-thirds/index.html',
    capabilities: ['export-video', 'export-transparent'],
  },
];

class ExtensionRegistry {
  constructor() {
    this._extensions = new Map();
    for (const ext of BUILTIN_EXTENSIONS) {
      this._extensions.set(ext.id, ext);
    }
  }

  /**
   * Register a new extension.
   * @param {Object} extension
   */
  register(extension) {
    if (!extension || !extension.id) {
      throw new Error('Extension must provide a valid id.');
    }
    this._extensions.set(extension.id, {
      ...extension,
      version: extension.version || '1.0.0',
      capabilities: extension.capabilities || ['export-video'],
    });
  }

  /**
   * Unregister an extension.
   * @param {string} id
   */
  unregister(id) {
    return this._extensions.delete(id);
  }

  /**
   * Get an extension by id.
   * @param {string} id
   */
  get(id) {
    return this._extensions.get(id) || null;
  }

  /**
   * Get all registered extensions.
   * @returns {Array}
   */
  getAll() {
    return Array.from(this._extensions.values());
  }

  /**
   * Filter extensions by category and/or query string.
   */
  filter({ category = 'all', query = '' } = {}) {
    const q = (query || '').trim().toLowerCase();
    return this.getAll().filter((ext) => {
      const matchCat = category === 'all' || ext.category === category;
      if (!matchCat) return false;
      if (!q) return true;
      const haystack = `${ext.name} ${ext.description} ${ext.author} ${ext.category}`.toLowerCase();
      return haystack.includes(q);
    });
  }
}

export const extensionRegistry = new ExtensionRegistry();
