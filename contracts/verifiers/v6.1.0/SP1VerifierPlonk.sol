// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ISP1Verifier, ISP1VerifierWithHash} from "../../interfaces/ISP1Verifier.sol";
import {PlonkVerifier} from "./PlonkVerifier.sol";

/// @title SP1 Verifier
/// @author Succinct Labs
/// @notice This contracts implements a solidity verifier for SP1.
contract SP1VerifierPlonk is PlonkVerifier, ISP1VerifierWithHash {
    /// @notice Thrown when the verifier selector from this proof does not match the one in this
    /// verifier. This indicates that this proof was sent to the wrong verifier.
    /// @param received The verifier selector from the first 4 bytes of the proof.
    /// @param expected The verifier selector from the first 4 bytes of the VERIFIER_HASH().
    error WrongVerifierSelector(bytes4 received, bytes4 expected);

    /// @notice Thrown when the exit code is invalid.
    error InvalidExitCode();

    /// @notice Thrown when the proof is invalid.
    error InvalidProof();

    /// @notice Thrown when the vkRoot is invalid.
    error InvalidVkRoot();

    /// @notice The version of the circuit.
    function VERSION() external pure returns (string memory) {
        return "v6.1.0";
    }

    /// @inheritdoc ISP1VerifierWithHash
    function VERIFIER_HASH() public pure returns (bytes32) {
        return
            0x5a093a2fcb46394f5cadfe55c44d4d572fad9cec7aeb38026b0278322ef07fac;
    }

    /// @notice The recursion vk root.
    function VK_ROOT() public pure returns (bytes32) {
        return
            0x002f850ee998974d6cc00e50cd0814b098c05bfade466d28573240d057f25352;
    }

    /// @notice Hashes the public values to a field elements inside Bn254.
    /// @param publicValues The public values.
    function hashPublicValues(
        bytes calldata publicValues
    ) public pure returns (bytes32) {
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

        uint256 expectedVkRoot = uint256(VK_ROOT());

        bytes32 publicValuesDigest = hashPublicValues(publicValues);
        uint256 exitCode = uint256(bytes32(proofBytes[4:36]));
        uint256 vkRoot = uint256(bytes32(proofBytes[36:68]));
        uint256 nonce = uint256(bytes32(proofBytes[68:100]));

        uint256[] memory inputs = new uint256[](5);
        inputs[0] = uint256(programVKey);
        inputs[1] = uint256(publicValuesDigest);
        inputs[2] = exitCode;
        inputs[3] = vkRoot;
        inputs[4] = nonce;
        if (exitCode != 0) {
            revert InvalidExitCode();
        }
        if (vkRoot != expectedVkRoot) {
            revert InvalidVkRoot();
        }
        bool success = this.Verify(proofBytes[100:], inputs);
        if (!success) {
            revert InvalidProof();
        }
    }
}
