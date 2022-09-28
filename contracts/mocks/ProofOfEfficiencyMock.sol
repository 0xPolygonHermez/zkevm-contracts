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
    ) public pure returns (bytes32) {
        bytes32 input = keccak256(
            abi.encodePacked(
                currentStateRoot,
                currentLocalExitRoot,
                newStateRoot,
                newLocalExitRoot,
                batchHashData,
                numBatch,
                timestamp
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
        bytes32 inputStark = calculateStarkInput(
            currentStateRoot,
            currentLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            batchHashData,
            numBatch,
            timestamp
        );

        bytes memory snarkHashBytes;
        assembly {
            // Set snarkHashBytes to the next free memory space
            snarkHashBytes := mload(0x40)

            // Reserve the memory. 32 for the length , the input bytes and 32
            // extra bytes at the end for word manipulation
            mstore(0x40, add(add(snarkHashBytes, 0x40), _SNARK_SHA_BYTES))

            // Set the actua length of the input bytes
            mstore(snarkHashBytes, _SNARK_SHA_BYTES)

            // Set the pointer at the begining of the byte array
            let ptr := add(snarkHashBytes, 32)

            // store aggregator address
            mstore(ptr, shl(96, aggregatorAddress)) // 256 - 160 = 96
            ptr := add(ptr, 20)

            for {
                let i := 0
            } lt(i, 8) {
                i := add(i, 1)
            } {
                // Every iteration will write 4 bytes (32 bits) from inputStark padded to 8 bytes, in little endian format
                // First shift right i*32 bits, in order to have the next 4 bytes to write at the end of the byte array
                // Then shift left 256 - 32 (224) bits to the left.
                // AS a result the first 4 bytes will be the next ones, and the rest of the bytes will be zeroes
                // Finally the result is shifted 32 bits for the padding, and stores in the current position of the pointer
                mstore(ptr, shr(32, shl(224, shr(mul(i, 32), inputStark))))
                ptr := add(ptr, 8) // write the next 8 bytes
            }
        }
        uint256 inputSnark = uint256(sha256(snarkHashBytes)) % _RFIELD;

        return inputSnark;
    }

    /**
     * @notice Calculate the circuit input
     * @param newStateRoot New State root once the batch is processed
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param numBatch Batch number that the aggregator intends to verify, used as a sanity check
     */
    function getNextSnarkInput(
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

        bytes32 inputStark = keccak256(
            abi.encodePacked(
                currentStateRoot,
                currentLocalExitRoot,
                newStateRoot,
                newLocalExitRoot,
                batchHashData,
                numBatch,
                timestamp
            )
        );

        bytes memory snarkHashBytes;

        assembly {
            // Set snarkHashBytes to the next free memory space
            snarkHashBytes := mload(0x40)

            // Reserve the memory. 32 for the length , the input bytes and 32
            // extra bytes at the end for word manipulation
            mstore(0x40, add(add(snarkHashBytes, 0x40), _SNARK_SHA_BYTES))

            // Set the actua length of the input bytes
            mstore(snarkHashBytes, _SNARK_SHA_BYTES)

            // Set the pointer at the begining of the byte array
            let ptr := add(snarkHashBytes, 32)

            // store aggregator address
            mstore(ptr, shl(96, caller())) // 256 - 160 = 96
            ptr := add(ptr, 20)

            for {
                let i := 0
            } lt(i, 8) {
                i := add(i, 1)
            } {
                // Every iteration will write 4 bytes (32 bits) from inputStark padded to 8 bytes, in little endian format
                // First shift right i*32 bits, in order to have the next 4 bytes to write at the end of the byte array
                // Then shift left 256 - 32 (224) bits to the left.
                // AS a result the first 4 bytes will be the next ones, and the rest of the bytes will be zeroes
                // Finally the result is shifted 32 bits for the padding, and stores in the current position of the pointer
                mstore(ptr, shr(32, shl(224, shr(mul(i, 32), inputStark))))
                ptr := add(ptr, 8) // write the next 8 bytes
            }
        }
        uint256 inputSnark = uint256(sha256(snarkHashBytes)) % _RFIELD;

        return inputSnark;
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
     * @notice Set Exit Root
     * @param newLocalExitRoot New exit root ¡
     */
    function setExitRoot(bytes32 newLocalExitRoot) public {
        currentLocalExitRoot = newLocalExitRoot;
    }

    /**
     * @notice Set Sequencer
     * @param _rollupVerifier New verifier
     */
    function setVerifier(IVerifierRollup _rollupVerifier) public {
        rollupVerifier = _rollupVerifier;
    }

    /**
     * @notice Set Sequencer
     * @param _numBatch New verifier
     */
    function setVerifiedBatch(uint64 _numBatch) public {
        lastVerifiedBatch = _numBatch;
    }

    /**
     * @notice Set Sequencer
     * @param _numBatch New verifier
     */
    function setSequencedBatch(uint64 _numBatch) public {
        lastBatchSequenced = _numBatch;
    }
}
