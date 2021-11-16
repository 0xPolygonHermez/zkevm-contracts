const { expect } = require("chai");
const { ethers } = require("hardhat");
const SequencerInterface = require("../../../js/sequencer/sequencer");
const helpers = require("../../../js/helpers")

describe("Sequencer test", async function () {
    let deployer;
    let userAWallet;
    let userBWallet;

    let verifierContract;
    let bridgeContract;
    let proofOfEfficiencyContract;
    let maticTokenContract;
    let sequencer;

    const maticTokenName = "Matic Token";
    const maticTokenSymbol = "MATIC";
    const decimals = 18;
    const maticTokenInitialBalance = ethers.utils.parseEther("20000000");
    const maticAmount = ethers.utils.parseEther("1");


    before("Deploy contract", async () => {
        // load signers
        const signers = await ethers.getSigners();

        // assign signers
        deployer = signers[0];
        aggregator = signers[1];
        sequencer = signers[2];
        userAWallet = signers[3];

        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory(
            "VerifierRollupHelper"
        );
        verifierContract = await VerifierRollupHelperFactory.deploy();

        // deploy MATIC
        const maticTokenFactory = await ethers.getContractFactory("ERC20PermitMock");
        maticTokenContract = await maticTokenFactory.deploy(
            maticTokenName,
            maticTokenSymbol,
            deployer.address,
            maticTokenInitialBalance
        );
        await maticTokenContract.deployed();

        // deploy bridge
        const precalculatePoEAddress = await ethers.utils.getContractAddress(
            { "from": deployer.address, "nonce": (await ethers.provider.getTransactionCount(deployer.address)) + 1 });
        const BridgeFactory = await ethers.getContractFactory("BridgeMock");
        bridgeContract = await BridgeFactory.deploy(precalculatePoEAddress);
        await bridgeContract.deployed();

        // deploy proof of efficiency
        const ProofOfEfficiencyFactory = await ethers.getContractFactory("ProofOfEfficiency");
        proofOfEfficiencyContract = await ProofOfEfficiencyFactory.deploy(
            bridgeContract.address,
            maticTokenContract.address,
            verifierContract.address
        );
        await proofOfEfficiencyContract.deployed();
        expect(proofOfEfficiencyContract.address).to.be.equal(precalculatePoEAddress);

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(sequencer.address, ethers.utils.parseEther("100"));
    });

    it("Initialize Sequencer", async function () {
        sequencerInterface = new SequencerInterface(sequencer, proofOfEfficiencyContract, "URL");
    });
    it("Register Sequencer", async function () {
        await sequencerInterface.registerSequencer();
    });
    it("SendBatch 1 tx", async function () {
        const wallet = ethers.Wallet.createRandom();
        const tx = {
            from: wallet.address,
            to: userAWallet.address,
            nonce: 0,
            data: '',
            value: 0,
            gasLimit: 2100,
            gasPrice: 2000000000,
            chainId: 1,
        }
        const txB = await wallet.signTransaction(tx)
        const signedTx = ethers.utils.parseTransaction(txB);
        await sequencerInterface.addTx(signedTx);
        maticTokenContract.connect(sequencer).approve(proofOfEfficiencyContract.address, maticAmount)
        await sequencerInterface.sendBatch(maticAmount);
    });

    it("SendBatch 3 tx", async function () {
        const wallet = ethers.Wallet.createRandom();
        const tx0 = {
            to: userAWallet.address,
            nonce: 0,
            data: '',
            value: 0,
            gasLimit: 2100,
            gasPrice: 2000000000,
            chainId: 1,
        }
        const txA = await wallet.signTransaction(tx0);
        const signedTxA = ethers.utils.parseTransaction(txA);
        await sequencerInterface.addTx(signedTxA);

        const tx1 = {
            to: "0x1111111111111111111111111111111111111111",
            nonce: 8,
            data: '',
            value: "0x2C68AF0BB140000",
            gasLimit: 21000,
            gasPrice: 20000000000,
            chainId: 1,
        }
        const txB = await wallet.signTransaction(tx1);
        const signedTxB = ethers.utils.parseTransaction(txB);
        await sequencerInterface.addTx(signedTxB);

        const tx2 = {
            to: "0x1212121212121212121212121212121212121212",
            nonce: 2,
            data: '',
            value: "0x6FC23AC00",
            gasLimit: 21000,
            gasPrice: 20000000000,
            chainId: 1,
        }
        const txC = await wallet.signTransaction(tx2)
        const signedTxC = ethers.utils.parseTransaction(txC);
        await sequencerInterface.addTx(signedTxC);

        maticTokenContract.connect(sequencer).approve(proofOfEfficiencyContract.address, maticAmount)
        await sequencerInterface.sendBatch(maticAmount);
    });
});