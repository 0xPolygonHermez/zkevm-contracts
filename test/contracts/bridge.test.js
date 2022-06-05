const { expect } = require('chai');
const { ethers } = require('hardhat');
const MerkleTreeBridge = require('@polygon-hermez/zkevm-commonjs').MTBridge;
const {
    verifyMerkleProof,
    calculateLeafValue,
} = require('@polygon-hermez/zkevm-commonjs').mtBridgeUtils;

function calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot) {
    return ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}

describe('Bridge Contract', () => {
    let deployer;
    let rollup;
    let acc1;

    let globalExitRootManager;
    let bridgeContract;
    let tokenContract;

    const tokenName = 'Matic Token';
    const tokenSymbol = 'MATIC';
    const tokenInitialBalance = ethers.utils.parseEther('20000000');

    const networkIDMainnet = 0;
    const networkIDRollup = 1;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, rollup, acc1] = await ethers.getSigners();

        // deploy bridge
        const precalculatBridgeAddress = await ethers.utils.getContractAddress(
            { from: deployer.address, nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 1 },
        );

        // deploy global exit root manager
        const globalExitRootManagerFactory = await ethers.getContractFactory('GlobalExitRootManager');
        globalExitRootManager = await globalExitRootManagerFactory.deploy(rollup.address, precalculatBridgeAddress);
        await globalExitRootManager.deployed();

        // deploy bridge
        const bridgeFactory = await ethers.getContractFactory('Bridge');
        bridgeContract = await bridgeFactory.deploy(networkIDMainnet, globalExitRootManager.address);
        await bridgeContract.deployed();

        expect(bridgeContract.address).to.be.equal(precalculatBridgeAddress);

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
        expect(await bridgeContract.globalExitRootManager()).to.be.equal(globalExitRootManager.address);
        expect(await bridgeContract.networkID()).to.be.equal(networkIDMainnet);

        // Smart contracts start with nonce = 1
        const calcualteImplAddr = await ethers.utils.getContractAddress(
            { from: bridgeContract.address, nonce: 1 },
        );
        expect(await bridgeContract.tokenImplementation()).to.be.equal(calcualteImplAddr);
    });

    it('should bridge and verify merkle proof', async () => {
        const depositCount = await bridgeContract.depositCount();
        const originalNetwork = networkIDMainnet;
        const tokenAddress = tokenContract.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const balanceDeployer = await tokenContract.balanceOf(deployer.address);
        const balanceBridge = await tokenContract.balanceOf(bridgeContract.address);

        const rollupExitRoot = await globalExitRootManager.lastRollupExitRoot();
        const lastGlobalExitRootNum = await globalExitRootManager.lastGlobalExitRootNum();

        // create a new deposit
        await expect(tokenContract.approve(bridgeContract.address, amount))
            .to.emit(tokenContract, 'Approval')
            .withArgs(deployer.address, bridgeContract.address, amount);

        // pre compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(bridgeContract.bridge(tokenAddress, amount, destinationNetwork, destinationAddress))
            .to.emit(bridgeContract, 'BridgeEvent')
            .withArgs(tokenAddress, amount, originalNetwork, destinationNetwork, destinationAddress, depositCount)
            .to.emit(globalExitRootManager, 'UpdateGlobalExitRoot')
            .withArgs(lastGlobalExitRootNum + 1, rootJSMainnet, rollupExitRoot);

        expect(await tokenContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer.sub(amount));
        expect(await tokenContract.balanceOf(bridgeContract.address)).to.be.equal(balanceBridge.add(amount));

        // check merkle root with SC
        const rootSCMainnet = await bridgeContract.getDepositRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
        expect(await bridgeContract.verifyMerkleProof(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            rootSCMainnet,
        )).to.be.equal(true);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        expect(computedGlobalExitRoot).to.be.equal(await globalExitRootManager.getLastGlobalExitRoot());
    });

    it('should claim tokens from Mainnet to Mainnet', async () => {
        const originalNetwork = networkIDMainnet;
        const tokenAddress = tokenContract.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = acc1.address;

        const mainnetExitRoot = await globalExitRootManager.lastMainnetExitRoot();
        let lastGlobalExitRootNum = await globalExitRootManager.lastGlobalExitRootNum();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();

        // check only rollup account with update rollup exit root
        await expect(globalExitRootManager.updateExitRoot(rootJSRollup))
            .to.be.revertedWith('GlobalExitRootManager::updateExitRoot: ONLY_ALLOWED_CONTRACTS');

        // add rollup Merkle root
        await expect(globalExitRootManager.connect(rollup).updateExitRoot(rootJSRollup))
            .to.emit(globalExitRootManager, 'UpdateGlobalExitRoot')
            .withArgs(lastGlobalExitRootNum + 1, mainnetExitRoot, rootJSRollup);

        // check roots
        const rollupExitRootSC = await globalExitRootManager.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootJSRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await globalExitRootManager.getLastGlobalExitRoot());

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;
        lastGlobalExitRootNum += 1;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootJSRollup)).to.be.equal(true);
        expect(await bridgeContract.verifyMerkleProof(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            rootJSRollup,
        )).to.be.equal(true);

        /*
         * claim
         * Can't claim without tokens
         */
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('ERC20: transfer amount exceeds balance');

        // transfer tokens, then claim
        await expect(tokenContract.transfer(bridgeContract.address, amount))
            .to.emit(tokenContract, 'Transfer')
            .withArgs(deployer.address, bridgeContract.address, amount);

        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
        ))
            .to.emit(bridgeContract, 'ClaimEvent')
            .withArgs(
                index,
                originalNetwork,
                tokenAddress,
                amount,
                destinationAddress,
            ).to.emit(tokenContract, 'Transfer')
            .withArgs(bridgeContract.address, acc1.address, amount);

        // Can't claim because nullifier
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('Bridge::claim: ALREADY_CLAIMED');
    });

    it('should claim tokens from Rollup to Mainnet', async () => {
        const originalNetwork = networkIDRollup;
        const tokenAddress = ethers.utils.getAddress(ethers.utils.hexlify(ethers.utils.randomBytes(20)));
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = deployer.address;

        const mainnetExitRoot = await globalExitRootManager.lastMainnetExitRoot();
        let lastGlobalExitRootNum = await globalExitRootManager.lastGlobalExitRootNum();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeRollup = new MerkleTreeBridge(height);
        const leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
        merkleTreeRollup.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTreeRollup.getRoot();

        // check only rollup account with update rollup exit root
        await expect(globalExitRootManager.updateExitRoot(rootJSRollup))
            .to.be.revertedWith('GlobalExitRootManager::updateExitRoot: ONLY_ALLOWED_CONTRACTS');

        // add rollup Merkle root
        await expect(globalExitRootManager.connect(rollup).updateExitRoot(rootJSRollup))
            .to.emit(globalExitRootManager, 'UpdateGlobalExitRoot')
            .withArgs(lastGlobalExitRootNum + 1, mainnetExitRoot, rootJSRollup);

        // check roots
        const rollupExitRootSC = await globalExitRootManager.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootJSRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await globalExitRootManager.getLastGlobalExitRoot());

        // check merkle proof
        const proof = merkleTreeRollup.getProofTreeByIndex(0);
        const index = 0;
        lastGlobalExitRootNum += 1;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootJSRollup)).to.be.equal(true);
        expect(await bridgeContract.verifyMerkleProof(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            rootJSRollup,
        )).to.be.equal(true);

        // claim

        // precalculate wrapped erc20 address
        const tokenWrappedFactory = await ethers.getContractFactory('TokenWrapped');

        // create2 parameters
        const tokenImplementationAddress = await bridgeContract.tokenImplementation();
        const salt = ethers.utils.solidityKeccak256(['uint32', 'address'], [networkIDRollup, tokenAddress]);
        // Bytecode proxy from this blog https://blog.openzeppelin.com/deep-dive-into-the-minimal-proxy-contract/
        const minimalBytecodeProxy = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${tokenImplementationAddress.slice(2)}5af43d82803e903d91602b57fd5bf3`;
        const hashInitCode = ethers.utils.keccak256(minimalBytecodeProxy);

        const precalculateWrappedErc20 = await ethers.utils.getCreate2Address(bridgeContract.address, salt, hashInitCode);
        const newWrappedToken = tokenWrappedFactory.attach(precalculateWrappedErc20);

        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
        ))
            .to.emit(bridgeContract, 'ClaimEvent')
            .withArgs(
                index,
                originalNetwork,
                tokenAddress,
                amount,
                destinationAddress,
            ).to.emit(bridgeContract, 'NewWrappedToken')
            .withArgs(originalNetwork, tokenAddress, precalculateWrappedErc20)
            .to.emit(newWrappedToken, 'Transfer')
            .withArgs(ethers.constants.AddressZero, deployer.address, amount);

        // Assert maps created
        const newTokenInfo = await bridgeContract.addressToTokenInfo(precalculateWrappedErc20);

        expect(newTokenInfo.originalNetwork).to.be.equal(networkIDRollup);
        expect(newTokenInfo.originalTokenAddress).to.be.equal(tokenAddress);
        expect(await bridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(precalculateWrappedErc20);
        expect(await bridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(precalculateWrappedErc20);

        expect(await bridgeContract.tokenInfoToAddress(salt)).to.be.equal(precalculateWrappedErc20);

        // Can't claim because nullifier
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('Bridge::claim: ALREADY_CLAIMED');

        // Check new token
        expect(await newWrappedToken.totalSupply()).to.be.equal(amount);

        // Burn Tokens
        const depositCount = await bridgeContract.depositCount();
        const wrappedTokenAddress = newWrappedToken.address;
        const newDestinationNetwork = networkIDRollup;

        const rollupExitRoot = await globalExitRootManager.lastRollupExitRoot();
        lastGlobalExitRootNum = await globalExitRootManager.lastGlobalExitRootNum();

        // create a new deposit
        await expect(newWrappedToken.approve(bridgeContract.address, amount))
            .to.emit(newWrappedToken, 'Approval')
            .withArgs(deployer.address, bridgeContract.address, amount);

        /*
         *  pre compute root merkle tree in Js
         * const height = 32;
         */
        const merkleTreeMainnet = new MerkleTreeBridge(height);
        // Imporant calcualte leaf with origin token address no wrapped token address
        const originalTokenAddress = tokenAddress;
        const leafValueMainnet = calculateLeafValue(
            originalNetwork,
            originalTokenAddress,
            amount,
            newDestinationNetwork,
            destinationAddress,
        );
        merkleTreeMainnet.add(leafValueMainnet);
        const rootJSMainnet = merkleTreeMainnet.getRoot();

        // Tokens are burnt
        await expect(bridgeContract.bridge(wrappedTokenAddress, amount, newDestinationNetwork, destinationAddress))
            .to.emit(bridgeContract, 'BridgeEvent')
            .withArgs(originalTokenAddress, amount, originalNetwork, newDestinationNetwork, destinationAddress, depositCount)
            .to.emit(globalExitRootManager, 'UpdateGlobalExitRoot')
            .withArgs(Number(lastGlobalExitRootNum) + 1, rootJSMainnet, rollupExitRoot)
            .to.emit(newWrappedToken, 'Transfer')
            .withArgs(deployer.address, ethers.constants.AddressZero, amount);

        expect(await newWrappedToken.totalSupply()).to.be.equal(0);
        expect(await newWrappedToken.balanceOf(deployer.address)).to.be.equal(0);
        expect(await newWrappedToken.balanceOf(bridgeContract.address)).to.be.equal(0);

        // check merkle root with SC
        const rootSCMainnet = await bridgeContract.getDepositRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proofMainnet = merkleTreeMainnet.getProofTreeByIndex(0);
        const indexMainnet = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValueMainnet, proofMainnet, indexMainnet, rootSCMainnet)).to.be.equal(true);
        expect(await bridgeContract.verifyMerkleProof(
            originalTokenAddress,
            amount,
            originalNetwork,
            newDestinationNetwork,
            destinationAddress,
            proofMainnet,
            indexMainnet,
            rootSCMainnet,
        )).to.be.equal(true);

        const computedGlobalExitRoot2 = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        expect(computedGlobalExitRoot2).to.be.equal(await globalExitRootManager.getLastGlobalExitRoot());
    });

    it('should bridge and sync the current root with events', async () => {
        const depositCount = await bridgeContract.depositCount();
        const originalNetwork = networkIDMainnet;
        const tokenAddress = ethers.constants.AddressZero; // Ether
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        // create 3 new deposit
        await expect(bridgeContract.bridge(tokenAddress, amount, destinationNetwork, destinationAddress, { value: amount }))
            .to.emit(bridgeContract, 'BridgeEvent')
            .withArgs(tokenAddress, amount, originalNetwork, destinationNetwork, destinationAddress, depositCount);
        await expect(bridgeContract.bridge(tokenAddress, amount, destinationNetwork, destinationAddress, { value: amount }))
            .to.emit(bridgeContract, 'BridgeEvent')
            .withArgs(tokenAddress, amount, originalNetwork, destinationNetwork, destinationAddress, 1);
        await expect(bridgeContract.bridge(tokenAddress, amount, destinationNetwork, destinationAddress, { value: amount }))
            .to.emit(bridgeContract, 'BridgeEvent')
            .withArgs(tokenAddress, amount, originalNetwork, destinationNetwork, destinationAddress, 2);

        // Prepare merkle tree
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);

        // Get the deposit's events
        const filter = bridgeContract.filters.BridgeEvent(null, null, null, null, null);
        const events = await bridgeContract.queryFilter(filter, 0, 'latest');
        events.forEach((e) => {
            const { args } = e;
            const leafValue = calculateLeafValue(
                originalNetwork,
                args.tokenAddres,
                args.amount,
                args.destinationNetwork,
                args.destinationAddress,
            );
            merkleTree.add(leafValue);
        });

        // Check merkle root with SC
        const rootSC = await bridgeContract.getDepositRoot();
        const rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);
    });

    it('should claim testing all the asserts', async () => {
        // Add a claim leaf to rollup exit tree
        const originalNetwork = networkIDMainnet;
        const tokenAddress = tokenContract.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = deployer.address;

        const mainnetExitRoot = await globalExitRootManager.lastMainnetExitRoot();
        let lastGlobalExitRootNum = await globalExitRootManager.lastGlobalExitRootNum();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();

        // add rollup Merkle root
        await expect(globalExitRootManager.connect(rollup).updateExitRoot(rootJSRollup))
            .to.emit(globalExitRootManager, 'UpdateGlobalExitRoot')
            .withArgs(lastGlobalExitRootNum + 1, mainnetExitRoot, rootJSRollup);

        // check roots
        const rollupExitRootSC = await globalExitRootManager.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootJSRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await globalExitRootManager.getLastGlobalExitRoot());

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;
        lastGlobalExitRootNum += 1;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootJSRollup)).to.be.equal(true);
        expect(await bridgeContract.verifyMerkleProof(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            rootJSRollup,
        )).to.be.equal(true);

        // Can't claim without tokens
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('ERC20: transfer amount exceeds balance');

        // transfer tokens, then claim
        await expect(tokenContract.transfer(bridgeContract.address, amount))
            .to.emit(tokenContract, 'Transfer')
            .withArgs(deployer.address, bridgeContract.address, amount);

        // Check DESTINATION_NETWORK_DOES_NOT_MATCH assert
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            networkIDRollup, // destination network rollup
            destinationAddress,
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('Bridge::claim: DESTINATION_NETWORK_DOES_NOT_MATCH');

        // Check GLOBAL_EXIT_ROOT_DOES_NOT_MATCH assert
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            mainnetExitRoot,
            mainnetExitRoot, // wrong rollup root
        )).to.be.revertedWith('Bridge::claim: GLOBAL_EXIT_ROOT_DOES_NOT_MATCH');

        // Check SMT_INVALID assert
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index + 1, // Wrong index
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('Bridge::claim: SMT_INVALID');

        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
        ))
            .to.emit(bridgeContract, 'ClaimEvent')
            .withArgs(
                index,
                originalNetwork,
                tokenAddress,
                amount,
                destinationAddress,
            ).to.emit(tokenContract, 'Transfer')
            .withArgs(bridgeContract.address, deployer.address, amount);

        // Check ALREADY_CLAIMED_claim
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('Bridge::claim: ALREADY_CLAIMED');
    });

    it('should claim ether', async () => {
        // Add a claim leaf to rollup exit tree
        const originalNetwork = networkIDMainnet;
        const tokenAddress = ethers.constants.AddressZero; // ether
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = deployer.address;

        const mainnetExitRoot = await globalExitRootManager.lastMainnetExitRoot();
        let lastGlobalExitRootNum = await globalExitRootManager.lastGlobalExitRootNum();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();

        // add rollup Merkle root
        await expect(globalExitRootManager.connect(rollup).updateExitRoot(rootJSRollup))
            .to.emit(globalExitRootManager, 'UpdateGlobalExitRoot')
            .withArgs(lastGlobalExitRootNum + 1, mainnetExitRoot, rootJSRollup);

        // check roots
        const rollupExitRootSC = await globalExitRootManager.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootJSRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await globalExitRootManager.getLastGlobalExitRoot());

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;
        lastGlobalExitRootNum += 1;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootJSRollup)).to.be.equal(true);
        expect(await bridgeContract.verifyMerkleProof(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            rootJSRollup,
        )).to.be.equal(true);

        /*
         * claim
         * Can't claim without ether
         */
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('Bridge::claim: ETH_TRANSFER_FAILED');

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);
        /*
         * Create a deposit to add ether to the Bridge
         * Check deposit amount ether asserts
         */
        await expect(bridgeContract.bridge(tokenAddress, amount, networkIDRollup, destinationAddress, { value: ethers.utils.parseEther('100') })).to.be.revertedWith('Bridge::bridge: AMOUNT_DOES_NOT_MATCH_MSG_VALUE');

        // Check mainnet destination assert
        await expect(bridgeContract.bridge(tokenAddress, amount, networkIDMainnet, destinationAddress, { value: amount })).to.be.revertedWith('Bridge::bridge: DESTINATION_CANT_BE_ITSELF');

        // This is used just to pay ether to the bridge smart contract and be able to claim it afterwards.
        expect(await bridgeContract.bridge(tokenAddress, amount, networkIDRollup, destinationAddress, { value: amount }));

        // Check balances before claim
        expect(await ethers.provider.getBalance(bridgeContract.address)).to.be.equal(amount);
        expect(await ethers.provider.getBalance(deployer.address)).to.be.lte(balanceDeployer.sub(amount));

        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
        ))
            .to.emit(bridgeContract, 'ClaimEvent')
            .withArgs(
                index,
                originalNetwork,
                tokenAddress,
                amount,
                destinationAddress,
            );

        // Check balances after claim
        expect(await ethers.provider.getBalance(bridgeContract.address)).to.be.equal(ethers.utils.parseEther('0'));
        expect(await ethers.provider.getBalance(deployer.address)).to.be.lte(balanceDeployer);

        // Can't claim because nullifier
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('Bridge::claim: ALREADY_CLAIMED');
    });
});
