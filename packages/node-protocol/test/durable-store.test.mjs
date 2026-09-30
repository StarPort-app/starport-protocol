import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createReceiptVerifier,
  DurableFileReceiptReplayStore,
  MemoryReceiptReplayStore
} from '../dist/index.js';

test('MemoryReceiptReplayStore tracks, prunes and reports size', () => {
  const store = new MemoryReceiptReplayStore();
  assert.equal(store.size(), 0);
  assert.equal(store.has('key1'), false);

  store.set('key1', 1000);
  assert.equal(store.size(), 1);
  assert.equal(store.has('key1'), true);

  // Prune entries older than 500
  store.prune(500);
  assert.equal(store.has('key1'), true);

  // Prune entries older than 1500
  store.prune(1500);
  assert.equal(store.has('key1'), false);
  assert.equal(store.size(), 0);
});

test('DurableFileReceiptReplayStore persists entries to disk and survives reload across instances', () => {
  const testFile = join(tmpdir(), `starport-replay-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  try {
    const store1 = new DurableFileReceiptReplayStore(testFile);
    assert.equal(store1.size(), 0);

    store1.set('node1:task1:attempt1', 5000);
    store1.set('node2:task2:attempt1', 8000);
    assert.equal(store1.size(), 2);
    assert.equal(existsSync(testFile), true);

    // Simulate process restart: instantiate a new store pointing to the same file
    const store2 = new DurableFileReceiptReplayStore(testFile);
    assert.equal(store2.size(), 2);
    assert.equal(store2.has('node1:task1:attempt1'), true);
    assert.equal(store2.has('node2:task2:attempt1'), true);
    assert.equal(store2.has('unknown_key'), false);

    // Prune on store2
    store2.prune(6000);
    assert.equal(store2.has('node1:task1:attempt1'), false);
    assert.equal(store2.has('node2:task2:attempt1'), true);
    assert.equal(store2.size(), 1);

    // Instantiate a third instance to confirm pruned state persisted
    const store3 = new DurableFileReceiptReplayStore(testFile);
    assert.equal(store3.size(), 1);
    assert.equal(store3.has('node2:task2:attempt1'), true);
  } finally {
    if (existsSync(testFile)) rmSync(testFile, { force: true });
  }
});

test('createReceiptVerifier accepts custom durable store', () => {
  const customStore = new MemoryReceiptReplayStore();
  const verifier = createReceiptVerifier({ maxEntries: 50, store: customStore });
  assert.equal(verifier.store, customStore);
});
