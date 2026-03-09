import * as ethers from 'ethers';

/// //////////////////////////////
/// // Constants for Aggchain ////
/// //////////////////////////////

// aggchain type constant to define an aggchain using pessimistic proof v0.3.0
export const CONSENSUS_TYPE = {
    LEGACY: 0,
    GENERIC: 1,
};

export const AGGCHAIN_CONTRACT_NAMES = {
    ECDSA: 'AggchainECDSAMultisig',
    FEP: 'AggchainFEP',
};

export const ARRAY_AGGCHAIN_SUPPORTED_NAMES = ['AggchainECDSAMultisig', 'AggchainFEP'];

/// //////////////////////////////
/// // Functions for Aggchain ////
/// //////////////////////////////

/**
 * Compute aggchain hash
 * @param {Number|BigInt} aggchainType agg chain type (ECDSA: 0, FEP: 1)
 * @param {String} aggchainVKey aggchain verification key
 * @param {String} hashAggchainParams hash aggchain params
 * @param {String} signersHash hash of the signers array (keccak256(abi.encodePacked(threshold, aggchainSigners)))
 * @returns compute aggchain hash
 */
export function computeAggchainHash(aggchainType, aggchainVKey, hashAggchainParams, signersHash) {
    // sanity check
    if (Number(aggchainType) !== CONSENSUS_TYPE.GENERIC) {
        throw new Error(`Invalid aggchain type for v0.3.0. Must be ${CONSENSUS_TYPE.GENERIC}`);
    }

    // solidity keccak - now excludes threshold as requested
    return ethers.solidityPackedKeccak256(
        ['uint32', 'bytes32', 'bytes32', 'bytes32'],
        [aggchainType, aggchainVKey, hashAggchainParams, signersHash],
    );
}

/**
 * Encodes the vKey selector for aggchain
 * @param {String} _aggchainVKeyVersion aggchain vkey selector
 * @param {String} _aggchainType aggchain selector type (ECDSA:0, FEP: 1)
 * @returns AggchainVKeySelector
 */
export function getAggchainVKeySelector(_aggchainVKeyVersion, _aggchainType) {
    // remove "0x" if ot exist on aggchainSelector with startWith method
    const aggchainVKeyVersion = _aggchainVKeyVersion.startsWith('0x')
        ? _aggchainVKeyVersion.slice(2)
        : _aggchainVKeyVersion;

    // remove "0x" if ot exist on _aggchainType with startWith method
    const aggchainType = _aggchainType.startsWith('0x') ? _aggchainType.slice(2) : _aggchainType;

    // check lenght is 2 bytes
    if (aggchainType.length !== 4) {
        throw new Error('aggchainType must be 2 bytes long');
    }

    if (aggchainVKeyVersion.length !== 4) {
        throw new Error('aggchainVKeyVersion must be 2 bytes long');
    }

    return `0x${aggchainVKeyVersion}${aggchainType}`;
}

/**
 * Extract the aggchainType from the selector
 * @param {String} _aggchainVKeySelector aggchain vkey selector
 * @returns AggchainType
 */
export function getAggchainTypeFromSelector(_aggchainVKeySelector) {
    // remove "0x" if it exist on aggchainVKeySelector with startWith method
    const aggchainVKeySelector = _aggchainVKeySelector.startsWith('0x')
        ? _aggchainVKeySelector.slice(2)
        : _aggchainVKeySelector;

    // check lenght is 8 bytes
    if (aggchainVKeySelector.length !== 8) {
        throw new Error('aggchainVKeySelector must be 4 bytes long');
    }

    return `0x${aggchainVKeySelector.slice(4, 8)}`;
}

/**
 * Extract the aggchainType from the selector
 * @param {String} _aggchainVKeySelector aggchain vkey selector
 * @returns AggchainType
 */
export function getAggchainVKeyVersionFromSelector(_aggchainVKeySelector) {
    // remove "0x" if ot exist on aggchainVKeySelector with startWith method
    const aggchainVKeySelector = _aggchainVKeySelector.startsWith('0x')
        ? _aggchainVKeySelector.slice(2)
        : _aggchainVKeySelector;

    // check lenght is 4 bytes
    if (aggchainVKeySelector.length !== 8) {
        throw new Error('aggchainVKeySelector must be 4 bytes long');
    }

    return `0x${aggchainVKeySelector.slice(0, 4)}`;
}

/**
 * Function to encode the initialize bytes for pessimistic or state transition rollups
 * @param {String} admin Admin address
 * @param {String} trustedSequencer Trusted sequencer address
 * @param {String} gasTokenAddress Indicates the token address in mainnet that will be used as a gas token
 * @param {String} trustedSequencerURL Trusted sequencer URL
 * @param {String} networkName L2 network name
 * @returns {String} encoded value in hexadecimal string
 */
export function encodeInitializeBytesLegacy(admin, sequencer, gasTokenAddress, sequencerURL, networkName) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'address', 'string', 'string'],
        [admin, sequencer, gasTokenAddress, sequencerURL, networkName],
    );
}

/**
 * Function to encode the initialize bytes for aggchain manager
 * @param {String} aggchainManager Aggchain manager address
 * @returns {String} Encoded value in hexadecimal string
 */
export function encodeInitAggchainManager(aggchainManager) {
    return ethers.AbiCoder.defaultAbiCoder().encode(['address'], [aggchainManager]);
}

/**
 * Compute the signers hash for aggchain contracts
 * @param {Number|BigInt} threshold The threshold value for the multisig
 * @param {String[]} signers Array of signer addresses
 * @returns {String} Hash of the threshold and signers array
 */
export function computeSignersHash(threshold: number | bigint, signers: string[]): string {
    return ethers.solidityPackedKeccak256(['uint256', 'address[]'], [threshold, signers]);
}
