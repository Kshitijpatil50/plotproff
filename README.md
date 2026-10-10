# 🏡 PlotProof — Every Plot Has a Story. Every Sale Leaves a Proof.

### From paper promises to verifiable property history — powered by Monad.

**What if buying a piece of land didn't mean trusting a pile of papers, but verifying its entire history in seconds?**

Imagine a family investing their life savings in a small piece of land. They receive signed documents, pay the seller, and believe the property is theirs. Months later, another person appears with a different set of documents claiming ownership of the exact same plot. The paperwork conflicts, the ownership history is unclear, and the family is pulled into a costly legal dispute.

**The real problem isn't just buying land. It's knowing whether the land's history can be trusted.**

That's why we built **PlotProof**.

PlotProof transforms land ownership records into a transparent, tamper-evident history on the Monad blockchain. Every registered plot becomes an NFT, and every approved sale creates a numbered digital deed linked cryptographically to the previous deed and its supporting documents.

Instead of asking, *"Can I trust these papers?"*, a buyer can ask, *"Can I verify this plot's history?"*

> **One plot. One verifiable history. Every transfer accounted for.**

---

## 🚀 Experience PlotProof

🌐 **Live Application:** [Open PlotProof](https://plotproff-85gej15uv-kshitijpatil50s-projects.vercel.app/#/plot/1)

🔗 **Blockchain:** Monad Testnet — Chain ID `10143`

🎯 **Built for:** Monad Blitz Pune V3 · October 10, 2026

*Smart contract address, deployment block, and demo video will be added once the deployment details are finalized.*

---

## 💡 The Problem We're Solving

Land ownership systems often rely on disconnected databases, physical documents, and records that ordinary buyers struggle to verify.

* **Duplicate sales:** The same plot may be offered to multiple buyers.
* **Document manipulation:** Altered or forged paperwork can make ownership difficult to establish.
* **Broken ownership history:** Buyers may not be able to trace previous transfers.
* **Boundary disputes:** Changes to survey maps can create conflicts about the actual property.
* **Slow verification:** Checking documents and ownership history can require multiple people and institutions.

Traditional digitization makes records easier to access, but digitization alone does not guarantee tamper-evident history.

### Our approach

PlotProof combines blockchain-backed ownership records, cryptographic document verification, escrow-based transfers, and a public verification page into one consumer-facing application.

The goal is simple: **make property history easier to inspect, harder to manipulate unnoticed, and more transparent to everyone involved.**

---

## ✨ What Makes PlotProof Different?

### 1. 🏠 Every plot is an NFT

Each registered land plot is represented by an ERC-721 NFT with key metadata, including:

* Survey number
* Village and location details
* Plot area
* Cryptographic boundary hash

The NFT represents the plot in the prototype. Transfers are restricted so that ownership changes happen through the registry's approved sale process rather than ordinary direct NFT transfers.

### 2. 🔗 A chain of title that can be verified

Every completed sale creates a numbered deed, such as `DEED-2026-0001`.

Each deed references the hash of the previous deed, creating a cryptographically linked ownership history. The plot page checks this chain and reports whether the recorded history is intact.

A buyer can trace the sequence of registered transfers back to the plot's first registration.

### 3. 🛡️ Protection against duplicate pending sales

A plot cannot have multiple simultaneous pending sales in the contract.

If a seller attempts to initiate another sale while the first is pending, the contract rejects the attempt. This is demonstrated through PlotProof's **Double-Sale Challenge**.

This prevents conflicting concurrent sale proposals within the prototype's contract rules; it does not independently establish that the seller has legitimate legal title.

### 4. 💰 Escrow-backed property transfers

PlotProof coordinates payment and ownership through a controlled workflow:

1. The seller proposes a sale and provides the sale agreement hash.
2. The buyer pays the exact agreed price into contract escrow.
3. The registrar reviews and approves the transaction.
4. The NFT transfers to the buyer, the seller receives payment, and a new deed is recorded.

This ensures that the prototype's ownership transfer and payment follow the same approval process.

### 5. 📄 Cryptographic document verification

Supporting documents remain off-chain, while their cryptographic hashes are recorded on-chain.

When someone wants to verify a document, PlotProof hashes the exact file bytes and compares the result with the recorded hash.

If the file changes, its hash will no longer match.

**Important:** A matching hash proves that the file matches the previously recorded bytes. It does not prove that the original document was genuine or legally valid.

### 6. 🗺️ Boundary integrity verification

A plot's map boundary is represented by a hash of its polygon coordinates, rounded to six decimal places.

If the stored boundary data changes, the recalculated hash can reveal the mismatch.

This makes unauthorized changes to the recorded boundary data detectable, while real-world survey accuracy still depends on reliable source data.

### 7. ⚖️ Dispute handling and plot freezing

A dispute can be raised against a plot. While it remains unresolved, the contract freezes the plot according to its dispute rules.

The registrar can resolve the dispute through the contract's authorized workflow.

For the prototype, dispute initiation is intentionally permissive. A production implementation would require stronger identity verification, evidence requirements, and safeguards against malicious disputes.

### 8. 🌍 Public verification without login

Every plot has a public verification page accessible through a shareable URL or QR code.

Anyone can inspect the available plot details, ownership history, deed chain, and document verification results without creating an account.

### 9. 📊 A unified digital deed ledger

The ledger provides an ERP-style view of registered deeds, with:

* Searchable transaction records
* Deed history
* CSV export
* Printable title certificates
* Transaction and event visibility

Instead of navigating disconnected records, users can inspect the recorded history from one place.

---

## 🔄 How It Works

```text
        REGISTER A LAND PLOT
                 |
                 v
       Mint Plot NFT on Monad
                 |
                 v
       Seller proposes a sale
       + sale agreement hash
                 |
                 v
       Buyer deposits exact price
            into escrow
                 |
                 v
       Registrar reviews sale
                 |
                 v
          Approval granted
                 |
        +--------+--------+
        |                 |
        v                 v
   NFT moves to      Seller receives
      buyer             payment
        |                 |
        +--------+--------+
                 |
                 v
        Record a numbered deed
                 |
                 v
     Link previous deed hash
                 |
                 v
       Public verification page
```

Each completed sale contributes to a persistent, auditable record of the plot's transfer history.

---

## 🔐 The Cryptographic Foundation

PlotProof uses cryptographic hashes to connect deeds, documents, and boundary data.

### Deed hash

Each deed hash is computed as:

```solidity
keccak256(
    abi.encode(
        deedNo,
        plotId,
        from,
        to,
        price,
        documentHash,
        prevDeedHash
    )
)
```

This binds the deed's identifying information, transfer parties, price, supporting document hash, and previous deed hash into one value.

### Document hash

```text
documentHash = keccak256(exactDocumentBytes)
```

The verifier hashes the supplied file and compares it with the hash stored in the record.

### Boundary hash

```text
boundaryHash = keccak256(
    encoded polygon coordinates
    rounded to 6 decimal places
)
```

The exact encoding and coordinate ordering must remain consistent between registration and verification.

### Why link deeds together?

If a previous deed's recorded contents are altered, the corresponding hash changes. The next deed's reference to the earlier hash can then fail verification.

This creates a tamper-evident chain of recorded transfers rather than a collection of unrelated ownership entries.

---

## 🖥️ Application Pages

| Route         | Purpose                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| `#/plot/:id`  | Public plot page, NFT details, boundary verification, deed history, document verification, and printable certificate |
| `#/me`        | Wallet dashboard, owned plots, sale proposals, payments, cancellations, disputes, and double-sale challenge          |
| `#/registrar` | Registrar console for plot registration, starter MON, sale approvals, dispute resolution, and tamper demonstrations  |
| `#/ledger`    | Searchable deed ledger with CSV export                                                                               |
| `#/screen`    | Projector-friendly live map and event feed for hackathon demonstrations                                              |

---

## 🎬 Three-Minute Live Demo

The demo is designed to let judges experience the problem, the prevention mechanism, and the verification process.

**Act 1 — The challenge**

Open the projector view and let participants access the application through its QR code. Register demo participants and assign plots through the registrar workflow.

**Act 2 — Stop the double sale**

Attempt to sell the same plot to two buyers while its first sale is pending. The contract should reject the second proposal, demonstrating how contract-level rules can prevent conflicting pending sales.

**Act 3 — Complete a verified transfer**

Have one participant sell a plot to another. The buyer deposits the funds, the registrar approves the sale, and the contract transfers the NFT and records a numbered deed.

**Act 4 — Verify the history**

Open the public plot page. Inspect the ownership history, linked deed hashes, document verification, and available blockchain explorer references.

**Act 5 — Demonstrate tamper detection**

Modify a boundary in the registrar's demo interface and show the integrity check failing. Raise a dispute and demonstrate that the plot becomes frozen according to the contract rules.

The result is a practical demonstration of why verifiable history matters, not just a static blockchain dashboard.

---

## 🏗️ Technology Stack

| Layer                          | Technologies                  |
| ------------------------------ | ----------------------------- |
| Frontend                       | React 19, TypeScript, Vite    |
| Styling                        | Tailwind CSS 4                |
| Blockchain integration         | viem                          |
| Smart contract                 | Solidity 0.8.28               |
| NFT standard                   | ERC-721 with OpenZeppelin 5   |
| Blockchain network             | Monad Testnet, Chain ID 10143 |
| Maps                           | Leaflet, OpenStreetMap        |
| Shared application data        | Firebase Firestore            |
| QR codes                       | `qrcode.react`                |
| Contract development and tests | Foundry, Forge, `forge-std`   |

---

## ⚡ Why Monad?

PlotProof is designed around Monad's EVM-compatible blockchain environment.

The application uses Solidity smart contracts and familiar Ethereum development tools while targeting the Monad testnet.

**Monad-specific implementation choices include:**

* **EVM compatibility:** Solidity contracts and viem-based interactions.
* **Receipt-aware transactions:** The application waits for each transaction receipt before submitting the next transaction from the same wallet, accounting for the target environment's reserve-balance behavior.
* **Event-driven history:** Contract events provide transaction history and live updates instead of relying entirely on repeated RPC polling.
* **On-chain verification:** Deed links, ownership changes, and registry rules are enforced or recorded by the smart contract.

These choices make Monad part of the working application architecture rather than just a label on the project.

---

## 🧪 Smart Contract Testing

The main registry contract is located at:

`contracts/src/PlotRegistry.sol`

The test suite is located at:

`contracts/test/PlotRegistry.t.sol`

The intended test coverage includes:

* Plot NFT minting
* A complete escrow-backed sale
* NFT transfer and deed-chain updates
* Blocking a second pending sale
* Required sale-document hashes
* Blocking direct NFT transfers
* Dispute handling and refunds

Run the contract tests locally:

```bash
cd contracts

forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std

forge test
```

These commands run the tests against the local Foundry environment; they do not deploy the contract to Monad.

---

## 🚀 Run PlotProof Locally

### Prerequisites

* Node.js and npm, or Bun
* Foundry and Forge for contract development
* A Monad testnet wallet for live blockchain interactions
* A Firebase project for shared multi-device state

### 1. Install dependencies

From the project root:

```bash
bun install
```

Alternatively:

```bash
npm install
```

### 2. Configure the application

Update `src/config.ts` with the relevant deployment and service configuration:

```text
CONTRACT_ADDRESS = your deployed contract address
DEPLOY_BLOCK     = your contract deployment block

FIREBASE_CONFIG  = your Firebase project configuration
MAP_CENTER       = your preferred map center (optional)
```

Use the actual configuration structure defined by the project rather than copying this illustrative placeholder directly.

### 3. Start the development server

```bash
bun run dev
```

Or:

```bash
npm run dev
```

The development server is configured to serve the application on port `3000`.

### 4. Deploy the smart contract

Configure the Monad testnet RPC endpoint and a funded registrar wallet, then deploy using Foundry:

```bash
cd contracts

forge create src/PlotRegistry.sol:PlotRegistry \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key "$REGISTRAR_KEY" \
  --broadcast
```

The deploying wallet becomes the registrar according to the project's deployment design. Keep private keys in environment variables or a secure secret manager; never commit them to GitHub.

After deployment, update the application with the actual contract address and deployment block.

### 5. Configure shared data

Set up Firebase Firestore and the appropriate security rules so multiple devices can share application state.

**Important:** The local simulator is intended for UI preview when the contract address is a placeholder. Placeholder Firebase credentials result in browser-local data rather than shared multi-device state. A working blockchain demo and a shared-data demo require the relevant services to be configured.

---

## 🛡️ Security, Trust, and Limitations

We believe a credible land-record solution must clearly distinguish between what blockchain guarantees and what still requires institutional trust.

* **Trusted registrar:** The registrar approves transactions. The blockchain cannot establish whether the original land record was truthful.
* **Off-chain documents:** Documents are stored outside the blockchain; their hashes provide integrity checks, not proof of authenticity.
* **Legal recognition:** PlotProof is a prototype for transparent property records, not a substitute for legally recognized land registration.
* **Dispute safeguards:** Production deployment would require identity checks, evidence workflows, and protections against abusive dispute requests.
* **Demo environment:** Burner wallets and open test rules are suitable only for controlled demonstrations. Real deployments need hardened wallet management and properly secured database rules.
* **Testnet only:** Never use real funds or expose private keys during the hackathon demo.

These limitations are not reasons to abandon the concept. They define the next engineering and governance problems to solve.

---

## 🛣️ Roadmap

**Phase 1 — Working prototype**

* Plot NFTs and controlled ownership transfers
* Escrow and registrar approval
* Linked deeds and document hashes
* Public verification and boundary-integrity checks
* Searchable ledger and dispute demonstrations

**Phase 2 — Stronger trust**

* Multiple independent witnesses
* Dispute bonds and identity verification
* Stronger role-based access controls
* Improved evidence management and audit tools

**Phase 3 — Real-world integration**

* IPFS or other decentralized document storage
* Verified survey data imports
* Integration with official land-registration workflows
* Pilot collaboration with a registrar's office
* Independent smart-contract security review

---

## 👥 Team

**Team PlotProof**

* TODO — Team Member 1
* TODO — Team Member 2
* TODO — Team Member 3

Built for **Monad Blitz Pune V3 · October 10, 2026**.

Original project work created for the event.

---

## ❤️ Our Vision

We are not claiming that putting land records on a blockchain magically eliminates fraud. The original registration still needs trustworthy evidence, accountable institutions, and reliable verification.

What PlotProof offers is a better foundation for transparency: once a record is registered, subsequent transfers can be linked, checked, and made visible without depending entirely on a single private database.

A land purchase may represent years of savings, a family's future, or the beginning of a business. Its ownership history deserves more than disconnected paperwork.

**PlotProof — because every plot deserves a history that can be verified.**

[**Explore the live application →**](https://plotproff-85gej15uv-kshitijpatil50s-projects.vercel.app/#/plot/1)
