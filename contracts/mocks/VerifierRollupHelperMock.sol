// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;

import "../interfaces/IVerifierRollup.sol";

contract VerifierRollupHelperMock is IVerifierRollup {
    function verifyProof(
        bytes32[24] calldata proof,
        uint256[1] memory pubSignals
    ) public view override returns (bool) {
        return true;
    }
}
