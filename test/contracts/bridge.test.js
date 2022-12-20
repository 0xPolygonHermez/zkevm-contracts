const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const MerkleTreeBridge = require('@0xpolygonhermez/zkevm-commonjs').MTBridge;
const {
    verifyMerkleProof,
    getLeafValue,
} = require('@0xpolygonhermez/zkevm-commonjs').mtBridgeUtils;

function calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot) {
    return ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}

describe('PolygonZkEVMBridge Contract', () => {
    let deployer;
    let rollup;
    let acc1;

    let polygonZkEVMGlobalExitRoot;
    let polygonZkEVMBridgeContract;
    let tokenContract;

    const tokenName = 'Matic Token';
    const tokenSymbol = 'MATIC';
    const decimals = 18;
    const tokenInitialBalance = ethers.utils.parseEther('20000000');
    const metadataToken = ethers.utils.defaultAbiCoder.encode(
        ['string', 'string', 'uint8'],
        [tokenName, tokenSymbol, decimals],
    );

    const networkIDMainnet = 0;
    const networkIDRollup = 1;

    const LEAF_TYPE_ASSET = 0;
    const LEAF_TYPE_MESSAGE = 1;

    const polygonZkEVMAddress = ethers.constants.AddressZero;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, rollup, acc1] = await ethers.getSigners();

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], { initializer: false });

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], { initializer: false });

        await polygonZkEVMGlobalExitRoot.initialize(rollup.address, polygonZkEVMBridgeContract.address);

        await polygonZkEVMBridgeContract.initialize(networkIDMainnet, polygonZkEVMGlobalExitRoot.address, polygonZkEVMAddress);

        // deploy token
        const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        tokenContract = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );
        await tokenContract.deployed();
    });

    it('should check the constructor parameters', async () => {
        expect(await polygonZkEVMBridgeContract.globalExitRootManager()).to.be.equal(polygonZkEVMGlobalExitRoot.address);
        expect(await polygonZkEVMBridgeContract.networkID()).to.be.equal(networkIDMainnet);
        expect(await polygonZkEVMBridgeContract.zkEVMaddress()).to.be.equal(polygonZkEVMAddress);
    });

    it('should PolygonZkEVMBridge asset and verify merkle proof', async () => {
        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = tokenContract.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.utils.solidityKeccak256(['bytes'], [metadata]);

        const balanceDeployer = await tokenContract.balanceOf(deployer.address);
        const balanceBridge = await tokenContract.balanceOf(polygonZkEVMBridgeContract.address);

        const rollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();

        // create a new deposit
        await expect(tokenContract.approve(polygonZkEVMBridgeContract.address, amount))
            .to.emit(tokenContract, 'Approval')
            .withArgs(deployer.address, polygonZkEVMBridgeContract.address, amount);

        // pre compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(polygonZkEVMBridgeContract.bridgeAsset(tokenAddress, destinationNetwork, destinationAddress, amount, '0x'))
            .to.emit(polygonZkEVMBridgeContract, 'BridgeEvent')
            .withArgs(LEAF_TYPE_ASSET, originNetwork, tokenAddress, destinationNetwork, destinationAddress, amount, metadata, depositCount)
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(rootJSMainnet, rollupExitRoot);

        expect(await tokenContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer.sub(amount));
        expect(await tokenContract.balanceOf(polygonZkEVMBridgeContract.address)).to.be.equal(balanceBridge.add(amount));

        // check merkle root with SC
        const rootSCMainnet = await polygonZkEVMBridgeContract.getDepositRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.verifyMerkleProof(
            leafValue,
            proof,
            index,
            rootSCMainnet,
        )).to.be.equal(true);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());
    });

    it('should PolygonZkEVMBridge message and verify merkle proof', async () => {
        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const originAddress = deployer.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.utils.solidityKeccak256(['bytes'], [metadata]);
        const rollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();

        // pre compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            originAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(polygonZkEVMBridgeContract.bridgeMessage(destinationNetwork, destinationAddress, metadata, { value: amount }))
            .to.emit(polygonZkEVMBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_MESSAGE,
                originNetwork,
                originAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount,
            );

        // check merkle root with SC
        const rootSCMainnet = await polygonZkEVMBridgeContract.getDepositRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.verifyMerkleProof(
            leafValue,
            proof,
            index,
            rootSCMainnet,
        )).to.be.equal(true);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());
    });

    it('should claim tokens from Mainnet to Mainnet', async () => {
        const originNetwork = networkIDMainnet;
        const tokenAddress = tokenContract.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = acc1.address;

        const metadata = metadataToken;
        const metadataHash = ethers.utils.solidityKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();

        // check only rollup account with update rollup exit root
        await expect(polygonZkEVMGlobalExitRoot.updateExitRoot(rootJSRollup))
            .to.be.revertedWith('PolygonZkEVMGlobalExitRoot::updateExitRoot: ONLY_ALLOWED_CONTRACTS');

        // add rollup Merkle root
        await expect(polygonZkEVMGlobalExitRoot.connect(rollup).updateExitRoot(rootJSRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(mainnetExitRoot, rootJSRollup);

        // check roots
        const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootJSRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootJSRollup)).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.verifyMerkleProof(
            leafValue,
            proof,
            index,
            rootJSRollup,
        )).to.be.equal(true);

        /*
         * claim
         * Can't claim without tokens
         */
        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        )).to.be.revertedWith('ERC20: transfer amount exceeds balance');

        // transfer tokens, then claim
        await expect(tokenContract.transfer(polygonZkEVMBridgeContract.address, amount))
            .to.emit(tokenContract, 'Transfer')
            .withArgs(deployer.address, polygonZkEVMBridgeContract.address, amount);

        expect(false).to.be.equal(await polygonZkEVMBridgeContract.isClaimed(index));

        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        ))
            .to.emit(polygonZkEVMBridgeContract, 'ClaimEvent')
            .withArgs(
                index,
                originNetwork,
                tokenAddress,
                destinationAddress,
                amount,
            ).to.emit(tokenContract, 'Transfer')
            .withArgs(polygonZkEVMBridgeContract.address, acc1.address, amount);

        // Can't claim because nullifier
        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        )).to.be.revertedWith('PolygonZkEVMBridge::_verifyLeaf: ALREADY_CLAIMED');
        expect(true).to.be.equal(await polygonZkEVMBridgeContract.isClaimed(index));
    });

    it('should claim tokens from Rollup to Mainnet', async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = ethers.utils.getAddress(ethers.utils.hexlify(ethers.utils.randomBytes(20)));
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = deployer.address;

        const metadata = metadataToken; // since we are inserting in the exit root can be anything
        const metadataHash = ethers.utils.solidityKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeRollup = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTreeRollup.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTreeRollup.getRoot();

        // check only rollup account with update rollup exit root
        await expect(polygonZkEVMGlobalExitRoot.updateExitRoot(rootJSRollup))
            .to.be.revertedWith('PolygonZkEVMGlobalExitRoot::updateExitRoot: ONLY_ALLOWED_CONTRACTS');

        // add rollup Merkle root
        await expect(polygonZkEVMGlobalExitRoot.connect(rollup).updateExitRoot(rootJSRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(mainnetExitRoot, rootJSRollup);

        // check roots
        const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootJSRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // check merkle proof
        const proof = merkleTreeRollup.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootJSRollup)).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.verifyMerkleProof(
            leafValue,
            proof,
            index,
            rootJSRollup,
        )).to.be.equal(true);

        // claim

        // precalculate wrapped erc20 address
        const tokenWrappedFactory = await ethers.getContractFactory('TokenWrapped');

        // create2 parameters
        const salt = ethers.utils.solidityKeccak256(['uint32', 'address'], [networkIDRollup, tokenAddress]);
        const minimalBytecodeProxy = tokenWrappedFactory.bytecode;
        const hashInitCode = ethers.utils.solidityKeccak256(['bytes', 'bytes'], [minimalBytecodeProxy, metadataToken]);
        const precalculateWrappedErc20 = await ethers.utils.getCreate2Address(polygonZkEVMBridgeContract.address, salt, hashInitCode);
        const newWrappedToken = tokenWrappedFactory.attach(precalculateWrappedErc20);

        // Use precalculatedWrapperAddress and check if matches
        expect(await polygonZkEVMBridgeContract.precalculatedWrapperAddress(
            networkIDRollup,
            tokenAddress,
            tokenName,
            tokenSymbol,
            decimals,
        )).to.be.equal(precalculateWrappedErc20);

        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        ))
            .to.emit(polygonZkEVMBridgeContract, 'ClaimEvent')
            .withArgs(
                index,
                originNetwork,
                tokenAddress,
                destinationAddress,
                amount,
            ).to.emit(polygonZkEVMBridgeContract, 'NewWrappedToken')
            .withArgs(originNetwork, tokenAddress, precalculateWrappedErc20)
            .to.emit(newWrappedToken, 'Transfer')
            .withArgs(ethers.constants.AddressZero, deployer.address, amount);

        // Assert maps created
        const newTokenInfo = await polygonZkEVMBridgeContract.wrappedTokenToTokenInfo(precalculateWrappedErc20);

        expect(newTokenInfo.originNetwork).to.be.equal(networkIDRollup);
        expect(newTokenInfo.originTokenAddress).to.be.equal(tokenAddress);
        expect(await polygonZkEVMBridgeContract.getTokenWrappedAddress(
            networkIDRollup,
            tokenAddress,
        )).to.be.equal(precalculateWrappedErc20);
        expect(await polygonZkEVMBridgeContract.getTokenWrappedAddress(
            networkIDRollup,
            tokenAddress,
        )).to.be.equal(precalculateWrappedErc20);

        expect(await polygonZkEVMBridgeContract.tokenInfoToWrappedToken(salt)).to.be.equal(precalculateWrappedErc20);

        // Check the wrapper info
        expect(await newWrappedToken.name()).to.be.equal(tokenName);
        expect(await newWrappedToken.symbol()).to.be.equal(tokenSymbol);
        expect(await newWrappedToken.decimals()).to.be.equal(decimals);

        // Can't claim because nullifier
        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        )).to.be.revertedWith('PolygonZkEVMBridge::_verifyLeaf: ALREADY_CLAIMED');

        // Check new token
        expect(await newWrappedToken.totalSupply()).to.be.equal(amount);

        // Burn Tokens
        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const wrappedTokenAddress = newWrappedToken.address;
        const newDestinationNetwork = networkIDRollup;

        const rollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();

        // create a new deposit
        await expect(newWrappedToken.approve(polygonZkEVMBridgeContract.address, amount))
            .to.emit(newWrappedToken, 'Approval')
            .withArgs(deployer.address, polygonZkEVMBridgeContract.address, amount);

        /*
         *  pre compute root merkle tree in Js
         * const height = 32;
         */
        const merkleTreeMainnet = new MerkleTreeBridge(height);
        // Imporant calcualte leaf with origin token address no wrapped token address
        const originTokenAddress = tokenAddress;
        const metadataMainnet = '0x'; // since the token does not belong to this network
        const metadataHashMainnet = ethers.utils.solidityKeccak256(['bytes'], [metadataMainnet]);

        const leafValueMainnet = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            originTokenAddress,
            newDestinationNetwork,
            destinationAddress,
            amount,
            metadataHashMainnet,
        );
        const leafValueMainnetSC = await polygonZkEVMBridgeContract.getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            originTokenAddress,
            newDestinationNetwork,
            destinationAddress,
            amount,
            metadataHashMainnet,
        );

        expect(leafValueMainnet).to.be.equal(leafValueMainnetSC);
        merkleTreeMainnet.add(leafValueMainnet);
        const rootJSMainnet = merkleTreeMainnet.getRoot();

        // Tokens are burnt
        await expect(polygonZkEVMBridgeContract.bridgeAsset(wrappedTokenAddress, newDestinationNetwork, destinationAddress, amount, '0x'))
            .to.emit(polygonZkEVMBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                originTokenAddress,
                newDestinationNetwork,
                destinationAddress,
                amount,
                metadataMainnet,
                depositCount,
            )
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(rootJSMainnet, rollupExitRoot)
            .to.emit(newWrappedToken, 'Transfer')
            .withArgs(deployer.address, ethers.constants.AddressZero, amount);

        expect(await newWrappedToken.totalSupply()).to.be.equal(0);
        expect(await newWrappedToken.balanceOf(deployer.address)).to.be.equal(0);
        expect(await newWrappedToken.balanceOf(polygonZkEVMBridgeContract.address)).to.be.equal(0);

        // check merkle root with SC
        const rootSCMainnet = await polygonZkEVMBridgeContract.getDepositRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proofMainnet = merkleTreeMainnet.getProofTreeByIndex(0);
        const indexMainnet = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValueMainnet, proofMainnet, indexMainnet, rootSCMainnet)).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.verifyMerkleProof(
            leafValueMainnet,
            proofMainnet,
            indexMainnet,
            rootSCMainnet,
        )).to.be.equal(true);

        const computedGlobalExitRoot2 = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        expect(computedGlobalExitRoot2).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());
    });

    it('should PolygonZkEVMBridge and sync the current root with events', async () => {
        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.constants.AddressZero; // Ether
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = '0x';// since is ether does not have metadata

        // create 3 new deposit
        await expect(polygonZkEVMBridgeContract.bridgeAsset(
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            '0x',
            { value: amount },
        ))
            .to.emit(
                polygonZkEVMBridgeContract,
                'BridgeEvent',
            )
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount,
            );

        await expect(polygonZkEVMBridgeContract.bridgeAsset(
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            '0x',
            { value: amount },
        ))
            .to.emit(
                polygonZkEVMBridgeContract,
                'BridgeEvent',
            )
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount.add(1),
            );

        await expect(polygonZkEVMBridgeContract.bridgeAsset(
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            '0x',
            { value: amount },
        ))
            .to.emit(
                polygonZkEVMBridgeContract,
                'BridgeEvent',
            )
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount.add(2),
            );

        // Prepare merkle tree
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);

        // Get the deposit's events
        const filter = polygonZkEVMBridgeContract.filters.BridgeEvent(
            null,
            null,
            null,
            null,
            null,
        );
        const events = await polygonZkEVMBridgeContract.queryFilter(filter, 0, 'latest');
        events.forEach((e) => {
            const { args } = e;
            const leafValue = getLeafValue(
                args.leafType,
                args.originNetwork,
                args.originAddress,
                args.destinationNetwork,
                args.destinationAddress,
                args.amount,
                ethers.utils.solidityKeccak256(['bytes'], [args.metadata]),
            );
            merkleTree.add(leafValue);
        });

        // Check merkle root with SC
        const rootSC = await polygonZkEVMBridgeContract.getDepositRoot();
        const rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);
    });

    it('should claim testing all the asserts', async () => {
        // Add a claim leaf to rollup exit tree
        const originNetwork = networkIDMainnet;
        const tokenAddress = tokenContract.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.utils.solidityKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();

        // add rollup Merkle root
        await expect(polygonZkEVMGlobalExitRoot.connect(rollup).updateExitRoot(rootJSRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(mainnetExitRoot, rootJSRollup);

        // check roots
        const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootJSRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootJSRollup)).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.verifyMerkleProof(
            leafValue,
            proof,
            index,
            rootJSRollup,
        )).to.be.equal(true);

        // Can't claim without tokens
        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        )).to.be.revertedWith('ERC20: transfer amount exceeds balance');

        // transfer tokens, then claim
        await expect(tokenContract.transfer(polygonZkEVMBridgeContract.address, amount))
            .to.emit(tokenContract, 'Transfer')
            .withArgs(deployer.address, polygonZkEVMBridgeContract.address, amount);

        // Check DESTINATION_NETWORK_DOES_NOT_MATCH assert
        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            networkIDRollup, // Wrong destination network
            destinationAddress,
            amount,
            metadata,
        )).to.be.revertedWith('PolygonZkEVMBridge::_verifyLeaf: DESTINATION_NETWORK_DOES_NOT_MATCH');

        // Check GLOBAL_EXIT_ROOT_INVALID assert
        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index,
            mainnetExitRoot,
            mainnetExitRoot, // Wrong rollup Root
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        )).to.be.revertedWith('PolygonZkEVMBridge::_verifyLeaf: GLOBAL_EXIT_ROOT_INVALID');

        // Check SMT_INVALID assert
        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index + 1, // Wrong index
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        )).to.be.revertedWith('PolygonZkEVMBridge::_verifyLeaf: SMT_INVALID');

        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        ))
            .to.emit(polygonZkEVMBridgeContract, 'ClaimEvent')
            .withArgs(
                index,
                originNetwork,
                tokenAddress,
                destinationAddress,
                amount,
            ).to.emit(tokenContract, 'Transfer')
            .withArgs(polygonZkEVMBridgeContract.address, deployer.address, amount);

        // Check ALREADY_CLAIMED_claim
        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        )).to.be.revertedWith('PolygonZkEVMBridge::_verifyLeaf: ALREADY_CLAIMED');
    });

    it('should claim ether', async () => {
        // Add a claim leaf to rollup exit tree
        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.constants.AddressZero; // ether
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = deployer.address;

        const metadata = '0x'; // since is ether does not have metadata
        const metadataHash = ethers.utils.solidityKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();

        // add rollup Merkle root
        await expect(polygonZkEVMGlobalExitRoot.connect(rollup).updateExitRoot(rootJSRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(mainnetExitRoot, rootJSRollup);

        // check roots
        const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootJSRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootJSRollup)).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.verifyMerkleProof(
            leafValue,
            proof,
            index,
            rootJSRollup,
        )).to.be.equal(true);

        /*
         * claim
         * Can't claim without ether
         */
        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        )).to.be.revertedWith('PolygonZkEVMBridge::claimAsset: ETH_TRANSFER_FAILED');

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);
        /*
         * Create a deposit to add ether to the PolygonZkEVMBridge
         * Check deposit amount ether asserts
         */
        await expect(polygonZkEVMBridgeContract.bridgeAsset(
            tokenAddress,
            networkIDRollup,
            destinationAddress,
            amount,
            '0x',
            { value: ethers.utils.parseEther('100') },
        )).to.be.revertedWith('PolygonZkEVMBridge::bridgeAsset: AMOUNT_DOES_NOT_MATCH_MSG_VALUE');

        // Check mainnet destination assert
        await expect(polygonZkEVMBridgeContract.bridgeAsset(
            tokenAddress,
            networkIDMainnet,
            destinationAddress,
            amount,
            '0x',
            { value: amount },
        )).to.be.revertedWith('PolygonZkEVMBridge::bridgeAsset: DESTINATION_CANT_BE_ITSELF');

        // This is used just to pay ether to the PolygonZkEVMBridge smart contract and be able to claim it afterwards.
        expect(await polygonZkEVMBridgeContract.bridgeAsset(
            tokenAddress,
            networkIDRollup,
            destinationAddress,
            amount,
            '0x',
            { value: amount },
        ));

        // Check balances before claim
        expect(await ethers.provider.getBalance(polygonZkEVMBridgeContract.address)).to.be.equal(amount);
        expect(await ethers.provider.getBalance(deployer.address)).to.be.lte(balanceDeployer.sub(amount));

        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        ))
            .to.emit(polygonZkEVMBridgeContract, 'ClaimEvent')
            .withArgs(
                index,
                originNetwork,
                tokenAddress,
                destinationAddress,
                amount,
            );

        // Check balances after claim
        expect(await ethers.provider.getBalance(polygonZkEVMBridgeContract.address)).to.be.equal(ethers.utils.parseEther('0'));
        expect(await ethers.provider.getBalance(deployer.address)).to.be.lte(balanceDeployer);

        // Can't claim because nullifier
        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        )).to.be.revertedWith('PolygonZkEVMBridge::_verifyLeaf: ALREADY_CLAIMED');
    });

    it('should claim message', async () => {
        // Add a claim leaf to rollup exit tree
        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.constants.AddressZero; // ether
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = deployer.address;

        const metadata = '0x'; // since is ether does not have metadata
        const metadataHash = ethers.utils.solidityKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();

        // add rollup Merkle root
        await expect(polygonZkEVMGlobalExitRoot.connect(rollup).updateExitRoot(rootJSRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(mainnetExitRoot, rootJSRollup);

        // check roots
        const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootJSRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootJSRollup)).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.verifyMerkleProof(
            leafValue,
            proof,
            index,
            rootJSRollup,
        )).to.be.equal(true);

        /*
         * claim
         * Can't claim a message as an assets
         */
        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        )).to.be.revertedWith('PolygonZkEVMBridge::_verifyLeaf: SMT_INVALID');

        /*
         * claim
         * Can't claim without ether
         */
        await expect(polygonZkEVMBridgeContract.claimMessage(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        )).to.be.revertedWith('PolygonZkEVMBridge::claimMessage: MESSAGE_FAILED');

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);
        /*
         * Create a deposit to add ether to the PolygonZkEVMBridge
         * Check deposit amount ether asserts
         */
        await expect(polygonZkEVMBridgeContract.bridgeAsset(
            tokenAddress,
            networkIDRollup,
            destinationAddress,
            amount,
            '0x',
            { value: ethers.utils.parseEther('100') },
        )).to.be.revertedWith('PolygonZkEVMBridge::bridgeAsset: AMOUNT_DOES_NOT_MATCH_MSG_VALUE');

        // Check mainnet destination assert
        await expect(polygonZkEVMBridgeContract.bridgeAsset(
            tokenAddress,
            networkIDMainnet,
            destinationAddress,
            amount,
            '0x',
            { value: amount },
        )).to.be.revertedWith('PolygonZkEVMBridge::bridgeAsset: DESTINATION_CANT_BE_ITSELF');

        // This is used just to pay ether to the PolygonZkEVMBridge smart contract and be able to claim it afterwards.
        expect(await polygonZkEVMBridgeContract.bridgeAsset(
            tokenAddress,
            networkIDRollup,
            destinationAddress,
            amount,
            '0x',
            { value: amount },
        ));

        // Check balances before claim
        expect(await ethers.provider.getBalance(polygonZkEVMBridgeContract.address)).to.be.equal(amount);
        expect(await ethers.provider.getBalance(deployer.address)).to.be.lte(balanceDeployer.sub(amount));

        // Check mainnet destination assert
        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        )).to.be.revertedWith('PolygonZkEVMBridge::_verifyLeaf: SMT_INVALID');

        await expect(polygonZkEVMBridgeContract.claimMessage(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        ))
            .to.emit(polygonZkEVMBridgeContract, 'ClaimEvent')
            .withArgs(
                index,
                originNetwork,
                tokenAddress,
                destinationAddress,
                amount,
            );

        // Check balances after claim
        expect(await ethers.provider.getBalance(polygonZkEVMBridgeContract.address)).to.be.equal(ethers.utils.parseEther('0'));
        expect(await ethers.provider.getBalance(deployer.address)).to.be.lte(balanceDeployer);

        // Can't claim because nullifier
        await expect(polygonZkEVMBridgeContract.claimAsset(
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        )).to.be.revertedWith('PolygonZkEVMBridge::_verifyLeaf: ALREADY_CLAIMED');
    });
});
