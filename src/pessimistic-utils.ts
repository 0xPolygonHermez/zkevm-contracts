import * as ethers from 'ethers';

export const VerifierType = {
    StateTransition: 0,
    Pessimistic: 1,
    ALGateway: 2,
};

export const ConsensusTypes = {
    Ecdsa: 0,
};

export const ConsensusContracts = {
    PolygonZkEVMEtrog: 'PolygonZkEVMEtrog',
    PolygonValidiumEtrog: 'PolygonValidiumEtrog',
    PolygonPessimisticConsensus: 'PolygonPessimisticConsensus',
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
export function computeInputPessimisticBytes(
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
export function computeConsensusHashEcdsa(address) {
    return ethers.solidityPackedKeccak256(['uint32', 'address'], [ConsensusTypes.Ecdsa, address]);
}

/**
 * Computes random bytes and formats it as a hex string
 * @param {Number} length of the output random bytes
 * @returns random bytes as a hex string
 */
export function computeRandomBytes(length) {
    return `0x${Buffer.from(ethers.randomBytes(length)).toString('hex')}`;
}
