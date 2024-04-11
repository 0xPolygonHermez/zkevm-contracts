// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.24;

import "../verifiers/FflonkVerifier.sol";

contract TestnetMockVerifier is FflonkVerifier {
    function verifyProof(
        bytes32[24] calldata proof,
        uint256[1] calldata pubSignals
    ) public view override returns (bool) {
        if (block.chainid != 11155111) {
            return false;
        } else {
            if (proof[0] == bytes32(type(uint256).max)) {
                return true;
            } else {
                super.verifyProof(proof, pubSignals);
            }
        }
    }
}
