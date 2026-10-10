import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  custom,
  formatEther,
  parseEther,
  type Account,
  type PublicClient,
  type WalletClient,
  type Transport,
  decodeEventLog,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import {
  CONTRACT_ADDRESS,
  DEPLOY_BLOCK,
  MONAD_TESTNET,
  PLOTPROOF_ABI,
  CONTRACT_ERRORS,
} from '../config';
import type {
  Address,
  Hash,
  OnChainPlot,
  OnChainSale,
  DeedRecord,
  NFTMetadata,
} from '../types';
import {
  computeBoundaryHash,
  computeDeedHash,
  computeDocumentHash,
  ZERO_ADDRESS,
  ZERO_HASH,
} from '../utils/crypto';
import { getPlotDoc, saveDocument } from './db';

// Sanitize errors so private keys are never logged or displayed
export function formatContractError(err: unknown): string {
  if (!err) return 'Unknown error occurred.';
  const str = String((err as any)?.message || err);
  
  // Look for custom error names in string
  for (const [key, friendlyMsg] of Object.entries(CONTRACT_ERRORS)) {
    if (str.includes(key)) {
      return friendlyMsg;
    }
  }

  // Redact any potential 64-hex char private keys
  const sanitized = str.replace(/0x[a-fA-F0-9]{64}/g, '0x[REDACTED]');
  if (sanitized.includes('insufficient funds')) {
    return 'Insufficient MON balance in wallet for gas or payment.';
  }
  if (sanitized.includes('User rejected')) {
    return 'Transaction rejected by user.';
  }
  return sanitized.length > 180 ? `${sanitized.substring(0, 180)}...` : sanitized;
}

// Check if a real contract address is configured
export function isRealContractConfigured(): boolean {
  return (
    typeof CONTRACT_ADDRESS === 'string' &&
    CONTRACT_ADDRESS !== '0x_PLACEHOLDER' &&
    CONTRACT_ADDRESS.startsWith('0x') &&
    CONTRACT_ADDRESS.length === 42
  );
}

// Viem Public Client
export function getPublicClient(): PublicClient {
  return createPublicClient({
    chain: MONAD_TESTNET,
    transport: fallback([
      http(MONAD_TESTNET.rpcUrls.default.http[0], { timeout: 10_000 }),
      http(MONAD_TESTNET.rpcUrls.fallback.http[0], { timeout: 10_000 }),
    ]),
  }) as any as PublicClient;
}

// Transaction lock mutex - strictly ONE transaction in flight per client
let isTxLockActive = false;
export function isTransactionLockActive(): boolean {
  return isTxLockActive;
}

export async function withTransactionLock<T>(action: () => Promise<T>): Promise<T> {
  if (isTxLockActive) {
    throw new Error('A transaction is already in progress. Monad requires waiting for previous receipt.');
  }
  isTxLockActive = true;
  try {
    return await action();
  } finally {
    isTxLockActive = false;
  }
}

// ============================================================================
// BURNER WALLET MANAGEMENT (/#/me)
// ============================================================================

export function getOrCreateBurnerWallet(): { account: Account; privateKey: `0x${string}` } {
  if (typeof window === 'undefined') {
    const pk = generatePrivateKey();
    return { account: privateKeyToAccount(pk), privateKey: pk };
  }

  let pk = localStorage.getItem('pp_wallet') as `0x${string}` | null;
  if (!pk || !pk.startsWith('0x') || pk.length !== 66) {
    pk = generatePrivateKey();
    try {
      localStorage.setItem('pp_wallet', pk);
    } catch (e) {
      console.warn('LocalStorage unavailable for burner wallet:', e);
    }
  }
  return { account: privateKeyToAccount(pk), privateKey: pk };
}

export function createWalletClientFromAccount(account: Account) {
  return createWalletClient({
    account,
    chain: MONAD_TESTNET,
    transport: fallback([
      http(MONAD_TESTNET.rpcUrls.default.http[0]),
      http(MONAD_TESTNET.rpcUrls.fallback.http[0]),
    ]),
  });
}

