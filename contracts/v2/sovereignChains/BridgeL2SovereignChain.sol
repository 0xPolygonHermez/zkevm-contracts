// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;

import "../lib/DepositContractV2.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import "../../lib/TokenWrapped.sol";
import "../../interfaces/IBasePolygonZkEVMGlobalExitRoot.sol";
import "../../interfaces/IBridgeMessageReceiver.sol";
import "../interfaces/IBridgeL2SovereignChains.sol";
import "../../lib/EmergencyManager.sol";
import "../../lib/GlobalExitRootLib.sol";
import "../PolygonZkEVMBridgeV2.sol";

/**
 * Sovereign chains bridge that will be deployed on Ethereum and all Sovereign chains
 * Contract responsible to manage the token interactions with other networks
 */
contract BridgeL2SovereignChain is
    PolygonZkEVMBridgeV2,
    IBridgeL2SovereignChains
{
    // Map to store wrappedAddresses that are not mintable
    mapping(address wrappedAddress => bool isNotMintable)
        public wrappedAddressIsNotMintable;

    // Bridge manager address; can set custom mapping for any token
    address public bridgeManager;

    /**
     * @dev Emitted when a bridge manager is updated
     */
    event BridgeManagerUpdated(address bridgeManager);

    /**
     * Disable initalizers on the implementation following the best practices
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @param _networkID networkID
     * @param _gasTokenAddress gas token address
     * @param _gasTokenNetwork gas token network
     * @param _globalExitRootManager global exit root manager address
     * @param _polygonRollupManager Rollup manager address
     * @notice The value of `_polygonRollupManager` on the L2 deployment of the contract will be address(0), so
     * emergency state is not possible for the L2 deployment of the bridge, intentionally
     * @param _gasTokenMetadata Abi encoded gas token metadata
     * @param _bridgeManager bridge manager address
     */
    function initialize(
        uint32 _networkID,
        address _gasTokenAddress,
        uint32 _gasTokenNetwork,
        IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
        address _polygonRollupManager,
        bytes memory _gasTokenMetadata,
        address _bridgeManager
    ) public virtual {
        super.initialize(
            _networkID,
            _gasTokenAddress,
            _gasTokenNetwork,
            _globalExitRootManager,
            _polygonRollupManager,
            _gasTokenMetadata
        );
        bridgeManager = _bridgeManager;
    }

    modifier onlyBridgeManager() {
        if (bridgeManager != msg.sender) {
            revert OnlyBridgeManager();
        }
        _;
    }

    /**
     * @notice Burn tokens from wrapped token to execute the bridge
     * note This  function has been extracted to be able to override it by other contracts like Bridge2SovereignChain
     * @param tokenWrapped Wrapped token to burnt
     * @param amount Amount of tokens
     */
    function _bridgeWrappedAsset(
        TokenWrapped tokenWrapped,
        uint256 amount
    ) internal override {
        // The token is either (1) a correctly wrapped token from another network
        // or (2) wrapped with custom contract from origin network
        if (wrappedAddressIsNotMintable[address(tokenWrapped)]) {
            // Don't use burn but transfer to bridge
            tokenWrapped.transferFrom(msg.sender, address(this), amount);
        } else {
            // Burn tokens
            tokenWrapped.burn(msg.sender, amount);
        }
    }

    /**
     * @notice Mints tokens from wrapped token to proceed with the claim
     * note This  function has been extracted to be able to override it by other contracts like Bridge2SovereignChain
     * @param tokenWrapped Wrapped token to mint
     * @param destinationAddress Minted token receiver
     * @param amount Amount of tokens
     */
    function _claimWrappedAsset(
        TokenWrapped tokenWrapped,
        address destinationAddress,
        uint256 amount
    ) internal override {
        // If is not mintable transfer instead of mint
        if (wrappedAddressIsNotMintable[address(tokenWrapped)]) {
            // Transfer wETH
            // q: safe transfer?
            tokenWrapped.transfer(destinationAddress, amount);
        } else {
            // Claim wETH
            tokenWrapped.mint(destinationAddress, amount);
        }
    }

    /**
     * @notice Updated bridge manager address
     * @param _bridgeManager Bridge manager address
     */
    function setBridgeManager(
        address _bridgeManager
    ) external onlyBridgeManager {
        if (_bridgeManager == address(0)) revert NotValidBridgeManager();
        bridgeManager = _bridgeManager;
        emit BridgeManagerUpdated(bridgeManager);
    }

    /**
     * @notice Set the address of a wrapper using the token information if already exist
     * @dev This function is used to allow any existing token to be mapped with
     *      origin token.
     * @notice If this function is called multiple times for the same existingTokenAddress,
     * this will override the previous calls and only keep the last sovereignTokenAddress.
     * @notice The tokenInfoToWrappedToken mapping  value is replaced by the new sovereign address but it's not the case for the wrappedTokenToTokenInfo map where the value is added, this way user will always be able to withdraw their tokens
     * @param originNetwork Origin network
     * @param originTokenAddress Origin token address, 0 address is reserved for ether
     * @param sovereignTokenAddress Address of the sovereign wrapped token
     * @param isNotMintable Flag to indicate if the wrapped token is not mintable
     */
    function setSovereignTokenAddress(
        uint32 originNetwork,
        address originTokenAddress,
        address sovereignTokenAddress,
        bool isNotMintable
    ) external onlyBridgeManager {
        // origin and sovereign token address are not 0
        if (
            originTokenAddress == address(0) ||
            sovereignTokenAddress == address(0)
        ) {
            revert InvalidZeroAddress();
        }
        // originnetwork != current network, wrapped tokens are always from other networks
        if (originNetwork == networkID) {
            revert OriginNetworkInvalid();
        }
        // Compute token info hash
        bytes32 tokenInfoHash = keccak256(
            abi.encodePacked(originNetwork, originTokenAddress)
        );
        // Set the address of the wrapper
        tokenInfoToWrappedToken[tokenInfoHash] = sovereignTokenAddress;
        // Set the token info mapping
        wrappedTokenToTokenInfo[sovereignTokenAddress] = TokenInformation(
            originNetwork,
            originTokenAddress
        );
        wrappedAddressIsNotMintable[sovereignTokenAddress] = isNotMintable;
    }

    /**
     * @notice Remove the address of a remapped token from the mapping
     * @notice It also removes the token from the isNotMintable mapping
     * @param sovereignTokenAddress Address of the sovereign wrapped token
     */
    function removeSovereignTokenAddress(
        address sovereignTokenAddress
    ) external onlyBridgeManager {
        delete wrappedTokenToTokenInfo[sovereignTokenAddress];
        delete wrappedAddressIsNotMintable[sovereignTokenAddress];
    }

    /**
     * @notice Set the custom wrapper for weth
     * @notice If this function is called multiple times this will override the previous calls and only keep the last sovereignTokenAddress.
     * @param sovereignWETHTokenAddress Address of the sovereign weth token
     * @param isNotMintable Flag to indicate if the wrapped token is not mintable
     */
    function setSovereignWETHAddress(
        address sovereignWETHTokenAddress,
        bool isNotMintable
    ) external onlyBridgeManager {
        WETHToken = TokenWrapped(sovereignWETHTokenAddress);
        wrappedAddressIsNotMintable[sovereignWETHTokenAddress] = isNotMintable;
    }
}
