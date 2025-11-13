# IPolygonRollupManager
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/interfaces/IPolygonRollupManager.sol)


## Functions
### addNewRollupType


```solidity
function addNewRollupType(
    address consensusImplementation,
    address verifier,
    uint64 forkID,
    VerifierType rollupVerifierType,
    bytes32 initRoot,
    string memory description,
    bytes32 programVKey
) external;
```

### obsoleteRollupType


```solidity
function obsoleteRollupType(uint32 rollupTypeID) external;
```

### attachAggchainToAL


```solidity
function attachAggchainToAL(uint32 rollupTypeID, uint64 chainID, bytes memory initializeBytesAggchain) external;
```

### addExistingRollup


```solidity
function addExistingRollup(
    address rollupAddress,
    address verifier,
    uint64 forkID,
    uint64 chainID,
    bytes32 initRoot,
    VerifierType rollupVerifierType,
    bytes32 programVKey,
    bytes32 initPessimisticRoot
) external;
```

### updateRollupByRollupAdmin


```solidity
function updateRollupByRollupAdmin(ITransparentUpgradeableProxy rollupContract, uint32 newRollupTypeID) external;
```

### updateRollup


```solidity
function updateRollup(ITransparentUpgradeableProxy rollupContract, uint32 newRollupTypeID, bytes memory upgradeData)
    external;
```

### rollbackBatches


```solidity
function rollbackBatches(IPolygonRollupBase rollupContract, uint64 targetBatch) external;
```

### onSequenceBatches


```solidity
function onSequenceBatches(uint64 newSequencedBatches, bytes32 newAccInputHash) external returns (uint64);
```

### verifyBatchesTrustedAggregator


```solidity
function verifyBatchesTrustedAggregator(
    uint32 rollupID,
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    address beneficiary,
    bytes32[24] calldata proof
) external;
```

### verifyPessimisticTrustedAggregator


```solidity
function verifyPessimisticTrustedAggregator(
    uint32 rollupID,
    uint32 l1InfoTreeLeafCount,
    bytes32 newLocalExitRoot,
    bytes32 newPessimisticRoot,
    bytes calldata proof,
    bytes memory aggchainData
) external;
```

### activateEmergencyState


```solidity
function activateEmergencyState() external;
```

### deactivateEmergencyState


```solidity
function deactivateEmergencyState() external;
```

### setBatchFee


```solidity
function setBatchFee(uint256 newBatchFee) external;
```

### getRollupExitRoot


```solidity
function getRollupExitRoot() external view returns (bytes32);
```

### getLastVerifiedBatch


```solidity
function getLastVerifiedBatch(uint32 rollupID) external view returns (uint64);
```

### calculateRewardPerBatch


```solidity
function calculateRewardPerBatch() external view returns (uint256);
```

### getBatchFee


```solidity
function getBatchFee() external view returns (uint256);
```

### getForcedBatchFee


```solidity
function getForcedBatchFee() external view returns (uint256);
```

### getInputPessimisticBytes


```solidity
function getInputPessimisticBytes(
    uint32 rollupID,
    bytes32 selectedGlobalExitRoot,
    bytes32 newLocalExitRoot,
    bytes32 newPessimisticRoot,
    bytes memory aggchainData
) external view returns (bytes memory);
```

### getInputSnarkBytes


```solidity
function getInputSnarkBytes(
    uint32 rollupID,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 oldStateRoot,
    bytes32 newStateRoot
) external view returns (bytes memory);
```

### getRollupBatchNumToStateRoot


```solidity
function getRollupBatchNumToStateRoot(uint32 rollupID, uint64 batchNum) external view returns (bytes32);
```

### lastDeactivatedEmergencyStateTimestamp


```solidity
function lastDeactivatedEmergencyStateTimestamp() external view returns (uint64);
```

## Errors
### UpdateToSameRollupTypeID
*Thrown when sender is not the PolygonZkEVM address*


```solidity
error UpdateToSameRollupTypeID();
```

### RollupMustExist
*Thrown when sender is not the PolygonZkEVM address*


```solidity
error RollupMustExist();
```

### SenderMustBeRollup
*Thrown when sender is not the PolygonZkEVM address*


```solidity
error SenderMustBeRollup();
```

### TrustedAggregatorTimeoutNotExpired
*Thrown when sender is not the PolygonZkEVM address*


```solidity
error TrustedAggregatorTimeoutNotExpired();
```

### ExceedMaxVerifyBatches
*Thrown when sender is not the PolygonZkEVM address*


