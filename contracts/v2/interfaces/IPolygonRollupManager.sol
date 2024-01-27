// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

interface IPolygonRollupManager {
    /**
     * @dev Thrown when sender is not the PolygonZkEVM address
     */
    error UpdateToSameRollupTypeID();

    /**
     * @dev Thrown when sender is not the PolygonZkEVM address
     */
    error RollupMustExist();

    /**
     * @dev Thrown when sender is not the PolygonZkEVM address
     */
    error SenderMustBeRollup();

    /**
     * @dev Thrown when sender is not the PolygonZkEVM address
     */
    error TrustedAggregatorTimeoutNotExpired();

    /**
     * @dev Thrown when sender is not the PolygonZkEVM address
     */
    error ExceedMaxVerifyBatches();

    /**
     * @dev Thrown when attempting to access a pending state that does not exist
     */
    error PendingStateDoesNotExist();

    /**
     * @dev Thrown when the init num batch does not match with the one in the pending state
     */
    error InitNumBatchDoesNotMatchPendingState();

    /**
     * @dev Thrown when the old state root of a certain batch does not exist
     */
    error OldStateRootDoesNotExist();

    /**
     * @dev Thrown when the init verification batch is above the last verification batch
     */
    error InitNumBatchAboveLastVerifiedBatch();

    /**
     * @dev Thrown when the final verification batch is below or equal the last verification batch
     */
    error FinalNumBatchBelowLastVerifiedBatch();

    /**
     * @dev Thrown when the zkproof is not valid
     */
    error InvalidProof();

    /**
     * @dev Thrown when attempting to consolidate a pending state not yet consolidable
     */
    error PendingStateNotConsolidable();

    /**
     * @dev Thrown when attempting to consolidate a pending state that is already consolidated or does not exist
     */
    error PendingStateInvalid();

    /**
     * @dev Thrown when the new accumulate input hash does not exist
     */
    error NewAccInputHashDoesNotExist();

    /**
     * @dev Thrown when the new state root is not inside prime
     */
    error NewStateRootNotInsidePrime();

    /**
     * @dev Thrown when the final pending state num is not in a valid range
     */
    error FinalPendingStateNumInvalid();

    /**
     * @dev Thrown when the final num batch does not match with the one in the pending state
     */
    error FinalNumBatchDoesNotMatchPendingState();

    /**
     * @dev Thrown when the stored root matches the new root proving a different state
     */
    error StoredRootMustBeDifferentThanNewRoot();

    /**
     * @dev Thrown when the halt timeout is not expired when attempting to activate the emergency state
     */
    error HaltTimeoutNotExpired();

    /**
     * @dev Thrown when the old accumulate input hash does not exist
     */
    error OldAccInputHashDoesNotExist();

    /**
     * @dev Thrown when attempting to set a new trusted aggregator timeout equal or bigger than current one
     */
    error NewTrustedAggregatorTimeoutMustBeLower();

    /**
     * @dev Thrown when attempting to set a new pending state timeout equal or bigger than current one
     */
    error NewPendingStateTimeoutMustBeLower();

    /**
     * @dev Thrown when attempting to set a new multiplier batch fee in a invalid range of values
     */
    error InvalidRangeMultiplierBatchFee();

    /**
     * @dev Thrown when attempting to set a batch time target in an invalid range of values
     */
    error InvalidRangeBatchTimeTarget();

    /**
     * @dev Thrown when the caller is not the pending admin
     */
    error ChainIDAlreadyExist();

    /**
     * @dev Thrown when the caller is not the pending admin
     */
    error MustSequenceSomeBatch();

    /**
     * @dev When a rollup type does not exist
     */
    error RollupTypeDoesNotExist();

    /**
     * @dev When a rollup type does not exist
     */
    error RollupTypeObsolete();

    /**
     * @dev When a rollup type does not exist
     */
    error InitBatchMustMatchCurrentForkID();

    /**
     * @dev When a rollup type does not exist
     */
    error UpdateNotCompatible();

    /**
     * @dev When a rollup type does not exist
     */
    error BatchFeeOutOfRange();

    /**
     * @dev When a rollup type does not exist
     */
    error AllzkEVMSequencedBatchesMustBeVerified();

    /**
     * @dev When adding an existing rollup where the rollup address already was added
     */
    error RollupAddressAlreadyExist();
}