// ============================================================================
// MOCK SIMULATOR STORE (Active when contract is 0x_PLACEHOLDER)
// ============================================================================

interface MockPlotState {
  owner: Address;
  surveyNo: string;
  village: string;
  areaSqm: number;
  boundaryHash: Hash;
  frozen: boolean;
  exists: boolean;
  titleHead: Hash;
}

interface MockSaleState {
  buyer: Address;
  price: bigint;
  paid: boolean;
  active: boolean;
  documentHash: Hash;
}

const mockPlots: Record<number, MockPlotState> = {};
const mockSales: Record<number, MockSaleState> = {};
const mockDeeds: DeedRecord[] = [];
let mockDeedCounter = 1n;

// Initialize mock seeded plot states
function initMockState() {
  if (Object.keys(mockPlots).length > 0) return;
  
  // Seed demo plots in mock store
  for (let id = 1; id <= 12; id++) {
    const surveyNo = `101/${id}`;
    const village = 'Shivajinagar';
    const areaSqm = 650;
    // initial unassigned plots
    const titleHead = ZERO_HASH;
    mockPlots[id] = {
      owner: ZERO_ADDRESS,
      surveyNo,
      village,
      areaSqm,
      boundaryHash: ZERO_HASH,
      frozen: false,
      exists: false,
      titleHead,
    };
  }
}
initMockState();

// Generates an on-chain SVG data URI for NFT
export function generateCadastreNFTURI(plotId: number, surveyNo: string, village: string, areaSqm: number, owner: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#1e293b" />
      </linearGradient>
      <linearGradient id="grid" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#10b981" stop-opacity="0.2" />
        <stop offset="100%" stop-color="#06b6d4" stop-opacity="0.1" />
      </linearGradient>
    </defs>
    <rect width="400" height="400" rx="20" fill="url(#bg)"/>
    <rect x="20" y="20" width="360" height="360" rx="12" fill="none" stroke="#334155" stroke-width="2" stroke-dasharray="6,6"/>
    <path d="M 60,120 L 340,120 M 60,200 L 340,200 M 60,280 L 340,280 M 130,60 L 130,340 M 210,60 L 210,340 M 290,60 L 290,340" stroke="#1e293b" stroke-width="1.5"/>
    <polygon points="120,130 280,110 310,270 140,290" fill="url(#grid)" stroke="#10b981" stroke-width="3"/>
    <circle cx="120" cy="130" r="5" fill="#10b981"/>
    <circle cx="280" cy="110" r="5" fill="#10b981"/>
    <circle cx="310" cy="270" r="5" fill="#10b981"/>
    <circle cx="140" cy="290" r="5" fill="#10b981"/>
    <text x="36" y="52" fill="#94a3b8" font-family="monospace" font-size="12" font-weight="bold">MONAD CADASTRE</text>
    <text x="36" y="80" fill="#f8fafc" font-family="sans-serif" font-size="20" font-weight="800">PLOT #${plotId}</text>
    <text x="36" y="325" fill="#64748b" font-family="monospace" font-size="11">SURVEY: ${surveyNo} · ${village}</text>
    <text x="36" y="348" fill="#10b981" font-family="monospace" font-size="12" font-weight="600">${areaSqm} SQ. METERS</text>
    <text x="36" y="368" fill="#94a3b8" font-family="monospace" font-size="9">OWNER: ${owner.slice(0, 8)}...${owner.slice(-6)}</text>
  </svg>`;

  const metadata: NFTMetadata = {
    name: `PlotProof Cadastre Deed #${plotId}`,
    description: `Official on-chain verified land title deed token for Survey No. ${surveyNo}, ${village} on Monad testnet.`,
    image: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    attributes: [
      { trait_type: 'Plot ID', value: plotId },
      { trait_type: 'Survey Number', value: surveyNo },
      { trait_type: 'Village', value: village },
      { trait_type: 'Area (sq m)', value: areaSqm },
      { trait_type: 'Blockchain', value: 'Monad Testnet' },
    ],
  };

  return `data:application/json;utf8,${encodeURIComponent(JSON.stringify(metadata))}`;
}

