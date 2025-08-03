# Environment Variables Setup for Render

## Required Environment Variables

### 1. Core Application Variables

```bash
NODE_ENV=production
PORT=10000
```

### 2. Database Configuration

```bash
DATABASE_URL=postgresql://username:password@host:port/database_name
```

**Note**: When you create a PostgreSQL service on Render, it automatically provides the DATABASE_URL. Copy this from your Render PostgreSQL dashboard.

### 3. Auto-Generated Database Variables (Optional)

These are automatically extracted from DATABASE_URL by the application:

```bash
PGHOST=your_postgres_host
PGPORT=5432
PGDATABASE=your_database_name
PGUSER=your_postgres_user
PGPASSWORD=your_postgres_password
```

## Step-by-Step Render Setup

### Step 1: Create PostgreSQL Database
1. Go to Render Dashboard
2. Click "New" → "PostgreSQL"
3. Choose a name (e.g., "youtube-downloader-db")
4. Select region closest to your users
5. Click "Create Database"
6. **Copy the DATABASE_URL** from the database info page

### Step 2: Create Web Service
1. Click "New" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name**: youtube-downloader-pro
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

### Step 3: Set Environment Variables
In your Web Service settings, add these environment variables:

| Key | Value | Required |
|-----|-------|----------|
| `NODE_ENV` | `production` | ✅ Yes |
| `DATABASE_URL` | (paste from PostgreSQL service) | ✅ Yes |
| `PORT` | `10000` | ⚠️ Optional (auto-set by Render) |

### Step 4: Deploy
1. Click "Create Web Service"
2. Render will automatically build and deploy
3. Your app will be available at: `https://your-service-name.onrender.com`

## Verification Checklist

After deployment, verify these work:

- ✅ App loads at your Render URL
- ✅ ads.txt accessible: `https://your-app.onrender.com/ads.txt`
- ✅ Database connection working (download history saves)
- ✅ YouTube downloads functional
- ✅ No console errors in browser

## Environment Variables Summary

**Minimum Required for Render:**
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:port/db
```

**That's it!** Your YouTube Downloader Pro with Google AdSense integration is ready for production on Render.

## Troubleshooting

If deployment fails:
1. Check build logs in Render dashboard
2. Verify DATABASE_URL is correct
3. Ensure all dependencies are in package.json
4. Check that your GitHub repo is up to date

Your app is configured to handle everything else automatically!