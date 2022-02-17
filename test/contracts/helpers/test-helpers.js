/* eslint-disable no-await-in-loop */
const { stateUtils } = require('@polygon-hermez/zkevm-commonjs');

async function setGenesisBlock(addressArray, amountArray, nonceArray, smt) {
    let currentRoot = smt.F.zero;
    for (let i = 0; i < addressArray.length; i++) {
        currentRoot = await stateUtils.setAccountState(addressArray[i], smt, currentRoot, amountArray[i], nonceArray[i]);
    }

    return currentRoot;
}

module.exports = {
    setGenesisBlock,
};