```solidity
error ExceedMaxVerifyBatches();
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

### ChainIDAlreadyExist
*Thrown when the caller is not the pending admin*


```solidity
error ChainIDAlreadyExist();
```

### MustSequenceSomeBatch
*Thrown when the caller is not the pending admin*


```solidity
error MustSequenceSomeBatch();
```

### RollupTypeDoesNotExist
*When a rollup type does not exist*


```solidity
error RollupTypeDoesNotExist();
```

### RollupTypeObsolete
*When a rollup type does not exist*


```solidity
error RollupTypeObsolete();
```

### InitBatchMustMatchCurrentForkID
*When a rollup type does not exist*


```solidity
error InitBatchMustMatchCurrentForkID();
```

### UpdateNotCompatible
*When a rollup type does not exist*


```solidity
error UpdateNotCompatible();
```

### BatchFeeOutOfRange
*When a rollup type does not exist*


```solidity
error BatchFeeOutOfRange();
```

### AllzkEVMSequencedBatchesMustBeVerified
*When a rollup type does not exist*


```solidity
error AllzkEVMSequencedBatchesMustBeVerified();
```

### RollupAddressAlreadyExist
*When adding an existing rollup where the rollup address already was added*


```solidity
error RollupAddressAlreadyExist();
```

### RollupIDNotAscendingOrder
*When verifying proof for multiple roolups and they are not ordered by ID*


```solidity
error RollupIDNotAscendingOrder();
```

### ChainIDOutOfRange
*When try to create a new rollup and set a chainID bigger than 32 bits*


```solidity
error ChainIDOutOfRange();
```

### OnlyRollupAdmin
*When try to upgrade a rollup a sender that's not the admin of the rollup*


```solidity
error OnlyRollupAdmin();
```

### AllSequencedMustBeVerified
*When try to update a rollup with sequences pending to verify*


```solidity
error AllSequencedMustBeVerified();
```

### MustSequenceSomeBlob
*Thrown when do not sequence any blob*


```solidity
error MustSequenceSomeBlob();
```

### FinalNumSequenceBelowLastVerifiedSequence
*Thrown when the final verification sequence is below or equal the last verification sequence*


```solidity
error FinalNumSequenceBelowLastVerifiedSequence();
```

### InitSequenceMustMatchCurrentForkID
*When the init sequence was verified in another forkID*


```solidity
error InitSequenceMustMatchCurrentForkID();
```

### InitSequenceNumDoesNotMatchPendingState
*Thrown when the init num sequence does not match with the one in the pending state*


```solidity
error InitSequenceNumDoesNotMatchPendingState();
```

### FinalNumSequenceDoesNotMatchPendingState
*Thrown when the final num sequence does not match with the one in the pending state*


```solidity
error FinalNumSequenceDoesNotMatchPendingState();
```

### InvalidRangeMultiplierZkGasPrice
*Thrown when attempting to set a new multiplier zkgas in a invalid range of values*


```solidity
error InvalidRangeMultiplierZkGasPrice();
```

### InvalidRangeSequenceTimeTarget
*Thrown when attempting to set a seuqnece time target in an invalid range of values*


```solidity
error InvalidRangeSequenceTimeTarget();
```

### zkGasPriceOfRange
*When a set a zkgasprice out of range*


```solidity
error zkGasPriceOfRange();
```

### CannotUpdateWithUnconsolidatedPendingState
*Cannot update from network admin with unconsolidated pending state*


```solidity
error CannotUpdateWithUnconsolidatedPendingState();
```

### EmptyVerifySequencesData
*Try to verify batches without any sequence data*


```solidity
error EmptyVerifySequencesData();
```

### UpdateToOldRollupTypeID
*Update to old rollup ID*


```solidity
error UpdateToOldRollupTypeID();
```

### AllBatchesMustBeVerified
*All batches must be verified before the upgrade*


```solidity
error AllBatchesMustBeVerified();
```

### RollbackBatchIsNotValid
*Rollback batch is not sequenced*


```solidity
error RollbackBatchIsNotValid();
```

### RollbackBatchIsNotEndOfSequence
*Rollback batch is not the end of any sequence*


```solidity
error RollbackBatchIsNotEndOfSequence();
```

### NotAllowedAddress
*rollbackBatches is called from a non authorized address*


```solidity
error NotAllowedAddress();
```

### InvalidRollupType
*Invalid Rollup type parameters*


```solidity
error InvalidRollupType();
```

### InvalidRollup
*Invalid Rollup parameters*


```solidity
error InvalidRollup();
```

### L1InfoTreeLeafCountInvalid
*Not valid L1 info tree leaf count*


```solidity
error L1InfoTreeLeafCountInvalid();
```

### OnlyStateTransitionChains
*Only State Transition Chains*


```solidity
error OnlyStateTransitionChains();
```

### PendingStateNumExist
*Pending state num exist*


```solidity
error PendingStateNumExist();
```

### StateTransitionChainsNotAllowed
*Thrown when a function is executed for a State transition chains when it is not allowed*

*This function was previously called `OnlyChainsWithPessimisticProofs`but with the new ALGateway verifier Type
state transitions must be excluded*


```solidity
error StateTransitionChainsNotAllowed();
```

### AggchainDataMustBeZeroForPessimisticVerifierType
*Custom chain data must be zero for pessimistic verifier type*


```solidity
error AggchainDataMustBeZeroForPessimisticVerifierType();
```

### InvalidPessimisticProof
*Invalid Pessimistic proof*


```solidity
error InvalidPessimisticProof();
```

### InvalidVerifierType
*Invalid Verifier Type when getting rollup data*


```solidity
error InvalidVerifierType();
```

### InvalidConstructorInputs
*Thrown when trying to deploy rollup Manager with some zero address as the input*


```solidity
error InvalidConstructorInputs();
```

### InvalidInputsForRollupType
*Thrown when trying to create a rollup but the input parameters are not  according with the chosen rollupType*


```solidity
error InvalidInputsForRollupType();
```

### InvalidImplementationAddress
*Thrown when trying to add an existing rollup or create a new rollup type with an invalid consensus implementation address*


```solidity
error InvalidImplementationAddress();
```

### InvalidVerifierAddress
*Thrown when trying to create rollup or rollup type with an invalid verifier address*


```solidity
error InvalidVerifierAddress();
```

## Enums
### VerifierType

```solidity
enum VerifierType {
    StateTransition,
    Pessimistic,
    ALGateway
}
```

