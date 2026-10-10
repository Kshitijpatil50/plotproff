import React, { useEffect, useState, useRef } from 'react';
import { privateKeyToAccount } from 'viem/accounts';
import {
  Landmark,
  Key,
  Shield,
  Coins,
  CheckCircle,
  AlertTriangle,
  Play,
  Square,
  Sparkles,
  MapPin,
  Trash2,
  RefreshCw,
  ExternalLink,
  Edit3,
  FileText,
  Upload,
} from 'lucide-react';
import { MONAD_TESTNET, MAP_CENTER } from '../config';
import type {
  PlotDoc,
  WalletDoc,
  DisputeDoc,
  OnChainPlot,
  OnChainSale,
  Address,
  Hash,
} from '../types';
import {
  formatMon,
  shortAddress,
  shortHash,
  computeBoundaryHash,
  computePolygonAreaSqm,
  computeDocumentHash,
  generateTitleRecordText,
  ZERO_ADDRESS,
  ZERO_HASH,
} from '../utils/crypto';
import {
  subscribeWallets,
  subscribePlots,
  subscribeDisputes,
  savePlot,
  saveWallet,
  removeDispute,
  saveDocument,
  generateSeedGrid,
  resetDemoData,
} from '../services/db';
import {
  fetchBalance,
  fetchRegistrarAddress,
  fetchPlotState,
  fetchSaleState,
  sendNativeDrip,
  callRegisterPlot,
  callApproveSale,
  callResolveDispute,
  formatContractError,
  isRealContractConfigured,
} from '../services/blockchain';
import { LeafletMap } from '../components/LeafletMap';
import { NFTCard } from '../components/NFTCard';

