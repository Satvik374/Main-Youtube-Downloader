import { type DownloadHistory, type InsertDownloadHistory, downloadHistory, downloadHistorySQLite } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

// Determine which table to use based on environment
const isSQLite = !process.env.DATABASE_URL;
const downloadHistoryTable = isSQLite ? downloadHistorySQLite : downloadHistory;

export interface IStorage {
  // Download History methods
  getDownloadHistory(): Promise<DownloadHistory[]>;
  addDownloadHistory(download: InsertDownloadHistory): Promise<DownloadHistory>;
  deleteDownloadHistory(id: string): Promise<void>;
  clearDownloadHistory(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getDownloadHistory(): Promise<DownloadHistory[]> {
    const history = await db.select().from(downloadHistoryTable).orderBy(isSQLite ? downloadHistoryTable.downloadedAt.desc() : downloadHistoryTable.downloadedAt.desc());
    return history;
  }

  async addDownloadHistory(insertDownload: InsertDownloadHistory): Promise<DownloadHistory> {
    const [download] = await db
      .insert(downloadHistoryTable)
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
    await db.delete(downloadHistoryTable).where(downloadHistoryTable.id.eq(id));
  }

  async clearDownloadHistory(): Promise<void> {
    await db.delete(downloadHistoryTable);
  }
}

export const storage = new DatabaseStorage();
