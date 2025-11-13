# IPolygonZkEVMErrors
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/interfaces/IPolygonZkEVMErrors.sol)


## Errors
### PendingStateTimeoutExceedHaltAggregationTimeout
*Thrown when the pending state timeout exceeds the _HALT_AGGREGATION_TIMEOUT*


```solidity
error PendingStateTimeoutExceedHaltAggregationTimeout();
```

### TrustedAggregatorTimeoutExceedHaltAggregationTimeout
*Thrown when the trusted aggregator timeout exceeds the _HALT_AGGREGATION_TIMEOUT*


```solidity
error TrustedAggregatorTimeoutExceedHaltAggregationTimeout();
```

### OnlyAdmin
*Thrown when the caller is not the admin*


```solidity
error OnlyAdmin();
```

### OnlyTrustedSequencer
*Thrown when the caller is not the trusted sequencer*


```solidity
error OnlyTrustedSequencer();
```

### OnlyTrustedAggregator
*Thrown when the caller is not the trusted aggregator*


```solidity
error OnlyTrustedAggregator();
```

### SequenceZeroBatches
*Thrown when attempting to sequence 0 batches*


```solidity
error SequenceZeroBatches();
```

### ExceedMaxVerifyBatches
*Thrown when attempting to sequence or verify more batches than _MAX_VERIFY_BATCHES*


```solidity
error ExceedMaxVerifyBatches();
```

### ForcedDataDoesNotMatch
*Thrown when the forced data does not match*


```solidity
error ForcedDataDoesNotMatch();
```

### SequencedTimestampBelowForcedTimestamp
*Thrown when the sequenced timestamp is below the forced minimum timestamp*


```solidity
error SequencedTimestampBelowForcedTimestamp();
```

### GlobalExitRootNotExist
*Thrown when a global exit root is not zero and does not exist*


```solidity
error GlobalExitRootNotExist();
```

### TransactionsLengthAboveMax
*Thrown when transactions array length is above _MAX_TRANSACTIONS_BYTE_LENGTH.*


```solidity
error TransactionsLengthAboveMax();
```

### SequencedTimestampInvalid
*Thrown when a sequenced timestamp is not inside a correct range.*


```solidity
error SequencedTimestampInvalid();
```

### ForceBatchesOverflow
*Thrown when there are more sequenced force batches than were actually submitted, should be unreachable*


```solidity
error ForceBatchesOverflow();
```

### TrustedAggregatorTimeoutNotExpired
*Thrown when there are more sequenced force batches than were actually submitted*


```solidity
error TrustedAggregatorTimeoutNotExpired();
```

### PendingStateDoesNotExist
*Thrown when attempting to access a pending state that does not exist*


```solidity
error PendingStateDoesNotExist();
```

### InitNumBatchDoesNotMatchPendingState
*Thrown when the init num batch does not match with the one in the pending state*


```solidity
error InitNumBatchDoesNotMatchPendingState();
```

### OldStateRootDoesNotExist
*Thrown when the old state root of a certain batch does not exist*


```solidity
error OldStateRootDoesNotExist();
```

### InitNumBatchAboveLastVerifiedBatch
*Thrown when the init verification batch is above the last verification batch*


```solidity
error InitNumBatchAboveLastVerifiedBatch();
```

### FinalNumBatchBelowLastVerifiedBatch
*Thrown when the final verification batch is below or equal the last verification batch*


```solidity
error FinalNumBatchBelowLastVerifiedBatch();
```

### InvalidProof
*Thrown when the zkproof is not valid*


```solidity
error InvalidProof();
```

### PendingStateNotConsolidable
*Thrown when attempting to consolidate a pending state not yet consolidable*


```solidity
error PendingStateNotConsolidable();
```

### PendingStateInvalid
*Thrown when attempting to consolidate a pending state that is already consolidated or does not exist*


```solidity
error PendingStateInvalid();
```

### NotEnoughMaticAmount
*Thrown when the matic amount is below the necessary matic fee*


```solidity
error NotEnoughMaticAmount();
```

### ForceBatchTimeoutNotExpired
*Thrown when attempting to sequence a force batch using sequenceForceBatches and the
force timeout did not expire*


```solidity
error ForceBatchTimeoutNotExpired();
```

### NewTrustedAggregatorTimeoutMustBeLower
*Thrown when attempting to set a new trusted aggregator timeout equal or bigger than current one*


```solidity
error NewTrustedAggregatorTimeoutMustBeLower();
```

### NewPendingStateTimeoutMustBeLower
*Thrown when attempting to set a new pending state timeout equal or bigger than current one*


```solidity
error NewPendingStateTimeoutMustBeLower();
```

### InvalidRangeMultiplierBatchFee
*Thrown when attempting to set a new multiplier batch fee in a invalid range of values*


```solidity
error InvalidRangeMultiplierBatchFee();
```

### InvalidRangeBatchTimeTarget
*Thrown when attempting to set a batch time target in an invalid range of values*


```solidity
error InvalidRangeBatchTimeTarget();
```

### InvalidRangeForceBatchTimeout
*Thrown when attempting to set a force batch timeout in an invalid range of values*


```solidity
error InvalidRangeForceBatchTimeout();
```

### OnlyPendingAdmin
*Thrown when the caller is not the pending admin*


```solidity
error OnlyPendingAdmin();
```

### FinalPendingStateNumInvalid
*Thrown when the final pending state num is not in a valid range*


```solidity
error FinalPendingStateNumInvalid();
```

### FinalNumBatchDoesNotMatchPendingState
*Thrown when the final num batch does not match with the one in the pending state*


```solidity
error FinalNumBatchDoesNotMatchPendingState();
```

### StoredRootMustBeDifferentThanNewRoot
*Thrown when the stored root matches the new root proving a different state*


```solidity
error StoredRootMustBeDifferentThanNewRoot();
```

### BatchAlreadyVerified
*Thrown when the batch is already verified when attempting to activate the emergency state*


```solidity
error BatchAlreadyVerified();
```

### BatchNotSequencedOrNotSequenceEnd
*Thrown when the batch is not sequenced or not at the end of a sequence when attempting to activate the emergency state*


```solidity
error BatchNotSequencedOrNotSequenceEnd();
```

### HaltTimeoutNotExpired
*Thrown when the halt timeout is not expired when attempting to activate the emergency state*


```solidity
error HaltTimeoutNotExpired();
```

### OldAccInputHashDoesNotExist
*Thrown when the old accumulate input hash does not exist*


```solidity
error OldAccInputHashDoesNotExist();
```

### NewAccInputHashDoesNotExist
*Thrown when the new accumulate input hash does not exist*


```solidity
error NewAccInputHashDoesNotExist();
```

### NewStateRootNotInsidePrime
*Thrown when the new state root is not inside prime*


```solidity
error NewStateRootNotInsidePrime();
```

### ForceBatchNotAllowed
*Thrown when force batch is not allowed*


```solidity
error ForceBatchNotAllowed();
```

### ForceBatchesAlreadyActive
*Thrown when try to activate force batches when they are already active*


```solidity
error ForceBatchesAlreadyActive();
```

