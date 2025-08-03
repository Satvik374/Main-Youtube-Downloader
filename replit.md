# Overview

This is a YouTube Downloader Pro application built as a full-stack web application. The system allows users to download YouTube videos in various formats and qualities, with features including download history tracking, progress monitoring, and a modern responsive UI. The application is designed as a monorepo with separate client and server components, utilizing modern web technologies for both frontend and backend development. Note: AdSense banner advertisements have been removed from the UI as requested by the user.

# User Preferences

Preferred communication style: Simple, everyday language.

# Recent Changes

## 2025-08-03: Google AdSense Integration & FFmpeg Enhancement
- **AdSense Setup**: Added Google AdSense code to HTML head section
  - Publisher ID: ca-pub-9578468690172928
  - Script properly integrated with async loading and crossorigin attributes
  - Ready for ad monetization once AdSense approval is complete
- **FFmpeg Integration**: Added advanced download system using FFmpeg for superior quality
  - New `/api/download-ffmpeg` endpoint using yt-dlp with FFmpeg backend
  - Enhanced video/audio quality with intelligent format selection
  - Supports 4K, 1440p, 1080p, 720p, and 480p with automatic fallbacks
  - Frontend now features dual download options: standard and FFmpeg enhanced
  - Automatic cleanup of temporary files and proper error handling

## 2025-01-03: Database Integration & 4K Download Fix
- **Database Migration**: Successfully migrated from in-memory storage to PostgreSQL database
- **4K Download Enhancement**: Fixed 4K video download functionality with improved format selection
  - Enhanced format detection to prioritize video-only streams for higher quality
  - Added sophisticated fallback logic for 4K, 1440p, and 1080p formats  
  - Now correctly downloads true 4K (2160p) content when available
  - Optimized format selection for both download preparation and streaming endpoints

## 2025-01-03: Anti-Bot Detection & Video Preview Features
- **Advanced Anti-Detection System**: Implemented comprehensive bot detection bypass
  - Multi-strategy retry system with 5 different approaches including yt-dlp fallback
  - Advanced session management with realistic browser headers and user agents
  - Rate limiting and human-like delay patterns to avoid detection
  - Enhanced error handling with user-friendly messages for different block types
  - **Production Enhancement**: Added sophisticated anti-detection for Render deployment
    - Environment-aware rate limiting (stricter in production)
    - Enhanced user agent rotation and header diversification
    - Production-specific delays and exponential backoff patterns
    - Mobile user agent fallbacks for production environments
  - **Proxy Service Integration**: Implemented alternative download methods that bypass YouTube IP blocking
    - Integration with Invidious and Piped APIs for video metadata
    - Automatic proxy rotation using free proxy services
    - yt-dlp fallback with proxy support for enhanced reliability
    - Complete bypass of direct YouTube API calls to avoid server IP detection
- **Video Preview Modal**: Added in-browser video viewing capability
  - YouTube embed integration for watching videos directly in the app
  - Separate "Play" and "Download" buttons in download history
  - Modal with video details, controls, and re-download options

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/ui components built on top of Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming and dark mode support
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation resolvers

## Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for REST API endpoints
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Schema Management**: Drizzle Kit for database migrations and schema management
- **Development**: Hot reload with tsx and Vite integration in development mode

## Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Database Schema**: 
  - Download history table for tracking user downloads (ACTIVE - migrated from memory storage)
  - Users table for authentication (prepared but not fully implemented)
- **Schema Validation**: Zod schemas for runtime type checking and API validation
- **Database Provider**: Neon serverless PostgreSQL for cloud deployment
- **Storage**: DatabaseStorage implementation using PostgreSQL (migrated from MemStorage on 2025-01-03)

## Development Tools
- **Build System**: Vite for frontend bundling, esbuild for backend compilation
- **Type Checking**: Strict TypeScript configuration across client, server, and shared code
- **Code Organization**: Monorepo structure with shared schemas and types
- **Path Aliases**: Configured for clean imports (@/, @shared/, @assets/)

## API Design
- **Architecture**: RESTful API with consistent error handling
- **Endpoints**: CRUD operations for download history management
- **Validation**: Zod schema validation on API endpoints
- **Error Handling**: Centralized error middleware with proper HTTP status codes
- **Logging**: Request/response logging with performance metrics

## UI/UX Design
- **Design System**: Consistent component library with Radix UI accessibility
- **Responsive Design**: Mobile-first approach with Tailwind breakpoints
- **Theme Support**: Light/dark mode toggle with CSS custom properties
- **Toast Notifications**: User feedback for actions and errors
- **Progress Tracking**: Real-time download progress visualization

# External Dependencies

## Database & Cloud Services
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **WebSocket Support**: For real-time database connections via ws package

## UI Component Libraries
- **Radix UI**: Headless UI primitives for accessibility and keyboard navigation
- **Lucide React**: Icon library for consistent iconography
- **Embla Carousel**: Carousel/slider component for media display
- **React Day Picker**: Date selection components

## Development & Build Tools
- **Vite Plugins**: 
  - React plugin for JSX transformation
  - Runtime error overlay for development
  - Cartographer plugin for Replit integration
- **PostCSS**: CSS processing with Tailwind and Autoprefixer
- **Class Variance Authority**: Utility for component variant management

## Utility Libraries
- **Date-fns**: Date manipulation and formatting
- **Clsx & Tailwind Merge**: Dynamic className composition
- **Nanoid**: Unique ID generation
- **Connect-pg-simple**: PostgreSQL session store (prepared for authentication)

## Type Safety & Validation
- **Zod**: Runtime schema validation across client and server
- **Drizzle-Zod**: Integration between database schemas and validation
- **TypeScript**: Strict type checking with shared type definitions