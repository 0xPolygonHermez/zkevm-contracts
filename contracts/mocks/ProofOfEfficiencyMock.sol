// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.15;

import "../ProofOfEfficiency.sol";

/**
 * Contract responsible for managing the state and the updates of the L2 network
 * There will be sequencer, which are able to send transactions. That transactions will be stored in the contract.
 * The aggregators are forced to process and validate the sequencers transactions in the same order by using a verifier.
 * To enter and exit of the L2 network will be used a Bridge smart contract
 */
contract ProofOfEfficiencyMock is ProofOfEfficiency {
    /**
     * @notice calculate accumulate input hash from parameters
     * @param currentAccInputHash Accumulate input hash
     * @param transactions Transactions
     * @param globalExitRoot Global Exit Root
     * @param timestamp Timestamp
     * @param sequencerAddress Sequencer address
     */
    function calculateAccInputHash(
        bytes32 currentAccInputHash,
        bytes memory transactions,
        bytes32 globalExitRoot,
        uint64 timestamp,
        address sequencerAddress
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    currentAccInputHash,
                    keccak256(transactions),
                    globalExitRoot,
                    timestamp,
                    sequencerAddress
                )
            );
    }

    /**
     * @notice Return the next snark input
     * @param pendingStateNum Pending state num
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     */
    function getNextSnarkInput(
        uint64 pendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot
    ) public view returns (uint256) {
        bytes32 oldStateRoot;
        uint64 currentLastVerifiedBatch;

        // Get the last pending state if there's one, otherwise check consolidate state
        if (lastPendingState > 0) {
            currentLastVerifiedBatch = pendingStateTransitions[lastPendingState]
                .lastVerifiedBatch;
        } else {
            currentLastVerifiedBatch = lastVerifiedBatch;
        }

        // Use pending state if specified, otherwise use consolidated state
        if (pendingStateNum != 0) {
            // Check that pending state exist
            // Already consolidated pending states can be used aswell
            require(
                pendingStateNum <= lastPendingState,
                "ProofOfEfficiency::verifyBatches: pendingStateNum must be less or equal than lastPendingState"
            );

            // Check choosen pending state
            PendingState storage currentPendingState = pendingStateTransitions[
                pendingStateNum
            ];

            // Get oldStateRoot from pending batch
            oldStateRoot = currentPendingState.stateRoot;

            // Check initNumBatch matches the pending state
            require(
                initNumBatch == currentPendingState.lastVerifiedBatch,
                "ProofOfEfficiency::verifyBatches: initNumBatch must match the pending state batch"
            );
        } else {
            // Use consolidated state
            require(
                batchNumToStateRoot[initNumBatch] != bytes32(0),
                "ProofOfEfficiency::verifyBatches: initNumBatch state root does not exist"
            );
            oldStateRoot = batchNumToStateRoot[initNumBatch];

            // Check initNumBatch is inside the range
            require(
                initNumBatch <= currentLastVerifiedBatch,
                "ProofOfEfficiency::verifyBatches: initNumBatch must be less or equal than currentLastVerifiedBatch"
            );
        }

        // Check final batch
        require(
            finalNewBatch > currentLastVerifiedBatch,
            "ProofOfEfficiency::verifyBatches: finalNewBatch must be bigger than currentLastVerifiedBatch"
        );

        // Get snark bytes
        bytes memory snarkHashBytes = getInputSnarkBytes(
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            oldStateRoot,
            newStateRoot
        );

        // Calulate the snark input
        uint256 inputSnark = uint256(sha256(snarkHashBytes)) % _RFIELD;

        return inputSnark;
    }

    /**
     * @notice Set state root
     * @param newStateRoot New State root ¡
     */
    function setStateRoot(
        bytes32 newStateRoot,
        uint64 batchNum
    ) public onlyOwner {
        batchNumToStateRoot[batchNum] = newStateRoot;
    }

    /**
     * @notice Set Sequencer
     * @param _rollupVerifier New verifier
     */
    function setVerifier(IVerifierRollup _rollupVerifier) public onlyOwner {
        rollupVerifier = _rollupVerifier;
    }

    /**
     * @notice Set Sequencer
     * @param _numBatch New verifier
     */
    function setVerifiedBatch(uint64 _numBatch) public onlyOwner {
        lastVerifiedBatch = _numBatch;
    }

    /**
     * @notice Set Sequencer
     * @param _numBatch New verifier
     */
    function setSequencedBatch(uint64 _numBatch) public onlyOwner {
        lastBatchSequenced = _numBatch;
    }

    /**
     * @notice Set network name
     * @param _networkName New verifier
     */
    function setNetworkName(string memory _networkName) public onlyOwner {
        networkName = _networkName;
    }

    /**
     * @notice Set sequencedBatches
     * @param batchNum bathc num
     * @param accInputData accInputData
     */
    function setSequencedBatches(
        uint64 batchNum,
        bytes32 accInputData,
        uint64 timestamp
    ) public onlyOwner {
        sequencedBatches[batchNum] = SequencedBatchData({
            accInputHash: accInputData,
            sequencedTimestamp: timestamp
        });
    }

    /**
     * @notice Allows an aggregator to verify multiple batches
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proofA zk-snark input
     * @param proofB zk-snark input
     * @param proofC zk-snark input
     */
    function trustedVerifyBatchesMock(
        uint64 pendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) public onlyOwner {
        bytes32 oldStateRoot;
        uint64 currentLastVerifiedBatch;

        // Use pending state if especified, otherwise use consolidate state
        if (pendingStateNum != 0) {
            // Check that pending state exist
            // Already consolidated pending states can be used aswell
            require(
                pendingStateNum <= lastPendingState,
                "ProofOfEfficiency::verifyBatches: pendingStateNum must be less or equal than lastPendingState"
            );

            // Check choosen pending state
            PendingState storage currentPendingState = pendingStateTransitions[
                pendingStateNum
            ];
            oldStateRoot = currentPendingState.stateRoot;

            // Assert init batch
            require(
                initNumBatch == currentPendingState.lastVerifiedBatch,
                "ProofOfEfficiency::verifyBatches: initNumBatch must be less or equal than currentLastVerifiedBatch"
            );
            currentLastVerifiedBatch = initNumBatch;
        } else {
            // Use consolidated state
            oldStateRoot = batchNumToStateRoot[initNumBatch];
            require(
                oldStateRoot != bytes32(0),
                "ProofOfEfficiency::verifyBatches: initNumBatch state root does not exist"
            );

            // Assert init batch
            require(
                initNumBatch <= lastVerifiedBatch,
                "ProofOfEfficiency::verifyBatches: initNumBatch must be less or equal than currentLastVerifiedBatch"
            );
            currentLastVerifiedBatch = lastVerifiedBatch;
        }

        // Assert final batch
        require(
            finalNewBatch > currentLastVerifiedBatch,
            "ProofOfEfficiency::verifyBatches: finalNewBatch must be bigger than currentLastVerifiedBatch"
        );

        // Get snark bytes
        bytes memory snarkHashBytes = getInputSnarkBytes(
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            oldStateRoot,
            newStateRoot
        );

        // Calulate the snark input
        uint256 inputSnark = uint256(sha256(snarkHashBytes)) % _RFIELD;

        // Verify proof
        // require(
        //     rollupVerifier.verifyProof(proofA, proofB, proofC, [inputSnark]),
        //     "ProofOfEfficiency::verifyBatches: INVALID_PROOF"
        // );

        // Get MATIC reward
        // matic.safeTransfer(
        //     msg.sender,
        //     calculateRewardPerBatch() *
        //         (finalNewBatch - currentLastVerifiedBatch)
        // );

        // Update state
        lastVerifiedBatch = finalNewBatch;
        batchNumToStateRoot[finalNewBatch] = newStateRoot;

        // Clean pending state if any
        if (lastPendingState > 0) {
            lastPendingState = 0;
            lastPendingStateConsolidated = 0;
        }

        // Interact with globalExitRootManager
        globalExitRootManager.updateExitRoot(newLocalExitRoot);

        emit TrustedVerifyBatches(finalNewBatch, newStateRoot, msg.sender);
    }
}
