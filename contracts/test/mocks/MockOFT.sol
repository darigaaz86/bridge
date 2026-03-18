// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Mock LayerZero OFT contract that records calls to send and accepts msg.value.
contract MockOFT {
    struct SendParam {
        uint32 dstEid;
        bytes32 to;
        uint256 amountLD;
        uint256 minAmountLD;
        bytes extraOptions;
        bytes composeMsg;
        bytes oftCmd;
    }

    struct MessagingFee {
        uint256 nativeFee;
        uint256 lzTokenFee;
    }

    struct MessagingReceipt {
        bytes32 guid;
        uint64 nonce;
        MessagingFee fee;
    }

    struct OFTReceipt {
        uint256 amountSentLD;
        uint256 amountReceivedLD;
    }

    struct SendCall {
        SendParam sendParam;
        MessagingFee fee;
        address refundAddress;
        uint256 msgValue;
    }

    SendCall[] public sendCalls;

    function send(
        SendParam calldata _sendParam,
        MessagingFee calldata _fee,
        address _refundAddress
    ) external payable returns (MessagingReceipt memory, OFTReceipt memory) {
        sendCalls.push(
            SendCall({
                sendParam: _sendParam,
                fee: _fee,
                refundAddress: _refundAddress,
                msgValue: msg.value
            })
        );

        MessagingReceipt memory receipt = MessagingReceipt({
            guid: keccak256(abi.encodePacked(sendCalls.length)),
            nonce: uint64(sendCalls.length),
            fee: _fee
        });

        OFTReceipt memory oftReceipt = OFTReceipt({
            amountSentLD: _sendParam.amountLD,
            amountReceivedLD: _sendParam.amountLD
        });

        return (receipt, oftReceipt);
    }

    function getCallCount() external view returns (uint256) {
        return sendCalls.length;
    }

    function getLastCall() external view returns (SendCall memory) {
        require(sendCalls.length > 0, "No calls recorded");
        return sendCalls[sendCalls.length - 1];
    }
}
