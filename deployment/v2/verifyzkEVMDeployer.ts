/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/no-dynamic-require, no-await-in-loop, no-restricted-syntax, guard-for-in */
import * as path from 'path';
import * as hre from 'hardhat';
import { expect } from 'chai';

const pathDeployParameters = path.join(__dirname, './deploy_parameters.json');
const deployParameters = require(pathDeployParameters);
require('dotenv').config();

async function main() {
    // load deployer account
    if (typeof process.env.ETHERSCAN_API_KEY === 'undefined') {
        throw new Error('Etherscan API KEY has not been defined');
    }

    // verify zkEVM deployer
    try {
        await hre.run('verify:verify', {
            address: deployParameters.zkEVMDeployerAddress,
            constructorArguments: [deployParameters.initialZkEVMDeployerOwner],
        });
    } catch (error) {
        expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
