# Ledger Grant Roles

Tool to grant PROPOSER_ROLE and EXECUTOR_ROLE on a Timelock contract using a Ledger hardware wallet.

## Overview

This script allows an account that already has admin privileges on a Timelock contract (TIMELOCK_ADMIN_ROLE or DEFAULT_ADMIN_ROLE) to grant itself the PROPOSER_ROLE and EXECUTOR_ROLE.

```
┌─────────────┐      grantRole()       ┌────────────────────┐
│   Ledger    │ ─────────────────────► │     Timelock       │
│   (Admin)   │                        │                    │
└─────────────┘                        │  PROPOSER_ROLE  ✓  │
                                       │  EXECUTOR_ROLE  ✓  │
                                       └────────────────────┘
```

## Prerequisites

1. The Ledger account must have `TIMELOCK_ADMIN_ROLE` on the Timelock contract
2. Ledger device connected and unlocked with Ethereum app open
3. "Blind signing" enabled on the Ledger (Settings > Blind signing > Enabled)

## Setup

1. Copy the example parameters file:

```bash
cp tools/ledgerGrantRoles/parameters.json.example tools/ledgerGrantRoles/parameters.json
```

2. Edit `parameters.json`:

```json
{
    "timelockAddress": "0xYourTimelockAddress"
}
```

3. Configure environment variables in `.env`:

```bash
LEDGER_ACCOUNT=0xYourLedgerAddress
SIGNER_INDEX=0  # Optional: index of signer to use (default: 0)
CUSTOM_PROVIDER=https://your-rpc-url
```

## Usage

Run the script with the custom network (which supports Ledger):

```bash
LEDGER_ACCOUNT=0xYourLedgerAddress npx hardhat run tools/ledgerGrantRoles/ledgerGrantRoles.ts --network custom
```

## Parameters

| Parameter | Description |
|-----------|-------------|
| `timelockAddress` | Address of the Timelock contract |

## Timelock Roles

| Role | Description |
|------|-------------|
| `TIMELOCK_ADMIN_ROLE` | Admin of the timelock (can grant/revoke roles) |
| `PROPOSER_ROLE` | Can propose/schedule transactions on the timelock |
| `EXECUTOR_ROLE` | Can execute ready (delayed) transactions |
| `CANCELLER_ROLE` | Can cancel scheduled transactions |

## Example Output

```
╔══════════════════════════════════════════════════════════╗
║       LEDGER - GRANT PROPOSER & EXECUTOR ROLES           ║
╚══════════════════════════════════════════════════════════╝

Configuration:
  Timelock Address: 0xBBa0935Fa93Eb23de7990b47F0D96a8f75766d13
  Chain ID:         1

Signer: [0] 0x1234...5678
  (Using Ledger hardware wallet)

Timelock Roles:
  PROPOSER_ROLE:        0xb09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1d5ca736082b6819cc1
  EXECUTOR_ROLE:        0xd8aa0f3194971a2a116679f7c2090f6939c8d4e01a2a8d7e41d55e5351469e63
  TIMELOCK_ADMIN_ROLE:  0x5f58e3a2316349923ce3780f8d587db2d72378aed66a8261c916544fa6846ca5

Checking signer roles...
  Has TIMELOCK_ADMIN_ROLE: ✅ Yes
  Has PROPOSER_ROLE:       ❌ No
  Has EXECUTOR_ROLE:       ❌ No

Granting PROPOSER_ROLE...
  (Confirm on Ledger device if using hardware wallet)
  Transaction sent: 0x...
  ✅ PROPOSER_ROLE granted! Block: 12345678

Granting EXECUTOR_ROLE...
  (Confirm on Ledger device if using hardware wallet)
  Transaction sent: 0x...
  ✅ EXECUTOR_ROLE granted! Block: 12345679

╔══════════════════════════════════════════════════════════╗
║                     SUCCESS                              ║
╚══════════════════════════════════════════════════════════╝

✅ Account 0x1234...5678 now has:
   - PROPOSER_ROLE (can schedule transactions)
   - EXECUTOR_ROLE (can execute ready transactions)

   on Timelock: 0xBBa0935Fa93Eb23de7990b47F0D96a8f75766d13
```

## Troubleshooting

### "Signer does not have TIMELOCK_ADMIN_ROLE on Timelock"

The connected Ledger account must already have TIMELOCK_ADMIN_ROLE on the Timelock. Contact the current admin to grant you the admin role first.

### "No signers available"

Make sure `LEDGER_ACCOUNT` environment variable is set to your Ledger address.

### Ledger not connecting

1. Ensure Ledger is connected and unlocked
2. Open the Ethereum app on the Ledger
3. Enable "Blind signing" in the Ethereum app settings
4. Try disconnecting and reconnecting the Ledger

### Transaction rejected

If you see a transaction rejection, make sure to confirm the transaction on your Ledger device when prompted.
