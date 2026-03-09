/* eslint-disable no-console */
import { ethers, run } from 'hardhat';
import { convertBigIntsToNumbers } from '../tools/utils';
import { logger } from '../src/logger';

/**
 * Generates a timelock operation with the given input valies
 * @param target The timelock contract address to call
 * @param value Amount of ether to sent to the call
 * @param data The encoded data of the transaction to execute
 * @param predecessor timelock operation predecessor
 * @param salt timelock operation salt
 * @returns The timelock operation params
 */
function genTimelockOperation(target: any, value: any, data: any, predecessor: any, salt: any) {
    const abiEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256', 'bytes', 'uint256', 'bytes32'],
        [target, value, data, predecessor, salt],
    );
    const id = ethers.keccak256(abiEncoded);
    return {
        id,
        target,
        value,
        data,
        predecessor,
        salt,
    };
}

/**
 * Generates a timelock batch operation with the given input values
 * @param targets Array of contract addresses to call
 * @param values Array of ether values to send to each call
 * @param datas Array of encoded data for each transaction to execute
 * @param predecessor timelock operation predecessor (bytes32)
 * @param salt timelock operation salt (bytes32)
 * @returns The timelock batch operation params
 */
function genTimelockBatchOperation(targets: string[], values: any[], datas: any[], predecessor: any, salt: any) {
    const abiEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address[]', 'uint256[]', 'bytes[]', 'bytes32', 'bytes32'],
        [targets, values, datas, predecessor, salt],
    );
    const id = ethers.keccak256(abiEncoded);
    return {
        id,
        targets,
        values,
        datas,
        predecessor,
        salt,
    };
}

/**
 * Function to handle the verification of a contract on etherscan
 * @param implementationAddress the contract address to verify
 * @param constructorArguments the constructor arguments of the contract
 * @param waitTimeSeconds optional wait time in seconds before verification (default: 20)
 * @dev In case the verification fails, the function will print the command to run the verification manually
 */
async function verifyContractEtherscan(
    implementationAddress: string,
    constructorArguments: Array<any>,
    waitTimeSeconds: number = 20,
    contractPath: any = undefined,
) {
    try {
        logger.info(
            `Trying to verify implementation contract ${implementationAddress} with arguments ${JSON.stringify(constructorArguments)}`,
        );
        // wait a few seconds before trying etherscan verification
        logger.info(`Waiting ${waitTimeSeconds} seconds before verifying on Etherscan`);
        await new Promise((r) => {
            setTimeout(r, waitTimeSeconds * 1000);
        });
        logger.info('Verifying...');
        // verify
        await run('verify:verify', {
            address: implementationAddress,
            constructorArguments,
            contract: contractPath,
        });
        logger.info(`✅ Contract ${implementationAddress} verified successfully on Etherscan`);
    } catch (error: any) {
        if (error.name === 'ContractAlreadyVerifiedError') {
            logger.info(`✅ Contract ${implementationAddress} is already verified on Etherscan`);
            return true;
        }
        logger.error('❌ Error verifying the new implementation contract: ', error);
        logger.info('you can verify the new impl address with:');
        logger.info(
            `npx hardhat verify --constructor-args upgrade/arguments.js ${implementationAddress} --network ${process.env.HARDHAT_NETWORK}\n`,
        );
        logger.info(
            'Copy the following constructor arguments on: upgrade/arguments.js \n',
            JSON.stringify(constructorArguments),
        );
        return false;
    }
    return true;
}

/**
 * Track contract verification and return result object
 * @param contractName Name of the contract for tracking purposes
 * @param address Contract address to verify
 * @param constructorArgs Constructor arguments for verification
 * @param waitTimeSeconds Wait time before verification (default: 20)
 * @param contractPath Optional contract path for verification
 * @returns Verification result object: "OK" if successful, or object with failure details
 */
async function trackVerification(
    contractName: string,
    address: string,
    constructorArgs: any[] = [],
    waitTimeSeconds: number = 20,
    contractPath: any = undefined,
): Promise<string | object> {
    try {
        const success = await verifyContractEtherscan(address, constructorArgs, waitTimeSeconds, contractPath);
        if (success) {
            logger.info(`✓ ${contractName} verified successfully`);
            return 'OK';
        }
        logger.warn(`⚠️ ${contractName} verification failed`);
        return {
            status: 'FAILED',
            address,
            constructorArgs,
            error: 'Verification failed',
        };
    } catch (error: any) {
        logger.warn(`⚠️ ${contractName} verification failed: ${error.message}`);
        return {
            status: 'FAILED',
            address,
            constructorArgs,
            error: error.message,
        };
    }
}

/**
 * Decode the data of a schedule transaction to a timelock contract for better readability
 * @param scheduleData The data of the schedule transaction
 * @param proxyAdmin The proxy admin contract
 * @returns The decoded data
 */
