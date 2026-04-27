import { useRef, useState, useCallback, useEffect } from 'react';

export function usePlayer({ onTrackEnd, onNextTrack, onTrackError } = {}) {
  const ytPlayerRef = useRef(null);
  const scWidgetRef = useRef(null);
  const currentSourceRef = useRef(null);
  const isExternalUpdateRef = useRef(false);
  const progressIntervalRef = useRef(null);
  const durationRef = useRef(0);
  const volumeRef = useRef(70);
  const ytReadyRef = useRef(false);
  const scReadyRef = useRef(false);
  const onTrackEndRef = useRef(onTrackEnd);
  const onNextTrackRef = useRef(onNextTrack);
  const onTrackErrorRef = useRef(onTrackError);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState({ currentTime: 0, duration: 0 });
  const [volume, setVolumeState] = useState(70);
  const [ytReady, setYtReady] = useState(false);
  const [scReady, setScReady] = useState(false);
  const [embedError, setEmbedError] = useState(null);

  useEffect(() => { onTrackEndRef.current = onTrackEnd; }, [onTrackEnd]);
  useEffect(() => { onNextTrackRef.current = onNextTrack; }, [onNextTrack]);
  useEffect(() => { onTrackErrorRef.current = onTrackError; }, [onTrackError]);

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

  const waitForBackend = useCallback((source, timeoutMs = 8000) => {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const check = () => {
        if (source === 'youtube' && ytReadyRef.current && ytPlayerRef.current) {
          resolve(ytPlayerRef.current);
          return;
        }
        if (source === 'soundcloud' && scReadyRef.current && scWidgetRef.current) {
          resolve(scWidgetRef.current);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }, []);

  const getCurrentTimeRaw = useCallback(() => {
    return new Promise(async (resolve) => {
      const src = currentSourceRef.current;
      if (src === 'youtube' && ytPlayerRef.current?.getCurrentTime) {
        resolve(ytPlayerRef.current.getCurrentTime() || 0);
      } else if (src === 'youtube') {
        const yt = await waitForBackend('youtube', 1200);
        resolve(yt?.getCurrentTime?.() || 0);
      } else if (src === 'soundcloud' && scWidgetRef.current) {
        scWidgetRef.current.getPosition((pos) => resolve((pos || 0) / 1000));
      } else if (src === 'soundcloud') {
        const sc = await waitForBackend('soundcloud', 1200);
        if (sc?.getPosition) sc.getPosition((pos) => resolve((pos || 0) / 1000));
        else resolve(0);
      } else {
        resolve(0);
      }
    });
  }, [waitForBackend]);

  const getDurationRaw = useCallback(() => {
    return new Promise(async (resolve) => {
      const src = currentSourceRef.current;
      if (src === 'youtube' && ytPlayerRef.current?.getDuration) {
        const d = ytPlayerRef.current.getDuration();
        if (d) { durationRef.current = d; resolve(d); }
        else resolve(durationRef.current);
      } else if (src === 'youtube') {
        const yt = await waitForBackend('youtube', 1200);
        const d = yt?.getDuration?.() || 0;
        if (d) durationRef.current = d;
        resolve(durationRef.current);
      } else if (src === 'soundcloud' && scWidgetRef.current) {
        scWidgetRef.current.getDuration((d) => {
          durationRef.current = (d || 0) / 1000;
          resolve(durationRef.current);
        });
      } else if (src === 'soundcloud') {
        const sc = await waitForBackend('soundcloud', 1200);
        if (sc?.getDuration) {
          sc.getDuration((d) => {
            durationRef.current = (d || 0) / 1000;
            resolve(durationRef.current);
          });
        } else {
          resolve(durationRef.current);
        }
      } else {
        resolve(durationRef.current);
      }
    });
  }, [waitForBackend]);

  const startProgressTracking = useCallback(() => {
    stopProgressTracking();
    const tick = async () => {
      const time = await getCurrentTimeRaw();
      const dur = await getDurationRaw();
      setProgress({ currentTime: time, duration: dur });
    };
    tick();
    progressIntervalRef.current = setInterval(tick, 500);
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
          ytReadyRef.current = true;
          setYtReady(true);
          setEmbedError(null);
        },
        onStateChange: (event) => {
          if (isExternalUpdateRef.current) return;
          const YT = window.YT;
          if (event.data === YT.PlayerState.PLAYING) {
            setEmbedError(null);
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
        onError: (event) => {
          const code = event?.data;
          console.error('[Player] YouTube error', code);
          setIsPlaying(false);
          stopProgressTracking();
          setEmbedError({
            source: 'youtube',
            code: typeof code === 'number' ? code : null,
          });
          onTrackErrorRef.current?.({
            source: 'youtube',
            code: typeof code === 'number' ? code : null,
          });
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
      scReadyRef.current = true;
      setScReady(true);
      setEmbedError(null);
    });
    widget.bind(window.SC.Widget.Events.PLAY, () => {
      if (isExternalUpdateRef.current) return;
      setEmbedError(null);
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
    if (window.SC.Widget.Events.ERROR) {
      widget.bind(window.SC.Widget.Events.ERROR, () => {
        setIsPlaying(false);
        stopProgressTracking();
        setEmbedError({ source: 'soundcloud', code: null });
        onTrackErrorRef.current?.({ source: 'soundcloud', code: null });
      });
    }
  }, [startProgressTracking, stopProgressTracking]);

  // ─── Load Track ───────────────────────────

  const loadTrack = useCallback(async (track) => {
    stopProgressTracking();
    currentSourceRef.current = track.source;
    durationRef.current = track.duration || 0;
    setProgress({ currentTime: 0, duration: durationRef.current });
    setEmbedError(null);

    return new Promise(async (resolve) => {
      isExternalUpdateRef.current = true;

      if (track.source === 'youtube') {
        const yt = ytReadyRef.current && ytPlayerRef.current
          ? ytPlayerRef.current
          : await waitForBackend('youtube');
        if (yt?.loadVideoById) {
          yt.loadVideoById({ videoId: track.sourceId, startSeconds: 0 });
          setTimeout(() => {
            yt.pauseVideo?.();
            yt.setVolume?.(volumeRef.current);
            isExternalUpdateRef.current = false;
            resolve();
          }, 400);
        } else {
          isExternalUpdateRef.current = false;
          resolve();
        }
      } else if (track.source === 'soundcloud') {
        const sc = scReadyRef.current && scWidgetRef.current
          ? scWidgetRef.current
          : await waitForBackend('soundcloud');
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
  }, [stopProgressTracking, waitForBackend]);

  // ─── Playback Controls ────────────────────

  const play = useCallback(() => {
    isExternalUpdateRef.current = true;
    const src = currentSourceRef.current;
    if (src === 'youtube') {
      if (ytPlayerRef.current?.playVideo) {
        ytPlayerRef.current.playVideo();
      } else {
        waitForBackend('youtube').then((yt) => yt?.playVideo?.());
      }
    } else if (src === 'soundcloud') {
      if (scWidgetRef.current?.play) {
        scWidgetRef.current.play();
      } else {
        waitForBackend('soundcloud').then((sc) => sc?.play?.());
      }
    }
    setIsPlaying(true);
    startProgressTracking();
    setTimeout(() => { isExternalUpdateRef.current = false; }, 300);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }, [startProgressTracking, waitForBackend]);

  const pause = useCallback(() => {
    isExternalUpdateRef.current = true;
    const src = currentSourceRef.current;
    if (src === 'youtube') {
      if (ytPlayerRef.current?.pauseVideo) ytPlayerRef.current.pauseVideo();
      else waitForBackend('youtube').then((yt) => yt?.pauseVideo?.());
    } else if (src === 'soundcloud') {
      if (scWidgetRef.current?.pause) scWidgetRef.current.pause();
      else waitForBackend('soundcloud').then((sc) => sc?.pause?.());
    }
    setIsPlaying(false);
    stopProgressTracking();
    setTimeout(() => { isExternalUpdateRef.current = false; }, 300);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }, [stopProgressTracking, waitForBackend]);

  const seekTo = useCallback((seconds) => {
    isExternalUpdateRef.current = true;
    const src = currentSourceRef.current;
    const t = Math.max(0, Number(seconds) || 0);
    if (src === 'youtube') {
      if (ytPlayerRef.current?.seekTo) ytPlayerRef.current.seekTo(t, true);
      else waitForBackend('youtube').then((yt) => yt?.seekTo?.(t, true));
    } else if (src === 'soundcloud') {
      if (scWidgetRef.current?.seekTo) scWidgetRef.current.seekTo(t * 1000);
      else waitForBackend('soundcloud').then((sc) => sc?.seekTo?.(t * 1000));
    }
    setProgress((p) => ({ ...p, currentTime: t }));
    setTimeout(() => { isExternalUpdateRef.current = false; }, 300);
  }, [waitForBackend]);

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
  const clearEmbedError = useCallback(() => setEmbedError(null), []);

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
    embedError,
    clearEmbedError,
    ytPlayerRef,
    scWidgetRef,
  };
}
