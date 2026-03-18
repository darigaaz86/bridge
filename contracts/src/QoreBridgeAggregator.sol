// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IBridgeProvider} from "./interfaces/IBridgeProvider.sol";

contract QoreBridgeAggregator is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // --- Custom errors ---
    error FeeBpsTooHigh(uint16 feeBps);
    error ZeroTreasuryAddress();
    error ProviderNotRegistered(bytes32 providerId);
    error ProviderIsDisabled(bytes32 providerId);
    error ProviderAlreadyRegistered(bytes32 providerId);
    error ZeroAmount();

    // --- Events ---
    event BridgeInitiated(
        uint256 indexed nonce,
        address indexed sender,
        bytes32 recipient,
        uint256 sourceChainId,
        uint256 destinationChainId,
        address token,
        uint256 amount,
        uint256 platformFee,
        bytes32 providerId,
        bytes providerData
    );
    event FeesSwept(address indexed token, address indexed treasury, uint256 amount);
    event ProviderRegistered(bytes32 indexed providerId, address providerContract);
    event ProviderDisabled(bytes32 indexed providerId);
    event ProviderEnabled(bytes32 indexed providerId);

    // --- Storage ---
    uint16 public feeBps;
    address public treasury;
    uint256 public nonce;

    struct ProviderInfo {
        address providerContract;
        bool enabled;
    }

    mapping(bytes32 => ProviderInfo) private _providers;

    uint16 public constant ABSOLUTE_MAX_FEE_BPS = 500; // 5% hard ceiling
    uint16 public maxFeeBps;

    // --- Constructor ---
    constructor(
        address owner_,
        address treasury_,
        uint16 feeBps_,
        uint16 maxFeeBps_
    ) Ownable(owner_) {
        if (treasury_ == address(0)) revert ZeroTreasuryAddress();
        if (maxFeeBps_ > ABSOLUTE_MAX_FEE_BPS) revert FeeBpsTooHigh(maxFeeBps_);
        if (feeBps_ > maxFeeBps_) revert FeeBpsTooHigh(feeBps_);
        treasury = treasury_;
        feeBps = feeBps_;
        maxFeeBps = maxFeeBps_;
    }

    // --- Bridge ---
    function bridge(
        bytes32 providerId,
        address token,
        uint256 amount,
        uint256 destinationChainId,
        bytes32 recipient,
        bytes calldata providerData
    ) external payable nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        ProviderInfo storage provider = _providers[providerId];
        if (provider.providerContract == address(0)) revert ProviderNotRegistered(providerId);
        if (!provider.enabled) revert ProviderIsDisabled(providerId);

        // Calculate fee
        uint256 platformFee = (amount * feeBps) / 10_000;
        uint256 bridgeAmount = amount - platformFee;

        // Pull tokens from user (full amount)
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Transfer bridgeAmount to provider contract
        IERC20(token).safeTransfer(provider.providerContract, bridgeAmount);

        // Call provider's executeBridge, forwarding any msg.value (e.g. for LZ fees)
        IBridgeProvider(provider.providerContract).executeBridge{value: msg.value}(
            token,
            bridgeAmount,
            providerData
        );

        // Increment nonce and emit event
        nonce++;
        emit BridgeInitiated(
            nonce,
            msg.sender,
            recipient,
            block.chainid,
            destinationChainId,
            token,
            amount,
            platformFee,
            providerId,
            providerData
        );
    }

    // --- Provider Registry ---
    function registerProvider(bytes32 providerId, address providerContract) external onlyOwner {
        if (_providers[providerId].providerContract != address(0)) {
            revert ProviderAlreadyRegistered(providerId);
        }
        _providers[providerId] = ProviderInfo({
            providerContract: providerContract,
            enabled: true
        });
        emit ProviderRegistered(providerId, providerContract);
    }

    function disableProvider(bytes32 providerId) external onlyOwner {
        if (_providers[providerId].providerContract == address(0)) {
            revert ProviderNotRegistered(providerId);
        }
        _providers[providerId].enabled = false;
        emit ProviderDisabled(providerId);
    }

    function enableProvider(bytes32 providerId) external onlyOwner {
        if (_providers[providerId].providerContract == address(0)) {
            revert ProviderNotRegistered(providerId);
        }
        _providers[providerId].enabled = true;
        emit ProviderEnabled(providerId);
    }

    function getProvider(bytes32 providerId) external view returns (address) {
        return _providers[providerId].providerContract;
    }

    function isProviderEnabled(bytes32 providerId) external view returns (bool) {
        return _providers[providerId].enabled;
    }

    // --- Admin ---
    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > maxFeeBps) revert FeeBpsTooHigh(newFeeBps);
        feeBps = newFeeBps;
    }

    function setMaxFeeBps(uint16 newMaxFeeBps) external onlyOwner {
        if (newMaxFeeBps > ABSOLUTE_MAX_FEE_BPS) revert FeeBpsTooHigh(newMaxFeeBps);
        maxFeeBps = newMaxFeeBps;
        // If current fee exceeds new max, clamp it down
        if (feeBps > newMaxFeeBps) {
            feeBps = newMaxFeeBps;
        }
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroTreasuryAddress();
        treasury = newTreasury;
    }

    function sweepFees(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(treasury, balance);
        emit FeesSwept(token, treasury, balance);
    }

    // --- Pause ---
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
