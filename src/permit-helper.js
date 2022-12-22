const { ethers } = require('ethers');
const { expect } = require('chai');

/**
 * Create a permit signature with the EIP-2612 standard
 * @param {Object} tokenContractInstance - EthersJS contract instance of the token
 * @param {Object} wallet - EthersJs wallet instance that will sign the permit
 * @param {String} spenderAddress - Spender address, usually the contract that the permit will interact with
 * @param {String} value - Value of the permit
 * @param {String} nonce - Nonce of the permit
 * @param {String} deadline - Deadline of the permit
 * @returns {Object} - Signature obejct, { v, r, s}
 */
async function createPermitSignature(tokenContractInstance, wallet, spenderAddress, value, nonce, deadline, chainId) {
    const name = await tokenContractInstance.name();

    // The domain
    const domain = {
        name,
        version: '1',
        chainId,
        verifyingContract: tokenContractInstance.address,
    };

    // The named list of all type definitions
    const types = {
        Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
        ],
    };

    // The data to sign
    const values = {
        owner: wallet.address,
        spender: spenderAddress,
        value,
        nonce,
        deadline,
    };

    const rawSignature = await wallet._signTypedData(domain, types, values);
    const signature = ethers.utils.splitSignature(rawSignature);
    const recoveredAddressTyped = ethers.utils.verifyTypedData(domain, types, values, rawSignature);
    expect(recoveredAddressTyped).to.be.equal(wallet.address);

    return signature;
}

/**
 * Create a permit signature with the DAi approach
 * @param {Object} tokenContractInstance - EthersJS contract instance of the token
 * @param {Object} wallet - EthersJs wallet instance that will sign the permit
 * @param {String} spenderAddress - Spender address, usually the contract that the permit will interact with
 * @param {String} value - Value of the permit
 * @param {String} nonce - Nonce of the permit
 * @param {String} expiry - expiry of the permit
 * @param {Number} chainId - expiry of the permit
 * @returns {Object} - Signature obejct, { v, r, s}
 */
async function createPermitSignatureDaiType(tokenContractInstance, wallet, spenderAddress, nonce, expiry, chainId) {
    const name = await tokenContractInstance.name();
    const version = await tokenContractInstance.version();

    // The domain
    const domain = {
        name,
        version,
        chainId,
        verifyingContract: tokenContractInstance.address,
    };

    // The named list of all type definitions
    const types = {
        Permit: [
            { name: 'holder', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'nonce', type: 'uint256' },
            { name: 'expiry', type: 'uint256' },
            { name: 'allowed', type: 'bool' },
        ],
    };

    // The data to sign
    const values = {
        holder: wallet.address,
        spender: spenderAddress,
        nonce,
        expiry,
        allowed: true,
    };

    const rawSignature = await wallet._signTypedData(domain, types, values);
    const signature = ethers.utils.splitSignature(rawSignature);
    const recoveredAddressTyped = ethers.utils.verifyTypedData(domain, types, values, rawSignature);

    expect(recoveredAddressTyped).to.be.equal(wallet.address);

    return signature;
}

/**
 * Create a permit signature with the UNI approach
 * @param {Object} tokenContractInstance - EthersJS contract instance of the token
 * @param {Object} wallet - EthersJs wallet instance that will sign the permit
 * @param {String} spenderAddress - Spender address, usually the contract that the permit will interact with
 * @param {String} value - Value of the permit
 * @param {String} nonce - Nonce of the permit
 * @param {String} deadline - Deadline of the permit
 * @param {Number} chainId - expiry of the permit
 * @returns {Object} - Signature obejct, { v, r, s}
 */
async function createPermitSignatureUniType(tokenContractInstance, wallet, spenderAddress, value, nonce, deadline, chainId) {
    const name = await tokenContractInstance.name();

    // The domain
    const domain = {
        name,
        chainId,
        verifyingContract: tokenContractInstance.address,
    };

    // The named list of all type definitions
    const types = {
        Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
        ],
    };

    // The data to sign
    const values = {
        owner: wallet.address,
        spender: spenderAddress,
        value,
        nonce,
        deadline,
    };

    const rawSignature = await wallet._signTypedData(domain, types, values);
    const signature = ethers.utils.splitSignature(rawSignature);
    const recoveredAddressTyped = ethers.utils.verifyTypedData(domain, types, values, rawSignature);
    expect(recoveredAddressTyped).to.be.equal(wallet.address);

    return signature;
}

/**
 * Permit interface
 */
const ifacePermit = new ethers.utils.Interface(['function permit(address,address,uint256,uint256,uint8,bytes32,bytes32)']);

/**
 * Permit interface DAI
 */
const ifacePermitDAI = new ethers.utils.Interface(['function permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)']);

module.exports = {
    createPermitSignature,
    createPermitSignatureDaiType,
    ifacePermit,
    ifacePermitDAI,
    createPermitSignatureUniType,
};
