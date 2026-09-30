// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ExactAsset} from "../ExactAsset.sol";
import {TradeExecution, ITypedTradeAdapter} from "../BoundedTradeRouter.sol";

/// @notice PONS pre-graduation bonding curve interface on Robinhood Chain 4663
interface IPonsBondingCurve {
    function buy(uint256 amountIn, uint256 minAmountOut, address to) external returns (uint256 amountOut);
    function sell(uint256 amountIn, uint256 minAmountOut, address to) external returns (uint256 amountOut);
}

/// @notice PONS post-graduation Universal Router / Uniswap V4 execution interface on Robinhood Chain 4663
interface IUniversalRouter {
    function execute(
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external payable;
}

/// @notice Traditional router interface maintained for auxiliary AMM pools
interface IPonsLegacyRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

/// @notice Uniswap V4 pool identification parameters
struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

/// @notice Uniswap V4 single pool exact input swap parameters
struct ExactInputSingleParams {
    PoolKey poolKey;
    bool zeroForOne;
    uint128 amountIn;
    uint128 amountOutMinimum;
    bytes hookData;
}

/// @notice Production-grade typed trade adapter for PONS on Robinhood Chain 4663.
/// @dev Supports both pre-graduation bonding curve execution and post-graduation Universal Router execution.
/// Conforms to ITypedTradeAdapter: consumes assetIn from msg.sender and delivers assetOut to msg.sender.
contract PonsV1TradeAdapter is ITypedTradeAdapter {
    using SafeERC20 for IERC20;

    enum VenueKind {
        UniversalRouter,
        BondingCurve,
        LegacyRouter
    }

    error InvalidConfiguration();
    error ExpiredTrade();
    error RouterUnavailable();
    error SlippageExceeded();
    error ResidualAllowance();
    error UnsupportedVenue();

    address public immutable router;
    bytes32 public immutable routerCodeHash;
    VenueKind public immutable venueKind;

    event TradeExecuted(
        address indexed caller,
        address indexed assetIn,
        address indexed assetOut,
        uint256 amountIn,
        uint256 amountOut,
        bytes32 quoteId,
        VenueKind venueKind
    );

    constructor(address router_, VenueKind kind_) {
        if (router_ == address(0) || router_.code.length == 0) revert InvalidConfiguration();
        router = router_;
        routerCodeHash = router_.codehash;
        venueKind = kind_;
    }

    function execute(TradeExecution calldata terms) external override returns (uint256 amountOut) {
        if (block.timestamp > terms.deadline) revert ExpiredTrade();
        if (router.codehash != routerCodeHash) revert RouterUnavailable();

        // 1. Pull exact assetIn from caller (BoundedTradeRouter)
        ExactAsset.move(terms.assetIn, msg.sender, address(this), terms.amountIn, true);

        // 2. Exact approval to PONS venue
        IERC20 input = IERC20(terms.assetIn);
        IERC20 output = IERC20(terms.assetOut);
        input.forceApprove(router, terms.amountIn);

        uint256 beforeOut = output.balanceOf(address(this));

        // 3. Dispatch execution by venue architecture
        if (venueKind == VenueKind.BondingCurve) {
            // Pre-graduation bonding curve: direct buy/sell
            try IPonsBondingCurve(router).buy(terms.amountIn, terms.minAmountOut, address(this)) returns (uint256) {
                // executed via buy
            } catch {
                IPonsBondingCurve(router).sell(terms.amountIn, terms.minAmountOut, address(this));
            }
        } else if (venueKind == VenueKind.UniversalRouter) {
            // Post-graduation Universal Router: executes authentic Uniswap V4 swap command (0x10)
            address currency0 = terms.assetIn < terms.assetOut ? terms.assetIn : terms.assetOut;
            address currency1 = terms.assetIn < terms.assetOut ? terms.assetOut : terms.assetIn;
            bool zeroForOne = terms.assetIn < terms.assetOut;

            // Uniswap V4 Universal Router: Command 0x10 = V4_SWAP
            // Actions: 0x06 = SWAP_EXACT_IN_SINGLE, 0x0c = SETTLE_ALL, 0x0f = TAKE_ALL
            bytes memory actions = abi.encodePacked(uint8(0x06), uint8(0x0c), uint8(0x0f));
            bytes[] memory params = new bytes[](3);
            params[0] = abi.encode(
                ExactInputSingleParams({
                    poolKey: PoolKey({
                        currency0: currency0,
                        currency1: currency1,
                        fee: 3000,
                        tickSpacing: 60,
                        hooks: address(0)
                    }),
                    zeroForOne: zeroForOne,
                    amountIn: uint128(terms.amountIn),
                    amountOutMinimum: uint128(terms.minAmountOut),
                    hookData: hex""
                })
            );
            params[1] = abi.encode(terms.assetIn, terms.amountIn);
            params[2] = abi.encode(terms.assetOut, terms.minAmountOut);

            bytes memory command = hex"10";
            bytes[] memory inputs = new bytes[](1);
            inputs[0] = abi.encode(actions, params);
            IUniversalRouter(router).execute(command, inputs, terms.deadline);
        } else if (venueKind == VenueKind.LegacyRouter) {
            address[] memory path = new address[](2);
            path[0] = terms.assetIn;
            path[1] = terms.assetOut;
            IPonsLegacyRouter(router).swapExactTokensForTokens(
                terms.amountIn,
                terms.minAmountOut,
                path,
                address(this),
                terms.deadline
            );
        } else {
            revert UnsupportedVenue();
        }

        // 4. Invariant: zero allowance leak post-execution
        input.forceApprove(router, 0);
        if (input.allowance(address(this), router) != 0) revert ResidualAllowance();

        // 5. Calculate and verify net output delivered to adapter
        uint256 afterOut = output.balanceOf(address(this));
        if (afterOut < beforeOut) revert SlippageExceeded();
        amountOut = afterOut - beforeOut;
        if (amountOut < terms.minAmountOut) revert SlippageExceeded();

        // 6. Deliver output directly to caller (BoundedTradeRouter)
        ExactAsset.move(terms.assetOut, address(this), msg.sender, amountOut, false);

        emit TradeExecuted(
            msg.sender,
            terms.assetIn,
            terms.assetOut,
            terms.amountIn,
            amountOut,
            terms.quoteId,
            venueKind
        );
    }
}
