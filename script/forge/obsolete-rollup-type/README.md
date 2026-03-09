# ObsoleteRollupType Script

This Foundry script generates calldata for obsoleting rollup types in the AgglayerManager contract.

## Features

- **Three Modes**:
  - `inclusion`: Obsolete specified rollup types
  - `exclusion`: Obsolete all rollup types except specified ones
  - `purge`: Obsolete all rollup types not used by any rollup

- **Two Transaction Types**:
  - `Multisig`: Returns single calldata (or MultiSendCallOnly encoded batch)
  - `Timelock`: Returns two calldatas (scheduleBatch and executeBatch)

## Usage

### 1. Configure Input

Create or update `script/forge/obsolete-rollup-type/input.json`:

```json
{
  "1": {
    "agglayerManager": "0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2",
    "mode": "inclusion",
    "type": "Multisig",
    "list": [1, 2, 3],
    "multiSendCallOnlyAddress": "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D"
  }
}
```

#### Configuration Parameters

- `agglayerManager` (required): Address of the AgglayerManager contract
- `mode` (required): One of `"inclusion"`, `"exclusion"`, or `"purge"`
- `type` (required): One of `"Multisig"` or `"Timelock"`
- `list` (required for inclusion/exclusion): Array of rollup type IDs
- `timelockDelay` (required for Timelock type): Delay in seconds
- `timelockSalt` (optional for Timelock type): Salt for timelock operations (defaults to bytes32(0))
- `multiSendCallOnlyAddress` (optional): Address of MultiSendCallOnly contract for reference

### 2. Run the Script

```bash
forge script script/forge/obsolete-rollup-type/ObsoleteRollupType.s.sol --rpc-url $ETH_RPC_URL
```

## Examples

### Inclusion Mode - Multisig (Single Rollup Type)

```json
{
  "1": {
    "agglayerManager": "0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2",
    "mode": "inclusion",
    "type": "Multisig",
    "list": [5]
  }
}
```

Returns: Single calldata for `obsoleteRollupType(5)`

### Inclusion Mode - Multisig (Multiple Rollup Types)

```json
{
  "1": {
    "agglayerManager": "0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2",
    "mode": "inclusion",
    "type": "Multisig",
    "list": [5, 7, 9],
    "multiSendCallOnlyAddress": "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D"
  }
}
```

Returns: MultiSendCallOnly encoded batch calldata

### Exclusion Mode - Timelock

```json
{
  "1": {
    "agglayerManager": "0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2",
    "mode": "exclusion",
    "type": "Timelock",
    "list": [1, 2],
    "timelockDelay": 86400,
    "timelockSalt": "0x0000000000000000000000000000000000000000000000000000000000000001"
  }
}
```

Returns: Two calldatas (scheduleBatch and executeBatch) to obsolete all rollup types except 1 and 2

### Purge Mode - Multisig

```json
{
  "1": {
    "agglayerManager": "0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2",
    "mode": "purge",
    "type": "Multisig"
  }
}
```

Returns: Calldata to obsolete all unused rollup types

## Output

The script returns `bytes[]`:

- **Multisig type**: Array with 1 element (calldata to execute via Gnosis Safe)
- **Timelock type**: Array with 2 elements (scheduleBatch calldata, executeBatch calldata)

The script also logs detailed information to the console:

- Input configuration
- Rollup types processing logic
- Final calldata output

## Testing

### Run Tests

```bash
forge test --match-contract ObsoleteRollupTypeTest -vv
```

## Notes

- The script queries the AgglayerManager contract on-chain to determine which rollup types exist and which are already obsolete
- All modes automatically filters out already obsolete rollup types
- MultiSendCallOnly encoding follows the Gnosis Safe specification
