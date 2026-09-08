import { expect } from 'chai';
import { spawn } from 'child_process';
import { once } from 'events';
import net from 'net';
import { artifacts, ethers, network } from 'hardhat';
import { getPreviousBridgeBuild, getPreviousBridgeFactory } from '../../tools/bridgeCompatibility/previousVersions';
import { forkAndUpgrade as forkL2 } from '../../upgrade/upgradeSovereignBridge-v1.2.0/forkAndUpgrade';

async function startFixtureRpc() {
    const reservation = net.createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const { port } = reservation.address() as net.AddressInfo;
    await new Promise<void>((resolve, reject) => {
        reservation.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
    const child = spawn(
        process.execPath,
        [require.resolve('hardhat/internal/cli/cli'), 'node', '--hostname', '127.0.0.1', '--port', String(port)],
        {
            cwd: process.cwd(),
            env: {
                ...process.env,
                MNEMONIC: 'test test test test test test test test test test test junk',
                LEDGER_ACCOUNT: '',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    );
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            child.kill('SIGTERM');
            reject(new Error('Local fork fixture RPC failed to start'));
        }, 30_000);
        child.once('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.once('exit', (code) => {
            clearTimeout(timeout);
            reject(new Error(`Fixture RPC exited with code ${code}`));
        });
        child.stderr.on('data', () => {});
        child.stdout.on('data', (chunk) => {
            if (chunk.toString().includes('Started HTTP')) {
                clearTimeout(timeout);
                resolve();
            }
        });
    });
    const rpc = `http://127.0.0.1:${port}`;
    const provider = new ethers.JsonRpcProvider(rpc, undefined, { cacheTimeout: -1 });
    return {
        rpc,
        provider,
        async stop() {
            provider.destroy();
            if (child.exitCode === null) {
                const exited = once(child, 'exit');
                child.kill('SIGTERM');
                await exited;
            }
        },
    };
}

async function deploySourceBridge(provider: InstanceType<typeof ethers.JsonRpcProvider>) {
    const signer = await provider.getSigner(0);
    const signerAddress = await signer.getAddress();
    const originAddress = await (await provider.getSigner(1)).getAddress();
    const previous = await getPreviousBridgeBuild('AgglayerBridgeL2');
    const implementation = await (await getPreviousBridgeFactory('AgglayerBridgeL2', signer)).deploy();
    await implementation.waitForDeployment();
    const deploy = async (name: string, args: any[] = []) => {
        const artifact = await artifacts.readArtifact(name);
        const deployed = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer).deploy(...args);
        await deployed.waitForDeployment();
        return new ethers.Contract(await deployed.getAddress(), artifact.abi, signer);
    };
    const admin = await deploy('@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol:ProxyAdmin');
    const proxyName =
        '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy';
    const proxy = await deploy(proxyName, [implementation.target, admin.target, '0x']);
    const bridgeAddress = await proxy.getAddress();
    const bridge = new ethers.Contract(bridgeAddress, previous.abi, signer);
    const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'string', 'uint8'],
        ['Fork gas token with metadata across multiple storage words', 'FORK', 18],
    );
    const amount = ethers.parseEther('1');
    const gerImplementation = await deploy('AgglayerGERL2', [bridgeAddress]);
    const gerProxy = await deploy(proxyName, [gerImplementation.target, admin.target, '0x']);
    const ger = new ethers.Contract(await gerProxy.getAddress(), gerImplementation.interface, signer);
    await (await ger.initialize(signerAddress, signerAddress)).wait();
    await (
        await bridge[
            'initialize(uint32,address,uint32,address,address,bytes,address,address,bool,address,address,address)'
        ](
            2,
            originAddress,
            7,
            ger.target,
            signerAddress,
            metadata,
            signerAddress,
            ethers.ZeroAddress,
            false,
            signerAddress,
            signerAddress,
            originAddress,
        )
    ).wait();
    await (await bridge.activateEmergencyState()).wait();
    await (await bridge.setLocalBalanceTree([7], [originAddress], [amount * 10n])).wait();
    await (await bridge.setMultipleClaims([2n ** 64n])).wait();
    await (await bridge.deactivateEmergencyState()).wait();
    await (
        await bridge.bridgeAsset(9, originAddress, amount, ethers.ZeroAddress, true, '0x', { value: amount })
    ).wait();
    await (await bridge.activateEmergencyState()).wait();
    const timelock = await deploy('@openzeppelin/contracts/governance/TimelockController.sol:TimelockController', [
        5,
        [signerAddress],
        [signerAddress],
        signerAddress,
    ]);
    await (await admin.transferOwnership(timelock.target)).wait();
    const claimSlot = previous.storageLayout.storage.find((entry) => entry.label === 'claimedBitMap')!.slot;
    const storageSlots = [
        ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256', 'uint256'], [0, claimSlot])),
    ];
    return {
        bridgeAddress,
        signerAddress,
        storageSlots,
        previousImplementationAddress: await implementation.getAddress(),
    };
}

