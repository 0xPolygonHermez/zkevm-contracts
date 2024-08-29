const ethers = require('ethers');

const VerifierType = {
    StateTransition: 0,
    Pessimistic: 1,
};

const ConsensusTypes = {
    Ecdsa: 0,
};

/**
 * Compute input for SNARK circuit: sha256(
 * initStateRoot, initBlobStateRoot, initBlobAccInputHash, initNumBlob, chainId, forkID
 * finalStateRoot, finalBlobStateRoot, finalBlobAccInputHash, finalNumBlob, finalLocalExitRoot
 * aggregatorAddress
 * ) % FrSNARK
 * @param {String} lastLocalExitRoot - old LER
 * @param {String} lastPessimisticRoot - old pessimistic root. pessRoor = Poseidon(LBR # nullifierRoot)
 * @param {String} l1InfoTreeRoot - L1 info tree root
 * @param {Number} rollupID - rollup identifier (networkID = rollupID - 1)
 * @param {String} consensusHash - consensus hash. consensusHash = Sha(consensusType # consensusPayload)
 * @param {String} newLocalExitRoot - new LER
 * @param {String} newPessimisticRoot - new pessimistic root
 */
function computeInputPessimisticBytes(
    lastLocalExitRoot,
    lastPessimisticRoot,
    l1InfoTreeRoot,
    rollupID,
    consensusHash,
    newLocalExitRoot,
    newPessimisticRoot,
) {
    return ethers.solidityPacked(
        ['bytes32', 'bytes32', 'bytes32', 'uint32', 'bytes32', 'bytes32', 'bytes32'],
        [
            lastLocalExitRoot,
            lastPessimisticRoot,
            l1InfoTreeRoot,
            rollupID,
            consensusHash,
            newLocalExitRoot,
            newPessimisticRoot,
        ],
    );
}

/**
 * Computes consensus hash
 * @param address - Signer of the message in the pessimsistic proof
 * @returns consensus hash
 */
function computeConsensusHashEcdsa(address) {
    return ethers.solidityPackedKeccak256(['uint32', 'address'], [ConsensusTypes.Ecdsa, address]);
}

module.exports = {
    VerifierType,
    ConsensusTypes,
    computeInputPessimisticBytes,
    computeConsensusHashEcdsa,
};
