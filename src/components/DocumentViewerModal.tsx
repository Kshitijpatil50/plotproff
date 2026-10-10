import React, { useState } from 'react';
import { X, CheckCircle, AlertTriangle, FileText, Download, Copy, Check } from 'lucide-react';
import type { DocumentDoc } from '../types';
import { computeDocumentHash, shortAddress, shortHash } from '../utils/crypto';

interface DocumentViewerModalProps {
  document: DocumentDoc | null;
  onClose: () => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({ document, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [verifyState, setVerifyState] = useState<'idle' | 'matched' | 'mismatch'>('idle');

  if (!document) return null;

  const handleCopyText = () => {
    if (document.text) {
      navigator.clipboard.writeText(document.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleVerify = () => {
    if (document.text) {
      const computed = computeDocumentHash(document.text);
      if (computed.toLowerCase() === document.hash.toLowerCase()) {
        setVerifyState('matched');
      } else {
        setVerifyState('mismatch');
      }
    } else if (document.dataBase64) {
      // Decode base64 to Uint8Array
      try {
        const bin = atob(document.dataBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const computed = computeDocumentHash(bytes);
        if (computed.toLowerCase() === document.hash.toLowerCase()) {
          setVerifyState('matched');
        } else {
          setVerifyState('mismatch');
        }
      } catch {
        setVerifyState('mismatch');
      }
    }
  };

  const handleDownload = () => {
    if (document.text) {
      const blob = new Blob([document.text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = document.name;
      a.click();
      URL.revokeObjectURL(url);
    } else if (document.dataBase64) {
      const a = window.document.createElement('a');
      a.href = `data:${document.mime || 'application/octet-stream'};base64,${document.dataBase64}`;
      a.download = document.name;
      a.click();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-white text-base truncate max-w-sm">{document.name}</h3>
                <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {document.kind}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Hash: {shortHash(document.hash)} · Plot #{document.plotId}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Document Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {document.text ? (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed select-text">
              {document.text}
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-950 border border-slate-800 rounded-xl">
              <FileText className="w-12 h-12 text-slate-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-300">Binary Document ({document.mime})</p>
              <p className="text-xs text-slate-500 mt-1">Size: {(document.size / 1024).toFixed(1)} KB</p>
            </div>
          )}

          {/* Verification Bar */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <span className="text-slate-400 block font-sans">Full Document Hash (Keccak256):</span>
              <span className="font-mono text-emerald-400 break-all select-all">{document.hash}</span>
            </div>
            <button
              onClick={handleVerify}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition flex items-center space-x-1.5 flex-shrink-0"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Verify Hash</span>
            </button>
          </div>

          {verifyState === 'matched' && (
            <div className="p-3 bg-emerald-950/50 border border-emerald-800/80 rounded-xl flex items-center space-x-2 text-xs text-emerald-300">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Cryptographic Match: Keccak-256 of stored bytes exactly equals on-chain document hash.</span>
            </div>
          )}

          {verifyState === 'mismatch' && (
            <div className="p-3 bg-red-950/50 border border-red-800/80 rounded-xl flex items-center space-x-2 text-xs text-red-300">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>Hash mismatch! The document payload does not match the on-chain hash.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Recorded {new Date(document.createdAt).toLocaleDateString()} by {shortAddress(document.createdBy)}
          </div>
          <div className="flex items-center space-x-2">
            {document.text && (
              <button
                onClick={handleCopyText}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition flex items-center space-x-1"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Text'}</span>
              </button>
            )}
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition flex items-center space-x-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
