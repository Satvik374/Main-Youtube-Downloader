import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertDownloadHistorySchema } from "@shared/schema";
import { z } from "zod";
import ytdl from "@distube/ytdl-core";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import { CookieJar } from "tough-cookie";
import { proxyService } from "./proxyService";
import ffmpeg from "fluent-ffmpeg";
import { exec, spawn } from "child_process";
import { pipeline } from "stream/promises";
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);
const execAsync = promisify(exec);

// Global session management for better anti-detection
const sessionStore = new Map();
const cookieJar = new CookieJar();

// Enhanced rate limiting per IP with production-aware throttling
const requestTracker = new Map();
const serverStartTime = Date.now();

function getRateLimitInfo(ip: string) {
  const now = Date.now();
  const requests = requestTracker.get(ip) || [];
  
  // More aggressive rate limiting for production
  const isProduction = process.env.NODE_ENV === 'production';
  const timeWindow = isProduction ? 7200000 : 3600000; // 2 hours in prod, 1 hour in dev
  
  // Remove requests older than time window
  const recentRequests = requests.filter((time: number) => now - time < timeWindow);
  requestTracker.set(ip, recentRequests);
  
  return {
    count: recentRequests.length,
    lastRequest: recentRequests[recentRequests.length - 1] || 0,
    isProduction
  };
}

function addRequest(ip: string) {
  const requests = requestTracker.get(ip) || [];
  requests.push(Date.now());
  requestTracker.set(ip, requests);
}

// Production-aware delay patterns
function getProductionDelay() {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    // Longer delays in production to avoid detection
    return {
      min: 5000,  // 5 seconds minimum
      max: 15000, // 15 seconds maximum
      betweenRetries: 30000 // 30 seconds between retry attempts
    };
  } else {
    return {
      min: 2000,
      max: 5000,
      betweenRetries: 5000
    };
  }
}

