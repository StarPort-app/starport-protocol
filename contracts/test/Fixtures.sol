// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {TradeExecution, BoundedTradeRouter} from "../src/BoundedTradeRouter.sol";
import {ExactInputSingleParams} from "../src/adapters/PonsV1TradeAdapter.sol";
contract FixtureAsset {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public failTransfers;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function setFailure(bool value) external { failTransfers = value; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(!failTransfers, "fixture transfer failure");
        allowance[from][msg.sender] -= amount; balanceOf[from] -= amount; balanceOf[to] += amount; return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(!failTransfers, "fixture transfer failure");
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true;
    }
}
contract FixtureEligibility {
    bool public allowed = true;
    function setAllowed(bool value) external { allowed = value; }
    function canDelegate(address, bytes32) external view returns (bool) { return allowed; }
    function canClaim(address, uint256, bytes32) external view returns (bool) { return allowed; }
}
contract FixtureEscrow {
    mapping(address => mapping(address => uint256)) public balanceOfToken;
    function credit(address recipient, address token, uint256 amount) external {
        FixtureAsset(token).mint(address(this), amount); balanceOfToken[recipient][token] += amount;
    }
    function claimToken(address token) external {
        uint256 amount = balanceOfToken[msg.sender][token]; balanceOfToken[msg.sender][token] = 0;
        FixtureAsset(token).transfer(msg.sender, amount);
    }
}
contract FixtureFactory {
    mapping(address => address) public recipients;
    uint256 public creatorTaxBps = 100;
    function set(address token, address recipient) external { recipients[token] = recipient; }
    function setCreatorTaxBps(uint256 bps) external { creatorTaxBps = bps; }
    function transferCreatorFeeRecipient(address token, address recipient) external {
        require(recipients[token] == msg.sender, "not recipient"); recipients[token] = recipient;
    }
}
contract FixtureGnosisSafe {
    address[] internal _owners;
    uint256 internal _threshold;
    constructor(address[] memory owners_, uint256 threshold_) {
        _owners = owners_;
        _threshold = threshold_;
    }
    function getOwners() external view returns (address[] memory) { return _owners; }
    function getThreshold() external view returns (uint256) { return _threshold; }
    function isOwner(address owner) external view returns (bool) {
        for (uint256 i = 0; i < _owners.length; i++) {
            if (_owners[i] == owner) return true;
        }
        return false;
    }
}
contract FixtureNativeEscrow {
    mapping(address => uint256) public balanceOf;
    bool public shortPayment;
    function credit(address recipient) external payable { balanceOf[recipient] += msg.value; }
    function setShortPayment(bool value) external { shortPayment = value; }
    function claim() external returns (uint256 amount) {
        amount = balanceOf[msg.sender]; require(amount > 0); balanceOf[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: shortPayment ? amount - 1 : amount}(""); require(ok);
    }
}
contract FixtureTransferTaxAsset {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount - 1;
        return true;
    }
}

// Test-only policy and venue. They are not asset-eligibility services or production adapters.
contract FixtureExecutionPolicy {
    bool public allowed = true;
    bytes32 public expectedContext;
    function setAllowed(bool value) external { allowed = value; }
    function setExpectedContext(bytes32 value) external { expectedContext = value; }
    function canPay(address, address, address, uint256, bytes32 digest) external view returns (bool) {
        return allowed && (expectedContext == bytes32(0) || expectedContext == digest);
    }
    function canExecute(TradeExecution calldata terms) external view returns (bool) {
        return allowed && (expectedContext == bytes32(0) || expectedContext == terms.marketContextHash);
    }
}
contract FixtureTypedAdapter {
    uint256 public outputAmount = 80;
    uint256 public consumptionOverride;
    uint256 public reportOverride;
    bool public probeReentry;
    bytes4 public reentryError;
    function configure(uint256 out, uint256 consume, uint256 report, bool reentry) external {
        outputAmount = out; consumptionOverride = consume; reportOverride = report; probeReentry = reentry;
    }
    function execute(TradeExecution calldata terms) external returns (uint256) {
        if (probeReentry) {
            (bool ok, bytes memory result) = msg.sender.call(abi.encodeCall(BoundedTradeRouter.tradeExactInput,
                (bytes32(uint256(999)), 999, BoundedTradeRouter(msg.sender).routeId(), terms)));
            require(!ok && result.length >= 4, "reentry unexpectedly succeeded");
            reentryError = bytes4(result);
        }
        FixtureAsset(terms.assetIn).transferFrom(msg.sender, address(this), consumptionOverride == 0 ? terms.amountIn : consumptionOverride);
        FixtureAsset(terms.assetOut).transfer(msg.sender, outputAmount);
        return reportOverride == 0 ? outputAmount : reportOverride;
    }
}
contract FixtureContractIssuer {
    address public immutable owner = msg.sender;
    bytes32 public approvedDigest;
    bool public enabled = true;
    function configure(bytes32 digest, bool allowed) external { require(msg.sender == owner); approvedDigest = digest; enabled = allowed; }
    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        return enabled && digest == approvedDigest && keccak256(signature) == keccak256(hex"aa") ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}
