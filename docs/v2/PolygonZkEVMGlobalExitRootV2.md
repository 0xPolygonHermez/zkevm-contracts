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
|`_rollupManager` | address | Rollup contract address
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
Computes and returns the merkle root



## Events
### UpdateGlobalExitRoot
```solidity
  event UpdateGlobalExitRoot(
  )
```

Emitted when the global exit root is updated

