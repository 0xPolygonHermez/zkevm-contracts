const ethers = require('ethers');
const { expect } = require('chai');

/**
 * Create a permit signature with the EIP-712 standar
 * @param {Object} tokenContractInstance - EthersJS contract instance of the token
 * @param {Object} wallet - EthersJs wallet instance that will sign the permit
 * @param {String} spenderAddress - Spender address, usually the contract that the permit will interact with
 * @param {String} value - Value of the permit
 * @param {String} nonce - Nonce of the permit
 * @param {String} deadline - Deadline of the permit
 * @returns {Object} - Signature obejct, { v, r, s}
 */
async function createPermitSignature(tokenContractInstance, wallet, spenderAddress, value, nonce, deadline) {
    const chainId = (await tokenContractInstance.getChainId());
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
 * Permit interface
 */
const ifacePermit = new ethers.utils.Interface(['function permit(address,address,uint256,uint256,uint8,bytes32,bytes32)']);

module.exports = {
    createPermitSignature,
    ifacePermit,
};
