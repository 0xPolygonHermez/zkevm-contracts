# Safe Multisig - Grant Role Tool

Tool to create, sign, and execute Safe multisig transactions for granting roles on a Timelock contract.

## Overview

This tool creates a transaction that calls `grantRole(bytes32 role, address account)` on a Timelock contract, signed by the Safe multisig owners.

```
┌─────────────┐      ┌──────────────┐      ┌────────────────────┐
│  Signer 1   │──┐   │              │      │                    │
├─────────────┤  │   │    Safe      │      │     Timelock       │
│  Signer 2   │──┼──▶│   Multisig   │─────▶│    grantRole()     │
├─────────────┤  │   │              │      │                    │
│  Signer N   │──┘   └──────────────┘      └────────────────────┘
└─────────────┘
```

## Quick Start

### 1. Configure

```bash
cp parameters.json.example parameters.json
```

Edit `parameters.json`:

```json
{
    "safeAddress": "0x242daE44F5d8fb54B198D03a94dA45B5a4413e21",
    "timelockAddress": "0xBBa0935Fa93Eb23de7990b47F0D96a8f75766d13",
    "roleReceiver": "0xAddressToReceiveRole",
    "roleName": "TIMELOCK_ADMIN_ROLE"
}
```

| Parameter | Description |
|-----------|-------------|
| `safeAddress` | Address of the Safe multisig wallet |
| `timelockAddress` | Address of the Timelock contract to call |
| `roleReceiver` | Address that will receive the role |
| `roleName` | Name of the role to grant |

### 2. Sign (each owner)

Each Safe owner runs this to add their signature:

```bash
npx hardhat run tools/safeMultisigGrantRole/signSafeTransaction.ts --network mainnet
```

### 3. Execute (anyone)

Once threshold is reached:

```bash
npx hardhat run tools/safeMultisigGrantRole/executeSafeTransaction.ts --network mainnet
```

## Detailed Usage

### Signing with Different Accounts

```bash
# Use second account (index 1)
SIGNER_INDEX=1 npx hardhat run tools/safeMultisigGrantRole/signSafeTransaction.ts --network mainnet
```

### Signing with Ledger

1. Set `LEDGER_ACCOUNT` in your `.env` file:
   ```
   LEDGER_ACCOUNT=0xYourLedgerAddress
   ```

2. Connect Ledger, unlock, open Ethereum app

3. Run the script:
   ```bash
   npx hardhat run tools/safeMultisigGrantRole/signSafeTransaction.ts --network mainnet
   ```

### Executing with Different Account

```bash
EXECUTOR_INDEX=1 npx hardhat run tools/safeMultisigGrantRole/executeSafeTransaction.ts --network mainnet
```

### Force Execute (ignore nonce mismatch)

```bash
FORCE_EXECUTE=true npx hardhat run tools/safeMultisigGrantRole/executeSafeTransaction.ts --network mainnet
```

## Workflow Example

```
┌────────────────────────────────────────────────────────────────┐
│ 1. Signer A runs signSafeTransaction.ts                        │
│    └─▶ signedTransactions.json created (1/3 signatures)        │
├────────────────────────────────────────────────────────────────┤
│ 2. Signer B runs signSafeTransaction.ts                        │
│    └─▶ signedTransactions.json updated (2/3 signatures)        │
├────────────────────────────────────────────────────────────────┤
│ 3. Signer C runs signSafeTransaction.ts                        │
│    └─▶ signedTransactions.json updated (3/3 signatures) ✅     │
├────────────────────────────────────────────────────────────────┤
│ 4. Anyone runs executeSafeTransaction.ts                       │
│    └─▶ Transaction executed on-chain ✅                        │
└────────────────────────────────────────────────────────────────┘
```

## Supported Roles

| Role | Description |
|------|-------------|
| `TIMELOCK_ADMIN_ROLE` | Admin of the timelock (can grant/revoke roles) |
| `PROPOSER_ROLE` | Can propose/schedule transactions |
| `EXECUTOR_ROLE` | Can execute ready transactions |
| `CANCELLER_ROLE` | Can cancel pending transactions |

## Files

| File | Description |
|------|-------------|
| `parameters.json` | Configuration (create from `.example`) |
| `signedTransactions.json` | Accumulated signatures (auto-generated) |
| `signSafeTransaction.ts` | Script 1: Sign transaction |
| `executeSafeTransaction.ts` | Script 2: Execute transaction |

## Environment Variables

| Variable | Script | Description |
|----------|--------|-------------|
| `SIGNER_INDEX` | sign | Account index to sign with (default: 0) |
| `EXECUTOR_INDEX` | execute | Account index to execute with (default: 0) |
| `FORCE_EXECUTE` | execute | Set `true` to ignore nonce mismatch |
| `LEDGER_ACCOUNT` | both | Your Ledger address (enables hardware signing) |

## Technical Details

### Signature Format

Uses EIP-712 typed data signing for:
- Human-readable transaction display on hardware wallets
- Replay attack protection (includes chain ID and contract address)
- Standard `v=27/28` ECDSA signatures

### Gnosis Safe Signature Types

| `v` value | Type | Usage |
|-----------|------|-------|
| 0 | Contract signature | EIP-1271 smart contract wallets |
| 1 | Approved hash | Pre-approved on-chain |
| 27-28 | ECDSA | **Standard EOA signature (we use this)** |
| 31-32 | eth_sign | Legacy message signing |

## Troubleshooting

### "Nonce mismatch"

The Safe nonce has changed since signatures were collected. This happens when:
- Another transaction was executed
- This transaction was already executed

**Solution**: If you're sure, use `FORCE_EXECUTE=true`. Otherwise, delete `signedTransactions.json` and re-sign.

### "Insufficient signatures"

Not enough owners have signed yet.

**Solution**: Have more owners run `signSafeTransaction.ts` until threshold is met.

### "Signer is not a Safe owner"

The address you're signing with is not an owner of the Safe.

**Solution**: Use `SIGNER_INDEX` to select the correct account, or check the Safe configuration.

### "Gas estimation failed"

Usually indicates the transaction will revert. Common causes:
- Invalid signatures
- Nonce mismatch
- Target contract will revert

**Solution**: Check the error message. The script will try to execute anyway.

### Ledger Issues

1. Ensure device is connected and unlocked
2. Open the Ethereum app
3. Enable "Blind signing" in app settings (if needed)
4. Check `LEDGER_ACCOUNT` is set correctly in `.env`
