---
name: upgrade-l2
description: Upgrade L2 sovereign chain contracts (bridge and/or GER). Helps configure parameters, choose the right script, and run the upgrade.
user-invocable: true
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, AskUserQuestion
argument-hint: "[network-name or chain-rpc-url]"
---

# Upgrade L2 Sovereign Chain Contracts

You are helping the user upgrade L2 (sovereign chain) contracts. There are exactly **2 active upgrade scripts** -- all others in `upgrade/` are deprecated.

## Step 1: Determine which upgrade script to use

Ask the user (or determine from context) which situation applies:

### Option A: `upgradeSovereignBridge` (simpler)
- **When**: The L2 bridge is already on a recent sovereign version (`v1.0.0`, `v1.1.0`, `v1.2.0`, or legacy `v10.1.2`)
- **What it does**: Upgrades `BridgeL2SovereignChain` -> `AgglayerBridgeL2`
- **Only upgrades the bridge** (not the GER)
- Script: `upgrade/upgradeSovereignBridge/upgradeSovereignBridge.ts`
- README: `upgrade/upgradeSovereignBridge/README.md`

### Option B: `upgradeEtrogSovereign` (more complex)
- **When**: The L2 comes from Etrog (previous/legacy version)
- **What it does**: Upgrades BOTH contracts:
  - `PolygonZkEVMBridgeV2` (Etrog) -> `AgglayerBridgeL2FromEtrog`
  - `PolygonZkEVMGlobalExitRootL2` (Etrog) -> `AgglayerGERL2`
- Requires manifest generation from a git tag
- Requires more initialization parameters (bridge roles, GER roles, token data)
- Script: `upgrade/upgradeEtrogSovereign/upgradeEtrogToSovereign.ts`
- Wrapper: `upgrade/upgradeEtrogSovereign/upgrade_etrog_to_sovereign.sh`
- README: `upgrade/upgradeEtrogSovereign/README.md`

## Step 2: Identify the target network

Use `$ARGUMENTS` if provided (network name or RPC URL). Otherwise ask.

### Known networks and their contract addresses

**Cardona (Agglayer testnet, on Sepolia):**
- AgglayerManager: `0x32d33D5137a7cFFb54c5Bf8371172bcEc5f310ff`
- AgglayerBridge (L1): `0x528e26b25a34a4A5d0dbDa1d57D318153d2ED582`
- AgglayerGER: `0xAd1490c248c5d3CbAE399Fd529b79B42984277DF`
- AgglayerGateway: `0xaA8103640A6C92af48A97D720168011E9f3Ec697`

**Mainnet (Ethereum L1):**
- AgglayerManager: `0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2`
- AgglayerBridge (L1): `0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe`
- AgglayerGER: `0x580bda1e7A0CFAe92Fa7F6c20A3794F169CE3CFb`
- AgglayerGateway: `0x046Bb8bb98Db4ceCbB2929542686B74b516274b3`

**Important**: These are L1 addresses. The upgrade targets L2 contracts (on the sovereign chain itself). The `bridgeL2Address` in the config is the bridge address **on L2**, which is often the same address as L1 bridge (e.g. `0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe`) but deployed on the L2 network.

## Step 3: Ask the user for missing information

You MUST ask the user for anything you cannot determine automatically:

1. **L2 RPC URL** -- always needed. Ask: "What is the L2 RPC URL for this sovereign chain?"
2. **bridgeL2Address** -- the bridge proxy address on L2. If not known, ask.
3. **DEPLOYER_PRIVATE_KEY** -- remind them to set it in `.env`. Never ask for the actual key.

### Additional parameters for `upgradeEtrogSovereign` only:
4. **bridge_initParams** -- Ask who should hold these roles (can be same address):
   - `bridgeManager`
   - `proxiedTokensManagerAddress`
   - `emergencyBridgePauserAddress`
   - `emergencyBridgeUnpauserAddress`
5. **ger_initParams** -- Ask who should hold these roles:
   - `globalExitRootUpdater`
   - `globalExitRootRemover`
