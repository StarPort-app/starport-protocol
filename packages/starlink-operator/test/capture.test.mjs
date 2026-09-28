import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { generateKeyPairSync, sign } from 'node:crypto';
import { signBoundedOperatorMessage } from '@starport/node-agent';
import { verifyOperatorSignature } from '@starport/node-protocol';
import { CAPTURE_MAX_BYTES, STARLINK_LAN_TARGET, STARLINK_STATUS_METHOD, STARLINK_STATUS_REQUEST,
  createStarlinkOperator, createGrpcurlTransport, grpcurlArguments, parseStarlinkStatus,
  unsignedCaptureReport, captureMessage, signCaptureReport, inspectCaptureReport, StarlinkCaptureError } from '../dist/index.js';
import { runCaptureCli } from '../dist/cli.js';

const NOW = Date.parse('2026-09-26T12:00:00.000Z');
// Synthetic test status only. No actual terminal, station, private key file or LAN connection.
const status = () => ({ dishGetStatus: {
  boresightAzimuthDeg: 145.123, boresightElevationDeg: '75.202', snr: 8.7, state: 'CONNECTED',
  deviceInfo: { id: 'private-terminal-id', hardwareVersion: 'private-device-version' },
  deviceState: { uptimeS: 9000 }, location: { latitude: 11.2, longitude: 33.4 },
  downlinkThroughputBps: 777888, popPingLatencyMs: 12,
}, dishGetDiagnostics: { id: 'private-diagnostics-id', location: { latitude: 55 } } });
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const transport = value => ({ source: 'injected_transport', read: async () => bytes(value) });
const operator = value => createStarlinkOperator({ enabled: true, allowFixedLanTarget: true, clock: () => NOW, transport: transport(value) });
const request = () => ({ target: STARLINK_LAN_TARGET, method: STARLINK_STATUS_METHOD, body: STARLINK_STATUS_REQUEST });

test('default and missing consent paths remain inert; arbitrary targets/method arguments are refused', async () => {
  let calls = 0;
  const source = { source: 'injected_transport', read: async () => { calls++; return bytes(status()); } };
  for (const options of [{}, { enabled: true }, { allowFixedLanTarget: true }, { enabled: false, allowFixedLanTarget: true }]) {
    const result = await createStarlinkOperator({ ...options, transport: source }).capture();
    assert.equal(result.status, 'disabled'); assert.equal(result.code, 'OPT_IN_REQUIRED');
  }
  assert.equal(calls, 0);
  assert.throws(() => createStarlinkOperator({ url: 'https://other.invalid/' }), StarlinkCaptureError);
  assert.throws(() => createStarlinkOperator({ timeoutMs: 5001 }), StarlinkCaptureError);
  assert.equal((await operator(status()).capture({ target: 'other' })).code, 'INVALID_OPTIONS');
});

test('camel/snake aliases normalize only four whitelisted measurement fields', () => {
  const expected = { azimuthMilliDeg: 145123, elevationMilliDeg: 75202, snrMilliDb: 8700, status: 'connected' };
  assert.deepEqual(parseStarlinkStatus(status()), expected);
  assert.deepEqual(parseStarlinkStatus({ dish_get_status: { boresight_azimuth_deg: '145.123', boresight_elevation_deg: 75.202, snr_db: '8.7', state: 'connected' } }), expected);
  assert.deepEqual(parseStarlinkStatus({ boresightElevationDeg: 0 }), { azimuthMilliDeg: null, elevationMilliDeg: 0, snrMilliDb: null, status: 'unknown' });
});

test('missing SNR is partial, not a fabricated zero; raw private fields and their hashes are excluded', async () => {
  const raw = status(); delete raw.dishGetStatus.snr;
  const captured = await operator(raw).capture();
  assert.equal(captured.status, 'captured');
  assert.equal(captured.report.capture.completeness, 'partial');
  assert.equal(captured.report.capture.measurements.snrMilliDb, null);
  assert.equal(captured.report.capture.source, 'injected_transport');
  assert.equal(captured.report.capture.hardwareAttested, false);
  assert.equal(captured.report.capture.satelliteIdentity, null);
  assert.equal(captured.report.capture.chainResult, 'not_submitted');
  assert.equal(captured.report.signature, null);
  const serialized = JSON.stringify(captured);
  for (const secret of ['private-terminal-id','private-device-version','private-diagnostics-id','latitude','longitude','777888','uptimeS','utidHash']) assert.equal(serialized.includes(secret), false);
  const changed = status(); delete changed.dishGetStatus.snr;
  changed.dishGetStatus.deviceInfo.id = 'different-private-id';
  changed.dishGetStatus.location.latitude = 88;
  assert.equal((await operator(changed).capture()).report.captureDigest, captured.report.captureDigest);
});

