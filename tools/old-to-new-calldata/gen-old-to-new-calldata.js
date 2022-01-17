const ethers = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
    const testVectors = JSON.parse(fs.readFileSync(path.join(__dirname, '../../test/src/zk-EVM/helpers/test-vector-data/state-transition.json')));
    const testVectorNewCallData = [];

    let rawTxs = [];
    for (let i = 0; i < testVectors.length; i++) {
        const { txs } = testVectors[i];
        for (let j = 0; j < txs.length; j++) {
            const tx = txs[j];
            if (tx.reason !== ('TX INVALID: Failed to RLP decode raw transaction' && 'TX INVALID: Chain ID does not match')) {
                rawTxs.push(tx.rawTx);
            }
        }
    }

    rawTxs = rawTxs.filter((v) => v !== undefined);

    // add rawTx to test-vector
    rawTxs.forEach((e) => testVectorNewCallData.push({ input: e, output: null }));

    // compute new calldata for each rawTx
    for (let i = 0; i < testVectorNewCallData.length; i++) {
        const rawTx = testVectorNewCallData[i].input;
        const rtx = ethers.utils.RLP.decode(rawTx);
        const chainId = (Number(rtx[6]) - 35) >> 1;
        const sign = !(Number(rtx[6]) & 1);
        const messageToHash = [rtx[0], rtx[1], rtx[2], rtx[3], rtx[4], rtx[5], ethers.utils.hexlify(chainId), '0x', '0x'];
        const signData = ethers.utils.RLP.encode(messageToHash).slice(2);
        const r = rtx[7].slice(2).padStart(64, '0'); // 32 bytes
        const s = rtx[8].slice(2).padStart(64, '0'); // 32 bytes
        const v = (sign + 27).toString(16).padStart(2, '0'); // 1 bytes

        const calldata = `0x${signData.concat(r).concat(s).concat(v)}`;
        testVectorNewCallData[i].output = calldata;
    }

    const dir = path.join(__dirname, 'old-to-new-calldata.json');
    await fs.writeFileSync(dir, JSON.stringify(testVectorNewCallData, null, 2));
}

main();