6. **Git tag** for manifest generation (e.g. `v4.0.0-fork.7`). Ask: "Which git tag should be used for the OZ manifest? (default: v4.0.0-fork.7)"

### For shadow fork testing (optional but recommended):
7. **forkParams.rpc** -- same as L2 RPC URL typically
8. **forkParams.timelockAdminAddress** -- address with PROPOSER_ROLE and EXECUTOR_ROLE on the L2 timelock

## Step 4: Generate the upgrade_parameters.json

Write the config to the appropriate path:
- `upgrade/upgradeSovereignBridge/upgrade_parameters.json` for Option A
- `upgrade/upgradeEtrogSovereign/upgrade_parameters.json` for Option B

### Template for upgradeSovereignBridge:
```json
{
    "bridgeL2Address": "<bridge-proxy-address-on-L2>",
    "forceImport": false,
    "unsafeMode": true,
    "forkParams": {
        "rpc": "<L2-RPC-URL>",
        "timelockAdminAddress": "<address-with-proposer-and-executor-role>"
    }
}
```

Notes:
- Set `forceImport: true` if contract was deployed in L2 genesis (no OZ manifest exists)
- `unsafeMode` is always `true` (bypasses git tag check, which we don't need)

### Template for upgradeEtrogSovereign:
```json
{
    "unsafeMode": true,
    "bridgeL2Address": "<bridge-proxy-address-on-L2>",
    "bridge_initParams": {
        "bridgeManager": "<address>",
        "proxiedTokensManagerAddress": "<address>",
        "emergencyBridgePauserAddress": "<address>",
        "emergencyBridgeUnpauserAddress": "<address>"
    },
    "ger_initParams": {
        "globalExitRootUpdater": "<address>",
        "globalExitRootRemover": "<address>"
    },
    "pathTokensJson": "",
    "forkParams": {
        "rpc": "<L2-RPC-URL>",
        "timelockAdminAddress": "<address>"
    }
}
```

Notes:
- Leave `pathTokensJson` empty to auto-fetch token data from the bridge contract
- All role addresses CAN be the same address (common in testnets)

## Step 5: Ensure .env is configured

Check that `.env` exists and remind the user to set:
- `DEPLOYER_PRIVATE_KEY` (or `MNEMONIC`)
- `CUSTOM_PROVIDER` = the L2 RPC URL (for custom network)

## Step 6: Run the upgrade

### For upgradeSovereignBridge:
```bash
npx hardhat run ./upgrade/upgradeSovereignBridge/upgradeSovereignBridge.ts --network custom
```

### For upgradeEtrogSovereign (all-in-one):
```bash
./upgrade/upgradeEtrogSovereign/upgrade_etrog_to_sovereign.sh --old-tag <git-tag> --url <L2-RPC-URL>
```

Or step by step:
1. Generate manifest: `./tools/importOZInfoFromTag/import_oz_info_from_tag.sh --tag <tag> --url <rpc>`
2. Copy manifest to `.openzeppelin/`
3. Run: `npx hardhat run ./upgrade/upgradeEtrogSovereign/upgradeEtrogToSovereign.ts --network custom`

## Step 7: Post-deployment

After the script runs, `upgrade_output.json` is created with:
- `scheduleData`: Transaction data to schedule the upgrade in the timelock
- `executeData`: Transaction data to execute the upgrade after delay
- Implementation addresses and block numbers

Remind the user:
1. Send `scheduleData` to the timelock (requires PROPOSER_ROLE)
2. Wait for the timelock delay
3. Send `executeData` to the timelock (requires EXECUTOR_ROLE)

## Step 8: Validate (recommended)

Run the shadow fork test before executing on mainnet:

### For upgradeSovereignBridge:
```bash
npx hardhat run ./upgrade/upgradeSovereignBridge/test/shadowForkUpgrade.test.ts
```

### For upgradeEtrogSovereign:
```bash
npx hardhat run ./upgrade/upgradeEtrogSovereign/test/shadowForkUpgrade.test.ts
```

This forks the network, simulates the full timelock schedule/execute flow, and validates version + storage preservation.
