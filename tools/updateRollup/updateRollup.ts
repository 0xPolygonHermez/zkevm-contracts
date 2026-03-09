/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, import/extensions */
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import { ethers, network } from 'hardhat';
import { AgglayerManager } from '../../typechain-types';
import { transactionTypes, genOperation } from '../utils';
import '../../deployment/helpers/utils';
import { UPDATE_ROLLUP_ROLE } from '../../src/constants';
import updateRollupsParameters from './updateRollup.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dateStr = new Date().toISOString();
const pathOutputJson = path.join(__dirname, `./updateRollupOutput-${dateStr}.json`);

async function main() {
    /*
     * Check parameters
     * Check that every necessary parameter is fullfilled
     */
    const mandatoryDeploymentParameters = ['type', 'polygonRollupManagerAddress'];

    // check create rollup type
    switch (updateRollupsParameters.type) {
        case transactionTypes.EOA:
        case transactionTypes.MULTISIG:
            break;
        case transactionTypes.TIMELOCK:
            mandatoryDeploymentParameters.push('timelockDelay');
            break;
        default:
            throw new Error(`Invalid type ${updateRollupsParameters.type}`);
    }

    mandatoryDeploymentParameters.forEach((parameterName: string) => {
        const value = updateRollupsParameters[parameterName as keyof typeof updateRollupsParameters];
        if (value === undefined || value === '') {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    });

    console.log(`Starting script to update rollup from ${updateRollupsParameters.type}`);

    // Load provider
    let currentProvider = ethers.provider;
    if (updateRollupsParameters.multiplierGas || updateRollupsParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== 'hardhat') {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            ) as any;
            if (updateRollupsParameters.maxPriorityFeePerGas && updateRollupsParameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${updateRollupsParameters.maxPriorityFeePerGas} gwei, MaxFee${updateRollupsParameters.maxFeePerGas} gwei`,
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(updateRollupsParameters.maxFeePerGas, 'gwei'),
                    ethers.parseUnits(updateRollupsParameters.maxPriorityFeePerGas, 'gwei'),
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log('Multiplier gas used: ', updateRollupsParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feedata.maxFeePerGas as bigint) * BigInt(updateRollupsParameters.multiplierGas)) / 1000n,
                        ((feedata.maxPriorityFeePerGas as bigint) * BigInt(updateRollupsParameters.multiplierGas)) /
                            1000n,
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (updateRollupsParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(updateRollupsParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0",
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    console.log('Using with: ', deployer.address);

    const { polygonRollupManagerAddress } = updateRollupsParameters;

    // Load Rollup manager
    const PolgonRollupManagerFactory = await ethers.getContractFactory('AgglayerManager', deployer);
    const rollupManagerContract = PolgonRollupManagerFactory.attach(polygonRollupManagerAddress) as AgglayerManager;

    const outputsJson = [] as any;

    // Timelock vars
    const operations = {} as any;
    operations.target = [];
    operations.value = [];
    operations.data = [];
    const predecessor = ethers.ZeroHash;
    const salt = updateRollupsParameters.timelockSalt || ethers.ZeroHash;

    if (updateRollupsParameters.rollups.length === 0) {
        throw new Error('No rollups');
    } else {
        for (let i = 0; i < updateRollupsParameters.rollups.length; i++) {
            const outputJson = {} as any;
            const updateRollupParameters = updateRollupsParameters.rollups[i];
            /*
             * Check parameters
             * Check that every necessary parameter is fullfilled
             */
            const mandatoryParametersRollup = ['rollupAddress', 'newRollupTypeID', 'upgradeData'];

            mandatoryParametersRollup.forEach((parameterName: string) => {
                const value = updateRollupParameters[parameterName as keyof typeof updateRollupParameters];
                if (value === undefined || value === '') {
                    throw new Error(`Missing parameter: ${parameterName}`);
                }
            });

            const { rollupAddress, newRollupTypeID, upgradeData } = updateRollupParameters;

            outputJson.networkName = network.name;
            outputJson.polygonRollupManagerAddress = polygonRollupManagerAddress;
            outputJson.rollupAddress = rollupAddress;
            outputJson.newRollupTypeID = newRollupTypeID;
            outputJson.upgradeData = upgradeData;

            if (updateRollupsParameters.type === transactionTypes.EOA) {
                // Check role
                if ((await rollupManagerContract.hasRole(UPDATE_ROLLUP_ROLE, deployer.address)) === false) {
                    // log that address has no role
                    throw new Error(`Address ${deployer.address} does not have the UPDATE_ROLLUP_ROLE role`);
                }
                console.log(`Updating rollup ${rollupAddress}...`);
                try {
                    console.log(
                        await (
                            await rollupManagerContract.updateRollup(rollupAddress, newRollupTypeID, upgradeData)
                        ).wait(),
                    );
                    outputJson.successUpdate = true;
                } catch (e) {
                    outputJson.successUpdate = false;
                    console.log(`Error updating ${rollupAddress}`);
                    console.log(e);
                }
            } else if (updateRollupsParameters.type === transactionTypes.TIMELOCK) {
                console.log(`Creating timelock txs for update rollup ${rollupAddress}...`);
                const operation = genOperation(
                    polygonRollupManagerAddress,
                    0, // value
                    PolgonRollupManagerFactory.interface.encodeFunctionData('updateRollup', [
                        rollupAddress,
                        newRollupTypeID,
                        upgradeData,
                    ]),
                    predecessor, // predecessor
                    salt, // salt
                );
                operations.target.push(operation.target);
                operations.value.push(operation.value);
                operations.data.push(operation.data);
            } else {
                console.log(`Creating calldata for update rollup from multisig ${rollupAddress}...`);
                const txUpdateRollup = PolgonRollupManagerFactory.interface.encodeFunctionData('updateRollup', [
                    rollupAddress,
                    newRollupTypeID,
                    upgradeData,
                ]);
                outputJson.txUpdateRollup = txUpdateRollup;
            }
            outputsJson.push(outputJson);
        }

        // if type === Timelock --> get scheduleData & executeData
        if (updateRollupsParameters.type === transactionTypes.TIMELOCK) {
            console.log(`Get scheduleData & executeData...`);
            const { timelockDelay } = updateRollupsParameters;
            // load timelock
            const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);

            // Schedule operation
            const scheduleData = timelockContractFactory.interface.encodeFunctionData('scheduleBatch', [
                operations.target,
                operations.value,
                operations.data,
                predecessor,
                salt,
                timelockDelay,
            ]);

            // Execute operation
            const executeData = timelockContractFactory.interface.encodeFunctionData('executeBatch', [
                operations.target,
                operations.value,
                operations.data,
                predecessor,
                salt,
            ]);

            console.log({ scheduleData });
            console.log({ executeData });

            // Decode the scheduleData for better readibility
            const timelockTx = timelockContractFactory.interface.parseTransaction({
                data: scheduleData,
            });
            const paramsArray = timelockTx?.fragment.inputs;
            const objectDecoded = {};

            for (let i = 0; i < paramsArray?.length; i++) {
                const currentParam = paramsArray[i];
                objectDecoded[currentParam.name] = timelockTx?.args[i];

                if (currentParam.name === 'payloads') {
                    // for each payload
                    const payloads = timelockTx?.args[i];
                    for (let j = 0; j < payloads.length; j++) {
                        const data = payloads[j];
                        const decodedProxyAdmin = PolgonRollupManagerFactory.interface.parseTransaction({
                            data,
                        });

                        const resultDecodeProxyAdmin = {};
                        resultDecodeProxyAdmin.signature = decodedProxyAdmin?.signature;
                        resultDecodeProxyAdmin.selector = decodedProxyAdmin?.selector;

                        const paramsArrayData = decodedProxyAdmin?.fragment.inputs;

                        for (let n = 0; n < paramsArrayData?.length; n++) {
                            const currentParamData = paramsArrayData[n];
                            resultDecodeProxyAdmin[currentParamData.name] = decodedProxyAdmin?.args[n];
                        }
                        objectDecoded[`decodePayload_${j}`] = resultDecodeProxyAdmin;
                    }
                }
            }
            const outputTimelock = {
                rollups: outputsJson,
                scheduleData,
                executeData,
                decodeScheduleData: objectDecoded,
            };

            fs.writeFileSync(pathOutputJson, JSON.stringify(outputTimelock, null, 1));
        } else {
            fs.writeFileSync(pathOutputJson, JSON.stringify(outputsJson, null, 1));
        }

        console.log('Finished script, output saved at: ', pathOutputJson);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