test('invalid, conflicting and empty supported fields do not become successful telemetry', () => {
  for (const value of [null, [], {}, { state: 1 }, { deviceInfo: { id: 'private' } },
    { boresightAzimuthDeg: 360 }, { boresightAzimuthDeg: -1 }, { boresightElevationDeg: 91 }, { snr: Infinity },
    { snr: 'unknown' }, { snr: 8, snrDb: 9 }, { dishGetStatus: {}, dish_get_status: {} },
    { dishGetStatus: 'private-error-body' }]) assert.throws(() => parseStarlinkStatus(value), StarlinkCaptureError);
  assert.equal(parseStarlinkStatus({ snrDb: 2, state: 'private-unrecognized-state' }).status, 'unknown');
});

test('timeouts retain the concurrency slot for transports that ignore abort', async () => {
  let complete;
  let calls = 0;
  let signal;
  const agent = createStarlinkOperator({ enabled: true, allowFixedLanTarget: true, timeoutMs: 5, clock: () => NOW,
    transport: { source: 'injected_transport', read: async (_request, options) => {
      calls++; signal = options.signal;
      if (calls === 1) return new Promise(resolve => { complete = resolve; });
      return bytes(status());
    } } });
  const first = await agent.capture();
  assert.equal(first.code, 'CAPTURE_TIMEOUT'); assert.equal(signal.aborted, true);
  assert.equal((await agent.capture()).code, 'CAPTURE_BUSY'); assert.equal(calls, 1);
  complete(bytes(status())); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await agent.capture()).status, 'captured'); assert.equal(calls, 2);
});