// ============================================================================
// READ ON-CHAIN / SIMULATED STATE
// ============================================================================

export async function fetchPlotState(plotId: number): Promise<OnChainPlot> {
  if (isRealContractConfigured()) {
    const client = getPublicClient();
    try {
      // 1. ownerOf (reverts if plot does not exist)
      let owner: Address = ZERO_ADDRESS;
      let exists = false;
      try {
        owner = (await client.readContract({
          address: CONTRACT_ADDRESS,
          abi: PLOTPROOF_ABI,
          functionName: 'ownerOf',
          args: [BigInt(plotId)],
        })) as Address;
        exists = true;
      } catch {
        exists = false;
      }

      // 2. plotInfo
      let surveyNo = '';
      let village = '';
      let areaSqm = 0;
      let boundaryHash = ZERO_HASH;
      let frozen = false;

      if (exists) {
        const info = (await client.readContract({
          address: CONTRACT_ADDRESS,
          abi: PLOTPROOF_ABI,
          functionName: 'plotInfo',
          args: [BigInt(plotId)],
        })) as [string, string, number, Hash, boolean];

        surveyNo = info[0];
        village = info[1];
        areaSqm = Number(info[2]);
        boundaryHash = info[3];
        frozen = info[4];
      }

      // 3. titleHead
      let titleHead = ZERO_HASH;
      try {
        titleHead = (await client.readContract({
          address: CONTRACT_ADDRESS,
          abi: PLOTPROOF_ABI,
          functionName: 'titleHead',
          args: [BigInt(plotId)],
        })) as Hash;
      } catch {}

      // 4. tokenURI
      let tokenURI = '';
      try {
        tokenURI = (await client.readContract({
          address: CONTRACT_ADDRESS,
          abi: PLOTPROOF_ABI,
          functionName: 'tokenURI',
          args: [BigInt(plotId)],
        })) as string;
      } catch {
        tokenURI = generateCadastreNFTURI(plotId, surveyNo || `Plot ${plotId}`, village || 'Monad', areaSqm || 600, owner);
      }

      return {
        owner,
        surveyNo,
        village,
        areaSqm,
        boundaryHash,
        frozen,
        exists,
        titleHead,
        tokenURI,
      };
    } catch (err) {
      console.warn(`Contract read failed for plot ${plotId}:`, err);
    }
  }

  // Fallback simulator
  initMockState();
  const mock = mockPlots[plotId];
  if (!mock || !mock.exists) {
    return {
      owner: ZERO_ADDRESS,
      surveyNo: `101/${plotId}`,
      village: 'Shivajinagar',
      areaSqm: 650,
      boundaryHash: ZERO_HASH,
      frozen: false,
      exists: false,
      titleHead: ZERO_HASH,
      tokenURI: generateCadastreNFTURI(plotId, `101/${plotId}`, 'Shivajinagar', 650, ZERO_ADDRESS),
    };
  }

  return {
    ...mock,
    tokenURI: generateCadastreNFTURI(plotId, mock.surveyNo, mock.village, mock.areaSqm, mock.owner),
  };
}

export async function fetchSaleState(plotId: number): Promise<OnChainSale> {
  if (isRealContractConfigured()) {
    const client = getPublicClient();
    try {
      const s = (await client.readContract({
        address: CONTRACT_ADDRESS,
        abi: PLOTPROOF_ABI,
        functionName: 'sales',
        args: [BigInt(plotId)],
      })) as [Address, bigint, boolean, boolean, Hash];

      return {
        buyer: s[0],
        price: s[1],
        paid: s[2],
        active: s[3],
        documentHash: s[4],
      };
    } catch (err) {
      console.warn(`Contract read sales failed for plot ${plotId}:`, err);
    }
  }

  // Fallback simulator
  return (
    mockSales[plotId] || {
      buyer: ZERO_ADDRESS,
      price: 0n,
      paid: false,
      active: false,
      documentHash: ZERO_HASH,
    }
  );
}

