#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('./', import.meta.url);

async function main() {
  const args = process.argv.slice(2);
  const manifestRaw = await readFile(new URL('canonical-manifest.json', root), 'utf8');
  const manifest = JSON.parse(manifestRaw);

  const checkAddressIdx = args.indexOf('--check-address');
  const checkUrlIdx = args.indexOf('--check-url');

  if (checkAddressIdx !== -1 && args[checkAddressIdx + 1]) {
    const queryAddr = args[checkAddressIdx + 1].trim().toLowerCase();
    runAddressCheck(queryAddr, manifest);
    return;
  }

  if (checkUrlIdx !== -1 && args[checkUrlIdx + 1]) {
    const queryUrl = args[checkUrlIdx + 1].trim().toLowerCase();
    runUrlCheck(queryUrl, manifest);
    return;
  }

  // Full Canonical Manifest Audit
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           STARPORT PROTOCOL: CANONICAL DEPLOYMENT & ANTI-SCAM AUDIT            ║');
  console.log('║                    Institutional Verification & Anti-Phishing                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  function report(name, ok, detail) {
    if (ok) {
      passed++;
      console.log(`[PASS] ${name.padEnd(35)}: ${detail}`);
    } else {
      failed++;
      console.error(`[FAIL] ${name.padEnd(35)}: ${detail}`);
    }
  }

  // 1. Settlement Network & Chain ID
  report('Settlement Network', manifest.settlementNetwork.name === 'Robinhood Chain', manifest.settlementNetwork.name);
  report('Settlement Chain ID', manifest.settlementNetwork.chainId === 4663, `Chain ID ${manifest.settlementNetwork.chainId}`);
  report('Settlement Architecture', manifest.settlementNetwork.architecture === 'Arbitrum Orbit L2', manifest.settlementNetwork.architecture);
  report('Native Quote Asset', manifest.settlementNetwork.nativeQuoteAsset === 'ETH', 'Native ETH (wei accounting)');

  // 2. Token Governance Hold Status
  report('SPORT Ticker Status', manifest.tokenState.status === 'PRE_GENESIS_GOVERNED_HOLD', 'PRE_GENESIS_GOVERNED_HOLD');
  report('On-Chain Address Presence', manifest.tokenState.onChainAddress === null, 'null (Token not yet deployed; unlaunched)');
  report('Automatic Broadcast Freeze', manifest.tokenState.automaticBroadcast === false, 'automaticBroadcast=false (Strict Freeze)');

  // 3. PONS Creator Tax
  report('Creator Tax Target', manifest.feePolicy.creatorTaxBps === 100, '100 bps (1.0% creator surcharge)');

  // 4. Role Decoupling
  const roles = manifest.canonicalRoles;
  const uniqueRoles = new Set([roles.deployerAddress, roles.controllerSafe, roles.payoutRecipient, roles.keeperAddress]);
  report('Governance Role Decoupling', uniqueRoles.size === 4, 'Enforced 4-way separation (Deployer != Controller != Payout != Keeper)');
  report('Controller Safe Governance', roles.controllerQuorum === '3-of-5 Gnosis Safe', roles.controllerQuorum);
  report('Operating Payout Timelock', roles.payoutTimelockSeconds === 172800, '172800s (48 hours queue-delay)');
  report('Emergency Timelock Guard', roles.emergencyTimelockSeconds === 86400, '86400s (24 hours sweep-delay)');

  // 5. Bytecode Hashes verification against local build
  for (const [name, expectedHash] of Object.entries(manifest.compiledBytecodeHashes.contracts)) {
    try {
      const artRaw = await readFile(new URL(`out/${name}.json`, root), 'utf8');
      const art = JSON.parse(artRaw);
      const computedHash = '0x' + createHash('sha256').update(Buffer.from(art.bytecode.slice(2), 'hex')).digest('hex');
      report(`Bytecode Hash: ${name}`, computedHash === expectedHash, `${computedHash.slice(0, 18)}...`);
    } catch {
      report(`Bytecode Hash: ${name}`, false, 'Artifact not found. Run npm run build:contracts first.');
    }
  }

  console.log('\n──────────────────────────────────────────────────────────────────────────────────');
  if (failed === 0) {
    console.log(`✔ ALL ${passed} CANONICAL REGISTRY CHECKS VERIFIED CLEANLY (0 FAILS)`);
    console.log('Notice: Token is in PRE_GENESIS_GOVERNED_HOLD. Any live DEX token under SPORT is a scam.\n');
  } else {
    console.error(`✖ VERIFICATION FAILED: ${failed} invariant(s) failed.`);
    process.exit(1);
  }
}

