# Safe Multisig Tools

A comprehensive toolkit for interacting with Gnosis Safe multisig wallets. These tools support EIP-712 typed data signing, making them compatible with hardware wallets like Ledger.

## Overview

This toolkit provides scripts for:

1. **Preparing transactions** - Build Safe transactions for signing
2. **Signing transactions** - Collect EIP-712 signatures from owners
3. **Executing transactions** - Submit transactions with collected signatures

## File Structure

```
tools/safeMultisig/
├── safeUtils.ts              # Core utilities (shared by all scripts)
├── signSafeTransaction.ts    # Generic signing script
├── executeSafeTransaction.ts # Generic execution script
├── manageOwners.ts           # Prepare owner management transactions
├── prepareTransaction.ts     # Prepare arbitrary transactions
├── parameters.json           # Your configuration (create from .example)
├── parameters.json.example   # Example configuration
├── transactions.json         # Output: transactions and signatures (auto-generated)
└── README.md                 # This file
```

## Quick Start

### 1. Setup

```bash
# Copy example parameters and edit them
cp tools/safeMultisig/parameters.json.example tools/safeMultisig/parameters.json
```

### 2. Prepare a Transaction

Choose one of the preparation scripts based on your use case:

```bash
# For owner management (add/remove owners, change threshold)
npx hardhat run tools/safeMultisig/manageOwners.ts --network mainnet

# For arbitrary transactions (any contract call)
npx hardhat run tools/safeMultisig/prepareTransaction.ts --network mainnet
```

### 3. Collect Signatures

Each owner signs the prepared transaction:

```bash
# First owner
SIGNER_INDEX=0 npx hardhat run tools/safeMultisig/signSafeTransaction.ts --network mainnet

# Second owner (on their machine or with different key)
SIGNER_INDEX=1 npx hardhat run tools/safeMultisig/signSafeTransaction.ts --network mainnet

# Continue until threshold is reached...
```

### 4. Execute Transaction

Once threshold signatures are collected:

```bash
npx hardhat run tools/safeMultisig/executeSafeTransaction.ts --network mainnet
```

## Detailed Usage

### Manage Owners (`manageOwners.ts`)

Prepares transactions to add/remove owners and change the threshold.

**Parameters:**

```json
{
    "safeAddress": "0x...",
    "ownersToAdd": ["0xNewOwner1", "0xNewOwner2"],
    "ownersToRemove": ["0xOldOwner"],
    "newThreshold": 3
}
```

- `safeAddress`: The Safe multisig address
- `ownersToAdd`: Array of addresses to add as owners (optional)
- `ownersToRemove`: Array of addresses to remove (optional)
- `newThreshold`: New threshold value (optional, defaults to current)

**Notes:**
- At least one of `ownersToAdd`, `ownersToRemove`, or `newThreshold` must be specified
- Multiple operations are batched using MultiSendCallOnly
- The script validates that the final state is valid (threshold ≤ owner count)

### Prepare Transaction (`prepareTransaction.ts`)

Prepares an arbitrary transaction with custom `to` and `data`.

**Parameters:**

```json
{
    "safeAddress": "0x...",
    "to": "0xTargetContract",
    "data": "0x...",
    "value": 0,
    "operation": 0,
    "description": "Custom transaction"
}
```

- `safeAddress`: The Safe multisig address
- `to`: Target contract address
- `data`: Encoded calldata (hex string starting with 0x)
- `value`: ETH value in wei (optional, default: 0)
- `operation`: 0 for Call, 1 for DelegateCall (optional, default: 0)
- `description`: Human-readable description (optional)

**Value Formats:**
```json
"value": 0                    // wei
"value": "1000000000000000000" // wei as string
"value": "1.5 ether"          // parsed as ether
"value": "10 gwei"            // parsed as gwei
```

### Sign Transaction (`signSafeTransaction.ts`)

Signs a prepared transaction using EIP-712 typed data.

**Environment Variables:**
- `SIGNER_INDEX`: Index of signer in hardhat config (default: 0)
- `TX_INDEX`: Index of transaction to sign (default: latest)

**Output:**
- Signatures are added to the transaction in `transactions.json`
- Shows progress toward threshold

