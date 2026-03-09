## Check Scripts

Utility scripts for inspecting on-chain deployments and timelock payloads. Each script is intended for external usage and prints human‑readable results. Outputs that are written to disk include an ISO‑8601 timestamp in the filename.

### Scripts

- **checkDeploymentVaultTokens.ts**
  - **Purpose**: Correlate deployment transactions with artifacts, decode constructor args, and summarize deployed contracts. Also decodes selected upgrade transactions for token proxies.
  - **What it does**: Loads Hardhat artifacts, matches bytecode for given deployment tx hashes, decodes constructor parameters and, if a proxy, attempts to decode the initializer payload. Optionally fetches ERC‑20 metadata. Writes a JSON report.
  - **How to run**:
    ```bash
    npx hardhat run tools/checkScripts/checkDeploymentVaultTokens.ts --network <networkName>
    ```
  - **Inputs/parameters**:
    - Edit `deployedTxHashes` (array of tx hashes) in the script.
    - Optionally adjust `initializeAbis` for initializer decoding and `upgradeTokenTxs` for upgrade decoding.
  - **Outputs**: Writes `deployed_contracts_info__<ISO_TIMESTAMP>.json` in the same directory.

- **checkImplementations.ts**
  - **Purpose**: Identify a deployed contract’s artifact and decode constructor parameters by comparing init code with local artifacts.
  - **What it does**: Fetches the creation transaction and compares trimmed bytecode against artifacts, then decodes constructor args if present. Prints results to stdout.
  - **How to run**:
    ```bash
    npx hardhat run tools/checkScripts/checkImplementations.ts --network <networkName>
    ```
  - **Inputs/parameters**:
    - Edit `address` (deployed contract address) and `deployedTxHash` (creation tx hash) at the top of the script.
  - **Outputs**: Console only.

- **timelockDecoder.ts**
  - **Purpose**: Decode `TimelockController` schedule/execute payloads and their nested calls for easier auditing.
  - **What it does**: Parses `schedule`/`scheduleBatch` and `execute`/`executeBatch`, ensures targets/values/data match, then recursively decodes inner calls using a list of contract factories. Prints a labeled, indented tree to stdout.
  - **How to run**:
    ```bash
    npx hardhat run tools/checkScripts/timelockDecoder.ts --network <networkName>
    ```
  - **Inputs/parameters**:
    - Edit `scheduleData` and `executeData` (hex calldata strings).
    - Update `contractAddressMap` to map known addresses to names.
    - Update `contractFactories` with factories available in your workspace to improve decoding coverage.
  - **Outputs**: Console only.