export async function fetchBalance(address: Address): Promise<bigint> {
  try {
    const client = getPublicClient();
    return await client.getBalance({ address });
  } catch (err) {
    // Simulated balance if offline or testnet RPC delay
    return parseEther('0.3');
  }
}

export async function fetchRegistrarAddress(): Promise<Address> {
  if (isRealContractConfigured()) {
    try {
      const client = getPublicClient();
      return (await client.readContract({
        address: CONTRACT_ADDRESS,
        abi: PLOTPROOF_ABI,
        functionName: 'registrar',
      })) as Address;
    } catch {}
  }
  return '0x8888888888888888888888888888888888888888';
}

// ============================================================================
// DEEDS & CHAIN OF TITLE VERIFICATION
// ============================================================================

export async function fetchDeedHistory(plotId?: number): Promise<DeedRecord[]> {
  if (isRealContractConfigured()) {
    try {
      const client = getPublicClient();
      const logs = await client.getLogs({
        address: CONTRACT_ADDRESS,
        event: PLOTPROOF_ABI.find((x) => x.type === 'event' && x.name === 'DeedRecorded') as any,
        fromBlock: DEPLOY_BLOCK,
        args: plotId ? { plotId: BigInt(plotId) } : undefined,
      });

      const records: DeedRecord[] = [];
      const seen = new Set<string>();

      for (const log of logs as any[]) {
        const key = `${log.transactionHash}_${log.args.deedNo}`;
        if (seen.has(key)) continue;
        seen.add(key);

        records.push({
          deedNo: log.args.deedNo!,
          plotId: log.args.plotId!,
          from: log.args.from!,
          to: log.args.to!,
          price: log.args.price!,
          documentHash: log.args.documentHash!,
          prevDeedHash: log.args.prevDeedHash!,
          deedHash: log.args.deedHash!,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          timestamp: Date.now(),
        });
      }

      return records.sort((a, b) => Number(a.deedNo - b.deedNo));
    } catch (err) {
      console.warn('getLogs DeedRecorded failed:', err);
    }
  }

  // Simulated deeds
  const filtered = plotId
    ? mockDeeds.filter((d) => Number(d.plotId) === plotId)
    : mockDeeds;
  return [...filtered].sort((a, b) => Number(a.deedNo - b.deedNo));
}

/**
 * Verifies chain-of-title integrity:
 * 1. Checks that first deed's prevDeedHash == ZERO_HASH
 * 2. Recomputes each deedHash via computeDeedHash
 * 3. Checks that each deed's prevDeedHash == previous deed's deedHash
 * 4. Checks that the last deedHash == onChainTitleHead
 */
