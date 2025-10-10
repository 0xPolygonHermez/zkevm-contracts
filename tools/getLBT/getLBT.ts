import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import parameters from './parameters.json';
import { logger } from '../../src/logger';
import { checkParams } from '../../src/utils';

async function main() {
    /*
     * Check  parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryParameters = ['contractAddress', 'contractName'];
    checkParams(parameters, mandatoryParameters);

    const { contractName, contractAddress } = parameters;
    const dateStr = new Date().toISOString();

    const contract = await ethers.getContractAt(contractName, contractAddress);
    const latest = await ethers.provider.getBlockNumber();

    // //////////////////////////////
    //  Get events NewWrappedToken //
    // //////////////////////////////
    const blockRange = parameters.blockRange || 100000;
    const loops = latest / blockRange;
    const events = [];
    logger.info(`Contract address: ${contractAddress}`);

    if (parameters.getEventsFromFile) {
        logger.info(`Getting events from file events.json`);
        const eventsFile = fs.readFileSync(path.join(__dirname, `events.json`), 'utf-8');
        const eventsJson = JSON.parse(eventsFile);
        events.push(...eventsJson);
    } else {
        logger.info(`Events fetching from block 0 to ${latest} in ${Math.ceil(loops)} loops`);
        for (let i = 0; i < loops; i++) {
            const to = blockRange * (i + 1) < latest ? blockRange * (i + 1) : latest;
            const from = blockRange * i;
            logger.info(`Processing blocks from ${from} to ${to}`);
            // eslint-disable-next-line no-await-in-loop
            const eventsFilter = await contract.queryFilter('NewWrappedToken', from, to);
            if (eventsFilter.length > 0) {
                // eslint-disable-next-line no-restricted-syntax
                for (const event of eventsFilter) {
                    events.push({
                        blockNumber: event.blockNumber.toString(),
                        originNetwork: event.args[0].toString(),
                        originTokenAddress: event.args[1],
                        wrappedTokenAddress: event.args[2],
                    });
                    logger.info(
                        `Block number: ${event.blockNumber.toString()} - wrappedTokenAddress: ${event.args[2]}`,
                    );
                    if (parameters.printEvents) {
                        logger.info(`events.json file updated`);
                        fs.writeFileSync(path.join(__dirname, `events.json`), JSON.stringify(events, null, 2));
                    }
                }
            }
        }
    }

    logger.info(`Collecting totalSupply of every wrapped token...`);
    // eslint-disable-next-line no-restricted-syntax
    for (const event of events) {
        const { wrappedTokenAddress } = event;
        // eslint-disable-next-line no-await-in-loop
        const contractToken = await ethers.getContractAt('TokenWrapped', wrappedTokenAddress);
        // eslint-disable-next-line no-await-in-loop
        const totalSupply = await contractToken.totalSupply();
        event.totalSupply = totalSupply.toString();
    }
    if (parameters.printEvents) {
        await fs.writeFileSync(path.join(__dirname, `events-${dateStr}.json`), JSON.stringify(events, null, 2));
    }

    const objectInitialize = {
        originNetwork: [],
        originTokenAddress: [],
        totalSupply: [],
    };

    // eslint-disable-next-line no-restricted-syntax
    for (const event of events) {
        objectInitialize.originNetwork.push(event.originNetwork);
        objectInitialize.originTokenAddress.push(event.originTokenAddress);
        objectInitialize.totalSupply.push(event.totalSupply);
    }

    await fs.writeFileSync(
        path.join(__dirname, `initializeLBT-${dateStr}.json`),
        JSON.stringify(objectInitialize, null, 2),
    );
    logger.info(`File initializeLBT-${dateStr}.json created`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
