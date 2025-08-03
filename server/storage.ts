import { type DownloadHistory, type InsertDownloadHistory, downloadHistory } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Download History methods
  getDownloadHistory(): Promise<DownloadHistory[]>;
  addDownloadHistory(download: InsertDownloadHistory): Promise<DownloadHistory>;
  deleteDownloadHistory(id: string): Promise<void>;
  clearDownloadHistory(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getDownloadHistory(): Promise<DownloadHistory[]> {
    const history = await db.select().from(downloadHistory).orderBy(desc(downloadHistory.downloadedAt));
    return history;
  }

  async addDownloadHistory(insertDownload: InsertDownloadHistory): Promise<DownloadHistory> {
    const [download] = await db
      .insert(downloadHistory)
      .values({
        ...insertDownload,
        quality: insertDownload.quality || null,
        fileSize: insertDownload.fileSize || null,
        thumbnail: insertDownload.thumbnail || null,
      })
      .returning();
    return download;
  }

  async deleteDownloadHistory(id: string): Promise<void> {
    await db.delete(downloadHistory).where(eq(downloadHistory.id, id));
  }

  async clearDownloadHistory(): Promise<void> {
    await db.delete(downloadHistory);
  }
}

export const storage = new DatabaseStorage();
