/* eslint-disable no-restricted-syntax, no-await-in-loop, no-continue, no-plusplus, no-console */
/* eslint-disable @typescript-eslint/no-unused-vars, prefer-destructuring */
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

// Try to load contractAddresses.json if it exists
let contractAddressMap: Record<string, string> = {
    '0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2': 'RollupManager',
    '0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe': 'Bridge',
    '0x580bda1e7A0CFAe92Fa7F6c20A3794F169CE3CFb': 'GER',
};

try {
    const addressesPath = path.join(__dirname, 'contractAddresses.json');
    if (fs.existsSync(addressesPath)) {
        const addressesJson = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));
        // Flatten all networks into a single mapping
        contractAddressMap = {};
        for (const network of Object.values(addressesJson)) {
            for (const [addr, name] of Object.entries(network as Record<string, string>)) {
                contractAddressMap[addr.toLowerCase()] = name;
            }
        }
    } else {
        // fallback: ensure all keys are lowercase
        Object.keys(contractAddressMap).forEach((key) => {
            const lowerKey = key.toLowerCase();
            if (key !== lowerKey) {
                contractAddressMap[lowerKey] = contractAddressMap[key];
                delete contractAddressMap[key];
            }
        });
    }
} catch (e) {
    // fallback: ensure all keys are lowercase
    Object.keys(contractAddressMap).forEach((key) => {
        const lowerKey = key.toLowerCase();
        if (key !== lowerKey) {
            contractAddressMap[lowerKey] = contractAddressMap[key];
            delete contractAddressMap[key];
        }
    });
}

// Template: fill with your contract factories for decoding
const contractFactories: string[] = [
    'PolygonRollupManager',
    // "ProxyAdmin",
    '@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
    'BridgeL2SovereignChain',
];

async function decodePayload(data: string, factories: string[]): Promise<any> {
    for (const name of factories) {
        try {
            const factory: any = await ethers.getContractFactory(name);
            const decoded: any = factory.interface.parseTransaction({ data });
            if (!decoded || !decoded.name) {
                continue; // Skip if no valid decode
            }
            return { contract: name, decoded };
        } catch (e) {
            // Try next
        }
    }
    return null;
}

// function getDisplayContract(to: string, contractName: string): string {
//     if (contractName && to) {
//         return `${to} --> ${contractName}`;
//     }
//     if (to) {
//         return to;
//     }
//     return contractName;
// }

function printDecoded(name: string, decoded: any, contractName: string, to: any, depth = 0) {
    const indent = '  '.repeat(depth);
    const displayContract = contractName !== 'UnknownContract' ? contractName : name;
    console.log(`${indent}Decoded as ${displayContract}:`);
    console.log(`${indent}  Function: ${decoded.name}`);
    if (decoded.fragment && decoded.fragment.inputs) {
        for (let j = 0; j < decoded.fragment.inputs.length; j++) {
            const param = decoded.fragment.inputs[j];
            const value = decoded.args[j];
            if (param.type === 'address') {
                // Check if the address exists in the contractAddressMap (always lowercase)
                const mappedName = contractAddressMap[String(value).toLowerCase()];
                if (mappedName) {
                    console.log(`${indent}    ${param.name}: ${value} --> "${mappedName}"`);
                } else {
                    console.log(`${indent}    ${param.name}: ${value}`);
                }
            } else {
                console.log(`${indent}    ${param.name}:`, value);
            }
        }
    } else if (decoded.args && decoded.name && decoded.args.length) {
        // fallback: print as much as possible
        for (let j = 0; j < decoded.args.length; j++) {
            console.log(`${indent}    arg${j}:`, decoded.args[j]);
        }
    }
}

async function main(): Promise<void> {
    // User input: fill these with your data
    const scheduleData: string = '0x..';
    const executeData: string = '0x..';

    const TimelockFactory: any = await ethers.getContractFactory(
        '@openzeppelin/contracts/governance/TimelockController.sol:TimelockController',
    );

    // Decode schedule and execute
    const decodedSchedule: any = TimelockFactory.interface.parseTransaction({ data: scheduleData });
    const decodedExecute: any = TimelockFactory.interface.parseTransaction({ data: executeData });

    // Detect batch or single
    const isScheduleBatch: boolean = decodedSchedule.name === 'scheduleBatch';
    const isExecuteBatch: boolean = decodedExecute.name === 'executeBatch';

    // Extract targets, values, payloads
    let scheduleTargets: any[];
    let scheduleValues: any[];
    let schedulePayloads: any[];
    let executeTargets: any[];
    let executeValues: any[];
    let executePayloads: any[];

    if (isScheduleBatch) {
        scheduleTargets = decodedSchedule.args[0];
        scheduleValues = decodedSchedule.args[1];
        schedulePayloads = decodedSchedule.args[2];
    } else {
        scheduleTargets = [decodedSchedule.args[0]];
        scheduleValues = [decodedSchedule.args[1]];
        // For single schedule, the payload is called 'data'
        schedulePayloads = [decodedSchedule.args[2]];
    }

    if (isExecuteBatch) {
        executeTargets = decodedExecute.args[0];
        executeValues = decodedExecute.args[1];
        executePayloads = decodedExecute.args[2];
    } else {
        executeTargets = [decodedExecute.args[0]];
        executeValues = [decodedExecute.args[1]];
        // For single execute, the payload is called 'payload'
        executePayloads = [decodedExecute.args[2]];
    }

    // Print top-level TimelockController call
    printDecoded('TimelockController', decodedSchedule, 'TimelockController', 'TimelockController', 0);

    // Check that schedule and execute match
    const match: boolean =
        scheduleTargets.length === executeTargets.length &&
        scheduleTargets.every((t: any, i: number) => t.toLowerCase() === executeTargets[i].toLowerCase()) &&
        scheduleValues.every((v: any, i: number) => v.toString() === executeValues[i].toString()) &&
        schedulePayloads.every((p: any, i: number) => p === executePayloads[i]);

    if (!match) {
        console.error('❌ Schedule and Execute do not match!');
        return;
    }

    // Decode each call
    for (let i = 0; i < scheduleTargets.length; i++) {
        const to: string = scheduleTargets[i];
        // const value: any = scheduleValues[i];
        const data: string = schedulePayloads[i];

        // Use contract name from address map, or fallback to decoded.contract (always lowercase)
        const contractName: string = contractAddressMap[to.toLowerCase()];
        let decoded: any = await decodePayload(data, contractFactories);
        let depth = 0;
        let currentContractName = contractName;
        let currentTo = to;
        while (decoded && decoded.decoded.args?.data) {
            // Use decoded.contract if contractName is undefined
            printDecoded(decoded.contract, decoded.decoded, currentContractName || decoded.contract, currentTo, depth);
            currentContractName = decoded.contract;
            currentTo = ''; // unknown for inner
            decoded = await decodePayload(decoded.decoded.args.data, contractFactories);
            depth++;
        }
        if (decoded) {
            printDecoded(decoded.contract, decoded.decoded, contractName || decoded.contract, to, depth);
        }
        if (!decoded && depth === 0) {
            console.log(
                `Could not decode payload for ${to} (${contractName || 'UnknownContract'}) with provided ABIs.`,
            );
        }
        if (!decoded && depth > 0) {
            console.log(`${'  '.repeat(depth)}↳ Inner payload could not be decoded.`);
        }
    }
}

main().catch((error: any) => {
    console.error('❌ Error:', error);
    process.exit(1);
});