// Enhanced anti-detection configuration for production environments
function getAdvancedConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // More diverse and updated user agents for production
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 OPR/107.0.0.0'
  ];

  const languages = [
    'en-US,en;q=0.9',
    'en-GB,en;q=0.9,en-US;q=0.8',
    'en-US,en;q=0.8,es;q=0.6',
    'en-CA,en;q=0.9,fr;q=0.8',
    'en-AU,en;q=0.9',
    'en,en-US;q=0.9'
  ];

  const platforms = [
    'Win32',
    'MacIntel',
    'Linux x86_64',
    'Linux armv7l'
  ];

  // More sophisticated header configurations for production
  const acceptHeaders = [
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  ];

  const encodings = [
    'gzip, deflate, br',
    'gzip, deflate, br, zstd',
    'gzip, deflate'
  ];

  return {
    userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
    language: languages[Math.floor(Math.random() * languages.length)],
    platform: platforms[Math.floor(Math.random() * platforms.length)],
    accept: acceptHeaders[Math.floor(Math.random() * acceptHeaders.length)],
    encoding: encodings[Math.floor(Math.random() * encodings.length)],
    isProduction
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve ads.txt file for Google AdSense with proper content type
  app.get('/ads.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    try {
      res.sendFile(path.join(process.cwd(), 'ads.txt'));
    } catch (error) {
      // Fallback to public directory
      res.sendFile(path.join(process.cwd(), 'public', 'ads.txt'));
    }
  });
  // Get download history
  app.get("/api/downloads", async (req, res) => {
    try {
      const history = await storage.getDownloadHistory();
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch download history" });
    }
  });

  // Add download to history
  app.post("/api/downloads", async (req, res) => {
    try {
      const validatedData = insertDownloadHistorySchema.parse(req.body);
      const download = await storage.addDownloadHistory(validatedData);
      res.json(download);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid download data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to add download to history" });
      }
    }
  });

  // Delete specific download from history
  app.delete("/api/downloads/:id", async (req, res) => {
    try {
      await storage.deleteDownloadHistory(req.params.id);
      res.json({ message: "Download removed from history" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete download from history" });
    }
  });

  // Clear all download history
  app.delete("/api/downloads", async (req, res) => {
    try {
      await storage.clearDownloadHistory();
      res.json({ message: "Download history cleared" });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear download history" });
    }
  });

  // Real YouTube download process
  app.post("/api/download", async (req, res) => {
    try {
      const { url, format, quality } = req.body;
      const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
      
      if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
        return res.status(400).json({ message: "Invalid YouTube URL" });
      }

      // Validate YouTube URL
      if (!ytdl.validateURL(url)) {
        return res.status(400).json({ message: "Invalid YouTube URL format" });
      }

      // Enhanced production-aware rate limiting
      const rateLimitInfo = getRateLimitInfo(clientIP);
      const isProduction = rateLimitInfo.isProduction;
      
      // More strict limits in production
      const maxRequests = isProduction ? 5 : 10;
      const minInterval = isProduction ? 30000 : 5000; // 30 seconds in prod, 5 seconds in dev
      
      if (rateLimitInfo.count > maxRequests) {
        const waitTime = isProduction ? "30-60 minutes" : "a few minutes";
        return res.status(429).json({ 
          message: `Too many requests. Please wait ${waitTime} before trying again. This helps avoid YouTube's automated blocking systems.` 
        });
      }

      // Check if last request was too recent
      const timeSinceLastRequest = Date.now() - rateLimitInfo.lastRequest;
      if (timeSinceLastRequest < minInterval) {
        const waitSeconds = Math.ceil((minInterval - timeSinceLastRequest) / 1000);
        return res.status(429).json({ 
          message: `Please wait ${waitSeconds} seconds between downloads to avoid detection.` 
        });
      }

      addRequest(clientIP);

      // Enhanced anti-detection setup with production-specific optimizations
      const config = getAdvancedConfig();
      const delays = getProductionDelay();
      const agent = ytdl.createAgent();
      
      // Create session-specific headers that mimic real browser behavior
      const sessionId = `session_${clientIP}_${Date.now()}`;
      const baseHeaders = {
        'User-Agent': config.userAgent,
        'Accept': config.accept,
        'Accept-Language': config.language,
        'Accept-Encoding': config.encoding,
        'Cache-Control': config.isProduction ? 'max-age=0' : 'no-cache',
        'Pragma': config.isProduction ? 'no-cache' : undefined,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': config.isProduction ? 'cross-site' : 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="121", "Google Chrome";v="121"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': `"${config.platform}"`,
        'Connection': 'keep-alive',
        'DNT': '1',
        'Sec-GPC': '1'
      };

      // Remove undefined headers
      const requestOptions = {
        headers: Object.fromEntries(
          Object.entries(baseHeaders).filter(([_, value]) => value !== undefined)
        )
      };
      
      // Try proxy service first (bypasses YouTube IP blocking)
      let videoInfo;
      let lastError;
      
      console.log('Attempting download using proxy service (bypasses YouTube IP blocking)...');
      
      try {
        const proxyResult = await proxyService.getVideoInfo(url);
        
        if (proxyResult && proxyResult.formats.length > 0) {
          console.log('Successfully retrieved video info using proxy service');
          
          // Convert proxy service format to our expected format
          const bestFormat = proxyResult.formats[0];
          
          // Generate filename
          const sanitizedTitle = proxyResult.title
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 100);
          const timestamp = Date.now();
          
          let filename: string;
          let downloadUrl: string;
          let fileSize: string = "Calculating...";
          
          if (format === 'audio') {
            filename = `${sanitizedTitle}_${timestamp}.mp3`;
            // Find audio format or use best available
            const audioFormat = proxyResult.formats.find(f => f.quality === 'audio') || bestFormat;
            if (audioFormat.filesize) {
              fileSize = (audioFormat.filesize / (1024 * 1024)).toFixed(1) + ' MB';
            }
            downloadUrl = `/api/stream/proxy-audio/${encodeURIComponent(url)}/${encodeURIComponent(filename)}`;
          } else {
            // Video download
            filename = `${sanitizedTitle}_${timestamp}.mp4`;
            if (bestFormat.filesize) {
              fileSize = (bestFormat.filesize / (1024 * 1024)).toFixed(1) + ' MB';
            }
            downloadUrl = `/api/stream/proxy-video/${encodeURIComponent(url)}/${encodeURIComponent(filename)}?quality=${quality}`;
          }
          
          const result = {
            success: true,
            title: proxyResult.title,
            fileSize,
            thumbnail: proxyResult.thumbnail,
            downloadUrl,
            filename
          };
          
          return res.json(result);
        }
      } catch (proxyError) {
        console.log('Proxy service failed, falling back to direct methods:', proxyError);
        lastError = proxyError;
      }
      
      // Fallback to original ytdl method if proxy service fails
      let info;
      let videoDetails;
      
      // Enhanced delay functions with production awareness
      const randomDelay = (min = delays.min, max = delays.max) => 
        new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));
      
      // Simulate human browsing pattern with production-specific behavior
      const simulateHumanBehavior = async (attempt = 1) => {
        if (config.isProduction) {
          // More sophisticated delays in production
          const baseDelay = Math.random() * 10000 + 5000; // 5-15 seconds
          const exponentialBackoff = Math.pow(1.5, attempt - 1) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, baseDelay + exponentialBackoff));
        } else {
          // Faster delays in development
          await randomDelay(1000, 3000);
        }
      };
      
      // Strategy 1: Advanced session-based approach
      try {
        console.log('Attempting download with advanced session management...');
        await simulateHumanBehavior(1);
        
        // Store session info for consistency
        sessionStore.set(sessionId, {
          userAgent: config.userAgent,
          timestamp: Date.now(),
          requests: 1
        });
        
        info = await ytdl.getInfo(url, { 
          agent,
          requestOptions
        });
        videoDetails = info.videoDetails;
        console.log('Successfully retrieved video info with advanced session management');
      } catch (error) {
        console.log('Advanced session failed, trying fallback methods...');
        lastError = error;
        
        // Strategy 2: Basic agent with production delays
        try {
          await simulateHumanBehavior(2);
          info = await ytdl.getInfo(url, { agent });
          videoDetails = info.videoDetails;
          console.log('Successfully retrieved video info with basic agent');
        } catch (error2) {
          console.log('Basic agent failed, trying without agent...');
          lastError = error2;
          
          // Strategy 3: No agent, minimal headers
          try {
            await simulateHumanBehavior(3);
            info = await ytdl.getInfo(url, {
              requestOptions: {
                headers: {
                  'User-Agent': config.userAgent
                }
              }
            });
            videoDetails = info.videoDetails;
            console.log('Successfully retrieved video info with minimal headers');
          } catch (error3) {
            console.log('Minimal headers failed, trying alternative approach...');
            lastError = error3;
            
            // Strategy 4: Production-specific fallback with mobile user agent
            try {
              await simulateHumanBehavior(4);
              const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
              info = await ytdl.getInfo(url, {
                requestOptions: {
                  headers: {
                    'User-Agent': mobileUA,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                  }
                }
              });
              videoDetails = info.videoDetails;
              console.log('Successfully retrieved video info with mobile user agent');
            } catch (error4) {
              lastError = error4;
              const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
              
              // Enhanced error detection for production
              const isBlocked = errorMessage.includes('Sign in to confirm') || 
                              errorMessage.includes('robot') || 
                              errorMessage.includes('captcha') ||
                              errorMessage.includes('blocked') ||
                              errorMessage.includes('unavailable') ||
                              errorMessage.includes('parsing watch.html');
              
              if (isBlocked) {
                console.log('Detected YouTube blocking in production environment');
                const waitTime = config.isProduction ? '15-30 minutes' : '5-10 minutes';
                throw new Error(`YouTube is temporarily blocking automated downloads. Please wait ${waitTime} and try again, or try a different video.`);
              } else {
                throw new Error(`Video download failed. Error: ${errorMessage}`);
              }
            }
          }
        }
      }
      

      
      // Generate filename
      const sanitizedTitle = videoDetails.title
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 100); // Limit filename length
      const timestamp = Date.now();
      
      let filename: string;
      let downloadUrl: string;
      let fileSize: string = "Calculating...";

      if (format === 'audio') {
        // Download audio
        filename = `${sanitizedTitle}_${timestamp}.mp3`;
        
        // Find best audio format
        const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
        const audioFormat = audioFormats.find(f => f.audioBitrate) || audioFormats[0];
        
        if (audioFormat && audioFormat.contentLength) {
          fileSize = (parseInt(audioFormat.contentLength) / (1024 * 1024)).toFixed(1) + ' MB';
        } else if (audioFormat && audioFormat.approxDurationMs) {
          // Estimate size based on duration and bitrate
          const durationMs = parseInt(audioFormat.approxDurationMs);
          const bitrate = audioFormat.audioBitrate || 128;
          const estimatedSize = (durationMs * bitrate * 1000) / (8 * 1024 * 1024);
          fileSize = estimatedSize.toFixed(1) + ' MB (est.)';
        }
        
        downloadUrl = `/api/stream/audio/${encodeURIComponent(url)}/${encodeURIComponent(filename)}`;
      } else {
        // Download video
        filename = `${sanitizedTitle}_${timestamp}.mp4`;
        
        // Map quality to ytdl format with fallbacks
        let qualityFilter: string;
        let fallbackQualities: string[] = [];
        
        switch(quality) {
          case '4k':
            qualityFilter = '2160p';
            fallbackQualities = ['1440p', '1080p', 'highest'];
            break;
          case '1080p':
            qualityFilter = '1080p';
            fallbackQualities = ['720p', 'highest'];
            break;
          case '720p':
            qualityFilter = '720p';
            fallbackQualities = ['480p', 'highest'];
            break;
          case '480p':
            qualityFilter = '480p';
            fallbackQualities = ['360p', 'highest'];
            break;
          case '360p':
            qualityFilter = '360p';
            fallbackQualities = ['lowest'];
            break;
          default:
            qualityFilter = 'highest';
            fallbackQualities = [];
        }

        // Try to find the requested quality, with fallbacks
        let videoFormat = null;
        let allVideoFormats = ytdl.filterFormats(info.formats, 'video');
        const videoAndAudioFormats = ytdl.filterFormats(info.formats, 'videoandaudio');
        
        // For 4K, use more sophisticated selection
        if (quality === '4k') {
          // First try to find exact 2160p formats (video-only for 4K)
          videoFormat = allVideoFormats.find(f => 
            (f.qualityLabel === '2160p' || f.height === 2160) && f.hasVideo && !f.hasAudio
          );
          
          // Try different 4K quality labels
          if (!videoFormat) {
            videoFormat = allVideoFormats.find(f => 
              (f.qualityLabel?.includes('2160') || f.height === 2160) && f.hasVideo
            );
          }
          
          // Try highest available video-only format if 4K not available
          if (!videoFormat) {
            videoFormat = allVideoFormats
              .filter(f => f.hasVideo && !f.hasAudio && f.height && f.height >= 1080)
              .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
          }
          
          // Fallback to combined formats with highest resolution
          if (!videoFormat) {
            videoFormat = videoAndAudioFormats
              .filter(f => f.height && f.height >= 1080)
              .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
          }
        } else if (quality === '1080p') {
          // Try video-only formats first for higher quality
          videoFormat = allVideoFormats.find(f => f.qualityLabel === qualityFilter && f.hasVideo && !f.hasAudio);
          
          // If no video-only format, try combined formats
          if (!videoFormat) {
            videoFormat = videoAndAudioFormats.find(f => f.qualityLabel === qualityFilter);
          }
        } else {
          // For lower qualities, prefer combined formats
          videoFormat = videoAndAudioFormats.find(f => f.qualityLabel === qualityFilter);
          
          // Fallback to video-only if needed
          if (!videoFormat) {
            videoFormat = allVideoFormats.find(f => f.qualityLabel === qualityFilter && f.hasVideo && !f.hasAudio);
          }
        }
        
        // Try fallback qualities
        if (!videoFormat && fallbackQualities.length > 0) {
          for (const fallback of fallbackQualities) {
            if (fallback === 'highest') {
              // Try video-only first for highest quality
              videoFormat = allVideoFormats
                .filter(f => f.hasVideo && !f.hasAudio)
                .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
              
              if (!videoFormat) {
                videoFormat = videoAndAudioFormats.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
              }
            } else if (fallback === 'lowest') {
              videoFormat = videoAndAudioFormats.sort((a, b) => (a.height || 0) - (b.height || 0))[0];
            } else {
              // Try video-only first for specific qualities
              videoFormat = allVideoFormats.find(f => f.qualityLabel === fallback && f.hasVideo && !f.hasAudio);
              if (!videoFormat) {
                videoFormat = videoAndAudioFormats.find(f => f.qualityLabel === fallback);
              }
            }
            if (videoFormat) break;
          }
        }
        
        // Last resort: get any video format
        if (!videoFormat) {
          videoFormat = allVideoFormats.filter(f => f.hasVideo)[0] || videoAndAudioFormats[0];
        }
        

        
        if (videoFormat && videoFormat.contentLength) {
          fileSize = (parseInt(videoFormat.contentLength) / (1024 * 1024)).toFixed(1) + ' MB';
        } else if (videoFormat && videoFormat.approxDurationMs) {
          // Estimate size based on duration and quality
          const durationMs = parseInt(videoFormat.approxDurationMs);
          const height = videoFormat.height || 480;
          const estimatedMbps = height >= 1080 ? 8 : height >= 720 ? 5 : height >= 480 ? 2.5 : 1;
          const estimatedSize = (durationMs * estimatedMbps) / (8 * 1000);
          fileSize = estimatedSize.toFixed(1) + ' MB (est.)';
        }
        
        downloadUrl = `/api/stream/video/${encodeURIComponent(url)}/${encodeURIComponent(filename)}?quality=${quality}`;
      }

      const result = {
        success: true,
        title: videoDetails.title,
        fileSize,
        thumbnail: videoDetails.thumbnails[0]?.url || videoDetails.thumbnail?.thumbnails?.[0]?.url,
        downloadUrl,
        filename
      };

      res.json(result);
    } catch (error) {
      console.error('Download error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Provide user-friendly error messages based on error type
      if (errorMessage.includes('YouTube is currently blocking')) {
        res.status(503).json({ 
          message: "YouTube is temporarily blocking downloads. Please wait 15-30 minutes and try again, or try a different video.",
          retryAfter: 1800 // 30 minutes
        });
      } else if (errorMessage.includes('YouTube detected automated access')) {
        res.status(429).json({ 
          message: "YouTube detected too many requests. Please wait a few minutes before trying again.",
          retryAfter: 300 // 5 minutes
        });
      } else if (errorMessage.includes('Too many requests')) {
        res.status(429).json({ 
          message: "You've made too many download requests. Please wait before trying again.",
          retryAfter: 300
        });
      } else if (errorMessage.includes('Sign in to confirm') || errorMessage.includes('robot') || errorMessage.includes('captcha')) {
        res.status(429).json({ 
          message: "YouTube requires verification. Please wait a few minutes and try again with a different video URL.",
          retryAfter: 600
        });
      } else {
        res.status(500).json({ 
          message: "Failed to download video. The video might be private, age-restricted, or temporarily unavailable.",
          error: errorMessage
        });
      }
    }
  });

  // Proxy-based audio streaming (bypasses YouTube IP blocking)
  app.get("/api/stream/proxy-audio/:url/:filename", async (req, res) => {
    try {
      const url = decodeURIComponent(req.params.url);
      const filename = decodeURIComponent(req.params.filename);

      if (!ytdl.validateURL(url)) {
        return res.status(400).json({ message: "Invalid YouTube URL" });
      }

      // Set proper headers for download
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      console.log('Using proxy service for audio streaming...');
      
      try {
        const videoInfo = await proxyService.getVideoInfo(url);
        const audioFormat = videoInfo.formats.find(f => f.quality === 'audio') || videoInfo.formats[0];
        
        if (!audioFormat || !audioFormat.url) {
          throw new Error('No audio format available');
        }
        
        // Stream the audio from the proxy URL
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(audioFormat.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.youtube.com/'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        if (response.body) {
          response.body.pipe(res);
        } else {
          throw new Error('No response body');
        }
      } catch (error) {
        console.error('Proxy audio streaming error:', error);
        res.status(500).json({ message: "Audio streaming failed through proxy service" });
      }
    } catch (error) {
      console.error('Proxy audio streaming error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Audio streaming failed" });
      }
    }
  });

  // Proxy-based video streaming (bypasses YouTube IP blocking)
  app.get("/api/stream/proxy-video/:url/:filename", async (req, res) => {
    try {
      const url = decodeURIComponent(req.params.url);
      const filename = decodeURIComponent(req.params.filename);
      const quality = req.query.quality as string || 'highest';

      if (!ytdl.validateURL(url)) {
        return res.status(400).json({ message: "Invalid YouTube URL" });
      }

      // Set proper headers for download
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      console.log('Using proxy service for video streaming...');
      
      try {
        const videoInfo = await proxyService.getVideoInfo(url);
        
        // Find best format based on quality
        let selectedFormat = videoInfo.formats[0]; // Default
        
        if (quality === '4k') {
          selectedFormat = videoInfo.formats.find(f => f.quality.includes('2160') || f.quality.includes('4K')) || selectedFormat;
        } else if (quality === '1080p') {
          selectedFormat = videoInfo.formats.find(f => f.quality.includes('1080')) || selectedFormat;
        } else if (quality === '720p') {
          selectedFormat = videoInfo.formats.find(f => f.quality.includes('720')) || selectedFormat;
        } else if (quality === '480p') {
          selectedFormat = videoInfo.formats.find(f => f.quality.includes('480')) || selectedFormat;
        }
        
        if (!selectedFormat || !selectedFormat.url) {
          throw new Error('No video format available');
        }
        
        // Stream the video from the proxy URL
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(selectedFormat.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.youtube.com/'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        if (response.body) {
          response.body.pipe(res);
        } else {
          throw new Error('No response body');
        }
      } catch (error) {
        console.error('Proxy video streaming error:', error);
        res.status(500).json({ message: "Video streaming failed through proxy service" });
      }
    } catch (error) {
      console.error('Proxy video streaming error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Video streaming failed" });
      }
    }
  });

  // Stream audio download
  app.get("/api/stream/audio/:url/:filename", async (req, res) => {
    try {
      const url = decodeURIComponent(req.params.url);
      const filename = decodeURIComponent(req.params.filename);

      if (!ytdl.validateURL(url)) {
        return res.status(400).json({ message: "Invalid YouTube URL" });
      }

      // Set proper headers for download
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      // Enhanced streaming with production-specific anti-detection
      const isProduction = process.env.NODE_ENV === 'production';
      const streamConfig = getAdvancedConfig();
      const agent = ytdl.createAgent();
      
      const streamHeaders = {
        'User-Agent': streamConfig.userAgent,
        'Accept': '*/*',
        'Accept-Language': streamConfig.language,
        'Accept-Encoding': streamConfig.encoding,
        'Referer': 'https://www.youtube.com/',
        'Origin': 'https://www.youtube.com',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': isProduction ? 'cross-site' : 'same-origin',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      };
      
      const requestOptions = { headers: streamHeaders };
      
      const audioStream = ytdl(url, { 
        quality: 'highestaudio',
        filter: 'audioonly',
        agent,
        requestOptions
      });
      
      audioStream.on('error', (error) => {
        console.error('Audio stream error:', error);
        if (!res.headersSent) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('parsing watch.html') || errorMessage.includes('Sign in to confirm')) {
            res.status(503).json({ message: "YouTube is temporarily blocking downloads. Please wait 15-30 minutes and try again." });
          } else {
            res.status(500).json({ message: "Audio streaming failed" });
          }
        }
      });
      
      audioStream.pipe(res);
    } catch (error) {
      console.error('Audio streaming error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Audio streaming failed" });
      }
    }
  });

  // Stream video download
  app.get("/api/stream/video/:url/:filename", async (req, res) => {
    try {
      const url = decodeURIComponent(req.params.url);
      const filename = decodeURIComponent(req.params.filename);
      const quality = req.query.quality as string || 'highest';

      if (!ytdl.validateURL(url)) {
        return res.status(400).json({ message: "Invalid YouTube URL" });
      }

      // Set proper headers for download
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      // Enhanced video streaming with production-specific anti-detection
      const isProduction = process.env.NODE_ENV === 'production';
      const videoConfig = getAdvancedConfig();
      const agent = ytdl.createAgent();
      
      const videoHeaders = {
        'User-Agent': videoConfig.userAgent,
        'Accept': videoConfig.accept,
        'Accept-Language': videoConfig.language,
        'Accept-Encoding': videoConfig.encoding,
        'Referer': 'https://www.youtube.com/',
        'Origin': 'https://www.youtube.com',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': isProduction ? 'cross-site' : 'same-origin',
        'Cache-Control': 'no-cache'
      };
      
      const requestOptions = { headers: videoHeaders };
      
      let info;
      let attempt = 1;
      let lastError;
      
      // Multiple retry strategy for production robustness
      while (attempt <= 3) {
        try {
          if (isProduction && attempt > 1) {
            // Add production delays between attempts
            const delay = Math.random() * 5000 + (attempt - 1) * 3000; // 0-5s + backoff
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          console.log(`Video info attempt ${attempt}...`);
          info = await ytdl.getInfo(url, { agent, requestOptions });
          break;
        } catch (error) {
          lastError = error;
          console.log(`Video info attempt ${attempt} failed, retrying...`);
          attempt++;
          
          // Final attempt without agent
          if (attempt === 3) {
            console.log('Retrying video info fetch without agent...');
            info = await ytdl.getInfo(url, { requestOptions });
            break;
          }
        }
      }
      
      if (!info && lastError) {
        throw lastError;
      }
      

      
      // Map quality to ytdl format with fallbacks
      let qualityFilter: string;
      let fallbackQualities: string[] = [];
      
      switch(quality) {
        case '4k':
          qualityFilter = '2160p';
          fallbackQualities = ['1440p', '1080p', 'highest'];
          break;
        case '1080p':
          qualityFilter = '1080p';
          fallbackQualities = ['720p', 'highest'];
          break;
        case '720p':
          qualityFilter = '720p';
          fallbackQualities = ['480p', 'highest'];
          break;
        case '480p':
          qualityFilter = '480p';
          fallbackQualities = ['360p', 'highest'];
          break;
        case '360p':
          qualityFilter = '360p';
          fallbackQualities = ['lowest'];
          break;
        default:
          qualityFilter = 'highest';
      }

      // Find the best available format
      if (!info) {
        throw new Error('No video info available');
      }
      let allVideoFormats = ytdl.filterFormats(info.formats, 'video');
      const videoAndAudioFormats = ytdl.filterFormats(info.formats, 'videoandaudio');
      let selectedFormat = null;
      
      // For 4K, use more sophisticated selection
      if (quality === '4k') {
        // First try to find exact 2160p formats (video-only for 4K)
        selectedFormat = allVideoFormats.find(f => 
          (f.qualityLabel === '2160p' || f.height === 2160) && f.hasVideo && !f.hasAudio
        );
        
        // Try different 4K quality labels
        if (!selectedFormat) {
          selectedFormat = allVideoFormats.find(f => 
            (f.qualityLabel?.includes('2160') || f.height === 2160) && f.hasVideo
          );
        }
        
        // Try highest available video-only format if 4K not available
        if (!selectedFormat) {
          selectedFormat = allVideoFormats
            .filter(f => f.hasVideo && !f.hasAudio && f.height && f.height >= 1080)
            .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
        }
        
        // Fallback to combined formats with highest resolution
        if (!selectedFormat) {
          selectedFormat = videoAndAudioFormats
            .filter(f => f.height && f.height >= 1080)
            .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
        }
      } else if (quality === '1080p') {
        // Try video-only formats first for higher quality
        selectedFormat = allVideoFormats.find(f => f.qualityLabel === qualityFilter && f.hasVideo && !f.hasAudio);
        
        // If no video-only format, try combined formats
        if (!selectedFormat) {
          selectedFormat = videoAndAudioFormats.find(f => f.qualityLabel === qualityFilter);
        }
      } else {
        // For lower qualities, prefer combined formats
        selectedFormat = videoAndAudioFormats.find(f => f.qualityLabel === qualityFilter);
        
        // Fallback to video-only if needed
        if (!selectedFormat) {
          selectedFormat = allVideoFormats.find(f => f.qualityLabel === qualityFilter && f.hasVideo && !f.hasAudio);
        }
      }
      
      // Try fallback qualities if the exact quality isn't available
      if (!selectedFormat && fallbackQualities.length > 0) {
        for (const fallback of fallbackQualities) {
          if (fallback === 'highest') {
            // Try video-only first for highest quality
            selectedFormat = allVideoFormats
              .filter(f => f.hasVideo && !f.hasAudio)
              .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
            
            if (!selectedFormat) {
              selectedFormat = videoAndAudioFormats.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
            }
          } else if (fallback === 'lowest') {
            selectedFormat = videoAndAudioFormats.sort((a, b) => (a.height || 0) - (b.height || 0))[0];
          } else {
            // Try video-only first for specific qualities
            selectedFormat = allVideoFormats.find(f => f.qualityLabel === fallback && f.hasVideo && !f.hasAudio);
            if (!selectedFormat) {
              selectedFormat = videoAndAudioFormats.find(f => f.qualityLabel === fallback);
            }
          }
          if (selectedFormat) break;
        }
      }
      
      // Last resort: get any video format
      if (!selectedFormat) {
        selectedFormat = allVideoFormats.filter(f => f.hasVideo)[0] || videoAndAudioFormats[0];
      }



      const enhancedRequestOptions = {
        headers: {
          'User-Agent': videoConfig.userAgent,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://www.youtube.com/',
          'Origin': 'https://www.youtube.com',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin'
        }
      };
      
      const videoStream = ytdl(url, { 
        format: selectedFormat,
        agent,
        requestOptions: enhancedRequestOptions
      });
      
      videoStream.on('error', (error) => {
        console.error('Video stream error:', error);
        if (!res.headersSent) {
          res.status(500).json({ message: "Video streaming failed" });
        }
      });
      
      videoStream.pipe(res);
    } catch (error) {
      console.error('Video streaming error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Video streaming failed" });
      }
    }
  });

  // FFmpeg-based download endpoint for better quality using yt-dlp
  app.post("/api/download-ffmpeg", async (req, res) => {
    try {
      const { url, quality = '1080p', format = 'mp4' } = req.body;
      
      if (!url) {
        return res.status(400).json({ message: "URL is required" });
      }

      // Create temp directory for processing
      const tempDir = path.join(process.cwd(), 'temp');
      try {
        await access(tempDir);
      } catch {
        await mkdir(tempDir, { recursive: true });
      }

      const videoId = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1] || Date.now().toString();
      const outputPath = path.join(tempDir, `${videoId}_ffmpeg.${format}`);

      // Use yt-dlp with FFmpeg for best quality
      let qualitySelector;
      switch(quality) {
        case '4k':
          qualitySelector = 'bestvideo[height<=2160]+bestaudio/best[height<=2160]';
          break;
        case '1440p':
          qualitySelector = 'bestvideo[height<=1440]+bestaudio/best[height<=1440]';
          break;
        case '1080p':
          qualitySelector = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]';
          break;
        case '720p':
          qualitySelector = 'bestvideo[height<=720]+bestaudio/best[height<=720]';
          break;
        case '480p':
          qualitySelector = 'bestvideo[height<=480]+bestaudio/best[height<=480]';
          break;
        default:
          qualitySelector = 'best';
      }

      // Enhanced yt-dlp command with anti-detection measures
      const baseArgs = [
        '--format', qualitySelector,
        '--merge-output-format', format,
        '--output', outputPath,
        '--no-playlist',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--referer', 'https://www.youtube.com/',
        '--embed-chapters',
        '--write-info-json',
        '--no-write-playlist-metafiles',
        url
      ];

      console.log(`FFmpeg download command: yt-dlp ${baseArgs.join(' ')}`);
      
      let downloadSuccess = false;
      let lastError: any;
      
      // Try multiple strategies for better success rate
      const strategies = [
        // Strategy 1: Standard download with anti-detection
        [...baseArgs],
        // Strategy 2: Force IPv4 and add more headers
        [...baseArgs, '--force-ipv4', '--add-header', 'Accept-Language:en-US,en;q=0.9'],
        // Strategy 3: Use mobile API
        [...baseArgs.slice(0, -1), '--user-agent', 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip', url],
        // Strategy 4: Simple format without quality restriction
        ['--format', 'mp4', '--merge-output-format', format, '--output', outputPath, '--no-playlist', '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', url],
        // Strategy 5: Fallback to any available format
        ['--output', outputPath, '--no-playlist', url]
      ];
      
      for (let i = 0; i < strategies.length && !downloadSuccess; i++) {
        const currentArgs = strategies[i];
        console.log(`Attempting strategy ${i + 1}: yt-dlp ${currentArgs.join(' ')}`);
        
        try {
          await new Promise((resolve, reject) => {
            const process = spawn('yt-dlp', currentArgs);
            let stderr = '';
            let stdout = '';
            
            process.stderr?.on('data', (data) => {
              stderr += data.toString();
            });
            
            process.stdout?.on('data', (data) => {
              stdout += data.toString();
            });
            
            process.on('close', (code) => {
              if (code === 0) {
                resolve(void 0);
              } else {
                reject(new Error(`yt-dlp exited with code ${code}. stderr: ${stderr}`));
              }
            });
            
            process.on('error', (error) => {
              reject(error);
            });
          });
          
          downloadSuccess = true;
          console.log(`Strategy ${i + 1} succeeded`);
        } catch (error) {
          lastError = error;
          console.log(`Strategy ${i + 1} failed:`, error);
          
          // Clean up failed attempt file if exists
          try {
            if (fs.existsSync(outputPath)) {
              fs.unlinkSync(outputPath);
            }
          } catch (cleanupError) {
            console.log('Failed to cleanup file:', cleanupError);
          }
          
          // Wait before next attempt
          if (i < strategies.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      if (!downloadSuccess) {
        console.error('All yt-dlp strategies failed:', lastError);
        
        // Check if it's a 403 error (YouTube blocking)
        const isBlocked = lastError?.message?.includes('403') || lastError?.message?.includes('Forbidden');
        const isSignatureError = lastError?.message?.includes('nsig extraction failed') || lastError?.message?.includes('Signature extraction failed');
        
        let errorMessage = "FFmpeg download failed. ";
        
        if (isBlocked || isSignatureError) {
          errorMessage += "YouTube is currently blocking automated downloads. This is temporary - please try the regular download options instead, or wait 15-30 minutes before trying FFmpeg downloads again.";
        } else {
          errorMessage += "Please try again later or use the regular download options.";
        }
        
        return res.status(503).json({ 
          message: errorMessage,
          suggestion: "Try using the regular Video or Audio download buttons instead - they use different methods that may work better."
        });
      }

      // Get video title for filename
      let title = 'video';
      try {
        const titlePromise = new Promise<string>((resolve, reject) => {
          const process = spawn('yt-dlp', ['--get-title', url]);
          let stdout = '';
          
          process.stdout?.on('data', (data) => {
            stdout += data.toString();
          });
          
          process.on('close', (code) => {
            if (code === 0) {
              resolve(stdout.trim());
            } else {
              reject(new Error(`Failed to get title, code ${code}`));
            }
          });
          
          process.on('error', reject);
        });
        
        const videoTitle = await titlePromise;
        title = videoTitle.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 50);
      } catch {
        // Use default title if can't get video title
        console.log('Failed to get video title, using default');
      }

      // Set response headers for download
      const filename = `${title}_${quality}.${format}`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', format === 'mp4' ? 'video/mp4' : 'video/webm');

      // Stream the final file
      const fileStream = fs.createReadStream(outputPath);
      fileStream.pipe(res);

      // Cleanup temp file after streaming
      fileStream.on('end', () => {
        setTimeout(() => {
          fs.unlink(outputPath, (err) => {
            if (err) console.log(`Failed to delete temp file: ${outputPath}`);
          });
        }, 1000);
      });

    } catch (error) {
      console.error('FFmpeg download error:', error);
      res.status(500).json({ message: "FFmpeg download failed" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
