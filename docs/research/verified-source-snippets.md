# Explorer-verified source excerpts

Read on 2026-09-26 UTC from the read-only code editor at:
https://robinhoodchain.blockscout.com/address/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e?tab=contract

Visible verification metadata:
- Contract source code verified (exact match).
- Verified using Blockscout Bytecode Database.
- Contract name: PonsV2LaunchFactory.
- Compiler: v0.8.35+commit.47b9dedd; EVM: cancun.
- Optimization enabled: true; runs: 200.
- Verified at: Aug 4, 2026 12:40:45 (explorer display).
- Contract file path: contracts/src/v2/PonsV2LaunchFactory.sol.

The source text was selected and copied from the explorer's read-only editor. Line numbers below are its file line numbers. Excerpts are deliberately not represented as a complete source bundle or an independent bytecode reproduction.

## PonsV2LaunchFactory.sol

```solidity
// L58-L61
    uint256 private constant BASIS_POINTS = 10_000;
    uint256 private constant MAX_CURVE_FEE_BPS = 1_000; // 10%
    uint256 private constant MAX_CREATOR_TAX_CEILING_BPS = 1_000; // 10%
    uint256 private constant MAX_TOTAL_TRADE_FEE_BPS = 2_000; // 20%
// L119
        uint16 creatorTaxBps;
// L310
    uint256 public maxCreatorTaxBps = 1_000; // 10%
// L770
        if (params.creatorTaxBps > maxCreatorTaxBps) revert CreatorTaxTooHigh();
// L801-L806
        if (config.curveFeeBps + params.creatorTaxBps > MAX_TOTAL_TRADE_FEE_BPS) {
            revert CombinedFeeTooHigh();
        }
        if (policy.hookFeeBps + params.creatorTaxBps > MAX_TOTAL_TRADE_FEE_BPS) {
            revert CombinedFeeTooHigh();
        }
// L827: LaunchDeployment initialization
                creatorTaxBps: params.creatorTaxBps,
// L858: LaunchedToken initialization
            creatorTaxBps: params.creatorTaxBps,
// L1381: memeHook.registerPool argument
            launch.creatorTaxBps,
```

## PonsV2LaunchDeployer.sol, supplied with the verified factory source

```solidity
// L99-L109
    function deployLaunch(LaunchDeployment calldata params)
        external
        onlyFactory
        returns (address token, address curve)
    {
        _requireMetadataWithinLimits(params);

        bytes32 salt = _launchSalt(params);
        curve = Create2.deploy(0, salt, _curveCreationCode(params));
        token = Create2.deploy(0, salt, _tokenCreationCode(params, curve));
    }
// L146-L164
    function _curveCreationCode(LaunchDeployment calldata params) private view returns (bytes memory) {
        return abi.encodePacked(
            type(PonsV2BondingCurve).creationCode,
            abi.encode(
                params.pairToken,
                params.creatorFeeRecipient,
                factory,
                params.feePolicy,
                params.policy,
                params.feeEscrow,
                params.buybackVault,
                params.phantomQuote,
                params.curveFeeBps,
                params.creatorTaxBps,
                params.buybackEnabled,
                params.graduationThreshold
            )
        );
    }
```

## PonsV2BondingCurve.sol, supplied with the verified factory source

```solidity
// L34-L35
    uint256 private constant BASIS_POINTS = 10_000;
    uint256 private constant MAX_TOTAL_TRADE_FEE_BPS = 2_000; // 20%
// L222
        if (feeBps_ + creatorTaxBps_ > MAX_TOTAL_TRADE_FEE_BPS) revert InvalidFeePolicy();
// L240-L241
        feeBps = feeBps_;
        creatorTaxBps = creatorTaxBps_;
// L473-L475: buy
        uint256 fee = (spent * feeBps) / BASIS_POINTS;
        uint256 tax = (spent * creatorTaxBps) / BASIS_POINTS;
        uint256 snipeTax = (spent * snipeTaxBps) / BASIS_POINTS;
// L555-L556: sell
        uint256 fee = (grossQuoteOut * feeBps) / BASIS_POINTS;
        uint256 tax = (grossQuoteOut * creatorTaxBps) / BASIS_POINTS;
```

## PonsV2MemeHook.sol, supplied with the verified factory source

```solidity
// L69-L74 (comments omitted)
    uint256 private constant BASIS_POINTS = 10_000;
    uint256 private constant MAX_PROTOCOL_FEE_SHARE_BPS = 5_000;
    uint256 private constant MAX_HOOK_FEE_BPS = 1_000;
    uint256 private constant MAX_TOTAL_TRADE_FEE_BPS = 2_000;
// L352
        if (uint256(creatorTaxBps) + policy.hookFeeBps > MAX_TOTAL_TRADE_FEE_BPS) revert InvalidBps();
// L372
            creatorTaxBps: creatorTaxBps,
// L465-L466
        uint256 feeAmount = (unspecified * info.hookFeeBps) / BASIS_POINTS;
        uint256 taxAmount = (unspecified * info.creatorTaxBps) / BASIS_POINTS;
```
