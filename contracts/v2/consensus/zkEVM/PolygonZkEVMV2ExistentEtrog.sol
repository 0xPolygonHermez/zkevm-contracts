// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.20;

import "../../lib/PolygonRollupBaseEtrog.sol";

/**
 * Contract responsible for managing the states and the updates of L2 network.
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
 * The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
 * The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
 * To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.
 */
contract PolygonZkEVMV2ExistentEtrog is PolygonRollupBaseEtrog {
    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _pol POL token address
     * @param _bridgeAddress Bridge address
     * @param _rollupManager Global exit root manager address
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager
    )
        PolygonRollupBaseEtrog(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager
        )
    {}

    /**
     * note This initializer will be called instead of the PolygonRollupBase
     * This is a especial initializer since the zkEVM it's an already created network
     * @param _admin Admin address
     * @param _trustedSequencer Trusted sequencer address
     * @param _trustedSequencerURL Trusted sequencer URL
     * @param _networkName L2 network name
     * @param _lastAccInputHash Acc input hash
     */
    function initializeUpgrade(
        address _admin,
        address _trustedSequencer,
        string memory _trustedSequencerURL,
        string memory _networkName,
        bytes32 _lastAccInputHash,
        uint64 /*_lastTimestamp*/ // review
    ) external onlyRollupManager initializer {
        admin = _admin;
        trustedSequencer = _trustedSequencer;

        trustedSequencerURL = _trustedSequencerURL;
        networkName = _networkName;

        forceBatchAddress = _admin;

        // zkEVM Upgraded variables
        lastAccInputHash = _lastAccInputHash;

        // Constant deployment variables
        forceBatchTimeout = 5 days;

        // Both gasTokenAddress and gasTokenNetwork are 0, since it uses ether as gas token
        // Therefore is not necessary to set the variables
    }
}
