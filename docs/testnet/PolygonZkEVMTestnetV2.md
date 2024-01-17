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

### updateVersion
```solidity
  function updateVersion(
    string _versionString
  ) public
```
Update version of the zkEVM


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_versionString` | string | New version string