function runAddressCheck(queryAddr, manifest) {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           STARPORT PROTOCOL: CANONICAL ADDRESS & TOKEN AUTHENTICATOR           ║');
  console.log(`║ Query: ${queryAddr.padEnd(64)}║`);
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  const roles = manifest.canonicalRoles;
  const factory = manifest.feePolicy.ponsFactoryTarget.toLowerCase();

  if (queryAddr === roles.deployerAddress.toLowerCase()) {
    console.log('✔ [MATCH] Canonical Role: Genesis Deployer EOA');
    console.log('  Status: Authorized Protocol Role (0x1000...0001)\n');
    return;
  }
  if (queryAddr === roles.controllerSafe.toLowerCase()) {
    console.log('✔ [MATCH] Canonical Role: Gnosis Safe 3-of-5 Timelock Controller');
    console.log('  Status: Authorized Protocol Governance Multi-Sig (0x2000...0002)\n');
    return;
  }
  if (queryAddr === roles.payoutRecipient.toLowerCase()) {
    console.log('✔ [MATCH] Canonical Role: Immutable Cold DAO Treasury');
    console.log('  Status: Authorized Sole Beneficiary of Protocol Disbursements (0x3000...0003)\n');
    return;
  }
  if (queryAddr === roles.keeperAddress.toLowerCase()) {
    console.log('✔ [MATCH] Canonical Role: Restricted Automated Fee-Collection Worker');
    console.log('  Status: Authorized Automated Keeper (0x4000...0004)\n');
    return;
  }
  if (queryAddr === factory) {
    console.log('✔ [MATCH] Canonical Role: PONS Factory Target');
    console.log(`  Status: Authorized Factory (${manifest.feePolicy.ponsFactoryTarget})\n`);
    return;
  }

  // Not a canonical address -> Alert for potential scam
  console.log('🚨 [ALERT: COUNTERFEIT TOKEN / PHISHING SCAM DETECTED] 🚨');
  console.log(`  The queried address: ${queryAddr}`);
  console.log('  is NOT a registered Starport Protocol contract, role, or token address.');
  console.log('\n  CRITICAL CANONICAL REALITY:');
  console.log(`  - Official SPORT Token Status: ${manifest.tokenState.status}`);
  console.log('  - On-Chain Token Address     : NULL (No token has been deployed to mainnet)');
  console.log('  - Liquidity Pools / Pre-Sales: NONE (Any DexScreener/Uniswap token is fake)');
  console.log('  - Settlement Network         : Robinhood Chain Arbitrum Orbit L2 (Chain ID 4663)');
  console.log('\n  DO NOT INTERACT WITH OR TRANSFER FUNDS TO THIS ADDRESS.\n');
  process.exit(1);
}

function runUrlCheck(queryUrl, manifest) {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           STARPORT PROTOCOL: DOMAIN & URL AUTHENTICATOR                        ║');
  console.log(`║ Query: ${queryUrl.padEnd(64)}║`);
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  const officialSites = [
    manifest.officialChannels.website.toLowerCase(),
    manifest.officialChannels.github.toLowerCase(),
    manifest.officialChannels.docs.toLowerCase(),
    'https://starport.nexus',
    'https://github.com/starport-app/starport-protocol'
  ];

  const isOfficial = officialSites.some(site => queryUrl === site || queryUrl.startsWith(site));

  if (isOfficial) {
    console.log('✔ [PASS] VERIFIED OFFICIAL CANONICAL PROTOCOL CHANNEL');
    console.log(`  URL: ${queryUrl} is an authentic protocol resource.\n`);
  } else {
    console.log('🚨 [ALERT: UNAUTHORIZED / SUSPECTED PHISHING DOMAIN] 🚨');
    console.log(`  The queried URL: ${queryUrl}`);
    console.log('  is NOT in the official Starport Protocol canonical manifest.');
    console.log('\n  OFFICIAL CANONICAL CHANNELS ONLY:');
    console.log(`  - Website: ${manifest.officialChannels.website}`);
    console.log(`  - GitHub : ${manifest.officialChannels.github}`);
    console.log('\n  BEWARE OF FAKE CLAIM SITES, FAKE AIRDROPS, AND DRAINER CONTRACTS.\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
