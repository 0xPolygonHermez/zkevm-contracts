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
     * @param _lastVerifiedBatch Last verified Batch, used as a sanity check
     * @param newVerifiedBatch Last batch that the aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     */
    function getNextSnarkInput(
        uint64 _lastVerifiedBatch,
        uint64 newVerifiedBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot
    ) public view returns (uint256) {
        // sanity check
        require(
            _lastVerifiedBatch == lastVerifiedBatch,
            "ProofOfEfficiency::verifyBatch: _lastVerifiedBatch does not match"
        );

        require(
            newVerifiedBatch > _lastVerifiedBatch,
            "ProofOfEfficiency::verifyBatch: newVerifiedBatch must be bigger than lastVerifiedBatch"
        );

        require(
            newVerifiedBatch <= lastBatchSequenced,
            "ProofOfEfficiency::verifyBatch: batch does not have been sequenced"
        );

        bytes memory snarkHashBytes = getInputSnarkBytes(
            _lastVerifiedBatch,
            newVerifiedBatch,
            newLocalExitRoot,
            newStateRoot
        );

        uint256 inputSnark = uint256(sha256(snarkHashBytes)) % _RFIELD;
        return inputSnark;
    }

    /**
     * @notice Set state root
     * @param newStateRoot New State root ¡
     */
    function setStateRoot(bytes32 newStateRoot, uint64 batchNum)
        public
        onlyOwner
    {
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
    function setSequencedBatches(uint64 batchNum, bytes32 accInputData)
        public
        onlyOwner
    {
        sequencedBatches[batchNum] = accInputData;
    }

    /**
     * @notice Allows an aggregator mock to verify a batch
     * @param _lastVerifiedBatch Last verified Batch, used as a sanity check
     * @param newVerifiedBatch Last batch that the aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proofA zk-snark input
     * @param proofB zk-snark input
     * @param proofC zk-snark input
     */
    function verifyBatchesMock(
        uint64 _lastVerifiedBatch,
        uint64 newVerifiedBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) public onlyOwner {
        require(
            _lastVerifiedBatch <= lastVerifiedBatch,
            "ProofOfEfficiency::verifyBatches: _lastVerifiedBatch must be less or equal"
        );

        require(
            newVerifiedBatch > lastVerifiedBatch,
            "ProofOfEfficiency::verifyBatches: newVerifiedBatch must be bigger than lastVerifiedBatch"
        );

        bytes32 oldAccInputHash = sequencedBatches[_lastVerifiedBatch];
        bytes32 newAccInputHash = sequencedBatches[newVerifiedBatch];

        require(
            oldAccInputHash != bytes32(0),
            "ProofOfEfficiency::verifyBatch: oldAccInputHash does not exist"
        );

        require(
            newAccInputHash != bytes32(0),
            "ProofOfEfficiency::verifyBatch: newAccInputHash does not exist"
        );

        // // Get MATIC reward
        // matic.safeTransfer(
        //     msg.sender,
        //     calculateRewardPerBatch() * (newVerifiedBatch - _lastVerifiedBatch)
        // );

        // Update state
        lastVerifiedBatch = newVerifiedBatch;
        batchNumToStateRoot[newVerifiedBatch] = newStateRoot;

        // Interact with globalExitRoot
        globalExitRootManager.updateExitRoot(newLocalExitRoot);

        emit VerifyBatches(newVerifiedBatch, newStateRoot, msg.sender);
    }
}
