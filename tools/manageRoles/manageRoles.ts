/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import '../../deployment/helpers/utils';
import { genOperation } from '../utils';
import { logger } from '../../src/logger';
import { checkParams } from '../../src/utils';

import manageRolesParameters from './manageRoles.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dateStr = new Date().toISOString();
const pathOutputJson = path.join(__dirname, `./manageRolesOutput-${dateStr}.json`);

async function main() {
    /*
     * Check parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryParameters = ['timelockDelay', 'target'];

    checkParams(manageRolesParameters, mandatoryParameters);

    if (!manageRolesParameters.roles || manageRolesParameters.roles.length === 0) {
        throw new Error('No roles provided. Please provide at least one role in the roles array.');
    }

    const supportedRoles = [
        'ADD_ROLLUP_TYPE_ROLE',
        'OBSOLETE_ROLLUP_TYPE_ROLE',
        'CREATE_ROLLUP_ROLE',
        'ADD_EXISTING_ROLLUP_ROLE',
        'UPDATE_ROLLUP_ROLE',
        'TRUSTED_AGGREGATOR_ROLE',
        'TRUSTED_AGGREGATOR_ROLE_ADMIN',
        'TWEAK_PARAMETERS_ROLE',
        'SET_FEE_ROLE',
        'STOP_EMERGENCY_ROLE',
        'EMERGENCY_COUNCIL_ROLE',
        'EMERGENCY_COUNCIL_ADMIN',
        'TIMELOCK_ADMIN_ROLE',
        'PROPOSER_ROLE',
        'EXECUTOR_ROLE',
        'CANCELLER_ROLE',
    ];

    // Validate all role entries before processing
    const mandatoryParametersRole = ['action', 'roleName', 'account'];
    for (let i = 0; i < manageRolesParameters.roles.length; i++) {
        const roleEntry = manageRolesParameters.roles[i];

        checkParams(roleEntry, mandatoryParametersRole);

        const { action, roleName } = roleEntry;

        if (action !== 'grant' && action !== 'revoke') {
            throw new Error(`Invalid action for role ${i}: ${action}. Must be either 'grant' or 'revoke'.`);
        }

        if (!supportedRoles.includes(roleName)) {
            throw new Error(`Role is not supported: ${roleName}. Supported roles are: ${supportedRoles.join(', ')}`);
        }
    }

    // Start processing roles
    const { target, timelockDelay } = manageRolesParameters;
    const salt = manageRolesParameters.timelockSalt || ethers.ZeroHash;
    const predecessor = ethers.ZeroHash;

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');

    // Load AgglayerTimelock (inherits from TimelockController which inherits from AccessControl)
    // AccessControl has methods to grant and revoke roles
    const AgglayerTimelockFactory = await ethers.getContractFactory('AgglayerTimelock');

    const outputsJson = [] as any;

    // Timelock vars
    const operations = {} as any;
    operations.target = [];
    operations.value = [];
    operations.data = [];

    logger.info(`Processing ${manageRolesParameters.roles.length} role operation(s)...`);

    for (let i = 0; i < manageRolesParameters.roles.length; i++) {
        const outputJson = {} as any;
        const roleEntry = manageRolesParameters.roles[i];
        const { action, roleName, account } = roleEntry;

        const roleID = ethers.id(roleName);
        const functionName = action === 'grant' ? 'grantRole' : 'revokeRole';
        const calldata = AgglayerTimelockFactory.interface.encodeFunctionData(functionName, [roleID, account]);

        outputJson.action = action;
        outputJson.roleName = roleName;
        outputJson.roleID = roleID;
        outputJson.account = account;
        outputJson.calldata = calldata;

        const actionVerb = action === 'grant' ? 'granting' : 'revoking';
        const actionPreposition = action === 'grant' ? 'to' : 'from';
        logger.info(`Creating timelock tx for ${actionVerb} ${roleName} ${actionPreposition} ${account}...`);

        const operation = genOperation(
            target,
            0, // value
            calldata,
            predecessor, // predecessor
            salt, // salt
        );

        operations.target.push(operation.target);
        operations.value.push(operation.value);
        operations.data.push(operation.data);

        outputsJson.push(outputJson);
    }

    logger.info('Get scheduleData & executeData...');

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

    logger.info({ scheduleData });
    logger.info({ executeData });

    // Decode the scheduleData for better readability
    const timelockTx = timelockContractFactory.interface.parseTransaction({
        data: scheduleData,
    });
    const paramsArray = timelockTx?.fragment.inputs;
    const objectDecoded = {} as any;

    if (paramsArray) {
        for (let i = 0; i < paramsArray.length; i++) {
            const currentParam = paramsArray[i];
            objectDecoded[currentParam.name] = timelockTx?.args[i];

            if (currentParam.name === 'payloads') {
                // for each payload
                const payloads = timelockTx?.args[i];
                for (let j = 0; j < payloads.length; j++) {
                    const data = payloads[j];
                    const parsedTransaction = AgglayerTimelockFactory.interface.parseTransaction({
                        data,
                    });

                    const decodedOperation = {} as any;
                    decodedOperation.signature = parsedTransaction?.signature;
                    decodedOperation.selector = parsedTransaction?.selector;

                    const paramsArrayData = parsedTransaction?.fragment.inputs;

                    if (paramsArrayData) {
                        for (let n = 0; n < paramsArrayData.length; n++) {
                            const currentParamData = paramsArrayData[n];
                            decodedOperation[currentParamData.name] = parsedTransaction?.args[n];
                        }
                    }
                    objectDecoded[`decodePayload_${j}`] = decodedOperation;
                }
            }
        }
    }

    const outputTimelock = {
        roles: outputsJson,
        scheduleData,
        executeData,
        decodeScheduleData: objectDecoded,
    };

    fs.writeFileSync(pathOutputJson, JSON.stringify(outputTimelock, null, 1));
    logger.info(`Finished script, output saved at: ${pathOutputJson}`);
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});
