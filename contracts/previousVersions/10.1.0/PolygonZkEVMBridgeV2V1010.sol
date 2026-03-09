// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import "../../lib/DepositContractV2.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/IBaseLegacyAgglayerGER.sol";
import "../../interfaces/IBridgeMessageReceiver.sol";
import "./IPolygonZkEVMBridgeV2V1010.sol";
import "../../lib/EmergencyManager.sol";
import "../../lib/GlobalExitRootLib.sol";
import "../../lib/BytecodeStorer.sol";
import {ITokenWrappedBridgeUpgradeable, TokenWrappedBridgeUpgradeable, IERC20Metadata} from "../../lib/TokenWrappedBridgeUpgradeable.sol";
import {ERC1967Utils} from "@openzeppelin/contracts5/proxy/ERC1967/ERC1967Utils.sol";
import {IProxyAdmin} from "../../interfaces/IProxyAdmin.sol";

/**
 * PolygonZkEVMBridge that will be deployed on Ethereum and all Polygon rollups
 * Contract responsible to manage the token interactions with other networks
 */
contract PolygonZkEVMBridgeV2V1010 is
    DepositContractV2,
    EmergencyManager,
    IPolygonZkEVMBridgeV2V1010
{
    using SafeERC20 for ITokenWrappedBridgeUpgradeable;

    // Wrapped Token information struct
    struct TokenInformation {
        uint32 originNetwork;
        address originTokenAddress;
    }

    // Address of the contract that contains the bytecode to deploy wrapped tokens, upgradeable tokens and the code of the transparent proxy
    /// @dev the constant has been exported to a separate contract to improve this bytecode length.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IBytecodeStorer public immutable wrappedTokenBytecodeStorer;

    /// Address of the wrappedToken implementation, it is set at constructor and all proxied wrapped tokens will point to this implementation
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address internal immutable wrappedTokenBridgeImplementation;

    // bytes4(keccak256(bytes("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)")));
    bytes4 internal constant _PERMIT_SIGNATURE = 0xd505accf;

    // bytes4(keccak256(bytes("permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)")));
    bytes4 internal constant _PERMIT_SIGNATURE_DAI = 0x8fcbaf0c;

    // Mainnet identifier
    uint32 internal constant _MAINNET_NETWORK_ID = 0;

    // ZkEVM identifier
    uint32 private constant _ZKEVM_NETWORK_ID = 1;

    // Leaf type asset
    uint8 internal constant _LEAF_TYPE_ASSET = 0;

    // Leaf type message
    uint8 internal constant _LEAF_TYPE_MESSAGE = 1;

    // Nullifier offset
    uint256 internal constant _MAX_LEAFS_PER_NETWORK = 2 ** 32;

    // Indicate where's the mainnet flag bit in the global index
    uint256 internal constant _GLOBAL_INDEX_MAINNET_FLAG = 2 ** 64;

    // Current bridge version
    string public constant BRIDGE_VERSION = "v1.0.0";

    // Network identifier
    uint32 public networkID;

    // Global Exit Root address
    IBaseLegacyAgglayerGER public globalExitRootManager;

    // Last updated deposit count to the global exit root manager
    uint32 public lastUpdatedDepositCount;

    // Leaf index --> claimed bit map
    mapping(uint256 => uint256) public claimedBitMap;

    // keccak256(OriginNetwork || tokenAddress) --> Wrapped token address
    mapping(bytes32 => address) public tokenInfoToWrappedToken;

    // Wrapped token Address --> Origin token information
    mapping(address => TokenInformation) public wrappedTokenToTokenInfo;

    // Rollup manager address, previously PolygonZkEVM
    /// @custom:oz-renamed-from polygonZkEVMaddress
    address public polygonRollupManager;

    // Native address
    address public gasTokenAddress;

    // Native address
    uint32 public gasTokenNetwork;

    // Gas token metadata
    bytes public gasTokenMetadata;

    // WETH address
    // @note WETH address will only be present  when the native token is not ether, but another gasToken.
    // This variable is set at the initialization of the contract in case there's a gas token different than ether, (gasTokenAddress != address(0) ) so a new wrapped Token will be deployed to handle ether that came from other networks
    ITokenWrappedBridgeUpgradeable public WETHToken;

    // Address of the proxied tokens manager, is the admin of proxied wrapped tokens
    address public proxiedTokensManager;

    //  This account will be able to accept the proxiedTokensManager role
    address public pendingProxiedTokensManager;

    // @notice Value to detect if the contract has been initialized previously.
    ///         This mechanism is used to properly select the initializer
    uint8 internal _initializerVersion;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[48] private __gap;

    /**
     * @dev Emitted when bridge assets or messages to another network
     */
    event BridgeEvent(
        uint8 leafType,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes metadata,
        uint32 depositCount
    );

    /**
     * @dev Emitted when a claim is done from another network
     */
    event ClaimEvent(
        uint256 globalIndex,
        uint32 originNetwork,
        address originAddress,
        address destinationAddress,
        uint256 amount
    );

    /**
     * @dev Emitted when a new wrapped token is created
     */
    event NewWrappedToken(
        uint32 originNetwork,
        address originTokenAddress,
        address wrappedTokenAddress,
        bytes metadata
    );

    /**
     * @notice Emitted when the pending ProxiedTokensManager accepts the ProxiedTokensManager role.
     * @param oldProxiedTokensManager The previous ProxiedTokensManager.
     * @param newProxiedTokensManager The new ProxiedTokensManager.
     */
    event AcceptProxiedTokensManagerRole(
        address oldProxiedTokensManager,
        address newProxiedTokensManager
    );

    /**
     * @notice Emitted when the proxiedTokensManager starts the two-step transfer role setting a new pending proxiedTokensManager.
     * @param currentProxiedTokensManager The current proxiedTokensManager.
     * @param newProxiedTokensManager The new pending proxiedTokensManager.
     */
    event TransferProxiedTokensManagerRole(
        address currentProxiedTokensManager,
        address newProxiedTokensManager
    );

    /// @dev Modifier to retrieve initializer version value previous on using the reinitializer modifier, its used in the initialize function.
    modifier getInitializedVersion() {
        _initializerVersion = _getInitializedVersion();
        _;
        /// @dev Is set to zero always after usage for transient storage mimic and better gas optimization
        _initializerVersion = 0;
    }

    constructor() {
        // Deploy the wrapped token contract
        /// @dev this contract is used to store the bytecode of the wrapped token contract, previously stored in the bridge contract but moved to a separate contract to reduce the bytecode size.
        wrappedTokenBytecodeStorer = new BytecodeStorer();

        // Deploy the implementation of the wrapped token contract
        /// @dev its the address where proxy wrapped tokens with deterministic address will point
        wrappedTokenBridgeImplementation = address(
            new TokenWrappedBridgeUpgradeable()
        );
        // Disable initializers on the implementation following the best practices
        _disableInitializers();
    }

    /**
     * @param _networkID networkID
     * @param _gasTokenAddress gas token address
     * @param _gasTokenNetwork gas token network
     * @param _globalExitRootManager global exit root manager address
     * @param _polygonRollupManager polygonZkEVM address
     * @notice The value of `_polygonRollupManager` on the L2 deployment of the contract will be address(0), so
     * emergency state is not possible for the L2 deployment of the bridge, intentionally
     * @param _gasTokenMetadata Abi encoded gas token metadata
     */
    function initialize(
        uint32 _networkID,
        address _gasTokenAddress,
        uint32 _gasTokenNetwork,
        IBaseLegacyAgglayerGER _globalExitRootManager,
        address _polygonRollupManager,
        bytes memory _gasTokenMetadata
    ) external virtual getInitializedVersion reinitializer(2) {
        if (_initializerVersion != 0) {
            revert InvalidInitializeFunction();
        }

        // Set PolygonTimelock contract address as proxied tokens manager, the owner of current proxy contract
        _setProxiedTokensManagerFromProxy();

        networkID = _networkID;
        globalExitRootManager = _globalExitRootManager;
        polygonRollupManager = _polygonRollupManager;

        // Set gas token
        if (_gasTokenAddress == address(0)) {
            // Gas token will be ether
            if (_gasTokenNetwork != 0) {
                revert GasTokenNetworkMustBeZeroOnEther();
            }
            // WETHToken, gasTokenAddress and gasTokenNetwork will be 0
            // gasTokenMetadata will be empty
        } else {
            // Gas token will be an erc20
            gasTokenAddress = _gasTokenAddress;
            gasTokenNetwork = _gasTokenNetwork;
            gasTokenMetadata = _gasTokenMetadata;

            // Create a wrapped token for WETH, with salt == 0
            WETHToken = _deployWrappedToken(
                0, // salt
                abi.encode("Wrapped Ether", "WETH", 18)
            );
        }

        // Initialize OZ contracts
        __ReentrancyGuard_init();
    }

    /**
     * @notice initializer to set PolygonTimelock as proxiedTokensManager
     */
    function initialize()
        public
        virtual
        getInitializedVersion
        reinitializer(2)
    {
        if (_initializerVersion == 0) {
            revert InvalidInitializeFunction();
        }

        // Set PolygonTimelock contract address as proxied tokens manager, the owner of current proxy contract
        _setProxiedTokensManagerFromProxy();
    }

    modifier onlyRollupManager() {
        if (polygonRollupManager != msg.sender) {
            revert OnlyRollupManager();
        }
        _;
    }

    /**
     * @notice Set PolygonTimelock contract address as proxied tokens manager, the owner of current proxy contract
     */
    function _setProxiedTokensManagerFromProxy() private {
        // Retrieve proxyAdmin from current proxy contract
        address proxyAdmin = ERC1967Utils.getAdmin();

        // Retrieve owner from proxyAdmin and set it as proxiedTokensManager
        proxiedTokensManager = IProxyAdmin(proxyAdmin).owner();

        require(
            proxiedTokensManager != address(0),
            InvalidZeroProxyAdminOwner(proxyAdmin)
        );

        emit AcceptProxiedTokensManagerRole(address(0), proxiedTokensManager);
    }

    /**
     * @notice Deposit add a new leaf to the merkle tree
     * note If this function is called with a reentrant token, it would be possible to `claimTokens` in the same call
     * Reducing the supply of tokens on this contract, and actually locking tokens in the contract.
     * Therefore we recommend to third parties bridges that if they do implement reentrant call of `beforeTransfer` of some reentrant tokens
     * do not call any external address in that case
     * note User/UI must be aware of the existing/available networks when choosing the destination network
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount Amount of tokens
     * @param token Token address, 0 address is reserved for gas token address. If WETH address is zero, means this gas token is ether, else means is a custom erc20 gas token
     * @param forceUpdateGlobalExitRoot Indicates if the new global exit root is updated or not
     * @param permitData Raw data of the call `permit` of the token
     */
    function bridgeAsset(
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        address token,
        bool forceUpdateGlobalExitRoot,
        bytes calldata permitData
    ) public payable virtual ifNotEmergencyState nonReentrant {
        if (destinationNetwork == networkID) {
            revert DestinationNetworkInvalid();
        }

        address originTokenAddress;
        uint32 originNetwork;
        bytes memory metadata;
        uint256 leafAmount = amount;

        if (token == address(0)) {
            // Check gas token transfer
            if (msg.value != amount) {
                revert AmountDoesNotMatchMsgValue();
            }

            // Set gas token parameters
            originNetwork = gasTokenNetwork;
            originTokenAddress = gasTokenAddress;
            metadata = gasTokenMetadata;
        } else {
            // Check msg.value is 0 if tokens are bridged
            if (msg.value != 0) {
                revert MsgValueNotZero();
            }
            // Use permit if any
            if (permitData.length != 0) {
                _permit(token, permitData);
            }
            // Check if it's WETH, this only applies on L2 networks with gasTokens
            // In case ether is the native token, WETHToken will be 0, and the address 0 is already checked
            if (token == address(WETHToken)) {
                // Burn tokens
                /// @dev in case this function is called from a sovereign bridge that has remapped wethToken with a non-standard token,
                /// we have to add to the leaf the amount received to the bridge, not the amount sent
                leafAmount = _bridgeWrappedAsset(
                    ITokenWrappedBridgeUpgradeable(token),
                    amount
                );

                // Both origin network and originTokenAddress will be 0
                // Metadata will be empty
            } else {
                TokenInformation memory tokenInfo = wrappedTokenToTokenInfo[
                    token
                ];

                if (
                    tokenInfo.originTokenAddress != address(0) ||
                    tokenInfo.originNetwork != _MAINNET_NETWORK_ID
                ) {
                    // The token is a wrapped token from another network
                    /// @dev in case this function is called from a sovereign bridge that has remapped the token with a non-standard token,
                    /// we have to add to the leaf the amount received to the bridge, not the amount sent
                    leafAmount = _bridgeWrappedAsset(
                        ITokenWrappedBridgeUpgradeable(token),
                        amount
                    );

                    originTokenAddress = tokenInfo.originTokenAddress;
                    originNetwork = tokenInfo.originNetwork;
                } else {
                    // In order to support fee tokens check the amount received, not the transferred
                    uint256 balanceBefore = ITokenWrappedBridgeUpgradeable(
                        token
                    ).balanceOf(address(this));
                    ITokenWrappedBridgeUpgradeable(token).safeTransferFrom(
                        msg.sender,
                        address(this),
                        amount
                    );
                    uint256 balanceAfter = ITokenWrappedBridgeUpgradeable(token)
                        .balanceOf(address(this));

                    // Override leafAmount with the received amount
                    leafAmount = balanceAfter - balanceBefore;

                    originTokenAddress = token;
                    originNetwork = networkID;
                }
                // Encode metadata
                metadata = getTokenMetadata(token);
            }
        }

        emit BridgeEvent(
            _LEAF_TYPE_ASSET,
            originNetwork,
            originTokenAddress,
            destinationNetwork,
            destinationAddress,
            leafAmount,
            metadata,
            uint32(depositCount)
        );

        _addLeafBridge(
            _LEAF_TYPE_ASSET,
            originNetwork,
            originTokenAddress,
            destinationNetwork,
            destinationAddress,
            leafAmount,
            keccak256(metadata)
        );

        // Update the new root to the global exit root manager if set by the user
        if (forceUpdateGlobalExitRoot) {
            _updateGlobalExitRoot();
        }
    }

    /**
     * @notice Bridge message and send ETH value
     * note User/UI must be aware of the existing/available networks when choosing the destination network
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param forceUpdateGlobalExitRoot Indicates if the new global exit root is updated or not
     * @param metadata Message metadata
     */
    function bridgeMessage(
        uint32 destinationNetwork,
        address destinationAddress,
        bool forceUpdateGlobalExitRoot,
        bytes calldata metadata
    ) external payable ifNotEmergencyState {
        // If exist a gas token, only allow call this function without value
        if (msg.value != 0 && address(WETHToken) != address(0)) {
            revert NoValueInMessagesOnGasTokenNetworks();
        }

        _bridgeMessage(
            destinationNetwork,
            destinationAddress,
            msg.value,
            forceUpdateGlobalExitRoot,
            metadata
        );
    }

    /**
     * @notice Bridge message and send ETH value
     * note User/UI must be aware of the existing/available networks when choosing the destination network
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amountWETH Amount of WETH tokens
     * @param forceUpdateGlobalExitRoot Indicates if the new global exit root is updated or not
     * @param metadata Message metadata
     */
    function bridgeMessageWETH(
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amountWETH,
        bool forceUpdateGlobalExitRoot,
        bytes calldata metadata
    ) external ifNotEmergencyState {
        // If native token is ether, disable this function
        if (address(WETHToken) == address(0)) {
            revert NativeTokenIsEther();
        }

        // Burn wETH tokens
        /// @dev in case this function is called from a sovereign bridge that has remapped wethToken with a non-standard token,
        /// we have to add to the leaf the amount received to the bridge, not the amount sent
        uint256 leafAmount = _bridgeWrappedAsset(WETHToken, amountWETH);

        _bridgeMessage(
            destinationNetwork,
            destinationAddress,
            leafAmount,
            forceUpdateGlobalExitRoot,
            metadata
        );
    }

    /**
     * @notice Bridge message and send ETH value
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amountEther Amount of ether along with the message
     * @param forceUpdateGlobalExitRoot Indicates if the new global exit root is updated or not
     * @param metadata Message metadata
     */
    function _bridgeMessage(
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amountEther,
        bool forceUpdateGlobalExitRoot,
        bytes calldata metadata
    ) internal {
        if (destinationNetwork == networkID) {
            revert DestinationNetworkInvalid();
        }

        emit BridgeEvent(
            _LEAF_TYPE_MESSAGE,
            networkID,
            msg.sender,
            destinationNetwork,
            destinationAddress,
            amountEther,
            metadata,
            uint32(depositCount)
        );

        _addLeafBridge(
            _LEAF_TYPE_MESSAGE,
            networkID,
            msg.sender,
            destinationNetwork,
            destinationAddress,
            amountEther,
            keccak256(metadata)
        );

        // Update the new root to the global exit root manager if set by the user
        if (forceUpdateGlobalExitRoot) {
            _updateGlobalExitRoot();
        }
    }

    /**
     * @notice Verify merkle proof and withdraw tokens/ether
     * @param smtProofLocalExitRoot Smt proof to proof the leaf against the network exit root
     * @param smtProofRollupExitRoot Smt proof to proof the rollupLocalExitRoot against the rollups exit root
     * @param globalIndex Global index is defined as:
     * | 191 bits |    1 bit     |   32 bits   |     32 bits    |
     * |    0     |  mainnetFlag | rollupIndex | localRootIndex |
     * note that only the rollup index will be used only in case the mainnet flag is 0
     * This means that when synching the events, the globalIndex must be decoded the same way that in the Smart contract
     * to avoid possible synch attacks
     * @param mainnetExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     * @param originNetwork Origin network
     * @param originTokenAddress  Origin token address,
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount Amount of tokens
     * @param metadata Abi encoded metadata if any, empty otherwise
     */
    function claimAsset(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
        uint256 globalIndex,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint32 originNetwork,
        address originTokenAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata metadata
    ) external ifNotEmergencyState nonReentrant {
        // Destination network must be this networkID
        if (destinationNetwork != networkID) {
            revert DestinationNetworkInvalid();
        }

        // Verify leaf exist and it does not have been claimed
        _verifyLeafBridge(
            smtProofLocalExitRoot,
            smtProofRollupExitRoot,
            globalIndex,
            mainnetExitRoot,
            rollupExitRoot,
            _LEAF_TYPE_ASSET,
            originNetwork,
            originTokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            keccak256(metadata)
        );

        emit ClaimEvent(
            globalIndex,
            originNetwork,
            originTokenAddress,
            destinationAddress,
            amount
        );

        // Transfer funds
        if (
            originTokenAddress == address(0) &&
            originNetwork == _MAINNET_NETWORK_ID
        ) {
            if (address(WETHToken) == address(0)) {
                // Ether is the native token
                /* solhint-disable avoid-low-level-calls */
                (bool success, ) = destinationAddress.call{value: amount}(
                    new bytes(0)
                );
                if (!success) {
                    revert EtherTransferFailed();
                }
            } else {
                // Claim wETH
                _claimWrappedAsset(WETHToken, destinationAddress, amount);
            }
        } else {
            // Check if it's gas token
            if (
                originTokenAddress == gasTokenAddress &&
                gasTokenNetwork == originNetwork
            ) {
                // Transfer gas token
                /* solhint-disable avoid-low-level-calls */
                (bool success, ) = destinationAddress.call{value: amount}(
                    new bytes(0)
                );
                if (!success) {
                    revert EtherTransferFailed();
                }
            } else {
                // Transfer tokens
                if (originNetwork == networkID) {
                    // The token is an ERC20 from this network
                    ITokenWrappedBridgeUpgradeable(originTokenAddress)
                        .safeTransfer(destinationAddress, amount);
                } else {
                    // The tokens is not from this network
                    // Create a wrapper for the token if not exist yet
                    bytes32 tokenInfoHash = keccak256(
                        abi.encodePacked(originNetwork, originTokenAddress)
                    );
                    address wrappedToken = tokenInfoToWrappedToken[
                        tokenInfoHash
                    ];

                    if (wrappedToken == address(0)) {
                        // Get ERC20 metadata

                        // Create a new wrapped erc20 using create2
                        ITokenWrappedBridgeUpgradeable newWrappedToken = _deployWrappedToken(
                                tokenInfoHash,
                                metadata
                            );

                        // Mint tokens for the destination address
                        _claimWrappedAsset(
                            newWrappedToken,
                            destinationAddress,
                            amount
                        );

                        // Create mappings
                        tokenInfoToWrappedToken[tokenInfoHash] = address(
                            newWrappedToken
                        );

                        wrappedTokenToTokenInfo[
                            address(newWrappedToken)
                        ] = TokenInformation(originNetwork, originTokenAddress);

                        emit NewWrappedToken(
                            originNetwork,
                            originTokenAddress,
                            address(newWrappedToken),
                            metadata
                        );
                    } else {
                        // Use the existing wrapped erc20
                        _claimWrappedAsset(
                            ITokenWrappedBridgeUpgradeable(wrappedToken),
                            destinationAddress,
                            amount
                        );
                    }
                }
            }
        }
    }

    /**
     * @notice Verify merkle proof and execute message
     * If the receiving address is an EOA, the call will result as a success
     * Which means that the amount of ether will be transferred correctly, but the message
     * will not trigger any execution
     * @dev any modification to this function must be done with caution, since this function has no re-entrancy check
     * @dev function has not reentrancy check in purpose to not stop potential functionalities:
     *   - give funds back in case a message fails
     *   - composability on claimMessage and claimAsset
     * @param smtProofLocalExitRoot Smt proof to proof the leaf against the exit root
     * @param smtProofRollupExitRoot Smt proof to proof the rollupLocalExitRoot against the rollups exit root
     * @param globalIndex Global index is defined as:
     * | 191 bits |    1 bit     |   32 bits   |     32 bits    |
     * |    0     |  mainnetFlag | rollupIndex | localRootIndex |
     * note that only the rollup index will be used only in case the mainnet flag is 0
     * This means that when synching the events, the globalIndex must be decoded the same way that in the Smart contract
     * to avoid possible synch attacks
     * @param mainnetExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     * @param originNetwork Origin network
     * @param originAddress Origin address
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount message value
     * @param metadata Abi encoded metadata if any, empty otherwise
     */
    function claimMessage(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
        uint256 globalIndex,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata metadata
    ) external ifNotEmergencyState {
        // Destination network must be this networkID
        if (destinationNetwork != networkID) {
            revert DestinationNetworkInvalid();
        }

        // Verify leaf exist and it does not have been claimed
        _verifyLeafBridge(
            smtProofLocalExitRoot,
            smtProofRollupExitRoot,
            globalIndex,
            mainnetExitRoot,
            rollupExitRoot,
            _LEAF_TYPE_MESSAGE,
            originNetwork,
            originAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            keccak256(metadata)
        );

        emit ClaimEvent(
            globalIndex,
            originNetwork,
            originAddress,
            destinationAddress,
            amount
        );

        // Execute message
        bool success;
        if (address(WETHToken) == address(0)) {
            // Native token is ether
            // Transfer ether
            /* solhint-disable avoid-low-level-calls */
            (success, ) = destinationAddress.call{value: amount}(
                abi.encodeCall(
                    IBridgeMessageReceiver.onMessageReceived,
                    (originAddress, originNetwork, metadata)
                )
            );
        } else {
            // Mint wETH tokens
            _claimWrappedAsset(WETHToken, destinationAddress, amount);

            // Execute message
            /* solhint-disable avoid-low-level-calls */
            (success, ) = destinationAddress.call(
                abi.encodeCall(
                    IBridgeMessageReceiver.onMessageReceived,
                    (originAddress, originNetwork, metadata)
                )
            );
        }

        if (!success) {
            revert MessageFailed();
        }
    }

    /**
     * @notice Get leaf value and verify the merkle proof
     * @param smtProofLocalExitRoot Smt proof to proof the leaf against the exit root
     * @param smtProofRollupExitRoot Smt proof to proof the rollupLocalExitRoot against the rollups exit root
     * @param globalIndex Global index
     * @param mainnetExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     * @param leafType Leaf type
     * @param originNetwork Origin network
     * @param originAddress Origin address
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount message value
     * @param metadataHash Hash of the metadata
     */
    function _verifyLeafBridge(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
        uint256 globalIndex,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint8 leafType,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes32 metadataHash
    ) internal virtual {
        _verifyLeaf(
            smtProofLocalExitRoot,
            smtProofRollupExitRoot,
            globalIndex,
            mainnetExitRoot,
            rollupExitRoot,
            getLeafValue(
                leafType,
                originNetwork,
                originAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadataHash
            )
        );
    }

    /**
     * @notice Returns the address of a wrapper using the token information if already exist
     * @param originNetwork Origin network
     * @param originTokenAddress Origin token address, address of the token at the origin network.
     */
    function getTokenWrappedAddress(
        uint32 originNetwork,
        address originTokenAddress
    ) external view returns (address) {
        return
            tokenInfoToWrappedToken[
                keccak256(abi.encodePacked(originNetwork, originTokenAddress))
            ];
    }

    /**
     * @notice Function to activate the emergency state
     " Only can be called by the Polygon ZK-EVM in extreme situations
     */
    function activateEmergencyState() external virtual onlyRollupManager {
        _activateEmergencyState();
    }

    /**
     * @notice Function to deactivate the emergency state
     " Only can be called by the Polygon ZK-EVM
     */
    function deactivateEmergencyState() external virtual onlyRollupManager {
        _deactivateEmergencyState();
    }

    /**
     * @notice Function to add a new leaf to the bridge merkle tree
     * @param leafType leaf type
     * @param originNetwork Origin network
     * @param originAddress Origin address
     * @param destinationNetwork Destination network
     * @param destinationAddress Destination address
     * @param amount Amount of tokens
     * @param metadataHash Metadata hash
     */
    function _addLeafBridge(
        uint8 leafType,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes32 metadataHash
    ) internal virtual {
        _addLeaf(
            getLeafValue(
                leafType,
                originNetwork,
                originAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadataHash
            )
        );
    }

    /**
     * @notice Verify leaf and checks that it has not been claimed
     * @param smtProofLocalExitRoot Smt proof
     * @param smtProofRollupExitRoot Smt proof
     * @param globalIndex Index of the leaf
     * @param mainnetExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     * @param leafValue leaf value
     */
    function _verifyLeaf(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
        uint256 globalIndex,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        bytes32 leafValue
    ) internal virtual {
        // Check blockhash where the global exit root was set
        // Note that previous timestamps were set, since in only checked if != 0 it's ok
        uint256 blockHashGlobalExitRoot = globalExitRootManager
            .globalExitRootMap(
                GlobalExitRootLib.calculateGlobalExitRoot(
                    mainnetExitRoot,
                    rollupExitRoot
                )
            );

        // check that this global exit root exist
        if (blockHashGlobalExitRoot == 0) {
            revert GlobalExitRootInvalid();
        }

        uint32 leafIndex;
        uint32 sourceBridgeNetwork;

        // Get origin network from global index
        if (globalIndex & _GLOBAL_INDEX_MAINNET_FLAG != 0) {
            // The network is mainnet, therefore sourceBridgeNetwork is 0

            // Last 32 bits are leafIndex
            leafIndex = uint32(globalIndex);

            // Reconstruct global index to assert that all unused bits are 0
            require(
                _GLOBAL_INDEX_MAINNET_FLAG + uint256(leafIndex) == globalIndex,
                InvalidGlobalIndex()
            );

            // Verify merkle proof
            if (
                !verifyMerkleProof(
                    leafValue,
                    smtProofLocalExitRoot,
                    leafIndex,
                    mainnetExitRoot
                )
            ) {
                revert InvalidSmtProof();
            }
        } else {
            // The network is a rollup, therefore sourceBridgeNetwork must be decoded
            uint32 indexRollup = uint32(globalIndex >> 32);
            sourceBridgeNetwork = indexRollup + 1;

            // Last 32 bits are leafIndex
            leafIndex = uint32(globalIndex);

            // Reconstruct global index to assert that all unused bits are 0
            require(
                (uint256(indexRollup) << uint256(32)) + uint256(leafIndex) ==
                    globalIndex,
                InvalidGlobalIndex()
            );

            // Verify merkle proof against rollup exit root
            if (
                !verifyMerkleProof(
                    calculateRoot(leafValue, smtProofLocalExitRoot, leafIndex),
                    smtProofRollupExitRoot,
                    indexRollup,
                    rollupExitRoot
                )
            ) {
                revert InvalidSmtProof();
            }
        }

        // Set and check nullifier
        _setAndCheckClaimed(leafIndex, sourceBridgeNetwork);
    }

    /**
     * @notice Function to check if an index is claimed or not
     * @param leafIndex Index
     * @param sourceBridgeNetwork Origin network
     */
    function isClaimed(
        uint32 leafIndex,
        uint32 sourceBridgeNetwork
    ) external view virtual returns (bool) {
        uint256 globalIndex;

        // For consistency with the previous set nullifiers
        if (
            networkID == _MAINNET_NETWORK_ID &&
            sourceBridgeNetwork == _ZKEVM_NETWORK_ID
        ) {
            globalIndex = uint256(leafIndex);
        } else {
            globalIndex =
                uint256(leafIndex) +
                uint256(sourceBridgeNetwork) *
                _MAX_LEAFS_PER_NETWORK;
        }
        (uint256 wordPos, uint256 bitPos) = _bitmapPositions(globalIndex);
        uint256 mask = (1 << bitPos);
        return (claimedBitMap[wordPos] & mask) == mask;
    }

    /**
     * @notice Function to check that an index is not claimed and set it as claimed
     * @param leafIndex Index
     * @param sourceBridgeNetwork Origin network
     */
    function _setAndCheckClaimed(
        uint32 leafIndex,
        uint32 sourceBridgeNetwork
    ) internal virtual {
        uint256 globalIndex;

        // For consistency with the previous set nullifiers
        if (
            networkID == _MAINNET_NETWORK_ID &&
            sourceBridgeNetwork == _ZKEVM_NETWORK_ID
        ) {
            globalIndex = uint256(leafIndex);
        } else {
            globalIndex =
                uint256(leafIndex) +
                uint256(sourceBridgeNetwork) *
                _MAX_LEAFS_PER_NETWORK;
        }
        (uint256 wordPos, uint256 bitPos) = _bitmapPositions(globalIndex);
        uint256 mask = 1 << bitPos;
        uint256 flipped = claimedBitMap[wordPos] ^= mask;
        if (flipped & mask == 0) {
            revert AlreadyClaimed();
        }
    }

    /////////////////////////////////////////
    //   ProxiedTokensManager functions   //
    ////////////////////////////////////////

    /**
     * @notice Starts the ProxiedTokensManager role transfer
     * This is a two step process, the pending ProxiedTokensManager must accepted to finalize the process
     * @param newProxiedTokensManager Address of the new pending ProxiedTokensManager
     */
    function transferProxiedTokensManagerRole(
        address newProxiedTokensManager
    ) external {
        require(msg.sender == proxiedTokensManager, OnlyProxiedTokensManager());

        pendingProxiedTokensManager = newProxiedTokensManager;

        emit TransferProxiedTokensManagerRole(
            proxiedTokensManager,
            newProxiedTokensManager
        );
    }

    /**
     * @notice Allow the current pending ProxiedTokensManager to accept the ProxiedTokensManager role
     */
    function acceptProxiedTokensManagerRole() external {
        require(
            msg.sender == pendingProxiedTokensManager,
            OnlyPendingProxiedTokensManager()
        );

        address oldProxiedTokensManager = proxiedTokensManager;
        proxiedTokensManager = pendingProxiedTokensManager;
        delete pendingProxiedTokensManager;

        emit AcceptProxiedTokensManagerRole(
            oldProxiedTokensManager,
            proxiedTokensManager
        );
    }

    /**
     * @notice Function to update the globalExitRoot if the last deposit is not submitted
     */
    function updateGlobalExitRoot() external {
        if (lastUpdatedDepositCount < depositCount) {
            _updateGlobalExitRoot();
        }
    }

    /**
     * @notice Function to update the globalExitRoot
     */
    function _updateGlobalExitRoot() internal {
        lastUpdatedDepositCount = uint32(depositCount);
        globalExitRootManager.updateExitRoot(getRoot());
    }

    /**
     * @notice Burn tokens from wrapped token to execute the bridge
     * note This  function has been extracted to be able to override it by other contracts like Bridge2SovereignChain
     * @param tokenWrapped Wrapped token to burnt
     * @param amount Amount of tokens
     * @return Amount of tokens that must be added to the leaf after the bridge operation
     */
    function _bridgeWrappedAsset(
        ITokenWrappedBridgeUpgradeable tokenWrapped,
        uint256 amount
    ) internal virtual returns (uint256) {
        // Burn tokens
        tokenWrapped.burn(msg.sender, amount);
        return amount;
    }

    /**
     * @notice Mints tokens from wrapped token to proceed with the claim
     * note This  function has been extracted to be able to override it by other contracts like Bridge2SovereignChain
     * @param tokenWrapped Proxied Wrapped token to mint
     * @param destinationAddress Minted token receiver
     * @param amount Amount of tokens
     */
    function _claimWrappedAsset(
        ITokenWrappedBridgeUpgradeable tokenWrapped,
        address destinationAddress,
        uint256 amount
    ) internal virtual {
        // Mint tokens
        tokenWrapped.mint(destinationAddress, amount);
    }

    /**
     * @notice Function decode an index into a wordPos and bitPos
     * @param index Index
     */
    function _bitmapPositions(
        uint256 index
    ) internal pure returns (uint256 wordPos, uint256 bitPos) {
        wordPos = uint248(index >> 8);
        bitPos = uint8(index);
    }

    /**
     * @notice Function to call token permit method of extended ERC20
     + @param token ERC20 token address
     * @param permitData Raw data of the call `permit` of the token
     */
    function _permit(address token, bytes calldata permitData) internal {
        bytes4 sig = bytes4(permitData[:4]);
        if (sig == _PERMIT_SIGNATURE) {
            (
                address owner,
                address spender,
                uint256 value,
                uint256 deadline,
                uint8 v,
                bytes32 r,
                bytes32 s
            ) = abi.decode(
                    permitData[4:],
                    (
                        address,
                        address,
                        uint256,
                        uint256,
                        uint8,
                        bytes32,
                        bytes32
                    )
                );
            if (owner != msg.sender) {
                revert NotValidOwner();
            }
            if (spender != address(this)) {
                revert NotValidSpender();
            }

            /// @dev To be more aligned with the latest OpenZeppelin ERC20 implementation where ERC20 tokens allow approvals of uint.max and it is widely adopted by DeFi,
            ///  this check has been removed. Important to warn that removing it is not the most secure approach but has been applied because it is widely used and reduce friction and gas cost
            // if (value != amount) {
            //     revert NotValidAmount();
            // }

            // we call without checking the result, in case it fails and he doesn't have enough balance
            // the following transferFrom should be fail. This prevents DoS attacks from using a signature
            // before the smart contract call
            /* solhint-disable avoid-low-level-calls */
            address(token).call(
                abi.encodeWithSelector(
                    _PERMIT_SIGNATURE,
                    owner,
                    spender,
                    value,
                    deadline,
                    v,
                    r,
                    s
                )
            );
        } else {
            if (sig != _PERMIT_SIGNATURE_DAI) {
                revert NotValidSignature();
            }

            (
                address holder,
                address spender,
                uint256 nonce,
                uint256 expiry,
                bool allowed,
                uint8 v,
                bytes32 r,
                bytes32 s
            ) = abi.decode(
                    permitData[4:],
                    (
                        address,
                        address,
                        uint256,
                        uint256,
                        bool,
                        uint8,
                        bytes32,
                        bytes32
                    )
                );

            if (holder != msg.sender) {
                revert NotValidOwner();
            }

            if (spender != address(this)) {
                revert NotValidSpender();
            }

            // we call without checking the result, in case it fails and he doesn't have enough balance
            // the following transferFrom should be fail. This prevents DoS attacks from using a signature
            // before the smart contract call
            /* solhint-disable avoid-low-level-calls */
            address(token).call(
                abi.encodeWithSelector(
                    _PERMIT_SIGNATURE_DAI,
                    holder,
                    spender,
                    nonce,
                    expiry,
                    allowed,
                    v,
                    r,
                    s
                )
            );
        }
    }

    /**
     * @notice Internal function that uses create2 to deploy the upgradable wrapped tokens
     * @param salt Salt used in create2 params,
     * tokenInfoHash will be used as salt for all wrapped except for bridge native WETH, that will be bytes32(0)
     * @param initializationArgs Encoded constructor args for the wrapped token
     */
    function _deployWrappedToken(
        bytes32 salt,
        bytes memory initializationArgs
    ) internal returns (ITokenWrappedBridgeUpgradeable newWrappedTokenProxy) {
        /// @dev A bytecode stored on chain is used to deploy the proxy in a way that ALWAYS it's used the same
        /// bytecode, therefore the proxy addresses are the same in all chains as they are deployed deterministically with same init bytecode
        /// @dev there is no constructor args as the implementation address + owner of the proxied are set at constructor level and taken from the bridge itself
        bytes memory proxyInitBytecode = abi.encodePacked(
            INIT_BYTECODE_TRANSPARENT_PROXY()
        );

        // Deploy wrapped token proxy
        /// @solidity memory-safe-assembly
        assembly {
            newWrappedTokenProxy := create2(
                0,
                add(proxyInitBytecode, 0x20),
                mload(proxyInitBytecode),
                salt
            )
        }
        if (address(newWrappedTokenProxy) == address(0))
            revert FailedProxyDeployment();

        // Initialize the wrapped token
        (string memory name, string memory symbol, uint8 decimals) = abi.decode(
            initializationArgs,
            (string, string, uint8)
        );
        ITokenWrappedBridgeUpgradeable(address(newWrappedTokenProxy))
            .initialize(name, symbol, decimals);
    }

    /**
     * @notice Returns internal proxiedTokensManager address
     */
    function getProxiedTokensManager() external view returns (address) {
        return proxiedTokensManager;
    }

    /// @notice This function is used to get the implementation address of the wrapped token bridge
    function getWrappedTokenBridgeImplementation()
        external
        view
        returns (address)
    {
        return wrappedTokenBridgeImplementation;
    }

    // Helpers to safely get the metadata from a token, inspired by https://github.com/traderjoe-xyz/joe-core/blob/main/contracts/MasterChefJoeV3.sol#L55-L95
    /**
     * @notice Provides a safe ERC20.symbol version which returns 'NO_SYMBOL' as fallback string
     * @param token The address of the ERC-20 token contract
     */
    function _safeSymbol(address token) internal view returns (string memory) {
        (bool success, bytes memory data) = address(token).staticcall(
            abi.encodeCall(IERC20Metadata.symbol, ())
        );
        return success ? _returnDataToString(data) : "NO_SYMBOL";
    }

    /**
     * @notice  Provides a safe ERC20.name version which returns 'NO_NAME' as fallback string.
     * @param token The address of the ERC-20 token contract.
     */
    function _safeName(address token) internal view returns (string memory) {
        (bool success, bytes memory data) = address(token).staticcall(
            abi.encodeCall(IERC20Metadata.name, ())
        );
        return success ? _returnDataToString(data) : "NO_NAME";
    }

    /**
     * @notice Provides a safe ERC20.decimals version which returns '18' as fallback value.
     * Note Tokens with (decimals > 255) are not supported
     * @param token The address of the ERC-20 token contract
     */
    function _safeDecimals(address token) internal view returns (uint8) {
        (bool success, bytes memory data) = address(token).staticcall(
            abi.encodeCall(IERC20Metadata.decimals, ())
        );
        return success && data.length == 32 ? abi.decode(data, (uint8)) : 18;
    }

    /**
     * @notice Function to convert returned data to string
     * returns 'NOT_VALID_ENCODING' as fallback value.
     * @param data returned data
     */
    function _returnDataToString(
        bytes memory data
    ) internal pure returns (string memory) {
        if (data.length >= 64) {
            return abi.decode(data, (string));
        } else if (data.length == 32) {
            // Since the strings on bytes32 are encoded left-right, check the first zero in the data
            uint256 nonZeroBytes;
            while (nonZeroBytes < 32 && data[nonZeroBytes] != 0) {
                nonZeroBytes++;
            }

            // If the first one is 0, we do not handle the encoding
            if (nonZeroBytes == 0) {
                return "NOT_VALID_ENCODING";
            }
            // Create a byte array with nonZeroBytes length
            bytes memory bytesArray = new bytes(nonZeroBytes);
            for (uint256 i = 0; i < nonZeroBytes; i++) {
                bytesArray[i] = data[i];
            }
            return string(bytesArray);
        } else {
            return "NOT_VALID_ENCODING";
        }
    }

    ////////////////////////////////
    ////    View functions    /////
    ///////////////////////////////

    /**
     * @notice Returns the encoded token metadata
     * @param token Address of the token
     */

    function getTokenMetadata(
        address token
    ) public view returns (bytes memory) {
        return
            abi.encode(
                _safeName(token),
                _safeSymbol(token),
                _safeDecimals(token)
            );
    }

    /**
     * @notice Returns the INIT_BYTECODE_TRANSPARENT_PROXY from the BytecodeStorer
     * @dev BytecodeStorer is a contract that contains PolygonTransparentProxy as constant, it has done this way to have more bytecode available.
     *  Using the on chain bytecode, we assure that transparent proxy is always deployed with the exact same bytecode, necessary to have all deployed wrapped token
     *  with the same address on all the chains.
     */
    function INIT_BYTECODE_TRANSPARENT_PROXY()
        public
        view
        returns (bytes memory)
    {
        return
            IBytecodeStorer(wrappedTokenBytecodeStorer)
                .INIT_BYTECODE_TRANSPARENT_PROXY();
    }

    /**
     * @notice Returns the precalculated address of a upgradeable wrapped token using the token information
     * @param originNetwork Origin network
     * @param originTokenAddress Origin token address, address of the token at the origin network.
     */
    function computeTokenProxyAddress(
        uint32 originNetwork,
        address originTokenAddress
    ) public view returns (address) {
        bytes32 salt = keccak256(
            abi.encodePacked(originNetwork, originTokenAddress)
        );

        bytes32 hashCreate2 = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(abi.encodePacked(INIT_BYTECODE_TRANSPARENT_PROXY()))
            )
        );

        // Last 20 bytes of hash to address
        return address(uint160(uint256(hashCreate2)));
    }
}
