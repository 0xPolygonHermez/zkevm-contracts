const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

describe('Emergency mode test', () => {
    let deployer;
    let trustedAggregator;
    let trustedSequencer;
    let admin;

    let verifierContract;
    let polygonZKEVMBridgeContract;
    let polygonZKEVMContract;
    let maticTokenContract;
    let polygonZKEVMGlobalExitRoot;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const genesisRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';

    const networkIDMainnet = 0;
    const allowForcebatches = true;
    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const chainID = 1000;
    const networkName = 'zkevm';
    const pendingStateTimeoutDefault = 10;
    const trustedAggregatorTimeoutDefault = 10;

    beforeEach('Deploy contract', async () => {
        // load signers
        [deployer, trustedAggregator, trustedSequencer, admin] = await ethers.getSigners();

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
        const PolygonZKEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZKEVMGlobalExitRoot');
        polygonZKEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZKEVMGlobalExitRootFactory, [], { initializer: false });

        // deploy PolygonZKEVMBridge
        const polygonZKEVMBridgeFactory = await ethers.getContractFactory('PolygonZKEVMBridge');
        polygonZKEVMBridgeContract = await upgrades.deployProxy(polygonZKEVMBridgeFactory, [], { initializer: false });

        // deploy PoE
        const PolygonZKEVMFactory = await ethers.getContractFactory('PolygonZKEVMMock');
        polygonZKEVMContract = await upgrades.deployProxy(PolygonZKEVMFactory, [], { initializer: false });

        await polygonZKEVMGlobalExitRoot.initialize(polygonZKEVMContract.address, polygonZKEVMBridgeContract.address);
        await polygonZKEVMBridgeContract.initialize(networkIDMainnet, polygonZKEVMGlobalExitRoot.address, polygonZKEVMContract.address);
        await polygonZKEVMContract.initialize(
            polygonZKEVMGlobalExitRoot.address,
            maticTokenContract.address,
            verifierContract.address,
            polygonZKEVMBridgeContract.address,
            {
                admin: admin.address,
                chainID,
                trustedSequencer: trustedSequencer.address,
                pendingStateTimeout: pendingStateTimeoutDefault,
                forceBatchAllowed: allowForcebatches,
                trustedAggregator: trustedAggregator.address,
                trustedAggregatorTimeout: trustedAggregatorTimeoutDefault,
            },
            genesisRoot,
            urlSequencer,
            networkName,
        );

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(trustedSequencer.address, ethers.utils.parseEther('100'));
    });

    it('should activate emergency mode', async () => {
        // Check isEmergencyState
        expect(await polygonZKEVMContract.isEmergencyState()).to.be.equal(false);
        expect(await polygonZKEVMBridgeContract.isEmergencyState()).to.be.equal(false);

        // Set isEmergencyState
        await expect(polygonZKEVMContract.connect(admin).activateEmergencyState(1))
            .to.be.revertedWith('PolygonZKEVM::activateEmergencyState: Batch not sequenced or not end of sequence');

        await expect(polygonZKEVMBridgeContract.connect(deployer).activateEmergencyState())
            .to.be.revertedWith('PolygonZKEVM::onlyPolygonZKEVM: only Polygon ZK-EVM contract');

        await expect(polygonZKEVMContract.activateEmergencyState(0))
            .to.emit(polygonZKEVMContract, 'EmergencyStateActivated')
            .to.emit(polygonZKEVMBridgeContract, 'EmergencyStateActivated');

        expect(await polygonZKEVMContract.isEmergencyState()).to.be.equal(true);
        expect(await polygonZKEVMBridgeContract.isEmergencyState()).to.be.equal(true);

        // Once in emergency state no sequenceBatches/forceBatches can be done
        const l2txData = '0x123456';
        const maticAmount = await polygonZKEVMContract.getCurrentBatchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: ethers.BigNumber.from(currentTimestamp),
            minForcedTimestamp: 0,
        };

        // revert because emergency state
        await expect(polygonZKEVMContract.sequenceBatches([sequence]))
            .to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        // revert because emergency state
        await expect(polygonZKEVMContract.sequenceForceBatches([sequence]))
            .to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        // revert because emergency state
        await expect(polygonZKEVMContract.forceBatch(l2txData, maticAmount))
            .to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        // trustedAggregator forge the batch
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const numBatch = (await polygonZKEVMContract.lastVerifiedBatch()).toNumber() + 1;
        const proofA = ['0', '0'];
        const proofB = [
            ['0', '0'],
            ['0', '0'],
        ];
        const proofC = ['0', '0'];
        const pendingStateNum = 0;

        await expect(
            polygonZKEVMContract.connect(trustedAggregator).verifyBatches(
                pendingStateNum,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        // Check PolygonZKEVMBridge no PolygonZKEVMBridge is in emergency state also
        const tokenAddress = ethers.constants.AddressZero;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = 1;
        const destinationAddress = deployer.address;

        await expect(polygonZKEVMBridgeContract.bridgeAsset(
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            '0x',
        )).to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        await expect(polygonZKEVMBridgeContract.bridgeMessage(
            destinationNetwork,
            destinationAddress,
            '0x',
        )).to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        const proof = [ethers.constants.HashZero, ethers.constants.HashZero];
        const index = 0;
        const root = ethers.constants.HashZero;

        await expect(polygonZKEVMBridgeContract.claimAsset(
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

        await expect(polygonZKEVMBridgeContract.claimMessage(
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
        await expect(polygonZKEVMContract.activateEmergencyState(0))
            .to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        await expect(polygonZKEVMBridgeContract.connect(deployer).deactivateEmergencyState())
            .to.be.revertedWith('PolygonZKEVM::onlyPolygonZKEVM: only Polygon ZK-EVM contract');

        await expect(polygonZKEVMContract.deactivateEmergencyState())
            .to.be.revertedWith('PolygonZKEVM::onlyAdmin: only admin');

        await expect(polygonZKEVMContract.connect(admin).deactivateEmergencyState())
            .to.emit(polygonZKEVMContract, 'EmergencyStateDeactivated')
            .to.emit(polygonZKEVMBridgeContract, 'EmergencyStateDeactivated');

        // Check isEmergencyState
        expect(await polygonZKEVMContract.isEmergencyState()).to.be.equal(false);
        expect(await polygonZKEVMBridgeContract.isEmergencyState()).to.be.equal(false);

        /*
         * Continue normal flow
         * Approve tokens
         */
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(polygonZKEVMContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await polygonZKEVMContract.lastBatchSequenced();
        // Sequence Batches
        await expect(polygonZKEVMContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.emit(polygonZKEVMContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        // trustedAggregator forge the batch
        const initialAggregatorMatic = await maticTokenContract.balanceOf(
            trustedAggregator.address,
        );
        await ethers.provider.send('evm_increaseTime', [trustedAggregatorTimeoutDefault]); // evm_setNextBlockTimestamp

        // Verify batch
        await expect(
            polygonZKEVMContract.connect(trustedAggregator).verifyBatches(
                pendingStateNum,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.emit(polygonZKEVMContract, 'VerifyBatches')
            .withArgs(numBatch, newStateRoot, trustedAggregator.address);

        const finalAggregatorMatic = await maticTokenContract.balanceOf(
            trustedAggregator.address,
        );
        expect(finalAggregatorMatic).to.equal(
            ethers.BigNumber.from(initialAggregatorMatic).add(ethers.BigNumber.from(maticAmount)),
        );

        // Finally enter in emergency mode again proving distinc state
        const finalPendingStateNum = 1;

        await expect(
            polygonZKEVMContract.connect(trustedAggregator).proveNonDeterministicPendingState(
                pendingStateNum,
                finalPendingStateNum,
                numBatch - 1,
                numBatch - 1,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.be.revertedWith('PolygonZKEVM::proveNonDeterministicPendingState: finalNewBatch must be equal than currentLastVerifiedBatch');

        await expect(
            polygonZKEVMContract.connect(trustedAggregator).proveNonDeterministicPendingState(
                pendingStateNum,
                finalPendingStateNum,
                numBatch - 1,
                numBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.be.revertedWith('PolygonZKEVM::proveNonDeterministicPendingState: finalNewBatch must be equal than currentLastVerifiedBatch');

        const newStateRootDistinct = '0x0000000000000000000000000000000000000000000000000000000000000002';

        await expect(
            polygonZKEVMContract.proveNonDeterministicPendingState(
                pendingStateNum,
                finalPendingStateNum,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRootDistinct,
                proofA,
                proofB,
                proofC,
            ),
        ).to.emit(polygonZKEVMContract, 'ProveNonDeterministicPendingState').withArgs(newStateRoot, newStateRootDistinct)
            .to.emit(polygonZKEVMContract, 'EmergencyStateActivated')
            .to.emit(polygonZKEVMBridgeContract, 'EmergencyStateActivated');

        // Check emergency state is active
        expect(await polygonZKEVMContract.isEmergencyState()).to.be.equal(true);
        expect(await polygonZKEVMBridgeContract.isEmergencyState()).to.be.equal(true);
    });
});
