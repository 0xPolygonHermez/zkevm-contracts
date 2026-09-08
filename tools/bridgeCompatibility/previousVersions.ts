import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { ethers, run } from 'hardhat';
import { ContractRunner } from 'ethers';
import {
    TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
    TASK_COMPILE_SOLIDITY_RUN_SOLC,
    TASK_COMPILE_SOLIDITY_RUN_SOLCJS,
} from 'hardhat/builtin-tasks/task-names';
import l1Baseline from '../../upgrade/previousVersions/bridge/snapshots/AgglayerBridge.v1.1.0.json';
import l2Baseline from '../../upgrade/previousVersions/bridge/snapshots/AgglayerBridgeL2.v1.2.0.json';
import { CompilerStorageLayout } from './storageLayout';

interface PreviousBuild {
    abi: any[];
    bytecode: string;
    deployedBytecode: string;
    storageLayout: CompilerStorageLayout;
}

const previousBuilds = new Map<string, Promise<PreviousBuild>>();

async function compilePreviousBridge(contractName: string): Promise<PreviousBuild> {
    const baseline = [l1Baseline, l2Baseline].find((entry) => entry.contractName === contractName);
    assert(baseline, `Unknown previous bridge: ${contractName}`);
    const directory = path.resolve(__dirname, '../../upgrade/previousVersions/bridge');
    // Compile the saved import tree, not current sources or mutable node_modules dependencies.
    const sources = Object.fromEntries(
        Object.keys(baseline.input.sources).map((name) => [
            name,
            { content: fs.readFileSync(path.join(directory, name), 'utf8') },
        ]),
    );
    const input = { ...baseline.input, sources };
    const solcBuild = await run(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, {
        solcVersion: baseline.solcVersion,
        quiet: true,
    });
    assert(solcBuild.longVersion === baseline.solcLongVersion, 'Previous bridge compiler mismatch');
    const output = await run(
        solcBuild.isSolcJs ? TASK_COMPILE_SOLIDITY_RUN_SOLCJS : TASK_COMPILE_SOLIDITY_RUN_SOLC,
        solcBuild.isSolcJs
            ? { input, solcJsPath: solcBuild.compilerPath }
            : { input, solcPath: solcBuild.compilerPath, solcVersion: baseline.solcVersion },
    );
    const failures = output.errors?.filter((error: any) => error.severity === 'error') ?? [];
    assert(failures.length === 0, failures.map((error: any) => error.formattedMessage).join('\n'));
    const compiled = output.contracts[baseline.sourceName][baseline.contractName];
    const previous = {
        abi: compiled.abi,
        bytecode: `0x${compiled.evm.bytecode.object}`,
        deployedBytecode: `0x${compiled.evm.deployedBytecode.object}`,
        storageLayout: compiled.storageLayout,
    };
    // Byte-for-byte checks ensure edits to a previous version cannot silently weaken upgrade tests.
    assert.deepStrictEqual(previous.abi, baseline.abi, 'Previous Solidity ABI differs from the release archive');
    assert(
        previous.bytecode === baseline.bytecode,
        'Previous Solidity creation bytecode differs from the release archive',
    );
    assert(
        previous.deployedBytecode === baseline.deployedBytecode,
        'Previous Solidity runtime differs from the release archive',
    );
    return previous;
}

export function getPreviousBridgeBuild(contractName: string) {
    if (!previousBuilds.has(contractName)) {
        previousBuilds.set(contractName, compilePreviousBridge(contractName));
    }
    return previousBuilds.get(contractName)!;
}

export async function getPreviousBridgeFactory(contractName: string, runner?: ContractRunner) {
    const compiled = await getPreviousBridgeBuild(contractName);
    const signer = runner ?? (await ethers.getSigners())[0];
    return new ethers.ContractFactory(compiled.abi, compiled.bytecode, signer);
}
