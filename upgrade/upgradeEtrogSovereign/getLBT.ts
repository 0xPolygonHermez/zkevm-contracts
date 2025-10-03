import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

export async function getLBT(contractAddress, creationBlock) {
    const contract = await ethers.getContractAt('PolygonZkEVMBridgeV2Pessimistic', contractAddress);
    const latest = await ethers.provider.getBlockNumber();
    //     const blocks = [
    //         4812268,  4928835,  4944446,  5158649,  5194772,
    //         5393214,  5422889,  6095242,  6270488,  6388907,
    //         6618558,  7330119,  7521564,  7594832,  7605727,
    //         7622767,  7636575,  8032851,  8282456,  8283019,
    //         8284099,  8284099,  8310228,  8310228,  8338175,
    //         8475285,  8475762,  8527816,  8528375,  8528948,
    //         8603501,  8628006,  8628442,  8650774,  8651327,
    //         8815013,  8817997,  8819998,  9695861,  9708554,
    //        10475255, 10892067, 11045636, 11085624, 11086166,
    //        11107670, 12365967, 13079718, 13094711, 14453733,
    //        14851442, 16270183, 16579157, 16831773, 16833747
    //      ];

    // //////////////////////////////
    //  Get events NewWrappedToken //
    // //////////////////////////////

    const loops = (latest - creationBlock) / 10000;
    const events = [];
    for (let i = 0; i < loops; i++) {
        const to = creationBlock + 10000 * (i + 1) < latest ? creationBlock + 10000 * (i + 1) : latest;
        const from = creationBlock + 10000 * i; // Últimos 10,000 bloques
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
            }
        }
    }
    // await fs.writeFileSync(path.join(__dirname, 'eventsList.json'), JSON.stringify(events, null, 2));
    // const events = JSON.parse(fs.readFileSync(path.join(__dirname, 'eventsList.json'), 'utf-8'));
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
    const contractAddress = '0x528e26b25a34a4A5d0dbDa1d57D318153d2ED582';
    const creationBlock = 4789186;
    const objectInitialize = await getLBT(contractAddress, creationBlock);
    await fs.writeFileSync(path.join(__dirname, 'initializeLBT.json'), JSON.stringify(objectInitialize, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
