# test/

Test suite for Agglayer contracts. Coverage target: 100%.

## Structure

```
test/
  contractsv2/       Main Hardhat test suite (31+ files)
    helpers/          Small helper utilities for tests
    claimCompressor/  ClaimCompressor-specific tests
    real-prover-sp1/  SP1 verifier tests with real test inputs
  forge/              Foundry tests (supplementary to Hardhat)
    base/             Base test classes
    fuzz/             Fuzz testing
    script/           Test scripts
    utils/            Test utilities
  src/                Additional TS test scripts
    aggchain-FEP.test.ts
    aggchain-utils.test.ts
    aggchain-utils-FEP.test.ts
    timelock-storage.test.ts
  test-vectors/       Test vector data
    aggchain/
    aggchainECDSA/
    aggchainFEP/
  index.test.js       Main test entry point
```

## Running Tests

```bash
npm run test                   # All Hardhat tests
npm run coverage               # Coverage (contractsv2/*.ts only)
npm run gas:report             # Gas report
npm run gas:report:file        # Gas report to file
```

Foundry tests (supplementary):
```bash
just test       # Run Foundry tests
just coverage   # Foundry coverage
```

Foundry tests are supplementary to Hardhat tests, not a replacement.

## Key Test Files

| Test File | What it covers |
|---|---|
| `PolygonRollupManager.test.ts` | AgglayerManager (rollup management, verification) |
| `BridgeV2.test.ts` | AgglayerBridge functionality |
| `BridgeV2Upgrade.test.ts` | Bridge upgrade paths |
| `PolygonGlobalExitRootV2.test.ts` | AgglayerGER |
| `AggLayerGateway.test.ts` | AgglayerGateway |
| `AggchainFEP.test.ts` | AggchainFEP consensus |
| `AggchainECDSAMultisig.test.ts` | AggchainECDSA consensus |
| `PolygonPessimisticConsensus.test.ts` | Legacy pessimistic consensus |
| `BridgeL2SovereignChain.test.ts` | Sovereign chain L2 bridge |

## Mocks

Tests use mock contracts from `contracts/mocks/` (e.g., `PolygonZkEVMBridgeMock`, `VerifierRollupHelperMock`, `ERC20PermitMock`) to test without real proofs.

## Notes

- Hardhat compile is required before running Foundry tests (resolves version mismatches)
- Coverage skips `contracts/mocks/` and `contracts/interfaces/` (configured in `.solcover.js`)
- Test keys in README are for testing only, never production
