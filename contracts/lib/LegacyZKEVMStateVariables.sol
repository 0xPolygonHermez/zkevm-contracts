// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

/**
 * Since the current contract of PolygonZkEVM will be upgraded to a PolygonRollupManager there's defined
 * all the legacy public variables in order to not use previous used storage slots
 * The variables will be used by the RollupManager only for initialize the zkEVM inside the initializer function
 */
contract LegacyZKEVMStateVariables {
    /**
     * @notice Struct which will be stored for every batch sequence
     * @param accInputHash Hash chain that contains all the information to process a batch:
     * Before etrog: keccak256(bytes32 oldAccInputHash, keccak256(bytes transactions), bytes32 globalExitRoot, uint64 timestamp, address seqAddress)
     * Etrog: keccak256(bytes32 oldAccInputHash, keccak256(bytes transactions), bytes32 l1InfoRoot/forcedGlobalExitRoot, uint64 currentTimestamp/forcedTimestamp, address l2Coinbase, bytes32 0/forcedBlockHashL1)
     * @param sequencedTimestamp Sequenced timestamp
     * @param previousLastBatchSequenced Previous last batch sequenced before the current one, this is used to properly calculate the fees
     */
    struct SequencedBatchData {
        bytes32 accInputHash;
        uint64 sequencedTimestamp;
        uint64 previousLastBatchSequenced;
    }

    /**
     * @notice Struct to store the pending states
     * Pending state will be an intermediary state, that after a timeout can be consolidated, which means that will be added
     * to the state root mapping, and the global exit root will be updated
     * This is a protection mechanism against soundness attacks, that will be turned off in the future
     * @param timestamp Timestamp where the pending state is added to the queue
     * @param lastVerifiedBatch Last batch verified batch of this pending state
     * @param exitRoot Pending exit root
     * @param stateRoot Pending state root
     */
    struct PendingState {
        uint64 timestamp;
        uint64 lastVerifiedBatch;
        bytes32 exitRoot;
        bytes32 stateRoot;
    }

    // Time target of the verification of a batch
    // Adaptatly the batchFee will be updated to achieve this target
    /// @custom:oz-renamed-from verifyBatchTimeTarget
    uint64 internal _legacyVerifyBatchTimeTarget;

    // Batch fee multiplier with 3 decimals that goes from 1000 - 1023
    /// @custom:oz-renamed-from multiplierBatchFee
    uint16 internal _legacyMultiplierBatchFee;

    // Trusted sequencer address
    /// @custom:oz-renamed-from trustedSequencer
    address internal _legacyTrustedSequencer;

    // Current matic fee per batch sequenced
    /// @custom:oz-renamed-from batchFee
    uint256 internal _legacyBatchFee;

    // Queue of forced batches with their associated data
    // ForceBatchNum --> hashedForcedBatchData
    // hashedForcedBatchData: hash containing the necessary information to force a batch:
    // keccak256(keccak256(bytes transactions), bytes32 globalExitRoot, unint64 minForcedTimestamp)
    /// @custom:oz-renamed-from forcedBatches
    mapping(uint64 => bytes32) internal _legacyForcedBatches;

    // Queue of batches that defines the virtual state
    // SequenceBatchNum --> SequencedBatchData
    /// @custom:oz-renamed-from sequencedBatches
    mapping(uint64 => SequencedBatchData) internal _legacySequencedBatches;

    // Last sequenced timestamp
    /// @custom:oz-renamed-from lastTimestamp
    uint64 internal _legacyLastTimestamp;

    // Last batch sent by the sequencers
    /// @custom:oz-renamed-from lastBatchSequenced
    uint64 internal _legacylastBatchSequenced;

    // Last forced batch included in the sequence
    /// @custom:oz-renamed-from lastForceBatchSequenced
    uint64 internal _legacyLastForceBatchSequenced;

    // Last forced batch
    /// @custom:oz-renamed-from lastForceBatch
    uint64 internal _legacyLastForceBatch;

    // Last batch verified by the aggregators
    /// @custom:oz-renamed-from lastVerifiedBatch
    uint64 internal _legacyLastVerifiedBatch;

    // Trusted aggregator address
    /// @custom:oz-renamed-from trustedAggregator
    address internal _legacyTrustedAggregator;

    // State root mapping
    // BatchNum --> state root
    /// @custom:oz-renamed-from batchNumToStateRoot
    mapping(uint64 => bytes32) internal _legacyBatchNumToStateRoot;

    // Trusted sequencer URL
    /// @custom:oz-renamed-from trustedSequencerURL
    string internal _legacyTrustedSequencerURL;

    // L2 network name
    /// @custom:oz-renamed-from networkName
    string internal _legacyNetworkName;

    // Pending state mapping
    // pendingStateNumber --> PendingState
    /// @custom:oz-renamed-from pendingStateTransitions
    mapping(uint256 => PendingState) internal _legacyPendingStateTransitions;

    // Last pending state
    /// @custom:oz-renamed-from lastPendingState
    uint64 internal _legacyLastPendingState;

    // Last pending state consolidated
    /// @custom:oz-renamed-from lastPendingStateConsolidated
    uint64 internal _legacyLastPendingStateConsolidated;

    // Once a pending state exceeds this timeout it can be consolidated
    /// @custom:oz-renamed-from pendingStateTimeout
    uint64 internal _legacyPendingStateTimeout;

    // Trusted aggregator timeout, if a sequence is not verified in this time frame,
    // everyone can verify that sequence
    /// @custom:oz-renamed-from trustedAggregatorTimeout
    uint64 internal _legacyTrustedAggregatorTimeout;

    // Address that will be able to adjust contract parameters or stop the emergency state
    /// @custom:oz-renamed-from admin
    address internal _legacyAdmin;

    // This account will be able to accept the admin role
    /// @custom:oz-renamed-from pendingAdmin
    address internal _legacyPendingAdmin;

    // Force batch timeout
    /// @custom:oz-renamed-from forceBatchTimeout
    uint64 internal _legacyForceBatchTimeout;

    // Indicates if forced batches are disallowed
    /// @custom:oz-renamed-from isForcedBatchDisallowed
    bool internal _legacyIsForcedBatchDisallowed;

    // Indicates the current version
    /// @custom:oz-renamed-from version
    uint256 internal _legacyVersion;

    // Last batch verified before the last upgrade
    /// @custom:oz-renamed-from lastVerifiedBatchBeforeUpgrade
    uint256 internal _legacyLastVerifiedBatchBeforeUpgrade;
}
