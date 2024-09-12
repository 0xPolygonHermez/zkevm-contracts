// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ISP1Verifier, ISP1VerifierWithHash} from "../v2/interfaces/ISP1Verifier.sol";
import {PlonkVerifier} from "./PlonkVerifier.sol";


// Current deployments: https://github.com/succinctlabs/sp1-contracts/tree/main/contracts/deployments
// Local deployments should deploy this contract. Any existing chain should use already deployed contracts by SP1

/// @title SP1 Verifier
/// @author Succinct Labs
/// @notice This contracts implements a solidity verifier for SP1.
contract SP1Verifier is PlonkVerifier, ISP1VerifierWithHash {
    /// @notice Thrown when the verifier selector from this proof does not match the one in this
    /// verifier. This indicates that this proof was sent to the wrong verifier.
    /// @param received The verifier selector from the first 4 bytes of the proof.
    /// @param expected The verifier selector from the first 4 bytes of the VERIFIER_HASH().
    error WrongVerifierSelector(bytes4 received, bytes4 expected);

    /// @notice Thrown when the proof is invalid.
    error InvalidProof();

    function VERSION() external pure returns (string memory) {
        return "v2.0.0";
    }

    /// @inheritdoc ISP1VerifierWithHash
    function VERIFIER_HASH() public pure returns (bytes32) {
        return 0x4aca240a3e5296e6a565f98dc728c6f48f8de4792a8fa365038c3b86952176f5;
    }

    /// @notice Hashes the public values to a field elements inside Bn254.
    /// @param publicValues The public values.
    function hashPublicValues(bytes calldata publicValues) public pure returns (bytes32) {
        return sha256(publicValues) & bytes32(uint256((1 << 253) - 1));
    }

    /// @notice Verifies a proof with given public values and vkey.
    /// @param programVKey The verification key for the RISC-V program.
    /// @param publicValues The public values encoded as bytes.
    /// @param proofBytes The proof of the program execution the SP1 zkVM encoded as bytes.
    function verifyProof(
        bytes32 programVKey,
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external view {
        bytes4 receivedSelector = bytes4(proofBytes[:4]);
        bytes4 expectedSelector = bytes4(VERIFIER_HASH());
        if (receivedSelector != expectedSelector) {
            revert WrongVerifierSelector(receivedSelector, expectedSelector);
        }

        bytes32 publicValuesDigest = hashPublicValues(publicValues);
        uint256[] memory inputs = new uint256[](2);
        inputs[0] = uint256(programVKey);
        inputs[1] = uint256(publicValuesDigest);
        bool success = this.Verify(proofBytes[4:], inputs);
        if (!success) {
            revert InvalidProof();
        }
    }
}