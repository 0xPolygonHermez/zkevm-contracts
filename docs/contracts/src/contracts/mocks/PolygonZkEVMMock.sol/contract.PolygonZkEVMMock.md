# PolygonZkEVMMock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/mocks/PolygonZkEVMMock.sol)

**Inherits:**
[PolygonZkEVM](/contracts/PolygonZkEVM.sol/contract.PolygonZkEVM.md)

Contract responsible for managing the state and the updates of the L2 network
There will be sequencer, which are able to send transactions. That transactions will be stored in the contract.
The aggregators are forced to process and validate the sequencers transactions in the same order by using a verifier.
To enter and exit of the L2 network will be used a PolygonZkEVM Bridge smart contract


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


### calculateAccInputHash

calculate accumulate input hash from parameters


```solidity
function calculateAccInputHash(
    bytes32 currentAccInputHash,
    bytes memory transactions,
    bytes32 globalExitRoot,
    uint64 timestamp,
    address sequencerAddress
) public pure returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`currentAccInputHash`|`bytes32`|Accumulate input hash|
|`transactions`|`bytes`|Transactions|
|`globalExitRoot`|`bytes32`|Global Exit Root|
|`timestamp`|`uint64`|Timestamp|
|`sequencerAddress`|`address`|Sequencer address|


### getNextSnarkInput

Return the next snark input


```solidity
function getNextSnarkInput(
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot
) public view returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pendingStateNum`|`uint64`|Pending state num|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`| New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|


### setStateRoot

Set state root


```solidity
function setStateRoot(bytes32 newStateRoot, uint64 batchNum) public onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newStateRoot`|`bytes32`|New State root ¡|
|`batchNum`|`uint64`||


### setVerifiedBatch

Set Sequencer


```solidity
function setVerifiedBatch(uint64 _numBatch) public onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_numBatch`|`uint64`|New verifier|


### setSequencedBatch

Set Sequencer


```solidity
function setSequencedBatch(uint64 _numBatch) public onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_numBatch`|`uint64`|New verifier|


### setNetworkName

Set network name


```solidity
function setNetworkName(string memory _networkName) public onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_networkName`|`string`|New verifier|


### updateBatchFee

Update fee mock function


```solidity
function updateBatchFee(uint64 newLastVerifiedBatch) public onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newLastVerifiedBatch`|`uint64`|New last verified batch|


### setSequencedBatches

Set sequencedBatches


```solidity
function setSequencedBatches(
    uint64 batchNum,
    bytes32 accInputData,
    uint64 timestamp,
    uint64 lastPendingStateConsolidated
) public onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`batchNum`|`uint64`|bathc num|
|`accInputData`|`bytes32`|accInputData|
|`timestamp`|`uint64`||
|`lastPendingStateConsolidated`|`uint64`||


### trustedVerifyBatchesMock

Allows an aggregator to verify multiple batches


```solidity
function trustedVerifyBatchesMock(
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    uint256[2] calldata proofA,
    uint256[2][2] calldata proofB,
    uint256[2] calldata proofC
) public onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pendingStateNum`|`uint64`||
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`| New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|
|`proofA`|`uint256[2]`|zk-snark input|
|`proofB`|`uint256[2][2]`|zk-snark input|
|`proofC`|`uint256[2]`|zk-snark input|


