# Deploy FinTrack as a PWA

## First deployment with Vercel

1. Create a free account at [vercel.com](https://vercel.com) using your email.
2. Install the Vercel command-line tool on the Mac, then run `vercel` from this project folder.
3. Sign in when Vercel opens the browser and choose the default answers. Vercel will provide a public HTTPS link.
4. In Vercel, open the project settings and add these environment variables from your local `.env` file:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (required for collection agents and secure financier auth cookies)
5. Redeploy after saving the variables.

Financier refresh tokens are stored in HttpOnly cookies via `/api/auth/*` on Vercel. Local `vite` dev falls back to in-memory tokens when those routes are unavailable; use `vercel dev` to test cookie auth locally.

## Add FinTrack to a phone

1. Open the Vercel link in Chrome on Android or Safari on iPhone.
2. In the browser menu, choose **Add to Home screen**.
3. Open FinTrack from the new icon and sign in.

Never add a Supabase service-role key to Vercel or the frontend. Only the two public `VITE_` values above belong in the app.
