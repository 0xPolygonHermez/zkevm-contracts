import { expect } from 'chai';
import { ethers } from 'hardhat';

import { MemDB, ZkEVMDB, getPoseidon, smtUtils, processorUtils } from '@0xpolygonhermez/zkevm-commonjs';
import { getContractAddress } from '@ethersproject/address';
import {
    GENESIS_CONTRACT_NAMES,
    SUPPORT_GER_MANAGER_IMPLEMENTATION,
    SUPPORT_GER_MANAGER_PROXY,
    SUPPORT_BRIDGE_IMPLEMENTATION,
    SUPPORT_BRIDGE_PROXY,
    SUPPORT_TOKEN_WRAPPED_IMPLEMENTATION,
} from '../../../src/constants';
import { padTo32Bytes, padTo20Bytes } from './deployment-utils';
import { checkParams } from '../../../src/utils';

function toPaddedHex32(val: string | number | bigint): string {
    return ethers.zeroPadValue(ethers.toBeHex(val), 32);
}

async function updateVanillaGenesis(genesis, chainID, initializeParams) {
    // Check initialize params
    const mandatoryUpgradeParameters = [
        'rollupID',
        'gasTokenAddress',
        'gasTokenNetwork',
        'gasTokenMetadata',
        'bridgeManager',
        'sovereignWETHAddress',
        'sovereignWETHAddressIsNotMintable',
        'globalExitRootRemover',
        'emergencyBridgePauser',
        'emergencyBridgeUnpauser',
        'proxiedTokensManager',
    ];
    checkParams(initializeParams, mandatoryUpgradeParameters);

    // Remove BYTECODE_STORER contract if present
    genesis.genesis = genesis.genesis.filter(function (obj) {
        return obj.contractName !== GENESIS_CONTRACT_NAMES.BYTECODE_STORER;
    });

    // Load genesis on a zkEVMDB
    const poseidon = await getPoseidon();
    const { F } = poseidon;
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
        chainID,
    );
    const batch = await zkEVMDB.buildBatch(
        1000, // limitTimestamp
        ethers.ZeroAddress, // trustedSequencer
        smtUtils.stringToH4(ethers.ZeroHash), // l1InfoRoot
        ethers.ZeroHash, // Forced block hash
        undefined,
        {
            vcmConfig: {
                skipCounters: true,
            },
        },
    );
    // Add changeL2Block tx
    const txChangeL2Block = {
        type: 11,
        deltaTimestamp: 3,
        l1Info: {
            globalExitRoot: ethers.ZeroAddress, // Can be any value
            blockHash: '0x24a5871d68723340d9eadc674aa8ad75f3e33b61d5a9db7db92af856a19270bb', // Can be any value
            timestamp: '42',
        },
        indexL1InfoTree: 0,
    };
    const rawChangeL2BlockTx = processorUtils.serializeChangeL2Block(txChangeL2Block);
    batch.addRawTx(`0x${rawChangeL2BlockTx}`);

    // Create deploy bridge transaction
    const sovereignBridgeFactory = await ethers.getContractFactory('AgglayerBridgeL2');
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
            v: '0x1b',
            r: '0x00000000000000000000000000000000000000000000000000000005ca1ab1e0',
            s: '0x000000000000000000000000000000000000000000000000000000005ca1ab1e',
        },
    };
    let txObject = ethers.Transaction.from(injectedTx);
    const bridgeDeployer = txObject.from?.toLocaleLowerCase();
    const txDeployBridge = processorUtils.rawTxToCustomRawTx(txObject.serialized);
    // Check ecrecover
    expect(txObject.from).to.equal(ethers.recoverAddress(txObject.unsignedHash, txObject.signature as any));
    batch.addRawTx(txDeployBridge);
    const sovereignBridgeAddress = getContractAddress({ from: txObject.from, nonce: injectedTx.nonce });

    // Create deploy GER transaction
    const gerContractName = GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN;
    const gerFactory = await ethers.getContractFactory(gerContractName);
    const oldBridge = genesis.genesis.find(function (obj) {
        return SUPPORT_BRIDGE_IMPLEMENTATION.includes(obj.contractName);
    });
    // Get bridge proxy address
    const bridgeProxy = genesis.genesis.find(function (obj) {
        return SUPPORT_BRIDGE_PROXY.includes(obj.contractName);
    });
    const deployGERData = await gerFactory.getDeployTransaction(bridgeProxy.address);
    injectedTx.data = deployGERData.data;
    txObject = ethers.Transaction.from(injectedTx);
    const txDeployGER = processorUtils.rawTxToCustomRawTx(txObject.serialized);
    // Check ecrecover
    expect(txObject.from).to.equal(ethers.recoverAddress(txObject.unsignedHash, txObject.signature as any));
    batch.addRawTx(txDeployGER);
    const GERAddress = getContractAddress({ from: txObject.from, nonce: injectedTx.nonce });

    await batch.executeTxs();
    await zkEVMDB.consolidate(batch);

    /// ///////////////////////
    // Bridge contract
    /// ///////////////////////
    // replace old bridge and ger manager by sovereign contracts bytecode, storage and nonce
    oldBridge.contractName = GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE_IMPLEMENTATION;
    oldBridge.bytecode = `0x${await zkEVMDB.getBytecode(sovereignBridgeAddress)}`;
    oldBridge.storage = await zkEVMDB.dumpStorage(sovereignBridgeAddress);
    oldBridge.storage = Object.entries(oldBridge.storage).reduce((acc, [key, value]) => {
        acc[key] = padTo32Bytes(value);
        return acc;
    }, {});
    const bridgeInfo = await zkEVMDB.getCurrentAccountState(sovereignBridgeAddress);
    oldBridge.nonce = Number(bridgeInfo.nonce);

    /// ///////////////////////
    // TokenWrappedImplementation contract
    /// ///////////////////////
    // Compute the address of the wrappedTokenImplementation contract deployed by the deployed sovereign bridge with nonce 1
    const precalculatedAddressTokenWrappedImplementation = ethers.getCreateAddress({
        from: sovereignBridgeAddress,
        nonce: 1,
    });

    const tokenWrappedImplementationDeployedBytecode = `0x${await zkEVMDB.getBytecode(precalculatedAddressTokenWrappedImplementation)}`;
    const tokenWrappedImplementationState = await zkEVMDB.getCurrentAccountState(
        precalculatedAddressTokenWrappedImplementation,
    );
    const tokenWrappedImplementationObjectNew = {
        contractName: GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION,
        balance: tokenWrappedImplementationState.balance.toString(),
        nonce: tokenWrappedImplementationState.nonce.toString(),
        address: precalculatedAddressTokenWrappedImplementation,
        bytecode: tokenWrappedImplementationDeployedBytecode,
    };

    tokenWrappedImplementationObjectNew.storage = await zkEVMDB.dumpStorage(
        precalculatedAddressTokenWrappedImplementation,
    );
    tokenWrappedImplementationObjectNew.storage = Object.entries(tokenWrappedImplementationObjectNew.storage).reduce(
        (acc, [key, value]) => {
            acc[key] = padTo32Bytes(value);
            return acc;
        },
        {},
    );

    // Check if the genesis contains TokenWrappedImplementation contract
    let tokenWrappedImplementationObject = genesis.genesis.find(function (obj) {
        return SUPPORT_TOKEN_WRAPPED_IMPLEMENTATION.includes(obj.contractName);
    });

    // If it's not contained add it to the genesis
    if (typeof tokenWrappedImplementationObject === 'undefined') {
        tokenWrappedImplementationObject = tokenWrappedImplementationObjectNew;
        genesis.genesis.push(tokenWrappedImplementationObject);
    } else {
        // modify the reference in genesis.genesis
        Object.assign(tokenWrappedImplementationObject, tokenWrappedImplementationObjectNew);
        // Check bytecode of the TokenWrappedImplementation contract
        expect(tokenWrappedImplementationObject.bytecode).to.equal(tokenWrappedImplementationDeployedBytecode);
    }

    /// ///////////////////////
    // BridgeLib contract
    /// ///////////////////////
    // Compute the address of the bridgeLib contract deployed by the deployed sovereign bridge with nonce 2
    const precalculatedAddressBridgeLib = ethers.getCreateAddress({
        from: sovereignBridgeAddress,
        nonce: 2,
    });

    // Check nonce is 4
    const bridgeState = await zkEVMDB.getCurrentAccountState(sovereignBridgeAddress);
    expect(Number(bridgeState.nonce)).to.equal(3);

    // Replace it with deployed bridgeLib contract
    const bridgeLibImplementationDeployedBytecode = `0x${await zkEVMDB.getBytecode(precalculatedAddressBridgeLib)}`;
    const bridgeLibImplementationState = await zkEVMDB.getCurrentAccountState(precalculatedAddressBridgeLib);
    const bridgeLibImplementationObjectNew = {
        contractName: GENESIS_CONTRACT_NAMES.BRIDGE_LIB,
        balance: bridgeLibImplementationState.balance.toString(),
        nonce: bridgeLibImplementationState.nonce.toString(),
        address: precalculatedAddressBridgeLib,
        bytecode: bridgeLibImplementationDeployedBytecode,
    };
    bridgeLibImplementationObjectNew.storage = await zkEVMDB.dumpStorage(precalculatedAddressBridgeLib);
    bridgeLibImplementationObjectNew.storage = Object.entries(bridgeLibImplementationObjectNew.storage).reduce(
        (acc, [key, value]) => {
            acc[key] = padTo32Bytes(value);
            return acc;
        },
        {},
    );

    // Check if the genesis contains BridgeLib contract and replace it with deployed bridgeLib contract, or add it if not present
    let bridgeLibImplementationObject = genesis.genesis.find(function (obj) {
        return obj.contractName === GENESIS_CONTRACT_NAMES.BRIDGE_LIB;
    });

    // If it's not contained add it to the genesis
    if (typeof bridgeLibImplementationObject === 'undefined') {
        bridgeLibImplementationObject = bridgeLibImplementationObjectNew;
        genesis.genesis.push(bridgeLibImplementationObject);
    } else {
        // modify the reference in genesis.genesis
        Object.assign(bridgeLibImplementationObject, bridgeLibImplementationObjectNew);
        // Check bytecode of the BridgeLib contract
        expect(bridgeLibImplementationObject.bytecode).to.equal(bridgeLibImplementationDeployedBytecode);
    }

    /// ///////////////////////
    // GER contract
    /// ///////////////////////

    const oldGer = genesis.genesis.find(function (obj) {
        return SUPPORT_GER_MANAGER_IMPLEMENTATION.includes(obj.contractName);
    });
    oldGer.contractName = GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_IMPLEMENTATION;
    oldGer.bytecode = `0x${await zkEVMDB.getBytecode(GERAddress)}`;
    oldGer.storage = await zkEVMDB.dumpStorage(GERAddress);
    oldGer.storage = Object.entries(oldGer.storage).reduce((acc, [key, value]) => {
        acc[key] = padTo32Bytes(value);
        return acc;
    }, {});

    // Initialize bridge
    const gerProxy = genesis.genesis.find(function (obj) {
        return SUPPORT_GER_MANAGER_PROXY.includes(obj.contractName);
    });

    const {
        rollupID,
        gasTokenAddress,
        gasTokenNetwork,
        gasTokenMetadata,
        bridgeManager,
        sovereignWETHAddress,
        sovereignWETHAddressIsNotMintable,
        globalExitRootRemover,
        emergencyBridgePauser,
        emergencyBridgeUnpauser,
        proxiedTokensManager,
    } = initializeParams;
    const initializeData = sovereignBridgeFactory.interface.encodeFunctionData(
        'initialize(uint32,address,uint32,address,address,bytes,address,address,bool,address,address,address)',
        [
            rollupID,
            gasTokenAddress,
            gasTokenNetwork,
            gerProxy.address, // Global exit root manager address from base genesis
            ethers.ZeroAddress, // Polygon rollup manager address always zero for sovereign chains
            gasTokenMetadata,
            bridgeManager,
            sovereignWETHAddress,
            sovereignWETHAddressIsNotMintable,
            emergencyBridgePauser,
            emergencyBridgeUnpauser,
            proxiedTokensManager,
        ],
    );
    injectedTx.to = bridgeProxy.address;
    injectedTx.data = initializeData;
    injectedTx.gasPrice = 0;
    txObject = ethers.Transaction.from(injectedTx);
    // replace deployer from bridge bytecode
    const bridgeInitializer = txObject.from?.toLowerCase();
    expect(oldBridge.bytecode).to.include(bridgeDeployer?.slice(2));
    // replace deployer in bytecode
    const bridgeBytecodeWithInitializerAsDeployer = oldBridge.bytecode.replace(
        bridgeDeployer?.slice(2),
        bridgeInitializer?.slice(2),
    );
    expect(bridgeBytecodeWithInitializerAsDeployer).to.include(bridgeInitializer?.slice(2));
    oldBridge.bytecode = bridgeBytecodeWithInitializerAsDeployer;
    // Setup a second zkEVM to initialize both contracts
    const zkEVMDB2 = await ZkEVMDB.newZkEVM(
        new MemDB(F),
        poseidon,
        genesisRoot,
        accHashInput,
        genesis.genesis,
        null,
        null,
        chainID,
    );
    const batch2 = await zkEVMDB2.buildBatch(
        1000, // limitTimestamp
        ethers.ZeroAddress, // trustedSequencer
        smtUtils.stringToH4(ethers.ZeroHash), // l1InfoRoot
        ethers.ZeroHash, // Forced block hash
        undefined,
        {
            vcmConfig: {
                skipCounters: true,
            },
        },
    );
    // Add changeL2Block tx
    batch2.addRawTx(`0x${rawChangeL2BlockTx}`);

    const txInitializeBridge = processorUtils.rawTxToCustomRawTx(txObject.serialized);
    // Check ecrecover
    expect(txObject.from).to.equal(ethers.recoverAddress(txObject.unsignedHash, txObject.signature as any));
    batch2.addRawTx(txInitializeBridge);

    // deploy aggOracle if necessary
    let globalExitRootUpdater;
    let aggOracleImplementationAddress;
    if (initializeParams.useAggOracleCommittee === true) {
        const aggOracleCommitteeFactory = await ethers.getContractFactory('AggOracleCommittee');
        // Get deploy transaction for agg oracle commitee
        const deployAggOracle = await aggOracleCommitteeFactory.getDeployTransaction(gerProxy.address);

        injectedTx.to = null;
        injectedTx.data = deployAggOracle.data;
        const txObjectDeployAggOracleImpl = ethers.Transaction.from(injectedTx);
        expect(txObjectDeployAggOracleImpl.from).to.equal(
            ethers.recoverAddress(
                txObjectDeployAggOracleImpl.unsignedHash,
                txObjectDeployAggOracleImpl.signature as any,
            ),
        );

        const txDeployAggORacleCommitee = processorUtils.rawTxToCustomRawTx(txObjectDeployAggOracleImpl.serialized);
        batch2.addRawTx(txDeployAggORacleCommitee);
        aggOracleImplementationAddress = getContractAddress({
            from: txObjectDeployAggOracleImpl.from,
            nonce: txObjectDeployAggOracleImpl.nonce,
        });

        // Deploy proxy
        /*
         * deploy aggORacle proxy and initialize
         */
        const transparentProxyFactory = await ethers.getContractFactory(
            '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
        );

        // create initialize transaction
        // Initialize aggOracle Manager
        const initializeAggOracleCommittee = aggOracleCommitteeFactory.interface.encodeFunctionData('initialize', [
            initializeParams.aggOracleOwner,
            initializeParams.aggOracleCommittee,
            initializeParams.quorum,
        ]);

        const proxyAdminAddress = genesis.genesis.find(function (obj) {
            return obj.contractName === GENESIS_CONTRACT_NAMES.PROXY_ADMIN;
        }).address;
        const deployAggOracleProxy = (
            await transparentProxyFactory.getDeployTransaction(
                aggOracleImplementationAddress as string, // must have bytecode
                proxyAdminAddress as string,
                initializeAggOracleCommittee,
            )
        ).data;

        // Update injectedTx to initialize AggOracleProxy
        injectedTx.to = null;
        injectedTx.data = deployAggOracleProxy;

        const txDeployAggOracleProxy = ethers.Transaction.from(injectedTx);
        const txDeployProxyAggORacle = processorUtils.rawTxToCustomRawTx(txDeployAggOracleProxy.serialized);
        expect(txDeployAggOracleProxy.from).to.equal(
            ethers.recoverAddress(txDeployAggOracleProxy.unsignedHash, txDeployAggOracleProxy.signature as any),
        );
        batch2.addRawTx(txDeployProxyAggORacle);

        const aggOracleAddress = getContractAddress({
            from: txDeployAggOracleProxy.from,
            nonce: txDeployAggOracleProxy.nonce,
        });
        globalExitRootUpdater = aggOracleAddress;
    } else {
        checkParams(initializeParams, ['globalExitRootUpdater']);
        globalExitRootUpdater = initializeParams.globalExitRootUpdater;
    }
    // Initialize GER Manager
    const initializeGERData = gerFactory.interface.encodeFunctionData('initialize', [
        globalExitRootUpdater,
        globalExitRootRemover,
    ]);
    // Update injectedTx to initialize GER
    injectedTx.to = gerProxy.address;
    injectedTx.data = initializeGERData;

    const txObject2 = ethers.Transaction.from(injectedTx);
    const txInitializeGER = processorUtils.rawTxToCustomRawTx(txObject2.serialized);
    // Check ecrecover
    expect(txObject.from).to.equal(ethers.recoverAddress(txObject.unsignedHash, txObject.signature as any));
    batch2.addRawTx(txInitializeGER);

    // Execute batch
    await batch2.executeTxs();

    await zkEVMDB2.consolidate(batch2);

    if (initializeParams.useAggOracleCommittee === true) {
        // add aggOracleCommitee implementation to genesis file
        const aggOracleImplStorage = Object.entries(await zkEVMDB2.dumpStorage(aggOracleImplementationAddress)).reduce(
            (acc, [key, value]) => {
                acc[key] = padTo32Bytes(value);
                return acc;
            },
            {},
        );

        const aggOracleCommiteeImplObject = {
            contractName: GENESIS_CONTRACT_NAMES.AGG_ORACLE_IMPL,
            balance: '0',
            nonce: '1',
            address: aggOracleImplementationAddress,
            storage: aggOracleImplStorage,
            bytecode: `0x${await zkEVMDB2.getBytecode(aggOracleImplementationAddress)}`,
        };
        genesis.genesis.push(aggOracleCommiteeImplObject);

        // add aggOracleCommitee proxy to genesis file
        const aggOracleStorage = Object.entries(await zkEVMDB2.dumpStorage(globalExitRootUpdater)).reduce(
            (acc, [key, value]) => {
                acc[key] = padTo32Bytes(value);
                return acc;
            },
            {},
        );

        const aggOracleCommiteeObject = {
            contractName: GENESIS_CONTRACT_NAMES.AGG_ORACLE_PROXY,
            balance: '0',
            nonce: '1',
            address: globalExitRootUpdater,
            storage: aggOracleStorage,
            bytecode: `0x${await zkEVMDB2.getBytecode(globalExitRootUpdater)}`,
        };
        genesis.genesis.push(aggOracleCommiteeObject);
    }

    // Update bridgeProxy storage and nonce
    bridgeProxy.contractName = GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE_PROXY;
    bridgeProxy.storage = await zkEVMDB2.dumpStorage(bridgeProxy.address);

    // Update nonce, in case weth is deployed at initialize, it is increased
    const bridgeProxyState = await zkEVMDB2.getCurrentAccountState(bridgeProxy.address);
    bridgeProxy.nonce = String(Number(bridgeProxyState.nonce));
    // If bridge initialized with a zero sovereign weth address and a non zero gas token, we should add created erc20 weth contract implementation and proxy to the genesis
    let wethAddress;
    const WETHProxyContractName = GENESIS_CONTRACT_NAMES.WETH_PROXY;
    if (
        gasTokenAddress !== ethers.ZeroAddress &&
        ethers.isAddress(gasTokenAddress) &&
        (sovereignWETHAddress === ethers.ZeroAddress || !ethers.isAddress(sovereignWETHAddress))
    ) {
        // Add proxy
        wethAddress = padTo20Bytes(
            bridgeProxy.storage['0x000000000000000000000000000000000000000000000000000000000000006f'],
        );
        const wethGenesisProxy = {
            contractName: WETHProxyContractName,
            balance: '0',
            nonce: '1',
            address: wethAddress,
            bytecode: `0x${await zkEVMDB2.getBytecode(wethAddress)}`,
        };
        const wethStorage = await zkEVMDB2.dumpStorage(wethAddress);
        wethGenesisProxy.storage = Object.entries(wethStorage).reduce((acc, [key, value]) => {
            acc[key] = padTo32Bytes(value);
            return acc;
        }, {});
        genesis.genesis.push(wethGenesisProxy);

        // Check implementation
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const _IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
        const wethGenesisImplementationAddress = wethStorage[_IMPLEMENTATION_SLOT];
        expect(wethGenesisImplementationAddress).to.equal(
            precalculatedAddressTokenWrappedImplementation.toLocaleLowerCase(),
        );
    }

    // Pad storage values with zeros
    bridgeProxy.storage = Object.entries(bridgeProxy.storage).reduce((acc, [key, value]) => {
        acc[key] = padTo32Bytes(value);
        return acc;
    }, {});

    // CHECK tokenWrappedImplementationObject STORAGE
    // Storage slot for initialize contract
    // - keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.Initializable")) - 1)) & ~bytes32(uint256(0xff))
    // - bytes32 private constant INITIALIZABLE_STORAGE = 0xf0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00;
    expect(
        tokenWrappedImplementationObject.storage['0xf0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00'],
    ).to.equal('0x000000000000000000000000000000000000000000000000ffffffffffffffff');

    // CHECK BRIDGE PROXY STORAGE
    // Storage value pointing bridge implementation
    expect(bridgeProxy.storage['0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc']).to.include(
        oldBridge.address.toLowerCase().slice(2),
    );
    // rollup manager address in bridge storage, storage slot 0x6c, always zero (undefined)
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    expect(bridgeProxy.storage['0x000000000000000000000000000000000000000000000000000000000000006c']).to.be.undefined;

    // pendingProxiedTokensManager address in bridge storage, storage slot 0x71, should be undefined
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    expect(bridgeProxy.storage['0x0000000000000000000000000000000000000000000000000000000000000071']).to.be.undefined;

    // proxiedTokensManager address in bridge storage, storage slot 0x70
    expect(bridgeProxy.storage['0x0000000000000000000000000000000000000000000000000000000000000070']).to.include(
        proxiedTokensManager.toLowerCase().slice(2),
    );

    // Storage value of proxyAdmin
    const proxyAdminObject = genesis.genesis.find(function (obj) {
        return obj.contractName === GENESIS_CONTRACT_NAMES.PROXY_ADMIN;
    });
    expect(bridgeProxy.storage['0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103']).to.include(
        proxyAdminObject.address.toLowerCase().slice(2),
    );

    // Storage value of bridge manager
    expect(bridgeProxy.storage['0x00000000000000000000000000000000000000000000000000000000000000a3']).to.include(
        bridgeManager.toLowerCase().slice(2),
    );

    // Storage value for the _initialized uint8 variable of Initializable.sol contract,
    // incremented each time the contract is successfully initialized. It also stores the
    // initializing param set to true when an initialization function is being executed,
    // and it reverts to false once the initialization completed.
    // This is used to initialize the contract only once,and it depends if the contract is already deployed or not.
    expect(bridgeProxy.storage['0x0000000000000000000000000000000000000000000000000000000000000000']).to.equal(
        '0x0000000000000000000000000000000000000000000000000000000000000003',
    );

    // Storage value for the _status variable of ReentrancyGuardUpgradeable contract.
    // Tracks the current "status" of the contract to enforce the non-reentrant behavior. Default value is 1 (_NOT_ENTERED)
    expect(bridgeProxy.storage['0x0000000000000000000000000000000000000000000000000000000000000001']).to.equal(
        '0x0000000000000000000000000000000000000000000000000000000000000001',
    );

    // Storage value for global exit root manager (proxy) address
    expect(bridgeProxy.storage['0x0000000000000000000000000000000000000000000000000000000000000068']).to.include(
        gerProxy.address.toLowerCase().slice(2),
    );

    // Check bridge implementation bytecode contains tokenWrappedImplementation contract address
    expect(oldBridge.bytecode).to.include(precalculatedAddressTokenWrappedImplementation.toLowerCase().slice(2));

    // Check bridge implementation bytecode contains bridgeLib contract address
    expect(oldBridge.bytecode).to.include(precalculatedAddressBridgeLib.toLowerCase().slice(2));

    // Check bridge implementation has initializer disabled
    expect(oldBridge.storage['0x0000000000000000000000000000000000000000000000000000000000000000'].slice(-2)).to.equal(
        'ff',
    );

    // Storage value for rollup/network id
    // RollupID value is stored at position 68 with globalExitRootManager address. Slice from byte 2 to 2-8 to get the rollupID
    expect(
        bridgeProxy.storage['0x0000000000000000000000000000000000000000000000000000000000000068'].slice(
            2 + 54,
            2 + 54 + 8,
        ),
    ).to.include(rollupID.toString(16));

    // Storage value for gas token address
    if (gasTokenAddress !== ethers.ZeroAddress && ethers.isAddress(gasTokenAddress)) {
        expect(
            ethers.toBigInt(bridgeProxy.storage['0x000000000000000000000000000000000000000000000000000000000000006d']),
        ).to.equal(
            ethers.toBigInt(`${ethers.toBeHex(gasTokenNetwork)}${gasTokenAddress.replace(/^0x/, '')}`.toLowerCase()),
        );
        if (ethers.isAddress(sovereignWETHAddress) && sovereignWETHAddress !== ethers.ZeroAddress) {
            // Storage value for sovereignWETH address (only if network with native gas token) and sovereignWethAddress is set
            expect(
                bridgeProxy.storage['0x000000000000000000000000000000000000000000000000000000000000006f'],
            ).to.include(sovereignWETHAddress.toLowerCase().slice(2));

            // Storage address for sovereignWETHAddressIsNotMintable mapping
            // To get the key we encode the key of the mapping with the position in the mapping
            const mappingSlot = 162; // Slot of the mapping in the bridge contract
            const key = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [sovereignWETHAddress, mappingSlot]),
            );
            if (sovereignWETHAddressIsNotMintable) {
                expect(bridgeProxy.storage[key]).to.equal(
                    '0x0000000000000000000000000000000000000000000000000000000000000001',
                );
            } else {
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                expect(bridgeProxy.storage[key]).to.be.undefined;
            }
        } else {
            // Storage value for WETH address (only if network with native gas token), deployed at bridge initialization
            expect(
                bridgeProxy.storage['0x000000000000000000000000000000000000000000000000000000000000006f'],
            ).to.include(wethAddress.toLowerCase().slice(2));

            // CHECK WETH STORAGE
            const wethOject = genesis.genesis.find(function (obj) {
                return obj.contractName === WETHProxyContractName;
            });

            // Storage for erc20 name 'Wrapped Ether'
            expect(wethOject.storage['0x52c63247e1f47db19d5ce0460030c497f067ca4cebf71ba98eeadabe20bace03']).to.equal(
                '0x577261707065642045746865720000000000000000000000000000000000001a',
            );

            // Storage for erc20 code 'WETH'
            expect(wethOject.storage['0x52c63247e1f47db19d5ce0460030c497f067ca4cebf71ba98eeadabe20bace04']).to.equal(
                '0x5745544800000000000000000000000000000000000000000000000000000008',
            );

            // Storage for erc20 decimals 18 and bridgeAddress
            expect(wethOject.storage['0x863b064fe9383d75d38f584f64f1aaba4520e9ebc98515fa15bdeae8c4274d00']).to.include(
                `${bridgeProxy.address.slice(2).toLowerCase()}${ethers.toBeHex(18).slice(2).toLowerCase()}`,
            );
        }
        // Storage values for gasTokenMetadata, its a bytes variable
        let offset = 2 + 64;
        expect(bridgeProxy.storage['0x9930d9ff0dee0ef5ca2f7710ea66b8f84dd0f5f5351ecffe72b952cd9db7142a']).to.include(
            gasTokenMetadata.slice(2, offset),
        );
        expect(bridgeProxy.storage['0x9930d9ff0dee0ef5ca2f7710ea66b8f84dd0f5f5351ecffe72b952cd9db7142b']).to.include(
            gasTokenMetadata.slice(offset, offset + 64),
        );
        offset += 64;
        expect(bridgeProxy.storage['0x9930d9ff0dee0ef5ca2f7710ea66b8f84dd0f5f5351ecffe72b952cd9db7142c']).to.include(
            gasTokenMetadata.slice(offset, offset + 64),
        );
        offset += 64;
        expect(bridgeProxy.storage['0x9930d9ff0dee0ef5ca2f7710ea66b8f84dd0f5f5351ecffe72b952cd9db7142d']).to.include(
            gasTokenMetadata.slice(offset, offset + 64),
        );
        offset += 64;
        expect(bridgeProxy.storage['0x9930d9ff0dee0ef5ca2f7710ea66b8f84dd0f5f5351ecffe72b952cd9db7142e']).to.include(
            gasTokenMetadata.slice(offset, offset + 64),
        );
        offset += 64;
        expect(bridgeProxy.storage['0x9930d9ff0dee0ef5ca2f7710ea66b8f84dd0f5f5351ecffe72b952cd9db7142f']).to.include(
            gasTokenMetadata.slice(offset, offset + 64),
        );
        offset += 64;
        expect(bridgeProxy.storage['0x9930d9ff0dee0ef5ca2f7710ea66b8f84dd0f5f5351ecffe72b952cd9db71430']).to.include(
            gasTokenMetadata.slice(offset, offset + 64),
        );
    }

    // Check bridge proxy Address is included in ger bytecode
    expect(oldGer.bytecode).to.include(bridgeProxy.address.toLowerCase().slice(2));

    // Update gerProxy storage
    gerProxy.contractName = GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_PROXY;
    gerProxy.storage = await zkEVMDB2.dumpStorage(gerProxy.address);
    gerProxy.storage = Object.entries(gerProxy.storage).reduce((acc, [key, value]) => {
        acc[key] = padTo32Bytes(value);
        return acc;
    }, {});

    // CHECK GER IMPLEMENTATION STORAGE
    expect(oldGer.storage['0x0000000000000000000000000000000000000000000000000000000000000034'].slice(-2)).to.equal(
        'ff',
    );

    // CHECK GER PROXY STORAGE
    // Storage value of proxy implementation
    expect(gerProxy.storage['0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc']).to.include(
        oldGer.address.toLowerCase().slice(2),
    );

    // Storage value of proxyAdmin
    expect(gerProxy.storage['0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103']).to.include(
        proxyAdminObject.address.toLowerCase().slice(2),
    );

    // Storage value of global exit root updater
    expect(gerProxy.storage['0x0000000000000000000000000000000000000000000000000000000000000034']).to.include(
        globalExitRootUpdater.toLowerCase().slice(2),
    );
    // Check ger proxy initialized value
    expect(gerProxy.storage['0x0000000000000000000000000000000000000000000000000000000000000034'].slice(-2)).to.equal(
        '01',
    );
    // Check storage value of pendingGlobalExitRootUpdater at slot 0x39
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    expect(gerProxy.storage['0x0000000000000000000000000000000000000000000000000000000000000039']).to.be.undefined;
    // Check storage value of pendingGlobalExitRootRemover at slot 0x3a
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    expect(gerProxy.storage['0x000000000000000000000000000000000000000000000000000000000000003a']).to.be.undefined;

    if (ethers.isAddress(globalExitRootRemover) && globalExitRootRemover !== ethers.ZeroAddress) {
        // Storage value of global exit root remover
        expect(gerProxy.storage['0x0000000000000000000000000000000000000000000000000000000000000035']).to.include(
            globalExitRootRemover.toLowerCase().slice(2),
        );
    }

    expect(gerProxy.storage['0x0000000000000000000000000000000000000000000000000000000000000035']).to.include(
        globalExitRootRemover.toLowerCase().slice(2),
    );

    // Base genesis checks
    const polygonTimelockObj = genesis.genesis.find(function (obj) {
        return obj.contractName === GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK;
    });
    // Check polygonTimelock is the owner of ProxyAdmin
    expect(proxyAdminObject.storage['0x0000000000000000000000000000000000000000000000000000000000000000']).to.include(
        polygonTimelockObj.address.toLowerCase().slice(2),
    );
    // Check deployer is the owner of Polygon deployer
    const polygonDeployerObj = genesis.genesis.find(function (obj) {
        return obj.contractName === GENESIS_CONTRACT_NAMES.POLYGON_DEPLOYER;
    });
    const deployerAddressObj = genesis.genesis.find(function (obj) {
        return obj.accountName === 'deployer';
    });
    expect(polygonDeployerObj.storage['0x0000000000000000000000000000000000000000000000000000000000000000']).to.include(
        deployerAddressObj.address.toLowerCase().slice(2),
    );

    // Additional storage slot checks for agg oracle
    const sovereignContractObj = genesis.genesis.find(function (obj) {
        return obj.contractName === GENESIS_CONTRACT_NAMES.AGG_ORACLE_PROXY;
    });

    if (sovereignContractObj) {
        // Storage value of proxy implementation
        expect(
            sovereignContractObj.storage['0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'],
        ).to.include(aggOracleImplementationAddress.toLowerCase().slice(2));

        // Admin slot check (TransparentUpgradeableProxy pattern)
        expect(
            sovereignContractObj.storage['0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'],
        ).to.include(proxyAdminObject.address.toLowerCase().slice(2));

        // Initialized slot check
        expect(
            sovereignContractObj.storage['0xf0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00'],
        ).to.equal('0x0000000000000000000000000000000000000000000000000000000000000001');

        // Storage slot 0 check
        expect(
            sovereignContractObj.storage['0x0000000000000000000000000000000000000000000000000000000000000000'],
        ).to.equal(toPaddedHex32(initializeParams.aggOracleCommittee.length));

        // Storage slot 1 check
        expect(
            sovereignContractObj.storage['0x0000000000000000000000000000000000000000000000000000000000000001'],
        ).to.equal(toPaddedHex32(initializeParams.quorum));

        // Check aggOracleMembers array storage slots
        if (initializeParams.aggOracleCommittee && Array.isArray(initializeParams.aggOracleCommittee)) {
            // The dynamic array is stored at slot 0 (aggOracleMembers)
            // Length is at slot 0, elements start at keccak256(0)
            const keccakSlot0 = ethers.keccak256(ethers.zeroPadValue('0x00', 32));
            for (let i = 0; i < initializeParams.aggOracleCommittee.length; i++) {
                const memberAddress = initializeParams.aggOracleCommittee[i];
                // Compute slot: keccak256(0) + i
                const slot = ethers.toBeHex(BigInt(keccakSlot0) + BigInt(i), 32);
                expect(sovereignContractObj.storage[slot]).to.include(memberAddress.toLowerCase().slice(2));
            }

            // Storage slot 2: mapping(address => bytes32) public addressToLastProposedGER;
            // For each address, the mapping slot is keccak256(pad32(address) ++ pad32(2))
            // All should point to INITIAL_PROPOSED_GER = bytes32(uint256(1))
            const INITIAL_PROPOSED_GER = ethers.zeroPadValue('0x01', 32);
            for (let i = 0; i < initializeParams.aggOracleCommittee.length; i++) {
                const memberAddress = initializeParams.aggOracleCommittee[i];
                // mapping(address => bytes32) at slot 2: keccak256(pad32(address) ++ pad32(2))
                const paddedAddress = ethers.zeroPadValue(memberAddress, 32);
                const paddedSlot = ethers.zeroPadValue('0x02', 32);
                const mappingSlot = ethers.keccak256(ethers.concat([paddedAddress, paddedSlot]));
                expect(sovereignContractObj.storage[mappingSlot]).to.equal(INITIAL_PROPOSED_GER);
            }
        }

        // Storage slot 0x9016d09d72d40fdae2fd8ceac6b6234c7706214fd39c1cd1e609a0528c199300 check
        // Owner slot OZ
        expect(
            sovereignContractObj.storage['0x9016d09d72d40fdae2fd8ceac6b6234c7706214fd39c1cd1e609a0528c199300'],
        ).to.include(toPaddedHex32(initializeParams.aggOracleOwner));
    }

    // Create a new zkEVM to generate a genesis an empty system address storage
    const zkEVMDB3 = await ZkEVMDB.newZkEVM(
        new MemDB(F),
        poseidon,
        genesisRoot,
        accHashInput,
        genesis.genesis,
        null,
        null,
        chainID,
    );
    // update genesis root
    genesis.root = smtUtils.h4toString(zkEVMDB3.getCurrentStateRoot());

    return genesis;
}

export default updateVanillaGenesis;
