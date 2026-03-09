# Obsolete rollup type
Script to call `obsoleteRollupType` function in the `AgglayerManager.sol` smart contract.

## Install
```
npm i
```

## Setup
### obsoleteRollupType
The script supports three modes of operation, controlled by the `mode` parameter:

#### Mode 1: Inclusion (`mode: "inclusion"`)
Specify exactly which rollup types to obsolete using the `list` parameter.
- Use case: You know the specific rollup type IDs that need to be obsoleted
- Requires: `list` parameter with array of rollup type IDs

#### Mode 2: Exclusion (`mode: "exclusion"`)
Specify which rollup types to keep active using the `list` parameter; all others will be obsoleted.
- Use case: You want to obsolete multiple rollup types but keep certain ones active
- Requires: `list` parameter with array of rollup type IDs to exclude from being obsoleted

#### Mode 3: Purge (`mode: "purge"`)
Automatically obsolete all rollup types that are not currently used by any rollup.
- Use case: Clean up unused rollup types without manually tracking which ones are in use
- How it works: Fetches all rollups from AgglayerManager, identifies which rollup types are in use, and obsoletes all others
- Does not require: `list` parameter (it's automatically determined)

**Note**: You must specify exactly one `mode`: `inclusion`, `exclusion`, or `purge`.

#### Config file parameters:
  - `type`: Specify the type of transaction execution:
    - `EOA`: If executing from a wallet, the script will execute the obsolete rollup type operation on the specified network
    - `Multisig`: If executing from a multisig, the script will output the calldata of the transaction to execute
    - `Timelock`: If executing through a timelock, the script will output the execute and schedule data to send to the timelock contract
  - `mode`: Specify the operation mode (required):
    - `inclusion`: Obsolete the specific rollup types listed in `list`
    - `exclusion`: Obsolete all rollup types except those listed in `list`
    - `purge`: Obsolete all rollup types not currently used by any rollup (no `list` needed)
  - `list` (required for `inclusion` and `exclusion` modes): Array of rollup type IDs
    - For `inclusion` mode: Rollup type IDs to obsolete
    - For `exclusion` mode: Rollup type IDs to keep active (all others will be obsoleted)
    - Not used for `purge` mode
  - `deployerPvtKey (optional)`: Private key for EOA transactions (can also be set via `DEPLOYER_PRIVATE_KEY` in `.env` file - `.env` takes priority)
  - `agglayerManagerAddress`: `AgglayerManager.sol` SC address
  - `multiSendCallOnlyAddress (optional)`: Address of the MultiSendCallOnly contract (used for batching multiple transactions in Multisig mode)
  - `timelockDelay (optional)`: at least it should be the minimum delay of the timelock smart contract
  - `timelockSalt (optional)`: timelock salt
  - `maxFeePerGas`: set custom gas
  - `maxPriorityFeePerGas`: set custom gas
  - `multiplierGas`: set custom gas
- A network should be selected when running the script
  - examples: `-- sepolia` or `--mainnet`
  - This uses variables set in `hardhat.config.ts`
  - Which uses some environment variables that should be set in `.env`
> All paths are from root repository

## Usage
> All commands are done from root repository.

### Call 'obsoleteRollupType'

#### Mode 1: Inclusion Mode
Use when you want to specify exactly which rollup types to obsolete:

- Copy configuration file:
```
cp ./tools/obsoleteRollupType/obsoleteRollupType.json.example ./tools/obsoleteRollupType/obsoleteRollupType.json
```
- Set `mode` to `"inclusion"`
- Set `list` array with the rollup type IDs you want to obsolete
- Example configuration:
```json
{
  "type": "Multisig",
  "mode": "inclusion",
  "list": [1, 2, 3],
  "agglayerManagerAddress": "0x..."
}
```
- Run tool:
```
npx hardhat run ./tools/obsoleteRollupType/obsoleteRollupType.ts --network <network>
```

#### Mode 2: Exclusion Mode
Use when you want to obsolete all rollup types except specific ones:

- Copy configuration file:
```
cp ./tools/obsoleteRollupType/obsoleteRollupType.json.example ./tools/obsoleteRollupType/obsoleteRollupType.json
```
- Set `mode` to `"exclusion"`
- Set `list` array with the rollup type IDs you want to keep active
- Example configuration:
```json
{
  "type": "Multisig",
  "mode": "exclusion",
  "list": [4, 5, 6],
  "agglayerManagerAddress": "0x..."
}
```
- Run tool:
```
npx hardhat run ./tools/obsoleteRollupType/obsoleteRollupType.ts --network <network>
```

The script will automatically:
1. Fetch all rollup types from the AgglayerManager
2. Exclude those that are already obsolete
3. Exclude those in the `list`
4. Mark all remaining rollup types as obsolete

#### Mode 3: Purge Mode
Use when you want to automatically clean up all unused rollup types:

- Copy configuration file:
```
cp ./tools/obsoleteRollupType/obsoleteRollupType.json.example ./tools/obsoleteRollupType/obsoleteRollupType.json
```
- Set `mode` to `"purge"`
- No need to set `list` (it will be ignored)
- Example configuration:
```json
{
  "type": "Multisig",
  "mode": "purge",
  "agglayerManagerAddress": "0x..."
}
```
- Run tool:
```
npx hardhat run ./tools/obsoleteRollupType/obsoleteRollupType.ts --network <network>
```

The script will automatically:
1. Fetch all rollups from the AgglayerManager
2. Identify which rollup types are currently in use
3. Exclude rollup types that are already obsolete
4. Mark all unused rollup types as obsolete

### 'obsoleteRollupType' from an EOA

Running the tool, the obsoleteRollupType transaction(s) will be sent directly.

#### Private Key Configuration

For EOA type, the private key can be configured in two ways:

1. **Environment Variable** (`.env` file in root repository):
   ```
   DEPLOYER_PRIVATE_KEY=0x...
   ```

2. **JSON Configuration** (`obsoleteRollupType.json`):
   ```json
   {
     "deployerPvtKey": "0x...",
     ...
   }
   ```

**Priority**: The `.env` file takes priority over the JSON parameter. If `DEPLOYER_PRIVATE_KEY` is set in the `.env` file, it will be used regardless of the `deployerPvtKey` value in the JSON configuration.

### 'obsoleteRollupType' Multisig

- Output: Transaction(s) to obsolete the rollup type(s)

#### MultiSendCallOnly for Multiple Actions

When using `Multisig` type with multiple rollup types to obsolete, the script will automatically generate an additional `multiSendCallOnly` section in the output JSON. This allows you to batch all transactions into a single call using the MultiSendCallOnly contract.

**Output structure when multiple actions are involved:**
```json
{
  "rollupTypes": [
    // Individual transactions for each rollup type
  ],
  "multiSendCallOnly": {
    "description": "Use this to batch all transactions into a single MultiSendCallOnly call",
    "multiSendCallOnlyAddress": "0x...",  // Address from config (if provided)
    "multiSendCallData": "0x...",        // Complete calldata to call multiSend()
    "transactionCount": 3                 // Number of transactions batched
  }
}
```

**How to use:**
1. Set `multiSendCallOnlyAddress` in your config file (optional, for reference)
2. Run the script with multiple rollup types to obsolete
3. Use the `multiSendCallData` field to call the MultiSendCallOnly contract
4. This will execute all obsolete rollup type transactions in a single multisig transaction

**Benefits:**
- Reduces the number of multisig signatures required
- Atomic execution of all operations (all succeed or all fail)
- More gas efficient than individual transactions

### Generate 'obsoleteRollupType' data to the Timelock SC
- Set your parameters
- Run tool:
```
npx hardhat run ./tools/obsoleteRollupType/obsoleteRollupType.ts --network <network>
```
- Output:
  - scheduleData
  - executeData
> send data to the timelock contract address:
> - use your favourite browser extension
> - send tx to timelock address with hex data as `scheduleData`
> - wait `timelockDelay` and then send `executeData` to timelock address