### Execute Transaction (`executeSafeTransaction.ts`)

Executes a transaction with collected signatures.

**Environment Variables:**
- `EXECUTOR_INDEX`: Index of executor account (default: 0)
- `FORCE_EXECUTE`: Set to "true" to ignore nonce mismatch
- `TX_INDEX`: Index of transaction to execute (default: latest)

## Using with Ledger

The scripts support Ledger hardware wallets through the hardhat configuration:

```typescript
// hardhat.config.ts
networks: {
    mainnet: {
        url: process.env.RPC_URL,
        accounts: {
            mnemonic: process.env.MNEMONIC,
            // Or for Ledger:
            // ledgerAccounts: ["0xYourLedgerAddress"]
        }
    }
}
```

When signing with Ledger, you'll be prompted to confirm the EIP-712 typed data on your device.

## Workflow Examples

### Example 1: Add New Owner and Increase Threshold

```bash
# Configure
cat > tools/safeMultisig/parameters.json << 'EOF'
{
    "safeAddress": "0xSafeAddress",
    "ownersToAdd": ["0xNewOwnerAddress"],
    "newThreshold": 3
}
EOF

# Prepare
npx hardhat run tools/safeMultisig/manageOwners.ts --network mainnet

# Sign (each owner)
SIGNER_INDEX=0 npx hardhat run tools/safeMultisig/signSafeTransaction.ts --network mainnet
SIGNER_INDEX=1 npx hardhat run tools/safeMultisig/signSafeTransaction.ts --network mainnet

# Execute
npx hardhat run tools/safeMultisig/executeSafeTransaction.ts --network mainnet
```

### Example 2: Custom Contract Call

```bash
# Configure with encoded calldata
cat > tools/safeMultisig/parameters.json << 'EOF'
{
    "safeAddress": "0xSafeAddress",
    "to": "0xContractAddress",
    "data": "0xa9059cbb000000000000000000000000recipient0000000000000000000000000000000000000000000000000000000000000000000000000000000000000de0b6b3a7640000",
    "value": 0,
    "description": "Transfer 1 TOKEN to recipient"
}
EOF

# Prepare, sign, execute...
npx hardhat run tools/safeMultisig/prepareTransaction.ts --network mainnet
```

## Security Considerations

1. **Verify Parameters**: Always double-check addresses and calldata before signing
2. **Multiple Devices**: For high-value operations, have owners sign from different devices
3. **Network Confirmation**: Ensure you're on the correct network before signing/executing
4. **Nonce Management**: If a transaction fails, the nonce will be consumed; prepare a new transaction
5. **Hardware Wallets**: Use Ledger for additional security on mainnet operations

## Troubleshooting

### "Nonce mismatch"
- A previous transaction was executed or the prepared transaction is stale
- Re-run the preparation script to get a fresh nonce

### "Insufficient signatures"
- Need more owners to sign before execution
- Check the threshold with `getThreshold()` on the Safe

### "Gas estimation failed"
- The transaction may revert; check the calldata and permissions
- Use `FORCE_EXECUTE=true` to attempt execution anyway

### "Not an owner"
- The signer address is not a Safe owner
- Check `SIGNER_INDEX` matches an owner account

## API Reference

### `safeUtils.ts` Exports

```typescript
// Constants
EIP712_SAFE_TX_TYPE, SAFE_ABI, SENTINEL_ADDRESS, MULTI_SEND_CALL_ONLY_ADDRESS

// Types
SafeTransaction, SafeSignature, TransactionData, MetaTransaction

// Transaction building
buildSafeTransaction(params)
calculateSafeTxHash(safeAddress, safeTx, chainId)

// Signing
buildSignatureBytes(signatures)
normalizeSignatureV(signature)

// Owner management
findPrevOwner(safeAddress, ownerToRemove)
encodeAddOwner(newOwner, threshold)
encodeRemoveOwner(prevOwner, owner, threshold)
encodeChangeThreshold(threshold)

// MultiSend
encodeMultiSendCallOnly(transactions)

// File operations
loadTransactions(filePath)
saveTransactions(filePath, transactions)
findTransactionByHash(transactions, txHash)
upsertTransaction(transactions, transaction)
```
