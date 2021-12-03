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
     * @param _bridge Bridge contract address
     * @param _matic MATIC token address
     * @param _rollupVerifier rollup verifier address
     */
    constructor(
        BridgeInterface _bridge,
        IERC20 _matic,
        VerifierRollupInterface _rollupVerifier
    ) ProofOfEfficiency(_bridge, _matic, _rollupVerifier) {}

    /**
     * @notice Calculate the circuit input
     * @param currentStateRoot Current state Root
     * @param currentLocalExitRoot Current local exit root
     * @param newStateRoot New State root once the batch is processed
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param sequencerAddress Sequencer address
     * @param batchL2HashData Batch hash data
     * @param batchChainID Batch chain ID
     * @param batchNum Batch number that the aggregator intends to verify, used as a sanity check
     */
    function calculateCircuitInput(
        bytes32 currentStateRoot,
        bytes32 currentLocalExitRoot,
        bytes32 newStateRoot,
        bytes32 newLocalExitRoot,
        address sequencerAddress,
        bytes32 batchL2HashData,
        uint32 batchChainID,
        uint32 batchNum
    ) public pure returns (uint256) {
        uint256 input = uint256(
            sha256(
                abi.encodePacked(
                    currentStateRoot,
                    currentLocalExitRoot,
                    newStateRoot,
                    newLocalExitRoot,
                    sequencerAddress,
                    batchL2HashData,
                    batchChainID,
                    batchNum
                )
            )
        );
        return input;
    }

    /**
     * @notice Calculate the circuit input
     * @param newStateRoot New State root once the batch is processed
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param batchNum Batch number that the aggregator intends to verify, used as a sanity check
     */
    function getNextCircuitInput(
        bytes32 newStateRoot,
        bytes32 newLocalExitRoot,
        uint32 batchNum
    ) public view returns (uint256) {
        // sanity check
        require(
            batchNum == lastVerifiedBatch + 1,
            "ProofOfEfficiency::verifyBatch: BATCH_DOES_NOT_MATCH"
        );

        // Calculate Circuit Input
        BatchData memory currentBatch = sentBatches[batchNum];
        address sequencerAddress = currentBatch.sequencerAddress;

        uint32 batchChainID;
        if (sequencers[sequencerAddress].chainID != 0) {
            batchChainID = sequencers[sequencerAddress].chainID;
        } else {
            // If the sequencer is not registered use the default chainID
            batchChainID = DEFAULT_CHAIN_ID;
        }

        uint256 input = uint256(
            sha256(
                abi.encodePacked(
                    currentStateRoot,
                    currentLocalExitRoot,
                    newStateRoot,
                    newLocalExitRoot,
                    sequencerAddress,
                    currentBatch.batchL2HashData,
                    batchChainID,
                    batchNum
                )
            )
        );
        return input;
    }
}
