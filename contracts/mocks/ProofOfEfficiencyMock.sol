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
     * @param genesisRoot rollup genesis root
     */
    constructor(
        BridgeInterface _bridge,
        IERC20 _matic,
        VerifierRollupInterface _rollupVerifier,
        bytes32 genesisRoot
    ) ProofOfEfficiency(_bridge, _matic, _rollupVerifier, genesisRoot) {}

    /**
     * @notice Calculate the circuit input
     * @param currentStateRoot Current state Root
     * @param currentLocalExitRoot Current local exit root
     * @param newStateRoot New State root once the batch is processed
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param sequencerAddress Sequencer address
     * @param batchHashData Batch hash data
     * @param batchChainID Batch chain ID
     * @param batchNum Batch number that the aggregator intends to verify, used as a sanity check
     */
    function calculateCircuitInput(
        bytes32 currentStateRoot,
        bytes32 currentLocalExitRoot,
        bytes32 newStateRoot,
        bytes32 newLocalExitRoot,
        address sequencerAddress,
        bytes32 batchHashData,
        uint32 batchChainID,
        uint32 batchNum
    ) public pure returns (uint256) {
        uint256 input = uint256(
            keccak256(
                abi.encodePacked(
                    currentStateRoot,
                    currentLocalExitRoot,
                    newStateRoot,
                    newLocalExitRoot,
                    sequencerAddress,
                    batchHashData,
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
            keccak256(
                abi.encodePacked(
                    currentStateRoot,
                    currentLocalExitRoot,
                    newStateRoot,
                    newLocalExitRoot,
                    sequencerAddress,
                    currentBatch.batchHashData,
                    batchChainID,
                    batchNum
                )
            )
        );
        return input;
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

    /**
     * @notice Allows to register a new sequencer or update the sequencer URL
     * @param sequencerURL sequencer RPC URL
     */
    function setSequencer(
        address sequencer,
        string memory sequencerURL,
        uint32 chainID
    ) public {
        sequencers[sequencer].sequencerURL = sequencerURL;
        sequencers[sequencer].chainID = chainID;
    }
}
