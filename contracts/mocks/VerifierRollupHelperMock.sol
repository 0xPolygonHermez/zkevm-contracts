// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;

import "../interfaces/IVerifierRollup.sol";
import "../v2/interfaces/ISP1Verifier.sol";

contract VerifierRollupHelperMock is IVerifierRollup, ISP1Verifier {
    function verifyProof(
        bytes32[24] calldata proof,
        uint256[1] memory pubSignals
    ) public pure override returns (bool) {
        return true;
    }

    // SP1 interface
    function verifyProof(
        bytes32 programVKey,
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) public pure {}
}
