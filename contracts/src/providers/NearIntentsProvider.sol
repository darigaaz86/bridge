// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IBridgeProvider} from "../interfaces/IBridgeProvider.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title NearIntentsProvider
/// @notice Bridge provider that routes tokens to a NEAR Intents deposit address.
contract NearIntentsProvider is IBridgeProvider {
    using SafeERC20 for IERC20;

    error ZeroDepositAddress();

    /// @inheritdoc IBridgeProvider
    function executeBridge(
        address token,
        uint256 amount,
        bytes calldata data
    ) external payable override {
        (address depositAddress) = abi.decode(data, (address));
        if (depositAddress == address(0)) revert ZeroDepositAddress();
        IERC20(token).safeTransfer(depositAddress, amount);
    }
}
