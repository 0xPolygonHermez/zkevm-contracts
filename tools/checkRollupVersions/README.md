# Check Rollup Versions

Simple tool to check all rollups in the AgglayerManager and verify their versions and bridge contract versions.

## Usage

```bash
npx hardhat run tools/checkRollupVersions/checkRollupVersions.ts --network <network>
```

## What it does

1. Connects to AgglayerManager at `0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2`
2. Loops through all rollups (from rollup ID 1 to rollupCount)
3. For each rollup:
    - Gets the rollup contract address
    - Calls `networkName()` to get the rollup name
    - Calls `trustedSequencerURL()` to get the sequencer URL
    - Tests if the provider works by connecting to the URL
    - If provider works, checks the bridge contract at `0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe` on that network
    - Determines the version based on:
        - Presence of `claimedGlobalIndexHashChain` (v10.0.0+)
        - Presence of `version()` function (v12.0+)
        - Values of `BRIDGE_VERSION` and `BRIDGE_SOVEREIGN_VERSION` constants
4. Outputs a summary table with all rollup information

## Output

The script outputs:

- Rollup ID
- Network name
- Provider status (Works / Does not work)
- Version tag (v4.0.0-fork.7, v10.0.0, v10.0.0 RC8, v11, v12.0, v12.1, v12.2, etc.)
- Bridge Version
- Bridge Sovereign Version

## Version Detection Logic

- **v4.0.0-fork.7 (etrog)**: No `claimedGlobalIndexHashChain`
- **v10.0.0**: Has `claimedGlobalIndexHashChain`, no `version()` method
- **v10.0.0 RC8**: `BRIDGE_VERSION = "al-v0.3.0"`, `BRIDGE_SOVEREIGN_VERSION = "al-v0.3.0"`
- **v11**: `BRIDGE_VERSION = "al-v0.3.1"`, `BRIDGE_SOVEREIGN_VERSION = "v10.1.2"`
- **v12.0**: Has `version()` method, `BRIDGE_SOVEREIGN_VERSION = "v1.0.0"`, `BRIDGE_VERSION = "v1.0.0"`
- **v12.1**: Has `version()` `BRIDGE_SOVEREIGN_VERSION = "v1.1.0"`, `BRIDGE_VERSION = "v1.0.0"`
- **v12.2**: Has `version()` `BRIDGE_SOVEREIGN_VERSION = "v1.2.0"`, `BRIDGE_VERSION = "v1.1.0"`
