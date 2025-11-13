# Create new Rollup

Script to call `initializeRollup` function.

- This script requires a genesis as input only if deploying a sovereign chain. The genesis will only be updated if deploying a sovereign chain, and the new genesis will be appended to the output file.

## Setup

- Install packages

```
npm i
```

- Set environment variables

```
cp .env.example .env
```

Fill `.env` with your `INFURA_PROJECT_ID` and (optionally) `MNEMONIC` or `ETHERSCAN_API_KEY`.

- Copy configuration files:

```
cp ./tools/initializeRollup/initialize_rollup.json.example ./tools/initializeRollup/initialize_rollup.json
```

- Set your parameters in `initialize_rollup.json`:

    - `type`: Specify the type of rollup creation. Options:
        - `EOA`: Create the rollup from a wallet; the script executes the creation on the specified network.
        - `Multisig`: Output the calldata for creating the rollup from a multisig.
        - `Timelock`: Output the execute and schedule data for a timelock contract.
    - `trustedSequencerURL`: Sequencer URL of the new rollup.
    - `networkName`: Network name of the new rollup.
    - `trustedSequencer`: Sequencer address of the new rollup.
    - `chainID`: ChainID of the rollup (must be unique, 32 bits max).
    - `rollupAdminAddress`: Admin address of the new rollup.
    - `consensusContractName`: Supported: `["PolygonZkEVMEtrog", "PolygonValidiumEtrog", "PolygonPessimisticConsensus", "AggchainECDSA", "AggchainFEP"]`.
    - `gasTokenAddress`: Address of the native gas token (zero address if ether).
    - `deployerPvtKey` (optional): Private key to deploy from a specific wallet.
    - `maxFeePerGas` (optional): String, set `maxFeePerGas` (in gwei). Must also set `maxPriorityFeePerGas` to use.
    - `maxPriorityFeePerGas` (optional): String, set `maxPriorityFeePerGas` (in gwei). Must also set `maxFeePerGas` to use.
    - `multiplierGas` (optional): Number, gas multiplier with 3 decimals. Ignored if `maxFeePerGas` and `maxPriorityFeePerGas` are set.
    - `timelockDelay` (required for Timelock): Timelock delay in seconds.
    - `timelockSalt` (optional for Timelock): Timelock salt.
    - `rollupManagerAddress`: Address of deployed RollupManager contract.
    - `aggchainParams` (required for Aggchain consensus contracts):
        - `initParams`: Object with Aggchain-specific initialization parameters:
            - `l2BlockTime`: Number. L2 block time in seconds.
            - `rollupConfigHash`: String. Hash of the rollup configuration.
            - `startingOutputRoot`: String. Initial output root for the rollup.
            - `startingBlockNumber`: Number. Starting block number for the rollup.
            - `startingTimestamp`: Number. Starting timestamp for the rollup.
            - `submissionInterval`: Number. Interval (in blocks) for submissions.
            - `optimisticModeManager`: Address. Address of the optimistic mode manager.
            - `aggregationVkey`: String. Aggregation verification key.
            - `rangeVkeyCommitment`: String. Range verification key commitment.
        - `useDefaultGateway`: Boolean.
        - `initOwnedAggchainVKey`: String.
        - `initAggchainVKeySelector`: String.
        - `vKeyManager`: Address.

- Run tool:

```
npx hardhat run ./tools/initializeRollup/initializeRollup.ts --network sepolia
```

### More Info

- All commands are run from the root repository.
- Output files are saved at `./tools/initializeRollup/initialize_rollup_output_{type}_{date}.json`.
- If the script fails, check the logs; most errors are handled and self-explanatory.
