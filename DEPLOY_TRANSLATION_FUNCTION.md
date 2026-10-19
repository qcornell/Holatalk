# Deploy Translation Function to Supabase

## 1. Install Supabase CLI (if not already installed)

```bash
npm install -g supabase
```

## 2. Login to Supabase

```bash
supabase login
```

## 3. Link to Your Project

```bash
cd /home/node/clawd/apps/DappilyDirector
supabase link --project-ref YOUR_PROJECT_REF
```

Find your project ref in Supabase dashboard URL: `https://supabase.com/dashboard/project/YOUR_PROJECT_REF`

## 4. Set OpenAI API Key Secret

```bash
supabase secrets set OPENAI_API_KEY=your-openai-api-key-here
```

## 5. Deploy the Function

```bash
supabase functions deploy translate
```

## 6. Get Your Function URL

After deployment, you'll get a URL like:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/translate
```

## 7. Update Your App Code

In `src/translate/index.ts`, replace the OpenAI API call:

```typescript
// OLD CODE (remove this):
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
  },
  body: JSON.stringify({...})
})

// NEW CODE (add this):
const SUPABASE_FUNCTION_URL = 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/translate'

const response = await fetch(SUPABASE_FUNCTION_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: originalText,
    fromLang: fromLanguage, // 'en' or 'es'
    toLang: toLanguage,     // 'es' or 'en'
  })
})

const { translation } = await response.json()
```

## 8. Test Locally (Optional)

```bash
# Start local Supabase
supabase start

# Deploy function locally
supabase functions serve translate

# Test with curl
curl -X POST http://localhost:54321/functions/v1/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","fromLang":"en","toLang":"es"}'
```

## 9. Remove OpenAI Key from App

After deployment works, remove any hardcoded OpenAI API keys from your React Native app code and `.env` files.

## Benefits

✅ Users don't need their own API key  
✅ You control costs and usage  
✅ Can add rate limiting later  
✅ Can track translation metrics  
✅ Secure - API key never exposed to client  

## Cost Estimate

- GPT-4o-mini: ~$0.001 per translation (~50 tokens)
- 1000 translations = ~$1
- Supabase Edge Functions: Free tier includes 500K function invocations/month
