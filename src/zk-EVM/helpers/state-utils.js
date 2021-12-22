const { Scalar } = require('ffjavascript');
const smtKeyUtils = require('./smt-key-utils');

/**
 * Get the current state of an ethereum address
 * @param {String} ethAddr ethereum address
 * @param {Object} smt merkle tree structure
 * @param {Uint8Array} root merkle tree root
 * @returns {Object} ethereum address state
 */
async function getState(ethAddr, smt, root) {
    const keyBalance = await smtKeyUtils.keyEthAddrBalance(ethAddr, smt.arity);
    const keyNonce = await smtKeyUtils.keyEthAddrNonce(ethAddr, smt.arity);

    let response;
    try {
        const resBalance = await smt.get(root, keyBalance);
        const resNonce = await smt.get(root, keyNonce);
        response = {
            balance: resBalance.value,
            nonce: resNonce.value,
        };
    } catch (error) {
        response = {
            balance: Scalar.e(0),
            nonce: Scalar.e(0),
        };
    }
    return response;
}

/**
 * Set a state of an ethereum address
 * @param {String} ethAddr ethereum address
 * @param {Object} smt merkle tree structure
 * @param {Uint8Array} root merkle tree root
 * @param {Scalar|Number} balance new balance
 * @param {Scalar|Number} nonce new nonce
 * @returns {Uint8Array} new state root
 */
async function setAccountState(ethAddr, smt, root, balance, nonce) {
    const keyBalance = await smtKeyUtils.keyEthAddrBalance(ethAddr, smt.arity);
    const keyNonce = await smtKeyUtils.keyEthAddrNonce(ethAddr, smt.arity);

    let auxRes = await smt.set(root, keyBalance, Scalar.e(balance));
    auxRes = await smt.set(auxRes.newRoot, keyNonce, Scalar.e(nonce));

    return auxRes.newRoot;
}

module.exports = {
    getState,
    setAccountState,
};
