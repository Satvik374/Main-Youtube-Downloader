# Deployment Guide for Render

## Build and Run Commands for Render

### Build Command
```bash
npm install && npm run build
```

### Start Command
```bash
npm start
```

## Package.json Scripts Required

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "build": "tsc && vite build",
    "start": "node dist/server/index.js",
    "dev": "NODE_ENV=development tsx server/index.ts"
  }
}
```

## Environment Variables for Render

Set these in your Render dashboard:

```
NODE_ENV=production
DATABASE_URL=your_postgresql_connection_string
PORT=10000
```

## Render Service Configuration

### Web Service Settings:
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Node Version**: 18 or higher
- **Environment**: Node

### Database:
- Create a PostgreSQL database on Render
- Copy the connection string to DATABASE_URL environment variable

## File Structure After Build
```
dist/
├── server/
│   └── index.js
├── client/
│   └── (static files)
└── public/
    └── ads.txt
```

## Deployment Steps

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Deploy to Render"
   git push origin main
   ```

2. **Create Render Web Service**:
   - Connect your GitHub repository
   - Set build command: `npm install && npm run build`
   - Set start command: `npm start`
   - Add environment variables

3. **Create PostgreSQL Database**:
   - Create a new PostgreSQL service on Render
   - Copy the DATABASE_URL to your web service

4. **Verify ads.txt**:
   - After deployment, check: `https://yourapp.onrender.com/ads.txt`
   - Should return your Google AdSense Publisher ID

## Important Notes

- Render automatically installs dependencies during build
- The app serves both frontend and backend on the same port
- ads.txt file will be properly accessible in production
- Database migrations run automatically on startup

Your YouTube Downloader Pro is ready for Render deployment!