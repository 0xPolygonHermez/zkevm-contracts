/* eslint-disable no-restricted-syntax */
/* eslint-disable no-inner-declarations */
/* eslint-disable no-console */
import { ethers, upgrades } from 'hardhat';
import { execSync } from 'child_process';

/**
 * Adjusts the multiplier gas and/or the maxFeePer gas of the provider depending on the parameters values and returns the adjusted provider
 * @param {Object} parameters The input  parameters of the script
 * @returns {Object} The adjusted provider or `ethers.provider` if no parameters applied
 * @param {Object} connectedEthers current ethers instance connected to a network
 */
export function getProviderAdjustingMultiplierGas(parameters, connectedEthers) {
    let currentProvider = connectedEthers.provider;
    if (parameters.multiplierGas || parameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== 'hardhat') {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            );
            if (parameters.maxPriorityFeePerGas && parameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${parameters.maxPriorityFeePerGas} gwei, MaxFee${parameters.maxFeePerGas} gwei`,
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(parameters.maxFeePerGas, 'gwei'),
                    ethers.parseUnits(parameters.maxPriorityFeePerGas, 'gwei'),
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log('Multiplier gas used: ', parameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await connectedEthers.provider.getFeeData();
                    return new connectedEthers.FeeData(
                        null,
                        (feedata.maxFeePerGas * BigInt(parameters.multiplierGas)) / BigInt(1000),
                        (feedata.maxPriorityFeePerGas * BigInt(parameters.multiplierGas)) / BigInt(1000),
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }
    return currentProvider;
}

/**
 * Resolves a deployer given the parameters and the current provider
 * @param {Object} currentProvider The current provider
 * @param {Object} parameters Json OBject with the script parameters
 * @param {Object} connectedEthers current ethers instance connected to a network
 * @returns The resolved deployer
 */
export async function getDeployerFromParameters(currentProvider, parameters, connectedEthers) {
    let deployer;
    if (process.env.DEPLOYER_PRIVATE_KEY) {
        deployer = new connectedEthers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = connectedEthers.HDNodeWallet.fromMnemonic(
            connectedEthers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0",
        ).connect(currentProvider);
    } else if (parameters.deployerPvtKey) {
        deployer = new connectedEthers.Wallet(parameters.deployerPvtKey, currentProvider);
    } else {
        [deployer] = await connectedEthers.getSigners();
    }
    return deployer;
}
/**
 * Check if all params are present in the expectedParams
 * @param {Object} objParams - object with parameters
 * @param {Array} expectedParams - array of expected parameters in string (supports dot notation for nested objects)
 * @param {Boolean} checkAddresses - check if the parameter is a correct address in case has Address string in param name
 */
export function checkParams(objParams, expectedParams, checkAddresses = false) {
    // eslint-disable-next-line no-restricted-syntax
    for (const parameterName of expectedParams) {
        let value;
        let actualParameterName = parameterName;

        // Support dot notation for nested objects (e.g., 'network.chainID')
        if (parameterName.includes('.')) {
            const keys = parameterName.split('.');
            value = objParams;
            for (const key of keys) {
                value = value?.[key];
                if (value === undefined || value === '') {
                    throw new Error(`Missing parameter: ${parameterName}`);
                }
            }
            // For address checking, use the last part of the dot notation
            actualParameterName = keys[keys.length - 1];
        } else {
            // Backward compatibility: direct parameter access
            value = objParams[parameterName];
            if (value === undefined || value === '') {
                throw new Error(`Missing parameter: ${parameterName}`);
            }
        }

        if (checkAddresses) {
            // Check addresses - support both direct parameter names and nested parameter names
            if (actualParameterName.includes('Address') && !ethers.isAddress(value)) {
                throw new Error(`Invalid parameter address: ${parameterName}`);
            }
        }
    }
}

/**
 * Convert a value into in its hexadecimal string representation with 32 bytes padding
 * @param {Number | BigInt} _value - value to encode
 * @returns {String} encoded value in hexadecimal string
 */
export function valueToStorageBytes(_value) {
    return ethers.toBeHex(_value, 32);
}

/**
 * Scan all SSTORE opcodes in a trace
 * Does not take into account revert operations neither depth
 * @param {Object} trace
 * @param {Object} addressInfo Object {address, nonce} depth = 1
 * @returns {Object} - storage writes: depth: {"key": "value"}
 */
export async function getStorageWrites(trace, addressInfo) {
    const addresses: { [address: string]: any } = {};
    addresses[addressInfo.address] = addressInfo.nonce;
    const stackAddressesStorage = [addressInfo.address];
    const logs = trace.structLogs.filter(
        (log) =>
            log.op === 'CALL' ||
            log.op === 'CALLCODE' ||
            log.op === 'DELEGATECALL' ||
            log.op === 'STATICCALL' ||
            log.op === 'CREATE' ||
            log.op === 'CREATE2' ||
            log.op === 'RETURN' ||
            log.op === 'REVERT' ||
            log.op === 'STOP' ||
            log.op === 'SELFDESTRUCT' ||
            log.op === 'SSTORE',
    );

    const writeObject: { [address: string]: any } = {};
    // eslint-disable-next-line no-restricted-syntax
    for (const log of logs) {
        if (log.op === 'CALL' || log.op === 'STATICCALL') {
            // Get address from stack
            const addressStack = `0x${log.stack.slice(-2)[0].slice(-40)}`;
            // eslint-disable-next-line no-await-in-loop
            addresses[addressStack] = await ethers.provider.getTransactionCount(addressStack);
            // Update address stack
            stackAddressesStorage.push(addressStack);
        } else if (log.op === 'DELEGATECALL' || log.op === 'CALLCODE') {
            // Update address stack
            stackAddressesStorage.push(stackAddressesStorage[stackAddressesStorage.length - 1]);
        } else if (log.op === 'CREATE') {
            // Get actual address (create is with this address)
            const actualAddress = stackAddressesStorage[stackAddressesStorage.length - 1];
            // Calculate with actual address and nonce
            const calculatedAddress = ethers.getCreateAddress({
                from: actualAddress,
                nonce: addresses[actualAddress],
            });
            // Add new address and nonce
            addresses[calculatedAddress] = 1;
            // Update nonce actual address
            addresses[actualAddress] += 1;
            // Update actual address
            stackAddressesStorage.push(calculatedAddress);
        } else if (log.op === 'CREATE2') {
            // Get actual address (create is with this address)
            const actualAddress = stackAddressesStorage[stackAddressesStorage.length - 1];
            const parameters = log.stack.slice(-4);
            const memHex = `${log.memory.join('')}`;
            const salt = `0x${parameters[0]}`;
            const size = Number(`0x${parameters[1]}`);
            const offset = Number(`0x${parameters[2]}`);
            const start = offset * 2;
            const end = start + size * 2;
            const initCodeHex = `0x${memHex.slice(start, end)}`;
            const initCodeHash = ethers.solidityPackedKeccak256(['bytes'], [initCodeHex]);
            const calculatedAddress = ethers.getCreate2Address(actualAddress, salt, initCodeHash);
            // Add new address and nonce
            addresses[calculatedAddress] = 1;
            // Update nonce actual address
            addresses[actualAddress] += 1;
            // Update actual address
            stackAddressesStorage.push(calculatedAddress);
        } else if (log.op === 'SSTORE') {
            const [newValue, slot] = log.stack.slice(-2);
            const address = stackAddressesStorage[stackAddressesStorage.length - 1].toLowerCase();
            if (!writeObject[address]) {
                writeObject[address] = {};
            }
            writeObject[address][`0x${slot}`] = `0x${newValue}`;
        } else if (
            (log.op === 'RETURN' || log.op === 'REVERT' || log.op === 'STOP' || log.op === 'SELFDESTRUCT') &&
            log.depth > 1
        ) {
            // Update actual address
            stackAddressesStorage.pop();
        }
    }

    return writeObject;
}

/**
 * Function to get the storage modifications of a tx from the txHash
 * @param {string} txHash - transaction hash
 * @param {string} address - (optional) storage address
 * @returns {Object} - storage writes: { depth: {"key": "value"} }
 */
export async function getTraceStorageWrites(txHash: any, address = undefined) {
    const infoTx = await ethers.provider.getTransaction(txHash);
    if (!infoTx) {
        throw new Error(`No info tx: ${txHash}`);
    }
    const addressInfo: { address?: string; sender?: string; nonce?: number } = {};
    addressInfo.sender = infoTx.from.toLowerCase();
    if (!infoTx.to) {
        const receipt = await ethers.provider.getTransactionReceipt(txHash);
        addressInfo.address = receipt?.contractAddress?.toLowerCase();
        addressInfo.nonce = 1;
    } else {
        addressInfo.address = infoTx.to.toLowerCase();
        addressInfo.nonce = await ethers.provider.getTransactionCount(addressInfo.address);
    }

    const trace = await ethers.provider.send('debug_traceTransaction', [
        txHash,
        {
            enableMemory: false,
            disableStack: false,
            disableStorage: false,
            enableReturnData: false,
        },
    ]);
    const computedStorageWrites = await getStorageWrites(trace, addressInfo);
    if (address) return computedStorageWrites[address.toLowerCase()];
    return computedStorageWrites;
}

/**
 * Get the owner of the proxy admin of a proxy contract
 * @param {String} proxyAddress - address of the proxy contract
 * @returns {String} - address of the owner of the proxy admin of the proxy
 */
export async function getOwnerOfProxyAdminFromProxy(proxyAddress) {
    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);
    const proxyAdminFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
    );
    const proxyAdmin = proxyAdminFactory.attach(proxyAdminAddress);
    const ownerAddress = await proxyAdmin.owner();
    return ownerAddress;
}

/**
 * Get all SLOAD and SSTORE in a trace
 * @param {Object} trace
 * @returns {Object} - storage read and writes: {"key": "value"}
 */
export function getStorageReadWrites(trace) {
    return trace.structLogs[trace.structLogs.length - 1].storage;
}

/**
 * Retrieves the current Git commit hash, repository URL and tag
 * @param {Boolean} criticalTooling - (optional) if true, throws an error if no tag
 * @returns An object containing the commit hash and repository URL, or null if an error occurs
 */
export function getGitInfo(criticalTooling = false): { commit: string; repo: string; tag: string } {
    try {
        // Get the latest commit hash
        const commit = execSync('git rev-parse HEAD').toString().trim();

        // Get the repository URL
        const repo = execSync('git config --get remote.origin.url').toString().trim();

        // Get tag if available
        const tag = execSync('git tag --points-at HEAD').toString().trim();

        if (criticalTooling && !tag) {
            throw new Error(
                'Error: This tool is critical. There is no tag associated with the version being used. It must be executed from a tag.',
            );
        }

        return { commit, repo, tag };
    } catch (error) {
        throw new Error(`getGitInfo: ${error}`);
    }
}
