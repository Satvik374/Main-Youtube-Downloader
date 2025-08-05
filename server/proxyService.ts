import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import fetch from 'node-fetch';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const execAsync = promisify(exec);

// Free proxy endpoints that can be used to fetch YouTube content
const FREE_PROXY_APIS = [
  'https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
  'https://www.proxy-list.download/api/v1/get?type=http',
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt'
];

// Alternative YouTube APIs and services
const YOUTUBE_SERVICES = [
  {
    name: 'invidious',
    endpoints: [
      'https://invidious.io.lol',
      'https://invidious.privacydev.net',
      'https://invidious.drgns.space',
      'https://inv.riverside.rocks'
    ]
  },
  {
    name: 'piped',
    endpoints: [
      'https://pipedapi.kavin.rocks',
      'https://api.piped.video',
      'https://pipedapi.adminforge.de'
    ]
  }
];

interface ProxyInfo {
  ip: string;
  port: string;
  protocol: 'http' | 'https' | 'socks5';
}

interface VideoInfo {
  title: string;
  duration: string;
  thumbnail: string;
  formats: Array<{
    url: string;
    quality: string;
    format: string;
    filesize?: number;
  }>;
}

class ProxyService {
  private workingProxies: ProxyInfo[] = [];
  private lastProxyRefresh: number = 0;
  private readonly PROXY_REFRESH_INTERVAL = 3600000; // 1 hour

  /**
   * Get working proxies from free sources
   */
  async getWorkingProxies(): Promise<ProxyInfo[]> {
    const now = Date.now();
    
    // Refresh proxies if needed
    if (now - this.lastProxyRefresh > this.PROXY_REFRESH_INTERVAL || this.workingProxies.length === 0) {
      await this.refreshProxyList();
    }
    
    return this.workingProxies.slice(0, 10); // Return top 10 working proxies
  }

  /**
   * Refresh the list of working proxies
   */
  private async refreshProxyList(): Promise<void> {
    console.log('Refreshing proxy list...');
    const allProxies: ProxyInfo[] = [];

    for (const apiUrl of FREE_PROXY_APIS) {
      try {
        const response = await fetch(apiUrl);
        const proxyList = await response.text();
        
        const proxies = this.parseProxyList(proxyList);
        allProxies.push(...proxies);
      } catch (error) {
        console.log(`Failed to fetch proxies from ${apiUrl}:`, error);
      }
    }

    // Test proxies and keep only working ones
    this.workingProxies = await this.testProxies(allProxies.slice(0, 50)); // Test first 50
    this.lastProxyRefresh = Date.now();
    
    console.log(`Found ${this.workingProxies.length} working proxies`);
  }

