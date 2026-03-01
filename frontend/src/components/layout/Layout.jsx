import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { MobileQuickDock } from './MobileQuickDock';

// Karion Logo Component using user's original PNG image
import kairongLogo from '../../assets/kairon-logo.png';

const DASHBOARD_BG_VIDEO = '/videos/efecto-recording-2026-02-22T15-08-17.mp4';
const VIDEO_BASE_OPACITY = 0.72;

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
  const [dashboardVideoReady, setDashboardVideoReady] = useState(false);
  const dashboardVideoRef = useRef(null);
  const dashboardVideoTimeRef = useRef(0);
  const dashboardVideoBootedRef = useRef(false);
  const location = useLocation();
  const isDashboardRoute = /^\/app\/?$/.test(location.pathname);

  useEffect(() => {
    if (!isDashboardRoute) return undefined;

    const video = dashboardVideoRef.current;
    if (!video) return undefined;
    if (!dashboardVideoBootedRef.current) {
      setDashboardVideoReady(false);
    }
    try {
      if (dashboardVideoBootedRef.current && Number.isFinite(dashboardVideoTimeRef.current) && dashboardVideoTimeRef.current > 0) {
        video.currentTime = dashboardVideoTimeRef.current;
      }
    } catch (error) {
      // Ignore timing race.
    }
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => null);
    }
    dashboardVideoBootedRef.current = true;
    return () => {
      dashboardVideoTimeRef.current = Number.isFinite(video.currentTime) ? video.currentTime : dashboardVideoTimeRef.current;
      video.pause();
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
            <div className="dashboard-shell-fallback" />
            <video
              ref={dashboardVideoRef}
              className={`dashboard-shell-video ${dashboardVideoReady ? 'is-ready' : ''}`}
              src={DASHBOARD_BG_VIDEO}
              style={{ '--dashboard-video-opacity': VIDEO_BASE_OPACITY }}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              onLoadedData={() => setDashboardVideoReady(true)}
              onCanPlay={() => setDashboardVideoReady(true)}
            />
            <div className="dashboard-shell-video-overlay" />
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

      </main>


      {/* Helper Components */}
      <MobileQuickDock />

      {/* Mobile Bottom Navigation — DISABLED per user request */}
      {/* <MobileNav onSearchClick={() => { }} /> */}



    </div>
  );
};

export default Layout;
