// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Mock CCTP TokenMessengerV2 that records calls to depositForBurnWithHook.
contract MockTokenMessengerV2 {
    struct DepositForBurnWithHookCall {
        uint256 amount;
        uint32 destinationDomain;
        bytes32 mintRecipient;
        address burnToken;
        bytes32 destinationCaller;
        uint256 maxFee;
        uint32 minFinalityThreshold;
        bytes hookData;
    }

    DepositForBurnWithHookCall[] public calls;

    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external returns (uint64 nonce) {
        calls.push(
            DepositForBurnWithHookCall({
                amount: amount,
                destinationDomain: destinationDomain,
                mintRecipient: mintRecipient,
                burnToken: burnToken,
                destinationCaller: destinationCaller,
                maxFee: maxFee,
                minFinalityThreshold: minFinalityThreshold,
                hookData: hookData
            })
        );
        return uint64(calls.length);
    }

    function getCallCount() external view returns (uint256) {
        return calls.length;
    }

    function getLastCall() external view returns (DepositForBurnWithHookCall memory) {
        require(calls.length > 0, "No calls recorded");
        return calls[calls.length - 1];
    }
}
