// WARNING!! DO NOT USE THIS CODE, the PoE is still private, we shouldn't verify in etherscan

// require("dotenv").config();
// const path = require("path");
// const hre = require("hardhat");
// const { expect } = require("chai");
// const { ethers } = require("hardhat");

// const pathDeployOutputParameters = path.join(__dirname, "./deploy_output.json");
// const deployOutputParameters = require(pathDeployOutputParameters);

// async function main() {

//   // load deployer account
//   const signersArray = await ethers.getSigners();
//   const deployer = signersArray[0];
//   const deployerAddress = await deployer.getAddress();

//   if (typeof process.env.ETHERSCAN_API_KEY === "undefined") {
//     throw new Error("Etherscan API KEY has not been defined");
//   }

//   // verify maticToken
//   const maticTokenName = "Matic Token";
//   const maticTokenSymbol = "MATIC";
//   const maticTokenInitialBalance = ethers.utils.parseEther("20000000");
//   try {
//     // verify governance
//     await hre.run("verify:verify",
//       {
//         address: deployOutputParameters.maticTokenAddress,
//         constructorArguments: [
//           maticTokenName,
//           maticTokenSymbol,
//           deployOutputParameters.deployerAddress,
//           maticTokenInitialBalance,
//         ]
//       }
//     );
//   } catch (error) {
//     expect(error.message).to.be.equal("Contract source code already verified");
//   }

//   // verify verifierMock
//   try {
//     await hre.run("verify:verify",
//       {
//         address: deployOutputParameters.verifierMockAddress
//       }
//     );
//   } catch (error) {
//     expect(error.message).to.be.equal("Contract source code already verified");
//   }

//   // verify bridge
//   try {
//     // verify governance
//     await hre.run("verify:verify",
//       {
//         address: deployOutputParameters.bridgeAddress,
//         constructorArguments: [
//           deployOutputParameters.proofOfEfficiencyAddress
//         ]
//       }
//     );
//   } catch (error) {
//     expect(error.message).to.be.equal("Contract source code already verified");
//   }

//   // verify PoE
//   try {
//     // verify governance
//     await hre.run("verify:verify",
//       {
//         address: deployOutputParameters.proofOfEfficiencyAddress,
//         constructorArguments: [
//           deployOutputParameters.bridgeAddress,
//           deployOutputParameters.maticTokenAddress,
//           deployOutputParameters.verifierMockAddress
//         ]
//       }
//     );
//   } catch (error) {
//     expect(error.message).to.be.equal("Contract source code already verified");
//   }
// }

// main()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });

