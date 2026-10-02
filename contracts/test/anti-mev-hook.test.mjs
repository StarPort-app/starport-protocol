import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createPublicClient, createWalletClient, defineChain, http, ContractFunctionRevertedError, encodeAbiParameters, parseAbiParameters, keccak256, stringToBytes } from 'viem';

let child, client, wallet, accounts;
const artifacts = {};

before(async () => {
  for (const n of ['OrbitalAntiMevHook']) {
    artifacts[n] = JSON.parse(await readFile(new URL(`../out/${n}.json`, import.meta.url), 'utf8'));
  }
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  await new Promise(r => server.close(r));

  child = spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '4663', '--accounts', '5', '--silent'], { stdio: 'ignore' });
  const chain = defineChain({
    id: 4663,
    name: 'Anti-MEV Hook Verification',
    nativeCurrency: { name: 'Test ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [`http://127.0.0.1:${port}`] } }
  });
  client = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0], { retryCount: 0 }), pollingInterval: 10 });
  wallet = createWalletClient({ chain, transport: http(chain.rpcUrls.default.http[0], { retryCount: 0 }) });

  for (let i = 0; i < 40; i++) {
    try {
      accounts = await wallet.getAddresses();
      return;
    } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  throw Error('Anvil unavailable');
});

after(() => child?.kill('SIGTERM'));

async function write(name, address, functionName, args = [], account = accounts[0]) {
  const h = await wallet.writeContract({ address, abi: artifacts[name].abi, functionName, args, account });
  return client.waitForTransactionReceipt({ hash: h });
}
async function deploy(name, args = []) {
  const a = artifacts[name];
  const h = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args, account: accounts[0] });
  const r = await client.waitForTransactionReceipt({ hash: h });
  assert.equal(r.status, 'success');
  return r.contractAddress;
}
async function exactRevert(name, address, functionName, args, account, errorName) {
  await assert.rejects(
    () => client.simulateContract({ address, abi: artifacts[name].abi, functionName, args, account }),
    e => e.walk?.(c => c instanceof ContractFunctionRevertedError)?.data?.errorName === errorName
  );
}

test('OrbitalAntiMevHook: anchors Uniswap v4 swap to fresh satellite transit and rejects stale/replayed beacons', async () => {
  // Pool manager is account[0], oracle authority is account[1]
  const hook = await deploy('OrbitalAntiMevHook', [accounts[0], accounts[1]]);
  const poolId = keccak256(stringToBytes('SPCX_ETH_POOL_4663'));

  const now = BigInt((await client.getBlock()).timestamp);
  const beacon1 = keccak256(stringToBytes('STARLINK_BEACON_TRANSIT_001'));

  // Encode valid orbital payload
  const hookDataValid = encodeAbiParameters(
    parseAbiParameters('(uint64 noradId, uint64 observationTimestamp, bytes32 beaconDigest, bytes operatorSignature)'),
    [{
      noradId: 58001n,
      observationTimestamp: now,
      beaconDigest: beacon1,
      operatorSignature: '0x' + '11'.repeat(64),
    }]
  );

  // 1. Fresh orbital payload executes and anchors successfully
  const tx1 = await write('OrbitalAntiMevHook', hook, 'beforeSwap', [accounts[2], poolId, 1000n, hookDataValid], accounts[0]);
  assert.equal(tx1.status, 'success');

  // Check event emitted
  const logs = await client.getLogs({
    address: hook,
    event: {
      type: 'event',
      name: 'OrbitalSwapAnchored',
      inputs: [
        { name: 'poolId', type: 'bytes32', indexed: true },
        { name: 'beaconDigest', type: 'bytes32', indexed: true },
        { name: 'orbitalTimestamp', type: 'uint64', indexed: false },
        { name: 'trader', type: 'address', indexed: true },
      ]
    }
  });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].args.beaconDigest, beacon1);

  // 2. Replayed beacon reverts with BeaconReplayed
  await exactRevert('OrbitalAntiMevHook', hook, 'beforeSwap', [accounts[2], poolId, 1000n, hookDataValid], accounts[0], 'BeaconReplayed');

  // 3. Stale orbital observation timestamp (> 12s ago) reverts with StaleOrbitalTimestamp
  const staleTime = now - 30n; // 30 seconds ago
  const beaconStale = keccak256(stringToBytes('STARLINK_BEACON_TRANSIT_STALE'));
  const hookDataStale = encodeAbiParameters(
    parseAbiParameters('(uint64 noradId, uint64 observationTimestamp, bytes32 beaconDigest, bytes operatorSignature)'),
    [{
      noradId: 58001n,
      observationTimestamp: staleTime,
      beaconDigest: beaconStale,
      operatorSignature: '0x' + '22'.repeat(64),
    }]
  );
  await exactRevert('OrbitalAntiMevHook', hook, 'beforeSwap', [accounts[2], poolId, 1000n, hookDataStale], accounts[0], 'StaleOrbitalTimestamp');

  // 4. Unauthorized caller (not poolManager) reverts with UnauthorizedCaller
  await exactRevert('OrbitalAntiMevHook', hook, 'beforeSwap', [accounts[2], poolId, 1000n, hookDataValid], accounts[3], 'UnauthorizedCaller');

  // 5. Empty hookData bypasses orbital verification without errors
  const txEmpty = await write('OrbitalAntiMevHook', hook, 'beforeSwap', [accounts[2], poolId, 1000n, '0x'], accounts[0]);
  assert.equal(txEmpty.status, 'success');
});
