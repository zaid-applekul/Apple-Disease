import React, { useEffect, useRef, useState } from 'react';
import { fetchPlanetInsights } from '../services/planetService';

const LAYER_IDS = [
  // 🌱 EXISTING (11)
  'EVI', '3_NDVI-L1C', 'MOISTURE-INDEX', '5_MOISTURE-INDEX-L1C',
  '7_NDWI-L1C', '8_NDSI-L1C', '1_TRUE-COLOR-L1C', '2_FALSE-COLOR-L1C',
  '4_FALSE-COLOR-URBAN-L1C', '2_TONEMAPPED-NATURAL-COLOR-L1C', '6_SWIR-L1C',
  
  // 🔥 APPLE DISEASE (17 NEW)
  'OSAVI', 'PSRI', 'ExG', 'VARI', 'GNDVI', 'NDMI', 'SAVI', 
  'NDWI', 'LSWI', 'NGRDI', 'CIGREEN', 'GLI', 'NDRE', 'MSAVI',
  'DVI', 'RVI', 'IPVI', 'NDGI',
  
  // 🔥 PHASE 2 NEW (11 NEW UNUSED)
  'RENDVI', 'MCARI', 'MTCI', 'TCARI', 'TSAVI', 'WDVI', 'PVI', 
  'TVI', 'VIGREEN', 'SIPI', 'WBI'
];

const LAYER_GROUPS = {
  '🌱 Vegetation Health': ['EVI', '3_NDVI-L1C', 'OSAVI', 'SAVI', 'MSAVI', 'GNDVI', 'NDRE', 'RENDVI', 'MCARI', 'MTCI', 'TCARI', 'TSAVI'],
  '🔥 Apple Disease': ['PSRI', 'ExG', 'VARI', 'NGRDI', 'CIGREEN', 'GLI', 'NDGI'],
  '💧 Moisture/Water': ['MOISTURE-INDEX', '5_MOISTURE-INDEX-L1C', 'NDMI', 'NDWI', 'LSWI'],
  '🌈 Visual': ['1_TRUE-COLOR-L1C', '2_FALSE-COLOR-L1C', '4_FALSE-COLOR-URBAN-L1C', '2_TONEMAPPED-NATURAL-COLOR-L1C', '6_SWIR-L1C'],
  '❄️ Other': ['8_NDSI-L1C', 'DVI', 'RVI', 'IPVI', 'WDVI', 'PVI', 'TVI', 'VIGREEN', 'SIPI', 'WBI']
};

type Props = {
  initialLat?: number;
  initialLon?: number;
  configId?: string;
  onAutoFill: (params: Record<string, any>) => void;
};

