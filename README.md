PlotProof

Scan a plot, see its verified history. Land sales as numbered deeds on Monad.

PlotProof is a consumer-facing land record app built for Monad Blitz Pune V3 (Oct 10, 2026). Every land plot is an NFT. Every sale is a numbered deed linked to a document hash and to the previous deed, so anyone can trace a plot's chain of title back to its first registration and verify it in seconds.

Live demo: TODO_PASTE_DEPLOYED_URL Demo video: TODO_PASTE_VIDEO_URL Contract (Monad testnet, chain ID 10143): TODO_PASTE_CONTRACT_ADDRESS (explorer) Deployed at block: TODO_PASTE_DEPLOY_BLOCK

The problem

Land disputes are one of the biggest sources of court cases. Duplicate sales, forged paperwork and unclear ownership history are common causes, and ordinary buyers have no quick way to check a plot.

What PlotProof does
Plots are NFTs. A plot token carries its survey number, village, area and boundary hash. It cannot be transferred directly, only through a registrar-approved sale.
One active sale per plot. The contract rejects a second sale of the same land while one is pending, so the same plot cannot be sold twice.
Escrowed sales with a witness. The seller proposes, the buyer pays into escrow, and the registrar (the trusted witness) approves. Ownership and payment move together.
Every transaction is linked to a real document. A sale cannot be proposed without a sale agreement hash, and registration needs a title document hash. Each deed gets a number (DEED-2026-0001).
Chain of title. Each deed stores the hash of the previous deed. The plot page recomputes the chain and shows whether it is intact.
Boundary integrity. The map boundary is hashed on-chain. If the off-chain map is altered, the plot page shows a mismatch.
Disputes freeze a plot until the registrar resolves them.
Public verification. Scan the QR code on a plot to open its page with no login. Check any document by re-hashing it against the chain.
ERP-style ledger. All deeds in one searchable table with CSV export, plus a printable title certificate.
How it works
Seller proposes sale (with sale agreement hash)
        -> Buyer pays exact price into escrow (contract)
        -> Registrar approves (witness)
        -> NFT moves to buyer, seller is paid, DeedRecorded event links:
           deed number + parties + price + document hash + previous deed hash

Deed hash = keccak256(abi.encode(deedNo, plotId, from, to, price, documentHash, prevDeedHash)). Boundary hash = keccak256 of the polygon coordinates rounded to 6 decimals. Document hash = keccak256 of the document's exact bytes.

Pages
Route	Purpose
#/plot/:id	Public plot page: NFT card, boundary check, chain of title, document verification, printable certificate
#/me	Trader wallet: burner wallet, own plots, sell, pay, cancel, dispute, double-sale challenge
#/registrar	Registrar console: register plots, drip starter MON, approve sales, resolve disputes, tamper demo
#/ledger	Deeds ledger with search and CSV export
#/screen	Projector view: live map and event feed
Tech stack

React 19, TypeScript, Vite, Tailwind CSS 4, viem, Leaflet (OpenStreetMap), Firebase Firestore, qrcode.react. Smart contract in Solidity 0.8.28 with OpenZeppelin 5 (ERC-721). Built with Google AI Studio.

Monad-specific design
Runs on Monad testnet (chain ID 10143).
One transaction in flight per wallet, waiting for each receipt, because of Monad's reserve-balance rule for low-balance wallets.
Live updates and history come from contract events instead of polling, to respect public RPC rate limits.
Smart contract

Source: contracts/src/PlotRegistry.sol (ERC-721 with deeds, escrow, witness approval and disputes). Tests: contracts/test/PlotRegistry.t.sol, covering minting, a full sale that moves the NFT and chains deeds, the double-sale block, the document requirement, the direct-transfer block and dispute refunds.

bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std
forge test

Deploy from the registrar wallet (the deployer becomes the registrar):

bash
forge create src/PlotRegistry.sol:PlotRegistry \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $REGISTRAR_KEY --broadcast
Run the app locally
bash
bun install   # or: npm install
bun run dev   # or: npm run dev  (serves on port 3000)

Then set up the three things the app needs in src/config.ts:

CONTRACT_ADDRESS and DEPLOY_BLOCK for your deployed contract.
FIREBASE_CONFIG with a Firestore project, so all devices share state.
Optional: MAP_CENTER for your area.

Note: with the placeholder contract address the app runs an instant local simulator (useful for UI preview only, nothing is on-chain). With placeholder Firebase credentials, data is stored in the browser only and is not shared between devices. For a real multi-device demo, configure both.

Demo flow (3 minutes)
Open #/screen on the projector and have the room scan the QR code to #/me.
Each person gets a nickname, a starter MON drip and a demo plot (registrar console running).
Double-Sale Challenge: try to sell your plot to two people. The second attempt is blocked by the contract.
One volunteer sells to another: buyer pays, registrar approves, the NFT moves and a deed is recorded.
Open the plot page: chain-of-title check, document verification, explorer links.
Tamper with a map boundary in the registrar console and watch the integrity check fail. Raise a dispute and watch the plot freeze.
Limitations (honest ones)
The registrar is a trusted witness. A chain cannot tell whether the original land record is genuine. PlotProof makes everything after registration tamper-evident and visible.
Documents are stored off-chain (Firestore). Only their hash is on-chain, so the chain proves a document has not changed, not that it is truthful.
Legal recognition needs adoption by an official registrar's office. This is a transparent record layer, not legal title.
Disputes can be raised by anyone in this prototype. A real version needs a bond or identity checks.
Demo wallets are browser burner wallets and Firestore runs with open test rules. Testnet only, never use real funds or keys.
Roadmap

Multi-witness approval, dispute bonds, real survey data import, IPFS document storage, and a pilot with one registrar office.

Team

TODO_ADD_TEAM_MEMBERS (up to 3)

Built for Monad Blitz Pune V3. Original work created at the event.
