/* eslint-disable no-restricted-syntax, no-await-in-loop, no-continue, no-plusplus, no-console */
/* eslint-disable @typescript-eslint/no-shadow, @typescript-eslint/no-unused-vars */
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

const deployedTxHashes = ['0x123'];

const proxyName = 'TransparentUpgradeableProxy';

// ERC20 ABI for getting token information
const ERC20_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
];

const initializeAbis = [
    [
        {
            inputs: [
                { internalType: 'address', name: 'owner_', type: 'address' },
                { internalType: 'uint8', name: 'originalUnderlyingTokenDecimals_', type: 'uint8' },
                { internalType: 'address', name: 'customToken_', type: 'address' },
                { internalType: 'address', name: 'underlyingToken_', type: 'address' },
                { internalType: 'address', name: 'lxlyBridge_', type: 'address' },
                { internalType: 'uint32', name: 'layerXNetworkId_', type: 'uint32' },
                { internalType: 'uint256', name: 'nonMigratableBackingPercentage_', type: 'uint256' },
                { internalType: 'address', name: 'migrationManager_', type: 'address' },
                { internalType: 'uint256', name: 'nonMigratableGasBackingPercentage_', type: 'uint256' },
            ],
            name: 'initialize',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
        },
    ],
    [
        {
            inputs: [
                { internalType: 'address', name: 'owner_', type: 'address' },
                { internalType: 'uint8', name: 'originalUnderlyingTokenDecimals_', type: 'uint8' },
                { internalType: 'address', name: 'customToken_', type: 'address' },
                { internalType: 'address', name: 'underlyingToken_', type: 'address' },
                { internalType: 'address', name: 'lxlyBridge_', type: 'address' },
                { internalType: 'uint32', name: 'layerXLxlyId_', type: 'uint32' },
                { internalType: 'uint256', name: 'nonMigratableBackingPercentage_', type: 'uint256' },
                { internalType: 'address', name: 'migrationManager_', type: 'address' },
            ],
            name: 'initialize',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
        },
    ],
];

const upgradeTokenTxs = ['0x1232'];

// ABI for upgradeToAndCall(address,bytes)
const UPGRADE_TO_AND_CALL_ABI = ['function upgradeToAndCall(address newImplementation, bytes data)'];

// ABI for reinitialize
const REINITIALIZE_ABI = [
    'function reinitialize(address owner_, string name_, string symbol_, uint8 originalUnderlyingTokenDecimals_, address lxlyBridge_, address nativeConverter_)',
];

async function getTokenInfo(
    provider: any,
    address: string,
): Promise<{ name: string; symbol: string; decimals: number } | null> {
    try {
        const tokenContract = new ethers.Contract(address, ERC20_ABI, provider);
        const name = await tokenContract.name();
        const symbol = await tokenContract.symbol();
        const decimals = await tokenContract.decimals();

        return { name, symbol, decimals };
    } catch (error) {
        return null;
    }
}

async function decodeUpgradeTxs(provider: any): Promise<Record<string, any>> {
    const ifaceUpgrade = new ethers.Interface(UPGRADE_TO_AND_CALL_ABI);
    const ifaceReinit = new ethers.Interface(REINITIALIZE_ABI);
    const upgradeResults: Record<string, any> = {};

    for (const txHash of upgradeTokenTxs) {
        const tx = await provider.getTransaction(txHash);
        if (!tx) {
            upgradeResults[txHash] = { error: 'Transaction not found' };
            continue;
        }
        let decodedUpgrade: any;
        try {
            decodedUpgrade = ifaceUpgrade.parseTransaction({ data: tx.data });
        } catch (e) {
            upgradeResults[txHash] = { error: 'Could not decode upgradeToAndCall' };
            continue;
        }
        if (!decodedUpgrade || !decodedUpgrade.args) {
            upgradeResults[txHash] = { error: 'Could not decode upgradeToAndCall' };
            continue;
        }
        const { newImplementation, data } = decodedUpgrade.args as any;
        let decodedReinit;
        try {
            decodedReinit = ifaceReinit.parseTransaction({ data });
        } catch (e) {
            decodedReinit = { error: 'Could not decode reinitialize' };
        }

        // Get token info for the contract being upgraded (tx.to)
        let tokenInfo = null;
        if (tx.to) {
            tokenInfo = await getTokenInfo(provider, tx.to);
        }
        const key = tokenInfo && tokenInfo.name ? tokenInfo.name : tx.to || txHash;

        upgradeResults[key] = {
            txHash,
            tokenAddress: tx.to,
            newImplementation,
            decodedReinitialize:
                decodedReinit && decodedReinit.args
                    ? {
                          owner_: decodedReinit.args[0],
                          name_: decodedReinit.args[1],
                          symbol_: decodedReinit.args[2],
                          originalUnderlyingTokenDecimals_: decodedReinit.args[3],
                          lxlyBridge_: decodedReinit.args[4],
                          nativeConverter_: decodedReinit.args[5],
                      }
                    : decodedReinit,
            ...(tokenInfo ? { tokenInfo } : {}),
        };
    }
    return upgradeResults;
}

