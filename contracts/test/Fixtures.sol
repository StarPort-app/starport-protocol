// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {TradeExecution, BoundedTradeRouter} from "../src/BoundedTradeRouter.sol";
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
    function set(address token, address recipient) external { recipients[token] = recipient; }
    function transferCreatorFeeRecipient(address token, address recipient) external {
        require(recipients[token] == msg.sender, "not recipient"); recipients[token] = recipient;
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
