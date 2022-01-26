require("dotenv").config();
process.env.HARDHAT_NETWORK = "goerli";
const { ethers } = require("hardhat");

async function main() {
  // get proof of efficiency
  const address = "0xDb5bf4968b0026bbC5E6a270392F7A26f21d174f"
  const ProofOfEfficiencyFactory = await ethers.getContractFactory('Bridge');
  const proofOfEfficiencyContract = await ProofOfEfficiencyFactory.attach(address);
  console.log(await proofOfEfficiencyContract.globalExitRootMap(0));
  console.log(await proofOfEfficiencyContract.globalExitRootMap(1));
  console.log(await proofOfEfficiencyContract.globalExitRootMap(2));
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });