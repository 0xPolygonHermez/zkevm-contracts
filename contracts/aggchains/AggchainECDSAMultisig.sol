// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "../lib/AggchainBase.sol";
import "../lib/MigrationFEPToECDSASlots.sol";

/**
 * @title AggchainECDSAMultisig
 * @notice Generic aggchain based on ECDSA multisig signature.
 * An array of addresses signs the new_ler and the commit_imported_bridge_exits in order to do state
 * transitions on the pessimistic trees (local_exit_tree, local_balance_tree, nullifier_tree & height).
 * The addresses and threshold are managed by the aggchainManager.
 */
contract AggchainECDSAMultisig is AggchainBase, MigrationFEPToECDSASlots {
    ////////////////////////////////////////////////////////////
    //                  Transient Storage                     //
    ////////////////////////////////////////////////////////////
    uint8 private transient _initializerVersion;

    ////////////////////////////////////////////////////////////
    //                  Constants & Immutables                //
    ////////////////////////////////////////////////////////////
    // Aggchain type selector, hardcoded value used to force the last 2 bytes of aggchain selector to retrieve the aggchain verification key
    bytes2 public constant AGGCHAIN_TYPE = 0x0000;

    /// @notice Aggchain version
    string public constant AGGCHAIN_ECDSA_MULTISIG_VERSION = "v1.0.1";

    ////////////////////////////////////////////////////////////
    //                         Errors                         //
    ////////////////////////////////////////////////////////////
    /// @notice Thrown when trying to initialize the wrong initialize function.
    error InvalidInitializer();

    /// @notice Thrown when calling a function that is not supported by this implementation.
    error FunctionNotSupported();

    ////////////////////////////////////////////////////////////
    //                         Events                         //
    ////////////////////////////////////////////////////////////
    /// @notice Emitted when pessimistic verification is completed.
    event OnVerifyPessimisticECDSAMultisig();

    ////////////////////////////////////////////////////////////
    //                        Modifiers                       //
    ////////////////////////////////////////////////////////////
    /// @dev Modifier to retrieve initializer version value previous on using the reinitializer modifier, its used in the initialize function.
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
     * @param _aggLayerGateway AgglayerGateway contract address.
     */
    constructor(
        IAgglayerGER _globalExitRootManager,
        IERC20Upgradeable _pol,
        IAgglayerBridge _bridgeAddress,
        AgglayerManager _rollupManager,
        IAgglayerGateway _aggLayerGateway
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
     * @notice Initialize the AggchainECDSAMultisig contract
     * @param _admin Admin address
     * @param _trustedSequencer Trusted sequencer address
     * @param _gasTokenAddress Gas token address
     * @param _trustedSequencerURL Trusted sequencer URL
     * @param _networkName Network name
     * @param _useDefaultSigners Whether to use default signers from gateway
     * @param _signersToAdd Array of signers to add
     * @param _newThreshold New threshold for multisig operations
     * @custom:security First initialization takes into account this contracts and all the inheritance contracts
     *                  This function can only be called when the contract is first deployed (version 0)
     * @dev The reinitializer(2) is set to support the upgrade from PolygonPessimisticConsensus to AggchainECDSAMultisig, where PolygonPessimisticConsensus is already initialized
     */
    function initialize(
        address _admin,
        address _trustedSequencer,
        address _gasTokenAddress,
        string memory _trustedSequencerURL,
        string memory _networkName,
        bool _useDefaultSigners,
        SignerInfo[] memory _signersToAdd,
        uint256 _newThreshold
    ) external onlyAggchainManager getInitializedVersion reinitializer(2) {
        if (_initializerVersion != 0) {
            revert InvalidInitializer();
        }

        // initOwnedAggchainVKey, initAggchainVKeySelector, and useDefaultVkeys are not used in this aggchain.
        _initializeAggchainBaseAndConsensusBase(
            _admin,
            _trustedSequencer,
            _gasTokenAddress,
            _trustedSequencerURL,
            _networkName,
            false, // useDefaultVkeys
            _useDefaultSigners,
            bytes32(0), // initOwnedAggchainVKey
            bytes4(0) // initAggchainVKeySelector
        );

        // Check the used default signers is consistent
        if (_useDefaultSigners) {
            if (_signersToAdd.length != 0 || threshold != 0) {
                revert ConflictingDefaultSignersConfiguration();
            }
        } else {
            // update signers and threshold
            _updateSignersAndThreshold(
                new RemoveSignerInfo[](0), // No signers to remove
                _signersToAdd,
                _newThreshold
            );
        }
    }

    /**
     * @notice Migrates from PolygonPessimisticConsensus or PolygonRollupBaseEtrog to AggchainECDSAMultisig
     * @dev This function is called when upgrading from a PolygonPessimisticConsensus contract.
     *      - Therefore the consensusBase is already initialized.
     *      - The AggchainBase is initialized using the values from the ConsensusBase.
     *      It sets up the initial multisig configuration using the existing admin and trustedSequencer,
     *      Sets the threshold to 1, and adds the trustedSequencer as the only signer.
     */
    function migrateFromLegacyConsensus()
        external
        onlyRollupManager
        getInitializedVersion
        reinitializer(2)
    {
        if (_initializerVersion != 1) {
            revert InvalidInitializer();
        }

        // aggchainManager
        aggchainManager = admin;

        // _initializeAggchainBase(
        //            _useDefaultVkeys, // false
        //            _useDefaultSigners, // false
        //            _initOwnedAggchainVKey, // not used
        //            _initAggchainVKeySelector // not used
        //        );

        // set signer to trustedSequencer and threshold to 1
        // handle trustedSequencerURL as empty string
        if (bytes(trustedSequencerURL).length == 0) {
            _addSignerInternal(trustedSequencer, "NO_URL"); // cannot be empty string
        } else {
            _addSignerInternal(trustedSequencer, trustedSequencerURL);
        }
        threshold = 1;

        // update aggchainMultisigHash
        _updateAggchainMultisigHash();
    }

    ////////////////////////////////////////////////////////////
    //                    Functions: pure                    //
    ////////////////////////////////////////////////////////////

    /// @notice Validates the provided aggchain data and returns the computed aggchain parameters and vkey
    /// @dev For ECDSA multisig, no data is needed as verification is done through signatures
    /// @param aggchainData custom bytes provided by the chain, encoded in ABI solidity format
    ///
    ///     aggchain_vkey: set to zero to skip verification in the PP
    ///     aggchain_params: set to zero to skip verification in the PP
    ///
    /// @return aggchainVKey Always returns bytes32(0) as ECDSA doesn't use verification keys
    /// @return aggchainParams Always returns bytes32(0) as ECDSA doesn't use verification
    /// @inheritdoc AggchainBase
    ///
    function getVKeyAndAggchainParams(
        bytes memory aggchainData
    ) public pure override returns (bytes32, bytes32) {
        if (aggchainData.length != 0) {
            revert InvalidAggchainDataLength();
        }

        // aggchainParams is not used in this implementation (signersHash and threshold are added directly in base)
        return (bytes32(0), bytes32(0));
    }

    /**
     * @notice Function to retrieve the current version of the contract.
     * @return version String representation of the contract version
     */
    function version() external pure returns (string memory) {
        return AGGCHAIN_ECDSA_MULTISIG_VERSION;
    }

    ////////////////////////////////////////////////////////////
    //               Functions: Callbacks                     //
    ////////////////////////////////////////////////////////////

    /**
     * @notice Callback when pessimistic proof is verified
     * @dev For ECDSA multisig, just validates empty data and emits event
     * @param aggchainData Must be empty for ECDSA implementation
     * @inheritdoc IAggchainBase
     */
    function onVerifyPessimistic(
        bytes calldata aggchainData
    ) external onlyRollupManager {
        if (aggchainData.length != 0) {
            revert InvalidAggchainDataLength();
        }

        // Only aggchainVKeySelector is provided (bytes4 ABI-encoded as 32 bytes), no need to decode anything
        // Just emit event to confirm verification
        emit OnVerifyPessimisticECDSAMultisig();
    }

    ////////////////////////////////////////////////////////////
    //                      Overrides                         //
    ////////////////////////////////////////////////////////////

    /**
     * @notice This function is not supported in ECDSA multisig implementation
     * @dev Overridden to prevent usage as ECDSA doesn't use verification keys
     * @custom:security Always reverts with FunctionNotSupported error
     */
    function enableUseDefaultVkeysFlag()
        external
        view
        override
        onlyAggchainManager
    {
        revert FunctionNotSupported();
    }

    /**
     * @notice This function is not supported in ECDSA multisig implementation
     * @dev Overridden to prevent usage as ECDSA doesn't use verification keys
     * @custom:security Always reverts with FunctionNotSupported error
     */
    function disableUseDefaultVkeysFlag()
        external
        view
        override
        onlyAggchainManager
    {
        revert FunctionNotSupported();
    }

    /**
     * @notice This function is not supported in ECDSA multisig implementation
     * @dev Overridden to prevent usage as ECDSA doesn't use verification keys
     * @custom:security Always reverts with FunctionNotSupported error
     */
    function addOwnedAggchainVKey(
        bytes4,
        bytes32
    ) external view override onlyAggchainManager {
        revert FunctionNotSupported();
    }

    /**
     * @notice This function is not supported in ECDSA multisig implementation
     * @dev Overridden to prevent usage as ECDSA doesn't use verification keys
     * @custom:security Always reverts with FunctionNotSupported error
     */
    function updateOwnedAggchainVKey(
        bytes4,
        bytes32
    ) external view override onlyAggchainManager {
        revert FunctionNotSupported();
    }

    /**
     * @notice Returns the aggchain verification key - always returns zero in ECDSA multisig
     * @dev Overridden to return bytes32(0) since verification keys are not used in ECDSA multisig
     * @return aggchainVKey Always returns bytes32(0) as ECDSA doesn't use verification keys
     */
    function getAggchainVKey(
        bytes4
    ) public pure override returns (bytes32 aggchainVKey) {
        // ECDSA multisig doesn't use vkeys, always return zero
        return bytes32(0);
    }
}
