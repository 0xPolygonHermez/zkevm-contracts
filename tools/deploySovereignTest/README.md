## Deploy Sovereign Test

Script to deploy a minimal Sovereign L2 test environment and exercise basic bridge flows. Intended for external usage to quickly spin up contracts and produce example Global Exit Roots (GERs) and proofs for testing.

### What it does
- Deploys upgradeable `BridgeL2SovereignChain` and `GlobalExitRootManagerL2SovereignChain`.
- Initializes the bridge with basic parameters.
- Simulates insertion of multiple Global Exit Roots and computes L1 info tree proofs.
- Makes a sample `bridgeAsset` call (ETH) and a `claimAsset`, including an undo claim.
- Writes a JSON report with addresses, GERs, proofs, and block ranges. The output filename includes an ISO‑8601 timestamp.

### How to run
```bash
npx hardhat run tools/deploySovereignTest/deploySovereign.ts --network <networkName>
```

### Input parameters
- Environment variables (via `.env`):
  - `MNEMONIC`: Deployer mnemonic used to derive the signer.
  - `HARDHAT_NETWORK`: Network name used in logging/verify hints.
- Constants in script:
  - `rollupID` and a few defaults for the test scenario can be edited directly in the script if needed.

### Outputs
- JSON file: `output__<ISO_TIMESTAMP>.json` in the same directory, containing:
  - `gerSovereignAddress`, `globalExitRoots` with `proof`, `localExitRoot`, `l1InfoRoot`, `chainId`, claimed/unclaimed indices, and block numbers.

### .gitignore of outputs
Add this pattern to ignore generated files:

```
tools/deploySovereignTest/output__*.json
```