export const RegistrarPage: React.FC = () => {
  // In-memory key ONLY: never in localStorage, never logged, cleared on refresh
  const [inMemoryKey, setInMemoryKey] = useState<string>('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [registrarAddress, setRegistrarAddress] = useState<Address | null>(null);
  const [balance, setBalance] = useState<bigint>(0n);

  const [wallets, setWallets] = useState<Record<string, WalletDoc>>({});
  const [plots, setPlots] = useState<PlotDoc[]>([]);
  const [disputes, setDisputes] = useState<Record<number, DisputeDoc>>({});

  // Sales ready to approve
  const [readySales, setReadySales] = useState<
    Array<{ plotId: number; doc: PlotDoc; sale: OnChainSale; plot: OnChainPlot }>
  >([]);

  // Disputed plots
  const [disputedPlots, setDisputedPlots] = useState<
    Array<{ plotId: number; doc: PlotDoc; dispute: DisputeDoc }>
  >([]);

  // Autonomous Drip Loop State
  const [isLoopRunning, setIsLoopRunning] = useState<boolean>(false);
  const [autoAssignPlot, setAutoAssignPlot] = useState<boolean>(true);
  const [dripCount, setDripCount] = useState<number>(0);
  const isLoopExecutingRef = useRef<boolean>(false);
  const inFlightDripsRef = useRef<Set<string>>(new Set());

  // Manual 4-Corner Register Form
  const [isManualDrawing, setIsManualDrawing] = useState(false);
  const [manualPolygon, setManualPolygon] = useState<[number, number][]>([]);
  const [manualOwner, setManualOwner] = useState<string>('');
  const [manualSurveyNo, setManualSurveyNo] = useState<string>('202/1');
  const [manualVillage, setManualVillage] = useState<string>('Shivajinagar');

  // Tamper Demo State
  const [tamperedPlotId, setTamperedPlotId] = useState<number | null>(null);
  const [originalPolygon, setOriginalPolygon] = useState<[number, number][] | null>(null);

  // Reset Demo Modal
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Live Operations Console
  const [logs, setLogs] = useState<
    Array<{ id: string; time: string; msg: string; type: 'info' | 'success' | 'error'; txHash?: string }>
  >([]);

  const addLog = (msg: string, type: 'info' | 'success' | 'error' = 'info', txHash?: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [{ id: `${Date.now()}_${Math.random()}`, time, msg, type, txHash }, ...prev.slice(0, 49)]);
  };

  // Subscriptions
  useEffect(() => {
    const unsubWallets = subscribeWallets(setWallets);
    const unsubPlots = subscribePlots(setPlots);
    const unsubDisputes = subscribeDisputes(setDisputes);
    return () => {
      unsubWallets();
      unsubPlots();
      unsubDisputes();
    };
  }, []);

  // Check on-chain registrar and balance
  const refreshRegistrarState = async () => {
    if (!inMemoryKey || !inMemoryKey.startsWith('0x') || inMemoryKey.length !== 66) {
      setRegistrarAddress(null);
      setKeyError(null);
      return;
    }

    try {
      const account = privateKeyToAccount(inMemoryKey as `0x${string}`);
      const derivedAddr = account.address as Address;
      setRegistrarAddress(derivedAddr);

      const bal = await fetchBalance(derivedAddr);
      setBalance(bal);

      if (isRealContractConfigured()) {
        const expectedRegistrar = await fetchRegistrarAddress();
        if (derivedAddr.toLowerCase() !== expectedRegistrar.toLowerCase()) {
          setKeyError(`Key address (${shortAddress(derivedAddr)}) does not match on-chain registrar (${shortAddress(expectedRegistrar)}).`);
        } else {
          setKeyError(null);
        }
      } else {
        setKeyError(null);
      }
    } catch {
      setKeyError('Invalid private key format.');
      setRegistrarAddress(null);
    }
  };

  useEffect(() => {
    refreshRegistrarState();
  }, [inMemoryKey]);

  // Scan for ready sales and disputed plots
  const scanSalesAndDisputes = async () => {
    if (plots.length === 0) return;

    const ready: Array<{ plotId: number; doc: PlotDoc; sale: OnChainSale; plot: OnChainPlot }> = [];
    const disp: Array<{ plotId: number; doc: PlotDoc; dispute: DisputeDoc }> = [];

    for (const p of plots) {
      try {
        const [cPlot, cSale] = await Promise.all([
          fetchPlotState(p.id),
          fetchSaleState(p.id),
        ]);

        if (cSale.active && cSale.paid) {
          ready.push({ plotId: p.id, doc: p, sale: cSale, plot: cPlot });
        }

        if (cPlot.frozen || disputes[p.id]) {
          disp.push({
            plotId: p.id,
            doc: p,
            dispute: disputes[p.id] || {
              plotId: p.id,
              reason: 'On-chain dispute freeze active',
              by: ZERO_ADDRESS,
              ts: Date.now(),
            },
          });
        }
      } catch (e) {
        console.warn('Error scanning plot:', e);
      }
    }

    setReadySales(ready);
    setDisputedPlots(disp);
  };

  useEffect(() => {
    scanSalesAndDisputes();
  }, [plots, disputes]);

  // 1. Seed 12 Demo Plots in Firestore/DB
  const handleSeedPlots = async () => {
    addLog('Generating 12 geofenced cadastre plots in Firestore...', 'info');
    const seeds = generateSeedGrid();
    for (const p of seeds) {
      await savePlot(p);
    }
    addLog('12 demo plots seeded successfully around Pune coordinates.', 'success');
  };

  // 2. Autonomous Drip + Assign Loop
  useEffect(() => {
    if (!isLoopRunning || !inMemoryKey || isLoopExecutingRef.current) return;

    const runDripStep = async () => {
      // Find pending wallets where dripped == false
      const pendingList = Object.values(wallets).filter(
        (w) => !w.dripped && !inFlightDripsRef.current.has(w.address.toLowerCase())
      );

      if (pendingList.length === 0) return;

      const targetWallet = pendingList[0];
      const targetAddr = targetWallet.address;
      inFlightDripsRef.current.add(targetAddr.toLowerCase());
      isLoopExecutingRef.current = true;

      try {
        addLog(`Autonomous Drip: Sending 0.3 MON to ${targetWallet.nick} (${shortAddress(targetAddr)})...`, 'info');

        // (a) Send 0.3 MON and wait for receipt
        const dripTx = await sendNativeDrip(inMemoryKey as `0x${string}`, targetAddr, '0.3');
        addLog(`Drip confirmed! Receipt verified on Monad.`, 'success', dripTx);
        setDripCount((c) => c + 1);

        let assignedPlotId: number | null = null;

        // (b) If autoAssignPlot is enabled, find next free unassigned plot
        if (autoAssignPlot) {
          // Check plots where onChain.exists is false
          for (const p of plots) {
            const pState = await fetchPlotState(p.id);
            if (!pState.exists) {
              assignedPlotId = p.id;
              addLog(`Auto-assigning Plot #${p.id} (Survey ${p.surveyNo}) to ${targetWallet.nick}...`, 'info');

              // Generate Title Record document
              const titleText = generateTitleRecordText({
                plotId: p.id,
                surveyNo: p.surveyNo,
                village: p.village,
                areaSqm: p.areaSqm,
                owner: targetAddr,
                boundaryHash: p.boundaryHash,
                date: new Date().toISOString(),
              });
              const titleDocHash = computeDocumentHash(titleText);

              // Save document
              await saveDocument({
                hash: titleDocHash,
                name: `Title-Record-Plot-${p.id}.txt`,
                mime: 'text/plain',
                size: titleText.length,
                kind: 'title',
                plotId: p.id,
                createdBy: registrarAddress || ZERO_ADDRESS,
                createdAt: Date.now(),
                text: titleText,
              });

              // Call registerPlot on-chain and wait for receipt
              const regTx = await callRegisterPlot(inMemoryKey as `0x${string}`, {
                plotId: p.id,
                owner: targetAddr,
                surveyNo: p.surveyNo,
                village: p.village,
                areaSqm: p.areaSqm,
                boundaryHash: p.boundaryHash,
                titleDocHash,
              });

              addLog(`Plot #${p.id} registered as NFT with Title Deed!`, 'success', regTx);
              break;
            }
          }
        }

        // (c) Update wallet doc
        await saveWallet({
          ...targetWallet,
          dripped: true,
          assignedPlot: assignedPlotId,
          ts: Date.now(),
        });
      } catch (err: any) {
        addLog(`Drip loop error: ${formatContractError(err)}`, 'error');
      } finally {
        isLoopExecutingRef.current = false;
        refreshRegistrarState();
        scanSalesAndDisputes();
      }
    };

    const interval = setInterval(runDripStep, 2500);
    return () => clearInterval(interval);
  }, [isLoopRunning, inMemoryKey, wallets, plots, autoAssignPlot]);

  // 3. Register Plot Manually (4 corners)
  const handleRegisterManualPlot = async () => {
    if (!inMemoryKey || manualPolygon.length < 4 || !manualOwner) return;

    try {
      const nextId = plots.length > 0 ? Math.max(...plots.map((p) => p.id)) + 1 : 1;
      const boundaryHash = computeBoundaryHash(manualPolygon);
      const areaSqm = computePolygonAreaSqm(manualPolygon);

      addLog(`Registering manual Plot #${nextId} (Survey ${manualSurveyNo})...`, 'info');

      // Title Record Doc
      const titleText = generateTitleRecordText({
        plotId: nextId,
        surveyNo: manualSurveyNo,
        village: manualVillage,
        areaSqm,
        owner: manualOwner,
        boundaryHash,
        date: new Date().toISOString(),
      });
      const titleDocHash = computeDocumentHash(titleText);

      await saveDocument({
        hash: titleDocHash,
        name: `Title-Record-Survey-${manualSurveyNo.replace('/', '-')}.txt`,
        mime: 'text/plain',
        size: titleText.length,
        kind: 'title',
        plotId: nextId,
        createdBy: registrarAddress || ZERO_ADDRESS,
        createdAt: Date.now(),
        text: titleText,
      });

      const plotDoc: PlotDoc = {
        id: nextId,
        name: `Survey Plot ${manualSurveyNo}`,
        surveyNo: manualSurveyNo,
        village: manualVillage,
        areaSqm,
        polygon: manualPolygon,
        boundaryHash,
        titleDocHash,
        createdAt: Date.now(),
      };
      await savePlot(plotDoc);

      const regTx = await callRegisterPlot(inMemoryKey as `0x${string}`, {
        plotId: nextId,
        owner: manualOwner as Address,
        surveyNo: manualSurveyNo,
        village: manualVillage,
        areaSqm,
        boundaryHash,
        titleDocHash,
      });

      addLog(`Manual Plot #${nextId} successfully tokenized and recorded!`, 'success', regTx);
      setIsManualDrawing(false);
      setManualPolygon([]);
      refreshRegistrarState();
      scanSalesAndDisputes();
    } catch (err: any) {
      addLog(`Manual registration error: ${formatContractError(err)}`, 'error');
    }
  };

  // 4. Approve Sale
  const handleApproveSale = async (plotId: number) => {
    if (!inMemoryKey) return;
    try {
      addLog(`Attesting deed and approving sale for Plot #${plotId}...`, 'info');
      const txHash = await callApproveSale(inMemoryKey as `0x${string}`, plotId);
      addLog(`Sale approved! Deed recorded into chain of title.`, 'success', txHash);
      scanSalesAndDisputes();
    } catch (err: any) {
      addLog(`Approve error: ${formatContractError(err)}`, 'error');
    }
  };

  // 5. Resolve Dispute
  const handleResolveDispute = async (plotId: number, cancelSale: boolean) => {
    if (!inMemoryKey) return;
    try {
      addLog(`Resolving dispute on Plot #${plotId} (Cancel sale: ${cancelSale})...`, 'info');
      const txHash = await callResolveDispute(inMemoryKey as `0x${string}`, plotId, cancelSale);
      await removeDispute(plotId);
      addLog(`Dispute resolved and title freeze lifted.`, 'success', txHash);
      scanSalesAndDisputes();
    } catch (err: any) {
      addLog(`Resolve dispute error: ${formatContractError(err)}`, 'error');
    }
  };

  // 6. Demo: Tamper with Map in Firestore
  const handleTamperMap = async () => {
    if (plots.length === 0) return;
    const target = plots[0];
    setTamperedPlotId(target.id);
    setOriginalPolygon([...target.polygon]);

    // Shift coordinates slightly
    const tampered: [number, number][] = target.polygon.map(([lat, lng]) => [
      lat + 0.0003,
      lng + 0.0003,
    ]);

    await savePlot({
      ...target,
      polygon: tampered,
    });
    addLog(`DEMO TAMPER: Plot #${target.id} polygon shifted by 30 meters in Firestore.`, 'error');
  };

  const handleRestoreMap = async () => {
    if (tamperedPlotId && originalPolygon) {
      const target = plots.find((p) => p.id === tamperedPlotId);
      if (target) {
        await savePlot({
          ...target,
          polygon: originalPolygon,
        });
        addLog(`DEMO RESTORE: Plot #${target.id} polygon restored to genuine coordinates.`, 'success');
      }
    }
    setTamperedPlotId(null);
    setOriginalPolygon(null);
  };

  // 7. Reset Demo Data
  const handleConfirmReset = async () => {
    addLog('Resetting all demo data across collections...', 'info');
    await resetDemoData();
    setShowResetConfirm(false);
    addLog('Demo collections reset! 12 fresh cadastre plots re-seeded.', 'success');
    scanSalesAndDisputes();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Station Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Landmark className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-black text-white">Cadastral Registrar Witness Station</h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                Notary Console
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Attests official title deeds, authorizes escrow transfers, and executes autonomous drips.
            </p>
          </div>
        </div>

        {/* Balance & Warning */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-center min-w-[220px]">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
            Registrar MON Balance
          </span>
          <div className="flex items-baseline space-x-1 mt-0.5">
            <span className="text-2xl font-black text-white font-mono">{formatMon(balance)}</span>
            <span className="text-xs font-bold text-amber-400 font-mono">MON</span>
          </div>
          {balance < 12000000000000000000n && balance > 0n && (
            <p className="text-[11px] text-amber-400 mt-1 flex items-center space-x-1">
              <AlertTriangle className="w-3 h-3" />
              <span>Low balance alert (&lt;12 MON)</span>
            </p>
          )}
        </div>
      </div>

      {/* Registrar Private Key Input Card (Kept strictly in memory) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex items-center space-x-2">
          <Key className="w-5 h-5 text-amber-400" />
          <h3 className="text-base font-extrabold text-white">Registrar Private Key Authentication</h3>
        </div>

        <p className="text-xs text-slate-400">
          Kept strictly in component memory for this session only. Never saved in localStorage, never transmitted to Firestore, and never logged.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-9">
            <input
              type="password"
              value={inMemoryKey}
              onChange={(e) => setInMemoryKey(e.target.value.trim())}
              placeholder="0x... (throwaway testnet private key)"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="md:col-span-3 flex items-center space-x-2">
            <button
              onClick={() => {
                // Generate a quick random throwaway testnet key for testing
                setInMemoryKey('0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d');
              }}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
            >
              Load Demo Key
            </button>
          </div>
        </div>

        {registrarAddress && !keyError && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-xs text-emerald-300 flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Authenticated Registrar Address: <strong className="font-mono">{registrarAddress}</strong></span>
          </div>
        )}

        {keyError && (
          <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{keyError}</span>
          </div>
        )}
      </div>

      {/* Main Grid: Control Station & Live Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (7 cols): Automation Controls & Actions */}
        <div className="lg:col-span-7 space-y-6">
          {/* Autonomous Drip & Auto-Assign Loop */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Coins className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-extrabold text-white">Autonomous Drip & Assign Loop</h3>
              </div>
              <span className="text-xs font-mono text-slate-400">Drips sent: {dripCount}</span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Watches registered trader wallets. Sequentially sends 0.3 MON starter funds, registers an unassigned plot on Monad as an NFT deed, and marks the wallet as dripped.
            </p>

            <div className="flex items-center space-x-2 text-xs text-slate-300">
              <input
                type="checkbox"
                id="autoAssign"
                checked={autoAssignPlot}
                onChange={(e) => setAutoAssignPlot(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0"
              />
              <label htmlFor="autoAssign" className="cursor-pointer">
                Auto-assign unassigned cadastre plot to funded trader
              </label>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={() => setIsLoopRunning(!isLoopRunning)}
                disabled={!inMemoryKey}
                className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition flex items-center space-x-2 shadow-lg disabled:opacity-50 ${
                  isLoopRunning
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {isLoopRunning ? (
                  <>
                    <Square className="w-4 h-4 fill-current" />
                    <span>Stop Autonomous Loop</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Start Drip + Assign Loop</span>
                  </>
                )}
              </button>

              <button
                onClick={handleSeedPlots}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5"
              >
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Seed 12 Demo Plots</span>
              </button>
            </div>
          </div>

          {/* Manual 4-Corner Surveyor Tool */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Edit3 className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-extrabold text-white">Manual 4-Corner Cadastre Survey</h3>
              </div>
              <button
                onClick={() => {
                  setIsManualDrawing(!isManualDrawing);
                  setManualPolygon([]);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  isManualDrawing
                    ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {isManualDrawing ? 'Cancel Drawing' : 'Start 4-Corner Drawing'}
              </button>
            </div>

            {isManualDrawing && (
              <div className="space-y-4 pt-2">
                <LeafletMap
                  isDrawing={true}
                  onPolygonDrawn={(pts) => setManualPolygon(pts)}
                  heightClass="h-64"
                />

                {manualPolygon.length === 4 && (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1">Survey Number</label>
                        <input
                          type="text"
                          value={manualSurveyNo}
                          onChange={(e) => setManualSurveyNo(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Village / Sector</label>
                        <input
                          type="text"
                          value={manualVillage}
                          onChange={(e) => setManualVillage(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">Assign Initial Owner</label>
                      <select
                        value={manualOwner}
                        onChange={(e) => setManualOwner(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                      >
                        <option value="">-- Choose Trader Wallet --</option>
                        {Object.values(wallets).map((w) => (
                          <option key={w.address} value={w.address}>
                            {w.nick} ({shortAddress(w.address)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={handleRegisterManualPlot}
                        disabled={!inMemoryKey || !manualOwner}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition disabled:opacity-50"
                      >
                        Register & Tokenize Plot
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Hackathon Demo: Tamper with Map in Firestore & Reset */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-extrabold text-white">Hackathon Demonstrations & Reset</h3>

            <div className="flex flex-wrap items-center gap-3">
              {!tamperedPlotId ? (
                <button
                  onClick={handleTamperMap}
                  className="px-4 py-2 bg-red-950/80 hover:bg-red-900 border border-red-500/50 text-red-200 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span>Demo: Tamper with Map</span>
                </button>
              ) : (
                <button
                  onClick={handleRestoreMap}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Restore Map Coordinates</span>
                </button>
              )}

              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>Reset Demo Data</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Ready Sales, Disputed Plots, Live Console */}
        <div className="lg:col-span-5 space-y-6">
          {/* Ready to Approve Sales */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                Ready for Witness Attestation ({readySales.length})
              </h3>
            </div>

            {readySales.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">No escrow sales awaiting registrar approval.</p>
            ) : (
              <div className="space-y-3">
                {readySales.map((item) => (
                  <div
                    key={item.plotId}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-white">Plot #{item.plotId} (Survey {item.doc.surveyNo})</div>
                      <div className="text-slate-400">Buyer: {shortAddress(item.sale.buyer)} · {formatMon(item.sale.price)} MON</div>
                    </div>
                    <button
                      onClick={() => handleApproveSale(item.plotId)}
                      disabled={!inMemoryKey}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition disabled:opacity-50"
                    >
                      Approve & Record Deed
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Disputed Plots List */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
            <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
              Disputed Plots ({disputedPlots.length})
            </h3>

            {disputedPlots.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">No active title disputes.</p>
            ) : (
              <div className="space-y-3">
                {disputedPlots.map((item) => (
                  <div
                    key={item.plotId}
                    className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl space-y-2 text-xs"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white">Plot #{item.plotId} · {item.doc.surveyNo}</span>
                      <span className="text-[10px] text-red-400 font-mono">FROZEN</span>
                    </div>
                    <p className="text-[11px] text-slate-400 italic">"{item.dispute.reason}"</p>
                    <div className="flex space-x-2 pt-1">
                      <button
                        onClick={() => handleResolveDispute(item.plotId, false)}
                        disabled={!inMemoryKey}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold"
                      >
                        Resolve (Keep Sale)
                      </button>
                      <button
                        onClick={() => handleResolveDispute(item.plotId, true)}
                        disabled={!inMemoryKey}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[11px] font-bold"
                      >
                        Resolve (Cancel Sale)
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Operations Console */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                Live Operations Audit Console
              </h3>
              <span className="text-[11px] text-slate-500 font-mono">Real-time</span>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 h-64 overflow-y-auto font-mono text-[11px] space-y-2 scrollbar-thin">
              {logs.length === 0 ? (
                <span className="text-slate-600">Operations log idle.</span>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="leading-tight">
                    <span className="text-slate-500 mr-2">[{log.time}]</span>
                    <span
                      className={
                        log.type === 'success'
                          ? 'text-emerald-400'
                          : log.type === 'error'
                          ? 'text-red-400'
                          : 'text-slate-300'
                      }
                    >
                      {log.msg}
                    </span>
                    {log.txHash && (
                      <a
                        href={`${MONAD_TESTNET.blockExplorers.default.url}/tx/${log.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline ml-2 inline-flex items-center space-x-0.5"
                      >
                        <span>tx</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center space-x-2 text-red-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-extrabold text-base text-white">Reset Demo Collections?</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              This will clear the off-chain demo collections (plots, wallets, disputes, blocked, documents) because the contract was redeployed. 12 fresh unassigned demo plots will be seeded.
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReset}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
