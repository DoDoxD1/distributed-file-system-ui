import { Injectable } from '@angular/core';

import { DownloadFileResponse, FileListingResponse } from '../models/api.models';

const DB_NAME = 'dfs-file-cache';
const DB_VERSION = 1;
const STORE_LISTINGS = 'file-listings';
const STORE_CONTENTS = 'file-contents';
const LISTING_TTL_MS = 60_000;

interface ListingEntry {
  key: string;
  data: FileListingResponse[];
  cachedAt: number;
}

interface ContentEntry {
  key: string;
  data: DownloadFileResponse;
  cachedAt: number;
}

@Injectable({ providedIn: 'root' })
export class FileCacheService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_LISTINGS)) {
          db.createObjectStore(STORE_LISTINGS, { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains(STORE_CONTENTS)) {
          db.createObjectStore(STORE_CONTENTS, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
      request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
    });

    return this.dbPromise;
  }

  private async get<T>(storeName: string, key: string): Promise<T | null> {
    try {
      const db = await this.openDb();
      return await new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).get(key);
        request.onsuccess = () => resolve((request.result as T) ?? null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }

  private async put<T>(storeName: string, value: T): Promise<void> {
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const request = tx.objectStore(storeName).put(value);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
    }
  }

  private async delete(storeName: string, key: string): Promise<void> {
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const request = tx.objectStore(storeName).delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
    }
  }

  private async clearStore(storeName: string): Promise<void> {
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const request = tx.objectStore(storeName).clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
    }
  }

  async getListing(key: string): Promise<FileListingResponse[] | null> {
    const entry = await this.get<ListingEntry>(STORE_LISTINGS, key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > LISTING_TTL_MS) {
      void this.delete(STORE_LISTINGS, key);
      return null;
    }
    return entry.data;
  }

  async putListing(key: string, data: FileListingResponse[]): Promise<void> {
    await this.put<ListingEntry>(STORE_LISTINGS, { key, data, cachedAt: Date.now() });
  }

  async invalidateListing(key: string): Promise<void> {
    await this.delete(STORE_LISTINGS, key);
  }

  async getContent(logicalPath: string, versionId: string): Promise<DownloadFileResponse | null> {
    const key = `${logicalPath}:${versionId}`;
    const entry = await this.get<ContentEntry>(STORE_CONTENTS, key);
    return entry?.data ?? null;
  }

  async putContent(logicalPath: string, versionId: string, data: DownloadFileResponse): Promise<void> {
    const key = `${logicalPath}:${versionId}`;
    await this.put<ContentEntry>(STORE_CONTENTS, { key, data, cachedAt: Date.now() });
  }

  async evictContent(logicalPath: string): Promise<void> {
    try {
      const db = await this.openDb();
      const prefix = `${logicalPath}:`;
      const allKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const tx = db.transaction(STORE_CONTENTS, 'readonly');
        const request = tx.objectStore(STORE_CONTENTS).getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const toDelete = allKeys.filter((k) => typeof k === 'string' && k.startsWith(prefix));
      for (const k of toDelete) {
        await this.delete(STORE_CONTENTS, k as string);
      }
    } catch {
    }
  }

  async clearAll(): Promise<void> {
    await Promise.all([this.clearStore(STORE_LISTINGS), this.clearStore(STORE_CONTENTS)]);
  }
}
