/**
 * NORTHWEST TRINITY — Chromecast integration
 *
 * Uses Google's CAF (Cast Application Framework) sender SDK with the
 * default media receiver, so no custom receiver app registration is
 * required. Loaded via cast_sender.js in index.html, which calls
 * window['__onGCastApiAvailable'] once the framework is ready.
 *
 * Exposes a small `TimberlineCast` API that js/player.js talks to.
 */
const TimberlineCast = (function () {
  let context = null;
  let available = false;
  let currentSession = null;
  const listeners = [];
  const endedListeners = [];

  let remotePlayer = null;
  let remotePlayerController = null;
  let lastIdleNotified = false;
  let lastProgress = 0;      // last known playback position (s)
  let lastDuration = 0;      // last known track length (s)
  let wasActive = false;     // was PLAYING/BUFFERING/PAUSED just before IDLE

  function notify() {
    listeners.forEach((fn) => fn(state()));
  }

  function notifyEnded() {
    endedListeners.forEach((fn) => fn());
  }

  function state() {
    return {
      available,
      connected: !!currentSession
    };
  }

  function onStateChange(fn) {
    listeners.push(fn);
  }

  /**
   * Registers a callback for when the currently-cast track finishes
   * playing on the receiver device. This is how auto-advance-to-next
   * works while casting — the local <audio> element never actually
   * plays anything in that mode, so its own "ended" event never fires.
   *
   * Uses cast.framework.RemotePlayerController, the SDK's documented
   * way to observe remote player state — a plain Media.addUpdateListener
   * on the raw session object turned out not to fire reliably here.
   */
  function onRemoteEnded(fn) {
    endedListeners.push(fn);
  }

  function handleRemotePlayerStateChanged() {
    if (!remotePlayer) return;
    const PS = chrome.cast.media.PlayerState;
    const isIdle = remotePlayer.playerState === PS.IDLE;
    if (!isIdle) {
      lastIdleNotified = false;
      wasActive = true;
      return;
    }
    if (lastIdleNotified || !wasActive) return; // don't double-fire
    wasActive = false;

    // Primary signal: the receiver says the media FINISHED.
    const media = currentSession && currentSession.getMediaSession();
    let finished = !!(media && media.idleReason === chrome.cast.media.IdleReason.FINISHED);

    // Fallback: some receivers drop the media session on finish, so also
    // treat "went idle within a few seconds of the end" as finished.
    if (!finished && lastDuration > 0 && lastDuration - lastProgress < 3) finished = true;

    if (finished) {
      lastIdleNotified = true;
      notifyEnded();
    }
  }

  function handleRemoteTime() {
    if (!remotePlayer) return;
    if (remotePlayer.currentTime) lastProgress = remotePlayer.currentTime;
    if (remotePlayer.duration) lastDuration = remotePlayer.duration;
  }

  function init() {
    if (!window.chrome || !window.chrome.cast || !window.cast) return;

    context = cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
    });

    available = true;

    remotePlayer = new cast.framework.RemotePlayer();
    remotePlayerController = new cast.framework.RemotePlayerController(remotePlayer);
    remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.PLAYER_STATE_CHANGED,
      handleRemotePlayerStateChanged
    );

    remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.CURRENT_TIME_CHANGED,
      handleRemoteTime
    );
    remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.DURATION_CHANGED,
      handleRemoteTime
    );

    context.addEventListener(
      cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      (evt) => {
        const S = cast.framework.SessionState;
        if (evt.sessionState === S.SESSION_STARTED || evt.sessionState === S.SESSION_RESUMED) {
          currentSession = context.getCurrentSession();
        } else if (evt.sessionState === S.SESSION_ENDED) {
          currentSession = null;
        }
        notify();
      }
    );

    notify();
  }

  // Called by the Cast SDK bootstrap script once the framework loads.
  window["__onGCastApiAvailable"] = function (isAvailable) {
    if (isAvailable) init();
  };

  /**
   * Request a cast session (opens the device picker if none is active),
   * then load the given track onto the receiver.
   * track: { title, src, num }
   */
  async function castTrack(track, absoluteUrl) {
    if (!available) {
      throw new Error("Cast unavailable in this browser.");
    }
    if (!currentSession) {
      await context.requestSession();
      currentSession = context.getCurrentSession();
    }
    if (!currentSession) return;

    lastIdleNotified = false;
    wasActive = false;
    lastProgress = 0;
    lastDuration = 0;

    const mediaInfo = new chrome.cast.media.MediaInfo(absoluteUrl, "audio/mpeg");
    mediaInfo.metadata = new chrome.cast.media.MusicTrackMediaMetadata();
    mediaInfo.metadata.title = track.title;
    mediaInfo.metadata.artist = "Northwest Trinity";

    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    return currentSession.loadMedia(request);
  }

  function pauseRemote() {
    const media = currentSession && currentSession.getMediaSession();
    if (media) media.pause(new chrome.cast.media.PauseRequest());
  }

  function playRemote() {
    const media = currentSession && currentSession.getMediaSession();
    if (media) media.play(new chrome.cast.media.PlayRequest());
  }

  function endSession() {
    if (currentSession) {
      context.endCurrentSession(true);
      currentSession = null;
      notify();
    }
  }

  function isConnected() {
    return !!currentSession;
  }

  return {
    onStateChange,
    onRemoteEnded,
    castTrack,
    pauseRemote,
    playRemote,
    endSession,
    isConnected,
    get available() {
      return available;
    }
  };
})();
