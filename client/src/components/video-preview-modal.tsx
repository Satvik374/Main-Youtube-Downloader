import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface VideoPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoData: {
    id: string;
    title: string;
    url: string;
    format: string;
    quality: string;
    thumbnail: string | null;
    fileSize: string;
  };
}

export default function VideoPreviewModal({ isOpen, onClose, videoData }: VideoPreviewModalProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();

  // Extract video ID from URL for YouTube embed
  const getYouTubeId = (url: string) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([^&\n?#]+)/);
    return match ? match[1] : null;
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    
    try {
      const format = videoData.format.toLowerCase().includes('mp4') ? 'video' : 'audio';
      const quality = videoData.quality || (format === 'video' ? '720p' : 'mp3');
      
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: videoData.url,
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
          description: "Your file download has started. Check your downloads folder.",
        });
      }
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "An error occurred while downloading the file.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleOpenInYouTube = () => {
    window.open(videoData.url, '_blank');
  };

  const youtubeId = getYouTubeId(videoData.url);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full h-[80vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-bold pr-8">{videoData.title}</DialogTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>
        
        <div className="flex-1 flex flex-col space-y-4">
          {/* Video Player */}
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            {youtubeId ? (
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${youtubeId}`}
                title={videoData.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white">
                <div className="text-center">
                  <p className="text-lg mb-4">Preview not available</p>
                  <img 
                    src={videoData.thumbnail || 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=225&fit=crop'}
                    alt="Video thumbnail"
                    className="max-w-sm rounded-lg mx-auto"
                  />
                </div>
              </div>
            )}
          </div>
          
          {/* Video Information */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-600">Format:</span>
                <p className="text-gray-800">{videoData.format}</p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Quality:</span>
                <p className="text-gray-800">{videoData.quality}</p>
              </div>
              <div>
                <span className="font-medium text-gray-600">File Size:</span>
                <p className="text-gray-800">{videoData.fileSize}</p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Source:</span>
                <p className="text-gray-800">YouTube</p>
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex justify-center space-x-4 pt-4">
            <Button
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex items-center space-x-2 bg-green-600 hover:bg-green-700"
            >
              <Download className="h-4 w-4" />
              <span>{isDownloading ? 'Downloading...' : 'Download Again'}</span>
            </Button>
            
            <Button
              variant="outline"
              onClick={handleOpenInYouTube}
              className="flex items-center space-x-2"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Open in YouTube</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}