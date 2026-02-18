---
description: How to deploy the backend and frontend
---

### 1. Backend Setup (Supabase)
1. Go to [Supabase Dashboard](https://app.supabase.com/) and create a new project.
2. In the **SQL Editor**, create a new query and paste the contents of `supabase_setup.sql`. Run it to create the tables and policies.
3. Go to **Storage**, create a new bucket named `receipts`. 
4. Click on the three dots next to the bucket name and select **Make public**.
5. Go to **Project Settings > API** and copy your `Project URL` and `anon public` key.

### 2. Local Environment
Update your `.env` file with the keys:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Frontend Deployment (Vercel)
Vercel is the easiest for Vite apps.
1. Push your code to a GitHub repository.
2. Go to [Vercel](https://vercel.com/) and import the repository.
3. In the **Environment Variables** section during setup, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**.

### 4. Alternative: Firebase Hosting
If you prefer Firebase Hosting (since you have the `.firebase` folder):
1. Run `npm run build`.
2. Run `npx firebase init hosting` (select the `dist` folder).
3. Run `npx firebase deploy --only hosting`.
