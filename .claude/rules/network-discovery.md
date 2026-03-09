# Network Discovery

When the user refers to an L2 network by name (e.g., "katana", "X Layer", "silicon", "ternoa"), look up its RPC URL and rollup ID from the rollup versions registry before asking the user for it.

## How to find a network

1. **First**, read `tools/checkRollupVersions/rollupVersions.json` and match the user's input against the `name` field (case-insensitive, partial match is fine).
2. Use the `providerURL` as the RPC URL for `cast` commands, `--rpc-url`, or `CUSTOM_PROVIDER`.
3. Note the `rollupID`, `version`, and `providerStatus` -- if status is "Does not work", warn the user that the RPC may be down.

## Refreshing the registry

The JSON file is a snapshot and may be stale. To refresh it:
```bash
npx hardhat run tools/checkRollupVersions/checkRollupVersions.ts --network mainnet
```
This queries AgglayerManager on-chain and updates the data. Suggest this if the user asks about a network that's not in the file or if data seems outdated.

## Using the discovered RPC

Once you have the `providerURL`, use it directly:
```bash
# Example: check balance on katana (rollup 20, rpc https://rpc.katanarpc.com)
cast balance 0xSomeAddress --rpc-url https://rpc.katanarpc.com

# Example: check bridge version on silicon (rollup 10, rpc https://rpc.silicon.network)
cast call 0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe "BRIDGE_SOVEREIGN_VERSION()(string)" --rpc-url https://rpc.silicon.network
```

The L2 bridge address is always `0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe` (same address as L1, deployed at the same address on L2).
