require("dotenv").config();
const path = require("path");
const hre = require("hardhat");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const pathDeployOutputParameters = path.join(__dirname, "./deploy_output.json");
const deployOutputParameters = require(pathDeployOutputParameters);

async function main() {

  // load deployer account
  const signersArray = await ethers.getSigners();
  const deployer = signersArray[0];
  const networkIDMainnet = 0;

  if (typeof process.env.ETHERSCAN_API_KEY === "undefined") {
    throw new Error("Etherscan API KEY has not been defined");
  }

  // verify maticToken
  const maticTokenName = "Matic Token";
  const maticTokenSymbol = "MATIC";
  const maticTokenInitialBalance = ethers.utils.parseEther("20000000");
  try {
    // verify governance
    await hre.run("verify:verify",
      {
        address: deployOutputParameters.maticTokenAddress,
        constructorArguments: [
          maticTokenName,
          maticTokenSymbol,
          deployOutputParameters.deployerAddress,
          maticTokenInitialBalance,
        ]
      }
    );
  } catch (error) {
    expect(error.message.toLowerCase().includes("already verified")).to.be.equal(true);
  }

  // verify verifierMock
  try {
    await hre.run("verify:verify",
      {
        address: deployOutputParameters.verifierAddress
      }
    );
  } catch (error) {
    expect(error.message.toLowerCase().includes("already verified")).to.be.equal(true);
  }

  // verify bridge
  try {
    // verify governance
    await hre.run("verify:verify",
      {
        address: deployOutputParameters.bridgeAddress,
        constructorArguments: [
          networkIDMainnet,
          deployOutputParameters.globalExitRootManagerAddress
        ]
      }
    );
  } catch (error) {
    console.log(error.message)
    expect(error.message.toLowerCase().includes("already verified")).to.be.equal(true);
  }

  // verify PoE
  try {
    // verify governance
    await hre.run("verify:verify",
      {
        address: deployOutputParameters.proofOfEfficiencyAddress,
        constructorArguments: [
          deployOutputParameters.globalExitRootManagerAddress,
          deployOutputParameters.maticTokenAddress,
          deployOutputParameters.verifierAddress,
          deployOutputParameters.genesisRoot,
          deployOutputParameters.trustedSequencer,
          deployOutputParameters.forceBatchAllowed,
        ]
      }
    );
  } catch (error) {
    expect(error.message.toLowerCase().includes("already verified")).to.be.equal(true);
  }

    // verify GlobalExtiRootManager
    try {
      // verify governance
      await hre.run("verify:verify",
        {
          address: deployOutputParameters.globalExitRootManagerAddress,
          constructorArguments: [
            deployOutputParameters.proofOfEfficiencyAddress,
            deployOutputParameters.bridgeAddress
          ]
        }
      );
    } catch (error) {
      expect(error.message.toLowerCase().includes("already verified")).to.be.equal(true);
    }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

