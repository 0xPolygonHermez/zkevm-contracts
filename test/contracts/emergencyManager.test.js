const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

describe('Emergency mode test', () => {
    let deployer;
    let trustedAggregator;
    let trustedSequencer;
    let admin;

    let verifierContract;
    let polygonZkEVMBridgeContract;
    let polygonZkEVMContract;
    let maticTokenContract;
    let polygonZkEVMGlobalExitRoot;

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

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], { initializer: false });

        // deploy PolygonZkEVMMock
        const PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVMMock');
        polygonZkEVMContract = await upgrades.deployProxy(PolygonZkEVMFactory, [], { initializer: false });

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        polygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(
            polygonZkEVMContract.address,
            polygonZkEVMBridgeContract.address,
        );

        await polygonZkEVMBridgeContract.initialize(networkIDMainnet, polygonZkEVMGlobalExitRoot.address, polygonZkEVMContract.address);
        await polygonZkEVMContract.initialize(
            polygonZkEVMGlobalExitRoot.address,
            maticTokenContract.address,
            verifierContract.address,
            polygonZkEVMBridgeContract.address,
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
        expect(await polygonZkEVMContract.isEmergencyState()).to.be.equal(false);
        expect(await polygonZkEVMBridgeContract.isEmergencyState()).to.be.equal(false);

        // Set isEmergencyState
        await expect(polygonZkEVMContract.connect(admin).activateEmergencyState(1))
            .to.be.revertedWith('PolygonZkEVM::activateEmergencyState: Batch not sequenced or not end of sequence');

        await expect(polygonZkEVMBridgeContract.connect(deployer).activateEmergencyState())
            .to.be.revertedWith('PolygonZkEVM::onlyPolygonZkEVM: only PolygonZkEVM contract');

        await expect(polygonZkEVMContract.activateEmergencyState(0))
            .to.emit(polygonZkEVMContract, 'EmergencyStateActivated')
            .to.emit(polygonZkEVMBridgeContract, 'EmergencyStateActivated');

        expect(await polygonZkEVMContract.isEmergencyState()).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.isEmergencyState()).to.be.equal(true);

        // Once in emergency state no sequenceBatches/forceBatches can be done
        const l2txData = '0x123456';
        const maticAmount = await polygonZkEVMContract.getCurrentBatchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: ethers.BigNumber.from(currentTimestamp),
            minForcedTimestamp: 0,
        };

        // revert because emergency state
        await expect(polygonZkEVMContract.sequenceBatches([sequence]))
            .to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        // revert because emergency state
        await expect(polygonZkEVMContract.sequenceForceBatches([sequence]))
            .to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        // revert because emergency state
        await expect(polygonZkEVMContract.forceBatch(l2txData, maticAmount))
            .to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        // revert because emergency state
        await expect(polygonZkEVMContract.consolidatePendingState(0))
            .to.be.revertedWith('PolygonZkEVM::consolidatePendingState: only if not emergency state');

        // trustedAggregator forge the batch
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const numBatch = (await polygonZkEVMContract.lastVerifiedBatch()).toNumber() + 1;
        const proofA = ['0', '0'];
        const proofB = [
            ['0', '0'],
            ['0', '0'],
        ];
        const proofC = ['0', '0'];
        const pendingStateNum = 0;

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).verifyBatches(
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

        // Check PolygonZkEVMBridge no PolygonZkEVMBridge is in emergency state also
        const tokenAddress = ethers.constants.AddressZero;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = 1;
        const destinationAddress = deployer.address;

        await expect(polygonZkEVMBridgeContract.bridgeAsset(
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            '0x',
        )).to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        await expect(polygonZkEVMBridgeContract.bridgeMessage(
            destinationNetwork,
            destinationAddress,
            '0x',
        )).to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        const proof = Array(32).fill(ethers.constants.HashZero);
        const index = 0;
        const root = ethers.constants.HashZero;

        await expect(polygonZkEVMBridgeContract.claimAsset(
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

        await expect(polygonZkEVMBridgeContract.claimMessage(
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
        await expect(polygonZkEVMContract.activateEmergencyState(0))
            .to.be.revertedWith('EmergencyManager::ifNotEmergencyState: only if not emergency state');

        await expect(polygonZkEVMBridgeContract.connect(deployer).deactivateEmergencyState())
            .to.be.revertedWith('PolygonZkEVM::onlyPolygonZkEVM: only PolygonZkEVM contract');

        await expect(polygonZkEVMContract.deactivateEmergencyState())
            .to.be.revertedWith('PolygonZkEVM::onlyAdmin: Only admin');

        await expect(polygonZkEVMContract.connect(admin).deactivateEmergencyState())
            .to.emit(polygonZkEVMContract, 'EmergencyStateDeactivated')
            .to.emit(polygonZkEVMBridgeContract, 'EmergencyStateDeactivated');

        // Check isEmergencyState
        expect(await polygonZkEVMContract.isEmergencyState()).to.be.equal(false);
        expect(await polygonZkEVMBridgeContract.isEmergencyState()).to.be.equal(false);

        /*
         * Continue normal flow
         * Approve tokens
         */
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(polygonZkEVMContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await polygonZkEVMContract.lastBatchSequenced();
        // Sequence Batches
        await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.emit(polygonZkEVMContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        // trustedAggregator forge the batch
        const initialAggregatorMatic = await maticTokenContract.balanceOf(
            trustedAggregator.address,
        );
        await ethers.provider.send('evm_increaseTime', [trustedAggregatorTimeoutDefault]); // evm_setNextBlockTimestamp

        // Verify batch
        await expect(
            polygonZkEVMContract.connect(trustedAggregator).verifyBatches(
                pendingStateNum,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.emit(polygonZkEVMContract, 'VerifyBatches')
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
            polygonZkEVMContract.connect(trustedAggregator).proveNonDeterministicPendingState(
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
        ).to.be.revertedWith('PolygonZkEVM::_proveDistinctPendingState: finalNewBatch must be equal to currentLastVerifiedBatch');

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).proveNonDeterministicPendingState(
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
        ).to.be.revertedWith('PolygonZkEVM::_proveDistinctPendingState: finalNewBatch must be equal to currentLastVerifiedBatch');

        const newStateRootDistinct = '0x0000000000000000000000000000000000000000000000000000000000000002';

        await expect(
            polygonZkEVMContract.proveNonDeterministicPendingState(
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
        ).to.emit(polygonZkEVMContract, 'ProveNonDeterministicPendingState').withArgs(newStateRoot, newStateRootDistinct)
            .to.emit(polygonZkEVMContract, 'EmergencyStateActivated')
            .to.emit(polygonZkEVMBridgeContract, 'EmergencyStateActivated');

        // Check emergency state is active
        expect(await polygonZkEVMContract.isEmergencyState()).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.isEmergencyState()).to.be.equal(true);
    });
});
