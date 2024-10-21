import {MemDB, ZkEVMDB, getPoseidon, smtUtils, processorUtils} from "@0xpolygonhermez/zkevm-commonjs";
import {ethers} from "hardhat";
const {getContractAddress} = require("@ethersproject/address");
const bridgeContractName = "BridgeL2SovereignChain";
import {expect} from "chai";

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
        smtUtils.stringToH4(ethers.ZeroHash), // l1InfoRoot
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
    const injectedTx = {
        type: 0, // force ethers to parse it as a legacy transaction
        chainId: 0, // force ethers to parse it as a pre-EIP155 transaction
        to: null,
        value: 0,
        gasPrice: 0,
        gasLimit: 30000000,
        nonce: 0,
        data: deployBridgeData.data,
        signature: {
            v: "0x1b",
            r: "0x00000000000000000000000000000000000000000000000000000005ca1ab1e0",
            s: "0x000000000000000000000000000000000000000000000000000000005ca1ab1e",
        },
    };
    let txObject = ethers.Transaction.from(injectedTx);
    const txDeployBridge = processorUtils.rawTxToCustomRawTx(txObject.serialized);
    // Check ecrecover
    expect(txObject.from).to.equal(ethers.recoverAddress(txObject.unsignedHash, txObject.signature))
    batch.addRawTx(txDeployBridge);
    const sovereignBridgeAddress = getContractAddress({from: txObject.from, nonce: injectedTx.nonce});

    // Create deploy GER transaction
    const gerContractName = "GlobalExitRootManagerL2SovereignChain";
    const gerFactory = await ethers.getContractFactory(gerContractName);
    const deployGERData = await gerFactory.getDeployTransaction(sovereignBridgeAddress);
    injectedTx.data = deployGERData.data;
    txObject = ethers.Transaction.from(injectedTx);
    const txDeployGER = processorUtils.rawTxToCustomRawTx(txObject.serialized);
    batch.addRawTx(txDeployGER);
    const GERAddress = getContractAddress({from: txObject.from, nonce: injectedTx.nonce});

    await batch.executeTxs();
    await zkEVMDB.consolidate(batch);

    // replace old bridge and ger manager by sovereign contracts bytecode
    const oldBridge = genesis.genesis.find(function (obj) {
        return obj.contractName == "PolygonZkEVMBridgeV2";
    });
    oldBridge.contractName = bridgeContractName;
    oldBridge.bytecode = `0x${await zkEVMDB.getBytecode(sovereignBridgeAddress)}`;

    const oldGer = genesis.genesis.find(function (obj) {
        return obj.contractName == "PolygonZkEVMGlobalExitRootL2";
    });
    oldGer.contractName = gerContractName;
    oldGer.bytecode = `0x${await zkEVMDB.getBytecode(GERAddress)}`;

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
    injectedTx.to = bridgeProxy.address;
    injectedTx.data = initializeData;
    txObject = ethers.Transaction.from(injectedTx);
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

    // Update bridgeProxy storage
    bridgeProxy.contractName = bridgeContractName + " proxy";
    bridgeProxy.storage = await zkEVMDB2.dumpStorage(bridgeProxy.address);
    // Pad storage values with zeros
    const padTo32Bytes = (value) => {
        const hexValue = value.startsWith("0x") ? value.slice(2) : value; // Remove '0x'
        return "0x" + hexValue.padStart(64, "0"); // Pad to 64 hex digits
    };
    bridgeProxy.storage = Object.entries(bridgeProxy.storage).reduce((acc, [key, value]) => {
        acc[key] = padTo32Bytes(value);
        return acc;
    }, {});

    // Sanity check bridge storage
    if (rollupID !== 0) {
        expect(
            ethers.toBigInt(bridgeProxy.storage["0x0000000000000000000000000000000000000000000000000000000000000000"])
        ).to.equal(ethers.toBigInt(ethers.toBeHex(rollupID)));
    }
    if (gasTokenAddress !== ethers.ZeroAddress) {
        expect(
            ethers.toBigInt(bridgeProxy.storage["0x000000000000000000000000000000000000000000000000000000000000006d"])
        ).to.equal(
            ethers.toBigInt(`${ethers.toBeHex(gasTokenNetwork)}${gasTokenAddress.replace(/^0x/, "")}`.toLowerCase())
        );
    }
    expect(bridgeProxy.storage["0x0000000000000000000000000000000000000000000000000000000000000068"]).to.include(
        globalExitRootManager.toLowerCase().slice(2)
    );
    expect(bridgeProxy.storage["0x00000000000000000000000000000000000000000000000000000000000000a3"]).to.include(
        bridgeManager.toLowerCase().slice(2)
    );

    // Update bridgeProxy storage
    gerProxy.contractName = gerContractName + " proxy";
    gerProxy.storage = await zkEVMDB2.dumpStorage(gerProxy.address);
    gerProxy.storage = Object.entries(gerProxy.storage).reduce((acc, [key, value]) => {
        acc[key] = padTo32Bytes(value);
        return acc;
    }, {});

    // Sanity check ger storage
    expect(gerProxy.storage["0x0000000000000000000000000000000000000000000000000000000000000034"]).to.include(
        globalExitRootUpdater.toLowerCase().slice(2)
    );
    // update genesis root
    genesis.root = smtUtils.h4toString(zkEVMDB2.getCurrentStateRoot());
    return genesis;
}

export default updateVanillaGenesis;