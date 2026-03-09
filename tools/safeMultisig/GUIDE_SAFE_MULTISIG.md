# Safe Multisig Tools - Complete Guide

> **Complete workflow for managing Safe multisig wallets: owner management, signing, and executing arbitrary transactions**

---

## Table of Contents

1. [Overview](#-overview)
2. [Prerequisites](#-prerequisites)
3. [Repository Setup](#-repository-setup)
4. [Environment Configuration](#-environment-configuration)
5. [Managing Safe Owners](#-managing-safe-owners)
6. [Executing upgradePreEtrog](#-executing-upgradepreetrog)
7. [Schedule & Execute Timelock Transactions](#-schedule--execute-timelock-transactions)
8. [Troubleshooting](#-troubleshooting)

---

## Overview

This guide walks you through using the Safe Multisig toolkit for:

1. **Managing Owners** - Add/remove owners and change threshold
2. **Preparing Arbitrary Transactions** - Build transactions for schedule/execute on Timelock
3. **Signing Transactions** - Collect EIP-712 signatures from Safe owners
4. **Executing Transactions** - Submit signed transactions on-chain

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WORKFLOW DIAGRAM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      STEP 1: PREPARE TRANSACTION                      │   │
│  │    ┌─────────────────────┐    ┌─────────────────────────────────┐    │   │
│  │    │   manageOwners.ts   │ OR │    prepareTransaction.ts        │    │   │
│  │    │  (add/remove owners)│    │  (schedule/execute timelock)    │    │   │
│  │    └─────────┬───────────┘    └───────────────┬─────────────────┘    │   │
│  │              └────────────────┬───────────────┘                       │   │
│  │                               ▼                                       │   │
│  │                      transactions.json                                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                  │                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      STEP 2: COLLECT SIGNATURES                       │   │
│  │                                                                        │   │
│  │   ┌──────────┐    ┌──────────┐    ┌──────────┐                        │   │
│  │   │ Ledger 1 │    │ Ledger 2 │    │ Ledger N │    (Safe Owners)       │   │
│  │   └────┬─────┘    └────┬─────┘    └────┬─────┘                        │   │
│  │        │               │               │                               │   │
│  │        └───────────────┼───────────────┘                               │   │
│  │                        ▼                                               │   │
│  │               signSafeTransaction.ts                                   │   │
│  │                        │                                               │   │
│  │                        ▼                                               │   │
│  │           transactions.json (with signatures)                          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                  │                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      STEP 3: EXECUTE ON-CHAIN                         │   │
│  │                                                                        │   │
│  │                  executeSafeTransaction.ts                             │   │
│  │                           │                                            │   │
│  │                           ▼                                            │   │
│  │                   On-chain Execution                                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

- **Node.js** v18+ installed
- **Ledger hardware wallet** connected and unlocked
- **Ethereum app** open on Ledger
- **Blind signing** enabled on Ledger (Settings → Blind signing → Enabled)
- **Git** installed

---

## Repository Setup

### 1. Clone the Repository

```bash
git clone https://github.com/agglayer/agglayer-contracts.git
cd agglayer-contracts
```

### 2. Checkout the Feature Branch

```bash
git checkout feature/addSafeMultisigTool
```

### 3. Install Dependencies

```bash
npm install
```

## Environment Configuration

### 1. Create Environment File

```bash
cp .env.example .env
```

### 2. Configure `.env` File

Open `.env` and set the following variables:

```env
# RPC Provider URL
CUSTOM_PROVIDER=your_rpc_here

# Your Ledger wallet address
LEDGER_ACCOUNT=0xYourLedgerAddress
```

| Variable | Description |
|----------|-------------|
| `CUSTOM_PROVIDER` | RPC URL for the target network |
| `LEDGER_ACCOUNT` | Your Ledger wallet's Ethereum address |

---

## Managing Safe Owners

> **Add or remove Safe owners and change the signing threshold**

### Step 1: Create Parameters File

```bash
cd tools/safeMultisig
cp parameters.json.example parameters.json
```

### Step 2: Configure `parameters.json`

Edit the file based on your needs:

#### Example: Add New Owner

```json
{
    "safeAddress": "0x242daE44F5d8fb54B198D03a94dA45B5a4413e21",
    "ownersToAdd": ["0xNewOwnerAddress"],
    "newThreshold": 3
}
```

#### Example: Remove Owner

```json
{
    "safeAddress": "0x242daE44F5d8fb54B198D03a94dA45B5a4413e21",
    "ownersToRemove": ["0xOldOwnerAddress"],
    "newThreshold": 2
}
```

#### Example: Add and Remove Owners

```json
{
    "safeAddress": "0x242daE44F5d8fb54B198D03a94dA45B5a4413e21",
    "ownersToAdd": ["0xNewOwner1", "0xNewOwner2"],
    "ownersToRemove": ["0xOldOwner"],
    "newThreshold": 3
}
```

| Parameter | Description |
|-----------|-------------|
| `safeAddress` | Address of the Safe Multisig wallet |
| `ownersToAdd` | Array of addresses to add as owners (optional) |
| `ownersToRemove` | Array of addresses to remove (optional) |
| `newThreshold` | New threshold value (optional, defaults to current) |

### Step 3: Prepare the Transaction

From the **repository root**:

```bash
npx hardhat run tools/safeMultisig/manageOwners.ts --network custom
```

**What happens:**
1. Validates the owner changes
2. Calculates the final state (owner count, threshold)
3. Builds the Safe transaction (batched with MultiSend if needed)
4. Saves to `transactions.json`

### Step 4: Collect Signatures

Each Safe owner runs:

```bash
npx hardhat run tools/safeMultisig/signSafeTransaction.ts --network custom
```

**Using different signer index:**

```bash
SIGNER_INDEX=1 npx hardhat run tools/safeMultisig/signSafeTransaction.ts --network custom
```

**Share signatures:** After each owner signs, the `transactions.json` file is updated. Share this file with other owners until threshold is reached.

```
┌────────────────────────────────────────────────────────────────┐
│ Signer 1 runs signSafeTransaction.ts                           │
│    └─▶ transactions.json updated (1/3 signatures)              │
├────────────────────────────────────────────────────────────────┤
│ Signer 2 runs signSafeTransaction.ts                           │
│    └─▶ transactions.json updated (2/3 signatures)              │
├────────────────────────────────────────────────────────────────┤
│ Signer 3 runs signSafeTransaction.ts                           │
│    └─▶ transactions.json updated (3/3 signatures) ✅           │
└────────────────────────────────────────────────────────────────┘
```

### Step 5: Execute the Transaction

Once sufficient signatures are collected:

```bash
npx hardhat run tools/safeMultisig/executeSafeTransaction.ts --network custom
```

**Using different executor:**

```bash
EXECUTOR_INDEX=1 npx hardhat run tools/safeMultisig/executeSafeTransaction.ts --network custom
```

### Successful Output

```
╔══════════════════════════════════════════════════════════════╗
║                  ✅ TRANSACTION SUCCESS                      ║
╚══════════════════════════════════════════════════════════════╝

Block:     12345678
Gas Used:  85000
Tx Hash:   0x...
```

---

## Executing upgradePreEtrog

> **For upgradePreEtrog operations, refer to the dedicated HackMD guide**

The upgradePreEtrog process involves multiple steps including:
- Preparing the upgrade transaction
- Scheduling via Timelock
- Waiting for the delay period
- Executing the upgrade

**Full Guide:** [upgradePreEtrog HackMD Guide](https://hackmd.io/@polygon-zkevm/upgrade-pre-etrog)

The schedule and execute data generated from that guide can be used with `prepareTransaction.ts` as described in the next section.

---

## Schedule & Execute Timelock Transactions

> **Use Safe multisig to schedule and execute Timelock transactions**

This is useful for:
- Scheduling upgrades via Timelock
- Executing scheduled operations
- Any Timelock interaction requiring Safe multisig approval

### Step 1: Generate Calldata

First, generate the `schedule` or `execute` calldata. This can come from:
- The upgradePreEtrog HackMD guide
- Other upgrade tools
- Manual encoding

**Example: Encoding a schedule call**

```javascript
const timelockInterface = new ethers.Interface([
    "function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)"
]);

const scheduleData = timelockInterface.encodeFunctionData("schedule", [
    targetAddress,    // Target contract
    0,                // Value (usually 0)
    upgradeCalldata,  // The upgrade calldata
    ethers.ZeroHash,  // Predecessor (0x0 for none)
    salt,             // Unique salt
    delay             // Timelock delay
]);
```

**Example: Encoding an execute call**

```javascript
const executeData = timelockInterface.encodeFunctionData("execute", [
    targetAddress,
    0,
    upgradeCalldata,
    ethers.ZeroHash,
    salt
]);
```

### Step 2: Configure `parameters.json`

```bash
cd tools/safeMultisig
cp parameters.json.example parameters.json
```

Edit the file with your schedule/execute data:

#### For Schedule Transaction

```json
{
    "safeAddress": "0xYourSafeAddress",
    "to": "0xTimelockAddress",
    "data": "0x01d5062a...",
    "value": 0,
    "description": "Schedule: Upgrade PolygonRollupManager to v2.0.0"
}
```

#### For Execute Transaction

```json
{
    "safeAddress": "0xYourSafeAddress",
    "to": "0xTimelockAddress",
    "data": "0x134008d3...",
    "value": 0,
    "description": "Execute: Upgrade PolygonRollupManager to v2.0.0"
}
```

| Parameter | Description |
|-----------|-------------|
| `safeAddress` | Address of the Safe Multisig wallet |
| `to` | Target contract (usually the Timelock address) |
| `data` | Encoded calldata (schedule or execute) |
| `value` | ETH value in wei (usually 0) |
| `operation` | 0 for Call, 1 for DelegateCall (optional, default: 0) |
| `description` | Human-readable description (optional) |

### Step 3: Prepare the Transaction

From the **repository root**:

```bash
npx hardhat run tools/safeMultisig/prepareTransaction.ts --network custom
```

**What happens:**
1. Validates the parameters
2. Analyzes the calldata
3. Simulates the transaction
4. Saves to `transactions.json`

### Step 4: Collect Signatures

Each Safe owner signs the prepared transaction:

```bash
# First owner
SIGNER_INDEX=0 npx hardhat run tools/safeMultisig/signSafeTransaction.ts --network custom

# Second owner
SIGNER_INDEX=1 npx hardhat run tools/safeMultisig/signSafeTransaction.ts --network custom

# Continue until threshold is reached...
```

### Step 5: Execute the Transaction

Once threshold signatures are collected:

```bash
npx hardhat run tools/safeMultisig/executeSafeTransaction.ts --network custom
```

### Complete Example: Schedule + Execute Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SCHEDULE + EXECUTE FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PHASE 1: SCHEDULE                                                           │
│  ─────────────────                                                           │
│  1. Configure parameters.json with schedule calldata                         │
│  2. Run prepareTransaction.ts                                                │
│  3. Collect signatures (signSafeTransaction.ts × N owners)                   │
│  4. Run executeSafeTransaction.ts                                            │
│     └─▶ Operation scheduled in Timelock                                      │
│                                                                              │
│  ⏳ WAIT FOR TIMELOCK DELAY                                                  │
│                                                                              │
│  PHASE 2: EXECUTE                                                            │
│  ────────────────                                                            │
│  1. Configure parameters.json with execute calldata                          │
│  2. Run prepareTransaction.ts                                                │
│  3. Collect signatures (signSafeTransaction.ts × N owners)                   │
│  4. Run executeSafeTransaction.ts                                            │
│     └─▶ Scheduled operation executed!                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Ledger Connection Issues

| Issue | Solution |
|-------|----------|
| Ledger not detected | Reconnect USB cable, ensure device is unlocked |
| Ethereum app not found | Open Ethereum app on Ledger before running script |
| Transaction rejected | Enable "Blind signing" in Ledger Ethereum app settings |

### Signature Issues

| Issue | Solution |
|-------|----------|
| "Signer is not a Safe owner" | Verify `LEDGER_ACCOUNT` is a Safe owner |
| "Already signed" | This signer has already signed; another owner needs to sign |
| "Nonce mismatch" | Another transaction was executed; delete `transactions.json` and re-prepare |

### Execution Issues

| Issue | Solution |
|-------|----------|
| "Insufficient signatures" | More owners need to run `signSafeTransaction.ts` |
| "Gas estimation failed" | Check signatures are valid; try `FORCE_EXECUTE=true` |
| "Nonce mismatch" | Use `FORCE_EXECUTE=true` or re-collect signatures |

### Owner Management Issues

| Issue | Solution |
|-------|----------|
| "Cannot remove: not an owner" | Verify the address is currently a Safe owner |
| "Cannot add: already an owner" | The address is already a Safe owner |
| "Threshold exceeds owner count" | Reduce threshold or add more owners |

---

## Environment Variables Reference

| Variable | Script | Description |
|----------|--------|-------------|
| `SIGNER_INDEX` | signSafeTransaction.ts | Index of signer in hardhat config (default: 0) |
| `EXECUTOR_INDEX` | executeSafeTransaction.ts | Index of executor account (default: 0) |
| `TX_INDEX` | sign/execute | Index of transaction to process (default: latest) |
| `FORCE_EXECUTE` | executeSafeTransaction.ts | Set "true" to ignore nonce mismatch |

---

## File Reference

| Path | Description |
|------|-------------|
| `.env` | Environment configuration |
| `tools/safeMultisig/parameters.json` | Input configuration (create from .example) |
| `tools/safeMultisig/transactions.json` | Output: transactions with signatures (auto-generated) |

---

## Quick Command Reference

```bash
# ═══════════════════════════════════════════════════════════════
# INITIAL SETUP (one-time)
# ═══════════════════════════════════════════════════════════════

git clone https://github.com/agglayer/agglayer-contracts.git
cd agglayer-contracts
git checkout feature/addSafeMultisigTool
npm install

# Configure environment
cp .env.example .env
# Edit .env with CUSTOM_PROVIDER and LEDGER_ACCOUNT

# ═══════════════════════════════════════════════════════════════
# MANAGE OWNERS
# ═══════════════════════════════════════════════════════════════

cd tools/safeMultisig
cp parameters.json.example parameters.json
# Edit parameters.json with ownersToAdd/ownersToRemove/newThreshold
cd ../..
npx hardhat run tools/safeMultisig/manageOwners.ts --network custom

# Sign (each owner)
npx hardhat run tools/safeMultisig/signSafeTransaction.ts --network custom

# Execute (after threshold reached)
npx hardhat run tools/safeMultisig/executeSafeTransaction.ts --network custom

# ═══════════════════════════════════════════════════════════════
# PREPARE ARBITRARY TRANSACTION (schedule/execute)
# ═══════════════════════════════════════════════════════════════

cd tools/safeMultisig
# Edit parameters.json with to, data, value, description
cd ../..
npx hardhat run tools/safeMultisig/prepareTransaction.ts --network custom

# Sign (each owner)
SIGNER_INDEX=0 npx hardhat run tools/safeMultisig/signSafeTransaction.ts --network custom
SIGNER_INDEX=1 npx hardhat run tools/safeMultisig/signSafeTransaction.ts --network custom

# Execute (after threshold reached)
npx hardhat run tools/safeMultisig/executeSafeTransaction.ts --network custom
```

---

## See Also

- [Safe Multisig README](./README.md) - Technical reference
- [upgradePreEtrog HackMD Guide](https://hackmd.io/@polygon-zkevm/upgrade-pre-etrog) - Pre-Etrog upgrade process
- [Grant Role Guide](../safeMultisigGrantRole/GUIDE_SAFE_MULTISIG_GRANT_ROLE.md) - Grant Timelock roles via Safe

---