contract FixturePonsRouter {
    uint256 public rateMultiplier = 2;
    bool public failSwap;
    function setFailSwap(bool fail) external { failSwap = fail; }
    function setRateMultiplier(uint256 mult) external { rateMultiplier = mult; }
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(!failSwap, "fixture swap failure");
        require(block.timestamp <= deadline, "expired");
        FixtureAsset(path[0]).transferFrom(msg.sender, address(this), amountIn);
        uint256 out = amountIn * rateMultiplier;
        require(out >= amountOutMin, "slippage");
        FixtureAsset(path[1]).mint(to, out);
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = out;
    }
}

contract FixturePonsBondingCurve {
    uint256 public rateMultiplier = 2;
    address public quoteAsset;
    address public baseToken;
    constructor(address quote_, address base_) {
        quoteAsset = quote_;
        baseToken = base_;
    }
    function setRateMultiplier(uint256 mult) external { rateMultiplier = mult; }
    function buy(uint256 amountIn, uint256 minAmountOut, address to) external returns (uint256 amountOut) {
        FixtureAsset(quoteAsset).transferFrom(msg.sender, address(this), amountIn);
        amountOut = amountIn * rateMultiplier;
        require(amountOut >= minAmountOut, "slippage");
        FixtureAsset(baseToken).mint(to, amountOut);
    }
    function sell(uint256 amountIn, uint256 minAmountOut, address to) external returns (uint256 amountOut) {
        FixtureAsset(baseToken).transferFrom(msg.sender, address(this), amountIn);
        amountOut = amountIn / rateMultiplier;
        require(amountOut >= minAmountOut, "slippage");
        FixtureAsset(quoteAsset).mint(to, amountOut);
    }
}

contract FixtureUniversalRouter {
    uint256 public rateMultiplier = 2;
    bool public failExecution;
    function setFailExecution(bool fail) external { failExecution = fail; }
    function setRateMultiplier(uint256 mult) external { rateMultiplier = mult; }
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable {
        require(!failExecution, "universal router execution failed");
        require(block.timestamp <= deadline, "expired");
        require(commands.length == 1 && commands[0] == 0x10, "invalid command");
        (bytes memory actions, bytes[] memory params) = abi.decode(inputs[0], (bytes, bytes[]));
        require(actions.length == 3, "invalid actions");
        require(uint8(actions[0]) == 0x06, "expected swap single");
        require(uint8(actions[1]) == 0x0c, "expected settle all");
        require(uint8(actions[2]) == 0x0f, "expected take all");

        ExactInputSingleParams memory swapParams = abi.decode(params[0], (ExactInputSingleParams));
        (address settleAsset, uint256 settleAmount) = abi.decode(params[1], (address, uint256));
        (address takeAsset, uint256 takeMinAmount) = abi.decode(params[2], (address, uint256));

        address assetIn = swapParams.zeroForOne ? swapParams.poolKey.currency0 : swapParams.poolKey.currency1;
        address assetOut = swapParams.zeroForOne ? swapParams.poolKey.currency1 : swapParams.poolKey.currency0;
        require(assetIn == settleAsset, "mismatched in");
        require(assetOut == takeAsset, "mismatched out");

        FixtureAsset(assetIn).transferFrom(msg.sender, address(this), settleAmount);
        uint256 out = settleAmount * rateMultiplier;
        require(out >= takeMinAmount, "slippage");
        FixtureAsset(assetOut).mint(msg.sender, out);
    }
}

