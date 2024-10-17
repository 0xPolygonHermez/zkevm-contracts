import {MemDB, ZkEVMDB, getPoseidon, smtUtils, processorUtils} from "@0xpolygonhermez/zkevm-commonjs";
const {Address} = require("ethereumjs-util");
import {ethers} from "hardhat";
const {getContractAddress} = require("@ethersproject/address");
import fs from "fs";
const bridgeContractName = "BridgeL2SovereignChain";

async function updateVanillaGenesis(genesis, chainID, initializeParams) {
    // Load genesis on a zkEVMDB
    const poseidon = await getPoseidon();
    const {F} = poseidon;
    const db = new MemDB(F);
    const genesisRoot = [F.zero, F.zero, F.zero, F.zero];
    const accHashInput = [F.zero, F.zero, F.zero, F.zero];
    const zkEVMDB = await ZkEVMDB.newZkEVM(
        db,
        poseidon,
        genesisRoot,
        accHashInput,
        genesis.genesis,
        null,
        null,
        chainID
    );
    const batch = await zkEVMDB.buildBatch(
        1000, //limitTimestamp
        ethers.ZeroAddress, //trustedSequencer
        smtUtils.stringToH4(ethers.ZeroHash),
        undefined,
        {} //options
    );
    // Add changeL2Block tx
    const txChangeL2Block = {
        type: 11,
        deltaTimestamp: 3,
        l1Info: {
            globalExitRoot: "0x090bcaf734c4f06c93954a827b45a6e8c67b8e0fd1e0a35a1c5982d6961828f9",
            blockHash: "0x24a5871d68723340d9eadc674aa8ad75f3e33b61d5a9db7db92af856a19270bb",
            timestamp: "42",
        },
        indexL1InfoTree: 0,
    };
    const rawChangeL2BlockTx = processorUtils.serializeChangeL2Block(txChangeL2Block);
    batch.addRawTx(`0x${rawChangeL2BlockTx}`);

    // Create deploy bridge transaction
    const sovereignBridgeFactory = await ethers.getContractFactory("BridgeL2SovereignChain");
    // Get deploy transaction for bridge
    const deployBridgeData = await sovereignBridgeFactory.getDeployTransaction();
    const deployer = genesis.genesis.find((o: {accountName: string}) => o.accountName === "deployer");
    let deployerNonce = Number(deployer.nonce);
    const txDeploy = ethers.Transaction.from({
        to: null,
        nonce: deployerNonce,
        value: 0,
        gasLimit: 10000000,
        gasPrice: 0,
        data: deployBridgeData.data,
        chainId: chainID,
        type: 0, // legacy transaction
    });
    await addTxToBatch(batch, txDeploy);
    const sovereignBridgeAddress = getContractAddress({from: deployer.address, nonce: deployerNonce++}); // Increase nonce

    // Create deploy GER transaction
    const gerContractName = "GlobalExitRootManagerL2SovereignChain";
    const gerFactory = await ethers.getContractFactory(gerContractName);
    const deployGERData = await gerFactory.getDeployTransaction(sovereignBridgeAddress);
    txDeploy.nonce = deployerNonce;
    txDeploy.data = deployGERData.data;
    await addTxToBatch(batch, txDeploy);
    const GERAddress = getContractAddress({from: deployer.address, nonce: deployerNonce++});

    await batch.executeTxs();
    await zkEVMDB.consolidate(batch);

    // Get values of bridge and ger for genesis
    const gerGenesis = await getDataFromBatch(GERAddress, batch);
    const bridgeGenesis = await getDataFromBatch(sovereignBridgeAddress, batch);

    // replace old bridge and ger manager by sovereign contracts bytecode
    const oldBridge = genesis.genesis.find(function (obj) {
        return obj.contractName == "PolygonZkEVMBridgeV2";
    });
    oldBridge.contractName = bridgeContractName;
    oldBridge.bytecode = bridgeGenesis.bytecode;
    // oldBridge.storage = bridgeGenesis.storage;

    const oldGer = genesis.genesis.find(function (obj) {
        return obj.contractName == "PolygonZkEVMGlobalExitRootL2";
    });
    oldGer.contractName = gerContractName;
    oldGer.bytecode = gerGenesis.bytecode;
    // oldGer.storage = gerGenesis.storage;
    // Update genesis with new contracts bytecode and storage

    // Setup a second zkEVM to initialize both contracts
    const zkEVMDB2 = await ZkEVMDB.newZkEVM(
        new MemDB(F),
        poseidon,
        genesisRoot,
        accHashInput,
        genesis.genesis,
        null,
        null,
        chainID
    );
    const batch2 = await zkEVMDB2.buildBatch(
        1000, //limitTimestamp
        ethers.ZeroAddress, //trustedSequencer
        smtUtils.stringToH4(ethers.ZeroHash),
        undefined,
        {} //options
    );
    // Add changeL2Block tx
    batch2.addRawTx(`0x${rawChangeL2BlockTx}`);
    // Initialize bridge
    const {
        rollupID,
        gasTokenAddress,
        gasTokenNetwork,
        globalExitRootManager,
        polygonRollupManager,
        gasTokenMetadata,
        bridgeManager,
        sovereignWETHAddress,
        sovereignWETHAddressIsNotMintable,
        globalExitRootUpdater,
    } = initializeParams;
    const initializeData = sovereignBridgeFactory.interface.encodeFunctionData(
        "initialize(uint32,address,uint32,address,address,bytes,address,address,bool)",
        [
            rollupID,
            gasTokenAddress,
            gasTokenNetwork,
            globalExitRootManager,
            polygonRollupManager,
            gasTokenMetadata,
            bridgeManager,
            sovereignWETHAddress,
            sovereignWETHAddressIsNotMintable,
        ]
    );
    // Get bridge proxy address
    const bridgeProxy = genesis.genesis.find(function (obj) {
        return obj.contractName == "PolygonZkEVMBridgeV2 proxy";
    });
    const injectedTx = {
        type: 0, // force ethers to parse it as a legacy transaction
        chainId: 0, // force ethers to parse it as a pre-EIP155 transaction
        to: bridgeProxy.address,
        value: 0,
        gasPrice: 0,
        gasLimit: 30000000,
        nonce: 0,
        data: initializeData,
        signature: {
            v: "0x1b",
            r: "0x00000000000000000000000000000000000000000000000000000005ca1ab1e0",
            s: "0x000000000000000000000000000000000000000000000000000000005ca1ab1e",
        },
    };
    const txObject = ethers.Transaction.from(injectedTx);
    const txInitializeBridge = processorUtils.rawTxToCustomRawTx(txObject.serialized);
    batch2.addRawTx(txInitializeBridge);

    // Initialize GER Manager
    const gerProxy = genesis.genesis.find(function (obj) {
        return obj.contractName == "PolygonZkEVMGlobalExitRootL2 proxy";
    });
    const initializeGERData = gerFactory.interface.encodeFunctionData("initialize", [globalExitRootUpdater]);
    // Update injectedTx to initialize GER
    injectedTx.to = gerProxy.address;
    injectedTx.data = initializeGERData;

    const txObject2 = ethers.Transaction.from(injectedTx);
    const txInitializeGER = processorUtils.rawTxToCustomRawTx(txObject2.serialized);
    batch2.addRawTx(txInitializeGER);

    // Execute batch
    await batch2.executeTxs();
    await zkEVMDB2.consolidate(batch2);

    const proxyBridgeInitializedGenesis = await getDataFromBatch(bridgeProxy.address, batch2);

    // Update bridgeProxy genesis
    bridgeProxy.contractName = bridgeContractName + " proxy";
    bridgeProxy.storage = proxyBridgeInitializedGenesis.storage;

    const proxyGERInitializedGenesis = await getDataFromBatch(gerProxy.address, batch2);

    // Update bridgeProxy genesis
    gerProxy.contractName = gerContractName + " proxy";
    gerProxy.storage = proxyGERInitializedGenesis.storage;
    // update genesis root
    genesis.root = smtUtils.h4toString(zkEVMDB2.stateRoot);
    // fs.writeFileSync("genesis-vanilla.json", JSON.stringify(genesis, null, 2));
    return genesis;
}

