import { useRef, useState, useCallback, useEffect } from 'react';

export function usePlayer({ onTrackEnd, onNextTrack } = {}) {
  const ytPlayerRef = useRef(null);
  const scWidgetRef = useRef(null);
  const currentSourceRef = useRef(null);
  const isExternalUpdateRef = useRef(false);
  const progressIntervalRef = useRef(null);
  const durationRef = useRef(0);
  const volumeRef = useRef(70);
  const onTrackEndRef = useRef(onTrackEnd);
  const onNextTrackRef = useRef(onNextTrack);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState({ currentTime: 0, duration: 0 });
  const [volume, setVolumeState] = useState(70);
  const [ytReady, setYtReady] = useState(false);
  const [scReady, setScReady] = useState(false);

  useEffect(() => { onTrackEndRef.current = onTrackEnd; }, [onTrackEnd]);
  useEffect(() => { onNextTrackRef.current = onNextTrack; }, [onNextTrack]);

  // ─── Media Session ────────────────────────

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => play());
    navigator.mediaSession.setActionHandler('pause', () => pause());
    navigator.mediaSession.setActionHandler('stop', () => pause());
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      onNextTrackRef.current?.();
    });

    return () => {
      ['play', 'pause', 'stop', 'nexttrack'].forEach((a) => {
        try { navigator.mediaSession.setActionHandler(a, null); } catch (_) {}
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateMediaSession = useCallback((track) => {
    if (!('mediaSession' in navigator)) return;
    const artwork = track.thumbnail
      ? [{ src: track.thumbnail, sizes: '256x256', type: 'image/jpeg' }]
      : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Đang tải...',
      artist: track.addedBy ? `Thêm bởi ${track.addedBy}` : 'JAMSC',
      album: track.source === 'youtube' ? 'YouTube' : 'SoundCloud',
      artwork,
    });
  }, []);

  // ─── Progress Tracking ────────────────────

  const stopProgressTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const getCurrentTimeRaw = useCallback(() => {
    return new Promise((resolve) => {
      const src = currentSourceRef.current;
      if (src === 'youtube' && ytPlayerRef.current?.getCurrentTime) {
        resolve(ytPlayerRef.current.getCurrentTime() || 0);
      } else if (src === 'soundcloud' && scWidgetRef.current) {
        scWidgetRef.current.getPosition((pos) => resolve((pos || 0) / 1000));
      } else {
        resolve(0);
      }
    });
  }, []);

  const getDurationRaw = useCallback(() => {
    return new Promise((resolve) => {
      const src = currentSourceRef.current;
      if (src === 'youtube' && ytPlayerRef.current?.getDuration) {
        const d = ytPlayerRef.current.getDuration();
        if (d) { durationRef.current = d; resolve(d); }
        else resolve(durationRef.current);
      } else if (src === 'soundcloud' && scWidgetRef.current) {
        scWidgetRef.current.getDuration((d) => {
          durationRef.current = (d || 0) / 1000;
          resolve(durationRef.current);
        });
      } else {
        resolve(durationRef.current);
      }
    });
  }, []);

  const startProgressTracking = useCallback(() => {
    stopProgressTracking();
    progressIntervalRef.current = setInterval(async () => {
      const time = await getCurrentTimeRaw();
      const dur = await getDurationRaw();
      setProgress({ currentTime: time, duration: dur });
    }, 500);
  }, [stopProgressTracking, getCurrentTimeRaw, getDurationRaw]);

  // ─── YouTube Init ─────────────────────────

  const initYouTube = useCallback((elementId) => {
    if (!window.YT?.Player) return;
    ytPlayerRef.current = new window.YT.Player(elementId, {
      height: '100%',
      width: '100%',
      playerVars: {
        autoplay: 0,
        controls: 0,
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
          ytPlayerRef.current.setVolume(volumeRef.current);
          setYtReady(true);
        },
        onStateChange: (event) => {
          if (isExternalUpdateRef.current) return;
          const YT = window.YT;
          if (event.data === YT.PlayerState.PLAYING) {
            setIsPlaying(true);
            startProgressTracking();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
          } else if (event.data === YT.PlayerState.PAUSED) {
            setIsPlaying(false);
            stopProgressTracking();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
          } else if (event.data === YT.PlayerState.ENDED) {
            setIsPlaying(false);
            stopProgressTracking();
            onTrackEndRef.current?.();
          }
        },
        onError: () => {
          console.error('[Player] YouTube error');
        },
      },
    });
  }, [startProgressTracking, stopProgressTracking]);

  // ─── SoundCloud Init ──────────────────────

  const initSoundCloud = useCallback((iframeEl) => {
    if (!window.SC?.Widget || !iframeEl) return;
    const widget = window.SC.Widget(iframeEl);
    scWidgetRef.current = widget;

    widget.bind(window.SC.Widget.Events.READY, () => {
      widget.setVolume(volumeRef.current);
      setScReady(true);
    });
    widget.bind(window.SC.Widget.Events.PLAY, () => {
      if (isExternalUpdateRef.current) return;
      setIsPlaying(true);
      startProgressTracking();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    });
    widget.bind(window.SC.Widget.Events.PAUSE, () => {
      if (isExternalUpdateRef.current) return;
      setIsPlaying(false);
      stopProgressTracking();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    });
    widget.bind(window.SC.Widget.Events.FINISH, () => {
      setIsPlaying(false);
      stopProgressTracking();
      onTrackEndRef.current?.();
    });
  }, [startProgressTracking, stopProgressTracking]);

  // ─── Load Track ───────────────────────────

  const loadTrack = useCallback((track) => {
    stopProgressTracking();
    currentSourceRef.current = track.source;
    durationRef.current = track.duration || 0;

    return new Promise((resolve) => {
      isExternalUpdateRef.current = true;

      if (track.source === 'youtube') {
        const yt = ytPlayerRef.current;
        if (yt?.loadVideoById) {
          yt.loadVideoById({ videoId: track.sourceId, startSeconds: 0 });
          setTimeout(() => {
            yt.pauseVideo?.();
            yt.setVolume?.(volumeRef.current);
            isExternalUpdateRef.current = false;
            resolve();
          }, 800);
        } else {
          isExternalUpdateRef.current = false;
          resolve();
        }
      } else if (track.source === 'soundcloud') {
        const sc = scWidgetRef.current;
        if (sc) {
          sc.load(track.sourceId, {
            auto_play: false,
            hide_related: true,
            show_comments: false,
            show_user: true,
            show_reposts: false,
            color: '#7b2ff7',
            callback: () => {
              isExternalUpdateRef.current = false;
              sc.setVolume?.(volumeRef.current);
              sc.getDuration((d) => {
                durationRef.current = (d || 0) / 1000;
                setProgress((p) => ({ ...p, duration: durationRef.current }));
              });
              resolve();
            },
          });
        } else {
          isExternalUpdateRef.current = false;
          resolve();
        }
      } else {
        isExternalUpdateRef.current = false;
        resolve();
      }
    });
  }, [stopProgressTracking]);

  // ─── Playback Controls ────────────────────

  const play = useCallback(() => {
    isExternalUpdateRef.current = true;
    const src = currentSourceRef.current;
    if (src === 'youtube') ytPlayerRef.current?.playVideo?.();
    else if (src === 'soundcloud') scWidgetRef.current?.play?.();
    setIsPlaying(true);
    startProgressTracking();
    setTimeout(() => { isExternalUpdateRef.current = false; }, 300);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }, [startProgressTracking]);

  const pause = useCallback(() => {
    isExternalUpdateRef.current = true;
    const src = currentSourceRef.current;
    if (src === 'youtube') ytPlayerRef.current?.pauseVideo?.();
    else if (src === 'soundcloud') scWidgetRef.current?.pause?.();
    setIsPlaying(false);
    stopProgressTracking();
    setTimeout(() => { isExternalUpdateRef.current = false; }, 300);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }, [stopProgressTracking]);

  const seekTo = useCallback((seconds) => {
    isExternalUpdateRef.current = true;
    const src = currentSourceRef.current;
    if (src === 'youtube') ytPlayerRef.current?.seekTo?.(seconds, true);
    else if (src === 'soundcloud') scWidgetRef.current?.seekTo?.(seconds * 1000);
    setTimeout(() => { isExternalUpdateRef.current = false; }, 300);
  }, []);

  const setVolume = useCallback((val) => {
    volumeRef.current = val;
    setVolumeState(val);
    ytPlayerRef.current?.setVolume?.(val);
    scWidgetRef.current?.setVolume?.(val);
  }, []);

  const getCurrentTime = useCallback(() => getCurrentTimeRaw(), [getCurrentTimeRaw]);

  const getCachedDuration = useCallback(() => durationRef.current, []);

  const getYouTubeTitle = useCallback(() => {
    return new Promise((resolve) => {
      if (ytPlayerRef.current?.getVideoData) {
        resolve(ytPlayerRef.current.getVideoData().title || '');
      } else {
        resolve('');
      }
    });
  }, []);

  const getCurrentSource = useCallback(() => currentSourceRef.current, []);

  return {
    initYouTube,
    initSoundCloud,
    loadTrack,
    play,
    pause,
    seekTo,
    setVolume,
    getCurrentTime,
    getCachedDuration,
    getYouTubeTitle,
    getCurrentSource,
    updateMediaSession,
    isPlaying,
    progress,
    volume,
    ytReady,
    scReady,
    ytPlayerRef,
    scWidgetRef,
  };
}