async function main() {
    const { provider } = ethers;
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
    for (const dir of artifactsDirs) findArtifacts(dir);

    function trimSolcIpfs(bytecode: string): string {
        const code = bytecode.toLowerCase();
        let result = '';
        let idx = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const match = code.indexOf('64736f6c63', idx);
            if (match === -1) {
                result += code.slice(idx);
                break;
            }
            const ipfsStart = Math.max(match - 64, idx);
            result += code.slice(idx, ipfsStart);
            // skip the ipfs hash and the marker
            // Advance idx to after the marker to avoid infinite loop
            idx = match + 10;
            if (idx <= match) {
                // Failsafe: if for some reason idx does not advance, break to avoid infinite loop
                break;
            }
        }
        return result;
    }

    const results: Record<string, any> = {};
    const contractsByName: Record<string, any> = {};

    // Helper function to find logic contract name
    function findLogicContractName(logicAddress: string, contractsByName: Record<string, any>): string | undefined {
        // contractsByName now uses address as key
        return contractsByName[logicAddress];
    }

    for (const txHash of deployedTxHashes) {
        const creationTx = await provider.getTransaction(txHash);
        if (!creationTx) {
            console.error(`Could not find creation transaction for ${txHash}`);
            continue;
        }
        // Calculate deployed address
        const { from } = creationTx;
        const { nonce } = creationTx;
        const deployedAddress = ethers.getCreateAddress({ from, nonce });
        const code = await provider.getCode(deployedAddress);
        if (code === '0x') {
            console.error(`No contract deployed at ${deployedAddress} for tx ${txHash}`);
            continue;
        }
        const initCode = creationTx.data;
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
            const trimmedInitCode = trimSolcIpfs(initCode);

            // Only compare the code part (without constructor params)
            if (
                trimmedInitCode.startsWith(trimmedArtifactInitCode) &&
                trimmedArtifactInitCode.length > 20 // 10 bytes in hex
            ) {
                // Try to decode constructor params only if there are any
                let canDecodeConstructor = false;
                let constructorParams: any = {};
                let decodedData: any;
                const { abi } = artifact;
                const constructorAbi = abi && abi.find((x: any) => x.type === 'constructor');
                if (
                    constructorAbi &&
                    constructorAbi.inputs.length > 0 &&
                    trimmedInitCode.length > trimmedArtifactInitCode.length
                ) {
                    const argTypes = constructorAbi.inputs.map((x: any) => x.type);
                    const argNames = constructorAbi.inputs.map((x: any) => x.name);
                    const encodedArgs = `0x${trimmedInitCode.slice(trimmedArtifactInitCode.length)}`;
                    try {
                        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(argTypes, encodedArgs);
                        for (let i = 0; i < argNames.length; i++) {
                            constructorParams[argNames[i]] = decoded[i];
                        }
                        canDecodeConstructor = true;
                    } catch (e) {
                        constructorParams = { error: 'Could not decode constructor arguments.' };
                        canDecodeConstructor = false;
                    }
                } else if (!constructorAbi || constructorAbi.inputs.length === 0) {
                    canDecodeConstructor = true;
                }

                // If proxy, decode _data
                let logicContractName: string | undefined;
                if (
                    contractName === proxyName &&
                    constructorAbi &&
                    constructorAbi.inputs.length === 3 &&
                    canDecodeConstructor
                ) {
                    // const argNames = constructorAbi.inputs.map((x: any) => x.name);
                    const argTypes = constructorAbi.inputs.map((x: any) => x.type);
                    const encodedArgs = `0x${trimmedInitCode.slice(trimmedArtifactInitCode.length)}`;
                    try {
                        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(argTypes, encodedArgs);
                        const dataArg = decoded[2];
                        for (const abi of initializeAbis) {
                            try {
                                const iface = new ethers.Interface(abi);
                                const parsed = iface.parseTransaction({ data: dataArg });
                                if (parsed) {
                                    decodedData = {};
                                    for (let i = 0; i < parsed.fragment.inputs.length; i++) {
                                        const input = parsed.fragment.inputs[i];
                                        decodedData[input.name] = parsed.args[i];
                                    }
                                    break;
                                }
                            } catch (e) {
                                /* try next ABI */
                            }
                        }
                        if (!decodedData) decodedData = { error: 'Could not decode _data with provided ABIs.' };

                        // Try to find the logic contract in our results
                        const logicAddress = decoded[0]; // _logic is the first parameter
                        logicContractName = findLogicContractName(logicAddress, contractsByName);
                    } catch (e) {
                        decodedData = { error: 'Could not decode _data.' };
                    }
                }

                if (canDecodeConstructor) {
                    found = true;

                    // Determine final contract name
                    let finalContractName = contractName;
                    if (contractName === proxyName && logicContractName) {
                        finalContractName = `${logicContractName} (TransparentProxy)`;
                    }

                    // Check if it's a token contract and get token info
                    let tokenInfo: any;
                    if (
                        contractName === 'GenericNativeConverter' ||
                        finalContractName.includes('GenericNativeConverter') ||
                        logicContractName === 'GenericNativeConverter' ||
                        finalContractName.includes('WETHNativeConverter') ||
                        logicContractName === 'WETHNativeConverter'
                    ) {
                        if (decodedData && decodedData.customToken_ && decodedData.underlyingToken_) {
                            const customTokenInfo = await getTokenInfo(provider, decodedData.customToken_);
                            const underlyingTokenInfo = await getTokenInfo(provider, decodedData.underlyingToken_);

                            if (customTokenInfo && underlyingTokenInfo) {
                                tokenInfo = {
                                    customToken: {
                                        address: decodedData.customToken_,
                                        name: customTokenInfo.name,
                                        symbol: customTokenInfo.symbol,
                                        decimals: customTokenInfo.decimals,
                                    },
                                    underlyingToken: {
                                        address: decodedData.underlyingToken_,
                                        name: underlyingTokenInfo.name,
                                        symbol: underlyingTokenInfo.symbol,
                                        decimals: underlyingTokenInfo.decimals,
                                    },
                                };

                                // Update contract name with token info
                                if (contractName === proxyName && logicContractName) {
                                    // For proxies, include both custom and underlying token info
                                    finalContractName = `${finalContractName} - ${underlyingTokenInfo.name} (TransparentProxy)`;
                                } else if (customTokenInfo.name) {
                                    finalContractName = `${finalContractName} - ${customTokenInfo.name}`;
                                }
                            }
                        }
                    }

                    const contractInfo = {
                        deployedTxHash: txHash,
                        address: deployedAddress,
                        constructorParams,
                        ...(decodedData ? { decodedData } : {}),
                        ...(tokenInfo ? { tokenInfo } : {}),
                    };

                    // Store in contractsByName for lookup (address -> contract name)
                    contractsByName[deployedAddress] = contractName;

                    // Store in results with unique key
                    let uniqueKey = finalContractName;
                    let counter = 1;
                    while (results[uniqueKey]) {
                        uniqueKey = `${finalContractName}_${counter}`;
                        counter++;
                    }
                    results[uniqueKey] = contractInfo;
                    break;
                } else {
                    found = false;
                    continue;
                }
            }
        }
        if (!found) {
            console.error(`No matching artifact found for deployed code at ${deployedAddress} (tx: ${txHash})`);
        }
    }

    const upgradeTxsDecoded = await decodeUpgradeTxs(provider);

    const output = {
        ...results,
        upgradeTxs: upgradeTxsDecoded,
    };

    const timestamp = new Date().toISOString();
    const outName = `deployed_contracts_info__${timestamp}.json`;
    fs.writeFileSync(path.join(__dirname, outName), JSON.stringify(output, null, 2));
    console.log(`Results saved to ${outName}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

/* eslint-disable no-extend-native */
Object.defineProperty(BigInt.prototype, 'toJSON', {
    get() {
        return () => String(this);
    },
});
