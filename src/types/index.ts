export type Address = `0x${string}`;
export type Hash = `0x${string}`;

export interface PlotDoc {
  id: number;
  name: string;
  surveyNo: string;
  village: string;
  areaSqm: number;
  polygon: [number, number][];
  boundaryHash: Hash;
  titleDocHash?: Hash;
  createdAt?: number;
}

export interface WalletDoc {
  address: Address;
  nick: string;
  dripped: boolean;
  assignedPlot: number | null;
  ts: number;
}

export interface DisputeDoc {
  plotId: number;
  reason: string;
  by: Address;
  ts: number;
}

export interface BlockedDoc {
  id?: string;
  plotId: number;
  by: Address;
  error: string;
  ts: number;
}

export interface DocumentDoc {
  hash: Hash;
  name: string;
  mime: string;
  size: number;
  kind: 'title' | 'sale';
  plotId: number;
  createdBy: Address;
  createdAt: number;
  text?: string;
  dataBase64?: string;
}

export interface DeedRecord {
  deedNo: bigint;
  plotId: bigint;
  from: Address;
  to: Address;
  price: bigint;
  documentHash: Hash;
  prevDeedHash: Hash;
  deedHash: Hash;
  blockNumber?: bigint;
  transactionHash: Hash;
  timestamp?: number;
}

export interface OnChainPlot {
  owner: Address;
  surveyNo: string;
  village: string;
  areaSqm: number;
  boundaryHash: Hash;
  frozen: boolean;
  exists: boolean;
  titleHead?: Hash;
  tokenURI?: string;
}

export interface OnChainSale {
  buyer: Address;
  price: bigint;
  paid: boolean;
  active: boolean;
  documentHash: Hash;
}

export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

export type PlotStatus = 'clear' | 'sale_pending' | 'disputed_frozen';
