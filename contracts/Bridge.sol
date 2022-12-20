// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.15;

import "./lib/DepositContract.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./lib/TokenWrapped.sol";
import "./interfaces/IGlobalExitRootManager.sol";
import "./interfaces/IBridgeMessageReceiver.sol";
import "./interfaces/IBridge.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import "./lib/EmergencyManager.sol";

/**
 * Bridge that will be deployed on both networks Ethereum and Polygon zkEVM
 * Contract responsible to manage the token interactions with other networks
 */
contract Bridge is DepositContract, EmergencyManager, IBridge {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Wrapped Token information struct
    struct TokenInformation {
        uint32 originNetwork;
        address originTokenAddress;
    }

    // bytes4(keccak256(bytes("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)")));
    bytes4 private constant _PERMIT_SIGNATURE = 0xd505accf;

    // bytes4(keccak256(bytes("permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)")));
    bytes4 private constant _PERMIT_SIGNATURE_DAI = 0x8fcbaf0c;

    // Mainnet indentifier
    uint32 public constant MAINNET_NETWORK_ID = 0;

    // Leaf type asset
    uint8 public constant LEAF_TYPE_ASSET = 0;

    // Leaf type message
    uint8 public constant LEAF_TYPE_MESSAGE = 1;

    // Network identifier
    uint32 public networkID;

    // Leaf index --> claimed bit map
    mapping(uint256 => uint256) public claimedBitMap;

    // keccak256(OriginNetwork || tokenAddress) --> Wrapped token address
    mapping(bytes32 => address) public tokenInfoToWrappedToken;

    // Wrapped token Address --> Origin token information
    mapping(address => TokenInformation) public wrappedTokenToTokenInfo;

    // Global Exit Root address
    IGlobalExitRootManager public globalExitRootManager;

    // Polygon ZK-EVM address
    address public poeAddress;

    /**
     * @param _networkID networkID
     * @param _globalExitRootManager global exit root manager address
     */
    function initialize(
        uint32 _networkID,
        IGlobalExitRootManager _globalExitRootManager,
        address _poeAddress
    ) public virtual initializer {
        networkID = _networkID;
        globalExitRootManager = _globalExitRootManager;
        poeAddress = _poeAddress;
    }

    modifier onlyPolygonZKEVM() {
        require(
            poeAddress == msg.sender,
            "PolygonZKEVM::onlyPolygonZKEVM: only Polygon ZK-EVM contractt"
        );
        _;
    }

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
        uint32 index,
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
        address wrappedTokenAddress
    );

    /**
     * @notice Deposit add a new leaf to the merkle tree
     * @param token Token address, 0 address is reserved for ether
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount Amount of tokens
     * @param permitData Raw data of the call `permit` of the token
     */
    function bridgeAsset(
        address token,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata permitData
    ) public payable virtual ifNotEmergencyState {
        require(
            destinationNetwork != networkID,
            "Bridge::bridge: DESTINATION_CANT_BE_ITSELF"
        );

        address originTokenAddress;
        uint32 originNetwork;
        bytes memory metadata;

        if (token == address(0)) {
            // Ether transfer
            require(
                msg.value == amount,
                "Bridge::bridge: AMOUNT_DOES_NOT_MATCH_MSG_VALUE"
            );

            // Ether is treated as ether from mainnet
            originNetwork = MAINNET_NETWORK_ID;
        } else {
            TokenInformation memory tokenInfo = wrappedTokenToTokenInfo[token];

            if (tokenInfo.originTokenAddress != address(0)) {
                // The token is a wrapped token from another network

                // Burn tokens
                TokenWrapped(token).burn(msg.sender, amount);

                originTokenAddress = tokenInfo.originTokenAddress;
                originNetwork = tokenInfo.originNetwork;
            } else {
                // Use permit if any
                if (permitData.length != 0) {
                    _permit(token, amount, permitData);
                }
                // The token is from this network.
                IERC20Upgradeable(token).safeTransferFrom(
                    msg.sender,
                    address(this),
                    amount
                );

                originTokenAddress = token;
                originNetwork = networkID;

                // Encode metadata
                metadata = abi.encode(
                    IERC20MetadataUpgradeable(token).name(),
                    IERC20MetadataUpgradeable(token).symbol(),
                    IERC20MetadataUpgradeable(token).decimals()
                );
            }
        }

        emit BridgeEvent(
            LEAF_TYPE_ASSET,
            originNetwork,
            originTokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
            uint32(depositCount)
        );
        _deposit(
            getLeafValue(
                LEAF_TYPE_ASSET,
                originNetwork,
                originTokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                keccak256(metadata)
            )
        );

        // Update the new exit root to the exit root manager
        globalExitRootManager.updateExitRoot(getDepositRoot());
    }

    /**
     * @notice Bridge message
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param metadata Message metadata
     */
    function bridgeMessage(
        uint32 destinationNetwork,
        address destinationAddress,
        bytes memory metadata
    ) public payable ifNotEmergencyState {
        require(
            destinationNetwork != networkID,
            "Bridge::bridge: DESTINATION_CANT_BE_ITSELF"
        );

        emit BridgeEvent(
            LEAF_TYPE_MESSAGE,
            networkID,
            msg.sender,
            destinationNetwork,
            destinationAddress,
            msg.value,
            metadata,
            uint32(depositCount)
        );

        _deposit(
            getLeafValue(
                LEAF_TYPE_MESSAGE,
                networkID,
                msg.sender,
                destinationNetwork,
                destinationAddress,
                msg.value,
                keccak256(metadata)
            )
        );

        // Update the new exit root to the exit root manager
        globalExitRootManager.updateExitRoot(getDepositRoot());
    }

    /**
     * @notice Verify merkle proof and withdraw tokens/ether
     * @param smtProof Smt proof
     * @param index Index of the leaf
     * @param mainnetExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     * @param originNetwork Origin network
     * @param originTokenAddress  Origin token address, 0 address is reserved for ether
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount Amount of tokens
     * @param metadata Abi encoded metadata if any, empty otherwise
     */
    function claimAsset(
        bytes32[] memory smtProof,
        uint32 index,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint32 originNetwork,
        address originTokenAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes memory metadata
    ) public ifNotEmergencyState {
        // Verify leaf exist and it does not have been claimed
        _verifyLeaf(
            smtProof,
            index,
            mainnetExitRoot,
            rollupExitRoot,
            originNetwork,
            originTokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
            LEAF_TYPE_ASSET
        );

        // Update nullifier
        _setClaimed(index);

        // Transfer funds
        if (originTokenAddress == address(0)) {
            // Transfer ether
            /* solhint-disable avoid-low-level-calls */
            (bool success, ) = destinationAddress.call{value: amount}(
                new bytes(0)
            );
            require(success, "Bridge::claimAsset: ETH_TRANSFER_FAILED");
        } else {
            // Transfer tokens
            if (originNetwork == networkID) {
                // The token is an ERC20 from this network
                IERC20Upgradeable(originTokenAddress).safeTransfer(
                    destinationAddress,
                    amount
                );
            } else {
                // The tokens is not from this network
                // Create a wrapper for the token if not exist yet
                bytes32 tokenInfoHash = keccak256(
                    abi.encodePacked(originNetwork, originTokenAddress)
                );
                address wrappedToken = tokenInfoToWrappedToken[tokenInfoHash];

                if (wrappedToken == address(0)) {
                    // Get ERC20 metadata
                    (
                        string memory name,
                        string memory symbol,
                        uint8 decimals
                    ) = abi.decode(metadata, (string, string, uint8));

                    // Create a new wrapped erc20 using create2
                    TokenWrapped newWrappedToken = (new TokenWrapped){
                        salt: tokenInfoHash
                    }(name, symbol, decimals);

                    // Mint tokens for the destination address
                    newWrappedToken.mint(destinationAddress, amount);

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
                        address(newWrappedToken)
                    );
                } else {
                    // Use the existing wrapped erc20
                    TokenWrapped(wrappedToken).mint(destinationAddress, amount);
                }
            }
        }

        emit ClaimEvent(
            index,
            originNetwork,
            originTokenAddress,
            destinationAddress,
            amount
        );
    }

    /**
     * @notice Verify merkle proof and execute message
     * @param smtProof Smt proof
     * @param index Index of the leaf
     * @param mainnetExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     * @param originNetwork Origin network
     * @param originAddress Origin address
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount Amount of tokens
     * @param metadata Abi encoded metadata if any, empty otherwise
     */
    function claimMessage(
        bytes32[] memory smtProof,
        uint32 index,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes memory metadata
    ) public ifNotEmergencyState {
        // Verify leaf exist and it does not have been claimed
        _verifyLeaf(
            smtProof,
            index,
            mainnetExitRoot,
            rollupExitRoot,
            originNetwork,
            originAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
            LEAF_TYPE_MESSAGE
        );

        // Update nullifier
        _setClaimed(index);

        // Execute message
        // Transfer ether
        /* solhint-disable avoid-low-level-calls */
        (bool success, ) = destinationAddress.call{value: amount}(
            abi.encodeCall(
                IBridgeMessageReceiver.onMessageReceived,
                (originAddress, originNetwork, metadata)
            )
        );
        require(success, "Bridge::claimMessage: MESSAGE_FAILED");

        emit ClaimEvent(
            index,
            originNetwork,
            originAddress,
            destinationAddress,
            amount
        );
    }

    /**
     * @notice Returns the precalculated address of a wrapper using the token information
     * @param originNetwork Origin network
     * @param originTokenAddress Origin token address, 0 address is reserved for ether
     */
    function precalculatedWrapperAddress(
        uint32 originNetwork,
        address originTokenAddress,
        string calldata name,
        string calldata symbol,
        uint8 decimals
    ) public view returns (address) {
        bytes32 salt = keccak256(
            abi.encodePacked(originNetwork, originTokenAddress)
        );

        bytes32 hashCreate2 = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(
                    abi.encodePacked(
                        type(TokenWrapped).creationCode,
                        abi.encode(name, symbol, decimals)
                    )
                )
            )
        );

        // last 20 bytes of hash to address
        return address(uint160(uint256(hashCreate2)));
    }

    /**
     * @notice Returns the address of a wrapper using the token information if already exist
     * @param originNetwork Origin network
     * @param originTokenAddress Origin token address, 0 address is reserved for ether
     */
    function getTokenWrappedAddress(
        uint32 originNetwork,
        address originTokenAddress
    ) public view returns (address) {
        return
            tokenInfoToWrappedToken[
                keccak256(abi.encodePacked(originNetwork, originTokenAddress))
            ];
    }

    /**
     * @notice Function to activate the emergency state
     " Only can be called by the Polygon ZK-EVM in extreme situations
     */
    function activateEmergencyState() external onlyPolygonZKEVM {
        _activateEmergencyState();
    }

    /**
     * @notice Function to deactivate the emergency state
     " Only can be called by the Polygon ZK-EVM
     */
    function deactivateEmergencyState() external onlyPolygonZKEVM {
        _deactivateEmergencyState();
    }

    /**
     * @notice Verify leaf and checks that it has not been claimed
     * @param smtProof Smt proof
     * @param index Index of the leaf
     * @param mainnetExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     * @param originNetwork Origin network
     * @param originAddress Origin address
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount Amount of tokens
     * @param metadata Abi encoded metadata if any, empty otherwise
     * @param leafType Leaf type -->  [0] transfer Ether / ERC20 tokens, [1] message
     */
    function _verifyLeaf(
        bytes32[] memory smtProof,
        uint32 index,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes memory metadata,
        uint8 leafType
    ) internal {
        // Check nullifier
        require(!isClaimed(index), "Bridge::_verifyLeaf: ALREADY_CLAIMED");

        // Check timestamp where the global exit root was set
        uint256 timestampGlobalExitRoot = globalExitRootManager
            .globalExitRootMap(
                keccak256(abi.encodePacked(mainnetExitRoot, rollupExitRoot))
            );

        require(
            timestampGlobalExitRoot != 0,
            "Bridge::_verifyLeaf: GLOBAL_EXIT_ROOT_INVALID"
        );

        // Destination network must be networkID
        require(
            destinationNetwork == networkID,
            "Bridge::_verifyLeaf: DESTINATION_NETWORK_DOES_NOT_MATCH"
        );

        bytes32 claimRoot;
        if (networkID == MAINNET_NETWORK_ID) {
            // Verify merkle proof using rollup exit root
            claimRoot = rollupExitRoot;
        } else {
            // Verify merkle proof using mainnet exit root
            claimRoot = mainnetExitRoot;
        }
        require(
            verifyMerkleProof(
                getLeafValue(
                    leafType,
                    originNetwork,
                    originAddress,
                    destinationNetwork,
                    destinationAddress,
                    amount,
                    keccak256(metadata)
                ),
                smtProof,
                index,
                claimRoot
            ),
            "Bridge::_verifyLeaf: SMT_INVALID"
        );
    }

    /**
     * @notice Function to check if an index is claimed or not
     * @param index Index
     */
    function isClaimed(uint256 index) public view returns (bool) {
        uint256 claimedWordIndex = index / 256;
        uint256 claimedBitIndex = index % 256;
        uint256 claimedWord = claimedBitMap[claimedWordIndex];
        uint256 mask = (1 << claimedBitIndex);
        return claimedWord & mask == mask;
    }

    /**
     * @notice Function set a index as claimed
     * @param index Index
     */
    function _setClaimed(uint256 index) private {
        uint256 claimedWordIndex = index / 256;
        uint256 claimedBitIndex = index % 256;
        claimedBitMap[claimedWordIndex] =
            claimedBitMap[claimedWordIndex] |
            (1 << claimedBitIndex);
    }

    /**
     * @notice Function to extract the selector of a bytes calldata
     * @param _data The calldata bytes
     */
    function _getSelector(
        bytes memory _data
    ) private pure returns (bytes4 sig) {
        assembly {
            sig := mload(add(_data, 32))
        }
    }

    /**
     * @notice Function to call token permit method of extended ERC20
     + @param token ERC20 token address
     * @param amount Quantity that is expected to be allowed
     * @param permitData Raw data of the call `permit` of the token
     */
    function _permit(
        address token,
        uint256 amount,
        bytes calldata permitData
    ) internal {
        bytes4 sig = _getSelector(permitData);
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
            require(
                owner == msg.sender,
                "Bridge::_permit: PERMIT_OWNER_MUST_BE_THE_SENDER"
            );
            require(
                spender == address(this),
                "Bridge::_permit: SPENDER_MUST_BE_THIS"
            );
            require(
                value == amount,
                "Bridge::_permit: PERMIT_AMOUNT_DOES_NOT_MATCH"
            );

            // we call without checking the result, in case it fails and he doesn't have enough balance
            // the following transferFrom should be fail. This prevents DoS attacks from using a signature
            // before the smartcontract call
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
            require(
                sig == _PERMIT_SIGNATURE_DAI,
                "Bridge::_permit: NOT_VALID_CALL"
            );

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
            require(
                holder == msg.sender,
                "Bridge::_permit: PERMIT_OWNER_MUST_BE_THE_SENDER"
            );
            require(
                spender == address(this),
                "Bridge::_permit: SPENDER_MUST_BE_THIS"
            );

            // we call without checking the result, in case it fails and he doesn't have enough balance
            // the following transferFrom should be fail. This prevents DoS attacks from using a signature
            // before the smartcontract call
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
}
