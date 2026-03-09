# Import OpenZeppelin Info From Tag

Tool to generate OpenZeppelin manifest files from a specific git tag of the agglayer-contracts repository. This is needed for upgrades of contracts that were deployed in L2 genesis (where no OZ manifest exists).

## Purpose

When upgrading contracts like `PolygonZkEVMBridgeV2` and `PolygonZkEVMGlobalExitRootL2` that were deployed in the genesis of an L2 network, no OpenZeppelin network manifest file exists. This tool:

1. Clones the agglayer-contracts repo at a specific tag
2. Compiles the contracts from that version
3. Force imports the deployed contracts into OpenZeppelin's upgrade system
4. Generates the manifest files needed for safe upgrades

## Files

- `import_oz_info_from_tag.sh`: Main script that orchestrates the manifest generation
- `force_import_old_contracts.ts`: Hardhat script that force imports the bridge and GER contracts
- `import_params.json`: Configuration with contract addresses to import
- `import_params.json.example`: Example configuration file

## Configuration

Copy and update `import_params.json` with the deployed contract addresses:

```bash
cp ./tools/importOZInfoFromTag/import_params.json.example ./tools/importOZInfoFromTag/import_params.json
```

```json
{
    "bridgeL2Address": "0x..."
}
```

## Usage

Run from the project root:

```bash
./tools/importOZInfoFromTag/import_oz_info_from_tag.sh --tag <git-tag> --url <rpc-url>
```

### Parameters

- `--tag`: Git tag of the agglayer-contracts repository (e.g., `v4.0.0-fork.7`)
- `--url`: L2 RPC URL for the target network

### Example

```bash
./tools/importOZInfoFromTag/import_oz_info_from_tag.sh --tag v4.0.0-fork.7 --url https://rpc.example.com
```

## Output

The script generates manifest files in:

```
upgrade/upgradeEtrogSovereign/manifest-from-<tag>/
```

These files should be copied to `.openzeppelin/` before running upgrade scripts.

## Related

This tool is used by the upgrade scripts in `upgrade/upgradeEtrogSovereign/`. See that folder's README for the full upgrade process.
