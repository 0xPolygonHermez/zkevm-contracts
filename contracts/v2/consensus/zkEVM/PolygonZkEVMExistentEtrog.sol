// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "../../lib/PolygonRollupBaseEtrog.sol";

/**
 * Contract responsible for managing the states and the updates of L2 network.
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
 * The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
 * The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
 * To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.
 */
contract PolygonZkEVMExistentEtrog is PolygonRollupBaseEtrog {
    // Transaction that will be injected as a forced transaction, to setup the timestamp on the state root, we just need a well encoded RLP transaction
    // It's ok if the transaction is not processable
    /* Encoded transaction:
      {
        "from": "0x617b3a3528F9cDd6630fd3301B9c8911F7Bf063D",
        "to": "0x4d5Cf5032B2a844602278b01199ED191A86c93ff",
        "nonce": 42,
        "data": "0x",
        "value": "0",
        "gasLimit": 0,
        "gasPrice": "0",
        "chainId": 4242,
        "overwrite": {
          "v": "0x1b",
          "r": "0x00000000000000000000000000000000000000000000000000000005ca1ab1e0",
          "s": "0x00000000000000000000000000000000000000000000000000000005ca1ab1e0"
        }
      }
    */
    bytes public constant SET_UP_ETROG_TX =
        hex"df2a8080944d5cf5032b2a844602278b01199ed191a86c93ff8080821092808000000000000000000000000000000000000000000000000000000005ca1ab1e000000000000000000000000000000000000000000000000000000005ca1ab1e01bff";

    /**
     * @dev Emitted when the system is updated to a etrog using this contract, contain the set up etrog transaction
     */
    event UpdateEtrogSequence(
        uint64 numBatch,
        bytes transactions,
        bytes32 lastGlobalExitRoot,
        address sequencer
    );

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
        bytes32 _lastAccInputHash
    ) external onlyRollupManager initializer {
        // Set up etrog Tx
        bytes memory transaction = SET_UP_ETROG_TX;
        bytes32 currentTransactionsHash = keccak256(transaction);

        // Get current timestamp and global exit root
        uint64 currentTimestamp = uint64(block.timestamp);
        bytes32 lastGlobalExitRoot = globalExitRootManager
            .getLastGlobalExitRoot();

        // Add the transaction to the sequence as if it was a force transaction
        bytes32 newAccInputHash = keccak256(
            abi.encodePacked(
                _lastAccInputHash, // Last acc Input hash
                currentTransactionsHash,
                lastGlobalExitRoot, // Global exit root
                currentTimestamp,
                _trustedSequencer,
                blockhash(block.number - 1)
            )
        );

        // Set acumulated input hash
        lastAccInputHash = newAccInputHash;

        uint64 currentBatchSequenced = rollupManager.onSequenceBatches(
            uint64(1), // num total batches
            newAccInputHash
        );

        // Set zkEVM variables
        admin = _admin;
        trustedSequencer = _trustedSequencer;

        trustedSequencerURL = _trustedSequencerURL;
        networkName = _networkName;

        forceBatchAddress = _admin;

        // Constant variables
        forceBatchTimeout = 5 days;

        // Both gasTokenAddress and gasTokenNetwork are 0, since it uses ether as gas token
        // Therefore is not necessary to set the variables

        emit UpdateEtrogSequence(
            currentBatchSequenced,
            transaction,
            lastGlobalExitRoot,
            _trustedSequencer
        );
    }
}
