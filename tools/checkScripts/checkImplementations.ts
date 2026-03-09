/* eslint-disable no-restricted-syntax, no-continue, no-console */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

async function main() {
    const address = '';
    const deployedTxHash = '';

    const { provider } = ethers;
    const code = await provider.getCode(address);
    if (code === '0x') {
        console.error('No contract deployed at this address.');
        process.exit(1);
    }

    // Get the creation transaction
    const creationTx = await provider.getTransaction(deployedTxHash);
    if (!creationTx) {
        console.error('Could not find creation transaction.');
        process.exit(1);
    }
    const initCode = creationTx.data;

    // Load all artifacts from Hardhat
    const artifactsDirs = [path.join(__dirname, '../../out'), path.join(__dirname, '../../artifacts/contracts')];

    const artifactFiles: string[] = [];
    function findArtifacts(dir: string) {
        if (!fs.existsSync(dir)) return;
        for (const file of fs.readdirSync(dir)) {
            const full = path.join(dir, file);
            if (fs.statSync(full).isDirectory()) findArtifacts(full);
            else if (file.endsWith('.json')) artifactFiles.push(full);
        }
    }
    for (const dir of artifactsDirs) {
        findArtifacts(dir);
    }

    function trimSolcIpfs(bytecode: string): string {
        // Find last occurrence of '64736f6c63' (case-insensitive)
        // const solcTag = /64736f6c63/i;
        const match = bytecode.toLowerCase().lastIndexOf('64736f6c63');
        if (match === -1) return bytecode;
        // Remove 32 bytes (64 hex chars) before the tag
        const ipfsStart = match - 64;
        if (ipfsStart < 0) return bytecode;
        return bytecode.slice(0, ipfsStart) + bytecode.slice(match);
    }

    let found = false;
    for (const artifactPath of artifactFiles) {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        if (!artifact.bytecode) continue;
        const contractName = artifact.contractName || path.basename(artifactPath, '.json');
        let artifactInitCode: string;
        if (typeof artifact.bytecode === 'object' && artifact.bytecode.object) {
            artifactInitCode = artifact.bytecode.object;
        } else if (typeof artifact.bytecode === 'string') {
            artifactInitCode = artifact.bytecode;
        } else {
            continue;
        }

        const trimmedArtifactInitCode = trimSolcIpfs(artifactInitCode);
        const trimmedInitCodeFull = trimSolcIpfs(initCode);

        // Only compare if artifact code is long enough
        if (trimmedArtifactInitCode.length > 20) {
            // Trim the deployed initCode to the length of the artifact code
            const trimmedInitCode = trimmedInitCodeFull.slice(0, trimmedArtifactInitCode.length);

            if (trimmedInitCode === trimmedArtifactInitCode) {
                found = true;
                console.log(`Contract at ${address} matches artifact: ${contractName}`);
                const { abi } = artifact;
                const constructorAbi = abi && abi.find((x: any) => x.type === 'constructor');
                if (constructorAbi && constructorAbi.inputs.length > 0) {
                    const argTypes = constructorAbi.inputs.map((x: any) => x.type);
                    const argNames = constructorAbi.inputs.map((x: any) => x.name);
                    // The encoded constructor args are after the bytecode (excluding IPFS hash)
                    const encodedArgs = `0x${trimmedInitCodeFull.slice(trimmedArtifactInitCode.length)}`;
                    try {
                        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(argTypes, encodedArgs);
                        for (let i = 0; i < argNames.length; i++) {
                            console.log(`  ${argNames[i]}:`, decoded[i]);
                        }
                    } catch (e) {
                        console.log('  Could not decode constructor arguments.');
                    }
                } else {
                    console.log('  No constructor arguments.');
                }
            }
        }
    }
    if (!found) {
        console.log('No matching artifact found for deployed code.');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
