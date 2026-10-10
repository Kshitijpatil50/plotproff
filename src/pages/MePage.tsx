import React, { useEffect, useState } from 'react';
import { parseEther } from 'viem';
import {
  Wallet,
  Coins,
  Send,
  AlertOctagon,
  XCircle,
  ShieldAlert,
  ArrowUpRight,
  ExternalLink,
  Check,
  Copy,
  Clock,
  FileText,
  Upload,
} from 'lucide-react';
import { MONAD_TESTNET } from '../config';
import type {
  PlotDoc,
  WalletDoc,
  DisputeDoc,
  DocumentDoc,
  OnChainPlot,
  OnChainSale,
  Address,
  Hash,
} from '../types';
import {
  formatMon,
  shortAddress,
  shortHash,
  computeDocumentHash,
  generateSaleAgreementText,
} from '../utils/crypto';
import {
  subscribeWallets,
  subscribePlots,
  saveWallet,
  saveDispute,
  saveBlocked,
  saveDocument,
} from '../services/db';
import {
  getOrCreateBurnerWallet,
  fetchBalance,
  fetchPlotState,
  fetchSaleState,
  callProposeSale,
  callPayForPlot,
  callCancelSale,
  callRaiseDispute,
  formatContractError,
  isTransactionLockActive,
} from '../services/blockchain';
import { NFTCard } from '../components/NFTCard';
import { DocumentViewerModal } from '../components/DocumentViewerModal';

