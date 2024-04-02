// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

interface IPolygonZkEVMVFeijoaErrors {
    /**
     * @dev Thrown when the caller is not the admin
     */
    error OnlyAdmin();

    /**
     * @dev Thrown when the caller is not the trusted sequencer
     */
    error OnlyTrustedSequencer();

    /**
     * @dev Thrown when attempting to sequence 0 blobes
     */
    error SequenceZeroBlobs();

    /**
     * @dev Thrown when the forced data does not match
     */
    error ForcedDataDoesNotMatch();

    /**
     * @dev Thrown when the sequenced timestamp is below the forced minimum timestamp
     */
    error SequencedTimestampBelowForcedTimestamp();

    /**
     * @dev Thrown when there are more sequenced force blobes than were actually submitted, should be unreachable
     */
    error ForceBlobsOverflow();

    /**
     * @dev Thrown when the matic amount is below the necessary matic fee
     */
    error NotEnoughMaticAmount();

    /**
     * @dev Thrown when attempting to sequence a force blob using sequenceForceBlobs and the
     * force timeout did not expire
     */
    error ForceBlobTimeoutNotExpired();

    /**
     * @dev Thrown when attempting to set a force blob timeout in an invalid range of values
     */
    error InvalidRangeForceBlobTimeout();

    /**
     * @dev Thrown when transactions array length is above _MAX_TRANSACTIONS_BYTE_LENGTH.
     */
    error TransactionsLengthAboveMax();

    /**
     * @dev Thrown when the caller is not the pending admin
     */
    error OnlyPendingAdmin();

    /**
     * @dev Thrown when force blob is not allowed
     */
    error ForceBlobNotAllowed();

    /**
     * @dev Thrown when try to activate force blobes when they are already active
     */
    error ForceBlobsAlreadyActive();

    /**
     * @dev Thrown when the caller is not the trusted sequencer
     */
    error OnlyRollupManager();

    /**
     * @dev Thrown when the caller is not the trusted sequencer
     */
    error NotEnoughPOLAmount();

    /**
     * @dev Thrown when the caller is not the trusted sequencer
     */
    error InvalidInitializeTransaction();

    /**
     * @dev Thrown when the caller is not the trusted sequencer
     */
    error GasTokenNetworkMustBeZeroOnEther();

    /**
     * @dev Thrown when the try to initialize with a gas token with huge metadata
     */
    error HugeTokenMetadataNotSupported();

    /**
     * @dev Thrown when trying force a blob during emergency state
     */
    error ForceBlobsNotAllowedOnEmergencyState();

    /**
     * @dev Thrown when the try to sequence force blobes before the halt timeout period
     */
    error HaltTimeoutNotExpiredAfterEmergencyState();

    /**
     * @dev Thrown when the try to update the force blob address once is set to address(0)
     */
    error ForceBlobsDecentralized();

    /**
     * @dev Thrown when the max timestamp is out of range
     */
    error MaxTimestampSequenceInvalid();

    /**
     * @dev Thrown when the blob type is not supported
     */
    error BlobTypeNotSupported();

    /**
     * @dev Thrown when the provided leaf index does not exist
     */
    error Invalidl1InfoLeafIndex();

    /**
     * @dev Point evaluation precompiled failed
     */
    error PointEvalutionPrecompiledFail();

    /**
     * @dev Thrown when the acc input hash does not mathc the predicted by the sequencer
     */
    error FinalAccInputHashDoesNotMatch();

    /**
     * @dev Thrown when commintment and proof does not ahve 96 byte length
     */
    error InvalidCommitmentAndProofLength();
}
