Contract responsible for managing the exit roots across multiple networks


## Functions
### constructor
```solidity
  function constructor(
    address _rollupManager,
    address _bridgeAddress
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_rollupManager` | address | Rollup manager contract address
|`_bridgeAddress` | address | PolygonZkEVMBridge contract address

### updateExitRoot
```solidity
  function updateExitRoot(
    bytes32 newRoot
  ) external
```
Update the exit root of one of the networks and the global exit root


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newRoot` | bytes32 | new exit tree root

### getLastGlobalExitRoot
```solidity
  function getLastGlobalExitRoot(
  ) public returns (bytes32)
```
Return last global exit root



### getRoot
```solidity
  function getRoot(
  ) public returns (bytes32)
```
Computes and returns the merkle root of the L1InfoTree



### getLeafValue
```solidity
  function getLeafValue(
    bytes32 newGlobalExitRoot,
    uint256 lastBlockHash,
    uint64 timestamp
  ) public returns (bytes32)
```
Given the leaf data returns the leaf hash


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newGlobalExitRoot` | bytes32 | Last global exit root
|`lastBlockHash` | uint256 | Last accesible block hash
|`timestamp` | uint64 | Ethereum timestamp in seconds

## Events
### UpdateL1InfoTree
```solidity
  event UpdateL1InfoTree(
  )
```

Emitted when the global exit root is updated

