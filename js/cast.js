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

  function notify() {
    listeners.forEach((fn) => fn(state()));
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

  function init() {
    if (!window.chrome || !window.chrome.cast || !window.cast) return;

    context = cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
    });

    available = true;

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
