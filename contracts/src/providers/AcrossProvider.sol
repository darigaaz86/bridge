// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IBridgeProvider} from "../interfaces/IBridgeProvider.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AcrossProvider
/// @notice Bridge provider that routes tokens via Across Protocol's SpokePool.depositV3().
///         The aggregator transfers tokens here, then this contract approves the
///         SpokePool and calls depositV3.
contract AcrossProvider is IBridgeProvider {
    using SafeERC20 for IERC20;

    error ZeroSpokePool();

    /// @inheritdoc IBridgeProvider
    function executeBridge(
        address token,
        uint256 amount,
        bytes calldata data
    ) external payable override {
        (
            address spokePool,
            address depositor,
            address recipient,
            address outputToken,
            uint256 outputAmount,
            uint256 destinationChainId,
            address exclusiveRelayer,
            uint32 quoteTimestamp,
            uint32 fillDeadline,
            uint32 exclusivityDeadline
        ) = abi.decode(
            data,
            (address, address, address, address, uint256, uint256, address, uint32, uint32, uint32)
        );

        if (spokePool == address(0)) revert ZeroSpokePool();

        // Approve SpokePool to pull tokens
        IERC20(token).safeIncreaseAllowance(spokePool, amount);

        // Call depositV3 on the SpokePool
        ISpokePool(spokePool).depositV3(
            depositor,
            recipient,
            token,
            outputToken,
            amount,
            outputAmount,
            destinationChainId,
            exclusiveRelayer,
            quoteTimestamp,
            fillDeadline,
            exclusivityDeadline,
            "" // empty message
        );
    }
}

/// @notice Minimal interface for Across SpokePool.depositV3
interface ISpokePool {
    function depositV3(
        address depositor,
        address recipient,
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 destinationChainId,
        address exclusiveRelayer,
        uint32 quoteTimestamp,
        uint32 fillDeadline,
        uint32 exclusivityDeadline,
        bytes calldata message
    ) external payable;
}
