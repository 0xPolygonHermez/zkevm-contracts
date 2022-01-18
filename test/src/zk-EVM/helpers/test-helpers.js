/* eslint-disable no-await-in-loop */
const { Scalar } = require('ffjavascript');
const stateUtils = require('../../../../src/zk-EVM/helpers/state-utils');

async function setGenesisBlock(addressArray, amountArray, nonceArray, smt) {
    let currentRoot = smt.F.zero;
    for (let i = 0; i < addressArray.length; i++) {
        currentRoot = await stateUtils.setAccountState(addressArray[i], smt, currentRoot, amountArray[i], nonceArray[i]);
    }

    return currentRoot;
}

function toHexStringRlp(num) {
    let numHex;
    if (typeof num === 'number' || typeof num === 'bigint' || typeof num === 'object') {
        numHex = Scalar.toString(Scalar.e(num), 16);
        // if it's an integer and it's value is 0, the standar is set to 0x, instead of 0x00 ( because says that always is codified in the shortest way)
        if (Scalar.e(num) === Scalar.e(0)) return '0x';
    } else if (typeof num === 'string') {
        numHex = num.startsWith('0x') ? num.slice(2) : num;
    }
    numHex = (numHex.length % 2 === 1) ? (`0x0${numHex}`) : (`0x${numHex}`);
    return numHex;
}

module.exports = {
    setGenesisBlock,
    toHexStringRlp,
};
