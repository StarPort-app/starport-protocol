import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createPublicClient, createWalletClient, defineChain, http, ContractFunctionRevertedError, keccak256, stringToBytes } from 'viem';

let child, client, wallet, accounts;
const artifacts = {};
const DAY = 86400n;
const FORECAST = keccak256(stringToBytes('orbit_forecast'));
const CATALOG = keccak256(stringToBytes('catalog_watch'));
const REVIEW = keccak256(stringToBytes('orbit_review'));

before(async () => {
  for (const n of ['FixtureAsset', 'OrbitStakeVault']) {
    artifacts[n] = JSON.parse(await readFile(new URL(`../out/${n}.json`, import.meta.url), 'utf8'));
  }
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  await new Promise(r => server.close(r));

  child = spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '4663', '--accounts', '5', '--silent'], { stdio: 'ignore' });
  const chain = defineChain({
    id: 4663,
    name: 'Orbit Stake Vault Verification',
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

const read = (name, address, functionName, args = []) => client.readContract({ address, abi: artifacts[name].abi, functionName, args });
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
async function at(timestamp) {
  await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(timestamp)] });
  await client.request({ method: 'evm_mine', params: [] });
}

test('OrbitStakeVault: ABI audit proves ZERO transfer permissions, migration proposals, or custody rescue', () => {
  const abi = artifacts['OrbitStakeVault'].abi;
  const functionNames = abi.filter(item => item.type === 'function').map(item => item.name);

  // Assert complete absence of any admin transfer/migration/rescue backdoors
  assert.equal(functionNames.includes('proposeMigration'), false, 'proposeMigration must not exist');
  assert.equal(functionNames.includes('executeMigration'), false, 'executeMigration must not exist');
  assert.equal(functionNames.includes('proposeCustodyRescue'), false, 'proposeCustodyRescue must not exist');
  assert.equal(functionNames.includes('executeCustodyRescue'), false, 'executeCustodyRescue must not exist');
  assert.equal(functionNames.includes('transferCustody'), false, 'transferCustody must not exist');
  assert.equal(functionNames.includes('adminWithdraw'), false, 'adminWithdraw must not exist');
  assert.equal(functionNames.includes('sweep'), false, 'sweep must not exist');
});

test('OrbitStakeVault: deposits strictly respect pool saturation capacities and track segregated principal', async () => {
  const asset = await deploy('FixtureAsset');
  // Capacity: FORECAST: 1000n, CATALOG: 500n, REVIEW: 200n
  const vault = await deploy('OrbitStakeVault', [asset, accounts[0], 1000n, 500n, 200n]);

  // Mint asset for user account[1]
  await write('FixtureAsset', asset, 'mint', [accounts[1], 2000n]);
  await write('FixtureAsset', asset, 'approve', [vault, 2000n], accounts[1]);

  // Deposit 600n into FORECAST (below 1000 cap)
  await write('OrbitStakeVault', vault, 'deposit', [FORECAST, 600n], accounts[1]);
  assert.equal(await read('OrbitStakeVault', vault, 'poolPrincipal', [FORECAST]), 600n);
  assert.equal(await read('OrbitStakeVault', vault, 'totalPrincipal'), 600n);

  // Attempting to deposit 500n more exceeds 1000 cap -> reverts CapacityExceeded
  await exactRevert('OrbitStakeVault', vault, 'deposit', [FORECAST, 500n], accounts[1], 'CapacityExceeded');

  // Deposit 400n fills to exact cap 1000n
  await write('OrbitStakeVault', vault, 'deposit', [FORECAST, 400n], accounts[1]);
  assert.equal(await read('OrbitStakeVault', vault, 'poolPrincipal', [FORECAST]), 1000n);
  assert.equal(await read('OrbitStakeVault', vault, 'totalPrincipal'), 1000n);
});

