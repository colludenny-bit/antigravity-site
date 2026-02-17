import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { Particles } from '../ui/Particles';
import { KeyboardShortcuts } from '../ui/KeyboardShortcuts';
import { AIHelperButton } from '../ui/AIHelperButton';

// Karion Logo Component using user's original PNG image
import kairongLogo from '../../assets/kairon-logo.png';

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
  const location = useLocation();
  const navigate = useNavigate();

  const isHomePage = location.pathname === '/app';

  return (
    <div className="min-h-screen bg-background relative transition-colors duration-300">
      {/* Clean Subtle Background - Reference Style */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Very subtle corner glow only */}
        <div
          className="absolute top-0 right-0 w-[300px] h-[300px] opacity-[0.06]"
          style={{ background: 'radial-gradient(circle at top right, rgba(0,217,165,0.3), transparent 60%)' }}
        />
      </div>

      {/* Particles Background - DISABLED FOR MOBILE STABILITY */}
      {/* <Particles /> */}

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <main className="lg:ml-20 min-h-screen lg:pb-0">

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

        {/* Mobile Logo Strip — fixed below safe area, only on small screens */}
        <div className="md:hidden fixed left-0 right-0 flex justify-center z-10 pointer-events-none" style={{ top: '44px' }}>
          <img
            src={kairongLogo}
            alt="Karion"
            style={{
              height: '22px',
              width: 'auto',
              filter: 'brightness(0) invert(1) drop-shadow(0 0 6px rgba(180,160,120,0.3))',
              opacity: 0.7,
            }}
          />
        </div>

        {/* Page Content — extra top padding on mobile for Dynamic Island safe area */}
        <div className="p-4 pt-14 md:p-6 md:pt-6 lg:p-8">
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
      <AIHelperButton />

      {/* Mobile Bottom Navigation — DISABLED per user request */}
      {/* <MobileNav onSearchClick={() => { }} /> */}



      {/* Keyboard Shortcuts */}
      <KeyboardShortcuts onNavigate={(path) => navigate(path)} />
    </div>
  );
};

export default Layout;
