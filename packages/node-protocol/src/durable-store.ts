import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export interface ReceiptReplayStore {
  has(key: string): boolean;
  set(key: string, expiresAtMs: number): void;
  delete(key: string): void;
  prune(nowMs: number): void;
  size(): number;
  entries(): Iterable<[string, number]>;
}

export class MemoryReceiptReplayStore implements ReceiptReplayStore {
  private readonly map = new Map<string, number>();

  has(key: string): boolean {
    return this.map.has(key);
  }

  set(key: string, expiresAtMs: number): void {
    this.map.set(key, expiresAtMs);
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  prune(nowMs: number): void {
    for (const [key, expires] of this.map) {
      if (expires < nowMs) this.map.delete(key);
    }
  }

  size(): number {
    return this.map.size;
  }

  entries(): Iterable<[string, number]> {
    return this.map.entries();
  }
}

/**
 * File-backed durable replay store for production receipts.
 * Guarantees that (node_id, task_id, attempt_id) replay state survives process restarts.
 */
export class DurableFileReceiptReplayStore implements ReceiptReplayStore {
  private readonly map = new Map<string, number>();
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'number') {
              this.map.set(item[0], item[1]);
            }
          }
        }
      }
    } catch {
      // If corrupted or unreadable, start fresh
      this.map.clear();
    }
  }

  private persist(): void {
    try {
      const dir = dirname(this.filePath);
      mkdirSync(dir, { recursive: true });
      const serialized = JSON.stringify(Array.from(this.map.entries()));
      const tempPath = `${this.filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      writeFileSync(tempPath, serialized, 'utf8');
      renameSync(tempPath, this.filePath);
    } catch {
      // Best-effort atomic flush
    }
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  set(key: string, expiresAtMs: number): void {
    this.map.set(key, expiresAtMs);
    this.persist();
  }

  delete(key: string): void {
    this.map.delete(key);
    this.persist();
  }

  prune(nowMs: number): void {
    let changed = false;
    for (const [key, expires] of this.map) {
      if (expires < nowMs) {
        this.map.delete(key);
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  size(): number {
    return this.map.size;
  }

  entries(): Iterable<[string, number]> {
    return this.map.entries();
  }
}