export const PlanetMapViewer: React.FC<Props> = ({
  initialLat,
  initialLon,
  configId,
  onAutoFill,
}) => {
  const defaultLat = initialLat ?? 34.1;
  const defaultLon = initialLon ?? 74.8;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [lat, setLat] = useState<number>(defaultLat);
  const [lon, setLon] = useState<number>(defaultLon);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10)
  );
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({});
  const [planetUnavailable, setPlanetUnavailable] = useState<boolean>(false);
  const leafletLayersRef = useRef<Record<string, any>>({});
  const liveRef = useRef<number | null>(null);
  const [live, setLive] = useState<boolean>(false);
  const [showLayerDetails, setShowLayerDetails] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const baseLayerRef = useRef<any>(null);

  useEffect(() => {
    const ensureLeaflet = () =>
      new Promise<void>((resolve) => {
        if ((window as any).L) return resolve();
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(css);

        const s = document.createElement('script');
        s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        s.async = true;
        s.onload = () => setTimeout(() => resolve(), 10);
        document.body.appendChild(s);
        s.onerror = () => resolve();
      });

    let cancelled = false;
    (async () => {
      await ensureLeaflet();
      if (cancelled) return;
      const L = (window as any).L;
      if (!L || !containerRef.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current).setView(
          [defaultLat, defaultLon],
          10,
        );

        try {
          const mosaicId = 'global_monthly_2025_12';
          const planetUrl = `https://tiles.planet.com/basemaps/v1/planet-tiles/${mosaicId}/gmap/{z}/{x}/{y}.png?api_key=${import.meta.env.VITE_PLANET_API_KEY}`;

          const planetLayer = L.tileLayer(planetUrl, {
            maxZoom: 18,
            attribution: '© Planet',
            opacity: 0.9,
          });

          planetLayer.on('tileerror', () => {
            if (baseLayerRef.current) {
              mapRef.current.removeLayer(baseLayerRef.current);
            }
            const osm = L.tileLayer(
              'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
              {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 18,
                opacity: 0.9,
              },
            );
            osm.addTo(mapRef.current);
            baseLayerRef.current = osm;
            setPlanetUnavailable(true);
          });

          planetLayer.addTo(mapRef.current);
          baseLayerRef.current = planetLayer;
        } catch {
          const osm = L.tileLayer(
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            {
              attribution: '&copy; OpenStreetMap contributors',
              maxZoom: 18,
              opacity: 0.9,
            },
          );
          osm.addTo(mapRef.current);
          baseLayerRef.current = osm;
          setPlanetUnavailable(true);
        }

        mapRef.current.on('click', (e: any) => {
          setLat(e.latlng.lat);
          setLon(e.latlng.lng);
        });

        mapRef.current.on('moveend', () => {
          const c = mapRef.current.getCenter();
          setLat(c.lat);
          setLon(c.lng);
          if (live) {
            if (liveRef.current) window.clearTimeout(liveRef.current as any);
            liveRef.current = window.setTimeout(() => {
              handleFetch();
              liveRef.current = null;
            }, 700) as any;
          }
        });

        setTimeout(() => {
          try {
            mapRef.current.invalidateSize();
          } catch (e) {}
        }, 800);

        window.addEventListener('resize', () => {
          try {
            mapRef.current.invalidateSize();
          } catch (e) {}
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (!mapRef.current || !L) return;
    mapRef.current.setView([lat, lon], mapRef.current.getZoom());
    if (!mapRef.current._marker) {
      mapRef.current._marker = L.marker([lat, lon]).addTo(mapRef.current);
    } else {
      mapRef.current._marker.setLatLng([lat, lon]);
    }
  }, [lat, lon]);

  const toggleLayer = async (id: string) => {
    const L = (window as any).L;
    const on = !activeLayers[id];
    setActiveLayers((s) => ({ ...s, [id]: on }));

    if (on && L && mapRef.current) {
      try {
        const layerName = encodeURIComponent(id);
        const base = 'https://kqilyltlrklxaxqqqisj.functions.supabase.co/planet-proxy';

        const tplUrl =
          `${base}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
          `&LAYER=${layerName}` +
          `&STYLE=default` +
          `&TILEMATRIXSET=PopularWebMercator512` +
          `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}` +
          `&FORMAT=image/png`;

        const t = L.tileLayer(tplUrl, {
          opacity: 0.95,
          tileSize: 512,
          maxZoom: 19,
          minZoom: 8,
        });

        t.addTo(mapRef.current);
        leafletLayersRef.current[id] = t;
      } catch {
        // ignore errors adding layer
      }
    } else if (!on) {
      const l = leafletLayersRef.current[id];
      if (l && mapRef.current) {
        mapRef.current.removeLayer(l);
        delete leafletLayersRef.current[id];
      }
    }
  };

  const toggleGroup = (groupName: string) => {
    setExpandedGroup(expandedGroup === groupName ? null : groupName);
  };

  const handleFetch = async () => {
    setPlanetUnavailable(false);
    try {
      const pi = await fetchPlanetInsights({
        configId,
        lat,
        lon,
        startDate,
        endDate,
        layers: Object.keys(activeLayers).filter((k) => activeLayers[k]),
      });

      if (pi && pi._source === 'mock') {
        setPlanetUnavailable(true);
      } else {
        setPlanetUnavailable(false);
      }

      const auto = {
        temperature: pi.temperature ?? (pi as any).temp ?? undefined,
        rh: pi.relativeHumidity ?? (pi as any).rh ?? undefined,
        weeklyRainfall: pi.rainfall ?? (pi as any).precipitation ?? undefined,
        leafWetness: pi.wetnessHours ?? undefined,
        windSpeed: pi.windSpeed ?? undefined,
        soilMoisture: pi.soilMoisture ?? undefined,
        canopyHumidity: pi.canopyHumidity ?? undefined,
      };
      onAutoFill(auto);
    } catch {
      setPlanetUnavailable(true);
      try {
        const pi = await fetchPlanetInsights({
          configId,
          lat,
          lon,
          startDate,
          endDate,
        });
        const auto = {
          temperature: pi.temperature,
          rh: pi.relativeHumidity,
          weeklyRainfall: pi.rainfall,
          leafWetness: pi.wetnessHours,
          windSpeed: pi.windSpeed,
          soilMoisture: pi.soilMoisture,
          canopyHumidity: pi.canopyHumidity,
        };
        onAutoFill(auto);
      } catch {
        // last resort: do nothing
      }
    }
  };

  const friendlyName = (id: string) =>
    id === '3_NDVI-L1C'
      ? 'NDVI'
      : id === 'EVI'
      ? 'EVI'
      : id === 'MOISTURE-INDEX' || id === '5_MOISTURE-INDEX-L1C'
      ? 'Moisture'
      : id === '7_NDWI-L1C'
      ? 'Water index'
      : id === '8_NDSI-L1C'
      ? 'Snow index'
      : id === '1_TRUE-COLOR-L1C'
      ? 'True color'
      : id === '2_FALSE-COLOR-L1C'
      ? 'False color'
      : id === '4_FALSE-COLOR-URBAN-L1C'
      ? 'Urban'
      : id === '2_TONEMAPPED-NATURAL-COLOR-L1C'
      ? 'Natural color'
      : id === '6_SWIR-L1C'
      ? 'SWIR'
      : id === 'OSAVI' ? 'OSAVI'
      : id === 'PSRI' ? 'PSRI'
      : id === 'ExG' ? 'ExG'
      : id === 'VARI' ? 'VARI'
      : id === 'GNDVI' ? 'GNDVI'
      : id === 'NDMI' ? 'NDMI'
      : id === 'SAVI' ? 'SAVI'
      : id === 'NDWI' ? 'NDWI'
      : id === 'LSWI' ? 'LSWI'
      : id === 'NGRDI' ? 'NGRDI'
      : id === 'CIGREEN' ? 'CIGREEN'
      : id === 'GLI' ? 'GLI'
      : id === 'NDRE' ? 'NDRE'
      : id === 'MSAVI' ? 'MSAVI'
      : id === 'DVI' ? 'DVI'
      : id === 'RVI' ? 'RVI'
      : id === 'IPVI' ? 'IPVI'
      : id === 'NDGI' ? 'NDGI'
      : id === 'RENDVI' ? 'RENDVI'
      : id === 'MCARI' ? 'MCARI'
      : id === 'MTCI' ? 'MTCI'
      : id === 'TCARI' ? 'TCARI'
      : id === 'TSAVI' ? 'TSAVI'
      : id === 'WDVI' ? 'WDVI'
      : id === 'PVI' ? 'PVI'
      : id === 'TVI' ? 'TVI'
      : id === 'VIGREEN' ? 'VIGREEN'
      : id === 'SIPI' ? 'SIPI'
      : id === 'WBI' ? 'WBI'
      : id;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 h-full flex flex-col">
      <div className="text-sm text-gray-600 mb-2">Planet Map Viewer</div>

      <div className="rounded overflow-hidden mb-3">
        <div
          ref={containerRef}
          style={{ width: '100%', height: 420 }}
          className="rounded"
        />
      </div>

      <div className="bg-gray-50 p-3 rounded flex flex-col gap-3">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">Layers</span>
            <button
              type="button"
              className="text-[11px] text-black-600 underline"
              onClick={() => setShowLayerDetails((v) => !v)}
            >
              {showLayerDetails ? 'Hide Layers' : 'Additional Info'}
            </button>
          </div>

          {/* DRILLDOWN GROUPS */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {Object.entries(LAYER_GROUPS).map(([groupName, layers]) => (
              <div key={groupName} className="border-b border-gray-200 pb-2 last:border-b-0">
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="w-full flex items-center justify-between text-xs font-medium p-2 bg-gray-100 hover:bg-gray-200 rounded transition-all"
                >
                  <span>{groupName}</span>
                  <span className={`transform transition-transform ${
                    expandedGroup === groupName ? 'rotate-180' : ''
                  }`}>
                    ▼
                  </span>
                </button>
                
                {expandedGroup === groupName && (
                  <div className="pl-4 mt-1 flex flex-wrap gap-1">
                    {layers.map((id) => (
                      <button
                        key={id}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLayer(id);
                        }}
                        className={`px-2 py-1 text-[10px] rounded-full border ${
                          activeLayers[id]
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-800 border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {friendlyName(id)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {showLayerDetails && (
            <div className="mt-2 bg-white border border-gray-200 rounded p-2 text-[11px] text-gray-700">
              <div className="font-semibold mb-1">Layer details</div>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {LAYER_IDS.map((id) => (
                  <li key={id}>
                    <span className="font-medium">{friendlyName(id)}:</span>{' '}
                    "{id}"
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="whitespace-nowrap">Date range</span>
            <input
              type="date"
              className="px-2 py-1 border rounded"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <input
              type="date"
              className="px-2 py-1 border rounded"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleFetch}
              className="bg-green-600 text-white px-3 py-1 rounded text-xs"
            >
              Live
            </button>
            <button
              onClick={() => {
                if (navigator.geolocation)
                  navigator.geolocation.getCurrentPosition((p) => {
                    setLat(p.coords.latitude);
                    setLon(p.coords.longitude);
                  });
              }}
              className="px-3 py-1 border rounded text-xs"
            >
              Locate
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
            />
            <span>Live updates</span>
          </label>
        </div>
      </div>

      {planetUnavailable && (
        <div className="text-xs text-orange-700 mt-2">
          Displaying OpenStreetMap basemap with Open-Meteo climate data. Purchase
          a Planet basemaps and climate analytics subscription to enable
          retrieval of real satellite‑derived values.
        </div>
      )}
    </div>
  );
};

export default PlanetMapViewer;
