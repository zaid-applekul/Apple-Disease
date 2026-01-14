type AOIRequest = {
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

type ClimateData = {
  temperature?: number;
  rainfall?: number;
  relativeHumidity?: number;
  windSpeed?: number;
  soilMoisture?: number;
  canopyHumidity?: number;
  wetnessHours?: number;
};

type RiskAnalysis = {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  factors: {
    temperature: { value: number | undefined; risk: string };
    humidity: { value: number | undefined; risk: string };
    wetness: { value: number | undefined; risk: string };
    soilMoisture: { value: number | undefined; risk: string };
    rainfall: { value: number | undefined; risk: string };
  };
  recommendations: string[];
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Extract center point from AOI geometry
const getAOICenter = (
  geometry: AOIRequest['aoi']['geometry']
): [number, number] => {
  const coords = geometry.coordinates;

  if (geometry.type === 'Point') {
    return coords as [number, number];
  }

  // For LineString or Polygon, calculate center
  let sumLat = 0,
    sumLon = 0,
    count = 0;

  const flatCoords = geometry.type === 'Polygon' ? (coords as number[][][])[0] : coords as number[][];

  flatCoords.forEach((coord) => {
    sumLon += coord[0];
    sumLat += coord[1];
    count++;
  });

  return [sumLon / count, sumLat / count];
};

// Fetch climate data using same method as planet-insights
const fetchClimateData = async (
  lat: number,
  lon: number,
  startDate: string,
  endDate: string
): Promise<ClimateData> => {
  try {
    console.log('🌤️ Fetching climate data for AOI:', { lat, lon, startDate, endDate });
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      start_date: startDate,
      end_date: endDate,
      daily: [
        'temperature_2m_mean',
        'precipitation_sum',
        'relative_humidity_2m_mean',
        'windspeed_10m_max',
      ].join(','),
      timezone: 'auto',
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Open-Meteo API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const daily = data.daily;

    if (!daily || !daily.time || daily.time.length === 0) {
      return {};
    }

    // Helper function to calculate average
    const avg = (arr: number[] | undefined): number | undefined => {
      if (!arr || arr.length === 0) return undefined;
      const s = arr.reduce((a, b) => a + b, 0);
      return s / arr.length;
    };

    const temperature = avg(daily.temperature_2m_mean);
    const rainfall = avg(daily.precipitation_sum); // mm/day
    const relativeHumidity = avg(daily.relative_humidity_2m_mean);
    const windSpeed = avg(daily.windspeed_10m_max);

    // Same derived calculations as planet-insights
    const soilMoisture =
      rainfall !== undefined && relativeHumidity !== undefined
        ? Math.min(100, Math.round(10 + rainfall * 4 + relativeHumidity / 5))
        : undefined;

    const canopyHumidity =
      relativeHumidity !== undefined
        ? Math.min(100, Math.round(relativeHumidity - 3))
        : undefined;

    const wetnessHours =
      rainfall !== undefined && relativeHumidity !== undefined
        ? Math.round(Math.min(168, rainfall * 3 + relativeHumidity / 3))
        : undefined;

    const result = {
      temperature:
        temperature !== undefined
          ? Math.round(temperature * 10) / 10
          : undefined,
      rainfall:
        rainfall !== undefined ? Math.round(rainfall * 10) / 10 : undefined,
      relativeHumidity:
        relativeHumidity !== undefined
          ? Math.round(relativeHumidity)
          : undefined,
      windSpeed:
        windSpeed !== undefined ? Math.round(windSpeed * 10) / 10 : undefined,
      soilMoisture,
      canopyHumidity,
      wetnessHours,
    };
    
    console.log('✅ Climate data fetched:', result);
    return {
      temperature:
        temperature !== undefined
          ? Math.round(temperature * 10) / 10
          : undefined,
      rainfall:
        rainfall !== undefined ? Math.round(rainfall * 10) / 10 : undefined,
      relativeHumidity:
        relativeHumidity !== undefined
          ? Math.round(relativeHumidity)
          : undefined,
      windSpeed:
        windSpeed !== undefined ? Math.round(windSpeed * 10) / 10 : undefined,
      soilMoisture,
      canopyHumidity,
      wetnessHours,
    };
  } catch (error) {
    console.error('Error fetching climate data:', error);
    return {};
  }
};

// Analyze risk based on climate data (Apple disease prediction)
const analyzeRisk = (climate: ClimateData): RiskAnalysis => {
  let riskScore = 0;
  const factors: RiskAnalysis['factors'] = {
    temperature: { value: climate.temperature, risk: 'low' },
    humidity: { value: climate.relativeHumidity, risk: 'low' },
    wetness: { value: climate.wetnessHours, risk: 'low' },
    soilMoisture: { value: climate.soilMoisture, risk: 'low' },
    rainfall: { value: climate.rainfall, risk: 'low' },
  };

  const temp = climate.temperature;
  const humidity = climate.relativeHumidity;
  const wetness = climate.wetnessHours;
  const moisture = climate.soilMoisture;
  const rain = climate.rainfall;

  // Temperature risk (optimal for apple disease: 15-25°C)
  if (temp !== undefined) {
    if (temp >= 15 && temp <= 25) {
      riskScore += 25;
      factors.temperature.risk = 'high';
    } else if (temp >= 12 && temp <= 28) {
      riskScore += 15;
      factors.temperature.risk = 'medium';
    }
  }

  // Humidity risk (optimal: 70%+)
  if (humidity !== undefined) {
    if (humidity >= 85) {
      riskScore += 25;
      factors.humidity.risk = 'high';
    } else if (humidity >= 70) {
      riskScore += 15;
      factors.humidity.risk = 'medium';
    }
  }

  // Wetness hours risk (more hours = higher risk)
  if (wetness !== undefined) {
    if (wetness >= 12) {
      riskScore += 25;
      factors.wetness.risk = 'high';
    } else if (wetness >= 8) {
      riskScore += 15;
      factors.wetness.risk = 'medium';
    }
  }

  // Soil moisture risk (optimal: 50-70%)
  if (moisture !== undefined) {
    if (moisture >= 50 && moisture <= 80) {
      riskScore += 15;
      factors.soilMoisture.risk = 'medium';
    } else if (moisture >= 40 && moisture <= 90) {
      riskScore += 10;
      factors.soilMoisture.risk = 'low';
    }
  }

  // Rainfall risk (promotes fungal growth)
  if (rain !== undefined) {
    if (rain >= 20) {
      riskScore += 10;
      factors.rainfall.risk = 'high';
    } else if (rain >= 10) {
      riskScore += 5;
      factors.rainfall.risk = 'medium';
    }
  }

  // Determine risk level
  let riskLevel: RiskAnalysis['riskLevel'] = 'low';
  if (riskScore >= 80) {
    riskLevel = 'critical';
  } else if (riskScore >= 60) {
    riskLevel = 'high';
  } else if (riskScore >= 40) {
    riskLevel = 'medium';
  }

  // Generate recommendations
  const recommendations: string[] = [];
  if (factors.temperature.risk === 'high') {
    recommendations.push('⚠️ Temperature is optimal for disease spread - monitor closely');
  }
  if (factors.humidity.risk === 'high') {
    recommendations.push('⚠️ High humidity detected - increase air circulation');
  }
  if (factors.wetness.risk === 'high') {
    recommendations.push('⚠️ Extended leaf wetness period - apply fungicide if needed');
  }
  if (factors.soilMoisture.risk === 'medium') {
    recommendations.push('💧 Soil moisture favorable for pathogen survival - adjust irrigation');
  }
  if (riskLevel === 'critical' || riskLevel === 'high') {
    recommendations.push('🔴 Consider preventive fungicide application');
  }

  return {
    riskLevel,
    riskScore,
    factors,
    recommendations: recommendations.length > 0 ? recommendations : ['✅ Risk level is low - continue normal management'],
  };
};

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders,
    });
  }

  // Parse body
  let body: AOIRequest;
  try {
    body = (await req.json()) as AOIRequest;
  } catch {
    return new Response('Invalid JSON body', {
      status: 400,
      headers: corsHeaders,
    });
  }

  const { aoi, configId, lat, lon, startDate, endDate, layers } = body;

  if (!aoi || !aoi.geometry || !aoi.geometry.coordinates) {
    return new Response('Missing AOI geometry', {
      status: 400,
      headers: corsHeaders,
    });
  }

  try {
    // Get AOI center point
    const [centerLon, centerLat] = getAOICenter(aoi.geometry);

    // Fetch climate data for the AOI (same method as single point)
    const climateData = await fetchClimateData(
      centerLat,
      centerLon,
      startDate,
      endDate
    );

    // Analyze risk based on climate data
    const riskAnalysis = analyzeRisk(climateData);

    console.log('📍 AOI Analysis Completed:', {
      type: aoi.geometry.type,
      drawingType: aoi.properties.drawingType,
      configId,
      center: { lat: centerLat, lon: centerLon },
      dateRange: { startDate, endDate },
      climateData,
      riskAnalysis,
    });

    const response = {
      success: true,
      message: 'AOI analyzed successfully',
      aoiId: `aoi_${Date.now()}`,
      geometry: aoi.geometry.type,
      center: {
        lat: centerLat,
        lon: centerLon,
      },
      climateData,
      riskAnalysis,
      metadata: {
        configId,
        dateRange: { startDate, endDate },
        layerCount: layers.length,
        analyzedAt: new Date().toISOString(),
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (e) {
    console.error('planet-aoi error:', e);
    return new Response(
      JSON.stringify({
        error: 'Internal error',
        details: String(e),
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
});