import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ShieldCheck,
  AlertTriangle,
  FileText,
  Printer,
  Upload,
  ExternalLink,
  CheckCircle,
  Copy,
  Check,
  MapPin,
  Clock,
  Layers,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { CONTRACT_ADDRESS, MONAD_TESTNET } from '../config';
import type {
  PlotDoc,
  WalletDoc,
  DocumentDoc,
  DeedRecord,
  OnChainPlot,
  OnChainSale,
  PlotStatus,
} from '../types';
import {
  formatDeedNo,
  shortAddress,
  shortHash,
  formatMon,
  computeDocumentHash,
  ZERO_ADDRESS,
  ZERO_HASH,
} from '../utils/crypto';
import {
  getPlotDoc,
  subscribeWallets,
  subscribePlots,
  getDocument,
} from '../services/db';
import {
  fetchPlotState,
  fetchSaleState,
  fetchDeedHistory,
  verifyBoundary,
  verifyChainOfTitle,
} from '../services/blockchain';
import { LeafletMap } from '../components/LeafletMap';
import { NFTCard } from '../components/NFTCard';
import { DocumentViewerModal } from '../components/DocumentViewerModal';

interface PlotPageProps {
  plotId: number;
}

export const PlotPage: React.FC<PlotPageProps> = ({ plotId }) => {
  const [plotDoc, setPlotDoc] = useState<PlotDoc | null>(null);
  const [allPlots, setAllPlots] = useState<PlotDoc[]>([]);
  const [wallets, setWallets] = useState<Record<string, WalletDoc>>({});
  const [onChain, setOnChain] = useState<OnChainPlot | null>(null);
  const [sale, setSale] = useState<OnChainSale | null>(null);
  const [deeds, setDeeds] = useState<DeedRecord[]>([]);
  const [boundaryCheck, setBoundaryCheck] = useState<{
    valid: boolean;
    computedHash: string | null;
    onChainHash: string | null;
    reason?: string;
  }>({ valid: true, computedHash: null, onChainHash: null });

  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeModalDoc, setActiveModalDoc] = useState<DocumentDoc | null>(null);

  // Document verification states for deed list
  const [docVerifyStates, setDocVerifyStates] = useState<Record<string, 'matched' | 'mismatch' | 'loading'>>({});

  // Drop zone verification state
  const [dropCheckResult, setDropCheckResult] = useState<{
    checked: boolean;
    matched: boolean;
    deedNo?: bigint;
    hash?: string;
    fileName?: string;
  }>({ checked: false, matched: false });

  // Load data
  const loadPlotData = async () => {
    setLoading(true);
    try {
      const pDoc = await getPlotDoc(plotId);
      setPlotDoc(pDoc);

      const [cPlot, cSale, cDeeds, bCheck] = await Promise.all([
        fetchPlotState(plotId),
        fetchSaleState(plotId),
        fetchDeedHistory(plotId),
        verifyBoundary(plotId),
      ]);

      setOnChain(cPlot);
      setSale(cSale);
      setDeeds(cDeeds);
      setBoundaryCheck(bCheck);
    } catch (err) {
      console.warn('Error loading plot data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlotData();
    const unsubWallets = subscribeWallets(setWallets);
    const unsubPlots = subscribePlots(setAllPlots);
    return () => {
      unsubWallets();
      unsubPlots();
    };
  }, [plotId]);

  // Determine Plot Status
  let status: PlotStatus = 'clear';
  if (onChain?.frozen) {
    status = 'disputed_frozen';
  } else if (sale?.active) {
    status = 'sale_pending';
  }

  // Get nickname or short address
  const getPartyDisplay = (addr: string) => {
    if (!addr || addr === ZERO_ADDRESS) return 'Cadastre Registrar';
    const lower = addr.toLowerCase();
    const w = wallets[lower];
    return w ? `${w.nick} (${shortAddress(addr)})` : shortAddress(addr);
  };

  // Verify Chain of Title Integrity
  const chainIntegrity = verifyChainOfTitle(plotId, deeds, onChain?.titleHead);

  // Verify a deed document
  const handleVerifyDeedDoc = async (docHash: string) => {
    setDocVerifyStates((prev) => ({ ...prev, [docHash]: 'loading' }));
    const docItem = await getDocument(docHash as any);
    if (!docItem) {
      setDocVerifyStates((prev) => ({ ...prev, [docHash]: 'mismatch' }));
      return;
    }

    let computed = '';
    if (docItem.text) {
      computed = computeDocumentHash(docItem.text);
    } else if (docItem.dataBase64) {
      const bin = atob(docItem.dataBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      computed = computeDocumentHash(bytes);
    }

    if (computed.toLowerCase() === docHash.toLowerCase()) {
      setDocVerifyStates((prev) => ({ ...prev, [docHash]: 'matched' }));
    } else {
      setDocVerifyStates((prev) => ({ ...prev, [docHash]: 'mismatch' }));
    }
  };

  // Open Document in Modal
  const handleOpenDoc = async (docHash: string, kind: 'title' | 'sale' = 'sale') => {
    const docItem = await getDocument(docHash as any);
    if (docItem) {
      setActiveModalDoc(docItem);
    } else {
      // Mock doc if not saved yet
      setActiveModalDoc({
        hash: docHash as any,
        name: `Deed-Document-${shortHash(docHash)}.txt`,
        mime: 'text/plain',
        size: 256,
        kind,
        plotId,
        createdBy: onChain?.owner || ZERO_ADDRESS,
        createdAt: Date.now(),
        text: `Document Hash: ${docHash}\nRegistered in Monad Blitz Cadastre for Plot #${plotId}`,
      });
    }
  };

  // Check an uploaded file in drop zone
  const handleFileDrop = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const computedHash = computeDocumentHash(bytes);

    // Check if this matches any deed's documentHash
    const matchingDeed = deeds.find(
      (d) => d.documentHash.toLowerCase() === computedHash.toLowerCase()
    );

    setDropCheckResult({
      checked: true,
      matched: !!matchingDeed,
      deedNo: matchingDeed?.deedNo,
      hash: computedHash,
      fileName: file.name,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const currentUrl = typeof window !== 'undefined' ? window.location.href : `/#/plot/${plotId}`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Printable Title Certificate View (Hidden on screen, shown in print) */}
      <div className="hidden print-only certificate-sheet font-serif">
        <div className="border-4 border-slate-900 p-8 space-y-6">
          <div className="text-center border-b-2 border-slate-900 pb-4">
            <h1 className="text-3xl font-extrabold uppercase tracking-widest text-slate-950">
              Official Title Deed Certificate
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Monad Blitz Blockchain Cadastre & Land Title Registry
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p><strong>Parcel Plot ID:</strong> #{plotId}</p>
              <p><strong>Survey Number:</strong> {onChain?.surveyNo || plotDoc?.surveyNo || '101/1'}</p>
              <p><strong>Village / Sector:</strong> {onChain?.village || plotDoc?.village || 'Shivajinagar'}</p>
              <p><strong>Cadastral Area:</strong> {onChain?.areaSqm || plotDoc?.areaSqm || 650} sq m</p>
            </div>
            <div>
              <p><strong>Registered Titleholder:</strong> {onChain?.owner || 'Pending registration'}</p>
              <p><strong>Contract Address:</strong> {CONTRACT_ADDRESS}</p>
              <p><strong>Chain:</strong> Monad Testnet (Chain ID 10143)</p>
              <p><strong>Certificate Date:</strong> {new Date().toLocaleDateString()}</p>
            </div>
          </div>

          <div className="border border-slate-400 p-3 bg-slate-50 text-xs font-mono">
            <p><strong>Cryptographic Boundary Hash:</strong> {onChain?.boundaryHash || plotDoc?.boundaryHash}</p>
            <p><strong>Title Head Hash:</strong> {onChain?.titleHead || ZERO_HASH}</p>
            <p><strong>Chain of Title Verification:</strong> {chainIntegrity.intact ? `INTACT (${chainIntegrity.count} verified deeds)` : `BROKEN`}</p>
          </div>

          <div>
            <h3 className="font-bold text-sm uppercase mb-2">Recorded Chain of Title Deeds:</h3>
            <table className="w-full text-xs border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-left">
                  <th className="p-1 border">Deed No</th>
                  <th className="p-1 border">From</th>
                  <th className="p-1 border">To</th>
                  <th className="p-1 border">Price (MON)</th>
                  <th className="p-1 border">Document Hash</th>
                </tr>
              </thead>
              <tbody>
                {deeds.map((d) => (
                  <tr key={String(d.deedNo)}>
                    <td className="p-1 border font-mono">{formatDeedNo(d.deedNo)}</td>
                    <td className="p-1 border font-mono">{shortAddress(d.from)}</td>
                    <td className="p-1 border font-mono">{shortAddress(d.to)}</td>
                    <td className="p-1 border">{formatMon(d.price)}</td>
                    <td className="p-1 border font-mono">{shortHash(d.documentHash)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-end pt-6 border-t border-slate-900">
            <div className="w-24 h-24">
              <QRCodeSVG value={currentUrl} size={96} />
            </div>
            <div className="text-right text-xs">
              <p className="font-bold">Land Registrar Witness Signature</p>
              <div className="h-8"></div>
              <p className="border-t border-slate-500 pt-1">Cryptographically Attested on Monad</p>
            </div>
          </div>
        </div>
      </div>

      {/* Screen View: Header Bar with Status Chip and Quick Parcel Rail */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 no-print">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Plot #{plotId} · Survey {onChain?.surveyNo || plotDoc?.surveyNo || `101/${plotId}`}
            </h1>
            <button
              onClick={loadPlotData}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              title="Refresh on-chain record"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1 flex items-center space-x-2">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span>
              {onChain?.village || plotDoc?.village || 'Shivajinagar'}, Pune Cadastre ·{' '}
              {onChain?.areaSqm || plotDoc?.areaSqm || 650} sq meters
            </span>
          </p>
        </div>

        {/* Big Status Chip */}
        <div className="flex items-center space-x-3">
          {status === 'clear' && (
            <div className="flex items-center space-x-2.5 px-4 py-2 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-950/50">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
              <div>
                <span className="text-sm font-extrabold tracking-wide uppercase">Clear Title</span>
                <span className="text-[10px] text-emerald-300 block -mt-0.5">Unencumbered · Ready for transfer</span>
              </div>
            </div>
          )}

          {status === 'sale_pending' && (
            <div className="flex items-center space-x-2.5 px-4 py-2 rounded-2xl bg-amber-950/80 border border-amber-500/40 text-amber-400 shadow-lg shadow-amber-950/50">
              <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse"></span>
              <div>
                <span className="text-sm font-extrabold tracking-wide uppercase">Sale Pending</span>
                <span className="text-[10px] text-amber-300 block -mt-0.5">Escrow active · Awaiting witness</span>
              </div>
            </div>
          )}

          {status === 'disputed_frozen' && (
            <div className="flex items-center space-x-2.5 px-4 py-2 rounded-2xl bg-red-950/80 border border-red-500/40 text-red-400 shadow-lg shadow-red-950/50">
              <span className="w-3 h-3 rounded-full bg-red-400 animate-pulse"></span>
              <div>
                <span className="text-sm font-extrabold tracking-wide uppercase">Disputed · Frozen</span>
                <span className="text-[10px] text-red-300 block -mt-0.5">Transfers locked by smart contract</span>
              </div>
            </div>
          )}

          <button
            onClick={handlePrint}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Print Certificate</span>
          </button>
        </div>
      </div>

      {/* Parcel Selection Rail */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-thin no-print">
        <span className="text-xs font-medium text-slate-400 flex-shrink-0">Cadastre Parcels:</span>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((id) => (
          <a
            key={id}
            href={`#/plot/${id}`}
            className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition flex-shrink-0 ${
              id === plotId
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            #{id}
          </a>
        ))}
      </div>

      {/* Main Grid: Left Cadastre Map & Badges | Right NFT Card & QR Deed Code */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start no-print">
        {/* Left Column (8 cols): Map, Boundary Integrity & Dropper */}
        <div className="lg:col-span-8 space-y-6">
          {/* Map Box */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Geofenced Cadastral Boundary
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {plotDoc?.polygon?.length || 4} GPS Vertices
              </span>
            </div>

            <LeafletMap
              highlightPolygon={plotDoc?.polygon}
              selectedPlotId={plotId}
              plotStatuses={{ [plotId]: status }}
              heightClass="h-[360px] sm:h-[420px]"
            />
          </div>

          {/* Boundary Integrity Badge */}
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition ${
              boundaryCheck.valid
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                : 'bg-red-950/60 border-red-500/60 text-red-200 animate-pulse'
            }`}
          >
            <div className="flex items-center space-x-3">
              {boundaryCheck.valid ? (
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400 flex-shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              )}
              <div>
                <h4 className="font-bold text-sm">
                  {boundaryCheck.valid
                    ? 'Boundary matches the on-chain cryptographic record'
                    : 'WARNING: Map polygon coordinates do not match the on-chain hash!'}
                </h4>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Hash: {shortHash(boundaryCheck.computedHash || onChain?.boundaryHash)}
                </p>
              </div>
            </div>

            <div className="text-xs font-mono bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 text-slate-300">
              Verified by Keccak-256
            </div>
          </div>

          {/* Chain-of-Title Integrity Badge */}
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between ${
              chainIntegrity.intact
                ? 'bg-emerald-950/30 border-emerald-500/20 text-emerald-300'
                : 'bg-red-950/40 border-red-500/40 text-red-300'
            }`}
          >
            <div className="flex items-center space-x-3">
              {chainIntegrity.intact ? (
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
              )}
              <div>
                <span className="text-xs font-bold uppercase tracking-wider block">
                  Chain-of-Title Consensus Verification
                </span>
                <span className="text-sm font-semibold">
                  {chainIntegrity.intact
                    ? `Chain of title intact (${chainIntegrity.count} verified deed${chainIntegrity.count === 1 ? '' : 's'})`
                    : chainIntegrity.error || `Chain broken at deed ${chainIntegrity.brokenAtDeed}`}
                </span>
              </div>
            </div>
            <div className="text-xs font-mono text-slate-400 hidden sm:block">
              Root Hash: {shortHash(ZERO_HASH)}
            </div>
          </div>

          {/* "Check a Document" Drop Zone */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Upload className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Check a Document (Instant Verification)
                </h4>
              </div>
              <span className="text-[11px] text-slate-400">Drag or upload any title deed/agreement</span>
            </div>

            <label className="border-2 border-dashed border-slate-800 hover:border-emerald-500/50 rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer bg-slate-950/40 transition">
              <FileText className="w-8 h-8 text-slate-500 mb-1" />
              <span className="text-xs font-medium text-slate-300">
                Drop PDF, TXT or Agreement document here to verify authenticity
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5">
                Computes Keccak-256 in your browser and matches against on-chain deeds
              </span>
              <input
                type="file"
                className="hidden"
                onChange={handleFileDrop}
              />
            </label>

            {dropCheckResult.checked && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center space-x-2 ${
                  dropCheckResult.matched
                    ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                    : 'bg-red-950/60 border-red-500/50 text-red-300'
                }`}
              >
                {dropCheckResult.matched ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                )}
                <div>
                  {dropCheckResult.matched ? (
                    <span>
                      MATCH VERIFIED: File <strong>{dropCheckResult.fileName}</strong> matches registered <strong>{formatDeedNo(dropCheckResult.deedNo!)}</strong> document hash!
                    </span>
                  ) : (
                    <span>
                      NO MATCH: File hash ({shortHash(dropCheckResult.hash)}) does not match any registered deed on this plot.
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (4 cols): NFT Card & Plot QR Code */}
        <div className="lg:col-span-4 space-y-6">
          {/* NFT Card */}
          <NFTCard
            plotId={plotId}
            surveyNo={onChain?.surveyNo || plotDoc?.surveyNo || `101/${plotId}`}
            village={onChain?.village || plotDoc?.village || 'Shivajinagar'}
            areaSqm={onChain?.areaSqm || plotDoc?.areaSqm || 650}
            owner={onChain?.owner || ZERO_ADDRESS}
            tokenURI={onChain?.tokenURI}
            boundaryHash={onChain?.boundaryHash || plotDoc?.boundaryHash}
          />

          {/* On-Site Physical QR Code */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl text-center space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              On-Site Physical Peg QR
            </h4>
            <div className="bg-white p-3 rounded-xl inline-block shadow-lg">
              <QRCodeSVG
                value={currentUrl}
                size={160}
                level="M"
                includeMargin={false}
              />
            </div>
            <p className="text-xs text-slate-400">
              Scannable on-site stake peg. Anyone scanning this QR instantly views verified title and chain of custody.
            </p>
            <div className="pt-2 border-t border-slate-800 flex justify-center">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(currentUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition flex items-center space-x-1.5"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied URL' : 'Copy Plot Link'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Chain of Title Section (Full Width Table / Timeline) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-6 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-extrabold text-white">
              Chain of Title (Verifiable Historical Deeds)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Every conveyance is cryptographically hashed, linked to its document and parent deed.
            </p>
          </div>
          <div className="flex items-center space-x-2 font-mono text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>{deeds.length} Recorded Deed{deeds.length === 1 ? '' : 's'}</span>
          </div>
        </div>

        {deeds.length === 0 ? (
          <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800">
            <FileText className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-300">No Deeds Recorded Yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Once registered by the Registrar witness or traded by owners, official deeds will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {deeds.map((deed, index) => {
              const isInitial = deed.from === ZERO_ADDRESS;
              const verifyStatus = docVerifyStates[deed.documentHash];

              return (
                <div
                  key={String(deed.deedNo)}
                  className="bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition"
                >
                  <div className="flex items-start space-x-3.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-mono font-bold text-xs text-emerald-400 flex-shrink-0">
                      #{Number(deed.deedNo)}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-sm font-bold text-white">
                          {formatDeedNo(deed.deedNo)}
                        </span>
                        {isInitial ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            Cadastre Registration
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Sale Conveyance
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-300">
                        <span className="text-slate-400">From:</span>
                        <span className="font-semibold">{getPartyDisplay(deed.from)}</span>
                        <ArrowRight className="w-3 h-3 text-slate-500 inline" />
                        <span className="text-slate-400">To:</span>
                        <span className="font-semibold text-emerald-400">{getPartyDisplay(deed.to)}</span>
                        <span className="text-slate-600">·</span>
                        <span className="text-slate-400">Price:</span>
                        <span className="font-mono font-bold text-white">
                          {formatMon(deed.price)} MON
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 font-mono flex items-center space-x-2">
                        <span>Doc Hash: {shortHash(deed.documentHash)}</span>
                        <span>·</span>
                        <span>Prev Deed: {shortHash(deed.prevDeedHash)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Verification */}
                  <div className="flex flex-wrap items-center gap-2 self-end md:self-center">
                    <button
                      onClick={() => handleOpenDoc(deed.documentHash, isInitial ? 'title' : 'sale')}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition flex items-center space-x-1"
                    >
                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                      <span>View Document</span>
                    </button>

                    <button
                      onClick={() => handleVerifyDeedDoc(deed.documentHash)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition flex items-center space-x-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5 text-blue-400" />
                      <span>Verify Document</span>
                    </button>

                    {verifyStatus === 'matched' && (
                      <span className="text-xs text-emerald-400 font-semibold flex items-center space-x-1 px-2 py-1 bg-emerald-950/60 rounded-lg border border-emerald-800">
                        <Check className="w-3.5 h-3.5" />
                        <span>Matches on-chain hash</span>
                      </span>
                    )}

                    {verifyStatus === 'mismatch' && (
                      <span className="text-xs text-red-400 font-semibold flex items-center space-x-1 px-2 py-1 bg-red-950/60 rounded-lg border border-red-800">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Does not match</span>
                      </span>
                    )}

                    {deed.transactionHash && (
                      <a
                        href={`${MONAD_TESTNET.blockExplorers.default.url}/tx/${deed.transactionHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                        title="View transaction on MonadVision"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Document Viewer Modal */}
      {activeModalDoc && (
        <DocumentViewerModal
          document={activeModalDoc}
          onClose={() => setActiveModalDoc(null)}
        />
      )}
    </div>
  );
};
