import React, { useState } from 'react';
import {
  Shield,
  User,
  Landmark,
  Tv,
  FileSpreadsheet,
  Settings,
  ExternalLink,
  X,
  Check,
} from 'lucide-react';
import { CONTRACT_ADDRESS, DEPLOY_BLOCK, MONAD_TESTNET } from '../config';

interface NavbarProps {
  currentRoute: string;
}

export const Navbar: React.FC<NavbarProps> = ({ currentRoute }) => {
  const [showSettings, setShowSettings] = useState(false);
  const [contractInput, setContractInput] = useState(
    typeof window !== 'undefined' ? localStorage.getItem('pp_contract_address') || CONTRACT_ADDRESS : CONTRACT_ADDRESS
  );
  const [deployBlockInput, setDeployBlockInput] = useState(
    typeof window !== 'undefined' ? localStorage.getItem('pp_deploy_block') || String(DEPLOY_BLOCK) : String(DEPLOY_BLOCK)
  );
  const [savedNotice, setSavedNotice] = useState(false);

  const saveSettings = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pp_contract_address', contractInput.trim());
      localStorage.setItem('pp_deploy_block', deployBlockInput.trim());
      setSavedNotice(true);
      setTimeout(() => {
        window.location.reload();
      }, 700);
    }
  };

  const navLinks = [
    { href: '#/plot/1', label: 'Public Deed', icon: Shield },
    { href: '#/me', label: 'Trader Wallet', icon: User },
    { href: '#/ledger', label: 'Deeds Ledger', icon: FileSpreadsheet },
    { href: '#/registrar', label: 'Registrar', icon: Landmark },
    { href: '#/screen', label: 'Stage Screen', icon: Tv },
  ];

  const isLinkActive = (href: string) => {
    if (href.startsWith('#/plot') && currentRoute.startsWith('#/plot')) return true;
    return currentRoute === href;
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <a href="#/plot/1" className="flex items-center space-x-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-white text-base tracking-tight font-sans">
                  PlotProof
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Monad
                </span>
              </div>
              <p className="text-[11px] text-slate-400 -mt-0.5 hidden sm:block">
                Cadastre & Title Deed Registry
              </p>
            </div>
          </a>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const active = isLinkActive(item.href);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    active
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>

          {/* Right Action: Settings */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition border border-slate-800 hover:border-slate-700"
              title="Chain Settings & Contract Address"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Dock */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-3 py-2 flex items-center justify-around no-print">
        {navLinks.map((item) => {
          const Icon = item.icon;
          const active = isLinkActive(item.href);
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center py-1 px-2.5 rounded-xl text-[10px] font-semibold transition ${
                active ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base text-white">Monad Testnet Configuration</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 py-4 text-xs">
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Contract Address (on Monad Testnet)
                </label>
                <input
                  type="text"
                  value={contractInput}
                  onChange={(e) => setContractInput(e.target.value)}
                  placeholder="0x_PLACEHOLDER"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Default placeholder runs the instant local simulator. Paste your deployed contract address here or in <code className="text-emerald-400">src/config.ts</code>.
                </p>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Deployment Block Number
                </label>
                <input
                  type="text"
                  value={deployBlockInput}
                  onChange={(e) => setDeployBlockInput(e.target.value)}
                  placeholder="0"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Used by <code className="text-emerald-400">getLogs</code> to quickly fetch historical DeedRecorded events without rate limits.
                </p>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-slate-400">
                <div className="flex justify-between">
                  <span>Chain ID:</span>
                  <span className="font-mono text-slate-200">10143 (Monad Testnet)</span>
                </div>
                <div className="flex justify-between">
                  <span>RPC Endpoint:</span>
                  <span className="font-mono text-slate-200">https://testnet-rpc.monad.xyz</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span>Block Explorer:</span>
                  <a
                    href={MONAD_TESTNET.blockExplorers.default.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:underline flex items-center space-x-1"
                  >
                    <span>MonadVision</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {savedNotice && (
                <div className="p-2.5 bg-emerald-950/60 border border-emerald-800 rounded-xl text-emerald-400 flex items-center space-x-2">
                  <Check className="w-4 h-4" />
                  <span>Configuration saved! Reloading application...</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium text-xs transition"
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition flex items-center space-x-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save & Reload</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
