const { ethers } = require('hardhat');

/**
 * Calculate leaf value
 * @param {String} currentStateRoot - Current state Root
 * @param {String} currentLocalExitRoot - Current local exit root
 * @param {String} newStateRoot - New State root once the batch is processed
 * @param {String} newLocalExitRoot - New local exit root once the batch is processed
 * @param {String} sequencerAddress - Sequencer address
 * @param {String} batchL2HashData - Batch hash data
 * @param {Number} batchChainID - Batch chain ID
 * @param {Number} batchNum - Batch number
 * @returns {String} - Leaf value
 */
function calculateCircuitInput(
    currentStateRoot,
    currentLocalExitRoot,
    newStateRoot,
    newLocalExitRoot,
    sequencerAddress,
    batchL2HashData,
    batchChainID,
    batchNum,
) {
    return ethers.utils.soliditySha256(
        ['bytes32', 'bytes32', 'bytes32', 'bytes32', 'address', 'bytes32', 'uint32', 'uint32'],
        [
            currentStateRoot,
            currentLocalExitRoot,
            newStateRoot,
            newLocalExitRoot,
            sequencerAddress,
            batchL2HashData,
            batchChainID,
            batchNum,
        ],
    );
}

module.exports = {
    calculateCircuitInput,
};
