const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Deploy', () => {
    let deployer;
    let sequencer;

    let verifierContract;
    let bridgeContract;
    let proofOfEfficiencyContract;
    let maticTokenContract;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    beforeEach('Deploy contract', async () => {
        // load signers
        [deployer, sequencer] = await ethers.getSigners();

        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory(
            'VerifierRollupHelperMock',
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
        const precalculatePoEAddress = await ethers.utils.getContractAddress(
            { from: deployer.address, nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 1 },
        );
        const BridgeFactory = await ethers.getContractFactory('Bridge');
        bridgeContract = await BridgeFactory.deploy(precalculatePoEAddress);
        await bridgeContract.deployed();

        // deploy proof of efficiency
        const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiency');
        proofOfEfficiencyContract = await ProofOfEfficiencyFactory.deploy(
            bridgeContract.address,
            maticTokenContract.address,
            verifierContract.address,
        );
        await proofOfEfficiencyContract.deployed();
        expect(proofOfEfficiencyContract.address).to.be.equal(precalculatePoEAddress);

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(sequencer.address, ethers.utils.parseEther('100'));
    });

    it('Check constants', async () => {
        // Check public constants
        expect(await proofOfEfficiencyContract.matic()).to.equal(maticTokenContract.address);
        expect(await proofOfEfficiencyContract.CHAIN_ID_DEFAULT()).to.equal(ethers.BigNumber.from(10000));
        expect(await proofOfEfficiencyContract.numSequencers()).to.equal(ethers.BigNumber.from(0));
        expect(await proofOfEfficiencyContract.lastBatchSent()).to.equal(ethers.BigNumber.from(0));
        expect(await proofOfEfficiencyContract.lastVerifiedBatch()).to.equal(ethers.BigNumber.from(0));
        expect(await proofOfEfficiencyContract.bridge()).to.equal(bridgeContract.address);
        expect(await proofOfEfficiencyContract.currentStateRoot()).to.equal(ethers.BigNumber.from(ethers.constants.HashZero));
        expect(await proofOfEfficiencyContract.currentLocalExitRoot()).to.equal(ethers.BigNumber.from(ethers.constants.HashZero));
        expect(await proofOfEfficiencyContract.rollupVerifier()).to.equal(verifierContract.address);

        // Check struct - Sequencer
        const seqStruct = await proofOfEfficiencyContract.sequencers('0x29e5f310317B68bf949926E987Fa0Df05Ef26501');
        expect(seqStruct.sequencerURL).to.equal('');
        expect(seqStruct.chainID).to.equal(ethers.BigNumber.from(0));
        expect(seqStruct.length).to.equal(2);

        // Check struct - BatchData
        const batchStruct = await proofOfEfficiencyContract.sentBatches(1);
        expect(batchStruct.sequencerAddress).to.equal(ethers.constants.AddressZero);
        expect(batchStruct.batchL2HashData).to.equal(ethers.constants.HashZero);
        expect(batchStruct.maticCollateral).to.equal(ethers.BigNumber.from(0));
        expect(batchStruct.length).to.equal(3);
    });
});
