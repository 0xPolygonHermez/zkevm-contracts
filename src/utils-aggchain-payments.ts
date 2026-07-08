/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-syntax */
import * as ethers from 'ethers';

/// ///////////////////////////////////////
/// // Constants for Aggchain Payments  ////
/// ///////////////////////////////////////

// aggchain type selector for Payments (same 2-byte type as FEP: 0x0001)
export const AGGCHAIN_TYPE_PAYMENTS = '0x0001';

/// ///////////////////////////////////////
/// // Functions for Aggchain Payments  ////
/// ///////////////////////////////////////

/**
 * Function to encode the custom chain data for the `getAggchainHash` &
 * `onVerifyPessimistic` functions.
 * @param {String} aggchainVKeySelector aggchain vkey selector (bytes4)
 * @param {String} newStateRoot proposed new state root (bytes32)
 * @param {Number|BigInt} endBlock proposed end block number (uint256)
 * @returns {String} ABI-encoded value in hexadecimal string
 */
export function encodeAggchainDataPayments(aggchainVKeySelector, newStateRoot, endBlock) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes4', 'bytes32', 'uint256'],
        [aggchainVKeySelector, newStateRoot, endBlock],
    );
}

/**
 * Compute the aggchain parameters hash for Payments.
 *   aggchain_params = keccak256(abi.encodePacked(lastStateRoot, newStateRoot, endBlock))
 * @param {String} lastStateRoot the current stored state root (bytes32)
 * @param {String} newStateRoot the proposed new state root (bytes32)
 * @param {Number|BigInt} endBlock proposed end block number (uint256)
 * @returns {String} aggchain params hash
 */
export function computeHashAggchainParamsPayments(lastStateRoot, newStateRoot, endBlock) {
    // solidity keccak256(abi.encodePacked(...))
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32', 'uint256'], [lastStateRoot, newStateRoot, endBlock]);
}
