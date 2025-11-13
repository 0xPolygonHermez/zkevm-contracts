/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import path = require('path');

import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { time, reset, setBalance } from '@nomicfoundation/hardhat-network-helpers';
import { PolygonRollupManager, PolygonZkEVMTimelock } from '../../../typechain-types';

import deployOutputParameters from './deploy_output_mainnet.json';
import updateOutput from './updateRollupOutput.json';
import addRollupTypeOutput from './add_rollup_type_output.json';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
    const deployer = (await ethers.getSigners())[0];
    console.log('using signer: ', deployer.address);

    // hard fork
    const rpc = `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`;
    await reset(rpc);
    await setBalance(deployer.address, 100n ** 18n);

    // Get timelock multisig
    const timelockMultisig = '0x242daE44F5d8fb54B198D03a94dA45B5a4413e21';
    await ethers.provider.send('hardhat_impersonateAccount', [timelockMultisig]);
    const multisigSigner = await ethers.getSigner(timelockMultisig as any);
    await setBalance(timelockMultisig, 100n ** 18n);

    const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
    const timelockContract = (await timelockContractFactory.attach(
        deployOutputParameters.timelockContractAddress,
    )) as PolygonZkEVMTimelock;

    const timelockDelay = await timelockContract.getMinDelay();

    const txScheduleAddType = {
        to: timelockContract.target,
        data: addRollupTypeOutput.scheduleData,
    };

    await (await multisigSigner.sendTransaction(txScheduleAddType)).wait();

    const txScheduleUpdate = {
        to: timelockContract.target,
        data: updateOutput.scheduleData,
    };

    await (await multisigSigner.sendTransaction(txScheduleUpdate)).wait();

    await time.increase(timelockDelay);

    // send mutlsig transaction
    const txExecuteAddType = {
        to: timelockContract.target,
        data: addRollupTypeOutput.executeData,
    };

    await (await multisigSigner.sendTransaction(txExecuteAddType)).wait();

    const txExecuteUpdate = {
        to: timelockContract.target,
        data: updateOutput.executeData,
    };

    await (await multisigSigner.sendTransaction(txExecuteUpdate)).wait();

    const RollupMangerFactory = await ethers.getContractFactory('PolygonRollupManager');
    const rollupManager = (await RollupMangerFactory.attach(
        deployOutputParameters.polygonZkEVMAddress,
    )) as PolygonRollupManager;

    expect(await rollupManager.rollupCount()).to.be.equal(2);
    expect(await rollupManager.rollupTypeCount()).to.be.equal(2);
    console.log('Contracts upgraded');

    // Deploy a validium
    const verifierAddress = addRollupTypeOutput.decodedScheduleData.decodedData.verifier;

    const rollupDataFinal = await rollupManager.rollupIDToRollupData(1);
    expect(rollupDataFinal.rollupContract).to.be.equal('0x519E42c24163192Dca44CD3fBDCEBF6be9130987');
    expect(rollupDataFinal.chainID).to.be.equal(1101);
    expect(rollupDataFinal.verifier).to.be.equal(verifierAddress);
    expect(rollupDataFinal.forkID).to.be.equal(8);
    expect(rollupDataFinal.rollupTypeID).to.be.equal(2);
    expect(rollupDataFinal.rollupCompatibilityID).to.be.equal(0);

    console.log('Updated zkevm Succedd');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
