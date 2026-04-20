/**
 * JAMSC - Unified Player Controller
 * Manages YouTube and SoundCloud players with synchronized playback
 */

const Player = (() => {
  let ytPlayer = null;
  let scWidget = null;
  let currentSource = null; // 'youtube' | 'soundcloud'
  let isExternalUpdate = false; // Prevent feedback loops
  let onStateChangeCallback = null;
  let onTrackEndCallback = null;
  let onNextTrackCallback = null; // For Media Session nexttrack action
  let progressInterval = null;
  let duration = 0;
  let isReady = { youtube: false, soundcloud: false };
  let volume = 70;
  let pendingTrack = null; // Track to load once player is ready

  // ─── Media Session API ────────────────────

  function initMediaSession() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      play();
      if (onStateChangeCallback) onStateChangeCallback('playing');
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      pause();
      if (onStateChangeCallback) onStateChangeCallback('paused');
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      if (onNextTrackCallback) onNextTrackCallback();
    });

    navigator.mediaSession.setActionHandler('stop', () => {
      pause();
    });
  }

  /**
   * Update Media Session metadata (shown on lock screen / notification)
   */
  function updateMediaSession(track) {
    if (!('mediaSession' in navigator)) return;

    const artwork = [];
    if (track.thumbnail) {
      artwork.push({ src: track.thumbnail, sizes: '256x256', type: 'image/jpeg' });
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Đang tải...',
      artist: track.addedBy ? `Thêm bởi ${track.addedBy}` : 'JAMSC',
      album: track.source === 'youtube' ? 'YouTube' : 'SoundCloud',
      artwork,
    });
  }

  /**
   * Update Media Session playback state
   */
  function setMediaSessionPlaybackState(state) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = state; // 'playing' | 'paused' | 'none'
  }

  /**
   * Register callback for next track (triggered from lock screen)
   */
  function onNextTrack(cb) {
    onNextTrackCallback = cb;
  }

  // ─── YouTube Player ───────────────────────

  /**
   * Initialize YouTube player (called by YT API callback)
   */
  function initYouTube() {
    ytPlayer = new YT.Player('youtube-player', {
      height: '100%',
      width: '100%',
      playerVars: {
        autoplay: 0,
        controls: 0, // Hide native controls
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
        iv_load_policy: 3,
        playsinline: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          isReady.youtube = true;
          ytPlayer.setVolume(volume);
          console.log('[Player] YouTube ready');
          if (pendingTrack && pendingTrack.source === 'youtube') {
            const t = pendingTrack;
            pendingTrack = null;
            loadTrack(t);
          }
        },
        onStateChange: (event) => {
          if (isExternalUpdate) return;

          switch (event.data) {
            case YT.PlayerState.PLAYING:
              if (onStateChangeCallback) onStateChangeCallback('playing');
              startProgressTracking();
              break;
            case YT.PlayerState.PAUSED:
              if (onStateChangeCallback) onStateChangeCallback('paused');
              stopProgressTracking();
              break;
            case YT.PlayerState.ENDED:
              if (onTrackEndCallback) onTrackEndCallback();
              stopProgressTracking();
              break;
            case YT.PlayerState.BUFFERING:
              // Ignore
              break;
          }
        },
        onError: (event) => {
          console.error('[Player] YouTube error:', event.data);
          UI.showToast('Không thể phát video này', 'error');
        },
      },
    });
  }

  // ─── SoundCloud Player ────────────────────

  function initSoundCloud() {
    const iframe = document.getElementById('soundcloud-player');
    scWidget = SC.Widget(iframe);

    scWidget.bind(SC.Widget.Events.READY, () => {
      isReady.soundcloud = true;
      scWidget.setVolume(volume);
      console.log('[Player] SoundCloud ready');
    });

    scWidget.bind(SC.Widget.Events.PLAY, () => {
      if (isExternalUpdate) return;
      if (onStateChangeCallback) onStateChangeCallback('playing');
      startProgressTracking();
    });

    scWidget.bind(SC.Widget.Events.PAUSE, () => {
      if (isExternalUpdate) return;
      if (onStateChangeCallback) onStateChangeCallback('paused');
      stopProgressTracking();
    });

    scWidget.bind(SC.Widget.Events.FINISH, () => {
      if (onTrackEndCallback) onTrackEndCallback();
      stopProgressTracking();
    });

    scWidget.bind(SC.Widget.Events.ERROR, () => {
      console.error('[Player] SoundCloud error');
      UI.showToast('Không thể phát bài hát SoundCloud này', 'error');
    });
  }

  // ─── Unified Interface ────────────────────

  /**
   * Load a track based on source type.
   * Returns a Promise that resolves once the player starts loading the video.
   * If the player is not ready yet, the track is queued for when it becomes ready.
   */
  function loadTrack(track) {
    stopProgressTracking();

    if (track.source !== 'youtube') {
      const fs = document.fullscreenElement || document.webkitFullscreenElement;
      if (fs && fs.id === 'youtube-player-container') {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document).catch(() => {});
      }
    }

    // Stop currently playing source before loading new track
    isExternalUpdate = true;
    if (currentSource === 'youtube' && ytPlayer && isReady.youtube) {
      ytPlayer.pauseVideo();
    } else if (currentSource === 'soundcloud' && scWidget && isReady.soundcloud) {
      scWidget.pause();
    }

    currentSource = track.source;
    duration = track.duration || 0;

    const ytContainer = document.getElementById('youtube-player-container');
    const scContainer = document.getElementById('soundcloud-player-container');

    return new Promise((resolve) => {
      if (track.source === 'youtube') {
        ytContainer.style.display = 'block';
        scContainer.style.display = 'none';

        if (ytPlayer && isReady.youtube) {
          isExternalUpdate = true;
          ytPlayer.loadVideoById({ videoId: track.sourceId, startSeconds: 0 });
          setTimeout(() => {
            ytPlayer.pauseVideo();
            isExternalUpdate = false;
            resolve();
          }, 800);
        } else {
          // Player not ready — store and resolve when ready
          pendingTrack = track;
          // Resolve immediately so caller can still proceed after YouTube is ready
          // The actual load will happen in onReady
          const checkReady = setInterval(() => {
            if (isReady.youtube && ytPlayer) {
              clearInterval(checkReady);
              // Only load if this track is still the pending one
              if (pendingTrack && pendingTrack.sourceId === track.sourceId) {
                pendingTrack = null;
                isExternalUpdate = true;
                ytPlayer.loadVideoById({ videoId: track.sourceId, startSeconds: 0 });
                setTimeout(() => {
                  ytPlayer.pauseVideo();
                  isExternalUpdate = false;
                  resolve();
                }, 800);
              } else {
                resolve();
              }
            }
          }, 200);
        }
      } else if (track.source === 'soundcloud') {
        ytContainer.style.display = 'none';
        scContainer.style.display = 'block';

        if (scWidget && isReady.soundcloud) {
          isExternalUpdate = true;
          scWidget.load(track.sourceId, {
            auto_play: false,
            show_artwork: true,
            hide_related: true,
            show_comments: false,
            show_user: true,
            show_reposts: false,
            show_teaser: false,
            color: '#7b2ff7',
            callback: () => {
              isExternalUpdate = false;
              scWidget.getDuration((d) => {
                duration = d / 1000;
                updateDurationDisplay();
              });
              resolve();
            },
          });
        } else {
          pendingTrack = track;
          resolve();
        }
      } else {
        resolve();
      }

      updateDurationDisplay();
    });
  }

  /**
   * Play
   */
  function play() {
    isExternalUpdate = true;
    if (currentSource === 'youtube' && ytPlayer) {
      ytPlayer.playVideo();
    } else if (currentSource === 'soundcloud' && scWidget) {
      scWidget.play();
    }
    startProgressTracking();
    setTimeout(() => { isExternalUpdate = false; }, 300);
    updatePlayButton(true);
    setMediaSessionPlaybackState('playing');
  }

  /**
   * Pause
   */
  function pause() {
    isExternalUpdate = true;
    if (currentSource === 'youtube' && ytPlayer) {
      ytPlayer.pauseVideo();
    } else if (currentSource === 'soundcloud' && scWidget) {
      scWidget.pause();
    }
    stopProgressTracking();
    setTimeout(() => { isExternalUpdate = false; }, 300);
    updatePlayButton(false);
    setMediaSessionPlaybackState('paused');
  }

  /**
   * Seek to specific time (seconds)
   */
  function seekTo(seconds) {
    isExternalUpdate = true;
    if (currentSource === 'youtube' && ytPlayer) {
      ytPlayer.seekTo(seconds, true);
    } else if (currentSource === 'soundcloud' && scWidget) {
      scWidget.seekTo(seconds * 1000);
    }
    setTimeout(() => { isExternalUpdate = false; }, 300);
  }

  /**
   * Get current time (returns Promise<number> in seconds)
   */
  function getCurrentTime() {
    return new Promise((resolve) => {
      if (currentSource === 'youtube' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
        resolve(ytPlayer.getCurrentTime() || 0);
      } else if (currentSource === 'soundcloud' && scWidget) {
        scWidget.getPosition((pos) => {
          resolve((pos || 0) / 1000);
        });
      } else {
        resolve(0);
      }
    });
  }

  /**
   * Last known duration in seconds (synchronous; may be 0 before widget reports length)
   */
  function getCachedDuration() {
    return duration > 0 ? duration : 0;
  }

  /**
   * Get duration (returns Promise<number> in seconds)
   */
  function getDuration() {
    return new Promise((resolve) => {
      if (currentSource === 'youtube' && ytPlayer && typeof ytPlayer.getDuration === 'function') {
        const d = ytPlayer.getDuration();
        if (d) {
          duration = d;
          resolve(d);
        } else {
          resolve(duration);
        }
      } else if (currentSource === 'soundcloud' && scWidget) {
        scWidget.getDuration((d) => {
          duration = (d || 0) / 1000;
          resolve(duration);
        });
      } else {
        resolve(duration);
      }
    });
  }

  /**
   * Set volume (0-100)
   */
  function setVolume(val) {
    volume = val;
    if (ytPlayer && typeof ytPlayer.setVolume === 'function') {
      ytPlayer.setVolume(val);
    }
    if (scWidget) {
      scWidget.setVolume(val);
    }

    // Update volume icon
    const iconOn = document.getElementById('icon-volume-on');
    const iconOff = document.getElementById('icon-volume-off');
    if (iconOn && iconOff) {
      if (val === 0) {
        iconOn.style.display = 'none';
        iconOff.style.display = 'block';
      } else {
        iconOn.style.display = 'block';
        iconOff.style.display = 'none';
      }
    }
  }

  /**
   * Set callbacks
   */
  function onStateChange(cb) {
    onStateChangeCallback = cb;
  }

  function onTrackEnd(cb) {
    onTrackEndCallback = cb;
  }

  // ─── Progress Tracking ────────────────────

  function startProgressTracking() {
    stopProgressTracking();
    progressInterval = setInterval(async () => {
      const time = await getCurrentTime();
      const dur = await getDuration();
      updateProgressUI(time, dur);
    }, 500);
  }

  function stopProgressTracking() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }

  function updateProgressUI(currentTime, totalDuration) {
    const fill = document.getElementById('progress-fill');
    const timeCurrent = document.getElementById('time-current');
    const timeDuration = document.getElementById('time-duration');

    if (fill && totalDuration > 0) {
      const pct = Math.min((currentTime / totalDuration) * 100, 100);
      fill.style.width = pct + '%';
    }

    if (timeCurrent) {
      timeCurrent.textContent = UI.formatTime(currentTime);
    }

    if (timeDuration && totalDuration > 0) {
      timeDuration.textContent = UI.formatTime(totalDuration);
    }
  }

  function updateDurationDisplay() {
    const timeDuration = document.getElementById('time-duration');
    if (timeDuration && duration > 0) {
      timeDuration.textContent = UI.formatTime(duration);
    }
  }

  function updatePlayButton(isPlaying) {
    const iconPlay = document.getElementById('icon-play');
    const iconPause = document.getElementById('icon-pause');
    const indicator = document.getElementById('playing-indicator');

    if (iconPlay && iconPause) {
      iconPlay.style.display = isPlaying ? 'none' : 'block';
      iconPause.style.display = isPlaying ? 'block' : 'none';
    }

    if (indicator) {
      if (isPlaying) {
        indicator.classList.add('active');
      } else {
        indicator.classList.remove('active');
      }
    }
  }

  /**
   * Get title from YouTube player
   */
  function getYouTubeTitle() {
    return new Promise((resolve) => {
      if (ytPlayer && typeof ytPlayer.getVideoData === 'function') {
        const data = ytPlayer.getVideoData();
        resolve(data.title || '');
      } else {
        resolve('');
      }
    });
  }

  /**
   * Get current source
   */
  function getSource() {
    return currentSource;
  }

  return {
    initYouTube,
    initSoundCloud,
    initMediaSession,
    loadTrack,
    play,
    pause,
    seekTo,
    getCurrentTime,
    getCachedDuration,
    getDuration,
    setVolume,
    onStateChange,
    onTrackEnd,
    onNextTrack,
    updateMediaSession,
    updatePlayButton,
    updateProgressUI,
    getYouTubeTitle,
    getSource,
  };
})();

// YouTube IFrame API callback
function onYouTubeIframeAPIReady() {
  Player.initYouTube();
}
