---
name: safe-multisig
description: Guide the user through Safe multisig operations -- managing owners, preparing arbitrary transactions, collecting signatures, and executing on-chain. Supports Ledger hardware wallets and Timelock interactions.
user-invocable: true
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, AskUserQuestion
argument-hint: "[manage-owners | prepare-tx | sign | execute]"
---

# Safe Multisig Operations

You are helping the user interact with a Gnosis Safe multisig wallet. The toolkit lives in `tools/safeMultisig/`.

The workflow always follows: **Prepare -> Sign -> Execute**.

## Step 1: Determine the operation

Ask the user (or determine from `$ARGUMENTS`) which operation they need:

### Option A: Manage Owners (`manageOwners.ts`)
- **When**: Add/remove Safe owners or change the signing threshold
- **Script**: `tools/safeMultisig/manageOwners.ts`

### Option B: Prepare Arbitrary Transaction (`prepareTransaction.ts`)
- **When**: Execute any contract call through the Safe (e.g., Timelock schedule/execute, contract upgrades, token transfers)
- **Script**: `tools/safeMultisig/prepareTransaction.ts`

### Option C: Sign a Prepared Transaction (`signSafeTransaction.ts`)
- **When**: A transaction is already prepared in `transactions.json` and needs more signatures
- **Script**: `tools/safeMultisig/signSafeTransaction.ts`

### Option D: Execute a Signed Transaction (`executeSafeTransaction.ts`)
- **When**: Enough signatures have been collected and the transaction is ready to go on-chain
- **Script**: `tools/safeMultisig/executeSafeTransaction.ts`

If the user says something generic like "I want to use the multisig", ask them which operation they need.

## Step 2: Gather required parameters

### For ALL operations:
1. **Network** -- which network to use (e.g., `mainnet`, `sepolia`, `custom`). Ask: "Which network should we use?"
2. **Environment** -- remind the user to ensure `.env` has:
   - `CUSTOM_PROVIDER` (RPC URL, if using `--network custom`)
   - `LEDGER_ACCOUNT` (their Ledger address, if using Ledger)
   - Or `MNEMONIC` for software wallet signing

### For Option A (Manage Owners):
Ask the user for:
1. **safeAddress** -- the Safe multisig address
2. **ownersToAdd** -- addresses to add as owners (optional)
3. **ownersToRemove** -- addresses to remove (optional)
4. **newThreshold** -- new signing threshold (optional, keeps current if omitted)

At least one of `ownersToAdd`, `ownersToRemove`, or `newThreshold` must be provided.

### For Option B (Prepare Arbitrary Transaction):
Ask the user for:
1. **safeAddress** -- the Safe multisig address
2. **to** -- target contract address
3. **data** -- encoded calldata (hex string starting with `0x`)
4. **value** -- ETH value (default: 0). Supports: `0`, `"1.5 ether"`, `"10 gwei"`, or wei as string
5. **operation** -- 0 for Call, 1 for DelegateCall (default: 0)
6. **description** -- human-readable description (optional but recommended)

#### Common use case: Timelock schedule/execute
If the user wants to schedule or execute a Timelock operation, help them encode the calldata:

**Schedule:**
```
function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)
```

**Execute:**
```
function execute(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt)
```

The Timelock address for mainnet is: `0xEf1462451C30Ea7aD8555386226059Fe837CA4EF`

### For Option C (Sign):
- **TX_INDEX** -- which transaction to sign (default: latest)
- **SIGNER_INDEX** -- index of signer in hardhat config (default: 0). In practice each owner signs from their own machine with their own Ledger, so this stays at 0. Only relevant if a single machine has multiple signers configured.

### For Option D (Execute):
- **EXECUTOR_INDEX** -- index of executor account (default: 0)
- **TX_INDEX** -- which transaction to execute (default: latest)
- **FORCE_EXECUTE** -- set to `"true"` to bypass nonce mismatch (only if user confirms)

## Step 3: Write the parameters file

For Options A and B, write the configuration to `tools/safeMultisig/parameters.json`.

### Template for Manage Owners:
```json
{
    "safeAddress": "<safe-address>",
    "ownersToAdd": ["<address1>", "<address2>"],
    "ownersToRemove": ["<address>"],
    "newThreshold": 3
}
```

Only include the fields that are relevant. Omit `ownersToAdd` if not adding, omit `ownersToRemove` if not removing.

### Template for Arbitrary Transaction:
```json
{
    "safeAddress": "<safe-address>",
    "to": "<target-contract>",
    "data": "<encoded-calldata>",
    "value": 0,
    "description": "<human-readable-description>"
}
```

## Step 4: Run the appropriate script

All commands run from the **repository root**.

### Prepare (Option A -- Manage Owners):
```bash
npx hardhat run tools/safeMultisig/manageOwners.ts --network <network>
```

### Prepare (Option B -- Arbitrary Transaction):
```bash
npx hardhat run tools/safeMultisig/prepareTransaction.ts --network <network>
```

### Sign (Option C):
```bash
SIGNER_INDEX=<index> npx hardhat run tools/safeMultisig/signSafeTransaction.ts --network <network>
```

### Execute (Option D):
```bash
EXECUTOR_INDEX=<index> npx hardhat run tools/safeMultisig/executeSafeTransaction.ts --network <network>
```

Or with force execute:
```bash
FORCE_EXECUTE=true EXECUTOR_INDEX=<index> npx hardhat run tools/safeMultisig/executeSafeTransaction.ts --network <network>
```

## Step 5: Guide through the full flow

After preparing, remind the user of the remaining steps:

1. **Collect signatures** -- each Safe owner runs `signSafeTransaction.ts` from their own machine with their own Ledger (SIGNER_INDEX stays at 0 for everyone). After each owner signs, they share the updated `transactions.json` with the next owner until threshold is met.
2. **Execute** -- once threshold signatures are collected, anyone runs `executeSafeTransaction.ts`.

If using Ledger, remind the user:
- Ledger must be connected and unlocked
- Ethereum app must be open
- Blind signing must be enabled (Settings -> Blind signing -> Enabled)

## Troubleshooting

If the user hits an error, check these common issues:

| Error | Cause | Fix |
|-------|-------|-----|
| "Nonce mismatch" | A previous tx was executed or prepared tx is stale | Re-run the preparation script |
| "Insufficient signatures" | Not enough owners have signed | More owners need to run `signSafeTransaction.ts` |
| "Not an owner" / "Signer is not a Safe owner" | The signer address is not a Safe owner | Check `SIGNER_INDEX` or `LEDGER_ACCOUNT` |
| "Already signed" | This signer already signed | Another owner needs to sign |
| "Gas estimation failed" | Transaction would revert | Check calldata, permissions; try `FORCE_EXECUTE=true` |
| Ledger not detected | USB or app issue | Reconnect, unlock, open Ethereum app |
| Transaction rejected on Ledger | Blind signing disabled | Enable blind signing in Ledger Ethereum app settings |

## Important notes

- NEVER ask the user for private keys or mnemonics. Only remind them to set these in `.env`.
- Always confirm the network and addresses with the user before executing.
- For mainnet operations, recommend Ledger hardware wallets.
- The `transactions.json` file is auto-generated -- do not manually create it.
