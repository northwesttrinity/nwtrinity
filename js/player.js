/**
 * NORTHWEST TRINITY — playback controller
 * Handles local <audio> playback + the persistent bottom bar,
 * and hands off to js/cast.js when the listener chooses to Cast.
 */
(function () {
  const audio = document.getElementById("audioEl");
  const tracklistEl = document.getElementById("tracklist");

  const pbNum = document.getElementById("pbNum");
  const pbTitle = document.getElementById("pbTitle");
  const pbStatus = document.getElementById("pbStatus");
  const pbPlay = document.getElementById("pbPlay");
  const pbPlayIcon = document.getElementById("pbPlayIcon");
  const pbPrev = document.getElementById("pbPrev");
  const pbNext = document.getElementById("pbNext");
  const pbSeek = document.getElementById("pbSeek");
  const pbCurrent = document.getElementById("pbCurrent");
  const pbDuration = document.getElementById("pbDuration");
  const pbVol = document.getElementById("pbVol");
  const pbMute = document.getElementById("pbMute");
  const pbCastBtn = document.getElementById("pbCastBtn");
  const pbCastLabel = document.getElementById("pbCastLabel");

  const ICON_PLAY = '<path d="M8 5v14l11-7z"/>';
  const ICON_PAUSE = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';

  let currentIndex = -1;
  let isCasting = false;
  let wasPlayingBeforeSeek = false;
  let trackPlayCounted = false;

  function countPlayOnce(track) {
    if (trackPlayCounted) return;
    trackPlayCounted = true;
    if (typeof TimberlineCounters !== "undefined") TimberlineCounters.registerPlay(track);
  }

  audio.volume = parseFloat(pbVol.value);

  /* ---------- build tracklist DOM ---------- */
  function renderTracklist() {
    tracklistEl.innerHTML = "";
    TRACKS.forEach((track, i) => {
      const row = document.createElement("div");
      row.className = "track-row";
      row.setAttribute("role", "listitem");
      row.dataset.index = i;

      row.innerHTML = `
        <span class="track-num">${String(track.num).padStart(2, "0")}</span>
        <div class="track-info">
          <span class="track-title">${track.title}</span>
          ${track.note ? `<span class="track-note">${track.note}</span>` : ""}
        </div>
        <span class="track-duration" data-index="${i}">${track.duration}</span>
        <span class="track-plays" data-index="${i}" hidden></span>
        <button class="track-cast" data-index="${i}" aria-label="Cast ${track.title} to device" title="Cast to device" hidden>
          <svg viewBox="0 0 24 24"><path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm18-7H5v1.63c3.96 1.28 7.09 4.41 8.37 8.37H19V7zM1 10v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>
        </button>
        <button class="icon-btn" data-index="${i}" aria-label="Play ${track.title}">
          <svg viewBox="0 0 24 24">${ICON_PLAY}</svg>
        </button>
      `;
      tracklistEl.appendChild(row);
    });

    tracklistEl.querySelectorAll(".icon-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.index, 10);
        if (currentIndex === i && !audio.paused) {
          pause();
        } else {
          loadTrack(i, { autoplay: true });
        }
      });
    });

    tracklistEl.querySelectorAll(".track-cast").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const i = parseInt(btn.dataset.index, 10);
        castIndex(i);
      });
    });
  }

  function absoluteUrl(src) {
    return new URL(src, window.location.href).href;
  }

  /* ---------- local playback ---------- */
  function loadTrack(i, { autoplay = false } = {}) {
    currentIndex = i;
    const track = TRACKS[i];
    trackPlayCounted = false;

    updateActiveRow();
    pbNum.textContent = String(track.num).padStart(2, "0");
    pbTitle.textContent = track.title;

    if (isCasting) {
      pbStatus.textContent = "Casting…";
      TimberlineCast.castTrack(track, absoluteUrl(track.src))
        .then(() => countPlayOnce(track))
        .catch(() => {
          pbStatus.textContent = "Cast failed — playing locally";
          isCasting = false;
          localLoadAndPlay(track, autoplay);
        });
      return;
    }
    localLoadAndPlay(track, autoplay);
  }

  function localLoadAndPlay(track, autoplay) {
    audio.src = track.src;
    pbStatus.textContent = "Loading…";
    if (autoplay) {
      audio.play().catch(() => {
        pbStatus.textContent = "Tap play to listen";
      });
    }
  }

  function play() {
    if (isCasting) {
      TimberlineCast.playRemote();
      setPlayingUI(true);
      return;
    }
    if (currentIndex === -1) {
      loadTrack(0, { autoplay: true });
      return;
    }
    audio.play();
  }

  function pause() {
    if (isCasting) {
      TimberlineCast.pauseRemote();
      setPlayingUI(false);
      return;
    }
    audio.pause();
  }

  function next() {
    if (currentIndex < TRACKS.length - 1) loadTrack(currentIndex + 1, { autoplay: true });
  }
  function prev() {
    if (currentIndex > 0) loadTrack(currentIndex - 1, { autoplay: true });
  }

  function updateActiveRow() {
    tracklistEl.querySelectorAll(".track-row").forEach((row) => {
      const i = parseInt(row.dataset.index, 10);
      const isActive = i === currentIndex;
      row.classList.toggle("is-active", isActive);
      const btn = row.querySelector(".icon-btn");
      const icon = btn.querySelector("svg");
      if (isActive && !audio.paused) {
        btn.classList.add("is-playing");
        icon.innerHTML = ICON_PAUSE;
      } else {
        btn.classList.remove("is-playing");
        icon.innerHTML = ICON_PLAY;
      }
    });
  }

  function setPlayingUI(playing) {
    pbPlayIcon.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    pbPlay.setAttribute("aria-label", playing ? "Pause" : "Play");
    pbStatus.textContent = playing ? (isCasting ? "Casting" : "Playing") : "Paused";
    updateActiveRow();
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  }

  /* ---------- audio element events ---------- */
  audio.addEventListener("play", () => {
    setPlayingUI(true);
    if (currentIndex !== -1) countPlayOnce(TRACKS[currentIndex]);
  });
  audio.addEventListener("pause", () => setPlayingUI(false));
  audio.addEventListener("ended", next);
  audio.addEventListener("loadedmetadata", () => {
    pbDuration.textContent = fmtTime(audio.duration);
    pbSeek.max = audio.duration || 100;
  });
  audio.addEventListener("timeupdate", () => {
    if (!audio.seeking) {
      pbSeek.value = audio.currentTime;
      pbCurrent.textContent = fmtTime(audio.currentTime);
      const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
      pbSeek.style.setProperty("--progress", pct + "%");
    }
  });

  /* ---------- transport controls ---------- */
  pbPlay.addEventListener("click", () => {
    const playing = isCasting ? pbPlayIcon.innerHTML.includes("14 5h4") : !audio.paused;
    playing ? pause() : play();
  });
  pbNext.addEventListener("click", next);
  pbPrev.addEventListener("click", prev);

  pbSeek.addEventListener("input", () => {
    const pct = audio.duration ? (pbSeek.value / audio.duration) * 100 : 0;
    pbSeek.style.setProperty("--progress", pct + "%");
    pbCurrent.textContent = fmtTime(pbSeek.value);
  });
  pbSeek.addEventListener("change", () => {
    audio.currentTime = pbSeek.value;
  });

  pbVol.addEventListener("input", () => {
    audio.volume = parseFloat(pbVol.value);
  });
  pbMute.addEventListener("click", () => {
    audio.muted = !audio.muted;
    pbMute.style.opacity = audio.muted ? 0.4 : 1;
  });

  /* ---------- Chromecast wiring ---------- */
  function castIndex(i) {
    isCasting = true;
    loadTrack(i, { autoplay: true });
  }

  pbCastBtn.addEventListener("click", () => {
    if (TimberlineCast.isConnected()) {
      TimberlineCast.endSession();
      isCasting = false;
      if (currentIndex !== -1) localLoadAndPlay(TRACKS[currentIndex], false);
      return;
    }
    if (currentIndex === -1) {
      castIndex(0);
    } else {
      castIndex(currentIndex);
    }
  });

  TimberlineCast.onStateChange((state) => {
    // Reveal per-row cast buttons only once the framework confirms
    // Cast is available in this browser.
    document.querySelectorAll(".track-cast").forEach((btn) => {
      btn.hidden = !state.available;
    });

    pbCastBtn.hidden = !state.available;
    pbCastBtn.classList.toggle("is-connected", state.connected);
    pbCastLabel.textContent = state.connected ? "Casting" : "Cast";

    if (!state.connected && isCasting) {
      // Session ended remotely — fall back to local playback.
      isCasting = false;
      if (currentIndex !== -1) {
        pbStatus.textContent = "Paused";
      }
    }
  });

  /**
   * Reads each track's real duration straight from the audio file's own
   * metadata, so you don't have to hand-type durations in js/tracks.js.
   * Uses lightweight throwaway <audio preload="metadata"> probes — these
   * don't affect the main player and don't download the full file.
   * If a file isn't reachable yet, the placeholder text already in
   * js/tracks.js (e.g. "--:--") is left in place.
   */
  function autoFillDurations() {
    TRACKS.forEach((track, i) => {
      const probe = document.createElement("audio");
      probe.preload = "metadata";
      probe.src = track.src;
      probe.addEventListener("loadedmetadata", () => {
        if (isFinite(probe.duration)) {
          const el = document.querySelector(`.track-duration[data-index="${i}"]`);
          if (el) el.textContent = fmtTime(probe.duration);
        }
      });
      // On error, just leave the existing placeholder text — silent by design.
    });
  }

  /* ---------- init ---------- */
  renderTracklist();
  autoFillDurations();
})();
