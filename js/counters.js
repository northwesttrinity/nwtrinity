/**
 * NORTHWEST TRINITY — visitor + play counters
 *
 * Talks to the Worker's /api/hit and /api/plays endpoints (src/index.js).
 * Fails silently and stays hidden if those endpoints 404 or error — the
 * site should look intentional whether or not the counters backend has
 * been configured yet (see README.md for setup).
 *
 * Depends on TRACKS being defined already (js/tracks.js loads first).
 * Exposes window.TimberlineCounters for js/player.js to call into.
 */
const TimberlineCounters = (function () {
  const visitorEl = document.getElementById("visitorCount");
  const visitorWrap = document.getElementById("visitorCountWrap");

  let playCounts = {};

  function filenameFor(track) {
    // The Worker only ever sees/validates the bare filename, not the full path.
    return track.src.split("/").pop();
  }

  async function loadVisitorCount() {
    try {
      const res = await fetch("/api/hit", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.count !== "number") return;
      visitorEl.textContent = data.count.toLocaleString();
      visitorWrap.hidden = false;
    } catch (_) {
      // Backend not configured yet — stay hidden, no error shown to the visitor.
    }
  }

  function applyPlayCounts() {
    document.querySelectorAll(".track-plays").forEach((el) => {
      const i = parseInt(el.dataset.index, 10);
      const track = TRACKS[i];
      if (!track) return;
      const count = playCounts[filenameFor(track)];
      if (typeof count === "number") {
        el.textContent = `${count.toLocaleString()} play${count === 1 ? "" : "s"}`;
        el.hidden = false;
      }
    });
  }

  async function loadPlayCounts() {
    try {
      const res = await fetch("/api/plays", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || typeof data.counts !== "object") return;
      playCounts = data.counts;
      applyPlayCounts();
    } catch (_) {
      // silent
    }
  }

  async function registerPlay(track) {
    try {
      const res = await fetch("/api/plays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ track: filenameFor(track) })
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || typeof data.counts !== "object") return;
      playCounts = data.counts;
      applyPlayCounts();
    } catch (_) {
      // silent — a missed play count is not worth surfacing to the listener
    }
  }

  loadVisitorCount();
  loadPlayCounts();

  return { registerPlay, applyPlayCounts };
})();
