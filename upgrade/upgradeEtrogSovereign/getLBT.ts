import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import upgradeParams from './upgrade_parameters.json';
import { logger } from '../../src/logger';

export async function getLBT(contractAddress: string) {
    const contract = await ethers.getContractAt('PolygonZkEVMBridgeV2Pessimistic', contractAddress);
    const latest = await ethers.provider.getBlockNumber();

    // //////////////////////////////
    //  Get events NewWrappedToken //
    // //////////////////////////////
    const blockRange = upgradeParams.blockRange || 1000;
    const loops = latest / blockRange;
    const events = [];
    logger.info(`Contract address: ${contractAddress}`);
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
                logger.info(`Block number: ${event.blockNumber.toString()} - wrappedTokenAddress: ${event.args[2]}`);
            }
            // await fs.writeFileSync(path.join(__dirname, `events.json`), JSON.stringify(events, null, 2));
        }
    }
    // const events = JSON.parse(fs.readFileSync(path.join(__dirname, 'events.json'), 'utf-8'));
    // eslint-disable-next-line no-restricted-syntax
    for (const event of events) {
        const { wrappedTokenAddress } = event;
        // eslint-disable-next-line no-await-in-loop
        const contractToken = await ethers.getContractAt('TokenWrapped', wrappedTokenAddress);
        // eslint-disable-next-line no-await-in-loop
        const totalSupply = await contractToken.totalSupply();
        event.totalSupply = totalSupply.toString();
    }
    // await fs.writeFileSync(path.join(__dirname, 'eventsListAmount.json'), JSON.stringify(events, null, 2));
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

    return objectInitialize;
}

async function main() {
    const objectInitialize = await getLBT(upgradeParams.bridgeL2);
    const dateStr = new Date().toISOString();
    await fs.writeFileSync(
        path.join(__dirname, `initializeLBT-${dateStr}.json`),
        JSON.stringify(objectInitialize, null, 2),
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
