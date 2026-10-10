import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { PlotPage } from './pages/PlotPage';
import { MePage } from './pages/MePage';
import { RegistrarPage } from './pages/RegistrarPage';
import { ScreenPage } from './pages/ScreenPage';
import { LedgerPage } from './pages/LedgerPage';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<string>(
    typeof window !== 'undefined' ? window.location.hash || '#/plot/1' : '#/plot/1'
  );

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash || '#/plot/1';
      setCurrentRoute(hash);
    };

    window.addEventListener('hashchange', handleHashChange);
    if (!window.location.hash) {
      window.location.hash = '#/plot/1';
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  // Parse route & plot ID
  const renderCurrentPage = () => {
    if (currentRoute.startsWith('#/plot/')) {
      const idStr = currentRoute.replace('#/plot/', '');
      const plotId = parseInt(idStr, 10);
      return <PlotPage plotId={isNaN(plotId) ? 1 : plotId} />;
    }

    if (currentRoute === '#/me') {
      return <MePage />;
    }

    if (currentRoute === '#/registrar') {
      return <RegistrarPage />;
    }

    if (currentRoute === '#/screen') {
      return <ScreenPage />;
    }

    if (currentRoute === '#/ledger') {
      return <LedgerPage />;
    }

    // Default fallback
    return <PlotPage plotId={1} />;
  };

  const isScreenView = currentRoute === '#/screen';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      {!isScreenView && <Navbar currentRoute={currentRoute} />}

      <main className="flex-1 pb-20 md:pb-8">
        {renderCurrentPage()}
      </main>

      {!isScreenView && (
        <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500 no-print">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>
              PlotProof · Monad Blitz Hackathon · Immutable Cadastre & Title Deed Registry
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              Chain ID 10143 (Monad Testnet)
            </span>
          </div>
        </footer>
      )}
    </div>
  );
}
