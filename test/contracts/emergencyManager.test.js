const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

describe('Emergency mode test', () => {
    let deployer;
    let aggregator;
    let trustedSequencer;
    let securityCouncil;

    let verifierContract;
    let bridgeContract;
    let proofOfEfficiencyContract;
    let maticTokenContract;
    let globalExitRootManager;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const genesisRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';

    const networkIDMainnet = 0;
    const allowForcebatches = true;
    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const chainID = 1000;
    const networkName = 'zkevm';

    beforeEach('Deploy contract', async () => {
        // load signers
        [deployer, aggregator, trustedSequencer, securityCouncil] = await ethers.getSigners();

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

        // deploy global exit root manager
        const globalExitRootManagerFactory = await ethers.getContractFactory('GlobalExitRootManager');
        globalExitRootManager = await upgrades.deployProxy(globalExitRootManagerFactory, [], { initializer: false });

        // deploy bridge
        const bridgeFactory = await ethers.getContractFactory('Bridge');
        bridgeContract = await upgrades.deployProxy(bridgeFactory, [], { initializer: false });

        // deploy PoE
        const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiencyMock');
        proofOfEfficiencyContract = await upgrades.deployProxy(ProofOfEfficiencyFactory, [], { initializer: false });

        const claimTimeout = 0;
        await globalExitRootManager.initialize(proofOfEfficiencyContract.address, bridgeContract.address);
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
            securityCouncil.address,
        );

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(trustedSequencer.address, ethers.utils.parseEther('100'));
    });

    it('should activate emergency mode', async () => {
        // Check isEmergencyState
        expect(await proofOfEfficiencyContract.isEmergencyState()).to.be.equal(false);
        expect(await bridgeContract.isEmergencyState()).to.be.equal(false);

        // Set isEmergencyState
        await expect(proofOfEfficiencyContract.connect(securityCouncil).activateEmergencyState())
            .to.be.revertedWith('owner');

        await expect(bridgeContract.connect(securityCouncil).activateEmergencyState())
            .to.be.revertedWith('ProofOfEfficiency::onlyProofOfEfficiency: only Proof of Efficiency contract');

        await expect(proofOfEfficiencyContract.activateEmergencyState())
            .to.emit(proofOfEfficiencyContract, 'EmergencyStateActivated')
            .to.emit(bridgeContract, 'EmergencyStateActivated');

        expect(await proofOfEfficiencyContract.isEmergencyState()).to.be.equal(true);
        expect(await bridgeContract.isEmergencyState()).to.be.equal(true);

        // Once in emergency state no sequenceBatches/forceBatches can be done
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: ethers.BigNumber.from(currentTimestamp),
            minForcedTimestamp: 0,
        };

        // revert because emergency state
        await expect(proofOfEfficiencyContract.sequenceBatches([sequence]))
            .to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        // revert because emergency state
        await expect(proofOfEfficiencyContract.sequenceForceBatches([sequence]))
            .to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        // revert because emergency state
        await expect(proofOfEfficiencyContract.forceBatch(l2txData, maticAmount))
            .to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        // aggregator forge the batch
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const numBatch = (await proofOfEfficiencyContract.lastVerifiedBatch()).toNumber() + 1;
        const proofA = ['0', '0'];
        const proofB = [
            ['0', '0'],
            ['0', '0'],
        ];
        const proofC = ['0', '0'];

        await expect(
            proofOfEfficiencyContract.connect(aggregator).verifyBatches(
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        // Check bridge no bridge is in emergency state also
        const tokenAddress = ethers.constants.AddressZero;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = 1;
        const destinationAddress = deployer.address;

        await expect(bridgeContract.bridgeAsset(
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            '0x',
        )).to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        await expect(bridgeContract.bridgeMessage(
            destinationNetwork,
            destinationAddress,
            '0x',
        )).to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        const proof = [ethers.constants.HashZero, ethers.constants.HashZero];
        const index = 0;
        const root = ethers.constants.HashZero;

        await expect(bridgeContract.claimAsset(
            proof,
            index,
            root,
            root,
            0,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            '0x',
        )).to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        await expect(bridgeContract.claimMessage(
            proof,
            index,
            root,
            root,
            0,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            '0x',
        )).to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        // Emergency council should deactivate emergency mode
        await expect(proofOfEfficiencyContract.activateEmergencyState())
            .to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        await expect(bridgeContract.connect(securityCouncil).deactivateEmergencyState())
            .to.be.revertedWith('ProofOfEfficiency::onlyProofOfEfficiency: only Proof of Efficiency contract');

        await expect(proofOfEfficiencyContract.deactivateEmergencyState())
            .to.be.revertedWith('ProofOfEfficiency::onlySecurityCouncil: only security council');

        await expect(proofOfEfficiencyContract.connect(securityCouncil).deactivateEmergencyState())
            .to.emit(proofOfEfficiencyContract, 'EmergencyStateDeactivated')
            .to.emit(bridgeContract, 'EmergencyStateDeactivated');

        // Check isEmergencyState
        expect(await proofOfEfficiencyContract.isEmergencyState()).to.be.equal(false);
        expect(await bridgeContract.isEmergencyState()).to.be.equal(false);

        /*
         * Continue normal flow
         * Approve tokens
         */
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await proofOfEfficiencyContract.lastBatchSequenced();
        // Sequence Batches
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.emit(proofOfEfficiencyContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        // aggregator forge the batch
        const initialAggregatorMatic = await maticTokenContract.balanceOf(
            await aggregator.getAddress(),
        );

        // Verify batch
        await expect(
            proofOfEfficiencyContract.connect(aggregator).verifyBatches(
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.emit(proofOfEfficiencyContract, 'VerifyBatches')
            .withArgs(numBatch, newStateRoot, aggregator.address);

        const finalAggregatorMatic = await maticTokenContract.balanceOf(
            await aggregator.getAddress(),
        );
        expect(finalAggregatorMatic).to.equal(
            ethers.BigNumber.from(initialAggregatorMatic).add(ethers.BigNumber.from(maticAmount)),
        );

        // Finally enter in emergency mode again proving distinc state

        await expect(
            proofOfEfficiencyContract.connect(aggregator).proofDifferentState(
                numBatch - 1,
                numBatch - 1,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.be.revertedWith('ProofOfEfficiency::proofDifferentState: finalNewBatch must be bigger than initNumBatch');

        await expect(
            proofOfEfficiencyContract.connect(aggregator).proofDifferentState(
                numBatch - 1,
                numBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.be.revertedWith('ProofOfEfficiency::proofDifferentState: finalNewBatch must be less or equal than lastVerifiedBatch');

        const newStateRootDistinct = '0x0000000000000000000000000000000000000000000000000000000000000002';

        await expect(
            proofOfEfficiencyContract.proofDifferentState(
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRootDistinct,
                proofA,
                proofB,
                proofC,
            ),
        ).to.emit(proofOfEfficiencyContract, 'ProofDifferentState').withArgs(newStateRoot, newStateRootDistinct)
            .to.emit(proofOfEfficiencyContract, 'EmergencyStateActivated')
            .to.emit(bridgeContract, 'EmergencyStateActivated');

        // Check emergency state is active
        expect(await proofOfEfficiencyContract.isEmergencyState()).to.be.equal(true);
        expect(await bridgeContract.isEmergencyState()).to.be.equal(true);
    });
});
