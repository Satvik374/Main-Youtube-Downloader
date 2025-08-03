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
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);

// Global session management for better anti-detection
const sessionStore = new Map();
const cookieJar = new CookieJar();

// Rate limiting per IP to avoid detection
const requestTracker = new Map();

function getRateLimitInfo(ip: string) {
  const now = Date.now();
  const requests = requestTracker.get(ip) || [];
  
  // Remove requests older than 1 hour
  const recentRequests = requests.filter((time: number) => now - time < 3600000);
  requestTracker.set(ip, recentRequests);
  
  return {
    count: recentRequests.length,
    lastRequest: recentRequests[recentRequests.length - 1] || 0
  };
}

function addRequest(ip: string) {
  const requests = requestTracker.get(ip) || [];
  requests.push(Date.now());
  requestTracker.set(ip, requests);
}

// Advanced anti-detection configuration
function getAdvancedConfig() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0'
  ];

  const languages = [
    'en-US,en;q=0.9',
    'en-GB,en;q=0.9',
    'en-US,en;q=0.8',
    'en-CA,en;q=0.9'
  ];

  const platforms = [
    'Win32',
    'MacIntel',
    'Linux x86_64'
  ];

  return {
    userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
    language: languages[Math.floor(Math.random() * languages.length)],
    platform: platforms[Math.floor(Math.random() * platforms.length)]
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

      // Rate limiting check
      const rateLimitInfo = getRateLimitInfo(clientIP);
      if (rateLimitInfo.count > 10) {
        return res.status(429).json({ 
          message: "Too many requests. Please wait a few minutes before trying again." 
        });
      }

      // Check if last request was too recent (less than 5 seconds ago)
      const timeSinceLastRequest = Date.now() - rateLimitInfo.lastRequest;
      if (timeSinceLastRequest < 5000) {
        return res.status(429).json({ 
          message: "Please wait a few seconds between downloads to avoid detection." 
        });
      }

      addRequest(clientIP);

      // Advanced anti-detection setup with session management
      const config = getAdvancedConfig();
      const agent = ytdl.createAgent();
      
      // Create session-specific headers that mimic real browser behavior
      const sessionId = `session_${clientIP}_${Date.now()}`;
      const requestOptions = {
        headers: {
          'User-Agent': config.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': config.language,
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
          'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': `"${config.platform}"`,
          'Connection': 'keep-alive'
        }
      };
      
      // Multiple retry attempts with different strategies
      let info;
      let videoDetails;
      let lastError;
      
      // Helper function to add human-like delays
      const randomDelay = (min = 2000, max = 5000) => 
        new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));
      
      // Simulate human browsing pattern
      const simulateHumanBehavior = async () => {
        // Add initial delay to simulate user thinking time
        await randomDelay(1000, 3000);
      };
      
      // Strategy 1: Advanced session-based approach
      try {
        console.log('Attempting download with advanced session management...');
        await simulateHumanBehavior();
        
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
        
        // Strategy 2: Basic agent only
        try {
          await randomDelay();
          info = await ytdl.getInfo(url, { agent });
          videoDetails = info.videoDetails;
          console.log('Successfully retrieved video info with basic agent');
        } catch (error2) {
          console.log('Basic agent failed, trying without agent...');
          lastError = error2;
          
          // Strategy 3: No agent, just basic request
          try {
            await randomDelay();
            info = await ytdl.getInfo(url);
            videoDetails = info.videoDetails;
            console.log('Successfully retrieved video info without agent');
          } catch (error3) {
            console.log('All strategies failed, trying with different user agent...');
            lastError = error3;
            
            // Strategy 4: Different user agent without agent
            try {
              await randomDelay();
              info = await ytdl.getInfo(url, {
                requestOptions: {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                  }
                }
              });
              videoDetails = info.videoDetails;
              console.log('Successfully retrieved video info with alternative user agent');
            } catch (error4) {
              lastError = error4;
              const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
              
              // Check if it's a bot detection error
              if (errorMessage.includes('Sign in to confirm') || errorMessage.includes('robot') || errorMessage.includes('captcha')) {
                console.log('Detected bot protection, trying yt-dlp as final fallback...');
                
                throw new Error('YouTube is currently blocking all automated access. Please try again in 15-30 minutes, or try a different video URL.');
              } else {
                throw new Error(`All download strategies failed. Last error: ${errorMessage}`);
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
      
      // Create agent and stream with enhanced anti-detection
      const agent = ytdl.createAgent();
      
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ];
      
      const requestOptions = {
        headers: {
          'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
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
      
      const audioStream = ytdl(url, { 
        quality: 'highestaudio',
        filter: 'audioonly',
        agent,
        requestOptions
      });
      
      audioStream.on('error', (error) => {
        console.error('Audio stream error:', error);
        if (!res.headersSent) {
          res.status(500).json({ message: "Audio streaming failed" });
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
      
      // Create agent and get video info with enhanced anti-detection
      const agent = ytdl.createAgent();
      
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ];
      
      const requestOptions = {
        headers: {
          'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://www.youtube.com/',
          'Origin': 'https://www.youtube.com'
        }
      };
      
      let info;
      try {
        info = await ytdl.getInfo(url, { agent, requestOptions });
      } catch (error) {
        // Fallback without agent if first attempt fails
        console.log('Retrying video info fetch without agent...');
        info = await ytdl.getInfo(url, { requestOptions });
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
          'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
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

  const httpServer = createServer(app);
  return httpServer;
}
