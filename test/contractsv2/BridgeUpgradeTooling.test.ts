import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { TimelockController } from '../../typechain-types';
import { ProxyAdmin } from '../../typechain-types/@openzeppelin/contracts4/proxy/transparent';
import { getPreviousBridgeFactory } from '../../tools/bridgeCompatibility/previousVersions';
import {
    buildBridgeUpgradeOperation,
    checkDeployedBridgeImplementation,
    preflightBridgeUpgrade,
} from '../../upgrade/upgradeSovereignBridge-v1.2.0/bridgeUpgrade';

async function deployFixture() {
    const [deployer] = await ethers.getSigners();
    const implementation = await (await getPreviousBridgeFactory('AgglayerBridgeL2', deployer)).deploy();
    const admin = (await (
        await ethers.getContractFactory('@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol:ProxyAdmin')
    ).deploy()) as unknown as ProxyAdmin;
    const proxy = await (
        await ethers.getContractFactory(
            '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
        )
    ).deploy(implementation.target, admin.target, '0x');
    const timelock = (await (
        await ethers.getContractFactory('@openzeppelin/contracts/governance/TimelockController.sol:TimelockController')
    ).deploy(60, [deployer.address], [deployer.address], deployer.address)) as unknown as TimelockController;
    await admin.transferOwnership(timelock.target);
    const { chainId } = await ethers.provider.getNetwork();
    const parameters = { bridgeL2Address: proxy.target as string, expectedChainId: chainId.toString() };
    return { implementation, admin, proxy, timelock, parameters, deployer };
}

const describeProduction = (hre as any).__SOLIDITY_COVERAGE_RUNNING ? describe.skip : describe;

describeProduction('Sovereign bridge upgrade tooling', () => {
    it('checks the chain, archived bytecode, layout, and real proxy admin without deploying', async () => {
        const { parameters, admin, timelock, implementation, deployer } = await loadFixture(deployFixture);
        const nonce = await ethers.provider.getTransactionCount(deployer.address);
        const preflight = await preflightBridgeUpgrade(parameters);
        expect(preflight.sourceVersion).to.equal('v1.2.0');
        expect(preflight.targetVersion).to.equal('v1.3.0');
        expect(preflight.proxyAdminAddress).to.equal(admin.target);
        expect(preflight.timelockContractAddress).to.equal(timelock.target);
        expect(preflight.previousImplementationAddress).to.equal(implementation.target);
        expect(preflight.timelockDelay).to.equal('60');
        expect(await ethers.provider.getTransactionCount(deployer.address)).to.equal(nonce);
    });

    it('rejects incorrect network, expected version, and insufficient delay', async () => {
        const { parameters } = await loadFixture(deployFixture);
        await expect(preflightBridgeUpgrade({ ...parameters, expectedChainId: 0 })).to.be.rejectedWith(
            'Unexpected chain ID',
        );
        await expect(preflightBridgeUpgrade({ ...parameters, expectedBridgeVersion: 'v1.1.0' })).to.be.rejectedWith(
            'Unexpected bridge version',
        );
        await expect(preflightBridgeUpgrade({ ...parameters, timelockDelay: 0 })).to.be.rejectedWith(
            'below the on-chain minimum',
        );
    });

    it('rejects modified bytecode even if version() still returns v1.2.0', async () => {
        const { implementation, parameters } = await loadFixture(deployFixture);
        const code = ethers.getBytes(await ethers.provider.getCode(implementation.target));
        code[code.length - 3] ^= 1;
        await ethers.provider.send('hardhat_setCode', [implementation.target, ethers.hexlify(code)]);
        await expect(preflightBridgeUpgrade(parameters)).to.be.rejectedWith('does not match the archived');
    });

    it('verifies the immutable module and executes the generated timelock operation', async () => {
        const { parameters, proxy, timelock, deployer } = await loadFixture(deployFixture);
        const preflight = await preflightBridgeUpgrade(parameters);
        const implementation = await (await ethers.getContractFactory('AgglayerBridgeL2')).deploy();
        const verified = await checkDeployedBridgeImplementation(implementation.target as string);
        expect(await ethers.provider.getCode(verified.moduleAddress)).not.to.equal('0x');
        const operation = buildBridgeUpgradeOperation(preflight, implementation.target as string);
        await deployer.sendTransaction({ to: timelock.target, data: operation.scheduleData });
        expect(await timelock.isOperationPending(operation.operationId)).to.equal(true);
        await expect(deployer.sendTransaction({ to: timelock.target, data: operation.executeData })).to.be.reverted;
        await time.increase(60);
        await deployer.sendTransaction({ to: timelock.target, data: operation.executeData });
        expect(await timelock.isOperationDone(operation.operationId)).to.equal(true);
        const bridge = await ethers.getContractAt('AgglayerBridgeL2', proxy.target);
        expect(await bridge.version()).to.equal('v1.3.0');
        await expect(preflightBridgeUpgrade(parameters)).to.be.rejectedWith('Unsupported bridge version: v1.3.0');
    });
});
