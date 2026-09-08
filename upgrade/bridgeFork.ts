import assert from 'assert';
import hre, { ethers, network, upgrades } from 'hardhat';
import { reset, setBalance, time } from '@nomicfoundation/hardhat-network-helpers';
import { CompilerStorageLayout } from '../tools/bridgeCompatibility/storageLayout';
import {
    buildProxyUpgradeOperation,
    ImmutableReferences,
    preflightProxyUpgrade,
    ProxyUpgradeParameters,
} from './bridgeUpgradeUtils';

export interface BridgeForkParameters extends ProxyUpgradeParameters {
    forkParams: {
        rpc: string;
        blockNumber: number;
        timelockAdminAddress: string;
        storageSlots?: string[];
    };
}

export interface BridgeForkTarget {
    contractName: string;
    targetVersion: string;
    baseline: {
        version: string;
        deployedBytecode: string;
        immutableReferences: ImmutableReferences;
        storageLayout: CompilerStorageLayout;
    };
    checkArtifacts: () => Promise<unknown>;
    checkImplementation: (address: string) => Promise<Record<string, string>>;
}

export async function forkAndUpgradeBridge(parameters: BridgeForkParameters, target: BridgeForkTarget) {
    // Every write uses the local provider; reject live networks before opening the read-only source RPC.
    assert(network.name === 'hardhat', 'Fork upgrades must run on the in-process Hardhat network');
    assert(!(hre as any).__SOLIDITY_COVERAGE_RUNNING, 'Fork upgrades require production Hardhat artifacts');
    const { rpc, blockNumber, timelockAdminAddress, storageSlots = [] } = parameters.forkParams;
    assert(parameters.expectedChainId !== undefined, 'expectedChainId is required');
    assert(typeof rpc === 'string' && /^https?:\/\//.test(rpc), 'forkParams.rpc must be an HTTP(S) RPC URL');
    assert(
        Number.isSafeInteger(blockNumber) && blockNumber > 0,
        'forkParams.blockNumber must be a pinned positive block number',
    );
    assert(ethers.isAddress(timelockAdminAddress), 'forkParams.timelockAdminAddress is required');
    assert(
        Array.isArray(storageSlots) && storageSlots.every((slot) => ethers.isHexString(slot, 32)),
        'forkParams.storageSlots must contain bytes32 storage positions',
    );
    await target.checkArtifacts();
    const remoteProvider = new ethers.JsonRpcProvider(rpc);
    let sourceBlockHash: string;
    try {
        assert(
            (await remoteProvider.getNetwork()).chainId === BigInt(parameters.expectedChainId),
            'Wrong fork source chain',
        );
        const sourceBlock = await remoteProvider.getBlock(blockNumber);
        assert(sourceBlock?.hash, 'Pinned fork block does not exist');
        sourceBlockHash = sourceBlock.hash;
    } finally {
        remoteProvider.destroy();
    }
    await reset(rpc, blockNumber);
    // A local block avoids historical hardfork lookup for custom source chains.
    await network.provider.send('evm_mine');
    // The source chain was checked above; Hardhat retains its own execution chain ID.
    const localChainId = (await ethers.provider.getNetwork()).chainId.toString();
    const preflight = await preflightProxyUpgrade(
        { ...parameters, expectedChainId: localChainId },
        target.baseline,
        target.targetVersion,
    );
    const timelock = new ethers.Contract(
        preflight.timelockContractAddress,
        [
            'function hasRole(bytes32 role,address account) view returns (bool)',
            'function isOperationDone(bytes32 id) view returns (bool)',
        ],
        ethers.provider,
    );
    assert(await timelock.hasRole(ethers.id('PROPOSER_ROLE'), timelockAdminAddress), 'Missing proposer role');
    assert(
        (await timelock.hasRole(ethers.id('EXECUTOR_ROLE'), timelockAdminAddress)) ||
            (await timelock.hasRole(ethers.id('EXECUTOR_ROLE'), ethers.ZeroAddress)),
        'Missing executor role',
    );

    const bridge = new ethers.Contract(
        preflight.bridgeAddress,
        [
            'function version() view returns (string)',
            'function gasTokenMetadata() view returns (bytes)',
            'function getRoot() view returns (bytes32)',
        ],
        ethers.provider,
    );
    const layout = target.baseline.storageLayout;
    const last = layout.storage[layout.storage.length - 1];
    const slotCount = Number(last.slot) + Math.ceil(Number(layout.types[last.type].numberOfBytes) / 32);
    const metadata = await bridge.gasTokenMetadata();
    const metadataSlot = layout.storage.find((entry) => entry.label === 'gasTokenMetadata')?.slot;
    assert(metadataSlot !== undefined, 'Previous layout is missing gasTokenMetadata');
    // Long bytes live at keccak256(slot); comparing only the head slot would miss metadata changes.
    const metadataStart = BigInt(
        ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [metadataSlot])),
    );
    const metadataWords = ethers.dataLength(metadata) > 31 ? Math.ceil(ethers.dataLength(metadata) / 32) : 0;
    const slots = [
        ...Array.from({ length: slotCount }, (_, index) => ethers.toBeHex(index)),
        ...Array.from({ length: metadataWords }, (_, index) => ethers.toBeHex(metadataStart + BigInt(index))),
        ...storageSlots,
    ];
    // The implementation slot must change; legacy storage, selected mappings, and proxy admin must not.
    const readState = async () => ({
        storage: await Promise.all(slots.map((slot) => ethers.provider.getStorage(preflight.bridgeAddress, slot))),
        metadata: await bridge.gasTokenMetadata(),
        root: await bridge.getRoot(),
        balance: await ethers.provider.getBalance(preflight.bridgeAddress),
        admin: await upgrades.erc1967.getAdminAddress(preflight.bridgeAddress),
    });
    const before = await readState();
    const [deployer] = await ethers.getSigners();
    await setBalance(deployer.address, ethers.parseEther('100'));
    const factory = await ethers.getContractFactory(target.contractName);
    await upgrades.validateImplementation(factory, {
        unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
    });
    const implementation = await factory.deploy();
    await implementation.waitForDeployment();
    const implementationAddress = await implementation.getAddress();
    const deployed = await target.checkImplementation(implementationAddress);
    assert.deepStrictEqual(
        await preflightProxyUpgrade(
            { ...parameters, expectedChainId: localChainId },
            target.baseline,
            target.targetVersion,
        ),
        preflight,
        'Proxy or governance changed during local deployment',
    );
    const operation = buildProxyUpgradeOperation(preflight, implementationAddress);

    await ethers.provider.send('hardhat_impersonateAccount', [timelockAdminAddress]);
    try {
        await setBalance(timelockAdminAddress, ethers.parseEther('100'));
        const signer = await ethers.getSigner(timelockAdminAddress);
        await (
            await signer.sendTransaction({ to: preflight.timelockContractAddress, data: operation.scheduleData })
        ).wait();
        await time.increase(BigInt(preflight.timelockDelay) + 1n);
        await (
            await signer.sendTransaction({ to: preflight.timelockContractAddress, data: operation.executeData })
        ).wait();
        assert(await timelock.isOperationDone(operation.operationId), 'Fork timelock operation did not complete');
        assert((await bridge.version()) === target.targetVersion, 'Fork bridge version mismatch');
        assert(
            (await upgrades.erc1967.getImplementationAddress(preflight.bridgeAddress)) === implementationAddress,
            'Fork proxy implementation did not change',
        );
        assert.deepStrictEqual(await readState(), before, 'Bridge storage or balances changed during the fork upgrade');
    } finally {
        await ethers.provider.send('hardhat_stopImpersonatingAccount', [timelockAdminAddress]);
    }
    return {
        simulationOnly: true,
        sourceChainId: String(parameters.expectedChainId),
        sourceBlockNumber: blockNumber,
        sourceBlockHash,
        bridgeAddress: preflight.bridgeAddress,
        sourceVersion: preflight.sourceVersion,
        targetVersion: target.targetVersion,
        previousImplementationAddress: preflight.previousImplementationAddress,
        bridgeImplementationAddress: implementationAddress,
        ...deployed,
        timelockAddress: preflight.timelockContractAddress,
        operationId: operation.operationId,
        checkedStorageSlots: slots.length,
        storagePreserved: true,
    };
}
