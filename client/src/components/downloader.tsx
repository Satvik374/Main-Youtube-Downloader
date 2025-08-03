import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ProgressTracker from "./progress-tracker";
import { Video, Music, Download } from "lucide-react";

interface DownloaderProps {
  onDownloadComplete: () => void;
}

export default function Downloader({ onDownloadComplete }: DownloaderProps) {
  const [url, setUrl] = useState("");
  const [activeTab, setActiveTab] = useState("video");
  const [selectedQuality, setSelectedQuality] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();

  const downloadMutation = useMutation({
    mutationFn: async (data: { url: string; format: string; quality?: string }) => {
      const response = await apiRequest("POST", "/api/download", data);
      return response.json();
    },
    onSuccess: async (result) => {
      // Add to history
      await apiRequest("POST", "/api/downloads", {
        title: result.title,
        url,
        format: activeTab === "video" ? `MP4 • ${selectedQuality}` : `${selectedFormat.toUpperCase()} • High Quality`,
        quality: activeTab === "video" ? selectedQuality : "High Quality",
        fileSize: result.fileSize,
        thumbnail: result.thumbnail,
        status: "completed",
      });
      
      // Trigger actual download
      if (result.downloadUrl) {
        const link = document.createElement('a');
        link.href = result.downloadUrl;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
      toast({
        title: "Download Started!",
        description: `${result.title} download has started. Check your downloads folder.`,
      });
      
      onDownloadComplete();
      setIsDownloading(false);
    },
    onError: (error: any) => {
      let title = "Download Failed";
      let description = error.message || "An error occurred during download.";
      
      // Handle different types of errors with specific guidance
      if (error.message?.includes('YouTube is temporarily blocking')) {
        title = "YouTube Blocking Downloads";
        description = "YouTube is temporarily blocking automated downloads. Please wait 15-30 minutes and try again, or try a different video.";
      } else if (error.message?.includes('YouTube detected too many requests')) {
        title = "Too Many Requests";
        description = "Please wait a few minutes before trying to download again.";
      } else if (error.message?.includes('YouTube requires verification')) {
        title = "Verification Required";
        description = "YouTube needs verification. Wait a few minutes and try a different video URL.";
      } else if (error.message?.includes('made too many download requests')) {
        title = "Rate Limited";
        description = "You've downloaded too many videos. Please wait before trying again.";
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
      setIsDownloading(false);
    },
  });

  const ffmpegDownloadMutation = useMutation({
    mutationFn: async (data: { url: string; format: string; quality?: string }) => {
      const response = await fetch('/api/download-ffmpeg', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'FFmpeg download failed');
      }
      
      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || 'download';
      
      // Create blob and trigger download
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      return { filename, title: filename.split('_')[0] };
    },
    onSuccess: async (result) => {
      // Add to history
      await apiRequest("POST", "/api/downloads", {
        title: result.title,
        url,
        format: activeTab === "video" ? `MP4 • ${selectedQuality} (FFmpeg)` : `${selectedFormat.toUpperCase()} • High Quality (FFmpeg)`,
        quality: activeTab === "video" ? selectedQuality : "High Quality",
        fileSize: "Unknown",
        thumbnail: "",
        status: "completed",
      });
      
      toast({
        title: "FFmpeg Download Complete!",
        description: `${result.filename} has been downloaded with enhanced quality.`,
      });
      
      onDownloadComplete();
      setIsDownloading(false);
    },
    onError: (error: any) => {
      toast({
        title: "FFmpeg Download Failed",
        description: error.message || "An error occurred during FFmpeg download.",
        variant: "destructive",
      });
      setIsDownloading(false);
    },
  });

  const isValidYouTubeUrl = (url: string) => {
    return url.includes('youtube.com') || url.includes('youtu.be');
  };

  const handleDownload = () => {
    if (!url.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a YouTube URL.",
        variant: "destructive",
      });
      return;
    }

    if (!isValidYouTubeUrl(url)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid YouTube URL.",
        variant: "destructive",
      });
      return;
    }

    if (activeTab === "video" && !selectedQuality) {
      toast({
        title: "Quality Required",
        description: "Please select a video quality.",
        variant: "destructive",
      });
      return;
    }

    if (activeTab === "audio" && !selectedFormat) {
      toast({
        title: "Format Required",
        description: "Please select an audio format.",
        variant: "destructive",
      });
      return;
    }

    setIsDownloading(true);
    downloadMutation.mutate({
      url,
      format: activeTab,
      quality: activeTab === "video" ? selectedQuality : selectedFormat,
    });
  };

  const handleFFmpegDownload = () => {
    if (!url.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a YouTube URL.",
        variant: "destructive",
      });
      return;
    }

    if (!isValidYouTubeUrl(url)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid YouTube URL.",
        variant: "destructive",
      });
      return;
    }

    if (activeTab === "video" && !selectedQuality) {
      toast({
        title: "Quality Required",
        description: "Please select a video quality.",
        variant: "destructive",
      });
      return;
    }

    if (activeTab === "audio" && !selectedFormat) {
      toast({
        title: "Format Required",
        description: "Please select an audio format.",
        variant: "destructive",
      });
      return;
    }

    setIsDownloading(true);
    ffmpegDownloadMutation.mutate({
      url,
      format: activeTab === "video" ? "mp4" : selectedFormat,
      quality: activeTab === "video" ? selectedQuality : selectedFormat,
    });
  };

  const qualityOptions = [
    { value: "4k", label: "4K UHD", description: "Ultra High" },
    { value: "1080p", label: "1080p HD", description: "High Quality" },
    { value: "720p", label: "720p HD", description: "Standard" },
    { value: "480p", label: "480p", description: "Medium" },
    { value: "360p", label: "360p", description: "Low" },
  ];

  const audioFormats = [
    { value: "mp3", label: "MP3", description: "320 kbps" },
    { value: "wav", label: "WAV", description: "Lossless" },
    { value: "flac", label: "FLAC", description: "HD Audio" },
  ];

  return (
    <Card className="mb-8 shadow-xl card-hover">
      <CardContent className="p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Download YouTube Videos & Audio</h2>
          <p className="text-gray-600">Paste your YouTube URL below and choose your preferred format</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="video" className="flex items-center space-x-2">
              <Video className="h-4 w-4" />
              <span>Video Download</span>
            </TabsTrigger>
            <TabsTrigger value="audio" className="flex items-center space-x-2">
              <Music className="h-4 w-4" />
              <span>Audio Download</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mb-6">
          <Label htmlFor="youtube-url" className="block text-sm font-medium text-gray-700 mb-2">
            YouTube Video URL
          </Label>
          <div className="relative">
            <Input
              id="youtube-url"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="input-focus text-lg py-4 pr-12"
              disabled={isDownloading}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-4">
              <i className="fab fa-youtube text-youtube text-2xl"></i>
            </div>
          </div>
          {url && (
            <div className="mt-2 text-sm">
              {isValidYouTubeUrl(url) ? (
                <span className="text-green-600 flex items-center">
                  <i className="fas fa-check-circle mr-1"></i>
                  Valid YouTube URL
                </span>
              ) : (
                <span className="text-yellow-600 flex items-center">
                  <i className="fas fa-exclamation-triangle mr-1"></i>
                  Please enter a valid YouTube URL
                </span>
              )}
            </div>
          )}
        </div>

        <Tabs value={activeTab}>
          <TabsContent value="video" className="mb-6">
            <Label className="block text-sm font-medium text-gray-700 mb-3">Video Quality</Label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {qualityOptions.map((option) => (
                <div
                  key={option.value}
                  className={`bg-gray-50 border-2 rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                    selectedQuality === option.value
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-blue-500 hover:bg-blue-50"
                  }`}
                  onClick={() => !isDownloading && setSelectedQuality(option.value)}
                >
                  <div className="text-center">
                    <div className="font-semibold text-gray-800">{option.label}</div>
                    <div className="text-sm text-gray-500">{option.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="audio" className="mb-6">
            <Label className="block text-sm font-medium text-gray-700 mb-3">Audio Format</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {audioFormats.map((format) => (
                <div
                  key={format.value}
                  className={`bg-gray-50 border-2 rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                    selectedFormat === format.value
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-blue-500 hover:bg-blue-50"
                  }`}
                  onClick={() => !isDownloading && setSelectedFormat(format.value)}
                >
                  <div className="text-center">
                    <div className="font-semibold text-gray-800">{format.label}</div>
                    <div className="text-sm text-gray-500">{format.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-3">
          <Button
            onClick={handleDownload}
            disabled={isDownloading || downloadMutation.isPending || ffmpegDownloadMutation.isPending}
            className="w-full download-gradient text-white font-bold py-4 px-8 text-lg hover:shadow-lg transition-all duration-300"
          >
            {isDownloading || downloadMutation.isPending || ffmpegDownloadMutation.isPending ? (
              <>
                <i className="fas fa-spinner animate-spin mr-2"></i>
                Processing...
              </>
            ) : (
              <>
                <Download className="h-5 w-5 mr-2" />
                Start Download
              </>
            )}
          </Button>
          
          <Button
            onClick={handleFFmpegDownload}
            disabled={isDownloading || downloadMutation.isPending || ffmpegDownloadMutation.isPending}
            variant="outline"
            className="w-full border-2 border-blue-500 text-blue-600 font-bold py-4 px-8 text-lg hover:bg-blue-50 transition-all duration-300"
          >
            {isDownloading || downloadMutation.isPending || ffmpegDownloadMutation.isPending ? (
              <>
                <i className="fas fa-spinner animate-spin mr-2"></i>
                Processing...
              </>
            ) : (
              <>
                <i className="fas fa-magic mr-2"></i>
                FFmpeg Enhanced Download
              </>
            )}
          </Button>
          <p className="text-center text-sm text-gray-500">
            FFmpeg download provides better quality and format conversion
          </p>
        </div>

        {isDownloading && (
          <ProgressTracker
            onCancel={() => {
              setIsDownloading(false);
              downloadMutation.reset();
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
