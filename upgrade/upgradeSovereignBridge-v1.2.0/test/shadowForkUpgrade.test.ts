import assert from 'assert';
import fs from 'fs';
import { expect } from 'chai';
import path = require('path');
import { ethers, network, upgrades } from 'hardhat';
import { time, reset, setBalance } from '@nomicfoundation/hardhat-network-helpers';
import { logger } from '../../../src/logger';
import baseline from '../../previousVersions/bridge/snapshots/AgglayerBridgeL2.v1.2.0.json';
import { TARGET_BRIDGE_VERSION, checkDeployedBridgeImplementation, matchesRuntimeBytecode } from '../bridgeUpgrade';

async function main() {
    assert(network.name === 'hardhat', 'Fork validation must run on the in-process Hardhat network');
    const parameters = JSON.parse(fs.readFileSync(path.join(__dirname, '../upgrade_parameters.json'), 'utf8'));
    const output = JSON.parse(fs.readFileSync(path.join(__dirname, '../upgrade_output.json'), 'utf8'));
    const { rpc, timelockAdminAddress, storageSlots = [] } = parameters.forkParams;
    assert(rpc && ethers.isAddress(timelockAdminAddress), 'forkParams.rpc and timelockAdminAddress are required');
    const remoteProvider = new ethers.JsonRpcProvider(rpc);
    try {
        assert((await remoteProvider.getNetwork()).chainId.toString() === output.chainId, 'Wrong fork source chain');
    } finally {
        remoteProvider.destroy();
    }
    // Unlike forkAndUpgrade.ts, this validates an implementation already deployed in the recorded output.
    await reset(rpc, output.implementationDeployBlockNumber);
    const bridgeAddress = output.inputs.bridgeL2Address;
    expect(await upgrades.erc1967.getImplementationAddress(bridgeAddress)).to.equal(
        output.previousImplementationAddress,
    );
    expect(await upgrades.erc1967.getAdminAddress(bridgeAddress)).to.equal(output.proxyAdminAddress);
    const oldCode = await ethers.provider.getCode(output.previousImplementationAddress);
    assert(
        matchesRuntimeBytecode(oldCode, {
            object: baseline.deployedBytecode.slice(2),
            immutableReferences: baseline.immutableReferences,
        }),
        'Fork source implementation differs from archived v1.2.0',
    );
    expect(ethers.keccak256(oldCode)).to.equal(output.previousImplementationCodeHash);
    const deployed = await checkDeployedBridgeImplementation(output.bridgeImplementationAddress);
    expect(deployed.moduleAddress).to.equal(output.moduleAddress);
    expect(deployed.implementationCodeHash).to.equal(output.implementationCodeHash);
    expect(deployed.moduleCodeHash).to.equal(output.moduleCodeHash);
    const admin = new ethers.Contract(
        output.proxyAdminAddress,
        ['function owner() view returns (address)'],
        ethers.provider,
    );
    expect(await admin.owner()).to.equal(output.timelockContractAddress);
    const timelock = new ethers.Contract(
        output.timelockContractAddress,
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
    const bridge = await ethers.getContractAt('AgglayerBridgeL2', bridgeAddress);
    expect(await bridge.version()).to.equal(baseline.version);
    const last = baseline.storageLayout.storage[baseline.storageLayout.storage.length - 1];
    const lastType = (baseline.storageLayout.types as Record<string, { numberOfBytes: string }>)[last.type];
    const slotCount = Number(last.slot) + Math.ceil(Number(lastType.numberOfBytes) / 32);
    const slots = [...Array.from({ length: slotCount }, (_, index) => ethers.toBeHex(index)), ...storageSlots];
    const readState = async () => ({
        storage: await Promise.all(slots.map((slot) => ethers.provider.getStorage(bridgeAddress, slot))),
        gasTokenMetadata: await bridge.gasTokenMetadata(),
        root: await bridge.getRoot(),
        balance: await ethers.provider.getBalance(bridgeAddress),
    });
    const before = await readState();
    // Governance is impersonated only on the in-process fork; the source RPC receives no transactions.
    await ethers.provider.send('hardhat_impersonateAccount', [timelockAdminAddress]);
    try {
        await setBalance(timelockAdminAddress, ethers.parseEther('100'));
        const signer = await ethers.getSigner(timelockAdminAddress);
        await (await signer.sendTransaction({ to: output.timelockContractAddress, data: output.scheduleData })).wait();
        await time.increase(BigInt(output.timelockDelay));
        await (await signer.sendTransaction({ to: output.timelockContractAddress, data: output.executeData })).wait();
        expect(await timelock.isOperationDone(output.operationId)).to.equal(true);
        expect(await bridge.version()).to.equal(TARGET_BRIDGE_VERSION);
        expect(await upgrades.erc1967.getImplementationAddress(bridgeAddress)).to.equal(
            output.bridgeImplementationAddress,
        );
        expect(await readState()).to.deep.equal(before);
    } finally {
        await ethers.provider.send('hardhat_stopImpersonatingAccount', [timelockAdminAddress]);
    }
    logger.info(
        `Fork upgrade passed: ${baseline.version} -> ${TARGET_BRIDGE_VERSION}; ${slots.length} storage slots unchanged`,
    );
}

main().catch((error) => {
    logger.error(error);
    process.exitCode = 1;
});
