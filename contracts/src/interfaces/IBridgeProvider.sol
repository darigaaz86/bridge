// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBridgeProvider {
    /// @notice Execute the bridge call. Tokens have already been transferred to this contract.
    /// @param token The token being bridged
    /// @param amount The amount after fee deduction
    /// @param data Provider-specific calldata
    function executeBridge(
        address token,
        uint256 amount,
        bytes calldata data
    ) external payable;
}
