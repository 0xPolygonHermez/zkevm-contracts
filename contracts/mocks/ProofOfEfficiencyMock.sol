// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.15;

import "../ProofOfEfficiency.sol";
import "hardhat/console.sol";

/**
 * Contract responsible for managing the state and the updates of the L2 network
 * There will be sequencer, which are able to send transactions. That transactions will be stored in the contract.
 * The aggregators are forced to process and validate the sequencers transactions in the same order by using a verifier.
 * To enter and exit of the L2 network will be used a Bridge smart contract
 */
contract ProofOfEfficiencyMock is ProofOfEfficiency {
    /**
     * @param _globalExitRootManager global exit root manager address
     * @param _matic MATIC token address
     * @param _rollupVerifier rollup verifier address
     * @param genesisRoot rollup genesis root
     * @param _trustedSequencer trusted sequencer address
     * @param _forceBatchAllowed indicates wheather the force batch functionality is available
     * @param _trustedSequencerURL trusted sequencer URL
     */
    constructor(
        IGlobalExitRootManager _globalExitRootManager,
        IERC20 _matic,
        IVerifierRollup _rollupVerifier,
        bytes32 genesisRoot,
        address _trustedSequencer,
        bool _forceBatchAllowed,
        string memory _trustedSequencerURL
    )
        ProofOfEfficiency(
            _globalExitRootManager,
            _matic,
            _rollupVerifier,
            genesisRoot,
            _trustedSequencer,
            _forceBatchAllowed,
            _trustedSequencerURL
        )
    {}

    /**
     * @notice Calculate the stark input
     * @param currentStateRoot Current state Root
     * @param currentLocalExitRoot Current local exit root
     * @param newStateRoot New State root once the batch is processed
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param batchHashData Batch hash data
     * @param numBatch num batch
     * @param timestamp unix timestamp
     */
    function calculateStarkInput(
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
        );
        return input;
    }

    /**
     * @notice Calculate the snark  input
     * @param currentStateRoot Current state Root
     * @param currentLocalExitRoot Current local exit root
     * @param newStateRoot New State root once the batch is processed
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param batchHashData Batch hash data
     * @param numBatch num batch
     * @param timestamp unix timestamp
     * @param aggregatorAddress aggregatorAddress
     */
    function calculateSnarkInput(
        bytes32 currentStateRoot,
        bytes32 currentLocalExitRoot,
        bytes32 newStateRoot,
        bytes32 newLocalExitRoot,
        bytes32 batchHashData,
        uint64 numBatch,
        uint64 timestamp,
        address aggregatorAddress
    ) public pure returns (uint256) {
        bytes32 inputStark = bytes32(calculateStarkInput(
            currentStateRoot,
            currentLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            batchHashData,
            numBatch,
            timestamp
        ));

        uint256 inputSnark = uint256(
            sha256(abi.encodePacked(inputStark, aggregatorAddress))
        ) % _RFIELD;

        return inputSnark;
    }

    /**
     * @notice Calculate the circuit input
     * @param newStateRoot New State root once the batch is processed
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param numBatch Batch number that the aggregator intends to verify, used as a sanity check
     */
    function getNextStarkInput(
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
        uint64 timestamp = sequencedBatches[numBatch].timestamp;
        bytes32 batchHashData;
        uint256 maticFee;

        // If it's a force batch, forcebatchNum indicates which one is, otherwise is a regular batch
        if (sequencedBatches[numBatch].forceBatchNum == 0) {
            batchHashData = sequencedBatches[numBatch].batchHashData;
            maticFee = TRUSTED_SEQUENCER_FEE;
        } else {
            ForcedBatchData memory currentForcedBatch = forcedBatches[
                sequencedBatches[numBatch].forceBatchNum
            ];
            batchHashData = currentForcedBatch.batchHashData;
            maticFee = currentForcedBatch.maticFee;
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
        );
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
        uint64 timestamp = sequencedBatches[numBatch].timestamp;
        bytes32 batchHashData;
        uint256 maticFee;

        // If it's a force batch, forcebatchNum indicates which one is, otherwise is a regular batch
        if (sequencedBatches[numBatch].forceBatchNum == 0) {
            batchHashData = sequencedBatches[numBatch].batchHashData;
            maticFee = TRUSTED_SEQUENCER_FEE;
        } else {
            ForcedBatchData memory currentForcedBatch = forcedBatches[
                sequencedBatches[numBatch].forceBatchNum
            ];
            batchHashData = currentForcedBatch.batchHashData;
            maticFee = currentForcedBatch.maticFee;
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
