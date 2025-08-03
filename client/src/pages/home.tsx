import { useState } from "react";
import Downloader from "@/components/downloader";
import DownloadHistory from "@/components/download-history";

export default function Home() {
  const [refreshHistory, setRefreshHistory] = useState(0);

  const handleDownloadComplete = () => {
    setRefreshHistory(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="gradient-bg text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-4">
              <div className="bg-youtube rounded-lg p-3">
                <i className="fab fa-youtube text-3xl text-white"></i>
              </div>
              <div>
                <h1 className="text-3xl font-bold">YouTube Downloader Pro</h1>
                <p className="text-blue-100">Fast, reliable, and free video downloads</p>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-4">
              <div className="bg-white bg-opacity-20 rounded-lg px-4 py-2">
                <span className="text-sm">Total Downloads Today</span>
                <div className="text-2xl font-bold">12,847</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Downloader onDownloadComplete={handleDownloadComplete} />
          <DownloadHistory key={refreshHistory} />
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 text-white mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h5 className="font-bold text-lg mb-4">YouTube Downloader Pro</h5>
              <p className="text-gray-300">The fastest and most reliable YouTube video and audio downloader. Download in HD quality with no limits.</p>
            </div>
            <div>
              <h5 className="font-bold text-lg mb-4">Features</h5>
              <ul className="space-y-2 text-gray-300">
                <li>• HD Video Downloads</li>
                <li>• Audio Extraction</li>
                <li>• Download History</li>
                <li>• Multiple Formats</li>
              </ul>
            </div>
            <div>
              <h5 className="font-bold text-lg mb-4">Legal</h5>
              <ul className="space-y-2 text-gray-300">
                <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white">DMCA</a></li>
                <li><a href="#" className="hover:text-white">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 YouTube Downloader Pro. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