export function verifyChainOfTitle(
  plotId: number,
  deeds: DeedRecord[],
  onChainTitleHead?: Hash
): { intact: boolean; brokenAtDeed?: bigint; count: number; error?: string } {
  if (!deeds || deeds.length === 0) {
    return { intact: false, count: 0, error: 'No title deeds recorded yet.' };
  }

  for (let i = 0; i < deeds.length; i++) {
    const deed = deeds[i];

    // First deed must have prevDeedHash == ZERO_HASH
    if (i === 0) {
      if (deed.prevDeedHash.toLowerCase() !== ZERO_HASH.toLowerCase()) {
        return {
          intact: false,
          brokenAtDeed: deed.deedNo,
          count: deeds.length,
          error: `Initial deed #1 does not originate from root zero hash.`,
        };
      }
    } else {
      // Must link to previous deed's deedHash
      const prev = deeds[i - 1];
      if (deed.prevDeedHash.toLowerCase() !== prev.deedHash.toLowerCase()) {
        return {
          intact: false,
          brokenAtDeed: deed.deedNo,
          count: deeds.length,
          error: `Chain broken at Deed ${deed.deedNo}: previous deed hash mismatch.`,
        };
      }
    }

    // Recompute deedHash
    const expectedHash = computeDeedHash(
      deed.deedNo,
      deed.plotId,
      deed.from,
      deed.to,
      deed.price,
      deed.documentHash,
      deed.prevDeedHash
    );

    if (expectedHash.toLowerCase() !== deed.deedHash.toLowerCase()) {
      return {
        intact: false,
        brokenAtDeed: deed.deedNo,
        count: deeds.length,
        error: `Deed #${deed.deedNo} payload tampered: hash calculation does not match consensus record.`,
      };
    }
  }

  // Check if last deed matches on-chain titleHead
  if (onChainTitleHead && onChainTitleHead !== ZERO_HASH) {
    const lastDeed = deeds[deeds.length - 1];
    if (lastDeed.deedHash.toLowerCase() !== onChainTitleHead.toLowerCase()) {
      return {
        intact: false,
        brokenAtDeed: lastDeed.deedNo,
        count: deeds.length,
        error: `Latest recorded deed does not match the active on-chain title head pointer.`,
      };
    }
  }

  return { intact: true, count: deeds.length };
}

/**
 * Verifies that the polygon stored in Firestore matches on-chain boundaryHash
 */
export async function verifyBoundary(plotId: number): Promise<{
  valid: boolean;
  computedHash: Hash | null;
  onChainHash: Hash | null;
  reason?: string;
}> {
  const plotDoc = await getPlotDoc(plotId);
  if (!plotDoc || !plotDoc.polygon || plotDoc.polygon.length < 3) {
    return {
      valid: false,
      computedHash: null,
      onChainHash: null,
      reason: 'No valid cadastral polygon coordinates found in registry.',
    };
  }

  const computedHash = computeBoundaryHash(plotDoc.polygon);
  const onChain = await fetchPlotState(plotId);

  if (!onChain.exists || onChain.boundaryHash === ZERO_HASH) {
    return {
      valid: false,
      computedHash,
      onChainHash: onChain.boundaryHash,
      reason: 'Plot is not yet registered on-chain.',
    };
  }

  const matches = computedHash.toLowerCase() === onChain.boundaryHash.toLowerCase();
  return {
    valid: matches,
    computedHash,
    onChainHash: onChain.boundaryHash,
    reason: matches
      ? 'Boundary matches the on-chain cryptographic record'
      : 'WARNING: map polygon coordinates do not match the on-chain hash!',
  };
}

// ============================================================================
// MUTATIVE CONTRACT CALLS WITH STRICT SEQUENTIAL RECEIPT CONFIRMATION
// ============================================================================

