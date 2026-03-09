# 🔐 Safe Multisig - Grant Timelock Admin Role Guide

> **Complete workflow to grant `TIMELOCK_ADMIN_ROLE` via Safe Multisig and then self-grant operational roles**

---

## 📋 Table of Contents

1. [Overview](#-overview)
2. [Prerequisites](#-prerequisites)
3. [Repository Setup](#-repository-setup)
4. [Environment Configuration](#-environment-configuration)
5. [Step 1: Sign Safe Transaction (All Owners)](#-step-1-sign-safe-transaction-all-owners)
6. [Step 2: Execute Safe Transaction](#-step-2-execute-safe-transaction)
7. [Step 3: Self-Grant Operational Roles](#-step-3-self-grant-operational-roles)
8. [Troubleshooting](#-troubleshooting)

---

## 🎯 Overview

This guide walks you through the process of:

1. **Granting `TIMELOCK_ADMIN_ROLE`** to a new address via Safe Multisig
2. **Executing the signed Safe transaction** on-chain
3. **Self-granting `PROPOSER_ROLE` and `EXECUTOR_ROLE`** to the new admin

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           WORKFLOW DIAGRAM                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                          │
│  │ Ledger 1 │    │ Ledger 2 │    │ Ledger N │    (Safe Owners)         │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘                          │
│       │               │               │                                 │
│       └───────────────┼───────────────┘                                 │
│                       ▼                                                 │
│              ┌────────────────┐                                         │
│              │  Safe Multisig │  ──► signSafeTransaction.ts             │
│              └───────┬────────┘                                         │
│                      │                                                  │
│                      ▼  executeSafeTransaction.ts                       │
│              ┌────────────────┐                                         │
│              │    Timelock    │  ──► grantRole(TIMELOCK_ADMIN_ROLE)     │
│              └───────┬────────┘                                         │
│                      │                                                  │
│                      ▼  ledgerGrantRoles.ts                             │
│              ┌────────────────┐                                         │
│              │   New Admin    │  ──► Self-grant PROPOSER & EXECUTOR     │
│              └────────────────┘                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## ✅ Prerequisites

- **Node.js** v18+ installed
- **Ledger hardware wallet** connected and unlocked
- **Ethereum app** open on Ledger
- **Blind signing** enabled on Ledger (Settings → Blind signing → Enabled)
- **Git** installed

---

## 🚀 Repository Setup

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

## ⚙️ Environment Configuration

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

## 📝 Step 1: Sign Safe Transaction (All Owners)

> **⚠️ Each Safe owner must complete this step**

### 1.1 Navigate to Tool Directory

```bash
cd tools/safeMultisigGrantRole
```

### 1.2 Create Parameters File

```bash
cp parameters.json.example parameters.json
```

### 1.3 Configure `parameters.json`

Edit the file with your specific addresses:

```json
{
    "safeAddress": "0x242daE44F5d8fb54B198D03a94dA45B5a4413e21",
    "timelockAddress": "0xBBa0935Fa93Eb23de7990b47F0D96a8f75766d13",
    "roleReceiver": "0xAddressToReceiveTheRole",
    "roleName": "TIMELOCK_ADMIN_ROLE"
}
```

| Parameter | Description |
|-----------|-------------|
| `safeAddress` | Address of the Safe Multisig wallet |
| `timelockAddress` | Address of the Timelock contract |
| `roleReceiver` | Address that will receive `TIMELOCK_ADMIN_ROLE` |
| `roleName` | Role to grant (use `TIMELOCK_ADMIN_ROLE`) |

### 1.4 Sign the Transaction

Each Safe owner runs this command from the **repository root**:

```bash
npx hardhat run tools/safeMultisigGrantRole/signSafeTransaction.ts --network custom
```

**What happens:**
1. Connects to your Ledger
2. Displays transaction details
3. Prompts you to confirm on Ledger device
4. Saves signature to `signedTransactions.json`

### 1.5 Share Signatures

After each owner signs:
- The `signedTransactions.json` file is updated with the new signature
- **Share this file** with other owners or the executor
- Continue until threshold is reached

```
┌────────────────────────────────────────────────────────────────┐
│ Signer 1 runs signSafeTransaction.ts                           │
│    └─▶ signedTransactions.json created (1/3 signatures)        │
├────────────────────────────────────────────────────────────────┤
│ Signer 2 runs signSafeTransaction.ts                           │
│    └─▶ signedTransactions.json updated (2/3 signatures)        │
├────────────────────────────────────────────────────────────────┤
│ Signer 3 runs signSafeTransaction.ts                           │
│    └─▶ signedTransactions.json updated (3/3 signatures) ✅     │
└────────────────────────────────────────────────────────────────┘
```

### 1.6 Using Different Signer Index (Optional)

If you have multiple accounts configured:

```bash
SIGNER_INDEX=1 npx hardhat run tools/safeMultisigGrantRole/signSafeTransaction.ts --network custom
```

---

## ⚡ Step 2: Execute Safe Transaction

> **Once sufficient signatures are collected (>= threshold)**

### Option A: Execute with Ledger

If your Ledger account has ETH for gas:

```bash
npx hardhat run tools/safeMultisigGrantRole/executeSafeTransaction.ts --network custom
```

### Option B: Execute with Private Key / Mnemonic

If using a different account with ETH:

1. Update `.env` to remove or comment out `LEDGER_ACCOUNT`:
   ```env
   # LEDGER_ACCOUNT=0xYourLedgerAddress
   MNEMONIC=your twelve word mnemonic phrase here
   ```

2. Run the execute script:
   ```bash
   npx hardhat run tools/safeMultisigGrantRole/executeSafeTransaction.ts --network custom
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

## 🎖️ Step 3: Self-Grant Operational Roles

> **This step is performed by the account that just received `TIMELOCK_ADMIN_ROLE`**

Now the new admin can grant themselves the operational roles (`PROPOSER_ROLE` and `EXECUTOR_ROLE`).

### 3.1 Navigate to Tool Directory

```bash
cd tools/ledgerGrantRoles
```

### 3.2 Create Parameters File

```bash
cp parameters.json.example parameters.json
```

### 3.3 Configure `parameters.json`

```json
{
    "timelockAddress": "0xBBa0935Fa93Eb23de7990b47F0D96a8f75766d13"
}
```

| Parameter | Description |
|-----------|-------------|
| `timelockAddress` | Address of the Timelock contract |

### 3.4 Ensure `.env` is Configured

Make sure your `.env` has the new admin's Ledger address:

```env
CUSTOM_PROVIDER=your_rpc_here
LEDGER_ACCOUNT=0xYourNewAdminLedgerAddress
```

### 3.5 Run the Grant Roles Script

From the **repository root**:

```bash
npx hardhat run tools/ledgerGrantRoles/ledgerGrantRoles.ts --network custom
```

### Successful Output

```
╔══════════════════════════════════════════════════════════════╗
║       LEDGER - GRANT PROPOSER & EXECUTOR ROLES               ║
╚══════════════════════════════════════════════════════════════╝

Checking signer roles...
  Has TIMELOCK_ADMIN_ROLE: ✅ Yes
  Has PROPOSER_ROLE:       ❌ No
  Has EXECUTOR_ROLE:       ❌ No

Granting PROPOSER_ROLE...
  Transaction sent: 0x...
  ✅ PROPOSER_ROLE granted!

Granting EXECUTOR_ROLE...
  Transaction sent: 0x...
  ✅ EXECUTOR_ROLE granted!

╔══════════════════════════════════════════════════════════════╗
║                     SUCCESS                                  ║
╚══════════════════════════════════════════════════════════════╝

✅ Account 0x... now has:
   - PROPOSER_ROLE (can schedule transactions)
   - EXECUTOR_ROLE (can execute ready transactions)
```

---

## 🔧 Troubleshooting

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
| "Nonce mismatch" | Another transaction was executed; delete `signedTransactions.json` and re-sign |

### Execution Issues

| Issue | Solution |
|-------|----------|
| "Insufficient signatures" | More owners need to run `signSafeTransaction.ts` |
| "Gas estimation failed" | Check signatures are valid; try `FORCE_EXECUTE=true` |
| "Nonce mismatch" | Use `FORCE_EXECUTE=true` or re-collect signatures |

### Role Issues

| Issue | Solution |
|-------|----------|
| "Does not have TIMELOCK_ADMIN_ROLE" | Complete Steps 1 & 2 first to grant the admin role |

---

## 📚 Supported Roles Reference

| Role | Description |
|------|-------------|
| `TIMELOCK_ADMIN_ROLE` | Admin of the timelock (can grant/revoke roles) |
| `PROPOSER_ROLE` | Can propose/schedule transactions |
| `EXECUTOR_ROLE` | Can execute ready (delayed) transactions |
| `CANCELLER_ROLE` | Can cancel pending transactions |

---

## 📁 File Reference

| Path | Description |
|------|-------------|
| `.env` | Environment configuration |
| `tools/safeMultisigGrantRole/parameters.json` | Safe multisig grant role config |
| `tools/safeMultisigGrantRole/signedTransactions.json` | Accumulated signatures (auto-generated) |
| `tools/ledgerGrantRoles/parameters.json` | Self-grant roles config |

---

## 🔗 Quick Command Reference

```bash
# 1. Setup
git clone https://github.com/agglayer/agglayer-contracts.git
cd agglayer-contracts
git checkout feature/addSafeMultisigTool
npm install

# 2. Configure
cp .env.example .env
# Edit .env with CUSTOM_PROVIDER and LEDGER_ACCOUNT

# 3. Sign Safe Transaction (each owner)
cd tools/safeMultisigGrantRole
cp parameters.json.example parameters.json
# Edit parameters.json
cd ../..
npx hardhat run tools/safeMultisigGrantRole/signSafeTransaction.ts --network custom

# 4. Execute Safe Transaction (after threshold reached)
npx hardhat run tools/safeMultisigGrantRole/executeSafeTransaction.ts --network custom

# 5. Self-grant operational roles (new admin)
cd tools/ledgerGrantRoles
cp parameters.json.example parameters.json
# Edit parameters.json with timelockAddress
cd ../..
npx hardhat run tools/ledgerGrantRoles/ledgerGrantRoles.ts --network custom
```

---
