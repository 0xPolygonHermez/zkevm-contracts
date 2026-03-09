# deployment/

Deployment scripts for the Agglayer contracts. All production deployments use Hardhat.

## Deployment Sequence (`v2/`)

Scripts run in order:

1. **`1_createGenesis.ts`** -- Generates the genesis block for the rollup. Depends on `deploy_parameters.json`. Flags: `--test` for test deployments, `--input`/`--out` for custom paths.

2. **`2_deployPolygonZKEVMDeployer.ts`** -- Deploys the `PolygonZkEVMDeployer` factory contract using a keyless (CREATE2) deployment. Gas price hardcoded at 100 gwei (change in `helpers/deployment-helpers.ts` via `gasPriceKeylessDeployment` -- this changes all deterministic addresses).

3. **`3_deployContracts.ts`** -- Deploys all core contracts (AgglayerManager, AgglayerBridge, AgglayerGER, AgglayerGateway, AgglayerTimelock, etc.) using deterministic addresses via the deployer.

4. **`4_createRollup.ts`** -- Creates the first rollup with the specified consensus type.

## Config Files

Both live in `deployment/v2/` (copy from `.example` files):

**`deploy_parameters.json`** -- Core deployment config:
- `test`: bool -- test mode (funds deployer, skips timelock)
- `timelockAdminAddress`: address -- timelock owner
- `minDelayTimelock`: number -- timelock delay in seconds
- `salt`: bytes32 -- CREATE2 salt for deterministic addresses
- `initialZkEVMDeployerOwner`: address -- deployer factory owner
- `admin`: address -- can adjust RollupManager params, stop emergency
- `trustedAggregator`: address -- aggregates proofs
- `trustedAggregatorTimeout`: uint64 -- timeout for permissionless verification
- `pendingStateTimeout`: uint64 -- timeout for state consolidation
- `emergencyCouncilAddress`: address -- emergency council
- `polTokenAddress`: address -- POL token (auto-filled on testnet)
- `zkEVMDeployerAddress`: address -- auto-filled by script 2
- `ppVKey`, `ppVKeySelector`: pessimistic proof verification key (AgglayerGateway)
- `realVerifier`: bool -- deploy real verifier vs mock
- `multisigRoleAddress`, `signersToAdd`, `newThreshold`: AgglayerGateway multisig config

**`create_rollup_parameters.json`** -- Rollup creation config:
- `consensusContract`: one of `["PolygonZkEVMEtrog", "PolygonValidiumEtrog", "PolygonPessimisticConsensus", "AggchainECDSA", "AggchainFEP"]`
- `chainID`, `forkID`, `networkName`, `description`
- `trustedSequencer`, `trustedSequencerURL`
- `adminZkEVM`: rollup admin
- `gasTokenAddress`: native gas token (0x0 for ETH)
- `programVKey`: for pessimistic consensus
- `isVanillaClient`: flag for sovereign chains (requires `sovereignParams`)
- `aggchainParams`: for AggchainECDSA/AggchainFEP (see deployment/v2/README.md for full details)

**Optional params** (both files): `deployerPvtKey`, `maxFeePerGas`, `maxPriorityFeePerGas`, `multiplierGas`, `dataAvailabilityProtocol`

## Network Targeting

```bash
npm run deploy:v2:localhost             # Local Hardhat node
npm run deploy:v2:sepolia               # Sepolia testnet
npm run deploy:testnet:v2:sepolia       # Sepolia with auto POL token deployment
npm run verify:v2:sepolia               # Verify on Etherscan
```

Mainnet uses similar scripts but with explicit steps (see package.json).

## Environment

Requires `.env` in project root:
- `MNEMONIC` -- deployer wallet
- `INFURA_PROJECT_ID` -- RPC provider
- `ETHERSCAN_API_KEY` -- contract verification
- `LEDGER_ACCOUNT` (optional) -- hardware wallet

## Output

Deployment output saved to `deployments/{network}_{timestamp}/` containing:
- `deploy_*.json` -- deployment addresses and config
- `{network}.json` -- OpenZeppelin proxy metadata
- `genesis.json` -- genesis block
- `create_rollup_output_*.json` -- rollup creation output

## Important Notes

- Cannot reuse the same `salt` + `initialZkEVMDeployerOwner` on the same network
- Must delete `.openzeppelin/` files before a new deployment
- Testnet scripts auto-deploy a test POL token and fill `polTokenAddress`
- Verification scripts in `verifyContracts.ts` and `verifyzkEVMDeployer.ts`

## Helpers

- `helpers/deployment-helpers.ts` -- Keyless deployment logic, gas price config
- `helpers/utils.ts` -- Shared deployment utilities
- `testnet/prepareTestnet.ts` -- Deploys test POL token for testnet
