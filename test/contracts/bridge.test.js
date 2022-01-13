const { expect } = require('chai');
const { ethers } = require('hardhat');
const {
    MerkleTreeBridge,
} = require('../../src/bridge-merkle-tree/merkle-tree-bridge');
const {
    verifyMerkleProof,
    calculateLeafValue,
} = require('../../src/bridge-merkle-tree/utils-merkle-tree-bridge');

function calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot) {
    return ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}

describe('Bridge Contract', () => {
    let deployer;
    let rollup;

    let bridgeContract;
    let tokenContract;

    const tokenName = 'Matic Token';
    const tokenSymbol = 'MATIC';
    const tokenInitialBalance = ethers.utils.parseEther('20000000');

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, rollup] = await ethers.getSigners();

        // deploy bridgeMock
        const bridgeFactory = await ethers.getContractFactory('Bridge');
        bridgeContract = await bridgeFactory.deploy(rollup.address);
        await bridgeContract.deployed();

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
        const lastRollupExitRoot = await bridgeContract.lastRollupExitRoot();
        const lastMainnetExitRoot = await bridgeContract.lastMainnetExitRoot();

        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const rootJS = merkleTree.getRoot();

        expect(await bridgeContract.rollupAddress()).to.be.equal(rollup.address);
        expect(lastRollupExitRoot).to.be.equal(ethers.BigNumber.from(0));
        expect(lastMainnetExitRoot).to.be.equal(rootJS);
        expect(await bridgeContract.lastGlobalExitRootNum()).to.be.equal(1);
        expect(await bridgeContract.getLastGlobalExitRoot()).to.be.equal(calculateGlobalExitRoot(lastMainnetExitRoot, lastRollupExitRoot));
    });

    it('should deposit and verify merkle proof', async () => {
        const depositCount = await bridgeContract.depositCount();
        const originalNetwork = 0; // mainnet
        const tokenAddress = tokenContract.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = 1;
        const destinationAddress = deployer.address;

        const balanceDeployer = await tokenContract.balanceOf(deployer.address);
        const balanceBridge = await tokenContract.balanceOf(bridgeContract.address);

        const rollupExitRoot = await bridgeContract.lastRollupExitRoot();

        // create a new deposit
        await expect(tokenContract.approve(bridgeContract.address, amount))
            .to.emit(tokenContract, 'Approval')
            .withArgs(deployer.address, bridgeContract.address, amount);

        // pre compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
        merkleTree.add(leafValue);
        const rootJS = merkleTree.getRoot();

        await expect(bridgeContract.bridge(tokenAddress, amount, destinationNetwork, destinationAddress))
            .to.emit(bridgeContract, 'DepositEvent')
            .withArgs(tokenAddress, amount, destinationNetwork, destinationAddress, depositCount)
            .to.emit(bridgeContract, 'UpdateGlobalExitRoot')
            .withArgs(rootJS, rollupExitRoot);

        expect(await tokenContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer.sub(amount));
        expect(await tokenContract.balanceOf(bridgeContract.address)).to.be.equal(balanceBridge.add(amount));

        // check merkle root with SC
        const rootSC = await bridgeContract.getDepositRoot();
        expect(rootSC).to.be.equal(rootJS);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSC)).to.be.equal(true);
        expect(await bridgeContract.verifyMerkleProof(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            rootSC,
        )).to.be.equal(true);

        const mainnetExitRoot = await bridgeContract.lastMainnetExitRoot();

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot);
        expect(computedGlobalExitRoot).to.be.equal(await bridgeContract.getLastGlobalExitRoot());
    });

    it('should add a withdraw function in the bridge smart contract', async () => {
        const originalNetwork = 0; // mainnet
        const tokenAddress = tokenContract.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = 0;
        const destinationAddress = deployer.address;

        const mainnetExitRoot = await bridgeContract.lastMainnetExitRoot();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();

        // check only rollup account with update rollup exit root
        await expect(bridgeContract.updateRollupExitRoot(rootJSRollup))
            .to.be.revertedWith('Bridge::updateRollupExitRoot: ONLY_ROLLUP');

        // add rollup Merkle root
        await expect(bridgeContract.connect(rollup).updateRollupExitRoot(rootJSRollup))
            .to.emit(bridgeContract, 'UpdateGlobalExitRoot')
            .withArgs(mainnetExitRoot, rootJSRollup);

        // check roots
        const rollupExitRootSC = await bridgeContract.lastRollupExitRoot();

        expect(rollupExitRootSC).to.be.equal(rootJSRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await bridgeContract.getLastGlobalExitRoot());

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

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

        // withdraw
        const lastGlobalExitRootNum = await bridgeContract.lastGlobalExitRootNum();

        // Can't withdraw without tokens
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            lastGlobalExitRootNum,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('ERC20: transfer amount exceeds balance');

        // transfer tokens, then withdraw
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
            lastGlobalExitRootNum,
            mainnetExitRoot,
            rollupExitRootSC,
        ))
            .to.emit(bridgeContract, 'WithdrawEvent')
            .withArgs(
                index,
                originalNetwork,
                tokenAddress,
                amount,
                destinationAddress,
            );

        // Can't withdraw because nullifier
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            lastGlobalExitRootNum,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('Bridge::withdraw: ALREADY_CLAIMED_WITHDRAW');
    });

    it('should add a deposit and rollup roots and sync the current root with events', async () => {
        const depositCount = await bridgeContract.depositCount();
        const originalNetwork = 0; // mainnet
        const tokenAddress = ethers.constants.AddressZero; // Ether
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = 1;
        const destinationAddress = deployer.address;

        // create 3 new deposit
        await expect(bridgeContract.bridge(tokenAddress, amount, destinationNetwork, destinationAddress, { value: amount }))
            .to.emit(bridgeContract, 'DepositEvent')
            .withArgs(tokenAddress, amount, destinationNetwork, destinationAddress, depositCount);
        await expect(bridgeContract.bridge(tokenAddress, amount, destinationNetwork, destinationAddress, { value: amount }))
            .to.emit(bridgeContract, 'DepositEvent')
            .withArgs(tokenAddress, amount, destinationNetwork, destinationAddress, 1);
        await expect(bridgeContract.bridge(tokenAddress, amount, destinationNetwork, destinationAddress, { value: amount }))
            .to.emit(bridgeContract, 'DepositEvent')
            .withArgs(tokenAddress, amount, destinationNetwork, destinationAddress, 2);

        // Prepare merkle tree
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);

        // Get the deposit's events
        const filter = bridgeContract.filters.DepositEvent(null, null, null, null, null);
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

    it('should add a withdraw function in the bridge smart contract testing all the asserts', async () => {
        // Add a withdraw leaf to rollup exit tree
        const originalNetwork = 0; // mainnet
        const tokenAddress = tokenContract.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = 0;
        const destinationAddress = deployer.address;

        const mainnetExitRoot = await bridgeContract.lastMainnetExitRoot();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();

        // add rollup Merkle root
        await expect(bridgeContract.connect(rollup).updateRollupExitRoot(rootJSRollup))
            .to.emit(bridgeContract, 'UpdateGlobalExitRoot')
            .withArgs(mainnetExitRoot, rootJSRollup);

        // check roots
        const rollupExitRootSC = await bridgeContract.lastRollupExitRoot();

        expect(rollupExitRootSC).to.be.equal(rootJSRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await bridgeContract.getLastGlobalExitRoot());

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

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

        // withdraw
        const lastGlobalExitRootNum = await bridgeContract.lastGlobalExitRootNum();

        // Can't withdraw without tokens
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            lastGlobalExitRootNum,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('ERC20: transfer amount exceeds balance');

        // transfer tokens, then withdraw
        await expect(tokenContract.transfer(bridgeContract.address, amount))
            .to.emit(tokenContract, 'Transfer')
            .withArgs(deployer.address, bridgeContract.address, amount);

        // Check DESTINATION_NETWORK_NOT_MAINNET assert
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            1, // Set wrong destination network
            destinationAddress,
            proof,
            index,
            lastGlobalExitRootNum,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('Bridge::withdraw: DESTINATION_NETWORK_NOT_MAINNET');

        // Check ORIGIN_NETWORK_NOT_MAINNET assert
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            1, // Set wrong origin network
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            lastGlobalExitRootNum,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('Bridge::withdraw: ORIGIN_NETWORK_NOT_MAINNET');

        // Check GLOBAL_EXIT_ROOT_DOES_NOT_MATCH assert
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            lastGlobalExitRootNum,
            mainnetExitRoot,
            mainnetExitRoot, // wrong rollup root
        )).to.be.revertedWith('Bridge::withdraw: GLOBAL_EXIT_ROOT_DOES_NOT_MATCH');

        // Check SMT_INVALID assert
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index + 1, // Wrong index
            lastGlobalExitRootNum,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('Bridge::withdraw: SMT_INVALID');

        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            lastGlobalExitRootNum,
            mainnetExitRoot,
            rollupExitRootSC,
        ))
            .to.emit(bridgeContract, 'WithdrawEvent')
            .withArgs(
                index,
                originalNetwork,
                tokenAddress,
                amount,
                destinationAddress,
            );

        // Check ALREADY_CLAIMED_WITHDRAW
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            lastGlobalExitRootNum,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('Bridge::withdraw: ALREADY_CLAIMED_WITHDRAW');
    });

    it('should add a withdraw function in the bridge smart contract with ether', async () => {
        const originalNetwork = 0; // mainnet
        const tokenAddress = ethers.constants.AddressZero;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = 0;
        const destinationAddress = deployer.address;

        const mainnetExitRoot = await bridgeContract.lastMainnetExitRoot();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();

        // add rollup Merkle root
        await expect(bridgeContract.connect(rollup).updateRollupExitRoot(rootJSRollup))
            .to.emit(bridgeContract, 'UpdateGlobalExitRoot')
            .withArgs(mainnetExitRoot, rootJSRollup);

        // check roots
        const rollupExitRootSC = await bridgeContract.lastRollupExitRoot();

        expect(rollupExitRootSC).to.be.equal(rootJSRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await bridgeContract.getLastGlobalExitRoot());

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

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

        // withdraw
        const lastGlobalExitRootNum = await bridgeContract.lastGlobalExitRootNum();

        // Can't withdraw without tokens
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            lastGlobalExitRootNum,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('ETH_TRANSFER_FAILED');

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);
        /*
         * Create a deposit to add ether to the Bridge
         * Check deposit amount ether asserts
         */
        await expect(bridgeContract.bridge(tokenAddress, amount, 1, destinationAddress, { value: ethers.utils.parseEther('100') })).to.be.revertedWith('Bridge::deposit: AMOUNT_DOES_NOT_MATCH_MSG_VALUE');

        // Check mannet destination assert
        await expect(bridgeContract.bridge(tokenAddress, amount, destinationNetwork, destinationAddress, { value: amount })).to.be.revertedWith('Bridge::deposit: DESTINATION_CANT_BE_MAINNET');

        // This is used just to pay ether to the birdge smart contract and be able to withdraw it afterwards.
        expect(await bridgeContract.bridge(tokenAddress, amount, 1, destinationAddress, { value: amount }));

        // Check balances before withdraw
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
            lastGlobalExitRootNum,
            mainnetExitRoot,
            rollupExitRootSC,
        ))
            .to.emit(bridgeContract, 'WithdrawEvent')
            .withArgs(
                index,
                originalNetwork,
                tokenAddress,
                amount,
                destinationAddress,
            );

        // Check balances after withdraw
        expect(await ethers.provider.getBalance(bridgeContract.address)).to.be.equal(ethers.utils.parseEther('0'));
        expect(await ethers.provider.getBalance(deployer.address)).to.be.lte(balanceDeployer);

        // Can't withdraw because nullifier
        await expect(bridgeContract.claim(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            lastGlobalExitRootNum,
            mainnetExitRoot,
            rollupExitRootSC,
        )).to.be.revertedWith('Bridge::withdraw: ALREADY_CLAIMED_WITHDRAW');
    });
});
