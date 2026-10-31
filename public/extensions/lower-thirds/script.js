/**
 * Lower Thirds & Overlays Extension Script
 */

(function () {
  'use strict';

  const state = {
    speakerName: 'ALEX MORGAN',
    speakerTitle: 'SENIOR LEAD ARCHITECT',
    socialHandle: '@alexmorgan',
    style: 'broadcast',
    accentColor: '#0ea5e9',
    barColor: '#0f172a',
    durationSec: 4.0,
    currentTime: 0,
    isPlaying: true,
    isExporting: false,
  };

  const canvas = document.getElementById('previewCanvas');
  const ctx = canvas.getContext('2d');

  const speakerNameInput = document.getElementById('speakerName');
  const speakerTitleInput = document.getElementById('speakerTitle');
  const socialHandleInput = document.getElementById('socialHandle');
  const accentColorInput = document.getElementById('accentColor');
  const barColorInput = document.getElementById('barColor');
  const durationInput = document.getElementById('duration');
  const durationVal = document.getElementById('durationVal');
  const styleCards = document.querySelectorAll('.style-card');

  const playPauseBtn = document.getElementById('playPauseBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const restartBtn = document.getElementById('restartBtn');
  const timecodeEl = document.getElementById('timecode');
  const scrubber = document.getElementById('scrubber');

  const addToTimelineBtn = document.getElementById('addToTimelineBtn');
  const exportStatus = document.getElementById('exportStatus');
  const statusLabel = document.getElementById('statusLabel');
  const statusPct = document.getElementById('statusPct');
  const progressFill = document.getElementById('progressFill');

  function init() {
    speakerNameInput.addEventListener('input', (e) => state.speakerName = e.target.value);
    speakerTitleInput.addEventListener('input', (e) => state.speakerTitle = e.target.value);
    socialHandleInput.addEventListener('input', (e) => state.socialHandle = e.target.value);
    accentColorInput.addEventListener('input', (e) => state.accentColor = e.target.value);
    barColorInput.addEventListener('input', (e) => state.barColor = e.target.value);
    durationInput.addEventListener('input', (e) => {
      state.durationSec = parseFloat(e.target.value);
      durationVal.textContent = `${state.durationSec.toFixed(1)}s`;
    });

    styleCards.forEach((c) => {
      c.addEventListener('click', () => {
        styleCards.forEach((x) => x.classList.remove('active'));
        c.classList.add('active');
        state.style = c.dataset.style;
      });
    });

    playPauseBtn.addEventListener('click', () => {
      state.isPlaying = !state.isPlaying;
      playIcon.style.display = state.isPlaying ? 'none' : 'block';
      pauseIcon.style.display = state.isPlaying ? 'block' : 'none';
    });

    restartBtn.addEventListener('click', () => {
      state.currentTime = 0;
      scrubber.value = 0;
    });

    scrubber.addEventListener('input', (e) => {
      state.currentTime = parseFloat(e.target.value) * state.durationSec;
      render(state.currentTime);
    });

    addToTimelineBtn.addEventListener('click', exportToTimeline);

    if (window.VideoStudioExtension) {
      window.VideoStudioExtension.onExportRequested(() => exportToTimeline());
    }

    render(0);
    requestAnimationFrame(loop);
  }

  function render(time) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const progress = Math.min(1, Math.max(0, time / state.durationSec));

    // Entry & Exit animation (slide in first 0.6s, hold, slide out last 0.5s)
    let animProgress = 1;
    const inDuration = 0.6 / state.durationSec;
    const outStart = 1 - 0.5 / state.durationSec;

    if (progress < inDuration) {
      const t = progress / inDuration;
      animProgress = 1 - Math.pow(1 - t, 3); // easeOutCubic
    } else if (progress > outStart) {
      const t = (progress - outStart) / (1 - outStart);
      animProgress = 1 - Math.pow(t, 2); // easeInQuad
    }

    ctx.save();

    // Position at lower-left of screen
    const baseX = 140;
    const baseY = h - 220;

    const slideOffset = (1 - animProgress) * -450;
    ctx.translate(baseX + slideOffset, baseY);
    ctx.globalAlpha = Math.max(0, Math.min(1, animProgress * 1.5));

    // Measure text
    ctx.font = '700 42px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const nameWidth = ctx.measureText(state.speakerName).width;

    ctx.font = '500 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const titleWidth = ctx.measureText(state.speakerTitle).width;

    const boxWidth = Math.max(380, Math.max(nameWidth, titleWidth) + 60);

    // Main background card
    ctx.fillStyle = state.barColor;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.roundRect(0, 0, boxWidth, 100, [6, 12, 12, 6]);
    ctx.fill();

    // Left Accent bar
    ctx.shadowColor = state.accentColor;
    ctx.shadowBlur = 14;
    ctx.fillStyle = state.accentColor;
    ctx.fillRect(0, 0, 8, 100);

    // Decorative bottom accent stripe
    ctx.fillRect(0, 96, boxWidth * animProgress, 4);

    // Speaker Name
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(state.speakerName, 28, 44);

    // Speaker Title
    ctx.fillStyle = state.accentColor;
    ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.letterSpacing = '1px';
    ctx.fillText(state.speakerTitle.toUpperCase(), 28, 76);

    // Social Tag Pill (if present)
    if (state.socialHandle) {
      ctx.font = '500 16px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
      const handleW = ctx.measureText(state.socialHandle).width;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.roundRect(boxWidth + 14, 28, handleW + 28, 44, 22);
      ctx.fill();

      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(state.socialHandle, boxWidth + 28, 56);
    }

    ctx.restore();
  }

  let last = performance.now();
  function loop(now) {
    const dt = (now - last) / 1000;
    last = now;

    if (state.isPlaying && !state.isExporting) {
      state.currentTime += dt;
      if (state.currentTime > state.durationSec) {
        state.currentTime = 0;
      }
      scrubber.value = state.currentTime / state.durationSec;
      const cur = Math.floor(state.currentTime);
      const tot = Math.floor(state.durationSec);
      timecodeEl.textContent = `00:0${cur} / 00:0${tot}`;
      render(state.currentTime);
    }

    requestAnimationFrame(loop);
  }

  async function exportToTimeline() {
    if (state.isExporting) return;
    state.isExporting = true;
    state.isPlaying = false;
    addToTimelineBtn.disabled = true;
    exportStatus.hidden = false;

    try {
      const recordPromise = window.VideoStudioExtension.recordCanvas(canvas, {
        durationSec: state.durationSec,
        fps: 30,
        bitrate: 10_000_000,
        onProgress: (ratio, msg) => {
          const pct = Math.round(ratio * 100);
          statusPct.textContent = `${pct}%`;
          statusLabel.textContent = msg;
          progressFill.style.width = `${pct}%`;
        },
      });

      const totalFrames = Math.round(state.durationSec * 30);
      let f = 0;
      const interval = setInterval(() => {
        if (f <= totalFrames) {
          render(f * (1 / 30));
          f++;
        } else {
          clearInterval(interval);
        }
      }, 1000 / 30);

      const blob = await recordPromise;
      clearInterval(interval);

      const name = `Lower Third - ${state.speakerName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'Overlay'}.webm`;
      await window.VideoStudioExtension.addToTimeline(blob, {
        name,
        duration: state.durationSec,
        width: 1920,
        height: 1080,
      });

      window.VideoStudioExtension.toast(`Added "${name}" to timeline!`, 'success');
      setTimeout(() => {
        exportStatus.hidden = true;
        addToTimelineBtn.disabled = false;
        state.isExporting = false;
        state.isPlaying = true;
      }, 1500);

    } catch (e) {
      statusLabel.textContent = `Error: ${e.message}`;
      addToTimelineBtn.disabled = false;
      state.isExporting = false;
      state.isPlaying = true;
    }
  }

  init();
})();
