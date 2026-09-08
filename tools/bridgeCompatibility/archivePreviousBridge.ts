import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { run } from 'hardhat';
import {
    TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
    TASK_COMPILE_SOLIDITY_RUN_SOLC,
    TASK_COMPILE_SOLIDITY_RUN_SOLCJS,
} from 'hardhat/builtin-tasks/task-names';
import frozen from '../../upgrade/previousVersions/bridge/snapshots/AgglayerBridgeL2.v1.2.0.json';
import { logger } from '../../src/logger';

async function main() {
    const sourceName = 'contracts/AgglayerBridge.sol';
    const contractName = 'AgglayerBridge';
    const solcBuild = await run(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, {
        solcVersion: frozen.solcVersion,
        quiet: true,
    });
    assert(solcBuild.longVersion === frozen.solcLongVersion, 'Compiler must match the frozen release');
    // Compile only archived sources; the current bridge must never become its own upgrade baseline.
    const input = {
        ...frozen.input,
        settings: {
            ...frozen.input.settings,
            optimizer: { enabled: true, runs: 100 },
            evmVersion: 'shanghai',
        },
    };
    const output = await run(
        solcBuild.isSolcJs ? TASK_COMPILE_SOLIDITY_RUN_SOLCJS : TASK_COMPILE_SOLIDITY_RUN_SOLC,
        solcBuild.isSolcJs
            ? { input, solcJsPath: solcBuild.compilerPath }
            : { input, solcPath: solcBuild.compilerPath, solcVersion: frozen.solcVersion },
    );
    const failures = output.errors?.filter((error: any) => error.severity === 'error') ?? [];
    assert(failures.length === 0, failures.map((error: any) => error.formattedMessage).join('\n'));
    const compiled = output.contracts[sourceName][contractName];
    const definition = output.sources[sourceName].ast.nodes.find(
        (node: any) => node.nodeType === 'ContractDefinition' && node.name === contractName,
    );
    const version = definition.nodes.find((node: any) => node.name === 'BRIDGE_VERSION').value.value as string;
    assert(version === 'v1.1.0', 'Unexpected version in the frozen L1 bridge source');
    const snapshot = {
        version,
        sourceName,
        contractName,
        solcVersion: frozen.solcVersion,
        solcLongVersion: frozen.solcLongVersion,
        sourceArchive: 'AgglayerBridgeL2.v1.2.0.json',
        input,
        abi: compiled.abi,
        bytecode: `0x${compiled.evm.bytecode.object}`,
        deployedBytecode: `0x${compiled.evm.deployedBytecode.object}`,
        immutableReferences: compiled.evm.deployedBytecode.immutableReferences,
        storageLayout: compiled.storageLayout,
    };
    assert(snapshot.storageLayout && !snapshot.bytecode.includes('__'), 'Incomplete archived compilation');
    const directory = path.resolve(__dirname, '../../upgrade/previousVersions/bridge/snapshots');
    const snapshotPath = path.join(directory, `${contractName}.${version}.json`);
    const snapshotContent = `${JSON.stringify(snapshot, null, 2)}\n`;
    if (fs.existsSync(snapshotPath)) {
        assert(
            fs.readFileSync(snapshotPath, 'utf8') === snapshotContent,
            `Archived baseline differs: ${contractName} ${version}`,
        );
    } else {
        fs.writeFileSync(snapshotPath, snapshotContent, { flag: 'wx' });
    }
    // Keep one import-complete Solidity tree; differing saved files are rejected, never overwritten.
    const previousVersions = path.resolve(__dirname, '../../upgrade/previousVersions/bridge');
    Object.entries(frozen.input.sources).forEach(([name, { content }]) => {
        const file = path.join(previousVersions, name);
        if (fs.existsSync(file)) {
            assert(fs.readFileSync(file, 'utf8') === content, `Previous Solidity source differs: ${name}`);
        } else {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, content, { flag: 'wx' });
        }
    });
    logger.info(`Preserved ${contractName} ${version} and ${frozen.contractName} ${frozen.version} sources`);
    logger.info(`Archived L1 runtime: ${(snapshot.deployedBytecode.length - 2) / 2} bytes (Hardhat runs 100)`);
}

main().catch((error) => {
    logger.error(error);
    process.exitCode = 1;
});
