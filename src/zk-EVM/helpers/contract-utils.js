const { ethers } = require('hardhat');
const { Scalar } = require('ffjavascript');
const { Fr } = require('../constants');

/**
 * Compute globalHash
 * @param {String} currentStateRoot - Current state Root
 * @param {String} currentLocalExitRoot - Current local exit root
 * @param {String} newStateRoot - New State root once the batch is processed
 * @param {String} newLocalExitRoot - New local exit root once the batch is processed
 * @param {String} batchHashData - Batch hash data
 * @param {Number} numBatch - Batch number
 * @returns {String} - Leaf value
 */
function calculateCircuitInput(
    currentStateRoot,
    currentLocalExitRoot,
    newStateRoot,
    newLocalExitRoot,
    batchHashData,
    numBatch,
) {
    const currentStateRootHex = `0x${Scalar.e(currentStateRoot).toString(16).padStart(64, '0')}`;
    const currentLocalExitRootHex = `0x${Scalar.e(currentLocalExitRoot).toString(16).padStart(64, '0')}`;
    const newStateRootHex = `0x${Scalar.e(newStateRoot).toString(16).padStart(64, '0')}`;
    const newLocalExitRootHex = `0x${Scalar.e(newLocalExitRoot).toString(16).padStart(64, '0')}`;

    const hashKeccak = ethers.utils.solidityKeccak256(
        ['bytes32', 'bytes32', 'bytes32', 'bytes32', 'bytes32', 'uint32'],
        [
            currentStateRootHex,
            currentLocalExitRootHex,
            newStateRootHex,
            newLocalExitRootHex,
            batchHashData,
            numBatch,
        ],
    );

    return `0x${Scalar.mod(Scalar.fromString(hashKeccak, 16), Fr).toString(16).padStart(64, '0')}`;
}

/**
 * Batch hash data
 * @param {String} transactions - All raw transaction data concatenated
 * @param {String} globalExitRoot - Global Exit Root
 * @param {String} sequencerAddress - Sequencer address
 * @param {String} timestamp - Block timestamp
 * @param {Number} batchChainID - Batch chain ID
 * @returns {String} - Batch hash data
 */
function calculateBatchHashData(
    transactions,
    globalExitRoot,
    timestamp,
    sequencerAddress,
    batchChainID,
) {
    const globalExitRootHex = `0x${Scalar.e(globalExitRoot).toString(16).padStart(64, '0')}`;
    return ethers.utils.solidityKeccak256(
        ['bytes', 'bytes32', 'uint256', 'address', 'uint32'],
        [
            transactions,
            globalExitRootHex,
            timestamp,
            sequencerAddress,
            batchChainID,
        ],
    );
}

/**
 * Prepare zkSnark inputs for smart contract
 * @param {Object} proof - Contain the proof data related from snarkJs
 * @param {Array} publicSignals - Contain the public input array from snarkJs
 * @returns {Object} - Proof structure ready to be sent to smart contract
 */
function generateSolidityInputs(
    proof,
    publicSignals,
) {
    const proofA = [proof.pi_a[0],
        proof.pi_a[1],
    ];
    const proofB = [
        [
            proof.pi_b[0][1],
            proof.pi_b[0][0],
        ],
        [
            proof.pi_b[1][1],
            proof.pi_b[1][0],
        ],
    ];
    const proofC = [proof.pi_c[0],
        proof.pi_c[1],
    ];
    const input = publicSignals;
    return {
        proofA, proofB, proofC, input,
    };
}

module.exports = {
    calculateCircuitInput,
    calculateBatchHashData,
    generateSolidityInputs,
};