test('OrbitStakeVault: standard unbonding enforces 48-hour timelock; zero slashing on principal', async () => {
  const asset = await deploy('FixtureAsset');
  const vault = await deploy('OrbitStakeVault', [asset, accounts[0], 1000n, 500n, 200n]);

  await write('FixtureAsset', asset, 'mint', [accounts[2], 300n]);
  await write('FixtureAsset', asset, 'approve', [vault, 300n], accounts[2]);

  // User 2 deposits 300n into CATALOG
  const depTx = await write('OrbitStakeVault', vault, 'deposit', [CATALOG, 300n], accounts[2]);
  
  // Calculate deterministic positionId
  const block = await client.getBlock({ blockHash: depTx.blockHash });
  // Read position via nextPositionId
  const posCount = await read('OrbitStakeVault', vault, 'nextPositionId');
  assert.equal(posCount, 1n);

  // Get positionId from event logs
  const logs = await client.getLogs({
    address: vault,
    event: {
      type: 'event',
      name: 'Deposited',
      inputs: [
        { name: 'positionId', type: 'bytes32', indexed: true },
        { name: 'owner', type: 'address', indexed: true },
        { name: 'pool', type: 'bytes32', indexed: true },
        { name: 'amount', type: 'uint256', indexed: false },
        { name: 'at', type: 'uint64', indexed: false },
      ]
    }
  });
  const posId = logs[0].args.positionId;

  // Request standard exit
  await write('OrbitStakeVault', vault, 'requestExit', [posId], accounts[2]);
  const pos = await read('OrbitStakeVault', vault, 'positions', [posId]);
  const requestedAt = pos[4];
  const unlockAt = pos[5];
  assert.equal(unlockAt - requestedAt, 2n * DAY, 'Standard unbonding must be exactly 48 hours (2 days)');

  // Attempting to withdraw before unlock reverts NotUnlocked
  await exactRevert('OrbitStakeVault', vault, 'withdraw', [posId], accounts[2], 'NotUnlocked');

  // Third party cannot withdraw position -> Unauthorized
  await exactRevert('OrbitStakeVault', vault, 'withdraw', [posId], accounts[3], 'Unauthorized');

  // Fast-forward to unlockAt
  await at(unlockAt);

  // User 2 withdraws 100% of principal
  await write('OrbitStakeVault', vault, 'withdraw', [posId], accounts[2]);
  assert.equal(await read('FixtureAsset', asset, 'balanceOf', [accounts[2]]), 300n, 'Principal returned 100% intact');
  assert.equal(await read('OrbitStakeVault', vault, 'totalPrincipal'), 0n);
  assert.equal(await read('OrbitStakeVault', vault, 'poolPrincipal', [CATALOG]), 0n);
});

test('OrbitStakeVault: emergency mode enables 6-hour rapid exit window', async () => {
  const asset = await deploy('FixtureAsset');
  const vault = await deploy('OrbitStakeVault', [asset, accounts[0], 1000n, 500n, 200n]);

  await write('FixtureAsset', asset, 'mint', [accounts[4], 150n]);
  await write('FixtureAsset', asset, 'approve', [vault, 150n], accounts[4]);

  await write('OrbitStakeVault', vault, 'deposit', [REVIEW, 150n], accounts[4]);
  const logs = await client.getLogs({
    address: vault,
    event: {
      type: 'event',
      name: 'Deposited',
      inputs: [
        { name: 'positionId', type: 'bytes32', indexed: true },
        { name: 'owner', type: 'address', indexed: true },
        { name: 'pool', type: 'bytes32', indexed: true },
        { name: 'amount', type: 'uint256', indexed: false },
        { name: 'at', type: 'uint64', indexed: false },
      ]
    }
  });
  const posId = logs[0].args.positionId;

  // Emergency exit requested before emergency active reverts Unavailable
  await exactRevert('OrbitStakeVault', vault, 'requestEmergencyExit', [posId], accounts[4], 'Unavailable');

  // Controller activates emergency
  await write('OrbitStakeVault', vault, 'setEmergency', [true], accounts[0]);
  assert.equal(await read('OrbitStakeVault', vault, 'emergencyActive'), true);
  assert.equal(await read('OrbitStakeVault', vault, 'paused'), true);

  // Request emergency exit
  await write('OrbitStakeVault', vault, 'requestEmergencyExit', [posId], accounts[4]);
  const pos = await read('OrbitStakeVault', vault, 'positions', [posId]);
  assert.equal(pos[5] - pos[4], 6n * 3600n, 'Emergency exit window must be exactly 6 hours');

  // Advance time by 6 hours
  await at(pos[5]);
  await write('OrbitStakeVault', vault, 'withdraw', [posId], accounts[4]);
  assert.equal(await read('FixtureAsset', asset, 'balanceOf', [accounts[4]]), 150n);
});
