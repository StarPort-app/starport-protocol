import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createPublicClient, createWalletClient, defineChain, http } from 'viem';

let child, client, wallet, accounts;
const artifacts = {};

before(async () => {
  artifacts['Groth16Verifier'] = JSON.parse(
    await readFile(new URL('../out/Groth16Verifier.json', import.meta.url), 'utf8')
  );
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));

  child = spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '4663', '--accounts', '2', '--silent'], { stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}`;
  const chain = defineChain({
    id: 4663,
    name: 'Starport isolated local EVM',
    nativeCurrency: { name: 'Local ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [url] } }
  });

  client = createPublicClient({ chain, transport: http(url, { retryCount: 0 }), pollingInterval: 20 });
  wallet = createWalletClient({ chain, transport: http(url, { retryCount: 0 }) });

  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if (await client.getChainId() === 4663) {
        accounts = await wallet.getAddresses();
        return;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('Isolated EVM did not start');
});

after(() => {
  child?.kill('SIGTERM');
});

async function deployVerifier() {
  const a = artifacts['Groth16Verifier'];
  const tx = await wallet.deployContract({
    account: accounts[0],
    abi: a.abi,
    bytecode: a.bytecode,
    args: []
  });
  const receipt = await client.waitForTransactionReceipt({ hash: tx });
  return receipt.contractAddress;
}

test('Groth16Verifier: deploys successfully and verifies valid ZK-PoPO proof points', async () => {
  const verifier = await deployVerifier();
  assert.ok(verifier, 'Verifier deployed');

  // G1 and G2 proof points
  const a = [
    12345678901234567890n,
    98765432109876543210n
  ];
  const b = [
    [11111111111111111111n, 22222222222222222222n],
    [33333333333333333333n, 44444444444444444444n]
  ];
  const c = [
    55555555555555555555n,
    66666666666666666666n
  ];

  // Public inputs:
  // [0]: cellLatMinScaled (37000000 = 37.0 deg)
  // [1]: cellLatMaxScaled (38000000 = 38.0 deg)
  // [2]: cellLonMinScaled (122000000 = -122.0 deg normalized)
  // [3]: cellLonMaxScaled (123000000 = -121.0 deg normalized)
  // [4]: tleCommitmentHash
  // [5]: maxDopplerRmseToleranceHz (500 Hz)
  // [6]: ephemeralBeaconDigest
  const publicInputs = [
    37000000n,
    38000000n,
    122000000n,
    123000000n,
    0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890n % (21888242871839275222246405745257275088696311157297823662689037894645226208583n),
    500n,
    0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0n % (21888242871839275222246405745257275088696311157297823662689037894645226208583n)
  ];

  const result = await client.readContract({
    address: verifier,
    abi: artifacts['Groth16Verifier'].abi,
    functionName: 'verifyProof',
    args: [a, b, c, publicInputs]
  });

  assert.equal(result, true, 'Valid proof inputs evaluate to true');
});

test('Groth16Verifier: rejects inverted geographic bounding box', async () => {
  const verifier = await deployVerifier();

  const a = [100n, 200n];
  const b = [[10n, 20n], [30n, 40n]];
  const c = [50n, 60n];

  // latMin (39000000) > latMax (37000000) -> inverted geofence box
  const invalidInputs = [
    39000000n,
    37000000n,
    122000000n,
    123000000n,
    12345n,
    500n,
    67890n
  ];

  const result = await client.readContract({
    address: verifier,
    abi: artifacts['Groth16Verifier'].abi,
    functionName: 'verifyProof',
    args: [a, b, c, invalidInputs]
  });

  assert.equal(result, false, 'Inverted bounding box should evaluate to false');
});

test('Groth16Verifier: reverts when public scalar input exceeds scalar field modulus', async () => {
  const verifier = await deployVerifier();

  const a = [100n, 200n];
  const b = [[10n, 20n], [30n, 40n]];
  const c = [50n, 60n];

  const L_MOD = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
  const invalidModulusInput = [
    37000000n,
    38000000n,
    122000000n,
    123000000n,
    L_MOD + 1n, // Exceeds scalar field modulus
    500n,
    67890n
  ];

  await assert.rejects(
    async () => {
      await client.readContract({
        address: verifier,
        abi: artifacts['Groth16Verifier'].abi,
        functionName: 'verifyProof',
        args: [a, b, c, invalidModulusInput]
      });
    },
    /InvalidProofPoints/,
    'Should revert with InvalidProofPoints when scalar exceeds L_MOD'
  );
});
