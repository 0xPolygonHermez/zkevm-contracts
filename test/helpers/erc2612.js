const {
  ethers
} = require("hardhat");
const { expect } = require("chai");

async function createPermitSignature(tokenContractInstance, wallet, spenderAddress, value, nonce, deadline) {
  const chainId = (await tokenContractInstance.getChainId());
  const name = await tokenContractInstance.name();

  // The domain
  const domain = {
    name: name,
    version: "1",
    chainId: chainId,
    verifyingContract: tokenContractInstance.address
  };

  // The named list of all type definitions
  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ]
  };

  // The data to sign
  const values = {
    owner: wallet.address,
    spender: spenderAddress,
    value: value,
    nonce: nonce,
    deadline: deadline,
  };

  const rawSignature = await wallet._signTypedData(domain, types, values);
  const signature = ethers.utils.splitSignature(rawSignature);
  const recoveredAddressTyped = ethers.utils.verifyTypedData(domain, types, values, rawSignature);
  expect(recoveredAddressTyped).to.be.equal(wallet.address);

  return signature;
}


module.exports = {
  createPermitSignature
};