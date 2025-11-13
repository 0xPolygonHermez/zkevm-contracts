# PolygonZkEVMUpgraded
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/mainnetUpgraded/PolygonZkEVMUpgraded.sol)

**Inherits:**
[PolygonZkEVM](/contracts/PolygonZkEVM.sol/contract.PolygonZkEVM.md)

Contract responsible for managing the state and the updates of the L2 network


## State Variables
### VERSION_BEFORE_UPGRADE

```solidity
uint256 public immutable VERSION_BEFORE_UPGRADE;
```


### version

```solidity
uint256 public version;
```


### lastVerifiedBatchBeforeUpgrade

```solidity
uint256 public lastVerifiedBatchBeforeUpgrade;
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
    uint64 _forkID,
    uint256 versionBeforeUpgrade
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
|`versionBeforeUpgrade`|`uint256`||


### updateVersion

Update version of the zkEVM


```solidity
function updateVersion(string memory _versionString) public;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_versionString`|`string`|New version string|


### _proveDistinctPendingState

Internal function that proves a different state root given the same batches to verify


```solidity
function _proveDistinctPendingState(
    uint64 initPendingStateNum,
    uint64 finalPendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32[24] calldata proof
) internal view override;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`initPendingStateNum`|`uint64`|Init pending state, 0 if consolidated state is used|
|`finalPendingStateNum`|`uint64`|Final pending state, that will be used to compare with the newStateRoot|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`| New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|
|`proof`|`bytes32[24]`|fflonk proof|


### _verifyAndRewardBatches

Verify and reward batches internal function


```solidity
function _verifyAndRewardBatches(
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32[24] calldata proof
) internal override;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pendingStateNum`|`uint64`|Init pending state, 0 if consolidated state is used|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`| New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|
|`proof`|`bytes32[24]`|fflonk proof|


## Errors
### VersionAlreadyUpdated
*Thrown when try to update version when it's already updated*


```solidity
error VersionAlreadyUpdated();
```

### InitBatchMustMatchCurrentForkID
*Thrown when try to proof a non deterministic state using a verified batch from previous forkIDs*


```solidity
error InitBatchMustMatchCurrentForkID();
```

