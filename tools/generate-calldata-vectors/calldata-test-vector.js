/* eslint-disable no-await-in-loop, no-loop-func */
const hre = require('hardhat'); // eslint-disable-line
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

const testVectors = require('../../test/src/zk-EVM/helpers/test-vector-data/state-transition.json');

async function main() {
    // deploy proof of efficiency
    const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiencyMock');
    const callDataTestVectors = [];
    const maticAmount = ethers.utils.parseEther('1');

    for (let i = 0; i < testVectors.length; i++) {
        const {
            id,
            txs,
            batchL2Data,
        } = testVectors[i];

        const fullCallData = ProofOfEfficiencyFactory.interface.encodeFunctionData('sendBatch', [
            batchL2Data,
            maticAmount,
        ]);

        callDataTestVectors.push({
            id,
            txs,
            batchL2Data,
            maticAmount: maticAmount.toString(),
            fullCallData,
        });
    }
    const dir = path.join(__dirname, './calldata-test-vector.json');
    await fs.writeFileSync(dir, JSON.stringify(callDataTestVectors, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
