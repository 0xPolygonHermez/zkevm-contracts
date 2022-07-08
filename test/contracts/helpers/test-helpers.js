/* eslint-disable no-await-in-loop */
const { stateUtils } = require('@0xpolygonhermez/zkevm-commonjs');

async function setGenesisBlock(addressArray, amountArray, nonceArray, smt) {
    let currentRoot = smt.empty;
    for (let i = 0; i < addressArray.length; i++) {
        currentRoot = await stateUtils.setAccountState(addressArray[i], smt, currentRoot, amountArray[i], nonceArray[i]);
    }

    return currentRoot;
}

module.exports = {
    setGenesisBlock,
};
