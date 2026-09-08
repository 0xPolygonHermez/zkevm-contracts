import assert from 'assert';
import hre, { artifacts, ethers } from 'hardhat';
import { assertCompatibleStorage } from '../../tools/bridgeCompatibility/storageLayout';
import l1Baseline from '../previousVersions/bridge/snapshots/AgglayerBridge.v1.1.0.json';
import baseline from '../previousVersions/bridge/snapshots/AgglayerBridgeL2.v1.2.0.json';
import {
    ImmutableReferences,
    matchesRuntimeBytecode,
    preflightProxyUpgrade,
    buildProxyUpgradeOperation,
} from '../bridgeUpgradeUtils';

export { matchesRuntimeBytecode } from '../bridgeUpgradeUtils';

export const TARGET_BRIDGE_VERSION = 'v1.3.0';
export const BRIDGE_CONTRACT = 'contracts/sovereignChains/AgglayerBridgeL2.sol:AgglayerBridgeL2';
export const MODULE_CONTRACT = 'contracts/sovereignChains/AgglayerBridgeL2Module.sol:AgglayerBridgeL2Module';

export interface BridgeUpgradeParameters {
    bridgeL2Address: string;
    expectedChainId: number | string;
    expectedBridgeVersion?: string;
    timelockDelay?: number | string;
    timelockSalt?: string;
}

export async function checkBridgeArtifacts() {
    assert(!(hre as any).__SOLIDITY_COVERAGE_RUNNING, 'Cannot prepare upgrades with coverage artifacts');
    const buildInfo = await artifacts.getBuildInfo(BRIDGE_CONTRACT);
    assert(buildInfo, 'Compile the bridge with Hardhat first');
    const bridge = buildInfo.output.contracts[baseline.sourceName][baseline.contractName] as any;
    // Constructor-deployed dependencies use this compilation job, not standalone artifact overrides.
    const [moduleSource, moduleName] = MODULE_CONTRACT.split(':');
    const module = buildInfo.output.contracts[moduleSource][moduleName] as any;
    const { settings } = buildInfo.input;
    assert(buildInfo.solcVersion === '0.8.28', 'Unexpected Solidity compiler');
    assert(settings.evmVersion === 'shanghai', 'L2 artifacts must target Shanghai');
    assert(settings.optimizer?.enabled && settings.optimizer.runs === 9, 'Unexpected bridge optimizer settings');
    assert(!settings.viaIR, 'Unexpected via-IR bridge artifact');
    assert.deepStrictEqual(bridge.abi, baseline.abi, 'Bridge ABI differs from v1.2.0');
    assertCompatibleStorage(baseline.storageLayout, bridge.storageLayout);

    // L1 stays deployed unchanged; its layout is checked as the inherited prefix of L2 storage.
    const parentBuild = await artifacts.getBuildInfo(`${l1Baseline.sourceName}:${l1Baseline.contractName}`);
    assert(parentBuild, 'Compile AgglayerBridge with Hardhat first');
    const parent = parentBuild.output.contracts[l1Baseline.sourceName][l1Baseline.contractName] as any;
    assert.deepStrictEqual(parent.abi, l1Baseline.abi, 'L1 bridge ABI differs from v1.1.0');
    assertCompatibleStorage(l1Baseline.storageLayout, parent.storageLayout);
    assertCompatibleStorage(parent.storageLayout, bridge.storageLayout);

    // Ignore only solc's owning-contract labels, including those on nested struct members.
    const normalizeLayout = (layout: any) =>
        JSON.parse(JSON.stringify(layout, (key, value) => (key === 'contract' ? undefined : value)));
    assert.deepStrictEqual(
        normalizeLayout(bridge.storageLayout),
        normalizeLayout(module.storageLayout),
        'Bridge and module storage layouts differ',
    );
    // The bridge embeds module creation code, so runtime and combined initcode limits both matter.
    const sizes = {
        bridgeRuntime: bridge.evm.deployedBytecode.object.length / 2,
        bridgeInitcode: bridge.evm.bytecode.object.length / 2,
        moduleRuntime: module.evm.deployedBytecode.object.length / 2,
        moduleInitcode: module.evm.bytecode.object.length / 2,
    };
    assert(sizes.bridgeRuntime < 20_000, 'Bridge exceeds the 20,000-byte runtime budget');
    assert(sizes.moduleRuntime <= 24_576, 'Module exceeds EIP-170');
    assert(sizes.bridgeInitcode <= 49_152 && sizes.moduleInitcode <= 49_152, 'Initcode exceeds EIP-3860');
    return { buildInfo, bridge, module, sizes };
}

export async function preflightBridgeUpgrade(parameters: BridgeUpgradeParameters) {
    const preflight = await preflightProxyUpgrade(
        { ...parameters, bridgeAddress: parameters.bridgeL2Address },
        baseline,
        TARGET_BRIDGE_VERSION,
    );
    const { sizes } = await checkBridgeArtifacts();
    return {
        ...preflight,
        bridgeL2Address: preflight.bridgeAddress,
        sizes,
    };
}

export async function checkDeployedBridgeImplementation(address: string) {
    const { bridge, module, buildInfo } = await checkBridgeArtifacts();
    const code = await ethers.provider.getCode(address);
    assert(matchesRuntimeBytecode(code, bridge.evm.deployedBytecode), 'New implementation bytecode mismatch');
    const implementation = new ethers.Contract(address, ['function version() view returns (string)'], ethers.provider);
    assert((await implementation.version()) === TARGET_BRIDGE_VERSION, 'New implementation version mismatch');
    // The module address has no storage slot; locate its immutable bytes using compiler reference offsets.
    const definition = buildInfo.output.sources[baseline.sourceName].ast.nodes.find(
        (node: any) => node.nodeType === 'ContractDefinition' && node.name === baseline.contractName,
    );
    const moduleVariable = definition.nodes.find((node: any) => node.name === 'bridgeModule');
    const references = bridge.evm.deployedBytecode.immutableReferences[moduleVariable.id] as {
        start: number;
        length: number;
    }[];
    assert(references?.length, 'Module immutable reference is missing');
    const moduleWord = ethers.dataSlice(code, references[0].start, references[0].start + references[0].length);
    const moduleAddress = ethers.getAddress(ethers.dataSlice(moduleWord, 12));
    assert(
        references.every(({ start, length }) => ethers.dataSlice(code, start, start + length) === moduleWord),
        'Module immutable references disagree',
    );
    const moduleCode = await ethers.provider.getCode(moduleAddress);
    assert(matchesRuntimeBytecode(moduleCode, module.evm.deployedBytecode), 'Deployed module bytecode mismatch');
    // Check the self-address guard separately because generic runtime matching masks immutables.
    const selfReferences = Object.values(module.evm.deployedBytecode.immutableReferences as ImmutableReferences).flat();
    assert(
        selfReferences.every(
            ({ start, length }) =>
                ethers.dataSlice(moduleCode, start, start + length) ===
                ethers.zeroPadValue(moduleAddress.toLowerCase(), 32),
        ),
        'Module delegatecall guard immutable is incorrect',
    );
    return {
        moduleAddress,
        implementationCodeHash: ethers.keccak256(code),
        moduleCodeHash: ethers.keccak256(moduleCode),
    };
}

export function buildBridgeUpgradeOperation(
    preflight: Awaited<ReturnType<typeof preflightBridgeUpgrade>>,
    implementationAddress: string,
) {
    return buildProxyUpgradeOperation(preflight, implementationAddress);
}
