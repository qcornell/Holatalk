import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// Language labels for minimal prompt
const LANG: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  es_to_en: 'Spanish→English',
  en_to_es: 'English→Spanish',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const body = await req.json()

    // Support both formats: { text, direction } or { text, fromLang, toLang }
    const text = body.text
    let fromLang = body.fromLang
    let toLang = body.toLang

    if (body.direction) {
      fromLang = body.direction === 'es_to_en' ? 'es' : 'en'
      toLang = body.direction === 'es_to_en' ? 'en' : 'es'
    }

    // Warmup ping — keep function hot, no OpenAI call
    if (text === 'warmup') {
      return new Response(
        JSON.stringify({ translated: 'ok', warm: true }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
      )
    }

    if (!text || !fromLang || !toLang) {
      return new Response(
        JSON.stringify({ error: 'Missing: text, fromLang/toLang or direction' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      )
    }

    // Minimal single-message prompt — fewer tokens = lower latency
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: `${LANG[fromLang] || fromLang}→${LANG[toLang] || toLang}: ${text}`,
          },
        ],
        max_tokens: 256,
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('OpenAI API error:', error)
      return new Response(
        JSON.stringify({ error: 'Translation failed', details: error }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
      )
    }

    const data = await response.json()
    const translation = data.choices[0]?.message?.content?.trim() || ''

    return new Response(
      JSON.stringify({
        translated: translation,    // matches app's expected field
        translation,                // backward compat
        usage: data.usage,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    )
  }
})