test('oversized, invalid JSON/UTF-8 and thrown errors return sanitized failures', async () => {
  for (const [read, code] of [
    [async () => new Uint8Array(CAPTURE_MAX_BYTES + 1), 'CAPTURE_TOO_LARGE'],
    [async () => new Uint8Array([255]), 'INVALID_STATUS'],
    [async () => new TextEncoder().encode('{broken private-raw-data'), 'INVALID_STATUS'],
    [async () => { throw new Error('private-raw-data'); }, 'CAPTURE_FAILED'],
  ]) {
    const result = await createStarlinkOperator({ enabled: true, allowFixedLanTarget: true, clock: () => NOW, transport: { source: 'injected_transport', read } }).capture();
    assert.equal(result.code, code); assert.equal(JSON.stringify(result).includes('private-raw-data'), false);
  }
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kills = [];
  child.kill = signal => { child.kills.push(signal); return true; };
  return child;
}

test('grpcurl bridge fixes LAN target/body and never inherits credentials, shell, or stdin', async () => {
  let called = 0;
  const child = fakeChild();
  const bridge = createGrpcurlTransport('/trusted/grpcurl', {
    checkExecutable: async path => { assert.equal(path, '/trusted/grpcurl'); },
    spawn: (file, args, options) => {
      called++; assert.equal(file, '/trusted/grpcurl');
      assert.deepEqual(args, ['-plaintext', '-d', '{"get_status":{}}', '192.168.100.1:9200', 'SpaceX.API.Device.Device/Handle']);
      assert.deepEqual(options.env, {}); assert.equal(options.shell, false); assert.equal(options.cwd, '/');
      setImmediate(() => { child.stdout.write(bytes(status())); child.emit('close', 0); }); return child;
    },
  });
  assert.equal(called, 0);
  assert.equal(bridge.source, 'injected_transport');
  const output = await bridge.read(request(), { signal: new AbortController().signal, maxBytes: CAPTURE_MAX_BYTES });
  assert.equal(parseStarlinkStatus(JSON.parse(new TextDecoder().decode(output))).snrMilliDb, 8700);
  assert.equal(child.stdin.writableEnded, true);
  assert.equal(called, 1);
  assert.deepEqual(grpcurlArguments(), ['-plaintext', '-d', STARLINK_STATUS_REQUEST, STARLINK_LAN_TARGET, STARLINK_STATUS_METHOD]);
  for (const bad of [{ ...request(), target: '127.0.0.1:1' }, { ...request(), method: 'Reset' }, { ...request(), body: '{"reboot":{}}' }, { ...request(), url: 'https://other.invalid/' }]) {
    await assert.rejects(bridge.read(bad, { signal: new AbortController().signal, maxBytes: CAPTURE_MAX_BYTES }), StarlinkCaptureError);
  }
  assert.equal(called, 1);
});

test('missing dependency, gRPC errors, stderr floods and abort never leak raw output', async () => {
  const absent = createGrpcurlTransport('/trusted/grpcurl', { checkExecutable: async () => { throw new StarlinkCaptureError('DEPENDENCY_MISSING'); } });
  await assert.rejects(absent.read(request(), { signal: new AbortController().signal, maxBytes: 100 }), error => error.code === 'DEPENDENCY_MISSING');
  for (const scenario of ['error','stderr','stdout','timeout']) {
    const child = fakeChild();
    const bridge = createGrpcurlTransport('/trusted/grpcurl', { checkExecutable: async () => {}, spawn: () => {
      setImmediate(() => {
        if (scenario === 'error') { child.stderr.write('private-terminal-id'); child.emit('close', 1); }
        if (scenario === 'stderr') child.stderr.write('x'.repeat(CAPTURE_MAX_BYTES + 1));
        if (scenario === 'stdout') child.stdout.write('x'.repeat(CAPTURE_MAX_BYTES + 1));
      }); return child;
    } });
    const result = await createStarlinkOperator({ enabled: true, allowFixedLanTarget: true, timeoutMs: 10, transport: bridge }).capture();
    assert.equal(result.status, 'unavailable'); assert.equal(JSON.stringify(result).includes('private-terminal-id'), false);
    assert.ok(child.kills.includes('SIGKILL'));
  }
});

test('operator signing authenticates only a sanitized capture in a separate non-financial domain', async () => {
  const result = await operator(status()).capture();
  const capture = result.report.capture;
  // Ephemeral test key object, generated in memory, never loaded, exported or persisted.
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawPublic = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  let signed = 0;
  const signer = { publicKey: `ed25519:0x${rawPublic.toString('hex')}`, sign: message => { signed++; return sign(null, message, privateKey); } };
  const signedReport = signCaptureReport(capture, signer);
  assert.equal(signedReport.signature.domain, 'starport-terminal-capture/v1');
  assert.equal(signedReport.signature.statementDigest, signedReport.captureDigest);
  assert.equal(verifyOperatorSignature(signer.publicKey, captureMessage(capture), signedReport.signature.signature), true);
  assert.equal(inspectCaptureReport(signedReport), 'operator_signed');
  assert.equal(inspectCaptureReport(unsignedCaptureReport(capture)), 'unsigned');
  assert.equal(inspectCaptureReport({ ...signedReport, captureDigest: `0x${'00'.repeat(32)}` }), 'invalid');
  assert.equal(inspectCaptureReport({ ...signedReport, signature: { ...signedReport.signature, domain: 'starport-operator/v1' } }), 'invalid');
  assert.equal(inspectCaptureReport({ ...signedReport, capture: { ...capture, hardwareAttested: true } }), 'invalid');
  assert.equal(capture.hardwareAttested, false); assert.equal(capture.chainResult, 'not_submitted');
  assert.throws(() => signBoundedOperatorMessage(signer, captureMessage(capture)));
  assert.equal(signed, 1, 'Existing node-agent receipt scheme must reject a capture purpose before signing.');
  for (const changed of [{ ...capture, hardwareAttested: true }, { ...capture, chainResult: 'confirmed' },
    { ...capture, location: { latitude: 1 } }, { ...capture, elapsedMs: 1 }, { ...capture, target: 'other' }]) {
    assert.throws(() => signCaptureReport(changed, signer), StarlinkCaptureError);
  }
  assert.equal(signed, 1);
  assert.throws(() => signCaptureReport(capture, { publicKey: signer.publicKey, sign: () => new Uint8Array(64) }), StarlinkCaptureError);
  assert.equal(unsignedCaptureReport(capture).signature, null);
});

test('CLI defaults to help, refuses arbitrary inputs, and outputs only unsigned injected capture in offline tests', async () => {
  const stdout = [], stderr = [];
  const io = { out: text => stdout.push(text), error: text => stderr.push(text) };
  assert.equal(await runCaptureCli([], io), 0);
  assert.match(stdout.join(''), /Disabled unless explicitly opted in/);
  assert.equal(await runCaptureCli(['--capture', '--url', 'private-input'], io), 2);
  assert.equal(stderr.join('').includes('private-input'), false);
  stdout.length = 0;
  assert.equal(await runCaptureCli(['--capture','--allow-lan-starlink','--grpcurl','/trusted/grpcurl'], io, { transport: transport(status()) }), 0);
  const parsed = JSON.parse(stdout[0]);
  assert.equal(parsed.report.signature, null); assert.equal(parsed.report.capture.source, 'injected_transport');
  assert.equal(stdout[0].includes('private-terminal-id'), false);
  assert.throws(() => createGrpcurlTransport('grpcurl'), StarlinkCaptureError);
  assert.throws(() => createGrpcurlTransport('/bin/sh'), StarlinkCaptureError);
});
