import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Layers,
  FileCheck,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Radio,
  Sparkles,
} from 'lucide-react';
import { MONAD_TESTNET } from '../config';
import type { PlotDoc, BlockedDoc, DeedRecord, PlotStatus } from '../types';
import { formatDeedNo, shortAddress, formatMon, ZERO_ADDRESS } from '../utils/crypto';
import { subscribePlots, subscribeBlocked } from '../services/db';
import {
  fetchPlotState,
  fetchSaleState,
  fetchDeedHistory,
} from '../services/blockchain';
import { LeafletMap } from '../components/LeafletMap';

export const ScreenPage: React.FC = () => {
  const [plots, setPlots] = useState<PlotDoc[]>([]);
  const [plotStatuses, setPlotStatuses] = useState<Record<number, PlotStatus>>({});
  const [blockedList, setBlockedList] = useState<BlockedDoc[]>([]);
  const [deeds, setDeeds] = useState<DeedRecord[]>([]);
  const [tokenizedCount, setTokenizedCount] = useState<number>(0);
  const [pulsePlotId, setPulsePlotId] = useState<number | null>(null);

  // Subscriptions
  useEffect(() => {
    const unsubPlots = subscribePlots(setPlots);
    const unsubBlocked = subscribeBlocked(setBlockedList);
    return () => {
      unsubPlots();
      unsubBlocked();
    };
  }, []);

  // Fetch deed history and states
  const refreshScreenState = async () => {
    if (plots.length === 0) return;

    try {
      const deedHistory = await fetchDeedHistory();
      setDeeds(deedHistory);

      const statusMap: Record<number, PlotStatus> = {};
      let tokCount = 0;

      for (const p of plots) {
        const [cPlot, cSale] = await Promise.all([
          fetchPlotState(p.id),
          fetchSaleState(p.id),
        ]);

        if (cPlot.exists) {
          tokCount++;
        }

        if (cPlot.frozen) {
          statusMap[p.id] = 'disputed_frozen';
        } else if (cSale.active) {
          statusMap[p.id] = 'sale_pending';
        } else {
          statusMap[p.id] = 'clear';
        }
      }

      setPlotStatuses(statusMap);
      setTokenizedCount(tokCount);
    } catch (e) {
      console.warn('Error refreshing screen state:', e);
    }
  };

  useEffect(() => {
    refreshScreenState();
    // Light refresh every 6 seconds safe for rate limits
    const interval = setInterval(refreshScreenState, 6000);
    return () => clearInterval(interval);
  }, [plots]);

  const meUrl = typeof window !== 'undefined' ? `${window.location.origin}/#/me` : '/#/me';
  const samplePlotUrl = typeof window !== 'undefined' ? `${window.location.origin}/#/plot/1` : '/#/plot/1';

  // Get Survey number for plotId
  const getSurveyForPlot = (plotId: bigint | number) => {
    const p = plots.find((item) => item.id === Number(plotId));
    return p ? p.surveyNo : `101/${plotId}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-8 space-y-8">
      {/* Top Hackathon Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white font-sans">
              PlotProof <span className="text-emerald-400">Audience Stage View</span>
            </h1>
            <span className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>LIVE MONAD CONSENSUS</span>
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Real-time cadastral geofences, immutable land title deeds, and escrow settlements.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs font-mono text-slate-400">
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span>Clear Title</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            <span>Sale Escrow</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400"></span>
            <span>Disputed Frozen</span>
          </span>
        </div>
      </div>

      {/* 3 Giant Metric Counters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <Layers className="w-24 h-24 text-emerald-400" />
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
            Plots Tokenized
          </span>
          <div className="text-5xl sm:text-6xl font-black text-white font-mono mt-2 tracking-tight">
            {tokenizedCount}
          </div>
          <p className="text-xs text-emerald-400 mt-2 font-medium">
            On-chain ERC-721 land deeds on Monad
          </p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <FileCheck className="w-24 h-24 text-blue-400" />
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
            Deeds Recorded
          </span>
          <div className="text-5xl sm:text-6xl font-black text-white font-mono mt-2 tracking-tight">
            {deeds.length}
          </div>
          <p className="text-xs text-blue-400 mt-2 font-medium">
            Cryptographically chained title transfers
          </p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <ShieldAlert className="w-24 h-24 text-red-400" />
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
            Double Sales Blocked
          </span>
          <div className="text-5xl sm:text-6xl font-black text-red-400 font-mono mt-2 tracking-tight">
            {blockedList.length}
          </div>
          <p className="text-xs text-red-300 mt-2 font-medium">
            Protected by Monad SaleActive invariant
          </p>
        </div>
      </div>

      {/* Main Stage Grid: Large Map (Left) & QR Codes + Live Deed Stream (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (8 cols): Large Stage Map */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-2xl">
            <LeafletMap
              plots={plots}
              plotStatuses={plotStatuses}
              heightClass="h-[460px] sm:h-[540px]"
              pulsePlotId={pulsePlotId}
              onPlotClick={(id) => {
                window.location.hash = `#/plot/${id}`;
              }}
            />
          </div>
        </div>

        {/* Right Column (4 cols): Giant QR Code to /#/me & Sample Plot */}
        <div className="lg:col-span-4 space-y-6">
          {/* Giant QR Code to /#/me for Audience */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 block font-mono">
              Scan with your phone to trade live
            </span>
            <div className="bg-white p-4 rounded-2xl inline-block shadow-2xl">
              <QRCodeSVG value={meUrl} size={190} level="M" />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-white text-base">Claim Burner Wallet</h3>
              <p className="text-xs text-slate-400">
                Instantly spawns burner wallet on Monad testnet and receives starter funds to purchase plots.
              </p>
            </div>
          </div>

          {/* Sample Plot QR */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center space-x-4">
            <div className="bg-white p-2 rounded-xl flex-shrink-0">
              <QRCodeSVG value={samplePlotUrl} size={64} level="L" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">Sample Deed (Plot #1)</span>
              <p className="text-[11px] text-slate-400">
                View cryptographic boundary hash & public chain of title.
              </p>
              <a
                href="#/plot/1"
                className="text-xs text-emerald-400 hover:underline font-mono mt-1 inline-flex items-center space-x-1"
              >
                <span>Open Deed #1</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Live Deed Recorded Feed (Full Width Broadcast Log) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-extrabold text-white uppercase tracking-wider font-mono">
              Live Deed Conveyance Stream (Monad Testnet)
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {deeds.length} Total Verified Deeds
          </span>
        </div>

        <div className="space-y-2.5 max-h-72 overflow-y-auto scrollbar-thin">
          {deeds.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center font-mono">
              Awaiting deed recordings from registrar station...
            </p>
          ) : (
            [...deeds].reverse().map((deed) => {
              const isInitial = deed.from === ZERO_ADDRESS;
              const surveyNo = getSurveyForPlot(deed.plotId);

              return (
                <div
                  key={String(deed.deedNo)}
                  className="bg-slate-950/80 border border-slate-800/80 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono transition hover:border-slate-700"
                >
                  <div className="flex items-center space-x-3">
                    <span className="font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/80">
                      {formatDeedNo(deed.deedNo)}
                    </span>
                    <span className="text-slate-300">
                      {isInitial ? 'Registration:' : 'Sale:'}{' '}
                      <strong className="text-white">{shortAddress(deed.from)}</strong>
                      {' '}<ArrowRight className="w-3 h-3 text-slate-500 inline" />{' '}
                      <strong className="text-emerald-400">{shortAddress(deed.to)}</strong>
                      {' '}for <strong className="text-white">{formatMon(deed.price)} MON</strong>,
                      {' '}plot <strong className="text-white">Survey {surveyNo}</strong>
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 text-slate-500">
                    <span className="text-[11px]">{new Date().toLocaleTimeString()}</span>
                    {deed.transactionHash && (
                      <a
                        href={`${MONAD_TESTNET.blockExplorers.default.url}/tx/${deed.transactionHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-white"
                        title="View on MonadVision"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
