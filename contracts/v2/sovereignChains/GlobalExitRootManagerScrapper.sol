// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;

interface IPolygonZkEVMGlobalExitRootV2 {
    function globalExitRootMap(
        bytes32 globalExitRootNum
    ) external returns (uint256);
}

/**
 * Contract responsible for managing the exit roots for the Sovereign chains and global exit roots
 */
contract GlobalExitRootManagerScrapper {
    /**
     * @param globalExitRootContract Global exit root contract address
     * @param globalExitRoots Global exit roots contract address
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 globalExitRootContract,
        bytes32[] memory globalExitRoots
    ) {
        for (uint256 i = 0; i < globalExitRoots.length; i++) {
            if (
                globalExitRootContract.globalExitRootMap(globalExitRoots[i]) ==
                0
            ) {
                assembly {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
        }
        assembly {
            mstore(0, 1)
            return(0, 0x20)
        }
    }
}
