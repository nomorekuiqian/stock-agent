# Deployment Guide

## Architecture Overview

```
                    GitHub Actions (Daily Cron)
                            │
                            ▼ POST /api/report/send
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Vercel      │───▶│     Railway     │───▶│     Resend      │
│   (Frontend)    │    │    (Backend)    │    │    (Email)      │
│   Next.js 16    │    │    FastAPI      │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Step 1: Setup Resend

1. Go to [resend.com](https://resend.com) and create an account
2. Get your API key from the dashboard
3. (Optional) Add and verify your domain for custom sender email

## Step 2: Deploy Backend to Railway

1. Go to [railway.app](https://railway.app) and create an account
2. Create a new project → Deploy from GitHub repo
3. Select your repo (Railway will auto-detect `railway.toml` config)
4. Add environment variables:

   ```
   GOOGLE_API_KEY=your_google_api_key
   FMP_API_KEY=your_fmp_api_key
   RESEND_API_KEY=re_xxxxxxxxxxxx
   EMAIL_FROM=Market Report <reports@yourdomain.com>
   EMAIL_TO=your-email@example.com
   CRON_SECRET=generate_a_random_secret_here
   FRONTEND_URL=https://your-frontend.vercel.app
   ```

5. Railway will auto-detect Dockerfile and deploy
6. Note your Railway URL (e.g., `https://stock-agent-backend.railway.app`)

## Step 3: Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) and import your GitHub repo
2. Set root directory to `frontend`
3. Add environment variable:

   ```
   NEXT_PUBLIC_API_URL=https://your-backend.railway.app/api
   ```

4. Deploy

## Step 4: Configure GitHub Actions

1. Go to your GitHub repo → Settings → Secrets and variables → Actions
2. Add these secrets:

   | Secret Name   | Value                                      |
   |--------------|---------------------------------------------|
   | BACKEND_URL  | `https://your-backend.railway.app`         |
   | CRON_SECRET  | Same value as in Railway env vars          |

3. The cron job runs Monday-Friday at 6 AM UTC (adjust in `.github/workflows/daily-report.yml`)

## Step 5: Test Everything

### Test Backend API
```bash
curl https://your-backend.railway.app/
# Should return: {"message": "Macro Analysis API is running"}
```

### Test Email Sending (Manual)
```bash
curl -X POST \
  -H "X-Cron-Secret: your_cron_secret" \
  https://your-backend.railway.app/api/report/send
```

### Test GitHub Actions
1. Go to Actions tab in your GitHub repo
2. Select "Daily Market Report" workflow
3. Click "Run workflow" to trigger manually

## Environment Variables Reference

### Backend (Railway)

| Variable        | Required | Description                              |
|----------------|----------|------------------------------------------|
| GOOGLE_API_KEY | Yes      | Google AI API key for Gemini models      |
| FMP_API_KEY    | No       | Financial Modeling Prep API for yields   |
| RESEND_API_KEY | Yes      | Resend API key for email delivery        |
| EMAIL_FROM     | Yes      | Sender email (e.g., `reports@domain.com`)|
| EMAIL_TO       | Yes      | Your email address to receive reports    |
| CRON_SECRET    | Yes      | Secret to protect the email endpoint     |
| FRONTEND_URL   | No       | Frontend URL for CORS (Vercel URL)       |

### Frontend (Vercel)

| Variable              | Required | Description                        |
|----------------------|----------|------------------------------------|
| NEXT_PUBLIC_API_URL  | Yes      | Backend API URL from Railway       |

### GitHub Actions

| Secret        | Required | Description                            |
|--------------|----------|----------------------------------------|
| BACKEND_URL  | Yes      | Railway backend URL (without /api)     |
| CRON_SECRET  | Yes      | Same as backend CRON_SECRET           |

## Cron Schedule

Default: `0 6 * * 1-5` (6 AM UTC, Monday-Friday)

To change the schedule, edit `.github/workflows/daily-report.yml`:

```yaml
schedule:
  - cron: '0 14 * * 1-5'  # 2 PM UTC = 10 PM China
```

## Troubleshooting

### Email not sending
1. Check Resend dashboard for failed emails
2. Verify EMAIL_TO is correct
3. Check Railway logs for errors

### CORS errors
1. Add FRONTEND_URL to Railway environment variables
2. Redeploy backend

### GitHub Actions failing
1. Check Actions logs for curl response
2. Verify BACKEND_URL and CRON_SECRET secrets
3. Ensure backend is running and accessible