describe('Bridge fork upgrade guards', () => {
    it('rejects live networks before making any RPC requests', async () => {
        const originalNetwork = network.name;
        network.name = 'mainnet';
        try {
            await expect(forkL2({} as any)).to.be.rejectedWith('in-process Hardhat');
        } finally {
            network.name = originalNetwork;
        }
    });

    it('requires a pinned fork block before contacting an RPC', async () => {
        const parameters = {
            bridgeL2Address: '0x0000000000000000000000000000000000000001',
            expectedChainId: 1,
            forkParams: {
                rpc: 'http://127.0.0.1:1',
                blockNumber: 0,
                timelockAdminAddress: '0x0000000000000000000000000000000000000002',
            },
        };
        await expect(forkL2(parameters)).to.be.rejectedWith('pinned positive block');
    });
});

describe('Bridge fork upgrade integration', function (this: { timeout: (milliseconds: number) => void }) {
    this.timeout(120_000);
    let rpc: Awaited<ReturnType<typeof startFixtureRpc>>;
    let l2: Awaited<ReturnType<typeof deploySourceBridge>>;
    let blockNumber: number;
    let chainId: string;

    before(async () => {
        rpc = await startFixtureRpc();
        l2 = await deploySourceBridge(rpc.provider);
        blockNumber = Number(await rpc.provider.send('eth_blockNumber', []));
        chainId = (await rpc.provider.getNetwork()).chainId.toString();
    });

    after(async () => {
        await network.provider.send('hardhat_reset');
        await rpc?.stop();
    });

    const parameters = (fixture: Awaited<ReturnType<typeof deploySourceBridge>>): Parameters<typeof forkL2>[0] => ({
        bridgeL2Address: fixture.bridgeAddress,
        expectedChainId: chainId,
        forkParams: {
            rpc: rpc.rpc,
            blockNumber,
            timelockAdminAddress: fixture.signerAddress,
            storageSlots: fixture.storageSlots,
        },
    });

    it('rejects a fork RPC with the wrong source chain ID', async () => {
        await expect(forkL2({ ...parameters(l2), expectedChainId: 1 })).to.be.rejectedWith('Wrong fork source chain');
    });

    it('rejects an account without the required timelock role', async () => {
        const config = parameters(l2);
        config.forkParams.timelockAdminAddress = await (await rpc.provider.getSigner(1)).getAddress();
        await expect(forkL2(config)).to.be.rejectedWith('Missing proposer role');
    }).timeout(60_000);

    it('forks, deploys, and executes the L2 upgrade and verifies the immutable module', async () => {
        const report = await forkL2(parameters(l2));
        expect(report.simulationOnly).to.equal(true);
        expect(report.targetVersion).to.equal('v1.3.0');
        expect(report.storagePreserved).to.equal(true);
        expect(report.checkedStorageSlots).to.be.greaterThan(219);
        expect(report).to.have.property('moduleAddress');
        expect(report.previousImplementationAddress).to.equal(l2.previousImplementationAddress);
        expect(report.bridgeImplementationAddress).not.to.equal(l2.previousImplementationAddress);
        const sourceImplementation = await rpc.provider.getStorage(
            l2.bridgeAddress,
            '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
        );
        expect(ethers.getAddress(ethers.dataSlice(sourceImplementation, 12))).to.equal(
            l2.previousImplementationAddress,
        );
        expect(await (await ethers.getContractAt('AgglayerBridgeL2', l2.bridgeAddress)).version()).to.equal('v1.3.0');
        const previous = await getPreviousBridgeBuild('AgglayerBridgeL2');
        const source = new ethers.Contract(l2.bridgeAddress, previous.abi, rpc.provider);
        expect(await source.version()).to.equal('v1.2.0');
        expect(Number(await rpc.provider.send('eth_blockNumber', []))).to.equal(blockNumber);
    }).timeout(60_000);
});
