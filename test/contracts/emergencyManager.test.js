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
    const maticTokenInitialBalance = ethers.parseEther('20000000');

    const genesisRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';

    const networkIDMainnet = 0;
    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const chainID = 1000;
    const networkName = 'zkevm';
    const version = '0.0.1';
    const pendingStateTimeoutDefault = 10;
    const trustedAggregatorTimeoutDefault = 10;
    let firstDeployment = true;

    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

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

        /*
         * deploy global exit root manager
         * In order to not have trouble with nonce deploy first proxy admin
         */
        await upgrades.deployProxyAdmin();
        if ((await upgrades.admin.getInstance()).address !== '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0') {
            firstDeployment = false;
        }

        const nonceProxyBridge = Number((await ethers.provider.getTransactionCount(deployer.address))) + (firstDeployment ? 3 : 2);
        const nonceProxyZkevm = nonceProxyBridge + 2; // Always have to redeploy impl since the polygonZkEVMGlobalExitRoot address changes

        const precalculateBridgeAddress = ethers.getContractAddress({ from: deployer.address, nonce: nonceProxyBridge });
        const precalculateZkevmAddress = ethers.getContractAddress({ from: deployer.address, nonce: nonceProxyZkevm });
        firstDeployment = false;

        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            initializer: false,
            constructorArgs: [precalculateZkevmAddress, precalculateBridgeAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], { initializer: false });

        // deploy PolygonZkEVMMock
        const PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVMMock');
        polygonZkEVMContract = await upgrades.deployProxy(PolygonZkEVMFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.address,
                maticTokenContract.address,
                verifierContract.address,
                polygonZkEVMBridgeContract.address,
                chainID,
                0,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        expect(precalculateBridgeAddress).to.be.equal(polygonZkEVMBridgeContract.address);
        expect(precalculateZkevmAddress).to.be.equal(polygonZkEVMContract.address);

        await polygonZkEVMBridgeContract.initialize(networkIDMainnet, polygonZkEVMGlobalExitRoot.address, polygonZkEVMContract.address);
        await polygonZkEVMContract.initialize(
            {
                admin: admin.address,
                trustedSequencer: trustedSequencer.address,
                pendingStateTimeout: pendingStateTimeoutDefault,
                trustedAggregator: trustedAggregator.address,
                trustedAggregatorTimeout: trustedAggregatorTimeoutDefault,
            },
            genesisRoot,
            urlSequencer,
            networkName,
            version,
        );

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(trustedSequencer.address, ethers.parseEther('1000'));

        // Activate force batches
        await expect(
            polygonZkEVMContract.connect(admin).activateForceBatches(),
        ).to.emit(polygonZkEVMContract, 'ActivateForceBatches');
    });

    it('should activate emergency mode', async () => {
        // Check isEmergencyState
        expect(await polygonZkEVMContract.isEmergencyState()).to.be.equal(false);
        expect(await polygonZkEVMBridgeContract.isEmergencyState()).to.be.equal(false);

        await expect(polygonZkEVMContract.connect(admin).deactivateEmergencyState())
            .to.be.revertedWith('OnlyEmergencyState');

        // Set isEmergencyState
        await expect(polygonZkEVMContract.connect(admin).activateEmergencyState(1))
            .to.be.revertedWith('BatchNotSequencedOrNotSequenceEnd');

        await expect(polygonZkEVMBridgeContract.connect(deployer).activateEmergencyState())
            .to.be.revertedWith('OnlyPolygonZkEVM');

        await expect(polygonZkEVMContract.activateEmergencyState(0))
            .to.emit(polygonZkEVMContract, 'EmergencyStateActivated')
            .to.emit(polygonZkEVMBridgeContract, 'EmergencyStateActivated');

        expect(await polygonZkEVMContract.isEmergencyState()).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.isEmergencyState()).to.be.equal(true);

        // Once in emergency state no sequenceBatches/forceBatches can be done
        const l2txData = '0x123456';
        const maticAmount = await polygonZkEVMContract.batchFee();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.HashZero,
            timestamp: ethers.BigNumber.from(currentTimestamp),
            minForcedTimestamp: 0,
        };

        // revert because emergency state
        await expect(polygonZkEVMContract.sequenceBatches([sequence], deployer.address))
            .to.be.revertedWith('OnlyNotEmergencyState');

        // revert because emergency state
        await expect(polygonZkEVMContract.sequenceForceBatches([sequence]))
            .to.be.revertedWith('OnlyNotEmergencyState');

        // revert because emergency state
        await expect(polygonZkEVMContract.forceBatch(l2txData, maticAmount))
            .to.be.revertedWith('OnlyNotEmergencyState');

        // revert because emergency state
        await expect(polygonZkEVMContract.consolidatePendingState(0))
            .to.be.revertedWith('OnlyNotEmergencyState');

        // trustedAggregator forge the batch
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const numBatch = (await polygonZkEVMContract.lastVerifiedBatch()).toNumber() + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.HashZero);
        const pendingStateNum = 0;

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).verifyBatches(
                pendingStateNum,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('OnlyNotEmergencyState');

        // Check PolygonZkEVMBridge no PolygonZkEVMBridge is in emergency state also
        const tokenAddress = ethers.ZeroAddress;
        const amount = ethers.parseEther('10');
        const destinationNetwork = 1;
        const destinationAddress = deployer.address;

        await expect(polygonZkEVMBridgeContract.bridgeAsset(
            destinationNetwork,
            destinationAddress,
            amount,
            tokenAddress,
            true,
            '0x',
        )).to.be.revertedWith('OnlyNotEmergencyState');

        await expect(polygonZkEVMBridgeContract.bridgeMessage(
            destinationNetwork,
            destinationAddress,
            true,
            '0x',
        )).to.be.revertedWith('OnlyNotEmergencyState');

        const proof = Array(32).fill(ethers.HashZero);
        const index = 0;
        const root = ethers.HashZero;

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
        )).to.be.revertedWith('OnlyNotEmergencyState');

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
        )).to.be.revertedWith('OnlyNotEmergencyState');

        // Emergency council should deactivate emergency mode
        await expect(polygonZkEVMContract.activateEmergencyState(0))
            .to.be.revertedWith('OnlyNotEmergencyState');

        await expect(polygonZkEVMBridgeContract.connect(deployer).deactivateEmergencyState())
            .to.be.revertedWith('OnlyPolygonZkEVM');

        await expect(polygonZkEVMContract.deactivateEmergencyState())
            .to.be.revertedWith('OnlyAdmin');

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
        await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address))
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
                zkProofFFlonk,
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
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('FinalNumBatchDoesNotMatchPendingState');

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).proveNonDeterministicPendingState(
                pendingStateNum,
                finalPendingStateNum,
                numBatch - 1,
                numBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('FinalNumBatchDoesNotMatchPendingState');

        const newStateRootDistinct = '0x0000000000000000000000000000000000000000000000000000000000000002';

        await expect(
            polygonZkEVMContract.proveNonDeterministicPendingState(
                pendingStateNum,
                finalPendingStateNum,
                numBatch - 1,
                numBatch,
                newLocalExitRoot,
                newStateRootDistinct,
                zkProofFFlonk,
            ),
        ).to.emit(polygonZkEVMContract, 'ProveNonDeterministicPendingState').withArgs(newStateRoot, newStateRootDistinct)
            .to.emit(polygonZkEVMContract, 'EmergencyStateActivated')
            .to.emit(polygonZkEVMBridgeContract, 'EmergencyStateActivated');

        // Check emergency state is active
        expect(await polygonZkEVMContract.isEmergencyState()).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.isEmergencyState()).to.be.equal(true);
    });
});
