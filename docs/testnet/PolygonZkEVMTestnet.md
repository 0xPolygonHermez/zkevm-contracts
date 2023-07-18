Contract responsible for managing the state and the updates of the L2 network
This contract will NOT BE USED IN PRODUCTION, will be used only in testnet environment


## Functions
### constructor
```solidity
  function constructor(
    contract IPolygonZkEVMGlobalExitRoot _globalExitRootManager,
    contract IERC20Upgradeable _matic,
    contract IVerifierRollup _rollupVerifier,
    contract IPolygonZkEVMBridge _bridgeAddress,
    uint64 _chainID
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IPolygonZkEVMGlobalExitRoot | Global exit root manager address
|`_matic` | contract IERC20Upgradeable | MATIC token address
|`_rollupVerifier` | contract IVerifierRollup | Rollup verifier address
|`_bridgeAddress` | contract IPolygonZkEVMBridge | Bridge address
|`_chainID` | uint64 | L2 chainID

### forceBatch
```solidity
  function forceBatch(
  ) public
```




### sequenceForceBatches
```solidity
  function sequenceForceBatches(
  ) external
```




### getForceBatchTimeout
```solidity
  function getForceBatchTimeout(
  ) public returns (uint64)
```




### setForceBatchTimeout
```solidity
  function setForceBatchTimeout(
    uint64 newforceBatchTimeout
  ) public
```
Set new forcedBatchTimeout


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newforceBatchTimeout` | uint64 | new forced batches timeout

### setForcedBatchesAllowed
```solidity
  function setForcedBatchesAllowed(
    uint256 newForcedBatchesAllowed
  ) public
```
Set new forced batches allowed
Defined as a uint256 because it will be easy to upgrade afterwards


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newForcedBatchesAllowed` | uint256 | new forced batches allowed