async function decodeScheduleData(scheduleData: any, contractFactory: any) {
    const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
    const timelockTx = timelockContractFactory.interface.parseTransaction({ data: scheduleData });
    const objectDecoded = {} as any;
    const paramsArray = timelockTx?.fragment.inputs as any;
    for (let i = 0; i < paramsArray?.length; i++) {
        const currentParam = paramsArray[i];
        objectDecoded[currentParam.name] = timelockTx?.args[i];

        if (currentParam.name === 'data') {
            const decodedData = contractFactory.interface.parseTransaction({
                data: timelockTx?.args[i],
            });
            const objectDecodedData = {} as any;
            const paramsArrayData = decodedData?.fragment.inputs as any;

            objectDecodedData.signature = decodedData?.signature;
            objectDecodedData.selector = decodedData?.selector;

            for (let j = 0; j < paramsArrayData?.length; j++) {
                const currentParamData = paramsArrayData[j];
                objectDecodedData[currentParamData.name] = decodedData?.args[j];
            }
            objectDecoded.decodedData = objectDecodedData;
        } else if (currentParam.name === 'payloads') {
            // for each payload
            const payloads = timelockTx?.args[i];
            for (let j = 0; j < payloads.length; j++) {
                const data = payloads[j];
                const decodedProxyAdmin = contractFactory.interface.parseTransaction({
                    data,
                });

                const resultDecodeProxyAdmin = {} as any;
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
    return convertBigIntsToNumbers(objectDecoded);
}

/**
 * Decode the data of a schedule transaction to a timelock contract for better readability
 * Tries to decode with multiple contract factories to find the right match for each payload
 * @param scheduleData The data of the schedule transaction
 * @param contractFactories Array of contract factories to try decoding with
 * @returns The decoded data
 */
async function decodeScheduleBatchData(scheduleData: any, contractFactories: any[]) {
    const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
    const timelockTx = timelockContractFactory.interface.parseTransaction({ data: scheduleData });
    const objectDecoded = {} as any;
    const paramsArray = timelockTx?.fragment.inputs as any;

    for (let i = 0; i < paramsArray?.length; i++) {
        const currentParam = paramsArray[i];
        objectDecoded[currentParam.name] = timelockTx?.args[i];

        if (currentParam.name === 'data') {
            // Try to decode single data with multiple factories
            const data = timelockTx?.args[i];
            let decodedData = null;

            // eslint-disable-next-line no-restricted-syntax
            for (const factory of contractFactories) {
                try {
                    const decodedAttempt = factory.interface.parseTransaction({ data });
                    if (decodedAttempt) {
                        decodedData = decodedAttempt;
                        break;
                    }
                } catch (error) {
                    // eslint-disable-next-line no-continue
                    continue;
                }
            }

            if (decodedData) {
                const objectDecodedData = {} as any;
                const paramsArrayData = decodedData?.fragment.inputs as any;

                objectDecodedData.signature = decodedData?.signature;
                objectDecodedData.selector = decodedData?.selector;

                for (let j = 0; j < paramsArrayData?.length; j++) {
                    const currentParamData = paramsArrayData[j];
                    objectDecodedData[currentParamData.name] = decodedData?.args[j];
                }
                objectDecoded.decodedData = objectDecodedData;
            }
        } else if (currentParam.name === 'payloads') {
            // for each payload
            const payloads = timelockTx?.args[i];
            for (let j = 0; j < payloads.length; j++) {
                const data = payloads[j];
                let decodedProxyAdmin = null;

                // Try to decode with each contract factory
                // eslint-disable-next-line no-restricted-syntax
                for (const factory of contractFactories) {
                    try {
                        const decodedAttempt = factory.interface.parseTransaction({ data });
                        if (decodedAttempt) {
                            decodedProxyAdmin = decodedAttempt;
                            break;
                        }
                    } catch (error) {
                        // eslint-disable-next-line no-continue
                        continue;
                    }
                }

                const resultDecodeProxyAdmin = {} as any;
                if (decodedProxyAdmin) {
                    resultDecodeProxyAdmin.signature = decodedProxyAdmin?.signature;
                    resultDecodeProxyAdmin.selector = decodedProxyAdmin?.selector;

                    const paramsArrayData = decodedProxyAdmin?.fragment.inputs;

                    for (let n = 0; n < paramsArrayData?.length; n++) {
                        const currentParamData = paramsArrayData[n];
                        resultDecodeProxyAdmin[currentParamData.name] = decodedProxyAdmin?.args[n];
                    }
                } else {
                    resultDecodeProxyAdmin.error = 'Could not decode with any provided contract factory';
                    resultDecodeProxyAdmin.rawData = data;
                }
                objectDecoded[`decodePayload_${j}`] = resultDecodeProxyAdmin;
            }
        }
    }
    return convertBigIntsToNumbers(objectDecoded);
}

// This is a workaround to fix the BigInt serialization issue in JSON
// when using JSON.stringify on BigInt values, which is common in Ethers
// eslint-disable-next-line no-extend-native
Object.defineProperty(BigInt.prototype, 'toJSON', {
    get() {
        return () => String(this);
    },
});

export {
    genTimelockOperation,
    verifyContractEtherscan,
    decodeScheduleData,
    decodeScheduleBatchData,
    trackVerification,
    genTimelockBatchOperation,
};
