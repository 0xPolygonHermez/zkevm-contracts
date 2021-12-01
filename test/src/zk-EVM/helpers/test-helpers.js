/* eslint-disable no-await-in-loop */
const stateUtils = require('../../../../src/zk-EVM/helpers/state-utils');

async function setGenesisBlock(addressArray, amountArray, nonceArray, smt, F) {
    let currentRoot = F.zero;
    for (let i = 0; i < addressArray.length; i++) {
        currentRoot = await stateUtils.setAccountState(addressArray[i], smt, currentRoot, amountArray[i], nonceArray[i]);
    }

    return currentRoot;
}

module.exports = {
    setGenesisBlock,
};
