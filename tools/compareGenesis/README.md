# Genesis State Comparator

`compare-genesis.ts` is a **TypeScript** tool that validates the initial blockchain state defined in a `genesis.json` file against the actual state of a running Ethereum-compatible node.

It is designed for validating the correctness of genesis configurations when launching custom networks, rollups, or test environments — ensuring the deployed state matches exactly what was defined.

---

## Features

- ✅ Checks **nonce** for each account.
- ✅ Checks **balance** for each account.
- ✅ Verifies **deployed bytecode** against the genesis specification.
- ✅ Validates **storage slots** for contracts.
- ✅ Supports both plain `genesis.json` and Geth-style `alloc` format.
- ✅ Provides colorized console output for better readability.

---

## Requirements

- [Node.js](https://nodejs.org/) **v18+** (tested with v23.x)
- [TypeScript](https://www.npmjs.com/package/typescript)
- [ts-node](https://www.npmjs.com/package/ts-node)
- [ethers.js](https://www.npmjs.com/package/ethers) v6
- [chalk](https://www.npmjs.com/package/chalk)

---

## Installation

Clone the repository and install dependencies:

```bash
npm install
```

This will install both runtime (ethers, chalk) and development dependencies (typescript, ts-node, @types/node).

## Usage

You can run the script directly with ts-node (recommended for development):

```bash
npx ts-node compare-genesis.ts <RPC_URL> <GENESIS_FILE>
```

Or compile it to JavaScript and run with Node:

```bash
npx tsc
node dist/compare-genesis.js <RPC_URL> <GENESIS_FILE>
```

## PARAMETERS

- **RPC_URL**: The RPC endpoint of the node you want to validate.
- **GENESIS_FILE**: Path to the `genesis.json` file containing the expected state.

### Example

```bash
# Using the included example genesis
npx ts-node compare-genesis.ts http://localhost:8545 ./genesis.json.example

# Or any file in geth `alloc` format or repo-style `{ root, genesis: [...] }`
npx ts-node compare-genesis.ts https://rpc.example.org ./deployment/v2/genesis.json
```

---

## Example Output

```
=== Checking 0x1234... ===
✓ Nonce OK for 0x1234...
✗ Balance mismatch for 0x1234...
    Expected: 0
    Got:      1000000000000000000
✓ Code OK for 0x1234...
✗ Storage mismatch at slot 0x0...
    Expected: 0x...
    Got:      0x...
```

- ✅ Green = match
- ✗ Red = mismatch (with expected vs actual values)
- Yellow = expected value
- Cyan = actual value

---

## Typical Use Cases

- Verifying that a new chain was bootstrapped correctly from its `genesis.json`.
- Debugging issues when migrating state from one chain to another.
- Auditing changes in contract storage or code at the genesis block.
- Continuous Integration (CI): fail a build if mismatches are detected.

---

## Exit Codes

- `0` → All checks passed.
- `1` → At least one mismatch was found.

This makes it easy to integrate into CI/CD pipelines.

---

## Notes

- The script uses `blockTag = "earliest"`, so it only checks against the **genesis block**.
- If you are running a node that prunes history or does not expose block 0, make sure it supports `eth_get*` calls at `earliest`.
- The script accepts either `code` or `bytecode` fields for expected deployed code.
- Repo-style inputs `{ root, genesis: [...] }` are also supported.
- Storage comparison depends on `storage` entries being present in your `genesis.json`.
