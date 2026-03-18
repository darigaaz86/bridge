// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {QoreBridgeAggregator} from "../src/QoreBridgeAggregator.sol";
import {CctpProvider} from "../src/providers/CctpProvider.sol";
import {Usdt0Provider} from "../src/providers/Usdt0Provider.sol";
import {NearIntentsProvider} from "../src/providers/NearIntentsProvider.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockTokenMessengerV2} from "./mocks/MockTokenMessengerV2.sol";
import {MockOFT} from "./mocks/MockOFT.sol";
import {IBridgeProvider} from "../src/interfaces/IBridgeProvider.sol";

contract QoreBridgeAggregatorTest is Test {
    // Re-declare events for vm.expectEmit
    event BridgeInitiated(
        uint256 indexed nonce, address indexed sender, bytes32 recipient,
        uint256 sourceChainId, uint256 destinationChainId, address token,
        uint256 amount, uint256 platformFee, bytes32 providerId, bytes providerData
    );
    event FeesSwept(address indexed token, address indexed treasury, uint256 amount);
    event ProviderRegistered(bytes32 indexed providerId, address providerContract);
    event ProviderDisabled(bytes32 indexed providerId);
    event ProviderEnabled(bytes32 indexed providerId);

    QoreBridgeAggregator public agg;
    MockERC20 public usdc;
    MockERC20 public usdt;
    MockTokenMessengerV2 public mockCctp;
    MockOFT public mockOft;
    CctpProvider public cctpProv;
    Usdt0Provider public usdt0Prov;
    NearIntentsProvider public nearProv;

    address public owner = address(0xA);
    address public treasury = address(0xB);
    address public user = address(0xC);
    address public attacker = address(0xD);

    bytes32 constant CCTP_ID = keccak256("cctp");
    bytes32 constant USDT0_ID = keccak256("usdt0");
    bytes32 constant NEAR_ID = keccak256("near-intents");

    function setUp() public {
        usdc = new MockERC20("USDC", "USDC", 6);
        usdt = new MockERC20("USDT", "USDT", 6);
        mockCctp = new MockTokenMessengerV2();
        mockOft = new MockOFT();

        vm.prank(owner);
        agg = new QoreBridgeAggregator(owner, treasury, 5, 100); // 5 bps, max 100

        cctpProv = new CctpProvider();
        cctpProv.initialize(address(mockCctp), address(usdc));
        usdt0Prov = new Usdt0Provider();
        usdt0Prov.initialize(address(mockOft));
        nearProv = new NearIntentsProvider();

        vm.startPrank(owner);
        agg.registerProvider(CCTP_ID, address(cctpProv));
        agg.registerProvider(USDT0_ID, address(usdt0Prov));
        agg.registerProvider(NEAR_ID, address(nearProv));
        vm.stopPrank();

        // Fund user
        usdc.mint(user, 1_000_000e6);
        usdt.mint(user, 1_000_000e6);
        vm.startPrank(user);
        usdc.approve(address(agg), type(uint256).max);
        usdt.approve(address(agg), type(uint256).max);
        vm.stopPrank();
    }

    // ================================================================
    // Property 1: Fee calculation invariant
    // ================================================================

    /// @dev Fuzz: fee = (amount * feeBps) / 10000, forwarded = amount - fee
    function test_feeCalculation(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000e6);
        uint256 expectedFee = (amount * 5) / 10_000;
        uint256 expectedForward = amount - expectedFee;

        usdc.mint(user, amount);
        vm.prank(user);
        usdc.approve(address(agg), amount);

        address depositAddr = address(0x1234);
        bytes memory data = abi.encode(depositAddr);

        vm.prank(user);
        agg.bridge(NEAR_ID, address(usdc), amount, 42161,
            bytes32(uint256(uint160(user))), data);

        // Fee stays in aggregator
        assertEq(usdc.balanceOf(address(agg)), expectedFee);
        // Deposit address gets the forwarded amount
        assertEq(usdc.balanceOf(depositAddr), expectedForward);
    }

    // ================================================================
    // Property 5: Nonce monotonicity
    // ================================================================

    function test_nonceMonotonicity() public {
        address depositAddr = address(0x5678);
        bytes memory data = abi.encode(depositAddr);

        for (uint256 i = 1; i <= 5; i++) {
            vm.prank(user);
            agg.bridge(NEAR_ID, address(usdc), 100e6, 42161,
                bytes32(uint256(uint160(user))), data);
            assertEq(agg.nonce(), i);
        }
    }

    // ================================================================
    // Property 7: Fee cap enforcement
    // ================================================================

    function test_feeCapEnforcement(uint16 feeBps) public {
        vm.assume(feeBps > 100);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(
            QoreBridgeAggregator.FeeBpsTooHigh.selector, feeBps));
        agg.setFeeBps(feeBps);
    }

    function test_setFeeBpsValid() public {
        vm.prank(owner);
        agg.setFeeBps(100); // max allowed
        assertEq(agg.feeBps(), 100);

        vm.prank(owner);
        agg.setFeeBps(0); // zero fee
        assertEq(agg.feeBps(), 0);
    }

    function test_setMaxFeeBps() public {
        vm.prank(owner);
        agg.setMaxFeeBps(200); // raise max to 2%
        assertEq(agg.maxFeeBps(), 200);

        // Now we can set fee above old max
        vm.prank(owner);
        agg.setFeeBps(150);
        assertEq(agg.feeBps(), 150);
    }

    function test_setMaxFeeBpsAboveAbsoluteCeiling() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(
            QoreBridgeAggregator.FeeBpsTooHigh.selector, 501));
        agg.setMaxFeeBps(501);
    }

    function test_setMaxFeeBpsClampsCurrentFee() public {
        vm.prank(owner);
        agg.setFeeBps(50);

        // Lower max below current fee — should clamp feeBps down
        vm.prank(owner);
        agg.setMaxFeeBps(30);
        assertEq(agg.maxFeeBps(), 30);
        assertEq(agg.feeBps(), 30);
    }

    // ================================================================
    // Property 8: Access control on sweep
    // ================================================================

    function test_sweepOnlyOwner() public {
        vm.prank(attacker);
        vm.expectRevert();
        agg.sweepFees(address(usdc));
    }

    function test_sweepTransfersToTreasury() public {
        // Bridge to accumulate fees
        vm.prank(user);
        agg.bridge(NEAR_ID, address(usdc), 10_000e6, 42161,
            bytes32(uint256(uint160(user))),
            abi.encode(address(0x1234)));

        uint256 aggBal = usdc.balanceOf(address(agg));
        assertGt(aggBal, 0);

        uint256 treasuryBefore = usdc.balanceOf(treasury);
        vm.prank(owner);
        agg.sweepFees(address(usdc));

        assertEq(usdc.balanceOf(address(agg)), 0);
        assertEq(usdc.balanceOf(treasury), treasuryBefore + aggBal);
    }

    // ================================================================
    // Property 10: Provider registration immutability
    // ================================================================

    function test_providerRegistrationImmutable() public {
        // Re-registering same ID should revert
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(
            QoreBridgeAggregator.ProviderAlreadyRegistered.selector, CCTP_ID));
        agg.registerProvider(CCTP_ID, address(0x9999));
    }

    function test_providerDisableEnable() public {
        vm.prank(owner);
        agg.disableProvider(CCTP_ID);
        assertFalse(agg.isProviderEnabled(CCTP_ID));
        // Address still stored
        assertEq(agg.getProvider(CCTP_ID), address(cctpProv));

        vm.prank(owner);
        agg.enableProvider(CCTP_ID);
        assertTrue(agg.isProviderEnabled(CCTP_ID));
    }

    // ================================================================
    // Property 11: Unregistered or disabled provider reverts
    // ================================================================

    function test_bridgeUnregisteredProvider() public {
        bytes32 fakeId = keccak256("fake");
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(
            QoreBridgeAggregator.ProviderNotRegistered.selector, fakeId));
        agg.bridge(fakeId, address(usdc), 100e6, 42161,
            bytes32(uint256(uint160(user))), abi.encode(address(0x1)));
    }

    function test_bridgeDisabledProvider() public {
        vm.prank(owner);
        agg.disableProvider(NEAR_ID);

        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(
            QoreBridgeAggregator.ProviderIsDisabled.selector, NEAR_ID));
        agg.bridge(NEAR_ID, address(usdc), 100e6, 42161,
            bytes32(uint256(uint160(user))), abi.encode(address(0x1)));
    }

    // ================================================================
    // Property 12: Pause halts all bridge operations
    // ================================================================

    function test_pauseBlocksBridge() public {
        vm.prank(owner);
        agg.pause();

        vm.prank(user);
        vm.expectRevert();
        agg.bridge(NEAR_ID, address(usdc), 100e6, 42161,
            bytes32(uint256(uint160(user))), abi.encode(address(0x1)));

        vm.prank(owner);
        agg.unpause();

        // Should work again
        vm.prank(user);
        agg.bridge(NEAR_ID, address(usdc), 100e6, 42161,
            bytes32(uint256(uint160(user))), abi.encode(address(0x1)));
    }

    // ================================================================
    // Zero amount reverts
    // ================================================================

    function test_zeroAmountReverts() public {
        vm.prank(user);
        vm.expectRevert(QoreBridgeAggregator.ZeroAmount.selector);
        agg.bridge(NEAR_ID, address(usdc), 0, 42161,
            bytes32(uint256(uint160(user))), abi.encode(address(0x1)));
    }

    // ================================================================
    // Access control: non-owner cannot admin
    // ================================================================

    function test_nonOwnerCannotRegister() public {
        vm.prank(attacker);
        vm.expectRevert();
        agg.registerProvider(keccak256("new"), address(0x1));
    }

    function test_nonOwnerCannotSetFee() public {
        vm.prank(attacker);
        vm.expectRevert();
        agg.setFeeBps(10);
    }

    function test_nonOwnerCannotSetTreasury() public {
        vm.prank(attacker);
        vm.expectRevert();
        agg.setTreasury(attacker);
    }

    function test_nonOwnerCannotPause() public {
        vm.prank(attacker);
        vm.expectRevert();
        agg.pause();
    }

    function test_nonOwnerCannotDisableProvider() public {
        vm.prank(attacker);
        vm.expectRevert();
        agg.disableProvider(CCTP_ID);
    }

    // ================================================================
    // Property 2: Amount forwarding invariant
    // ================================================================

    /// @dev Fuzz: provider always receives exactly amount - fee
    function test_amountForwardingInvariant(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000e6);
        usdc.mint(user, amount);
        vm.prank(user);
        usdc.approve(address(agg), amount);

        address depositAddr = address(0xABCD);
        uint256 fee = (amount * 5) / 10_000;
        uint256 forwarded = amount - fee;

        vm.prank(user);
        agg.bridge(NEAR_ID, address(usdc), amount, 42161,
            bytes32(uint256(uint160(user))), abi.encode(depositAddr));

        // NearIntentsProvider forwards to depositAddr
        assertEq(usdc.balanceOf(depositAddr), forwarded);
        // Fee stays in aggregator
        assertEq(usdc.balanceOf(address(agg)), fee);
        // Total conservation: depositAddr + aggregator = amount
        assertEq(usdc.balanceOf(depositAddr) + usdc.balanceOf(address(agg)), amount);
    }

    // ================================================================
    // Property 3: Event emission completeness
    // ================================================================

    function test_bridgeEmitsCorrectEvent() public {
        address depositAddr = address(0x9999);
        bytes memory data = abi.encode(depositAddr);
        uint256 amount = 10_000e6;
        uint256 fee = (amount * 5) / 10_000;

        vm.expectEmit(true, true, true, true);
        emit BridgeInitiated(
            1,          // nonce
            user,       // sender
            bytes32(uint256(uint160(user))), // recipient
            block.chainid,
            42161,      // destinationChainId
            address(usdc),
            amount,
            fee,
            NEAR_ID,
            data
        );

        vm.prank(user);
        agg.bridge(NEAR_ID, address(usdc), amount, 42161,
            bytes32(uint256(uint160(user))), data);
    }

    function test_sweepEmitsEvent() public {
        // Accumulate fees
        vm.prank(user);
        agg.bridge(NEAR_ID, address(usdc), 10_000e6, 42161,
            bytes32(uint256(uint160(user))), abi.encode(address(0x1234)));

        uint256 bal = usdc.balanceOf(address(agg));

        vm.expectEmit(true, true, false, true);
        emit FeesSwept(address(usdc), treasury, bal);

        vm.prank(owner);
        agg.sweepFees(address(usdc));
    }

    function test_providerRegisteredEvent() public {
        bytes32 newId = keccak256("new-provider");
        address newAddr = address(0xFEED);

        vm.expectEmit(true, false, false, true);
        emit ProviderRegistered(newId, newAddr);

        vm.prank(owner);
        agg.registerProvider(newId, newAddr);
    }

    function test_providerDisabledEnabledEvents() public {
        vm.expectEmit(true, false, false, false);
        emit ProviderDisabled(CCTP_ID);
        vm.prank(owner);
        agg.disableProvider(CCTP_ID);

        vm.expectEmit(true, false, false, false);
        emit ProviderEnabled(CCTP_ID);
        vm.prank(owner);
        agg.enableProvider(CCTP_ID);
    }

    // ================================================================
    // Property 4: Provider data encoding correctness (CCTP)
    // ================================================================

    function test_cctpProviderDataPassthrough() public {
        // Encode CCTP provider data
        uint32 destDomain = 3; // Arbitrum
        bytes32 mintRecipient = bytes32(uint256(uint160(user)));
        uint256 maxFee = 1e6;
        uint32 minFinality = 1000;
        bytes memory hookData = "";
        bytes memory providerData = abi.encode(destDomain, mintRecipient, maxFee, minFinality, hookData);

        uint256 amount = 1_000e6;
        uint256 fee = (amount * 5) / 10_000;
        uint256 bridgeAmount = amount - fee;

        vm.prank(user);
        agg.bridge(CCTP_ID, address(usdc), amount, 42161,
            bytes32(uint256(uint160(user))), providerData);

        // Verify mock CCTP received correct params
        assertEq(mockCctp.getCallCount(), 1);
        MockTokenMessengerV2.DepositForBurnWithHookCall memory call = mockCctp.getLastCall();
        assertEq(call.amount, bridgeAmount);
        assertEq(call.destinationDomain, destDomain);
        assertEq(call.mintRecipient, mintRecipient);
        assertEq(call.burnToken, address(usdc));
        assertEq(call.maxFee, maxFee);
        assertEq(call.minFinalityThreshold, minFinality);
    }

    // ================================================================
    // Property 6: Admin parameter updates (fuzz)
    // ================================================================

    function test_setFeeBpsFuzz(uint16 newFee) public {
        if (newFee > 100) { // maxFeeBps is 100 in setUp
            vm.prank(owner);
            vm.expectRevert(abi.encodeWithSelector(
                QoreBridgeAggregator.FeeBpsTooHigh.selector, newFee));
            agg.setFeeBps(newFee);
        } else {
            vm.prank(owner);
            agg.setFeeBps(newFee);
            assertEq(agg.feeBps(), newFee);
        }
    }

    function test_setTreasuryFuzz(address newTreasury) public {
        if (newTreasury == address(0)) {
            vm.prank(owner);
            vm.expectRevert(QoreBridgeAggregator.ZeroTreasuryAddress.selector);
            agg.setTreasury(newTreasury);
        } else {
            vm.prank(owner);
            agg.setTreasury(newTreasury);
            assertEq(agg.treasury(), newTreasury);
        }
    }

    // ================================================================
    // Property 9: Sweep accumulated fees (fuzz)
    // ================================================================

    function test_sweepAccumulatedFeesFuzz(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000e6);
        usdc.mint(user, amount);
        vm.prank(user);
        usdc.approve(address(agg), amount);

        vm.prank(user);
        agg.bridge(NEAR_ID, address(usdc), amount, 42161,
            bytes32(uint256(uint160(user))), abi.encode(address(0x1234)));

        uint256 expectedFee = (amount * 5) / 10_000;
        assertEq(usdc.balanceOf(address(agg)), expectedFee);

        uint256 treasuryBefore = usdc.balanceOf(treasury);
        vm.prank(owner);
        agg.sweepFees(address(usdc));

        assertEq(usdc.balanceOf(address(agg)), 0);
        assertEq(usdc.balanceOf(treasury), treasuryBefore + expectedFee);
    }

    // ================================================================
    // Provider unit tests: NearIntentsProvider
    // ================================================================

    function test_nearIntentsZeroDepositReverts() public {
        vm.prank(user);
        vm.expectRevert(NearIntentsProvider.ZeroDepositAddress.selector);
        agg.bridge(NEAR_ID, address(usdc), 100e6, 42161,
            bytes32(uint256(uint160(user))), abi.encode(address(0)));
    }

    function test_nearIntentsForwardsToDeposit() public {
        address deposit = address(0xCAFE);
        uint256 amount = 500e6;
        uint256 fee = (amount * 5) / 10_000;

        vm.prank(user);
        agg.bridge(NEAR_ID, address(usdc), amount, 42161,
            bytes32(uint256(uint160(user))), abi.encode(deposit));

        assertEq(usdc.balanceOf(deposit), amount - fee);
    }

    // ================================================================
    // Provider unit tests: CctpProvider
    // ================================================================

    function test_cctpInvalidTokenReverts() public {
        // CCTP only accepts USDC; try with USDT
        bytes memory data = abi.encode(
            uint32(3), bytes32(uint256(uint160(user))), uint256(1e6), uint32(1000), bytes("")
        );

        // Need to register a CCTP provider that expects USDC but we send USDT
        // The CctpProvider checks token != usdc
        vm.prank(user);
        vm.expectRevert(CctpProvider.InvalidToken.selector);
        agg.bridge(CCTP_ID, address(usdt), 100e6, 42161,
            bytes32(uint256(uint160(user))), data);
    }

    // ================================================================
    // Provider unit tests: Usdt0Provider
    // ================================================================

    function test_usdt0ProviderForwardsToOFT() public {
        // Encode USDT0 provider data
        uint32 dstEid = 30110; // Arbitrum LZ eid
        bytes32 recipient = bytes32(uint256(uint160(user)));
        uint256 minAmountLD = 90e6;
        bytes memory extraOptions = "";
        bytes memory composeMsg = "";
        bytes memory oftCmd = "";
        bytes memory data = abi.encode(dstEid, recipient, minAmountLD, extraOptions, composeMsg, oftCmd);

        uint256 amount = 100e6;

        // Fund user with ETH for LZ native fee
        vm.deal(user, 1 ether);

        vm.prank(user);
        agg.bridge{value: 0.01 ether}(USDT0_ID, address(usdt), amount, 42161,
            bytes32(uint256(uint160(user))), data);

        assertEq(mockOft.getCallCount(), 1);
    }

    // ================================================================
    // Constructor edge cases
    // ================================================================

    function test_constructorZeroTreasuryReverts() public {
        vm.expectRevert(QoreBridgeAggregator.ZeroTreasuryAddress.selector);
        new QoreBridgeAggregator(owner, address(0), 5, 100);
    }

    function test_constructorFeeTooHighReverts() public {
        vm.expectRevert(abi.encodeWithSelector(
            QoreBridgeAggregator.FeeBpsTooHigh.selector, 501));
        new QoreBridgeAggregator(owner, treasury, 5, 501);
    }

    function test_constructorFeeAboveMaxReverts() public {
        vm.expectRevert(abi.encodeWithSelector(
            QoreBridgeAggregator.FeeBpsTooHigh.selector, 200));
        new QoreBridgeAggregator(owner, treasury, 200, 100);
    }

    // ================================================================
    // Reentrancy attack: malicious provider
    // ================================================================

    function test_reentrancyViaMaliciousProvider() public {
        // Deploy malicious provider that tries to re-enter bridge()
        MaliciousProvider malicious = new MaliciousProvider(address(agg), address(usdc));
        bytes32 malId = keccak256("malicious");

        vm.prank(owner);
        agg.registerProvider(malId, address(malicious));

        // Fund malicious contract so it can attempt re-entry
        usdc.mint(address(malicious), 1_000e6);

        vm.prank(user);
        vm.expectRevert(); // ReentrancyGuard should block
        agg.bridge(malId, address(usdc), 100e6, 42161,
            bytes32(uint256(uint160(user))), abi.encode(address(0x1)));
    }

    // ================================================================
    // Disable/enable unregistered provider reverts
    // ================================================================

    function test_cctpDoubleInitializeReverts() public {
        CctpProvider p = new CctpProvider();
        p.initialize(address(mockCctp), address(usdc));
        vm.expectRevert(CctpProvider.AlreadyInitialized.selector);
        p.initialize(address(mockCctp), address(usdc));
    }

    function test_usdt0DoubleInitializeReverts() public {
        Usdt0Provider p = new Usdt0Provider();
        p.initialize(address(mockOft));
        vm.expectRevert(Usdt0Provider.AlreadyInitialized.selector);
        p.initialize(address(mockOft));
    }

    // ================================================================
    // Disable/enable unregistered provider reverts
    // ================================================================

    function test_disableUnregisteredProviderReverts() public {
        bytes32 fakeId = keccak256("nonexistent");
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(
            QoreBridgeAggregator.ProviderNotRegistered.selector, fakeId));
        agg.disableProvider(fakeId);
    }

    function test_enableUnregisteredProviderReverts() public {
        bytes32 fakeId = keccak256("nonexistent");
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(
            QoreBridgeAggregator.ProviderNotRegistered.selector, fakeId));
        agg.enableProvider(fakeId);
    }

    // ================================================================
    // Sweep with zero balance (no revert, just transfers 0)
    // ================================================================

    function test_sweepZeroBalance() public {
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        vm.prank(owner);
        agg.sweepFees(address(usdc));
        assertEq(usdc.balanceOf(treasury), treasuryBefore);
    }

    // ================================================================
    // Multiple bridges accumulate fees correctly
    // ================================================================

    function test_multipleBridgesAccumulateFees() public {
        address deposit = address(0xAAAA);
        uint256 totalFees;

        for (uint256 i = 0; i < 10; i++) {
            uint256 amount = (i + 1) * 100e6;
            usdc.mint(user, amount);
            vm.prank(user);
            usdc.approve(address(agg), amount);
            vm.prank(user);
            agg.bridge(NEAR_ID, address(usdc), amount, 42161,
                bytes32(uint256(uint160(user))), abi.encode(deposit));
            totalFees += (amount * 5) / 10_000;
        }

        assertEq(usdc.balanceOf(address(agg)), totalFees);

        // Sweep all at once
        vm.prank(owner);
        agg.sweepFees(address(usdc));
        assertEq(usdc.balanceOf(address(agg)), 0);
        assertGe(usdc.balanceOf(treasury), totalFees);
    }

    // ================================================================
    // Fee = 0 bps means no fee taken
    // ================================================================

    function test_zeroFeeBpsMeansNoFee() public {
        vm.prank(owner);
        agg.setFeeBps(0);

        address deposit = address(0xBBBB);
        uint256 amount = 1_000e6;

        vm.prank(user);
        agg.bridge(NEAR_ID, address(usdc), amount, 42161,
            bytes32(uint256(uint160(user))), abi.encode(deposit));

        assertEq(usdc.balanceOf(address(agg)), 0);
        assertEq(usdc.balanceOf(deposit), amount);
    }

    // ================================================================
    // Non-owner cannot enable provider
    // ================================================================

    function test_nonOwnerCannotEnableProvider() public {
        vm.prank(owner);
        agg.disableProvider(CCTP_ID);

        vm.prank(attacker);
        vm.expectRevert();
        agg.enableProvider(CCTP_ID);
    }

    function test_nonOwnerCannotUnpause() public {
        vm.prank(owner);
        agg.pause();

        vm.prank(attacker);
        vm.expectRevert();
        agg.unpause();
    }
}

// ================================================================
// Malicious provider for reentrancy testing
// ================================================================

contract MaliciousProvider is IBridgeProvider {
    address public aggregator;
    address public token;

    constructor(address _aggregator, address _token) {
        aggregator = _aggregator;
        token = _token;
    }

    function executeBridge(
        address,
        uint256,
        bytes calldata
    ) external payable override {
        // Attempt reentrancy: call bridge() again
        QoreBridgeAggregator(aggregator).bridge(
            keccak256("malicious"),
            token,
            1e6,
            42161,
            bytes32(uint256(uint160(address(this)))),
            abi.encode(address(this))
        );
    }
}
