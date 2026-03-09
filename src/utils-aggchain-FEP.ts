/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-syntax */
import * as ethers from 'ethers';

/// //////////////////////////////////
/// // Constants for Aggchain FEP ////
/// //////////////////////////////////

// aggchain type selector for FEP
export const AGGCHAIN_TYPE_FEP = '0x0001';

/// //////////////////////////////////
/// // Functions for Aggchain FEP ////
/// //////////////////////////////////

/**
 * Function to encode the custom chain data for the `getAggchainHash` & `onVerifyPessimistic` functions
 * @param {String} aggchainVKeySelector aggchain vkey version
 * @param {String} outputRoot output root
 * @param {Number} l2BlockNumber L2 block number
 * @returns {String} encoded value in hexadecimal string
 */
export function encodeAggchainDataFEP(aggchainVKeySelector, outputRoot, l2BlockNumber) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes4', 'bytes32', 'uint256'],
        [aggchainVKeySelector, outputRoot, l2BlockNumber],
    );
}

/**
 * Compute the aggchain Parameters hash for FEP
 * @param {String} oldOutputRoot old output root
 * @param {String} newOutputRoot new output root
 * @param {BigInt} l2BlockNumber L2 block number
 * @param {BigInt} rollupConfigHash rollup config hash
 * @param {Bool} optimisticMode flag to optimistic mode
 * @param {String} trustedSequencer trusted sequencer address
 * @param {String} rangeVkeyCommitment rangeVkeyCommitment
 * @param {String} aggregationVkey aggregationVkey
 * @returns aggchain param hash
 */
export function computeHashAggchainParamsFEP(
    oldOutputRoot,
    newOutputRoot,
    l2BlockNumber,
    rollupConfigHash,
    optimisticMode,
    trustedSequencer,
    rangeVkeyCommitment,
    aggregationVkey,
) {
    // solidity keccak
    return ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32', 'uint256', 'uint256', 'bool', 'address', 'bytes32', 'bytes32'],
        [
            oldOutputRoot,
            newOutputRoot,
            l2BlockNumber,
            rollupConfigHash,
            optimisticMode,
            trustedSequencer,
            rangeVkeyCommitment,
            aggregationVkey,
        ],
    );
}