export const MePage: React.FC = () => {
  const [burner, setBurner] = useState<{ account: any; privateKey: `0x${string}` } | null>(null);
  const [balance, setBalance] = useState<bigint>(0n);
  const [nickname, setNickname] = useState('');
  const [isEditingNick, setIsEditingNick] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);

  const [allWallets, setAllWallets] = useState<Record<string, WalletDoc>>({});
  const [plots, setPlots] = useState<PlotDoc[]>([]);
  const [myPlots, setMyPlots] = useState<Array<{ doc: PlotDoc; onChain: OnChainPlot; sale: OnChainSale }>>([]);
  const [incomingOffers, setIncomingOffers] = useState<Array<{ plotId: number; doc: PlotDoc; sale: OnChainSale }>>([]);

  // Modals & In-flight actions
  const [isTxPending, setIsTxPending] = useState(false);
  const [txNotice, setTxNotice] = useState<{ type: 'success' | 'error' | 'blocked'; msg: string; txHash?: string } | null>(null);

  // Propose Sale Modal State
  const [sellModalPlot, setSellModalPlot] = useState<{ plotId: number; surveyNo: string } | null>(null);
  const [sellBuyerAddr, setSellBuyerAddr] = useState<string>('');
  const [sellPriceMon, setSellPriceMon] = useState<string>('0.01');
  const [customSaleDoc, setCustomSaleDoc] = useState<{ name: string; bytes?: Uint8Array; text?: string } | null>(null);
  const [showAgreementPreview, setShowAgreementPreview] = useState(true);

  // Dispute Modal State
  const [disputeModalPlotId, setDisputeModalPlotId] = useState<number | null>(null);
  const [disputeReason, setDisputeReason] = useState<string>('');

  // Document modal preview
  const [activeModalDoc, setActiveModalDoc] = useState<DocumentDoc | null>(null);

  // Init burner wallet
  useEffect(() => {
    const w = getOrCreateBurnerWallet();
    setBurner(w);
  }, []);

  // Subscribe DB
  useEffect(() => {
    const unsubWallets = subscribeWallets(setAllWallets);
    const unsubPlots = subscribePlots(setPlots);
    return () => {
      unsubWallets();
      unsubPlots();
    };
  }, []);

  // Update wallet doc & balance
  const refreshWalletState = async () => {
    if (!burner) return;
    const addr = burner.account.address as Address;
    const b = await fetchBalance(addr);
    setBalance(b);

    const existing = allWallets[addr.toLowerCase()];
    if (existing) {
      setNickname(existing.nick);
    } else {
      // First visit: create nickname & request drip
      const defaultNick = `Trader-${addr.substring(2, 6)}`;
      setNickname(defaultNick);
      await saveWallet({
        address: addr,
        nick: defaultNick,
        dripped: false,
        assignedPlot: null,
        ts: Date.now(),
      });
    }
  };

  useEffect(() => {
    if (burner) {
      refreshWalletState();
    }
  }, [burner, allWallets]);

  // Find plots I own and incoming offers
  const refreshPlotsState = async () => {
    if (!burner || plots.length === 0) return;
    const myAddr = burner.account.address.toLowerCase();

    const ownedList: Array<{ doc: PlotDoc; onChain: OnChainPlot; sale: OnChainSale }> = [];
    const offersList: Array<{ plotId: number; doc: PlotDoc; sale: OnChainSale }> = [];

    for (const p of plots) {
      try {
        const [cPlot, cSale] = await Promise.all([
          fetchPlotState(p.id),
          fetchSaleState(p.id),
        ]);

        if (cPlot.owner.toLowerCase() === myAddr) {
          ownedList.push({ doc: p, onChain: cPlot, sale: cSale });
        }

        if (cSale.active && cSale.buyer.toLowerCase() === myAddr) {
          offersList.push({ plotId: p.id, doc: p, sale: cSale });
        }
      } catch (e) {
        console.warn('Error reading plot state:', e);
      }
    }

    setMyPlots(ownedList);
    setIncomingOffers(offersList);
  };

  useEffect(() => {
    if (plots.length > 0 && burner) {
      refreshPlotsState();
    }
  }, [plots, burner]);

  const handleSaveNickname = async () => {
    if (!burner || !nickname.trim()) return;
    const addr = burner.account.address as Address;
    const existing = allWallets[addr.toLowerCase()];
    await saveWallet({
      address: addr,
      nick: nickname.trim(),
      dripped: existing ? existing.dripped : false,
      assignedPlot: existing ? existing.assignedPlot : null,
      ts: Date.now(),
    });
    setIsEditingNick(false);
  };

  // 1. Propose Sale Flow with Document Generation
  const handleOpenSellModal = (plotId: number, surveyNo: string) => {
    setSellModalPlot({ plotId, surveyNo });
    // pick first available other wallet as suggested buyer
    const otherWallets = Object.values(allWallets).filter(
      (w) => w.address.toLowerCase() !== burner?.account.address.toLowerCase()
    );
    if (otherWallets.length > 0) {
      setSellBuyerAddr(otherWallets[0].address);
    } else {
      setSellBuyerAddr('');
    }
    setSellPriceMon('0.01');
    setCustomSaleDoc(null);
  };

  const executeProposeSale = async () => {
    if (!burner || !sellModalPlot || !sellBuyerAddr) return;
    setIsTxPending(true);
    setTxNotice(null);

    try {
      const sellerNick = nickname || shortAddress(burner.account.address);
      const buyerDoc = allWallets[sellBuyerAddr.toLowerCase()];
      const buyerNick = buyerDoc ? buyerDoc.nick : shortAddress(sellBuyerAddr);

      // Generate or read document
      let docText = '';
      let docHash: Hash;
      let docName = `Sale-Agreement-Plot-${sellModalPlot.plotId}.txt`;
      let docSize = 0;
      let base64Data: string | undefined = undefined;

      if (customSaleDoc && customSaleDoc.bytes) {
        docHash = computeDocumentHash(customSaleDoc.bytes);
        docName = customSaleDoc.name;
        docSize = customSaleDoc.bytes.length;
        // encode base64
        base64Data = btoa(String.fromCharCode(...customSaleDoc.bytes));
      } else {
        docText = generateSaleAgreementText({
          plotId: sellModalPlot.plotId,
          surveyNo: sellModalPlot.surveyNo,
          sellerNick,
          sellerAddress: burner.account.address,
          buyerNick,
          buyerAddress: sellBuyerAddr,
          priceMon: sellPriceMon,
          date: new Date().toISOString(),
        });
        docHash = computeDocumentHash(docText);
        docSize = docText.length;
      }

      // Save document to off-chain store
      await saveDocument({
        hash: docHash,
        name: docName,
        mime: 'text/plain',
        size: docSize,
        kind: 'sale',
        plotId: sellModalPlot.plotId,
        createdBy: burner.account.address,
        createdAt: Date.now(),
        text: docText || undefined,
        dataBase64: base64Data,
      });

      // Call proposeSale on contract
      const priceWei = parseEther(sellPriceMon);
      const txHash = await callProposeSale(burner.privateKey, {
        plotId: sellModalPlot.plotId,
        buyer: sellBuyerAddr as Address,
        price: priceWei,
        saleDocHash: docHash,
      });

      setTxNotice({
        type: 'success',
        msg: `Sale agreement proposed on-chain! Linked to document hash ${shortHash(docHash)}.`,
        txHash,
      });
      setSellModalPlot(null);
      await refreshPlotsState();
    } catch (err: any) {
      const msg = formatContractError(err);
      setTxNotice({ type: 'error', msg });
    } finally {
      setIsTxPending(false);
    }
  };

  // 2. Double-Sale Challenge: Try to sell again for a different buyer to demonstrate SaleActive error
  const handleDoubleSaleChallenge = async (plotId: number, surveyNo: string) => {
    if (!burner) return;
    setIsTxPending(true);
    setTxNotice(null);

    try {
      // Pick another buyer
      const mockAltBuyer = '0x9999999999999999999999999999999999999999' as Address;
      const docText = generateSaleAgreementText({
        plotId,
        surveyNo,
        sellerNick: nickname,
        sellerAddress: burner.account.address,
        buyerNick: 'Secondary Alternate Buyer',
        buyerAddress: mockAltBuyer,
        priceMon: '0.02',
        date: new Date().toISOString(),
      });
      const docHash = computeDocumentHash(docText);

      // Attempt to call proposeSale second time
      await callProposeSale(burner.privateKey, {
        plotId,
        buyer: mockAltBuyer,
        price: parseEther('0.02'),
        saleDocHash: docHash,
      });

      // If it unexpectedly didn't revert
      setTxNotice({
        type: 'success',
        msg: 'Transaction passed (Unexpected for double sale).',
      });
    } catch (err: any) {
      const friendlyMsg = formatContractError(err);
      // Log blocked attempt to blocked/
      await saveBlocked({
        plotId,
        by: burner.account.address,
        error: friendlyMsg,
        ts: Date.now(),
      });

      setTxNotice({
        type: 'blocked',
        msg: `DOUBLE-SALE BLOCKED BY MONAD: ${friendlyMsg}`,
      });
    } finally {
      setIsTxPending(false);
    }
  };

  // 3. Pay for Plot (Incoming Offer)
  const handlePayForPlot = async (plotId: number, price: bigint) => {
    if (!burner) return;
    setIsTxPending(true);
    setTxNotice(null);

    try {
      const txHash = await callPayForPlot(burner.privateKey, {
        plotId,
        price,
      });
      setTxNotice({
        type: 'success',
        msg: 'Escrow payment funded! Awaiting Registrar witness approval to finalize deed.',
        txHash,
      });
      await refreshWalletState();
      await refreshPlotsState();
    } catch (err) {
      const msg = formatContractError(err);
      setTxNotice({ type: 'error', msg });
    } finally {
      setIsTxPending(false);
    }
  };

  // 4. Cancel Sale
  const handleCancelSale = async (plotId: number) => {
    if (!burner) return;
    setIsTxPending(true);
    setTxNotice(null);

    try {
      const txHash = await callCancelSale(burner.privateKey, plotId);
      setTxNotice({
        type: 'success',
        msg: 'Pending sale cancelled successfully.',
        txHash,
      });
      await refreshPlotsState();
    } catch (err) {
      const msg = formatContractError(err);
      setTxNotice({ type: 'error', msg });
    } finally {
      setIsTxPending(false);
    }
  };

  // 5. Raise Dispute
  const executeRaiseDispute = async () => {
    if (!burner || !disputeModalPlotId || !disputeReason.trim()) return;
    setIsTxPending(true);
    setTxNotice(null);

    try {
      const reasonHash = computeDocumentHash(disputeReason.trim());
      // Save dispute to off-chain db
      await saveDispute({
        plotId: disputeModalPlotId,
        reason: disputeReason.trim(),
        by: burner.account.address,
        ts: Date.now(),
      });

      const txHash = await callRaiseDispute(burner.privateKey, disputeModalPlotId, reasonHash);
      setTxNotice({
        type: 'success',
        msg: 'Dispute raised! Plot is now cryptographically frozen on-chain.',
        txHash,
      });
      setDisputeModalPlotId(null);
      setDisputeReason('');
      await refreshPlotsState();
    } catch (err) {
      const msg = formatContractError(err);
      setTxNotice({ type: 'error', msg });
    } finally {
      setIsTxPending(false);
    }
  };

  const isDripped = burner && allWallets[burner.account.address.toLowerCase()]?.dripped;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Trader Profile Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xl font-mono shadow-inner">
            {nickname.slice(0, 2).toUpperCase() || 'TR'}
          </div>

          <div>
            <div className="flex items-center space-x-2">
              {isEditingNick ? (
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none focus:border-emerald-500 font-bold"
                    placeholder="Enter nickname"
                  />
                  <button
                    onClick={handleSaveNickname}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <h2 className="text-xl font-extrabold text-white">{nickname || 'Trader'}</h2>
                  <button
                    onClick={() => setIsEditingNick(true)}
                    className="text-xs text-slate-400 hover:text-emerald-400 underline font-medium"
                  >
                    Edit
                  </button>
                </div>
              )}

              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                Burner Wallet
              </span>
            </div>

            <div className="flex items-center space-x-2 mt-1">
              <span className="font-mono text-xs text-slate-400">
                {shortAddress(burner?.account.address)}
              </span>
              <button
                onClick={() => {
                  if (burner) {
                    navigator.clipboard.writeText(burner.account.address);
                    setCopiedAddr(true);
                    setTimeout(() => setCopiedAddr(false), 2000);
                  }
                }}
                className="text-slate-500 hover:text-slate-300"
                title="Copy full address"
              >
                {copiedAddr ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Monad Balance */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 flex items-center justify-between sm:justify-start sm:space-x-4 min-w-[220px]">
          <div>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold">
              Native Monad Balance
            </span>
            <div className="flex items-baseline space-x-1 mt-0.5">
              <span className="text-2xl font-black text-white font-mono">{formatMon(balance)}</span>
              <span className="text-xs font-bold text-emerald-400 font-mono">MON</span>
            </div>
          </div>

          {!isDripped && balance === 0n && (
            <div className="flex items-center space-x-1.5 text-xs text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2.5 py-1 rounded-lg">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              <span>Waiting for starter MON...</span>
            </div>
          )}
        </div>
      </div>

      {/* Action / Error Banner */}
      {txNotice && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 ${
            txNotice.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200'
              : txNotice.type === 'blocked'
              ? 'bg-red-950/90 border-red-500 text-red-200 animate-pulse'
              : 'bg-red-950/60 border-red-500/60 text-red-200'
          }`}
        >
          <div className="flex items-start space-x-3">
            {txNotice.type === 'success' ? (
              <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : txNotice.type === 'blocked' ? (
              <AlertOctagon className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className="text-sm font-semibold">{txNotice.msg}</p>
              {txNotice.txHash && (
                <a
                  href={`${MONAD_TESTNET.blockExplorers.default.url}/tx/${txNotice.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-emerald-400 underline font-mono mt-1 inline-flex items-center space-x-1"
                >
                  <span>View on MonadVision</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
          <button
            onClick={() => setTxNotice(null)}
            className="text-slate-400 hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      {/* Incoming Offers (Escrow Payments Required) */}
      {incomingOffers.length > 0 && (
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center space-x-2">
            <Coins className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-extrabold text-white">
              Incoming Land Purchase Offers ({incomingOffers.length})
            </h3>
          </div>

          <div className="space-y-3">
            {incomingOffers.map((item) => {
              const alreadyPaid = item.sale.paid;

              return (
                <div
                  key={item.plotId}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-sm">
                        Plot #{item.plotId} · Survey {item.doc.surveyNo}
                      </span>
                      <span className="text-xs text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded font-mono">
                        {formatMon(item.sale.price)} MON
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {alreadyPaid
                        ? 'Deposit received in escrow vault. Awaiting Registrar witness approval.'
                        : 'Sale agreement signed. Deposit exact MON into contract vault to secure deed.'}
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <a
                      href={`#/plot/${item.plotId}`}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold"
                    >
                      View Plot
                    </a>

                    {!alreadyPaid && (
                      <button
                        onClick={() => handlePayForPlot(item.plotId, item.sale.price)}
                        disabled={isTxPending}
                        className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-extrabold transition disabled:opacity-50 flex items-center space-x-1.5"
                      >
                        <Coins className="w-3.5 h-3.5" />
                        <span>Pay {formatMon(item.sale.price)} MON</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* "My Plots" Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-white">
            My Registered Land Tokens ({myPlots.length})
          </h3>
          <span className="text-xs text-slate-400">
            Cryptographically verified ERC-721 cadastre deeds
          </span>
        </div>

        {myPlots.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
            <ShieldAlert className="w-12 h-12 text-slate-600 mx-auto" />
            <h4 className="text-base font-bold text-slate-300">No plots assigned yet</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              If the Registrar station is running, your burner wallet will automatically receive 0.3 MON starter funds and an auto-assigned parcel from the cadastre grid.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {myPlots.map(({ doc, onChain, sale }) => {
              const isFrozen = onChain.frozen;
              const hasActiveSale = sale.active;

              return (
                <div
                  key={doc.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-xl space-y-4 flex flex-col justify-between"
                >
                  {/* Small NFT Card Top */}
                  <NFTCard
                    plotId={doc.id}
                    surveyNo={onChain.surveyNo || doc.surveyNo}
                    village={onChain.village || doc.village}
                    areaSqm={onChain.areaSqm || doc.areaSqm}
                    owner={onChain.owner}
                    tokenURI={onChain.tokenURI}
                    compact={true}
                  />

                  {/* Status Indicator */}
                  <div className="text-xs flex items-center justify-between pt-1">
                    <span className="text-slate-400">Status:</span>
                    {isFrozen ? (
                      <span className="text-red-400 font-bold bg-red-950/60 px-2 py-0.5 rounded border border-red-800">
                        Disputed · Frozen
                      </span>
                    ) : hasActiveSale ? (
                      <span className="text-amber-400 font-bold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
                        Sale Active ({formatMon(sale.price)} MON) {sale.paid ? '· Escrow Paid' : ''}
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                        Clear Title
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-slate-800/80 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={`#/plot/${doc.id}`}
                        className="py-2 text-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                      >
                        Inspect Deed
                      </a>

                      {!hasActiveSale && !isFrozen ? (
                        <button
                          onClick={() => handleOpenSellModal(doc.id, doc.surveyNo)}
                          disabled={isTxPending}
                          className="py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                        >
                          Propose Sale
                        </button>
                      ) : hasActiveSale ? (
                        <button
                          onClick={() => handleCancelSale(doc.id)}
                          disabled={isTxPending}
                          className="py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition disabled:opacity-50"
                        >
                          Cancel Sale
                        </button>
                      ) : null}
                    </div>

                    {/* Hackathon Demo: Double-Sale Challenge Button */}
                    {hasActiveSale && !isFrozen && (
                      <button
                        onClick={() => handleDoubleSaleChallenge(doc.id, doc.surveyNo)}
                        disabled={isTxPending}
                        className="w-full py-2 bg-red-950/60 hover:bg-red-900/60 border border-red-500/40 text-red-300 rounded-xl text-xs font-extrabold transition flex items-center justify-center space-x-1.5"
                        title="Intentionally trigger contract SaleActive revert"
                      >
                        <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
                        <span>Try to sell again (Double-Sale Challenge)</span>
                      </button>
                    )}

                    {/* Dispute button */}
                    {!isFrozen && (
                      <button
                        onClick={() => {
                          setDisputeModalPlotId(doc.id);
                          setDisputeReason('Boundary peg encroachment by adjacent property owner.');
                        }}
                        className="w-full py-1.5 text-slate-500 hover:text-red-400 text-[11px] font-medium transition text-center"
                      >
                        Raise Title Dispute
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sell Modal */}
      {sellModalPlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-extrabold text-base text-white">
                Propose Sale Agreement · Survey {sellModalPlot.surveyNo}
              </h3>
              <button
                onClick={() => setSellModalPlot(null)}
                className="text-slate-400 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Select Buyer</label>
                <select
                  value={sellBuyerAddr}
                  onChange={(e) => setSellBuyerAddr(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Choose Buyer --</option>
                  {Object.values(allWallets)
                    .filter((w) => w.address.toLowerCase() !== burner?.account.address.toLowerCase())
                    .map((w) => (
                      <option key={w.address} value={w.address}>
                        {w.nick} ({shortAddress(w.address)})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Agreed Escrow Price (MON)</label>
                <input
                  type="text"
                  value={sellPriceMon}
                  onChange={(e) => setSellPriceMon(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  placeholder="0.01"
                />
              </div>

              {/* Agreement Document Preview */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-300">Title Conveyance Agreement</span>
                  <label className="text-emerald-400 hover:underline cursor-pointer flex items-center space-x-1">
                    <Upload className="w-3 h-3" />
                    <span>Upload PDF/Custom Doc</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const buf = await file.arrayBuffer();
                          setCustomSaleDoc({
                            name: file.name,
                            bytes: new Uint8Array(buf),
                          });
                        }
                      }}
                    />
                  </label>
                </div>

                {customSaleDoc ? (
                  <p className="text-[11px] text-emerald-300 font-mono">
                    Custom document attached: {customSaleDoc.name}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 font-mono whitespace-pre-line leading-relaxed">
                    Auto-generated legal conveyance deed will be hashed with Keccak-256 and committed on-chain as saleDocHash.
                  </p>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
              <button
                onClick={() => setSellModalPlot(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={executeProposeSale}
                disabled={isTxPending || !sellBuyerAddr}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                {isTxPending ? 'Signing on Monad...' : 'Sign & Propose Sale'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {disputeModalPlotId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
              <ShieldAlert className="w-5 h-5 text-red-400" />
              <h3 className="font-extrabold text-base text-white">
                Raise Dispute on Plot #{disputeModalPlotId}
              </h3>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Raising a dispute writes an immutable reason hash to Monad and freezes the plot, blocking all title transfers until resolved by the Registrar witness.
            </p>

            <div>
              <label className="block text-slate-400 text-xs mb-1 font-medium">Dispute Reason</label>
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-red-500"
                placeholder="Describe reason for dispute..."
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setDisputeModalPlotId(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={executeRaiseDispute}
                disabled={isTxPending || !disputeReason.trim()}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                {isTxPending ? 'Freezing Plot...' : 'Confirm & Freeze Plot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
