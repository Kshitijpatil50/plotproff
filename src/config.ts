import { parseAbi, defineChain } from 'viem';

// ============================================================================
// PLOTPROOF - MONAD TESTNET CONFIGURATION
// ============================================================================

// 1. CONTRACT ADDRESS: Replace with your deployed contract address on Monad Testnet.
// e.g. "0x1234567890123456789012345678901234567890"
export const CONTRACT_ADDRESS: `0x${string}` = (
  (typeof window !== 'undefined' && localStorage.getItem('pp_contract_address')) ||
  "0x_PLACEHOLDER"
) as `0x${string}`;

// 2. DEPLOY BLOCK: Replace with the block number where your contract was deployed.
// e.g. 1234567n
export const DEPLOY_BLOCK: bigint = BigInt(
  (typeof window !== 'undefined' && localStorage.getItem('pp_deploy_block')) ||
  "0"
);

// 3. MONAD TESTNET CHAIN SPECIFICATION
export const MONAD_TESTNET = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: {
    name: 'Monad',
    symbol: 'MON',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://testnet-rpc.monad.xyz'],
      webSocket: ['wss://testnet-rpc.monad.xyz'],
    },
    fallback: {
      http: ['https://rpc.ankr.com/monad_testnet'],
    },
  },
  blockExplorers: {
    default: {
      name: 'MonadVision',
      url: 'https://testnet.monadvision.com',
    },
  },
});

// 4. MAP DEFAULTS (Pune Cadastre Center)
export const MAP_CENTER: [number, number] = [18.5204, 73.8567];
export const MAP_DEFAULT_ZOOM = 17;

// 5. FIREBASE FIRESTORE CONFIGURATION (Placeholders to be filled in)
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSy_PLACEHOLDER",
  authDomain: "plotproof-placeholder.firebaseapp.com",
  projectId: "plotproof-placeholder",
  storageBucket: "plotproof-placeholder.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:placeholder",
};

// 6. CONTRACT ABI (NFT + Title Deeds + Registrar Witness + Escrow)
export const PLOTPROOF_ABI = parseAbi([
  "function registerPlot(uint256 plotId, address owner, string surveyNo, string village, uint32 areaSqm, bytes32 boundaryHash, bytes32 titleDocHash)",
  "function proposeSale(uint256 plotId, address buyer, uint128 price, bytes32 saleDocHash)",
  "function payForPlot(uint256 plotId) payable",
  "function approveSale(uint256 plotId)",
  "function cancelSale(uint256 plotId)",
  "function raiseDispute(uint256 plotId, bytes32 reasonHash)",
  "function resolveDispute(uint256 plotId, bool cancelPendingSale)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 plotId) view returns (string)",
  "function plotInfo(uint256) view returns (string surveyNo, string village, uint32 areaSqm, bytes32 boundaryHash, bool frozen)",
  "function sales(uint256) view returns (address buyer, uint128 price, bool paid, bool active, bytes32 documentHash)",
  "function titleHead(uint256) view returns (bytes32)",
  "function deedCount() view returns (uint256)",
  "function registrar() view returns (address)",
  "event PlotRegistered(uint256 indexed plotId, address indexed owner, string surveyNo, bytes32 boundaryHash)",
  "event SaleProposed(uint256 indexed plotId, address indexed seller, address indexed buyer, uint128 price, bytes32 documentHash)",
  "event SalePaid(uint256 indexed plotId, address indexed buyer, uint256 amount)",
  "event SaleCancelled(uint256 indexed plotId, address by)",
  "event DisputeRaised(uint256 indexed plotId, address indexed by, bytes32 reasonHash)",
  "event DisputeResolved(uint256 indexed plotId, bool saleCancelled)",
  "event DeedRecorded(uint256 indexed deedNo, uint256 indexed plotId, address from, address to, uint128 price, bytes32 documentHash, bytes32 prevDeedHash, bytes32 deedHash)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

// 7. CONTRACT REVERT ERROR FRIENDLY MESSAGES
export const CONTRACT_ERRORS: Record<string, string> = {
  NotRegistrar: "Only the authorized land registrar witness can perform this action.",
  PlotExists: "This plot ID has already been registered in the cadastre.",
  NoPlot: "This land plot does not exist in the official cadastre registry.",
  NotOwner: "Only the registered legal titleholder can sell or manage this land plot.",
  Frozen: "This plot is frozen by an active dispute. All title transfers are legally blocked.",
  SaleActive: "This plot already has an active pending sale. The contract blocks selling the same land twice.",
  BadBuyer: "Invalid buyer address specified for the sale deed.",
  NoSale: "No active sale agreement found for this plot.",
  NotBuyer: "Only the designated buyer can fund this land purchase escrow.",
  AlreadyPaid: "The escrow deposit has already been paid for this plot.",
  WrongAmount: "Payment must match the exact agreed sale price in MON.",
  NotReady: "This sale is not yet ready for registrar approval (escrow deposit must be paid).",
  NotParty: "Only the registered seller or designated buyer can cancel this sale.",
  NotFrozen: "This plot is not currently disputed or frozen.",
  PayFailed: "Escrow fund disbursement to seller failed on-chain.",
  Reentrancy: "Reentrancy detected and blocked.",
  NoDocument: "Attach the sale agreement document first.",
  TransferOnlyViaSale: "This land token can only move through an approved sale.",
};
