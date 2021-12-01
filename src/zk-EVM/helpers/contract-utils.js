/* eslint-disable no-await-in-loop, no-console */
const { ethers } = require('hardhat');
const { stringToHex32 } = require('./utils');

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
    const currentStateRootHex = stringToHex32(currentStateRoot, true);
    const currentLocalExitRootHex = stringToHex32(currentLocalExitRoot, true);
    const newStateRootHex = stringToHex32(newStateRoot, true);
    const newLocalExitRootHex = stringToHex32(newLocalExitRoot, true);

    return ethers.utils.solidityKeccak256(
        ['bytes32', 'bytes32', 'bytes32', 'bytes32', 'address', 'bytes32', 'uint32', 'uint32'],
        [
            currentStateRootHex,
            currentLocalExitRootHex,
            newStateRootHex,
            newLocalExitRootHex,
            sequencerAddress,
            batchL2HashData,
            batchChainID,
            batchNum,
        ],
    );
}

/**
 * Batch hash data
 * @param {String} fullTransactionString - All raw transaction data concatenated
 * @param {String} globalExitRoot - Global Exit Root
 * @returns {String} - Batch hash data
 */
function calculateBatchL2HashData(
    fullTransactionString,
    globalExitRoot,
) {
    const globalExitRootHex = stringToHex32(globalExitRoot, true);
    return ethers.utils.solidityKeccak256(['bytes', 'bytes32'], [fullTransactionString, globalExitRootHex]);
}

module.exports = {
    calculateCircuitInput,
    calculateBatchL2HashData,
};
