import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { sqliteTable, text as sqliteText, integer as sqliteInteger } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// PostgreSQL schema
export const downloadHistory = pgTable("download_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  url: text("url").notNull(),
  format: text("format").notNull(),
  quality: text("quality"),
  fileSize: text("file_size"),
  thumbnail: text("thumbnail"),
  status: text("status").notNull().default("completed"),
  downloadedAt: timestamp("downloaded_at").defaultNow(),
});

// SQLite schema
export const downloadHistorySQLite = sqliteTable("download_history", {
  id: sqliteText("id").primaryKey().default(sql`(hex(randomblob(16)))`),
  title: sqliteText("title").notNull(),
  url: sqliteText("url").notNull(),
  format: sqliteText("format").notNull(),
  quality: sqliteText("quality"),
  fileSize: sqliteText("file_size"),
  thumbnail: sqliteText("thumbnail"),
  status: sqliteText("status").notNull().default("completed"),
  downloadedAt: sqliteInteger("downloaded_at", { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const insertDownloadHistorySchema = createInsertSchema(downloadHistory).pick({
  title: true,
  url: true,
  format: true,
  quality: true,
  fileSize: true,
  thumbnail: true,
  status: true,
});

export type InsertDownloadHistory = z.infer<typeof insertDownloadHistorySchema>;
export type DownloadHistory = typeof downloadHistory.$inferSelect;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const usersSQLite = sqliteTable("users", {
  id: sqliteText("id").primaryKey().default(sql`(hex(randomblob(16)))`),
  username: sqliteText("username").notNull().unique(),
  password: sqliteText("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
