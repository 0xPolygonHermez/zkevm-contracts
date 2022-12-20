const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

const { contractUtils } = require('@0xpolygonhermez/zkevm-commonjs');

describe('Polygon ZK-EVM snark stark input test', () => {
    let polygonZKEVMContract;
    const genesisRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
    let randomSigner;

    const allowForcebatches = true;
    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const chainID = 1000;
    const networkName = 'zkevm';

    const batchL2Data = '0xee80843b9aca00830186a0944d5cf5032b2a844602278b01199ed191a86c93ff88016345785d8a0000808203e880801cee7e01dc62f69a12c3510c6d64de04ee6346d84b6a017f3e786c7d87f963e75d8cc91fa983cd6d9cf55fff80d73bd26cd333b0f098acc1e58edb1fd484ad731b';
    beforeEach('Deploy contract', async () => {
        // load signers
        [randomSigner] = await ethers.getSigners();

        // deploy Polygon ZK-EVM
        const PolygonZKEVMFactory = await ethers.getContractFactory('PolygonZKEVMMock');
        polygonZKEVMContract = await upgrades.deployProxy(
            PolygonZKEVMFactory,
            [
                randomSigner.address,
                randomSigner.address,
                randomSigner.address,
                randomSigner.address,
                {
                    admin: randomSigner.address,
                    chainID,
                    trustedSequencer: randomSigner.address,
                    pendingStateTimeout: 0,
                    forceBatchAllowed: allowForcebatches,
                    trustedAggregator: randomSigner.address,
                    trustedAggregatorTimeout: 0,
                },
                genesisRoot,
                urlSequencer,
                networkName,
            ],
        );

        await polygonZKEVMContract.deployed();
    });

    it('Check Accumualte input Hash', async () => {
        const oldAccInputHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const globalExitRoot = '0x090bcaf734c4f06c93954a827b45a6e8c67b8e0fd1e0a35a1c5982d6961828f9';
        const timestamp = 1944498031;
        const sequencerAddr = '0x617b3a3528F9cDd6630fd3301B9c8911F7Bf063D';
        const expectedStarkHashExecutor = '0x704d5cfd3e44b82028f7f8cae31168267a7422c5a447b90a65134116da5a8432';

        const batchL2DataHash = contractUtils.calculateBatchHashData(batchL2Data);
        const accumulateInputHashJs = await contractUtils.calculateAccInputHash(
            oldAccInputHash,
            batchL2DataHash,
            globalExitRoot,
            timestamp,
            sequencerAddr,
        );
        const accumulateInputHashSC = await polygonZKEVMContract.calculateAccInputHash(
            oldAccInputHash,
            batchL2Data,
            globalExitRoot,
            timestamp,
            sequencerAddr,
        );
        expect(accumulateInputHashJs).to.be.equal(accumulateInputHashSC);
        expect(accumulateInputHashSC).to.be.equal(expectedStarkHashExecutor);
    });
    it('Check commonjs unit test', async () => {
        // Unit test taken from https://github.com/0xPolygonHermez/zkevm-commonjs/blob/main/test/contract-utils.test.js#L16
        const oldStateRoot = '0x2dc4db4293af236cb329700be43f08ace740a05088f8c7654736871709687e90';
        const newStateRoot = '0xbff23fc2c168c033aaac77503ce18f958e9689d5cdaebb88c5524ce5c0319de3';
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const oldAccInputHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newAccInputHash = '0x2c9d2c1b2ed8e4be0719f443235c3483f8d6288c6d057859e7210fe39acce682';
        const oldNumBatch = 0;
        const newNumBatch = 1;
        const aggregatorAddress = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
        const expectedSnarkInputHash = '15588448576060468525242870965361192827910782996030023758348255084502752104347';

        const lastPendingStateConsolidated = 0;
        const sequencedTimestamp = 999;
        // set smart contract with correct parameters
        await polygonZKEVMContract.setStateRoot(oldStateRoot, oldNumBatch);
        await polygonZKEVMContract.setSequencedBatches(newNumBatch, newAccInputHash, sequencedTimestamp, lastPendingStateConsolidated);
        await polygonZKEVMContract.setSequencedBatch(1);

        await ethers.provider.send('hardhat_impersonateAccount', [aggregatorAddress]);
        const aggregator = await ethers.getSigner(aggregatorAddress);
        await randomSigner.sendTransaction({
            to: aggregatorAddress,
            value: ethers.utils.parseEther('4'),
        });

        // Compute SC input
        const pendingStateNum = 0;
        const inputSnarkSC = await polygonZKEVMContract.connect(aggregator).getNextSnarkInput(
            pendingStateNum,
            oldNumBatch,
            newNumBatch,
            newLocalExitRoot,
            newStateRoot,
        );

        // Compute Js input
        const inputSnarkJS = await contractUtils.calculateSnarkInput(
            oldStateRoot,
            newStateRoot,
            newLocalExitRoot,
            oldAccInputHash,
            newAccInputHash,
            oldNumBatch,
            newNumBatch,
            chainID,
            aggregatorAddress,
        );

        expect(inputSnarkSC).to.be.equal(inputSnarkJS);
        expect(inputSnarkSC).to.be.equal(expectedSnarkInputHash);
    });
});
