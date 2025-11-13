# PolygonValidiumEtrog
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/consensus/validium/PolygonValidiumEtrog.sol)

**Inherits:**
[PolygonRollupBaseEtrog](/contracts/v2/lib/PolygonRollupBaseEtrog.sol/abstract.PolygonRollupBaseEtrog.md), [IPolygonValidium](/contracts/v2/interfaces/IPolygonValidium.sol/interface.IPolygonValidium.md)

Contract responsible for managing the states and the updates of L2 network.
There will be a trusted sequencer, which is able to send transactions.
Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.
It is advised to use timelocks for the admin address in case of Validium since if can change the dataAvailabilityProtocol


## State Variables
### dataAvailabilityProtocol

```solidity
IDataAvailabilityProtocol public dataAvailabilityProtocol;
```


### isSequenceWithDataAvailabilityAllowed

```solidity
bool public isSequenceWithDataAvailabilityAllowed;
```


## Functions
### constructor


```solidity
constructor(
    IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
    IERC20Upgradeable _pol,
    IPolygonZkEVMBridgeV2 _bridgeAddress,
    PolygonRollupManager _rollupManager
) PolygonRollupBaseEtrog(_globalExitRootManager, _pol, _bridgeAddress, _rollupManager);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IPolygonZkEVMGlobalExitRootV2`|Global exit root manager address|
|`_pol`|`IERC20Upgradeable`|POL token address|
|`_bridgeAddress`|`IPolygonZkEVMBridgeV2`|Bridge address|
|`_rollupManager`|`PolygonRollupManager`|Global exit root manager address|


### sequenceBatchesValidium

Allows a sequencer to send multiple batches


```solidity
function sequenceBatchesValidium(
    ValidiumBatchData[] calldata batches,
    uint32 l1InfoTreeLeafCount,
    uint64 maxSequenceTimestamp,
    bytes32 expectedFinalAccInputHash,
    address l2Coinbase,
    bytes calldata dataAvailabilityMessage
) external onlyTrustedSequencer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`batches`|`ValidiumBatchData[]`|Struct array which holds the necessary data to append new batches to the sequence|
|`l1InfoTreeLeafCount`|`uint32`|Count of the L1InfoTree leaf that will be used in this sequence|
|`maxSequenceTimestamp`|`uint64`|Max timestamp of the sequence. This timestamp must be inside a safety range (actual + 36 seconds). This timestamp should be equal or higher of the last block inside the sequence, otherwise this batch will be invalidated by circuit.|
|`expectedFinalAccInputHash`|`bytes32`|This parameter must match the acc input hash after hash all the batch data This will be a protection for the sequencer to avoid sending undesired data|
|`l2Coinbase`|`address`|Address that will receive the fees from L2|
|`dataAvailabilityMessage`|`bytes`|Byte array containing the signatures and all the addresses of the committee in ascending order [signature 0, ..., signature requiredAmountOfSignatures -1, address 0, ... address N] note that each ECDSA signatures are used, therefore each one must be 65 bytes note Pol is not a reentrant token|


### sequenceBatches

Allows a sequencer to send multiple batches


```solidity
function sequenceBatches(
    BatchData[] calldata batches,
    uint32 l1InfoTreeLeafCount,
    uint64 maxSequenceTimestamp,
    bytes32 expectedFinalAccInputHash,
    address l2Coinbase
) public override;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`batches`|`BatchData[]`|Struct array which holds the necessary data to append new batches to the sequence|
|`l1InfoTreeLeafCount`|`uint32`|Count of the L1InfoTree leaf that will be used in this sequence|
|`maxSequenceTimestamp`|`uint64`|Max timestamp of the sequence. This timestamp must be inside a safety range (actual + 36 seconds). This timestamp should be equal or higher of the last block inside the sequence, otherwise this batch will be invalidated by circuit.|
|`expectedFinalAccInputHash`|`bytes32`|This parameter must match the acc input hash after hash all the batch data This will be a protection for the sequencer to avoid sending undesired data|
|`l2Coinbase`|`address`|Address that will receive the fees from L2 note Pol is not a reentrant token|


### setDataAvailabilityProtocol

Allow the admin to set a new data availability protocol


```solidity
function setDataAvailabilityProtocol(IDataAvailabilityProtocol newDataAvailabilityProtocol) external onlyAdmin;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newDataAvailabilityProtocol`|`IDataAvailabilityProtocol`|Address of the new data availability protocol|


### switchSequenceWithDataAvailability

Allow the admin to switch the sequence with data availability


```solidity
function switchSequenceWithDataAvailability(bool newIsSequenceWithDataAvailabilityAllowed) external onlyAdmin;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newIsSequenceWithDataAvailabilityAllowed`|`bool`|Boolean to switch|


## Events
### SetDataAvailabilityProtocol
*Emitted when the admin updates the data availability protocol*


```solidity
event SetDataAvailabilityProtocol(address newDataAvailabilityProtocol);
```

### SwitchSequenceWithDataAvailability
*Emitted when switch the ability to sequence with data availability*


```solidity
event SwitchSequenceWithDataAvailability();
```

## Structs
### ValidiumBatchData
Struct which will be used to call sequenceBatches


```solidity
struct ValidiumBatchData {
    bytes32 transactionsHash;
    bytes32 forcedGlobalExitRoot;
    uint64 forcedTimestamp;
    bytes32 forcedBlockHashL1;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`transactionsHash`|`bytes32`|keccak256 hash of the L2 ethereum transactions EIP-155 or pre-EIP-155 with signature: EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s pre-EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data) || v || r || s|
|`forcedGlobalExitRoot`|`bytes32`|Global exit root, empty when sequencing a non forced batch|
|`forcedTimestamp`|`uint64`|Minimum timestamp of the force batch data, empty when sequencing a non forced batch|
|`forcedBlockHashL1`|`bytes32`|blockHash snapshot of the force batch data, empty when sequencing a non forced batch|