/**
 * Adds a deploy transaction to the batch, it is signer by deployer address
 * @param batch Batch to add the transaction
 * @param tx tx to add to the batch
 */
async function addTxToBatch(batch, tx) {
    const signer = ethers.HDNodeWallet.fromMnemonic(
        ethers.Mnemonic.fromPhrase("test test test test test test test test test test test junk"),
        "m/44'/60'/0'/0/0"
    );
    const signedTx = await signer.signTransaction(tx);
    const rawTx = processorUtils.rawTxToCustomRawTx(signedTx);
    batch.addRawTx(rawTx);
}

/**
 * Creates a contract object with the current state of the contract
 * @param contractAddress to retrieve the data
 * @param batch to obtain the vm
 * @returns the current state of the contract
 */
async function getDataFromBatch(contractAddress, batch) {
    const addressInstance = Address.fromString(contractAddress);
    const account = await batch.vm.stateManager.getAccount(addressInstance);
    const code = await batch.vm.stateManager.getContractCode(addressInstance);
    const sto = await batch.vm.stateManager.dumpStorage(addressInstance);
    const keys = Object.keys(sto).map((k) => `0x${k}`);
    const values = Object.values(sto).map((k) => `0x${k}`);
    const contractObject = {
        balance: account.balance.toString(),
        nonce: account.nonce.toString(),
        address: contractAddress,
        bytecode: `0x${code.toString("hex")}`,
        storage: {},
    };
    for (let k = 0; k < keys.length; k++) {
        const value = ethers.decodeRlp(values[k]);
        contractObject.storage[keys[k]] = `0x${value.replace(/^0x/, "").padStart(64, "0")}`;
    }
    return contractObject;
}

export default updateVanillaGenesis;
