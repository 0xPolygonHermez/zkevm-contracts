// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.9;

import "../ProofOfEfficiency.sol";
import "hardhat/console.sol";

/**
 * Contract responsible for managing the state and the updates of it of the L2 Hermez network.
 * There will be sequencer, wich are able to send transactions. That transactions will be stored in the contract.
 * The aggregators are forced to process and validate the sequencers transactions in the same order by using a verifier.
 * To enter and exit of the L2 network will be used a Bridge smart contract
 */
contract ProofOfEfficiencyMock is ProofOfEfficiency {
    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _matic MATIC token address
     * @param _rollupVerifier rollup verifier address
     * @param genesisRoot rollup genesis root
     */
    constructor(
        IGlobalExitRootManager _globalExitRootManager,
        IERC20 _matic,
        IVerifierRollup _rollupVerifier,
        bytes32 genesisRoot,
        address _superSequencerAddress,
        bool _forceBatchAllowed
    )
        ProofOfEfficiency(
            _globalExitRootManager,
            _matic,
            _rollupVerifier,
            genesisRoot,
            _superSequencerAddress,
            _forceBatchAllowed
        )
    {}

    /**
     * @notice Calculate the circuit input
     * @param currentStateRoot Current state Root
     * @param currentLocalExitRoot Current local exit root
     * @param newStateRoot New State root once the batch is processed
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param batchHashData Batch hash data
     * @param numBatch num batch
     * @param timestamp num batch
     */
    function calculateCircuitInput(
        bytes32 currentStateRoot,
        bytes32 currentLocalExitRoot,
        bytes32 newStateRoot,
        bytes32 newLocalExitRoot,
        bytes32 batchHashData,
        uint64 numBatch,
        uint64 timestamp
    ) public pure returns (uint256) {
        uint256 input = uint256(
            keccak256(
                abi.encodePacked(
                    currentStateRoot,
                    currentLocalExitRoot,
                    newStateRoot,
                    newLocalExitRoot,
                    batchHashData,
                    numBatch,
                    timestamp
                )
            )
        ) % _RFIELD;
        return input;
    }

    /**
     * @notice Calculate the circuit input
     * @param newStateRoot New State root once the batch is processed
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param numBatch Batch number that the aggregator intends to verify, used as a sanity check
     */
    function getNextCircuitInput(
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        uint64 numBatch
    ) public view returns (uint256) {
        // sanity check
        require(
            numBatch == lastVerifiedBatch + 1,
            "ProofOfEfficiency::verifyBatch: BATCH_DOES_NOT_MATCH"
        );

        // Calculate Circuit Input
        bytes32 batchHashData = sequencedBatches[numBatch].batchHashData;
        uint64 timestamp = sequencedBatches[numBatch].timestamp;

        // The bachHashdata stores a pointer of a forceBatch instead of a hash
        if ((batchHashData >> 64) == 0) {
            // The bachHashdata stores a pointer of a forceBatch instead of a hash
            batchHashData = forcedBatches[uint64(uint256(batchHashData))]
                .batchHashData;
        }

        uint256 input = uint256(
            keccak256(
                abi.encodePacked(
                    currentStateRoot,
                    currentLocalExitRoot,
                    newStateRoot,
                    newLocalExitRoot,
                    batchHashData,
                    numBatch,
                    timestamp
                )
            )
        ) % _RFIELD;
        return input;
    }

    /**
     * @notice Return the input hash parameters
     * @param newStateRoot New State root once the batch is processed
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param numBatch Batch number that the aggregator intends to verify, used as a sanity check
     */
    function returnInputHashParameters(
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        uint32 numBatch
    ) public view returns (bytes memory) {
        // sanity check
        require(
            numBatch == lastVerifiedBatch + 1,
            "ProofOfEfficiency::verifyBatch: BATCH_DOES_NOT_MATCH"
        );

        // Calculate Circuit Input
        bytes32 batchHashData = sequencedBatches[numBatch].batchHashData;
        uint64 timestamp = sequencedBatches[numBatch].timestamp;

        // The bachHashdata stores a pointer of a forceBatch instead of a hash
        if ((batchHashData >> 64) == 0) {
            // The bachHashdata stores a pointer of a forceBatch instead of a hash
            batchHashData = forcedBatches[uint64(uint256(batchHashData))]
                .batchHashData;
        }

        return
            abi.encodePacked(
                currentStateRoot,
                currentLocalExitRoot,
                newStateRoot,
                newLocalExitRoot,
                batchHashData,
                numBatch,
                timestamp
            );
    }

    /**
     * @notice Set state root
     * @param newStateRoot New State root ¡
     */
    function setStateRoot(bytes32 newStateRoot) public {
        currentStateRoot = newStateRoot;
    }

    /**
     * @notice Set Sequencer
     * @param newLocalExitRoot New exit root ¡
     */
    function setExitRoot(bytes32 newLocalExitRoot) public {
        currentLocalExitRoot = newLocalExitRoot;
    }
}
