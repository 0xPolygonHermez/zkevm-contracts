// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;

import "../interfaces/ISP1Verifier.sol";

contract PPVerifierRollupHelperMock is ISP1Verifier {
    function verifyProof(
        bytes32 programVKey,
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external view {

    }
}
