# Get LBT (Local Balance Tree)

Script to fetch and process `NewWrappedToken` events from a deployed bridge contract, and generate initialization data for LBT.

The script queries the blockchain for `NewWrappedToken` events emitted by the given contract.

For each wrapped token found, it retrieves its `totalSupply` and creates an output file (`initializeLBT-{date}.json`) ready to be used for LBT initialization.

Optionally, it can reuse a previously fetched set of events from a local file (`events.json`), avoiding on-chain queries.

---

## Setup

### 1. Install packages
- install packages
```
npm i
```

- Set env variables
````
cp .env.example .env
````

Fill `.env` with your `INFURA_PROJECT_ID` and `ETHERSCAN_API_KEY`

- Copy configuration files:
```
cp ./tools/getLBT/parameters.json.example ./tools/getLBT/parameters.json
```

-  Set your parameters -> parameters.json:

    - `contractName`: Name of the contract to interact with (e.g. PolygonZkEVMBridgeV2Pessimistic).
    - `contractAddress`: Bridge contract address.
Optional:
    - `blockRange`: Number of blocks per query batch. Default: 100000.
    - `printEvents`: boolean. If true, writes intermediate event data to events.
    - `getEventsFromFile`: boolean. If true, reads events from events.json instead of fetching from the chain.

-  Run tool:
```
npx hardhat run ./tools/getLBT/getLBT.ts --network <network>
```


- Output Files

    - events.json → Contains raw NewWrappedToken events fetched from the blockchain.
    - events-{date}.json → Contains enriched events including totalSupply.
    - initializeLBT-{date}.json → Contains the final structured data:
    ```
    {
        "originNetwork": [...],
        "originTokenAddress": [...],
        "totalSupply": [...]
    }
    ```