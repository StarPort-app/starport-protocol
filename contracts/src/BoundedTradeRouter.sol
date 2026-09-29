// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ExactAsset, GuardedEntry} from "./ExactAsset.sol";
import {ActionNonces} from "./ActionNonces.sol";

struct TradeExecution {
    address user;
    address assetIn;
    address assetOut;
    address recipient;
    uint256 amountIn;
    uint256 minAmountOut;
    uint256 deadline;
    bytes32 quoteId;
    bytes32 marketContextHash;
}
interface ITradePolicy { function canExecute(TradeExecution calldata terms) external view returns (bool); }
/// @dev An adapter must consume input from msg.sender and deliver output to msg.sender, not the final recipient.
interface ITypedTradeAdapter { function execute(TradeExecution calldata terms) external returns (uint256 amountOut); }

/// @notice Single immutable pair/adapter, exact-input-or-revert settlement with no standing user custody.
/// @dev This is not a PONS/Uniswap/RFQ integration. Those need a reviewed concrete adapter and market policy.
contract BoundedTradeRouter is GuardedEntry, ActionNonces {
    using SafeERC20 for IERC20;
    error InvalidConfiguration();
    error InvalidTrade();
    error RouteUnavailable();
    error UnexpectedSettlement();
    error Unauthorized();
    address public immutable assetIn;
    address public immutable assetOut;
    ITypedTradeAdapter public immutable adapter;
    ITradePolicy public immutable policy;
    address public immutable guardian;
    uint256 public immutable maxInputAmount;
    bytes32 public immutable adapterCodeHash;
    bytes32 public immutable policyCodeHash;
    bytes32 public immutable routeId;
    bool public paused;
    mapping(address => mapping(bytes32 => bool)) public usedIntents;
    event TradeSettled(bytes32 indexed intentId, address indexed user, bytes32 indexed routeId, uint256 nonce, address assetIn, address assetOut, uint256 spentRaw, uint256 receivedRaw, address recipient, bytes32 contextDigest);
    event PauseChanged(bool paused);
    constructor(address in_, address out_, address adapter_, address policy_, address guardian_, uint256 maxInput_) {
        if (in_.code.length == 0 || out_.code.length == 0 || in_ == out_ || adapter_.code.length == 0
            || policy_.code.length == 0 || guardian_ == address(0) || maxInput_ == 0) revert InvalidConfiguration();
        assetIn = in_; assetOut = out_; adapter = ITypedTradeAdapter(adapter_); policy = ITradePolicy(policy_);
        guardian = guardian_; maxInputAmount = maxInput_; adapterCodeHash = adapter_.codehash; policyCodeHash = policy_.codehash;
        routeId = keccak256(abi.encode("STARPORT_TYPED_SWAP_V1", adapter_, adapter_.codehash, in_, out_));
    }
    function tradeExactInput(bytes32 intentId, uint256 nonce, bytes32 expectedRouteId, TradeExecution calldata terms) external nonReentrant returns (uint256 received) {
        if (paused || expectedRouteId != routeId || address(adapter).codehash != adapterCodeHash
            || address(policy).codehash != policyCodeHash) revert RouteUnavailable();
        if (intentId == bytes32(0) || usedIntents[msg.sender][intentId] || terms.user != msg.sender
            || terms.assetIn != assetIn || terms.assetOut != assetOut || terms.recipient == address(0)
            || terms.recipient == address(this) || terms.amountIn == 0 || terms.amountIn > maxInputAmount
            || terms.minAmountOut == 0 || terms.deadline < block.timestamp || terms.deadline > block.timestamp + 1 days
            || terms.quoteId == bytes32(0) || terms.marketContextHash == bytes32(0)) revert InvalidTrade();
        _consumeNonce(nonce); usedIntents[msg.sender][intentId] = true;
        if (!policy.canExecute(terms)) revert RouteUnavailable();
        received = _settle(terms);
        emit TradeSettled(intentId, msg.sender, routeId, nonce, assetIn, assetOut, terms.amountIn, received, terms.recipient, terms.marketContextHash);
    }
    function _settle(TradeExecution calldata terms) private returns (uint256 received) {
        IERC20 input = IERC20(assetIn); IERC20 output = IERC20(assetOut);
        if (input.allowance(address(this), address(adapter)) != 0) revert UnexpectedSettlement();
        uint256 beforeIn = input.balanceOf(address(this));
        uint256 beforeOut = output.balanceOf(address(this));
        ExactAsset.move(assetIn, msg.sender, address(this), terms.amountIn, true);
        input.forceApprove(address(adapter), terms.amountIn);
        uint256 reported = adapter.execute(terms);
        input.forceApprove(address(adapter), 0);
        uint256 afterOut = output.balanceOf(address(this));
        if (input.allowance(address(this), address(adapter)) != 0 || input.balanceOf(address(this)) != beforeIn
            || afterOut < beforeOut || address(adapter).codehash != adapterCodeHash) revert UnexpectedSettlement();
        received = afterOut - beforeOut;
        if (received < terms.minAmountOut || received != reported) revert UnexpectedSettlement();
        ExactAsset.move(assetOut, address(this), terms.recipient, received, false);
    }
    function setPaused(bool value) external {
        if (msg.sender != guardian) revert Unauthorized();
        paused = value; emit PauseChanged(value);
    }
}
