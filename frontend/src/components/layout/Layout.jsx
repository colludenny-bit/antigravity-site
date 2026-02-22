import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { MobileQuickDock } from './MobileQuickDock';

// Karion Logo Component using user's original PNG image
import kairongLogo from '../../assets/kairon-logo.png';

const DASHBOARD_BG_VIDEO = '/videos/efecto-recording-2026-02-22T15-08-17.mp4';
const VIDEO_CROSSFADE_SECONDS = 1.35;
const VIDEO_BASE_OPACITY = 0.82;

const KarionLogo = ({ className = "", size = "default" }) => {
  const sizes = {
    small: { height: 40 },
    default: { height: 60 },
    large: { height: 80 }
  };
  const { height } = sizes[size] || sizes.default;

  return (
    <div
      className={`relative ${className}`}
      style={{
        filter: 'drop-shadow(0 4px 12px rgba(180, 180, 180, 0.2)) drop-shadow(0 0 20px rgba(140, 120, 90, 0.1))'
      }}
    >
      <img
        src={kairongLogo}
        alt="Kairon"
        style={{ height: `${height}px`, width: 'auto' }}
        className="transition-transform hover:scale-105"
      />
    </div>
  );
};

export const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const dashboardVideoARef = useRef(null);
  const dashboardVideoBRef = useRef(null);
  const loopFadeLayerRef = useRef(null);
  const activeVideoIndexRef = useRef(0);
  const isCrossfadingRef = useRef(false);
  const crossfadeStartTsRef = useRef(0);
  const location = useLocation();
  const isDashboardRoute = /^\/app\/?$/.test(location.pathname);

  useEffect(() => {
    if (!isDashboardRoute) return undefined;

    const playSilently = (video) => {
      if (!video) return;
      const playback = video.play();
      if (playback && typeof playback.catch === 'function') {
        playback.catch(() => null);
      }
    };

    const videoA = dashboardVideoARef.current;
    const videoB = dashboardVideoBRef.current;
    if (!videoA || !videoB) return undefined;

    activeVideoIndexRef.current = 0;
    isCrossfadingRef.current = false;
    crossfadeStartTsRef.current = 0;

    try {
      videoA.currentTime = 0;
      videoB.currentTime = 0;
    } catch (error) {
      // Ignore metadata timing race; playback proceeds once media is ready.
    }
    videoA.style.opacity = VIDEO_BASE_OPACITY.toFixed(3);
    videoB.style.opacity = '0';
    playSilently(videoA);
    videoB.pause();

    if (loopFadeLayerRef.current) {
      loopFadeLayerRef.current.style.opacity = '0.03';
    }

    let rafId = 0;
    const tick = (timestamp) => {
      const activeVideo = activeVideoIndexRef.current === 0 ? videoA : videoB;
      const nextVideo = activeVideoIndexRef.current === 0 ? videoB : videoA;
      const fadeLayer = loopFadeLayerRef.current;

      const duration = activeVideo.duration;
      if (Number.isFinite(duration) && duration > 0) {
        const remaining = duration - activeVideo.currentTime;

        if (!isCrossfadingRef.current && remaining <= VIDEO_CROSSFADE_SECONDS) {
          isCrossfadingRef.current = true;
          crossfadeStartTsRef.current = timestamp;
          try {
            nextVideo.currentTime = 0;
          } catch (error) {
            // Ignore metadata timing race; next frame will retry naturally.
          }
          nextVideo.style.opacity = '0';
          playSilently(nextVideo);
        }

        if (isCrossfadingRef.current) {
          const elapsedSeconds = (timestamp - crossfadeStartTsRef.current) / 1000;
          const raw = Math.min(1, Math.max(0, elapsedSeconds / VIDEO_CROSSFADE_SECONDS));
          const eased = raw * raw * (3 - 2 * raw); // smoothstep

          activeVideo.style.opacity = (VIDEO_BASE_OPACITY * (1 - eased)).toFixed(3);
          nextVideo.style.opacity = (VIDEO_BASE_OPACITY * eased).toFixed(3);

          if (fadeLayer) {
            const edgeMask = 0.03 + Math.sin(Math.PI * raw) * 0.17;
            fadeLayer.style.opacity = edgeMask.toFixed(3);
          }

          if (raw >= 1) {
            activeVideo.pause();
            try {
              activeVideo.currentTime = 0;
            } catch (error) {
              // Ignore metadata timing race while swapping streams.
            }
            activeVideo.style.opacity = '0';
            nextVideo.style.opacity = VIDEO_BASE_OPACITY.toFixed(3);

            activeVideoIndexRef.current = activeVideoIndexRef.current === 0 ? 1 : 0;
            isCrossfadingRef.current = false;
            crossfadeStartTsRef.current = 0;

            if (fadeLayer) {
              fadeLayer.style.opacity = '0.03';
            }
          }
        } else if (fadeLayer) {
          fadeLayer.style.opacity = '0.03';
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
      isCrossfadingRef.current = false;
      crossfadeStartTsRef.current = 0;
      videoA.pause();
      videoB.pause();
    };
  }, [isDashboardRoute]);

  return (
    <div
      className={`min-h-screen relative transition-colors duration-300 ${isDashboardRoute ? 'dashboard-shell-bg' : 'bg-background'
        }`}
    >
      {/* Clean Subtle Background - Reference Style */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
        {isDashboardRoute ? (
          <>
            <video
              ref={dashboardVideoARef}
              className="dashboard-shell-video"
              src={DASHBOARD_BG_VIDEO}
              autoPlay
              muted
              playsInline
              preload="auto"
            />
            <video
              ref={dashboardVideoBRef}
              className="dashboard-shell-video"
              src={DASHBOARD_BG_VIDEO}
              muted
              playsInline
              preload="auto"
            />
            <div className="dashboard-shell-video-overlay" />
            <div
              ref={loopFadeLayerRef}
              className="dashboard-shell-video-loop-fade"
              style={{ opacity: 0.03 }}
            />
          </>
        ) : (
          <div
            className="absolute top-0 right-0 w-[300px] h-[300px] opacity-[0.06]"
            style={{ background: 'radial-gradient(circle at top right, rgba(0,217,165,0.3), transparent 60%)' }}
          />
        )}
      </div>

      {/* Particles Background - DISABLED FOR MOBILE STABILITY */}
      {/* <Particles /> */}

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen lg:pb-0">

        {/* Mobile Header - hidden on small mobile, visible on tablet-ish screens */}
        <header className="hidden md:block lg:hidden sticky top-0 z-30 glass border-b border-border">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-secondary rounded-lg transition-colors"
              data-testid="mobile-menu-btn"
            >
              <Menu className="w-6 h-6" />
            </button>
            <KarionLogo size="small" />
            <div className="w-8" /> {/* Spacer for layout balance */}
          </div>
        </header>

        {/* Page Content */}
        <div
          className={
            isDashboardRoute
              ? "p-4 pb-24 pt-6 md:px-6 md:pb-6 md:pt-7 lg:px-8 lg:pb-8 lg:pt-7"
              : "p-4 pb-24 pt-2 md:px-6 md:pb-6 md:pt-3 lg:px-8 lg:pb-8 lg:pt-3"
          }
        >
          <Outlet />
        </div>

        {/* Global Disclaimer Footer */}
        <footer className="hidden lg:block px-8 py-3 border-t border-border/30 bg-background/80 backdrop-blur-sm">
          <p className="text-xs text-muted-foreground/60 text-center max-w-4xl mx-auto">
            ⚠️ <strong>Disclaimer:</strong> Karion Trading OS è uno strumento educativo e di analisi.
            Il trading comporta rischi significativi e può portare alla perdita del capitale investito.
            Le informazioni fornite non costituiscono consulenza finanziaria.
            I risultati passati non garantiscono performance future.
            Consulta un professionista prima di prendere decisioni di investimento.
          </p>
        </footer>
      </main>


      {/* Helper Components */}
      <MobileQuickDock />

      {/* Mobile Bottom Navigation — DISABLED per user request */}
      {/* <MobileNav onSearchClick={() => { }} /> */}



    </div>
  );
};

export default Layout;
