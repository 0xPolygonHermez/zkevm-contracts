const ethers = require('ethers');
const { Scalar } = require('ffjavascript');

/**
 * Function to get an even hexString that starts with "0x" from a number or a hexString of another format
 * @param { Number | String } num Number
 * @returns hexString
 */
function toHexString(num) {
    let numHex;
    if (typeof num === 'number') {
        numHex = Scalar.toString(Scalar.e(num), 16);
    } else if (typeof num === 'string') {
        numHex = num.startsWith('0x') ? num.slice(2) : num;
    }
    numHex = (numHex.length % 2 === 1) ? (`0x0${numHex}`) : (`0x${numHex}`);
    return numHex;
}

/**
 * Function to get an RLP encode: rlp(nonce, gasprice, startgas, to, value, data, chainid, 0, 0)
 * @param {Object} tx = { nonce, gasPrice, gasLimit, to, value, data, chainId}
 */
function encodeTx(tx) {
    const encodedTx = ethers.utils.RLP.encode([
        toHexString(tx.nonce),
        tx.gasPrice._isBigNumber ? tx.gasPrice.toHexString(16) : toHexString(tx.gasPrice),
        tx.gasLimit._isBigNumber ? tx.gasLimit.toHexString(16) : toHexString(tx.gasLimit),
        tx.to,
        tx.value._isBigNumber ? tx.value.toHexString(16) : toHexString(tx.value),
        toHexString(tx.data),
        toHexString(tx.chainId),
        '0x',
        '0x',
    ]);
    return encodedTx;
}

/**
 * Function to get an RLP encode: rlp(nonce, gasprice, startgas, to, value, data, v, r, s)
 * @param {Object} tx = { nonce, gasPrice, gasLimit, to, value, data, chainId, v, r, s}
 */
function encodeSignedTx(tx) {
    const signedTx = ethers.utils.RLP.encode([
        toHexString(tx.nonce),
        tx.gasPrice._isBigNumber ? tx.gasPrice.toHexString(16) : toHexString(tx.gasPrice),
        tx.gasLimit._isBigNumber ? tx.gasLimit.toHexString(16) : toHexString(tx.gasLimit),
        tx.to,
        tx.value._isBigNumber ? tx.value.toHexString(16) : toHexString(tx.value),
        toHexString(tx.data),
        toHexString(tx.v),
        toHexString(tx.r),
        toHexString(tx.s),
    ]);
    return signedTx;
}

/**
 * This function returns the address of the signer, from the hash and the signature.
 * @param {HexString} hash - signed hash
 * @param {HexString} signature - signature from hash
 * @returns hexString
 */
function returnFrom(hash, signature) {
    const from = ethers.utils.recoverAddress(hash, signature);
    return from;
}

module.exports = {
    encodeTx,
    encodeSignedTx,
    toHexString,
    returnFrom,
};