export async function sendNativeDrip(
  registrarPrivateKey: `0x${string}`,
  toAddress: Address,
  amountEther: string = '0.3'
): Promise<Hash> {
  return withTransactionLock(async () => {
    const account = privateKeyToAccount(registrarPrivateKey);
    const client = createWalletClientFromAccount(account);
    const publicClient = getPublicClient();

    if (isRealContractConfigured()) {
      const hash = await client.sendTransaction({
        to: toAddress,
        value: parseEther(amountEther),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        throw new Error('Drip transaction reverted on-chain.');
      }
      return hash;
    }

    // Mock
    await new Promise((r) => setTimeout(r, 600));
    return `0xdrip_${Date.now()}` as Hash;
  });
}

export async function callRegisterPlot(
  registrarPrivateKey: `0x${string}`,
  params: {
    plotId: number;
    owner: Address;
    surveyNo: string;
    village: string;
    areaSqm: number;
    boundaryHash: Hash;
    titleDocHash: Hash;
  }
): Promise<Hash> {
  return withTransactionLock(async () => {
    const account = privateKeyToAccount(registrarPrivateKey);
    const client = createWalletClientFromAccount(account);
    const publicClient = getPublicClient();

    if (isRealContractConfigured()) {
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        abi: PLOTPROOF_ABI,
        functionName: 'registerPlot',
        args: [
          BigInt(params.plotId),
          params.owner,
          params.surveyNo,
          params.village,
          params.areaSqm,
          params.boundaryHash,
          params.titleDocHash,
        ],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        throw new Error('Registration transaction reverted.');
      }
      return hash;
    }

    // Mock simulation
    await new Promise((r) => setTimeout(r, 600));
    const deedNo = mockDeedCounter++;
    const prevDeedHash = ZERO_HASH;
    const deedHash = computeDeedHash(
      deedNo,
      BigInt(params.plotId),
      ZERO_ADDRESS,
      params.owner,
      0n,
      params.titleDocHash,
      prevDeedHash
    );

    mockPlots[params.plotId] = {
      owner: params.owner,
      surveyNo: params.surveyNo,
      village: params.village,
      areaSqm: params.areaSqm,
      boundaryHash: params.boundaryHash,
      frozen: false,
      exists: true,
      titleHead: deedHash,
    };

    mockDeeds.push({
      deedNo,
      plotId: BigInt(params.plotId),
      from: ZERO_ADDRESS,
      to: params.owner,
      price: 0n,
      documentHash: params.titleDocHash,
      prevDeedHash,
      deedHash,
      transactionHash: `0xreg_${Date.now()}` as Hash,
      timestamp: Date.now(),
    });

    return `0xreg_${Date.now()}` as Hash;
  });
}

export async function callProposeSale(
  sellerPrivateKey: `0x${string}`,
  params: {
    plotId: number;
    buyer: Address;
    price: bigint;
    saleDocHash: Hash;
  }
): Promise<Hash> {
  return withTransactionLock(async () => {
    const account = privateKeyToAccount(sellerPrivateKey);
    const client = createWalletClientFromAccount(account);
    const publicClient = getPublicClient();

    if (isRealContractConfigured()) {
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        abi: PLOTPROOF_ABI,
        functionName: 'proposeSale',
        args: [
          BigInt(params.plotId),
          params.buyer,
          params.price,
          params.saleDocHash,
        ],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        throw new Error('Sale proposal reverted.');
      }
      return hash;
    }

    // Mock simulation
    await new Promise((r) => setTimeout(r, 500));
    const currentSale = mockSales[params.plotId];
    if (currentSale && currentSale.active) {
      const err = new Error('SaleActive');
      throw err;
    }

    const plot = mockPlots[params.plotId];
    if (plot && plot.frozen) {
      throw new Error('Frozen');
    }

    mockSales[params.plotId] = {
      buyer: params.buyer,
      price: params.price,
      paid: false,
      active: true,
      documentHash: params.saleDocHash,
    };

    return `0xsale_${Date.now()}` as Hash;
  });
}

export async function callPayForPlot(
  buyerPrivateKey: `0x${string}`,
  params: {
    plotId: number;
    price: bigint;
  }
): Promise<Hash> {
  return withTransactionLock(async () => {
    const account = privateKeyToAccount(buyerPrivateKey);
    const client = createWalletClientFromAccount(account);
    const publicClient = getPublicClient();

    if (isRealContractConfigured()) {
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        abi: PLOTPROOF_ABI,
        functionName: 'payForPlot',
        args: [BigInt(params.plotId)],
        value: params.price,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        throw new Error('Escrow payment reverted.');
      }
      return hash;
    }

    // Mock
    await new Promise((r) => setTimeout(r, 600));
    if (mockSales[params.plotId]) {
      mockSales[params.plotId].paid = true;
    }
    return `0xpay_${Date.now()}` as Hash;
  });
}

