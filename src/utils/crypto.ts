import {
  encodeAbiParameters,
  keccak256,
  toBytes,
  formatEther,
} from 'viem';
import type { Address, Hash } from '../types';

export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';
export const ZERO_HASH: Hash = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Computes boundary hash = keccak256(toBytes(JSON.stringify(polygon rounded to 6 decimals)))
 */
export function computeBoundaryHash(polygon: [number, number][]): Hash {
  const rounded = polygon.map(([lat, lng]) => [
    Number(lat.toFixed(6)),
    Number(lng.toFixed(6)),
  ]);
  const json = JSON.stringify(rounded);
  return keccak256(toBytes(json));
}

/**
 * Computes document hash = keccak256 of its exact bytes or string
 */
export function computeDocumentHash(data: Uint8Array | string): Hash {
  const bytes = typeof data === 'string' ? toBytes(data) : data;
  return keccak256(bytes);
}

/**
 * Computes deed hash = keccak256(abi.encode(deedNo, plotId, from, to, price, documentHash, prevDeedHash))
 */
export function computeDeedHash(
  deedNo: bigint,
  plotId: bigint,
  from: Address,
  to: Address,
  price: bigint,
  documentHash: Hash,
  prevDeedHash: Hash
): Hash {
  const encoded = encodeAbiParameters(
    [
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'address' },
      { type: 'address' },
      { type: 'uint128' },
      { type: 'bytes32' },
      { type: 'bytes32' },
    ],
    [deedNo, plotId, from, to, price, documentHash, prevDeedHash]
  );
  return keccak256(encoded);
}

/**
 * Approximates polygon area in square meters using equirectangular projection & shoelace formula
 */
export function computePolygonAreaSqm(polygon: [number, number][]): number {
  if (!polygon || polygon.length < 3) return 0;
  const R = 6378137; // Earth radius in meters
  const latCentroid =
    (polygon.reduce((acc, p) => acc + p[0], 0) / polygon.length) * (Math.PI / 180);

  const points = polygon.map(([lat, lng]) => ({
    x: lng * (Math.PI / 180) * R * Math.cos(latCentroid),
    y: lat * (Math.PI / 180) * R,
  }));

  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.max(1, Math.round(Math.abs(area) / 2));
}

/**
 * Deterministic plain-text Title Record document
 */
export function generateTitleRecordText(params: {
  plotId: number;
  surveyNo: string;
  village: string;
  areaSqm: number;
  owner: string;
  boundaryHash: string;
  date: string;
}): string {
  return [
    '====================================================',
    '       PLOTPROOF OFFICIAL TITLE RECORD CERTIFICATE   ',
    '====================================================',
    `Cadastre Plot ID : ${params.plotId}`,
    `Survey Number    : ${params.surveyNo}`,
    `Village / Sector : ${params.village}`,
    `Cadastral Area   : ${params.areaSqm} sq m (~${Math.round(params.areaSqm * 10.7639)} sq ft)`,
    `Registered Owner : ${params.owner}`,
    `Boundary Hash    : ${params.boundaryHash}`,
    `Survey Timestamp : ${params.date}`,
    '----------------------------------------------------',
    'This title record is cryptographically committed on',
    'the Monad blockchain with immutable consensus finality.',
    '====================================================',
  ].join('\n');
}

/**
 * Deterministic plain-text Sale Agreement document
 */
export function generateSaleAgreementText(params: {
  plotId: number;
  surveyNo: string;
  sellerNick: string;
  sellerAddress: string;
  buyerNick: string;
  buyerAddress: string;
  priceMon: string;
  date: string;
}): string {
  return [
    '====================================================',
    '        PLOTPROOF OFFICIAL SALE AGREEMENT DEED      ',
    '====================================================',
    `Cadastre Plot ID : ${params.plotId}`,
    `Survey Number    : ${params.surveyNo}`,
    `Seller           : ${params.sellerNick} (${params.sellerAddress})`,
    `Buyer            : ${params.buyerNick} (${params.buyerAddress})`,
    `Escrow Price     : ${params.priceMon} MON`,
    `Agreement Date   : ${params.date}`,
    '----------------------------------------------------',
    'TERMS & ESCROW COVENANTS:',
    '1. The buyer shall deposit the exact agreed escrow price into',
    '   the Monad smart contract vault.',
    '2. Title deed ownership transfers only upon verified escrow payment',
    '   and official witness attestation by the Registrar.',
    '3. This agreement is cryptographically linked to the previous deed,',
    '   preserving an unbreakable, verifiable chain of title.',
    '====================================================',
  ].join('\n');
}

export function formatDeedNo(deedNo: number | bigint): string {
  return `DEED-2026-${String(deedNo).padStart(4, '0')}`;
}

export function shortAddress(addr?: string): string {
  if (!addr) return '';
  if (addr.toLowerCase() === ZERO_ADDRESS.toLowerCase()) return 'Registrar (Initial)';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function shortHash(hash?: string): string {
  if (!hash) return '';
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export function formatMon(wei?: bigint | string | number): string {
  if (wei === undefined || wei === null) return '0.00';
  try {
    const val = typeof wei === 'bigint' ? wei : BigInt(wei);
    return Number(formatEther(val)).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  } catch {
    return '0.00';
  }
}
