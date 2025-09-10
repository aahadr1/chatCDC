# Authentication Setup Guide for ChatCDC

## Important: Supabase Configuration

### 1. Update Redirect URLs in Supabase Dashboard

Go to your Supabase project dashboard:
1. Navigate to **Authentication** → **URL Configuration**
2. Update the following settings:

**Site URL:**
- For local development: `http://localhost:3000`
- For production: `https://your-domain.com`

**Redirect URLs (add all of these):**
```
http://localhost:3000/auth/callback
http://localhost:3000
https://your-production-domain.com/auth/callback
https://your-production-domain.com
```

### 2. Email Templates

In Supabase Dashboard:
1. Go to **Authentication** → **Email Templates**
2. Update the **Confirm signup** template
3. Make sure the confirmation URL uses: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup`

### 3. Environment Variables

Make sure your `.env.local` file has:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## How the Authentication Flow Works

1. **User signs up** → Email sent with confirmation link
2. **User clicks confirmation link** → Redirected to `/auth/callback`
3. **Auth callback route** → Exchanges code for session
4. **Automatic redirect** → User sent to home page
5. **Login page** → Automatically redirects if already authenticated

## Testing the Flow

1. Sign up with a new email
2. Check your email for the confirmation link
3. Click the link - you should be redirected to the app
4. You should see your email in the sidebar
5. Try refreshing - you should stay logged in

## Troubleshooting

### User stays on login page after confirmation:
- Check Supabase redirect URLs configuration
- Ensure `/auth/callback` route is working
- Check browser console for errors

### "Invalid authentication" errors:
- Clear browser cookies
- Check environment variables
- Verify Supabase project is active

### Email not received:
- Check spam folder
- Verify email settings in Supabase
- Check Supabase email logs
