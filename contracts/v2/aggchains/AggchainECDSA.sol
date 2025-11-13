// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "../lib/AggchainBase.sol";

/**
 * @title AggchainECDSA
 * @notice Generic aggchain based on ECDSA signature.
 * An address signs the new_ler and the commit_imported_bridge_exits in order to do state
 * transitions on the pessimistic trees (local_exit_tree, local_balance_tree, nullifier_tree & height).
 * That address is the trustedSequencer and is set during the chain initialization.
 */
contract AggchainECDSA is AggchainBase {
    ////////////////////////////////////////////////////////////
    //                  Transient Storage                     //
    ////////////////////////////////////////////////////////////
    uint8 private transient _initializerVersion;

    ////////////////////////////////////////////////////////////
    //                  Constants & Immutables                //
    ////////////////////////////////////////////////////////////
    // Aggchain type selector, hardcoded value used to force the last 2 bytes of aggchain selector to retrieve  the aggchain verification key
    bytes2 public constant AGGCHAIN_TYPE = 0;

    ////////////////////////////////////////////////////////////
    //                       Events                           //
    ////////////////////////////////////////////////////////////
    /**
     * @notice Emitted when Pessimistic proof is verified.
     * @param newStateRoot New state root after processing state transition.
     */
    event OnVerifyPessimisticECDSA(bytes32 newStateRoot);

    ////////////////////////////////////////////////////////////
    //                         Errors                         //
    ////////////////////////////////////////////////////////////
    /// @notice Thrown when trying to initialize the wrong initialize function.
    error InvalidInitializer();

    ////////////////////////////////////////////////////////////
    //                        Modifiers                       //
    ////////////////////////////////////////////////////////////
    // @dev Modifier to retrieve initializer version value previous on using the reinitializer modifier, its used in the initialize function.
    modifier getInitializedVersion() {
        // Get initializer version from OZ initializer smart contract
        _initializerVersion = _getInitializedVersion();
        _;
    }

    ////////////////////////////////////////////////////////////
    //                       Constructor                      //
    ////////////////////////////////////////////////////////////
    /**
     * @param _globalExitRootManager Global exit root manager address.
     * @param _pol POL token contract address.
     * @param _bridgeAddress Bridge contract address.
     * @param _rollupManager Rollup manager contract address.
     * @param _aggLayerGateway AggLayerGateway contract address.
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager,
        IAggLayerGateway _aggLayerGateway
    )
        AggchainBase(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager,
            _aggLayerGateway
        )
    {}

    ////////////////////////////////////////////////////////////
    //              Functions: initialization                 //
    ////////////////////////////////////////////////////////////
    /**
     * @param initializeBytesAggchain Encoded bytes to initialize the chain.
     * Each aggchain has its decoded params.
     * @custom:security First initialization takes into account this contracts and all the inheritance contracts
     *                  Second initialization does not initialize PolygonConsensusBase parameters
     *                  Second initialization can happen if a chain is upgraded from a PolygonPessimisticConsensus
     * @dev The reinitializer(2) is set to support the upgrade from PolygonPessimisticConsensus to AggchainECDSA, where PolygonPessimisticConsensus is already initialized
     */
    function initialize(
        bytes memory initializeBytesAggchain
    ) external onlyAggchainManager getInitializedVersion reinitializer(2) {
        // If initializer version is 0, it means that the chain is being initialized for the first time, so the contract has just been deployed, is not an upgrade
        if (_initializerVersion == 0) {
            // custom parsing of the initializeBytesAggchain
            (
                // aggchainBase params
                bool _useDefaultGateway,
                bytes32 _initOwnedAggchainVKey,
                bytes4 _initAggchainVKeySelector,
                address _vKeyManager,
                // PolygonConsensusBase params
                address _admin,
                address _trustedSequencer,
                address _gasTokenAddress,
                string memory _trustedSequencerURL,
                string memory _networkName
            ) = abi.decode(
                    initializeBytesAggchain,
                    (
                        bool,
                        bytes32,
                        bytes4,
                        address,
                        address,
                        address,
                        address,
                        string,
                        string
                    )
                );

            // Check the aggchainType embedded the _initAggchainVKeySelector is valid
            if (
                getAggchainTypeFromSelector(_initAggchainVKeySelector) !=
                AGGCHAIN_TYPE
            ) {
                revert InvalidAggchainType();
            }

            // Set aggchainBase variables
            _initializeAggchainBaseAndConsensusBase(
                _admin,
                _trustedSequencer,
                _gasTokenAddress,
                _trustedSequencerURL,
                _networkName,
                _useDefaultGateway,
                _initOwnedAggchainVKey,
                _initAggchainVKeySelector,
                _vKeyManager
            );
        } else if (_initializerVersion == 1) {
            // Only need to initialize values that are specific for ECDSA because we are performing an upgrade from a Pessimistic chain
            // aggchainBase params
            (
                bool _useDefaultGateway,
                bytes32 _initOwnedAggchainVKey,
                bytes4 _initAggchainVKeySelector,
                address _vKeyManager
            ) = abi.decode(
                    initializeBytesAggchain,
                    (bool, bytes32, bytes4, address)
                );

            // Check the aggchainType embedded the _initAggchainVKeySelector is valid

            if (
                getAggchainTypeFromSelector(_initAggchainVKeySelector) !=
                AGGCHAIN_TYPE
            ) {
                revert InvalidAggchainType();
            }

            // Set aggchainBase variables
            _initializeAggchainBase(
                _useDefaultGateway,
                _initOwnedAggchainVKey,
                _initAggchainVKeySelector,
                _vKeyManager
            );
        } else {
            // This case should never happen because reinitializer is 2 so initializer version is 0 or 1, but it's here to avoid any possible future issue if the reinitializer version is increased
            revert InvalidInitializer();
        }
    }

    ////////////////////////////////////////////////////////////
    //                    Functions: views                    //
    ////////////////////////////////////////////////////////////
    /**
     * @notice Callback while pessimistic proof is being verified from the rollup manager
     * @dev Return the necessary aggchain information for the proof hashed
     * AggchainHash:
     * Field:           | AGGCHAIN_TYPE | aggchainVKey   | aggchainParams |
     * length (bits):   | 32            | 256            | 256            |
     *
     * aggchainParams = keccak256(abi.encodePacked(trusted_sequencer))
     * @param aggchainData custom bytes provided by the chain
     * @return aggchainHash resulting aggchain hash
     */
    /// @inheritdoc IAggchainBase
    function getAggchainHash(
        bytes memory aggchainData
    ) external view returns (bytes32) {
        if (aggchainData.length != 32 * 2) {
            revert InvalidAggchainDataLength();
        }

        // The second param is the new state root used at onVerifyPessimistic callback but now only aggchainVKeySelector is required
        (bytes4 aggchainVKeySelector, ) = abi.decode(
            aggchainData,
            (bytes4, bytes32)
        );

        if (
            getAggchainTypeFromSelector(aggchainVKeySelector) != AGGCHAIN_TYPE
        ) {
            revert InvalidAggchainType();
        }

        return
            keccak256(
                abi.encodePacked(
                    CONSENSUS_TYPE,
                    getAggchainVKey(aggchainVKeySelector),
                    keccak256(abi.encodePacked(trustedSequencer))
                )
            );
    }

    ////////////////////////////////////////////////////////////
    //                       Functions                        //
    ////////////////////////////////////////////////////////////

    /// @inheritdoc IAggchainBase
    function onVerifyPessimistic(
        bytes calldata aggchainData
    ) external onlyRollupManager {
        if (aggchainData.length != 32 * 2) {
            revert InvalidAggchainDataLength();
        }

        (, bytes32 newStateRoot) = abi.decode(aggchainData, (bytes4, bytes32));

        // Emit event
        emit OnVerifyPessimisticECDSA(newStateRoot);
    }
}
