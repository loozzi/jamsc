import { useEffect, useRef, useCallback, useState } from 'react';

const PLAYER_WIDTH_KEY = 'jamsc-player-width';

export default function PlayerContainer({ player, currentTrack }) {
  const wrapperRef = useRef(null);
  const resizeHandleRef = useRef(null);
  const ytContainerRef = useRef(null);
  const scIframeRef = useRef(null);
  const ytDivRef = useRef(null);

  const ytInitedRef = useRef(false);
  const scInitedRef = useRef(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const isYoutube = currentTrack?.source === 'youtube';
  const embedError = player.embedError;
  const showYoutubeFallback = isYoutube && embedError?.source === 'youtube';
  const showSoundCloudFallback = currentTrack?.source === 'soundcloud' && embedError?.source === 'soundcloud';

  function getFallbackMessage() {
    const code = Number(embedError?.code);
    if (embedError?.source === 'youtube') {
      if (code === 101 || code === 150) {
        return 'Video này bị chặn phát nhúng hoặc giới hạn theo tài khoản/khu vực/độ tuổi.';
      }
      if (code === 100) {
        return 'Video đã bị gỡ, để riêng tư hoặc không còn tồn tại.';
      }
      if (code === 2) {
        return 'ID video không hợp lệ hoặc link video không còn dùng được.';
      }
      if (code === 5) {
        return 'Trình phát nhúng không thể tải video này trong trình duyệt hiện tại.';
      }
      return 'Video này không thể phát nhúng ngay lúc này.';
    }
    if (embedError?.source === 'soundcloud') {
      return 'Track SoundCloud này không thể phát nhúng ngay lúc này.';
    }
    return 'Nội dung này chưa thể phát nhúng.';
  }

  // ─── Init YouTube ─────────────────────────

  useEffect(() => {
    function tryInit() {
      if (window.YT?.Player && ytDivRef.current && !ytInitedRef.current) {
        ytInitedRef.current = true;
        player.initYouTube('youtube-player');
      }
    }

    // YT API might already be loaded
    tryInit();

    // Or wait for the callback
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      tryInit();
    };

    // Load YT script if not present
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Init SoundCloud ──────────────────────

  useEffect(() => {
    function tryInitSC() {
      if (window.SC?.Widget && scIframeRef.current && !scInitedRef.current) {
        scInitedRef.current = true;
        player.initSoundCloud(scIframeRef.current);
      }
    }

    if (!document.querySelector('script[src*="soundcloud.com/player/api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://w.soundcloud.com/player/api.js';
      tag.onload = tryInitSC;
      document.head.appendChild(tag);
    } else {
      tryInitSC();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Player Width Restore ─────────────────

  useEffect(() => {
    const wrap = wrapperRef.current;
    if (!wrap) return;
    try {
      const raw = localStorage.getItem(PLAYER_WIDTH_KEY);
      if (raw) {
        const w = parseInt(raw, 10);
        if (Number.isFinite(w)) wrap.style.setProperty('--player-custom-width', `${w}px`);
      }
    } catch (_) {}
  }, []);

  // ─── Resize Handle ────────────────────────

  useEffect(() => {
    const handle = resizeHandleRef.current;
    const wrap = wrapperRef.current;
    if (!handle || !wrap) return;

    let active = false;
    let startX = 0;
    let startW = 0;
    let ptrId = null;

    function clamp(px) {
      const avail = wrap.parentElement ? wrap.parentElement.clientWidth : window.innerWidth;
      return Math.round(Math.min(Math.min(avail, 1600), Math.max(260, px)));
    }

    function onDown(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      active = true;
      ptrId = e.pointerId;
      startX = e.clientX;
      startW = wrap.getBoundingClientRect().width;
      document.body.classList.add('player-resize-active');
      handle.setPointerCapture(e.pointerId);
    }

    function onMove(e) {
      if (!active || e.pointerId !== ptrId) return;
      wrap.style.setProperty('--player-custom-width', `${clamp(startW + e.clientX - startX)}px`);
    }

    function onUp(e) {
      if (!active || e.pointerId !== ptrId) return;
      active = false;
      ptrId = null;
      document.body.classList.remove('player-resize-active');
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      try {
        localStorage.setItem(PLAYER_WIDTH_KEY, String(clamp(wrap.getBoundingClientRect().width)));
      } catch (_) {}
    }

    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);

    return () => {
      handle.removeEventListener('pointerdown', onDown);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // ─── Fullscreen ───────────────────────────

  const toggleFullscreen = useCallback(async () => {
    const container = ytContainerRef.current;
    if (!container) return;
    try {
      const fs = document.fullscreenElement || document.webkitFullscreenElement;
      if (!fs) {
        await (container.requestFullscreen ?? container.webkitRequestFullscreen)?.call(container);
      } else {
        await (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    const update = () => {
      const fs = document.fullscreenElement || document.webkitFullscreenElement;
      setIsExpanded(fs === ytContainerRef.current);
    };
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
  }, []);

  return (
    <div ref={wrapperRef} className="player-wrapper">
      {/* YouTube */}
      <div
        ref={ytContainerRef}
        id="youtube-player-container"
        className="player-embed"
        style={{ display: isYoutube || !currentTrack ? 'block' : 'none' }}
      >
        <div id="youtube-player" ref={ytDivRef} style={{ display: showYoutubeFallback ? 'none' : 'block' }} />
        {showYoutubeFallback && (
          <div className="player-fallback">
            <div className="player-fallback-title">Không thể phát video nhúng</div>
            <p className="player-fallback-text">{getFallbackMessage()}</p>
            <a
              className="player-fallback-link"
              href={currentTrack?.url || '#'}
              target="_blank"
              rel="noreferrer"
              onClick={() => player.clearEmbedError?.()}
            >
              Mở trên YouTube
            </a>
          </div>
        )}
        {currentTrack?.source === 'youtube' && !showYoutubeFallback && (
          <button
            type="button"
            className="btn-player-expand"
            onClick={toggleFullscreen}
            title={isExpanded ? 'Thoát toàn màn hình' : 'Toàn màn hình (video)'}
          >
            {isExpanded ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" />
                <line x1="10" y1="14" x2="3" y2="21" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* SoundCloud */}
      <div
        id="soundcloud-player-container"
        className="player-embed"
        style={{ display: currentTrack?.source === 'soundcloud' ? 'block' : 'none' }}
      >
        <iframe
          ref={scIframeRef}
          id="soundcloud-player"
          width="100%"
          height="166"
          scrolling="no"
          frameBorder="no"
          allow="autoplay"
          style={{ display: showSoundCloudFallback ? 'none' : 'block' }}
          src="https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/293&color=%237b2ff7&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false"
        />
        {showSoundCloudFallback && (
          <div className="player-fallback player-fallback-soundcloud">
            <div className="player-fallback-title">Không thể phát track nhúng</div>
            <p className="player-fallback-text">{getFallbackMessage()}</p>
            <a
              className="player-fallback-link"
              href={currentTrack?.url || '#'}
              target="_blank"
              rel="noreferrer"
              onClick={() => player.clearEmbedError?.()}
            >
              Mở trên SoundCloud
            </a>
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        ref={resizeHandleRef}
        className="player-resize-handle"
        id="player-resize-handle"
        role="separator"
        aria-label="Kéo để chỉnh kích thước"
        title="Kéo để chỉnh kích thước vùng phát"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <line x1="9" y1="15" x2="15" y2="9" />
          <line x1="5" y1="19" x2="19" y2="5" />
          <line x1="13" y1="19" x2="19" y2="13" />
        </svg>
      </div>
    </div>
  );
}
