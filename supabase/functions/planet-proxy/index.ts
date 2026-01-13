import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const PLANET_API_KEY = Deno.env.get('PLANET_API_KEY') ?? '';
    const PLANET_CONFIG_ID = Deno.env.get('PLANET_CONFIG_ID') ?? '';

    if (!PLANET_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'PLANET_API_KEY not set' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (!PLANET_CONFIG_ID) {
      return new Response(
        JSON.stringify({ error: 'PLANET_CONFIG_ID not set' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const url = new URL(req.url);
    const search = url.search || '';

    // Sentinel Hub WMTS endpoint for this instance
    const target =
      `https://services.sentinel-hub.com/ogc/wmts/${PLANET_CONFIG_ID}${search}`;

    const upstreamRes = await fetch(target, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${PLANET_API_KEY}`,
        Accept: 'image/png,*/*',
      },
    });

    const contentType =
      upstreamRes.headers.get('content-type') ?? 'application/octet-stream';
    const body = await upstreamRes.arrayBuffer();

    const respHeaders: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': contentType,
    };

    return new Response(body, {
      status: upstreamRes.status,
      headers: respHeaders,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
