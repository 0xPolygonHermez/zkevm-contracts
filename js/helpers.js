const ethers = require("ethers");
const Scalar = require("ffjavascript").Scalar;

/**
 * Function to get an RLP encode: rlp(nonce, gasprice, startgas, to, value, data, chainid, 0, 0)
 * @param {Object} tx = { nonce, gasPrice, gasLimit, to, value, data, chainId}
*/
function encodeTx(tx) {
    const signedTx = ethers.utils.RLP.encode([
        toHexString(tx.nonce),
        tx.gasPrice._isBigNumber ? tx.gasPrice.toHexString(16) : toHexString(tx.gasPrice),
        tx.gasLimit._isBigNumber ? tx.gasLimit.toHexString(16) : toHexString(tx.gasLimit),
        tx.to,
        tx.value._isBigNumber ? tx.value.toHexString(16) : toHexString(tx.value),
        toHexString(tx.data),
        toHexString(tx.chainId),
        "0x",
        "0x"
    ]);
    return signedTx;
}

/**
 * Function to get an RLP encode: rlp(nonce, gasprice, startgas, to, value, data, chainid, 0, 0, v, r, s)
 * Gas cost is saved by not adding chainID to the calldata since it is inferred from the V.
 * Furthermore, we do not include the last two empty transactions parameters
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
        // toHexString(tx.chainId),
        // "0x",
        // "0x",
        toHexString(tx.v),
        toHexString(tx.r),
        toHexString(tx.s)
    ]);
    return signedTx;
}

/**
 * Function to get an even hexString that starts with "0x" from a number or a hexString of another format
 * @param { Number | String } num Number
 * @returns hexString
 */
function toHexString(num) {
    let numHex;
    if (typeof num == "number") {
        numHex = Scalar.toString(Scalar.e(num), 16);
    } else if (typeof num == "string") {
        numHex = num.startsWith("0x") ? num.slice(2) : num;
    }
    numHex = (numHex.length % 2 == 1) ? ("0x0" + numHex) : ("0x" + numHex);
    return numHex;
}

module.exports = {
    encodeTx,
    encodeSignedTx,
    toHexString
};