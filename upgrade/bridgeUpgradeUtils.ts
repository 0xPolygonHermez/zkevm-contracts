import assert from 'assert';
import { ethers, upgrades } from 'hardhat';

export type ImmutableReferences = Record<string, { start: number; length: number }[]>;
export type RuntimeTemplate = { object: string; immutableReferences?: ImmutableReferences };

export interface ProxyUpgradeParameters {
    bridgeAddress: string;
    expectedChainId: number | string;
    expectedBridgeVersion?: string;
    timelockDelay?: number | string;
    timelockSalt?: string;
}

interface PreviousImplementation {
    version: string;
    deployedBytecode: string;
    immutableReferences: ImmutableReferences;
}

export function matchesRuntimeBytecode(code: string, template: RuntimeTemplate) {
    const expected = ethers.getBytes(`0x${template.object}`);
    const actual = ethers.getBytes(code);
    if (expected.length !== actual.length) return false;
    // Only compiler-recorded immutables may vary; metadata and executable bytes must still match.
    Object.values(template.immutableReferences ?? {})
        .flat()
        .forEach(({ start, length }) => {
            expected.fill(0, start, start + length);
            actual.fill(0, start, start + length);
        });
    return ethers.hexlify(actual) === ethers.hexlify(expected);
}

export async function preflightProxyUpgrade(
    parameters: ProxyUpgradeParameters,
    baseline: PreviousImplementation,
    targetVersion: string,
) {
    assert(parameters.expectedChainId !== undefined, 'expectedChainId is required');
    const { chainId } = await ethers.provider.getNetwork();
    assert(chainId === BigInt(parameters.expectedChainId), 'Unexpected chain ID');
    const bridgeAddress = ethers.getAddress(parameters.bridgeAddress);
    assert((await ethers.provider.getCode(bridgeAddress)) !== '0x', 'Bridge proxy has no bytecode');
    const bridge = new ethers.Contract(bridgeAddress, ['function version() view returns (string)'], ethers.provider);
    const sourceVersion: string = await bridge.version();
    assert(
        sourceVersion === baseline.version,
        `Unsupported bridge version: ${sourceVersion}; expected ${baseline.version}`,
    );
    assert(sourceVersion === (parameters.expectedBridgeVersion ?? baseline.version), 'Unexpected bridge version');
    // A version string alone does not prove this implementation uses the archived layout.
    const previousImplementationAddress = await upgrades.erc1967.getImplementationAddress(bridgeAddress);
    const previousCode = await ethers.provider.getCode(previousImplementationAddress);
    assert(
        matchesRuntimeBytecode(previousCode, {
            object: baseline.deployedBytecode.slice(2),
            immutableReferences: baseline.immutableReferences,
        }),
        `Existing implementation does not match the archived ${baseline.version} Hardhat bytecode`,
    );
    // Read the target proxy directly; a local manifest can describe a different ProxyAdmin.
    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(bridgeAddress);
    assert((await ethers.provider.getCode(proxyAdminAddress)) !== '0x', 'Expected a ProxyAdmin contract');
    const proxyAdmin = new ethers.Contract(
        proxyAdminAddress,
        [
            'function owner() view returns (address)',
            'function getProxyImplementation(address proxy) view returns (address)',
            'function getProxyAdmin(address proxy) view returns (address)',
        ],
        ethers.provider,
    );
    assert(
        (await proxyAdmin.getProxyImplementation(bridgeAddress)) === previousImplementationAddress,
        'ProxyAdmin does not control the expected implementation',
    );
    assert(
        (await proxyAdmin.getProxyAdmin(bridgeAddress)) === proxyAdminAddress,
        'ProxyAdmin does not control the proxy',
    );
    const timelockContractAddress: string = await proxyAdmin.owner();
    assert(
        (await ethers.provider.getCode(timelockContractAddress)) !== '0x',
        'ProxyAdmin owner must be a timelock contract',
    );
    const timelock = new ethers.Contract(
        timelockContractAddress,
        ['function getMinDelay() view returns (uint256)'],
        ethers.provider,
    );
    const minimumDelay: bigint = await timelock.getMinDelay();
    const timelockDelay = BigInt(parameters.timelockDelay ?? minimumDelay);
    assert(timelockDelay >= minimumDelay, 'Requested timelock delay is below the on-chain minimum');
    const salt =
        parameters.timelockSalt ??
        ethers.id(`${chainId}:${bridgeAddress}:${previousImplementationAddress}:${targetVersion}`);
    assert(ethers.isHexString(salt, 32), 'timelockSalt must be bytes32');
    return {
        chainId: chainId.toString(),
        bridgeAddress,
        sourceVersion,
        targetVersion,
        previousImplementationAddress,
        previousImplementationCodeHash: ethers.keccak256(previousCode),
        proxyAdminAddress,
        timelockContractAddress,
        timelockDelay: timelockDelay.toString(),
        salt,
    };
}

export function buildProxyUpgradeOperation(
    preflight: Pick<
        Awaited<ReturnType<typeof preflightProxyUpgrade>>,
        'bridgeAddress' | 'proxyAdminAddress' | 'salt' | 'timelockDelay'
    >,
    implementationAddress: string,
) {
    // The OZ v4 upgrade path changes only the implementation pointer; no reinitializer is needed.
    const proxyAdminInterface = new ethers.Interface(['function upgrade(address proxy, address implementation)']);
    const timelockInterface = new ethers.Interface([
        'function schedule(address target,uint256 value,bytes data,bytes32 predecessor,bytes32 salt,uint256 delay)',
        'function execute(address target,uint256 value,bytes data,bytes32 predecessor,bytes32 salt)',
    ]);
    const upgradeData = proxyAdminInterface.encodeFunctionData('upgrade', [
        preflight.bridgeAddress,
        implementationAddress,
    ]);
    const operation = [preflight.proxyAdminAddress, 0, upgradeData, ethers.ZeroHash, preflight.salt];
    const operationId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256', 'bytes', 'bytes32', 'bytes32'], operation),
    );
    return {
        operationId,
        scheduleData: timelockInterface.encodeFunctionData('schedule', [...operation, preflight.timelockDelay]),
        executeData: timelockInterface.encodeFunctionData('execute', operation),
        decodedScheduleData: {
            target: preflight.proxyAdminAddress,
            value: '0',
            data: upgradeData,
            predecessor: ethers.ZeroHash,
            salt: preflight.salt,
            delay: preflight.timelockDelay,
            decodedData: {
                signature: 'upgrade(address,address)',
                proxy: preflight.bridgeAddress,
                implementation: implementationAddress,
            },
        },
    };
}
