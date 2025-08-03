import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { History, RefreshCw, Trash2, Download, CheckCircle, AlertTriangle, Play } from "lucide-react";
import type { DownloadHistory } from "@shared/schema";
import VideoPreviewModal from "./video-preview-modal";

export default function DownloadHistory() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<DownloadHistory | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: history = [], isLoading } = useQuery<DownloadHistory[]>({
    queryKey: ["/api/downloads"],
  });

  const clearAllMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/downloads"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/downloads"] });
      toast({
        title: "History Cleared",
        description: "All download history has been cleared.",
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/downloads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/downloads"] });
      toast({
        title: "Item Removed",
        description: "Download item has been removed from history.",
      });
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["/api/downloads"] });
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to clear all download history?")) {
      clearAllMutation.mutate();
    }
  };

  const handlePreviewVideo = (item: DownloadHistory) => {
    setSelectedVideo(item);
    setIsPreviewOpen(true);
  };

  const handleDownloadAgain = async (item: DownloadHistory) => {
    const format = item.format.toLowerCase().includes('mp4') ? 'video' : 'audio';
    const quality = item.quality || (format === 'video' ? '720p' : 'mp3');
    
    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: item.url,
          format,
          quality
        })
      });
      
      const result = await response.json();
      
      if (result.downloadUrl) {
        const link = document.createElement('a');
        link.href = result.downloadUrl;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast({
          title: "Download Started",
          description: "Your file download has started again.",
        });
      }
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "An error occurred while downloading the file.",
        variant: "destructive",
      });
    }
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "Unknown";
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return d.toLocaleDateString();
  };

  return (
    <Card className="shadow-xl">
      <CardContent className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold text-gray-800 flex items-center space-x-3">
            <History className="h-6 w-6 text-blue-600" />
            <span>Download History</span>
          </h3>
          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center space-x-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
            <Button
              variant="outline"
              onClick={handleClearAll}
              disabled={clearAllMutation.isPending || history.length === 0}
              className="flex items-center space-x-2 text-red-600 hover:text-red-800"
            >
              <Trash2 className="h-4 w-4" />
              <span>Clear All</span>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-4 animate-pulse">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-10 bg-gray-200 rounded"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12">
            <History className="mx-auto h-16 w-16 text-gray-300 mb-4" />
            <h4 className="text-xl font-medium text-gray-500 mb-2">No Download History</h4>
            <p className="text-gray-400">Your downloaded videos and audio will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((item) => (
              <div
                key={item.id}
                className="bg-gray-50 rounded-lg p-4 flex items-center justify-between hover:shadow-md transition-shadow duration-200"
              >
                <div className="flex items-center space-x-4">
                  <img
                    src={item.thumbnail || 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=60&fit=crop'}
                    alt="Video thumbnail"
                    className="w-16 h-10 object-cover rounded"
                  />
                  <div>
                    <h4 className="font-medium text-gray-800">{item.title}</h4>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <span>{item.format}</span>
                      <span>{item.fileSize}</span>
                      <span>{formatDate(item.downloadedAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center ${
                    item.status === 'completed' 
                      ? 'bg-green-100 text-green-800' 
                      : item.status === 'failed'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {item.status === 'completed' ? (
                      <CheckCircle className="h-4 w-4 mr-1" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 mr-1" />
                    )}
                    {item.status === 'completed' ? 'Completed' : 'Failed'}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-blue-600 hover:text-blue-800"
                    onClick={() => handlePreviewVideo(item)}
                    title="Preview/Watch Video"
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-green-600 hover:text-green-800"
                    onClick={() => handleDownloadAgain(item)}
                    title="Download Again"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteItemMutation.mutate(item.id)}
                    disabled={deleteItemMutation.isPending}
                    className="text-red-600 hover:text-red-800"
                    title="Remove from History"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      
      {/* Video Preview Modal */}
      {selectedVideo && (
        <VideoPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => {
            setIsPreviewOpen(false);
            setSelectedVideo(null);
          }}
          videoData={{
            id: selectedVideo.id,
            title: selectedVideo.title,
            url: selectedVideo.url,
            format: selectedVideo.format,
            quality: selectedVideo.quality || '720p',
            thumbnail: selectedVideo.thumbnail,
            fileSize: selectedVideo.fileSize || 'Unknown'
          }}
        />
      )}
    </Card>
  );
}
