import React, { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Search,
  ExternalLink,
  FileText,
  Filter,
  CheckCircle,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { MONAD_TESTNET } from '../config';
import type { DeedRecord, PlotDoc, DocumentDoc, WalletDoc } from '../types';
import {
  formatDeedNo,
  shortAddress,
  shortHash,
  formatMon,
  ZERO_ADDRESS,
} from '../utils/crypto';
import { subscribePlots, subscribeWallets, getDocument } from '../services/db';
import { fetchDeedHistory } from '../services/blockchain';
import { DocumentViewerModal } from '../components/DocumentViewerModal';

export const LedgerPage: React.FC = () => {
  const [deeds, setDeeds] = useState<DeedRecord[]>([]);
  const [plots, setPlots] = useState<PlotDoc[]>([]);
  const [wallets, setWallets] = useState<Record<string, WalletDoc>>({});
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlotId, setFilterPlotId] = useState<string>('all');
  const [activeModalDoc, setActiveModalDoc] = useState<DocumentDoc | null>(null);

  // Load deeds
  const loadDeeds = async () => {
    setLoading(true);
    try {
      const history = await fetchDeedHistory();
      setDeeds(history);
    } catch (e) {
      console.warn('Error loading deeds ledger:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeeds();
    const unsubPlots = subscribePlots(setPlots);
    const unsubWallets = subscribeWallets(setWallets);
    return () => {
      unsubPlots();
      unsubWallets();
    };
  }, []);

  const getSurveyNo = (plotId: bigint | number) => {
    const p = plots.find((item) => item.id === Number(plotId));
    return p ? p.surveyNo : `101/${plotId}`;
  };

  const getPartyDisplay = (addr: string) => {
    if (!addr || addr === ZERO_ADDRESS) return 'Cadastre Registrar';
    const w = wallets[addr.toLowerCase()];
    return w ? `${w.nick} (${shortAddress(addr)})` : shortAddress(addr);
  };

  // Open Document Modal
  const handleOpenDoc = async (docHash: string, plotId: number, isInitial: boolean) => {
    const docItem = await getDocument(docHash as any);
    if (docItem) {
      setActiveModalDoc(docItem);
    } else {
      setActiveModalDoc({
        hash: docHash as any,
        name: `Deed-Document-${shortHash(docHash)}.txt`,
        mime: 'text/plain',
        size: 256,
        kind: isInitial ? 'title' : 'sale',
        plotId,
        createdBy: ZERO_ADDRESS,
        createdAt: Date.now(),
        text: `Document Hash: ${docHash}\nOfficial Monad Testnet Cadastre Deed Record`,
      });
    }
  };

  // Filtered Deeds
  const filteredDeeds = deeds.filter((d) => {
    if (filterPlotId !== 'all' && Number(d.plotId) !== Number(filterPlotId)) {
      return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const deedNoStr = formatDeedNo(d.deedNo).toLowerCase();
    const survey = getSurveyNo(d.plotId).toLowerCase();
    const fromStr = getPartyDisplay(d.from).toLowerCase();
    const toStr = getPartyDisplay(d.to).toLowerCase();
    const docHashStr = d.documentHash.toLowerCase();

    return (
      deedNoStr.includes(q) ||
      survey.includes(q) ||
      fromStr.includes(q) ||
      toStr.includes(q) ||
      docHashStr.includes(q) ||
      d.plotId.toString().includes(q)
    );
  });

  // Calculate totals
  const totalVolumeWei = filteredDeeds.reduce((acc, d) => acc + d.price, 0n);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Deed No',
      'Date',
      'Plot ID',
      'Survey No',
      'From Address',
      'To Address',
      'Price (MON)',
      'Document Hash',
      'Previous Deed Hash',
      'Deed Hash',
      'Transaction Hash',
    ];

    const rows = filteredDeeds.map((d) => [
      formatDeedNo(d.deedNo),
      d.timestamp ? new Date(d.timestamp).toISOString() : new Date().toISOString(),
      d.plotId.toString(),
      getSurveyNo(d.plotId),
      d.from,
      d.to,
      formatMon(d.price),
      d.documentHash,
      d.prevDeedHash,
      d.deedHash,
      d.transactionHash || '',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${val}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PlotProof_Cadastre_Deeds_Ledger_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Cadastral Title Deeds Ledger
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                ERP-grade cryptographic record of all land plot registrations, sales, and witness conveyances.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadDeeds}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
            title="Reload ledger"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-2"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Deed No, Survey No, Trader Nickname, Address, or Doc Hash..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="flex items-center space-x-2 text-xs text-slate-400 flex-shrink-0">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter Parcel:</span>
          </div>
          <select
            value={filterPlotId}
            onChange={(e) => setFilterPlotId(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
          >
            <option value="all">All Parcels</option>
            {plots.map((p) => (
              <option key={p.id} value={p.id.toString()}>
                Plot #{p.id} (Survey {p.surveyNo})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Deeds Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase font-mono tracking-wider">
                <th className="py-3.5 px-4 font-bold">Deed No</th>
                <th className="py-3.5 px-4 font-bold">Date</th>
                <th className="py-3.5 px-4 font-bold">Plot / Survey</th>
                <th className="py-3.5 px-4 font-bold">From</th>
                <th className="py-3.5 px-4 font-bold">To</th>
                <th className="py-3.5 px-4 font-bold text-right">Price (MON)</th>
                <th className="py-3.5 px-4 font-bold">Document</th>
                <th className="py-3.5 px-4 font-bold text-center">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-sans">
              {filteredDeeds.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No deed records match your search criteria.
                  </td>
                </tr>
              ) : (
                filteredDeeds.map((deed) => {
                  const isInitial = deed.from === ZERO_ADDRESS;
                  const surveyNo = getSurveyNo(deed.plotId);

                  return (
                    <tr
                      key={String(deed.deedNo)}
                      className="hover:bg-slate-800/40 transition group"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-white whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-emerald-400">{formatDeedNo(deed.deedNo)}</span>
                          {isInitial && (
                            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
                              Init
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap text-[11px]">
                        {deed.timestamp ? new Date(deed.timestamp).toLocaleDateString() : new Date().toLocaleDateString()}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <a
                          href={`#/plot/${deed.plotId}`}
                          className="font-bold text-white hover:text-emerald-400 transition"
                        >
                          Plot #{Number(deed.plotId)} · {surveyNo}
                        </a>
                      </td>

                      <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px] whitespace-nowrap">
                        {getPartyDisplay(deed.from)}
                      </td>

                      <td className="py-3.5 px-4 text-emerald-400 font-mono text-[11px] whitespace-nowrap">
                        {getPartyDisplay(deed.to)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white whitespace-nowrap">
                        {formatMon(deed.price)}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <button
                          onClick={() => handleOpenDoc(deed.documentHash, Number(deed.plotId), isInitial)}
                          className="flex items-center space-x-1 text-slate-300 hover:text-white bg-slate-950 px-2 py-1 rounded border border-slate-800 hover:border-slate-700 transition font-mono text-[11px]"
                        >
                          <FileText className="w-3 h-3 text-emerald-400" />
                          <span>{shortHash(deed.documentHash)}</span>
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {deed.transactionHash && (
                          <a
                            href={`${MONAD_TESTNET.blockExplorers.default.url}/tx/${deed.transactionHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-slate-400 hover:text-white rounded inline-flex"
                            title="View on MonadVision"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Total Row */}
            <tfoot>
              <tr className="bg-slate-950 border-t-2 border-slate-800 font-mono text-xs font-bold text-white">
                <td className="py-4 px-4" colSpan={3}>
                  Total Records: {filteredDeeds.length} Deeds
                </td>
                <td colSpan={2} className="py-4 px-4 text-right text-slate-400">
                  Total Conveyance Volume:
                </td>
                <td className="py-4 px-4 text-right text-emerald-400">
                  {formatMon(totalVolumeWei)} MON
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
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