export async function callApproveSale(
  registrarPrivateKey: `0x${string}`,
  plotId: number
): Promise<Hash> {
  return withTransactionLock(async () => {
    const account = privateKeyToAccount(registrarPrivateKey);
    const client = createWalletClientFromAccount(account);
    const publicClient = getPublicClient();

    if (isRealContractConfigured()) {
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        abi: PLOTPROOF_ABI,
        functionName: 'approveSale',
        args: [BigInt(plotId)],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        throw new Error('Sale approval reverted.');
      }
      return hash;
    }

    // Mock
    await new Promise((r) => setTimeout(r, 700));
    const sale = mockSales[plotId];
    const plot = mockPlots[plotId];
    if (sale && plot) {
      const deedNo = mockDeedCounter++;
      const prevDeedHash = plot.titleHead;
      const deedHash = computeDeedHash(
        deedNo,
        BigInt(plotId),
        plot.owner,
        sale.buyer,
        sale.price,
        sale.documentHash,
        prevDeedHash
      );

      mockDeeds.push({
        deedNo,
        plotId: BigInt(plotId),
        from: plot.owner,
        to: sale.buyer,
        price: sale.price,
        documentHash: sale.documentHash,
        prevDeedHash,
        deedHash,
        transactionHash: `0xdeed_${Date.now()}` as Hash,
        timestamp: Date.now(),
      });

      plot.owner = sale.buyer;
      plot.titleHead = deedHash;
      mockSales[plotId] = {
        buyer: ZERO_ADDRESS,
        price: 0n,
        paid: false,
        active: false,
        documentHash: ZERO_HASH,
      };
    }
    return `0xapprove_${Date.now()}` as Hash;
  });
}

export async function callCancelSale(
  partyPrivateKey: `0x${string}`,
  plotId: number
): Promise<Hash> {
  return withTransactionLock(async () => {
    const account = privateKeyToAccount(partyPrivateKey);
    const client = createWalletClientFromAccount(account);
    const publicClient = getPublicClient();

    if (isRealContractConfigured()) {
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        abi: PLOTPROOF_ABI,
        functionName: 'cancelSale',
        args: [BigInt(plotId)],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    }

    // Mock
    await new Promise((r) => setTimeout(r, 500));
    if (mockSales[plotId]) {
      mockSales[plotId].active = false;
      mockSales[plotId].paid = false;
    }
    return `0xcancel_${Date.now()}` as Hash;
  });
}

export async function callRaiseDispute(
  callerPrivateKey: `0x${string}`,
  plotId: number,
  reasonHash: Hash
): Promise<Hash> {
  return withTransactionLock(async () => {
    const account = privateKeyToAccount(callerPrivateKey);
    const client = createWalletClientFromAccount(account);
    const publicClient = getPublicClient();

    if (isRealContractConfigured()) {
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        abi: PLOTPROOF_ABI,
        functionName: 'raiseDispute',
        args: [BigInt(plotId), reasonHash],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    }

    // Mock
    await new Promise((r) => setTimeout(r, 500));
    if (mockPlots[plotId]) {
      mockPlots[plotId].frozen = true;
    }
    return `0xdisp_${Date.now()}` as Hash;
  });
}

export async function callResolveDispute(
  registrarPrivateKey: `0x${string}`,
  plotId: number,
  cancelPendingSale: boolean
): Promise<Hash> {
  return withTransactionLock(async () => {
    const account = privateKeyToAccount(registrarPrivateKey);
    const client = createWalletClientFromAccount(account);
    const publicClient = getPublicClient();

    if (isRealContractConfigured()) {
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        abi: PLOTPROOF_ABI,
        functionName: 'resolveDispute',
        args: [BigInt(plotId), cancelPendingSale],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    }

    // Mock
    await new Promise((r) => setTimeout(r, 600));
    if (mockPlots[plotId]) {
      mockPlots[plotId].frozen = false;
    }
    if (cancelPendingSale && mockSales[plotId]) {
      mockSales[plotId].active = false;
      mockSales[plotId].paid = false;
    }
    return `0xres_${Date.now()}` as Hash;
  });
}
