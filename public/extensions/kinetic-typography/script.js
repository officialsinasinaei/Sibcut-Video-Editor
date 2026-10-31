/**
 * Kinetic Typography Extension Script
 * Independent HTML5 Canvas Animation & Video Studio Timeline Bridge
 */

(function () {
  'use strict';

  // State
  const state = {
    primaryText: 'CREATIVE STUDIO',
    secondaryText: 'NEXT GENERATION EXTENSIONS',
    animStyle: 'pop',
    durationSec: 3.5,
    fontSize: 64,
    primaryColor: '#38bdf8',
    accentColor: '#f43f5e',
    bgStyle: 'dark',
    currentTime: 0,
    isPlaying: true,
    isExporting: false,
  };

  // Preset definitions
  const PRESETS = {
    neon: {
      primaryColor: '#38bdf8',
      accentColor: '#f43f5e',
      animStyle: 'glitch',
      bgStyle: 'dark',
      fontSize: 68,
    },
    cinematic: {
      primaryColor: '#fef08a',
      accentColor: '#ca8a04',
      animStyle: 'slide',
      bgStyle: 'black',
      fontSize: 60,
    },
    cyber: {
      primaryColor: '#22d3ee',
      accentColor: '#f43f5e',
      animStyle: 'pop',
      bgStyle: 'gradient',
      fontSize: 72,
    },
    minimal: {
      primaryColor: '#ffffff',
      accentColor: '#94a3b8',
      animStyle: 'typewriter',
      bgStyle: 'black',
      fontSize: 54,
    },
  };

  // DOM Elements
  const canvas = document.getElementById('previewCanvas');
  const ctx = canvas.getContext('2d');
  const primaryTextInput = document.getElementById('primaryText');
  const secondaryTextInput = document.getElementById('secondaryText');
  const animStyleSelect = document.getElementById('animStyle');
  const durationInput = document.getElementById('duration');
  const durationVal = document.getElementById('durationVal');
  const fontSizeInput = document.getElementById('fontSize');
  const fontSizeVal = document.getElementById('fontSizeVal');
  const primaryColorInput = document.getElementById('primaryColor');
  const accentColorInput = document.getElementById('accentColor');
  const bgStyleSelect = document.getElementById('bgStyle');
  const presetButtons = document.querySelectorAll('.preset-btn');

  // Transport elements
  const playPauseBtn = document.getElementById('playPauseBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const restartBtn = document.getElementById('restartBtn');
  const timecodeEl = document.getElementById('timecode');
  const scrubber = document.getElementById('scrubber');

  // Export elements
  const addToTimelineBtn = document.getElementById('addToTimelineBtn');
  const exportStatus = document.getElementById('exportStatus');
  const statusLabel = document.getElementById('statusLabel');
  const statusPct = document.getElementById('statusPct');
  const progressFill = document.getElementById('progressFill');

  // Background particle generator
  const particles = Array.from({ length: 45 }, () => ({
    x: Math.random() * 1920,
    y: Math.random() * 1080,
    r: Math.random() * 2 + 1,
    speed: Math.random() * 0.5 + 0.2,
    opacity: Math.random() * 0.6 + 0.2,
  }));

  // Bind controls
  function initControls() {
    primaryTextInput.addEventListener('input', (e) => {
      state.primaryText = e.target.value || 'TITLE';
    });
    secondaryTextInput.addEventListener('input', (e) => {
      state.secondaryText = e.target.value || '';
    });
    animStyleSelect.addEventListener('change', (e) => {
      state.animStyle = e.target.value;
    });
    durationInput.addEventListener('input', (e) => {
      state.durationSec = parseFloat(e.target.value);
      durationVal.textContent = `${state.durationSec.toFixed(1)}s`;
      updateTimecode();
    });
    fontSizeInput.addEventListener('input', (e) => {
      state.fontSize = parseInt(e.target.value, 10);
      fontSizeVal.textContent = `${state.fontSize}px`;
    });
    primaryColorInput.addEventListener('input', (e) => {
      state.primaryColor = e.target.value;
    });
    accentColorInput.addEventListener('input', (e) => {
      state.accentColor = e.target.value;
    });
    bgStyleSelect.addEventListener('change', (e) => {
      state.bgStyle = e.target.value;
    });

    // Preset buttons
    presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        presetButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const p = PRESETS[btn.dataset.preset];
        if (p) applyPreset(p);
      });
    });

    // Playback transport
    playPauseBtn.addEventListener('click', togglePlay);
    restartBtn.addEventListener('click', () => {
      state.currentTime = 0;
      scrubber.value = 0;
      updateTimecode();
    });

    scrubber.addEventListener('input', (e) => {
      state.currentTime = parseFloat(e.target.value) * state.durationSec;
      updateTimecode();
      renderFrame(state.currentTime);
    });

    // Timeline export
    addToTimelineBtn.addEventListener('click', exportToTimeline);
  }

  function applyPreset(p) {
    state.primaryColor = p.primaryColor;
    state.accentColor = p.accentColor;
    state.animStyle = p.animStyle;
    state.bgStyle = p.bgStyle;
    state.fontSize = p.fontSize;

    primaryColorInput.value = p.primaryColor;
    accentColorInput.value = p.accentColor;
    animStyleSelect.value = p.animStyle;
    bgStyleSelect.value = p.bgStyle;
    fontSizeInput.value = p.fontSize;
    fontSizeVal.textContent = `${p.fontSize}px`;
  }

  function togglePlay() {
    state.isPlaying = !state.isPlaying;
    playIcon.style.display = state.isPlaying ? 'none' : 'block';
    pauseIcon.style.display = state.isPlaying ? 'block' : 'none';
  }

  function updateTimecode() {
    const cur = state.currentTime;
    const total = state.durationSec;
    const curSec = Math.floor(cur);
    const curCs = Math.floor((cur % 1) * 100);
    const totSec = Math.floor(total);
    const totCs = Math.floor((total % 1) * 100);
    timecodeEl.textContent = `${String(curSec).padStart(2, '0')}:${String(curCs).padStart(2, '0')} / ${String(totSec).padStart(2, '0')}:${String(totCs).padStart(2, '0')}`;
  }

  // Render frame at specific time
  function renderFrame(time) {
    const w = canvas.width;
    const h = canvas.height;
    const progress = Math.min(1, Math.max(0, time / state.durationSec));

    // Clear background
    if (state.bgStyle === 'transparent') {
      ctx.clearRect(0, 0, w, h);
    } else if (state.bgStyle === 'gradient') {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    } else if (state.bgStyle === 'black') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);
    } else {
      // Dark space
      ctx.fillStyle = '#0a0c12';
      ctx.fillRect(0, 0, w, h);
    }

    // Draw floating particles if not transparent
    if (state.bgStyle !== 'transparent') {
      ctx.fillStyle = state.primaryColor;
      for (const p of particles) {
        ctx.globalAlpha = p.opacity * 0.4;
        ctx.beginPath();
        const py = (p.y - time * 30 * p.speed) % h;
        ctx.arc(p.x, (py < 0 ? py + h : py), p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    }

    ctx.save();

    const cx = w / 2;
    const cy = h / 2;

    // Animation computation
    switch (state.animStyle) {
      case 'pop': {
        // Elastic scale & drift
        const t = Math.min(1, progress * 2.2);
        const scale = t < 1
          ? Math.sin(t * Math.PI * 0.5) * 1.05
          : 1.05 - (progress - 0.45) * 0.05;
        const alpha = Math.min(1, progress * 4);

        ctx.translate(cx, cy - 20);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;
        break;
      }

      case 'glitch': {
        // High-energy digital glitch
        const jitterX = progress < 0.25 || Math.random() < 0.1 ? (Math.random() - 0.5) * 12 : 0;
        const jitterY = progress < 0.25 || Math.random() < 0.1 ? (Math.random() - 0.5) * 6 : 0;
        ctx.translate(cx + jitterX, cy - 20 + jitterY);
        ctx.globalAlpha = Math.min(1, progress * 5);
        break;
      }

      case 'slide': {
        // Smooth slide up with easeOutExpo
        const t = Math.min(1, progress * 2.0);
        const ease = 1 - Math.pow(2, -10 * t);
        const offsetY = (1 - ease) * 120;
        ctx.translate(cx, cy - 20 + offsetY);
        ctx.globalAlpha = ease;
        break;
      }

      case 'typewriter':
      default: {
        ctx.translate(cx, cy - 20);
        break;
      }
    }

    // Draw Decorative Accent Box / Pill
    ctx.strokeStyle = state.accentColor;
    ctx.lineWidth = 3;
    const boxWidth = Math.max(500, state.primaryText.length * (state.fontSize * 0.55));
    const boxHeight = state.fontSize * 1.8;

    // Outer glow
    ctx.shadowColor = state.accentColor;
    ctx.shadowBlur = 24;
    ctx.strokeRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);

    // Accent corner markers
    const mSize = 14;
    ctx.fillStyle = state.accentColor;
    ctx.fillRect(-boxWidth / 2 - 3, -boxHeight / 2 - 3, mSize, 4);
    ctx.fillRect(-boxWidth / 2 - 3, -boxHeight / 2 - 3, 4, mSize);
    ctx.fillRect(boxWidth / 2 + 3 - mSize, -boxHeight / 2 - 3, mSize, 4);
    ctx.fillRect(boxWidth / 2 - 1, -boxHeight / 2 - 3, 4, mSize);
    ctx.fillRect(-boxWidth / 2 - 3, boxHeight / 2 - 1, mSize, 4);
    ctx.fillRect(-boxWidth / 2 - 3, boxHeight / 2 + 3 - mSize, 4, mSize);
    ctx.fillRect(boxWidth / 2 + 3 - mSize, boxHeight / 2 - 1, mSize, 4);
    ctx.fillRect(boxWidth / 2 - 1, boxHeight / 2 + 3 - mSize, 4, mSize);

    // Primary Text
    ctx.shadowColor = state.primaryColor;
    ctx.shadowBlur = 18;
    ctx.fillStyle = state.primaryColor;
    ctx.font = `900 ${state.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let displayTitle = state.primaryText;
    if (state.animStyle === 'typewriter') {
      const charCount = Math.floor(Math.min(1, progress * 2.5) * state.primaryText.length);
      displayTitle = state.primaryText.slice(0, charCount);
    }
    ctx.fillText(displayTitle, 0, -4);

    // Secondary Subtitle
    if (state.secondaryText) {
      const subAlpha = Math.min(1, Math.max(0, (progress - 0.2) * 3));
      ctx.shadowBlur = 0;
      ctx.globalAlpha = subAlpha;
      ctx.fillStyle = state.accentColor;
      ctx.font = `700 ${Math.round(state.fontSize * 0.32)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.letterSpacing = '4px';
      ctx.fillText(state.secondaryText.toUpperCase(), 0, boxHeight / 2 + 36);
    }

    ctx.restore();
  }

  // Animation Loop
  let lastTimestamp = performance.now();
  function loop(now) {
    const dt = (now - lastTimestamp) / 1000;
    lastTimestamp = now;

    if (state.isPlaying && !state.isExporting) {
      state.currentTime += dt;
      if (state.currentTime > state.durationSec) {
        state.currentTime = 0;
      }
      scrubber.value = state.currentTime / state.durationSec;
      updateTimecode();
      renderFrame(state.currentTime);
    }

    requestAnimationFrame(loop);
  }

  // High-Quality Video Export Workflow
  async function exportToTimeline() {
    if (state.isExporting) return;
    state.isExporting = true;
    state.isPlaying = false;

    addToTimelineBtn.disabled = true;
    exportStatus.hidden = false;
    statusLabel.textContent = 'Recording video frames...';
    statusPct.textContent = '0%';
    progressFill.style.width = '0%';

    try {
      // Step through time deterministically while recording
      const totalFrames = Math.round(state.durationSec * 30);
      const frameDuration = 1 / 30;

      // Start canvas recording via SDK helper
      const recordPromise = window.VideoStudioExtension.recordCanvas(canvas, {
        durationSec: state.durationSec,
        fps: 30,
        bitrate: 12_000_000,
        onProgress: (ratio, msg) => {
          const pct = Math.round(ratio * 100);
          statusPct.textContent = `${pct}%`;
          statusLabel.textContent = msg;
          progressFill.style.width = `${pct}%`;
        },
      });

      // Drive frames during recording
      let f = 0;
      const interval = setInterval(() => {
        if (f <= totalFrames) {
          const t = f * frameDuration;
          renderFrame(t);
          f++;
        } else {
          clearInterval(interval);
        }
      }, 1000 / 30);

      const videoBlob = await recordPromise;
      clearInterval(interval);

      statusLabel.textContent = 'Adding to timeline...';
      statusPct.textContent = '100%';
      progressFill.style.width = '100%';

      const fileName = `Kinetic - ${state.primaryText.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'Title'}.webm`;

      // Pass video to main application via Extension SDK
      await window.VideoStudioExtension.addToTimeline(videoBlob, {
        name: fileName,
        duration: state.durationSec,
        width: 1920,
        height: 1080,
      });

      statusLabel.textContent = 'Added to timeline!';
      window.VideoStudioExtension.toast(`Exported "${fileName}" to timeline!`, 'success');

      setTimeout(() => {
        exportStatus.hidden = true;
        addToTimelineBtn.disabled = false;
        state.isExporting = false;
        state.isPlaying = true;
      }, 1500);

    } catch (err) {
      console.error('Export failed:', err);
      statusLabel.textContent = `Export failed: ${err.message}`;
      addToTimelineBtn.disabled = false;
      state.isExporting = false;
      state.isPlaying = true;
      window.VideoStudioExtension.toast(`Export error: ${err.message}`, 'error');
    }
  }

  // Listen for host trigger (e.g. from workspace header button)
  if (window.VideoStudioExtension) {
    window.VideoStudioExtension.onExportRequested(() => {
      exportToTimeline();
    });

    window.VideoStudioExtension.onInit((ctx) => {
      console.log('Kinetic Typography initialized with context:', ctx);
      if (ctx.project?.settings?.fps) {
        document.querySelector('.resolution-badge').textContent = `1080p ${ctx.project.settings.fps}fps`;
      }
    });
  }

  // Initialize
  initControls();
  renderFrame(0);
  requestAnimationFrame(loop);
})();
