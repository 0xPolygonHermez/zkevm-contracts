# IPolygonZkEVMEtrogErrors
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/interfaces/IPolygonZkEVMEtrogErrors.sol)

**Inherits:**
[IPolygonZkEVMErrors](/contracts/interfaces/IPolygonZkEVMErrors.sol/interface.IPolygonZkEVMErrors.md)


## Errors
### OnlyRollupManager
*Thrown when the caller is not the trusted sequencer*


```solidity
error OnlyRollupManager();
```

### NotEnoughPOLAmount
*Thrown when the caller is not the trusted sequencer*


```solidity
error NotEnoughPOLAmount();
```

### InvalidInitializeTransaction
*Thrown when the caller is not the trusted sequencer*


```solidity
error InvalidInitializeTransaction();
```

### GasTokenNetworkMustBeZeroOnEther
*Thrown when the caller is not the trusted sequencer*


```solidity
error GasTokenNetworkMustBeZeroOnEther();
```

### HugeTokenMetadataNotSupported
*Thrown when the try to initialize with a gas token with huge metadata*


```solidity
error HugeTokenMetadataNotSupported();
```

### ForceBatchesNotAllowedOnEmergencyState
*Thrown when trying force a batch during emergency state*


```solidity
error ForceBatchesNotAllowedOnEmergencyState();
```

### HaltTimeoutNotExpiredAfterEmergencyState
*Thrown when the try to sequence force batches before the halt timeout period*


```solidity
error HaltTimeoutNotExpiredAfterEmergencyState();
```

### ForceBatchesDecentralized
*Thrown when the try to update the force batch address once is set to address(0)*


```solidity
error ForceBatchesDecentralized();
```

### InitSequencedBatchDoesNotMatch
*Thrown when the last sequenced batch nmber does not match the init sequeced batch number*


```solidity
error InitSequencedBatchDoesNotMatch();
```

### MaxTimestampSequenceInvalid
*Thrown when the max timestamp is out of range*


```solidity
error MaxTimestampSequenceInvalid();
```

### L1InfoTreeLeafCountInvalid
*Thrown when l1 info tree leafCount does not exist*


```solidity
error L1InfoTreeLeafCountInvalid();
```

### FinalAccInputHashDoesNotMatch
*Thrown when the acc input hash does not match the predicted by the sequencer*


```solidity
error FinalAccInputHashDoesNotMatch();
```