  /**
   * Parse proxy list from text format
   */
  private parseProxyList(proxyText: string): ProxyInfo[] {
    const proxies: ProxyInfo[] = [];
    const lines = proxyText.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && trimmed.includes(':')) {
        const [ip, port] = trimmed.split(':');
        if (ip && port && this.isValidIP(ip)) {
          proxies.push({
            ip: ip.trim(),
            port: port.trim(),
            protocol: 'http'
          });
        }
      }
    }

    return proxies;
  }

  /**
   * Test if proxies are working
   */
  private async testProxies(proxies: ProxyInfo[]): Promise<ProxyInfo[]> {
    const working: ProxyInfo[] = [];
    const testUrl = 'http://httpbin.org/ip';

    for (const proxy of proxies.slice(0, 20)) { // Test only first 20 for speed
      try {
        const proxyUrl = `${proxy.protocol}://${proxy.ip}:${proxy.port}`;
        const response = await axios.get(testUrl, {
          proxy: false,
          httpsAgent: new HttpsProxyAgent(proxyUrl),
          timeout: 5000
        });

        if (response.status === 200) {
          working.push(proxy);
        }
      } catch (error) {
        // Proxy not working, skip
      }
    }

    return working;
  }

  /**
   * Validate IP address format
   */
  private isValidIP(ip: string): boolean {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  }

  /**
   * Download video using yt-dlp through proxy
   */
  async downloadWithYtDlp(videoUrl: string, options: {
    format?: string;
    quality?: string;
    proxy?: ProxyInfo;
  } = {}): Promise<VideoInfo> {
    const { format = 'best', quality = 'best', proxy } = options;
    
    let ytDlpCmd = `python -m yt_dlp --dump-json --no-download`;
    
    if (proxy) {
      ytDlpCmd += ` --proxy "http://${proxy.ip}:${proxy.port}"`;
    }
    
    // Add rate limiting to avoid detection
    ytDlpCmd += ` --sleep-interval 2 --max-sleep-interval 5`;
    ytDlpCmd += ` --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"`;
    ytDlpCmd += ` "${videoUrl}"`;

    try {
      const { stdout } = await execAsync(ytDlpCmd, { timeout: 30000 });
      const videoData = JSON.parse(stdout);
      
      return {
        title: videoData.title,
        duration: videoData.duration_string || 'Unknown',
        thumbnail: videoData.thumbnail,
        formats: videoData.formats?.map((f: any) => ({
          url: f.url,
          quality: f.quality || f.height ? `${f.height}p` : 'Unknown',
          format: f.ext,
          filesize: f.filesize
        })) || []
      };
    } catch (error) {
      throw new Error(`yt-dlp failed: ${error}`);
    }
  }

  /**
   * Try alternative YouTube services (Invidious, Piped)
   */
  async tryAlternativeServices(videoUrl: string): Promise<VideoInfo | null> {
    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) return null;

    for (const service of YOUTUBE_SERVICES) {
      for (const endpoint of service.endpoints) {
        try {
          if (service.name === 'invidious') {
            const response = await fetch(`${endpoint}/api/v1/videos/${videoId}`, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              return this.parseInvidiousResponse(data);
            }
          } else if (service.name === 'piped') {
            const response = await fetch(`${endpoint}/streams/${videoId}`, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              return this.parsePipedResponse(data);
            }
          }
        } catch (error) {
          console.log(`Failed to fetch from ${endpoint}:`, error);
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Extract video ID from YouTube URL
   */
  private extractVideoId(url: string): string | null {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Parse Invidious API response
   */
  private parseInvidiousResponse(data: any): VideoInfo {
    return {
      title: data.title,
      duration: data.lengthSeconds ? `${Math.floor(data.lengthSeconds / 60)}:${(data.lengthSeconds % 60).toString().padStart(2, '0')}` : 'Unknown',
      thumbnail: data.videoThumbnails?.[0]?.url || '',
      formats: data.formatStreams?.map((f: any) => ({
        url: f.url,
        quality: f.quality || f.qualityLabel || 'Unknown',
        format: f.container,
        filesize: f.size
      })) || []
    };
  }

  /**
   * Parse Piped API response
   */
  private parsePipedResponse(data: any): VideoInfo {
    return {
      title: data.title,
      duration: data.duration ? `${Math.floor(data.duration / 60)}:${(data.duration % 60).toString().padStart(2, '0')}` : 'Unknown',
      thumbnail: data.thumbnail || '',
      formats: [
        ...(data.videoStreams?.map((f: any) => ({
          url: f.url,
          quality: f.quality,
          format: f.format || 'mp4',
          filesize: f.contentLength
        })) || []),
        ...(data.audioStreams?.map((f: any) => ({
          url: f.url,
          quality: 'audio',
          format: f.format || 'mp3',
          filesize: f.contentLength
        })) || [])
      ]
    };
  }

  /**
   * Get video info using multiple fallback methods
   */
  async getVideoInfo(videoUrl: string): Promise<VideoInfo> {
    // Method 1: Try alternative services first (faster and more reliable)
    console.log('Trying alternative YouTube services...');
    try {
      const altResult = await this.tryAlternativeServices(videoUrl);
      if (altResult && altResult.formats.length > 0) {
        console.log('Successfully retrieved video info from alternative service');
        return altResult;
      }
    } catch (error) {
      console.log('Alternative services failed:', error);
    }

    // Method 2: Try yt-dlp without proxy
    console.log('Trying yt-dlp without proxy...');
    try {
      const result = await this.downloadWithYtDlp(videoUrl);
      if (result.formats.length > 0) {
        console.log('Successfully retrieved video info with yt-dlp (no proxy)');
        return result;
      }
    } catch (error) {
      console.log('yt-dlp without proxy failed:', error);
    }

    // Method 3: Try yt-dlp with proxy
    console.log('Trying yt-dlp with proxy...');
    const workingProxies = await this.getWorkingProxies();
    
    for (const proxy of workingProxies.slice(0, 3)) { // Try first 3 working proxies
      try {
        console.log(`Trying proxy ${proxy.ip}:${proxy.port}...`);
        const result = await this.downloadWithYtDlp(videoUrl, { proxy });
        if (result.formats.length > 0) {
          console.log(`Successfully retrieved video info with proxy ${proxy.ip}:${proxy.port}`);
          return result;
        }
      } catch (error) {
        console.log(`Proxy ${proxy.ip}:${proxy.port} failed:`, error);
        continue;
      }
    }

    throw new Error('All download methods failed. The video may be private, geo-blocked, or temporarily unavailable.');
  }
}

export const proxyService = new ProxyService();