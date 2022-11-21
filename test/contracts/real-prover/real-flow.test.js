const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const { Scalar } = require('ffjavascript');

const { contractUtils } = require('@0xpolygonhermez/zkevm-commonjs');

const { generateSolidityInputs } = contractUtils;

const { calculateSnarkInput, calculateBatchHashData, calculateAccInputHash } = contractUtils;

const proofJson = require('./test-inputs/proof.json');
const publicJson = require('./test-inputs/public.json');
const inputJson = require('./test-inputs/input.json');

describe('Real flow test', () => {
    let verifierContract;
    let maticTokenContract;
    let bridgeContract;
    let proofOfEfficiencyContract;
    let globalExitRootManager;
    let deployer;
    let trustedSequencer;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const genesisRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';

    const networkIDMainnet = 0;
    const allowForcebatches = true;
    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const chainID = inputJson.chainId;
    const networkName = 'zkevm';

    beforeEach('Deploy contract', async () => {
        // load signers
        [deployer] = await ethers.getSigners();

        const trustedSequencerAddress = inputJson.sequencerAddr;
        await ethers.provider.send('hardhat_impersonateAccount', [trustedSequencerAddress]);
        trustedSequencer = await ethers.getSigner(trustedSequencerAddress);
        await deployer.sendTransaction({
            to: trustedSequencerAddress,
            value: ethers.utils.parseEther('4'),
        });

        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory(
            'Verifier',
        );
        verifierContract = await VerifierRollupHelperFactory.deploy();

        // deploy MATIC
        const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        maticTokenContract = await maticTokenFactory.deploy(
            maticTokenName,
            maticTokenSymbol,
            deployer.address,
            maticTokenInitialBalance,
        );
        await maticTokenContract.deployed();

        // deploy bridge
        const bridgeFactory = await ethers.getContractFactory('Bridge');
        bridgeContract = await upgrades.deployProxy(bridgeFactory, [], { initializer: false });

        // deploy PoE
        const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiencyMock');
        proofOfEfficiencyContract = await upgrades.deployProxy(ProofOfEfficiencyFactory, [], { initializer: false });

        // deploy global exit root manager
        const globalExitRootManagerFactory = await ethers.getContractFactory('GlobalExitRootManagerMock');
        const claimTimeout = 0;

        globalExitRootManager = await globalExitRootManagerFactory.deploy(proofOfEfficiencyContract.address, bridgeContract.address);
        await bridgeContract.initialize(networkIDMainnet, globalExitRootManager.address, proofOfEfficiencyContract.address, claimTimeout);

        await proofOfEfficiencyContract.initialize(
            globalExitRootManager.address,
            maticTokenContract.address,
            verifierContract.address,
            genesisRoot,
            trustedSequencer.address,
            allowForcebatches,
            urlSequencer,
            chainID,
            networkName,
            bridgeContract.address,
            ethers.constants.AddressZero,
        );

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(trustedSequencer.address, ethers.utils.parseEther('100'));
    });

    it('Test real prover', async () => {
        const {
            proofA, proofB, proofC, input,
        } = generateSolidityInputs(proofJson, publicJson);

        const batchAccInputHashJs = calculateAccInputHash(
            inputJson.oldAccInputHash,
            calculateBatchHashData(inputJson.batchL2Data),
            inputJson.globalExitRoot,
            inputJson.timestamp,
            inputJson.sequencerAddr,
        );
        expect(batchAccInputHashJs).to.be.eq(inputJson.newAccInputHash);

        const circuitInputStarkJS = await calculateSnarkInput(
            inputJson.oldStateRoot,
            inputJson.newStateRoot,
            inputJson.newLocalExitRoot,
            inputJson.oldAccInputHash,
            inputJson.newAccInputHash,
            inputJson.numBatch - 1,
            inputJson.numBatch,
            inputJson.timestamp,
            inputJson.chainId,
            inputJson.aggregatorAddress,
        );
        expect(circuitInputStarkJS).to.be.eq(Scalar.e(input[0]));

        // Approve tokens
        const maticAmount = await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE();
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        // set timestamp for the sendBatch call
        const sequence = {
            transactions: inputJson.batchL2Data,
            globalExitRoot: inputJson.globalExitRoot,
            timestamp: inputJson.timestamp,
            forceBatchesTimestamp: [],
        };

        // prapare globalExitRoot
        await globalExitRootManager.setLastGlobalExitRootNum(1);
        await globalExitRootManager.setLastGlobalExitRoot(sequence.globalExitRoot);

        await proofOfEfficiencyContract.setVerifiedBatch(inputJson.numBatch - 1);
        await proofOfEfficiencyContract.setSequencedBatch(inputJson.numBatch - 1);

        const lastBatchSequenced = await proofOfEfficiencyContract.lastBatchSequenced();

        await ethers.provider.send('evm_setNextBlockTimestamp', [sequence.timestamp]);

        // Sequence Batches
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.emit(proofOfEfficiencyContract, 'SequenceBatches')
            .withArgs(Number(lastBatchSequenced) + 1);

        // aggregator forge the batch
        const { newLocalExitRoot } = inputJson;
        const { newStateRoot } = inputJson;
        const { numBatch } = inputJson;

        // Set state and exit root
        await proofOfEfficiencyContract.setStateRoot(inputJson.oldStateRoot);
        await proofOfEfficiencyContract.setExitRoot(inputJson.oldLocalExitRoot);

        const { aggregatorAddress } = inputJson;
        await ethers.provider.send('hardhat_impersonateAccount', [aggregatorAddress]);
        const aggregator = await ethers.getSigner(aggregatorAddress);
        await deployer.sendTransaction({
            to: aggregatorAddress,
            value: ethers.utils.parseEther('4'),
        });

        // Verify batch
        await expect(
            proofOfEfficiencyContract.connect(aggregator).verifyBatch(
                newLocalExitRoot,
                newStateRoot,
                numBatch,
                proofA,
                proofB,
                proofC,
            ),
        ).to.emit(proofOfEfficiencyContract, 'VerifyBatch')
            .withArgs(numBatch, aggregator.address);
    });
});
