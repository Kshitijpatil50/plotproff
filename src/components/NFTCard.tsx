import React from 'react';
import { ExternalLink, ShieldCheck, MapPin } from 'lucide-react';
import { CONTRACT_ADDRESS, MONAD_TESTNET } from '../config';
import type { NFTMetadata } from '../types';
import { shortAddress, shortHash } from '../utils/crypto';

interface NFTCardProps {
  plotId: number;
  surveyNo: string;
  village: string;
  areaSqm: number;
  owner: string;
  tokenURI?: string;
  boundaryHash?: string;
  compact?: boolean;
}

export const NFTCard: React.FC<NFTCardProps> = ({
  plotId,
  surveyNo,
  village,
  areaSqm,
  owner,
  tokenURI,
  boundaryHash,
  compact = false,
}) => {
  let metadata: NFTMetadata | null = null;
  if (tokenURI) {
    try {
      if (tokenURI.startsWith('data:application/json')) {
        const jsonStr = decodeURIComponent(tokenURI.split(',')[1]);
        metadata = JSON.parse(jsonStr);
      }
    } catch (e) {
      // ignore
    }
  }

  const explorerUrl = `${MONAD_TESTNET.blockExplorers.default.url}/token/${CONTRACT_ADDRESS}?a=${plotId}`;

  if (compact) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center space-x-3 hover:border-slate-700 transition">
        <div className="w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex-shrink-0 flex items-center justify-center overflow-hidden">
          {metadata?.image ? (
            <img src={metadata.image} alt={`Plot #${plotId}`} className="w-full h-full object-cover" />
          ) : (
            <span className="font-mono text-xs font-bold text-emerald-400">#{plotId}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-white text-sm truncate">Survey {surveyNo}</span>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">
              #{plotId}
            </span>
          </div>
          <p className="text-xs text-slate-400 truncate">
            {village} · {areaSqm} m²
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl text-slate-100 flex flex-col">
      {/* Visual Header / NFT Image */}
      <div className="relative aspect-square w-full bg-slate-950 flex items-center justify-center border-b border-slate-800/80 p-2">
        {metadata?.image ? (
          <img
            src={metadata.image}
            alt={metadata.name || `Cadastre NFT #${plotId}`}
            className="w-full h-full object-contain rounded-xl"
          />
        ) : (
          <div className="w-full h-full bg-slate-900/50 rounded-xl flex flex-col items-center justify-center p-6 text-center border border-slate-800">
            <ShieldCheck className="w-12 h-12 text-emerald-400 mb-2" />
            <span className="text-sm font-bold text-white">Monad Cadastre Token</span>
            <span className="text-xs text-slate-400 font-mono mt-1">Plot ID #{plotId}</span>
          </div>
        )}

        <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-md border border-slate-700/60 px-2.5 py-1 rounded-full flex items-center space-x-1.5 text-xs font-mono font-medium text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>ERC-721 Land NFT</span>
        </div>

        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur-md border border-slate-700/60 p-2 rounded-full text-slate-300 hover:text-white transition"
          title="View on MonadVision Explorer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Token Details */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div>
          <div className="flex items-baseline justify-between">
            <h4 className="text-lg font-extrabold text-white">Survey {surveyNo}</h4>
            <span className="font-mono text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
              Token ID #{plotId}
            </span>
          </div>
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 mt-1">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span>{village} · {areaSqm} sq m (~{Math.round(areaSqm * 10.7639)} sq ft)</span>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-800/60 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Titleholder</span>
            <span className="font-mono text-slate-200">{shortAddress(owner)}</span>
          </div>
          {boundaryHash && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Boundary Hash</span>
              <span className="font-mono text-emerald-400/90">{shortHash(boundaryHash)}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Contract</span>
            <a
              href={`${MONAD_TESTNET.blockExplorers.default.url}/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-blue-400 hover:underline flex items-center space-x-1"
            >
              <span>{shortAddress(CONTRACT_ADDRESS)}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
