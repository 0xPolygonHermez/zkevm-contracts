# PolygonZkEVMTestnetV2
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/previousVersions/testnet/PolygonZkEVMTestnetV2.sol)

**Inherits:**
[PolygonZkEVM](/contracts/previousVersions/PolygonZkEVM.sol/contract.PolygonZkEVM.md)

Contract responsible for managing the state and the updates of the L2 network
This contract will NOT BE USED IN PRODUCTION, will be used only in testnet environment


## State Variables
### version

```solidity
uint256 public version
```


## Functions
### constructor


```solidity
constructor(
    IPolygonZkEVMGlobalExitRoot _globalExitRootManager,
    IERC20Upgradeable _matic,
    IVerifierRollup _rollupVerifier,
    IPolygonZkEVMBridge _bridgeAddress,
    uint64 _chainID,
    uint64 _forkID
) PolygonZkEVM(_globalExitRootManager, _matic, _rollupVerifier, _bridgeAddress, _chainID, _forkID);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IPolygonZkEVMGlobalExitRoot`|Global exit root manager address|
|`_matic`|`IERC20Upgradeable`|MATIC token address|
|`_rollupVerifier`|`IVerifierRollup`|Rollup verifier address|
|`_bridgeAddress`|`IPolygonZkEVMBridge`|Bridge address|
|`_chainID`|`uint64`|L2 chainID|
|`_forkID`|`uint64`||


### updateVersion

Update version of the zkEVM


```solidity
function updateVersion(string memory _versionString) public;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_versionString`|`string`|New version string|


## Errors
### VersionAlreadyUpdated
Thrown when try to update version when it's already updated


```solidity
error VersionAlreadyUpdated();
```

