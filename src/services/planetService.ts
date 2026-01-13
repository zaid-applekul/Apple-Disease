/* Frontend-only Planet service helpers.
   Tries to call the deployed Supabase Edge Function `planet-insights` first.
   If that fails (network/401/500) OR returns no climate fields, falls back
   to a deterministic mock so the UI still works with just `npm run dev`.
*/

export type PlanetInsightsRequest = {
  configId?: string;
  lat: number;
  lon: number;
  startDate: string;
  endDate: string;
  layers?: string[];
};

export async function fetchPlanetInsights(
  req: PlanetInsightsRequest,
): Promise<any> {
  // 1) Try real Supabase Edge Function first
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/planet-insights`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Supabase Edge Functions need the anon key
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(req),
    });

    if (res.ok) {
      const data = await res.json();

      // If backend returns real climate fields, use them
      if (
        data &&
        (data.temperature !== undefined ||
          data.rainfall !== undefined ||
          data.relativeHumidity !== undefined)
      ) {
        return data;
      }

      // Otherwise fall through to mock
      console.warn(
        'planet-insights returned no climate fields, using mock instead',
        data,
      );
    } else {
      console.error(
        'planet-insights failed:',
        res.status,
        await res.text().catch(() => ''),
      );
    }
  } catch (e) {
    console.error('planet-insights request error:', e);
  }

  // 2) Fallback: derive simple approximate climate-like values from lat/lon + date
  const { lat, lon, startDate, endDate } = req;
  const s = new Date(startDate);
  const e = new Date(endDate);
  const days = Math.max(
    1,
    Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)),
  );

  // Deterministic pseudo-values so UI is consistent across reloads
  const seasonFactor = Math.cos(
    (s.getMonth() / 12) * Math.PI * 2 - (lat / 90) * Math.PI,
  );
  const baseTemp =
    15 + Math.cos((lat * Math.PI) / 180) * 10 + seasonFactor * 8;
  const temperature = Math.round(baseTemp * 10) / 10;

  const rainfall = Math.max(
    0,
    Math.round(
      (Math.abs(Math.sin((lon * Math.PI) / 180)) * 20 + days * 0.5) * 10,
    ) / 10,
  );
  const relativeHumidity = Math.round(
    Math.min(95, 40 + Math.abs(Math.sin((lat * Math.PI) / 90)) * 60),
  );
  const windSpeed =
    Math.round(
      (Math.abs(Math.cos((lon * Math.PI) / 90)) * 15 + 2) * 10,
    ) / 10;
  const soilMoisture = Math.round(
    Math.min(100, 10 + rainfall * 2 + relativeHumidity / 10),
  );
  const canopyHumidity = Math.round(Math.min(100, relativeHumidity - 5));
  const wetnessHours = Math.round(
    Math.min(168, rainfall * 2 + relativeHumidity / 4),
  );

  // Indicate that Planet.com / backend proxy wasn't available
  return {
    _source: 'mock',
    temperature,
    rainfall,
    relativeHumidity,
    windSpeed,
    soilMoisture,
    canopyHumidity,
    wetnessHours,
  };
}

// Not used when calling deployed WMTS via planet-proxy; keep stub.
export async function getPlanetTileTemplate(_opts: {
  configId?: string;
  layerId: string;
  date?: string;
}): Promise<{ tileTemplate?: string } | null> {
  return null;
}

export type AOISubmission = {
  aoi: {
    type: 'Feature';
    geometry: {
      type: 'Point' | 'LineString' | 'Polygon';
      coordinates: number[][] | number[][][];
    };
    properties: {
      drawingType: string;
      createdAt: string;
    };
  };
  configId?: string;
  lat: number;
  lon: number;
  startDate: string;
  endDate: string;
  layers: string[];
};

export async function submitAOI(req: AOISubmission): Promise<any> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/planet-aoi`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`AOI submission failed: ${res.status} ${errorText}`);
    }

    return await res.json();
  } catch (e) {
    console.error('❌ AOI submission error:', e);
    throw e;
  }
}
