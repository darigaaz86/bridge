// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IBridgeProvider} from "../interfaces/IBridgeProvider.sol";
import {ITokenMessengerV2} from "../interfaces/ITokenMessengerV2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title CctpProvider
/// @notice Bridge provider that routes USDC via Circle's CCTP TokenMessengerV2.
///         Uses initialize() instead of constructor args so CREATE2 address is
///         identical across chains.
contract CctpProvider is IBridgeProvider {
    using SafeERC20 for IERC20;

    address public tokenMessengerV2;
    address public usdc;
    bool public initialized;

    error InvalidToken();
    error AlreadyInitialized();
    error NotInitialized();

    function initialize(address _tokenMessengerV2, address _usdc) external {
        if (initialized) revert AlreadyInitialized();
        initialized = true;
        tokenMessengerV2 = _tokenMessengerV2;
        usdc = _usdc;
        IERC20(_usdc).safeIncreaseAllowance(_tokenMessengerV2, type(uint256).max);
    }

    /// @inheritdoc IBridgeProvider
    function executeBridge(
        address token,
        uint256 amount,
        bytes calldata data
    ) external payable override {
        if (!initialized) revert NotInitialized();
        if (token != usdc) revert InvalidToken();

        (
            uint32 destDomain,
            bytes32 mintRecipient,
            uint256 maxFee,
            uint32 minFinalityThreshold,
            bytes memory hookData
        ) = abi.decode(data, (uint32, bytes32, uint256, uint32, bytes));

        ITokenMessengerV2(tokenMessengerV2).depositForBurnWithHook(
            amount,
            destDomain,
            mintRecipient,
            token,
            bytes32(0),
            maxFee,
            minFinalityThreshold,
            hookData
        );
    }
}
