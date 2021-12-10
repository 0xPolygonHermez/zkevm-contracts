/* eslint-disable no-await-in-loop, no-console */
const { Scalar } = require('ffjavascript');
const ethers = require('ethers');

/**
 * Converts a decimal string into a 32 bytes hex stirng
 * @param {String} value decimal string
 * @returns {String} 32 bytes hex stirng
*/
function stringToHex32(value, leftAppend = false) {
    const aux = Scalar.e(value).toString(16).padStart(64, '0');
    return leftAppend ? `0x${aux}` : aux;
}

/**
 * Converts a uint8Array into a 32 bytes hex stirng
 * @param {Uint8Array} value decimal string
 * @returns {String} 32 bytes hex stirng
*/
function fromUint8ArrayToHex(value, F, leftAppend = false) {
    const aux = F.toString(value, 16).padStart(64, '0');
    return leftAppend ? `0x${aux}` : aux;
}

/**
 * Converts a 32 bytes hex string stirng into a uint8Array
 * @param {String} value hex string
 * @returns {uint8Array} uint8Array
*/
function fromStringToUint8Array(value, F) {
    const valueHex = value.startsWith('0x') ? value : `0x${value}`;
    return F.e(valueHex);
}
/**
 * Encodes using RLP all the rawTx
 * @param {Array} arrayRawTx Array of strings of rawTxs
 * @returns {String} All rawTx encoded
*/
function fromArrayRawTxToString(arrayRawTx) {
    return ethers.utils.RLP.encode(arrayRawTx);
}

/**
 * Decode RLP the rawTx in a string into an array of rawTxs
 * @param {String} stringTx RLP encoded all raw txs
 * @returns {Array} Array of strings of rawTxs
*/
function fromStringToArrayRawTx(stringTx) {
    return ethers.utils.RLP.decode(stringTx);
}

module.exports = {
    stringToHex32,
    fromUint8ArrayToHex,
    fromArrayRawTxToString,
    fromStringToUint8Array,
    fromStringToArrayRawTx,
};
