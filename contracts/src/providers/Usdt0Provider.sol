// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IBridgeProvider} from "../interfaces/IBridgeProvider.sol";
import {IOFT} from "../interfaces/IOFT.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Usdt0Provider
/// @notice Bridge provider that routes USDT0 via LayerZero OFT.send().
///         Uses initialize() instead of constructor args so CREATE2 address is
///         identical across chains.
contract Usdt0Provider is IBridgeProvider {
    using SafeERC20 for IERC20;

    address public oftContract;
    bool public initialized;

    error AlreadyInitialized();
    error NotInitialized();

    function initialize(address _oftContract) external {
        if (initialized) revert AlreadyInitialized();
        initialized = true;
        oftContract = _oftContract;
    }

    /// @inheritdoc IBridgeProvider
    function executeBridge(
        address token,
        uint256 amount,
        bytes calldata data
    ) external payable override {
        if (!initialized) revert NotInitialized();

        (
            uint32 dstEid,
            bytes32 recipient,
            uint256 minAmountLD,
            bytes memory extraOptions,
            bytes memory composeMsg,
            bytes memory oftCmd
        ) = abi.decode(data, (uint32, bytes32, uint256, bytes, bytes, bytes));

        IERC20(token).safeIncreaseAllowance(oftContract, amount);

        IOFT.SendParam memory sendParam = IOFT.SendParam({
            dstEid: dstEid,
            to: recipient,
            amountLD: amount,
            minAmountLD: minAmountLD,
            extraOptions: extraOptions,
            composeMsg: composeMsg,
            oftCmd: oftCmd
        });

        IOFT(oftContract).send{value: msg.value}(
            sendParam,
            IOFT.MessagingFee({nativeFee: msg.value, lzTokenFee: 0}),
            msg.sender
        );
    }
}
