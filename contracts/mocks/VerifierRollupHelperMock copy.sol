// // SPDX-License-Identifier: AGPL-3.0

// pragma solidity 0.8.20;

// import "../interfaces/IVerifierRollup.sol";
// import "../verifiers/FflonkVerifier.sol";
// import "@openzeppelin/contracts/access/Ownable.sol";

// contract VerifierRollupHelperMock is FflonkVerifier, Ownable {
//     bool public realVerifier;

//     function verifyProof(
//         bytes32[24] calldata proof,
//         uint256[1] calldata pubSignals
//     ) public pure override returns (bool) {
//         if (realVerifier == true) {
//             return super.verifyProof(proof, pubSignals);
//         } else {
//             return true;
//         }
//     }

//     function switchRealVerifier() public onlyOwner {
//         realVerifier = !realVerifier;
//     }
// }
