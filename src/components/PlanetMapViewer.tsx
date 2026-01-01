import React, { useEffect, useRef, useState } from 'react';
import { fetchPlanetInsights } from '../services/planetService';
// remove unused submitAOI import

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

interface GeoJSONCoordinate extends Array<number> {
  0: number; // longitude
  1: number; // latitude
}

interface GeoJSONGeometry {
  type: 'Point' | 'LineString' | 'Polygon';
  coordinates: GeoJSONCoordinate[] | GeoJSONCoordinate[][];
}

interface AOIGeoJSON {
  type: 'Feature';
  geometry: GeoJSONGeometry;
  properties: {
    name?: string;
    drawingType: string;
    createdAt: string;
  };
}

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

  // Drawing state
  const [drawingMode, setDrawingMode] = useState<'none' | 'line' | 'polygon' | 'rectangle'>('none');
  const drawingModeRef = useRef<'none' | 'line' | 'polygon' | 'rectangle'>('none');
  const [currentDrawing, setCurrentDrawing] = useState<any[]>([]);
  const drawnShapesRef = useRef<any[]>([]);
  const tempLineRef = useRef<any>(null);

  // Add new state for storing GeoJSON
  const [drawnGeoJSON, setDrawnGeoJSON] = useState<AOIGeoJSON[]>([]);

  // Add state for mode selection
  const [dataFetchMode, setDataFetchMode] = useState<'point' | 'boundary'>('point');

  // Add conversion functions before the useEffect hooks
  const convertToGeoJSON = (
    drawingType: 'line' | 'polygon' | 'rectangle',
    coordinates: number[][]
  ): AOIGeoJSON => {
    try {
      if (drawingType === 'line') {
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coordinates.map(coord => [coord[1], coord[0]])
          },
          properties: {
            drawingType: 'line',
            createdAt: new Date().toISOString()
          }
        };
      } else {
        const coords = [...coordinates];
        if (coords[0][0] !== coords[coords.length - 1][0] || 
            coords[0][1] !== coords[coords.length - 1][1]) {
          coords.push(coords[0]);
        }
        
        return {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [coords.map(coord => [coord[1], coord[0]])]
          },
          properties: {
            drawingType: drawingType,
            createdAt: new Date().toISOString()
          }
        };
      }
    } catch (error) {
      console.error('❌ GeoJSON conversion error:', error);
      throw error;
    }
  };

  // Remove the entire first useEffect and replace with this fixed version
  useEffect(() => {
    const ensureLeaflet = () =>
      new Promise<void>((resolve) => {
        if ((window as any).L) {
          resolve();
          return;
        }
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

        baseLayerRef.current = L.tileLayer(
          'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors',
          },
        ).addTo(mapRef.current);

        // Map click handler - use ref to avoid closure issues
        mapRef.current.on('click', (e: any) => {
          const mode = drawingModeRef.current;
          if (mode === 'none') {
            setLat(e.latlng.lat);
            setLon(e.latlng.lng);
          } else if (mode === 'line' || mode === 'polygon') {
            setCurrentDrawing(prev => [...prev, [e.latlng.lat, e.latlng.lng]]);
          } else if (mode === 'rectangle') {
            setCurrentDrawing(prev => {
              if (prev.length === 0) {
                return [[e.latlng.lat, e.latlng.lng]];
              } else {
                const firstCorner = prev[0];
                const secondCorner = [e.latlng.lat, e.latlng.lng];
                const rectangleBounds = [
                  firstCorner,
                  [firstCorner[0], secondCorner[1]],
                  secondCorner,
                  [secondCorner[0], firstCorner[1]],
                  firstCorner
                ];
                
                const rect = L.polygon(rectangleBounds, {
                  color: '#3b82f6',
                  fillColor: '#3b82f6',
                  fillOpacity: 0.2,
                  weight: 2
                }).addTo(mapRef.current);
                
                drawnShapesRef.current.push(rect);
                
                // Convert to GeoJSON and send to backend
                const geoJSON: AOIGeoJSON = {
                  type: 'Feature',
                  geometry: {
                    type: 'Polygon',
                    coordinates: [rectangleBounds.map(coord => [coord[1], coord[0]])]
                  },
                  properties: {
                    drawingType: 'rectangle',
                    createdAt: new Date().toISOString()
                  }
                };
                
                setDrawnGeoJSON(prevGeo => [...prevGeo, geoJSON]);
                
                // Send to backend without awaiting
                sendAOIToBackend(geoJSON).catch(err => 
                  console.error('Failed to send rectangle AOI:', err)
                );
                
                drawingModeRef.current = 'none';
                setDrawingMode('none');
                return [];
              }
            });
          }
        });

        mapRef.current.on('moveend', () => {
          if (!mapRef.current) return;
          const center = mapRef.current.getCenter();
          setLat(center.lat);
          setLon(center.lng);
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // Empty dependency array - only run once

  useEffect(() => {
    const L = (window as any).L;
    if (!mapRef.current || !L) return;
    
    // Don't update marker/view during drawing mode
    if (drawingMode !== 'none') return;
    
    mapRef.current.setView([lat, lon], mapRef.current.getZoom());
    if (!mapRef.current._marker) {
      mapRef.current._marker = L.marker([lat, lon]).addTo(mapRef.current);
    } else {
      mapRef.current._marker.setLatLng([lat, lon]);
    }
  }, [lat, lon, drawingMode]);

  // Sync drawingMode ref with state
  useEffect(() => {
    drawingModeRef.current = drawingMode;
  }, [drawingMode]);

  // Handle drawing updates
  useEffect(() => {
    const L = (window as any).L;
    if (!mapRef.current || !L) return;

    // Remove temporary line/polygon if exists
    if (tempLineRef.current) {
      mapRef.current.removeLayer(tempLineRef.current);
      tempLineRef.current = null;
    }

    // Draw temporary line or polygon as user clicks
    if (currentDrawing.length > 0) {
      if (drawingMode === 'line' && currentDrawing.length >= 1) {
        tempLineRef.current = L.polyline(currentDrawing, {
          color: '#3b82f6',
          weight: 3,
          dashArray: '5, 5'
        }).addTo(mapRef.current);
      } else if (drawingMode === 'polygon' && currentDrawing.length >= 2) {
        tempLineRef.current = L.polygon(currentDrawing, {
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.2,
          weight: 2,
          dashArray: '5, 5'
        }).addTo(mapRef.current);
      }
    }
  }, [currentDrawing, drawingMode]);

  // Modify finishDrawing to not use async/await directly
  const finishDrawing = () => {
    try {
      const L = (window as any).L;
      if (!mapRef.current || !L || currentDrawing.length === 0) return;

      let shape: any = null;
      let geoJSON: AOIGeoJSON | null = null;

      if (drawingMode === 'line' && currentDrawing.length >= 2) {
        shape = L.polyline(currentDrawing, {
          color: '#3b82f6',
          weight: 3
        }).addTo(mapRef.current);
        
        geoJSON = convertToGeoJSON('line', currentDrawing);
        
      } else if (drawingMode === 'polygon' && currentDrawing.length >= 3) {
        shape = L.polygon(currentDrawing, {
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.2,
          weight: 2
        }).addTo(mapRef.current);
        
        geoJSON = convertToGeoJSON('polygon', currentDrawing);
      }

      if (shape && geoJSON) {
        drawnShapesRef.current.push(shape);
        
        // Update state immediately
        setDrawnGeoJSON(prev => {
          const updated = [...prev, geoJSON!];
          console.log('✅ Total AOIs drawn:', updated.length);
          return updated;
        });
        
        // Send to backend asynchronously without blocking
        sendAOIToBackend(geoJSON).catch(err => 
          console.error('⚠️ Background send failed:', err)
        );
      }

      // Clean up
      if (tempLineRef.current && mapRef.current) {
        mapRef.current.removeLayer(tempLineRef.current);
        tempLineRef.current = null;
      }
      
      setCurrentDrawing([]);
      setDrawingMode('none');
      drawingModeRef.current = 'none';
      
    } catch (error) {
      console.error('❌ finishDrawing error:', error);
      // Don't throw - just log and continue
      setCurrentDrawing([]);
      setDrawingMode('none');
      drawingModeRef.current = 'none';
    }
  };

  const cancelDrawing = () => {
    try {
      const L = (window as any).L;
      if (tempLineRef.current && mapRef.current && L) {
        mapRef.current.removeLayer(tempLineRef.current);
        tempLineRef.current = null;
      }
      setCurrentDrawing([]);
      setDrawingMode('none');
      drawingModeRef.current = 'none';
    } catch (error) {
      console.error('❌ cancelDrawing error:', error);
    }
  };

  const clearAllDrawings = () => {
    if (!mapRef.current) return;
    drawnShapesRef.current.forEach(shape => {
      mapRef.current.removeLayer(shape);
    });
    drawnShapesRef.current = [];
    setDrawnGeoJSON([]);
    cancelDrawing();
  };

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

  // Replace sendAOIToBackend with a simpler mock version:
  const sendAOIToBackend = async (aoiGeoJSON: AOIGeoJSON): Promise<any> => {
    const response = await fetch('https://kqilyltlrklxaxqqqisj.functions.supabase.co/planet-aoi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aoi: aoiGeoJSON,
        configId,
        lat,
        lon,
        startDate,
        endDate,
        layers: Object.keys(activeLayers).filter((k) => activeLayers[k]),
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return response.json();
  };

  // Add this function BEFORE the return statement:
  const showGeoJSONData = () => {
    if (drawnGeoJSON.length === 0) {
      alert('No AOIs drawn yet. Draw a shape first!');
      return;
    }
    
    console.log('📍 Current GeoJSON AOIs:', drawnGeoJSON);
    console.log('📊 Total AOIs:', drawnGeoJSON.length);
    
    // Show summary in alert
    const summary = drawnGeoJSON.map((aoi, idx) => 
      `${idx + 1}. ${aoi.properties.drawingType} (${aoi.geometry.type})`
    ).join('\n');
    
    alert(`Total AOIs drawn: ${drawnGeoJSON.length}\n\n${summary}\n\nCheck console (F12) for full GeoJSON data.`);
  };

  // Add these new functions before the return statement:
  const fetchPointData = async (latitude: number, longitude: number) => {
    const response = await fetchPlanetInsights({
      lat: latitude,
      lon: longitude,
      startDate,
      endDate,
      layers: Object.keys(activeLayers).filter((k) => activeLayers[k]),
    });
    if (onAutoFill) {
      onAutoFill({
        lat: latitude,
        lon: longitude,
        temperature: response.temperature,
        rainfall: response.rainfall,
        relativeHumidity: response.relativeHumidity,
        windSpeed: response.windSpeed,
        soilMoisture: response.soilMoisture,
        canopyHumidity: response.canopyHumidity,
        wetnessHours: response.wetnessHours,
      });
    }
  };

  const fetchBoundaryData = async (aoiGeoJSON: AOIGeoJSON) => {
    const response = await sendAOIToBackend(aoiGeoJSON);
    if (onAutoFill && response?.climateData) {
      onAutoFill({
        lat: response.center?.lat,
        lon: response.center?.lon,
        temperature: response.climateData.temperature,
        rainfall: response.climateData.rainfall,
        relativeHumidity: response.climateData.relativeHumidity,
        windSpeed: response.climateData.windSpeed,
        soilMoisture: response.climateData.soilMoisture,
        canopyHumidity: response.climateData.canopyHumidity,
        wetnessHours: response.climateData.wetnessHours,
        riskAnalysis: response.riskAnalysis,
        aoiId: response.aoiId,
      });
    }
  };

  // ✅ single Live handler decides point vs boundary
  const handleLive = async () => {
    try {
      if (dataFetchMode === 'point') {
        await fetchPointData(lat, lon);
      } else {
        if (!drawnGeoJSON.length) {
          alert('Draw an AOI first, then click Live to fetch.');
          return;
        }
        await fetchBoundaryData(drawnGeoJSON[drawnGeoJSON.length - 1]);
      }
    } catch (err) {
      console.error('Live fetch failed:', err);
      alert('Fetch failed. Check console for details.');
    }
  };

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
        
        {/* DATA FETCH MODE SELECTOR */}
        <div>
          <span className="text-xs font-semibold block mb-2">Data Fetch Mode</span>
          <div className="flex gap-2">
            <button
              onClick={() => setDataFetchMode('point')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                dataFetchMode === 'point'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              📍 Single Point
            </button>
            <button
              onClick={() => setDataFetchMode('boundary')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                dataFetchMode === 'boundary'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              🗺️ Boundary (AOI)
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            {dataFetchMode === 'point' 
              ? 'Click on map to select a single point' 
              : 'Draw a shape to define area of interest'}
          </p>
        </div>

        {/* SINGLE POINT MODE */}
        {dataFetchMode === 'point' && (
          <div className="border-t pt-3">
            <span className="text-xs font-semibold block mb-2">Current Location</span>
            <div className="bg-white p-2 rounded text-xs space-y-1 border border-gray-200">
              <div><span className="text-gray-600">Latitude:</span> <span className="font-mono">{lat.toFixed(6)}</span></div>
              <div><span className="text-gray-600">Longitude:</span> <span className="font-mono">{lon.toFixed(6)}</span></div>
              {/* ❌ remove per-point fetch button; Live handles it */}
            </div>
          </div>
        )}

        {/* BOUNDARY/AOI MODE */}
        {dataFetchMode === 'boundary' && (
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold">Drawing Tools (AOI)</span>
              {drawnGeoJSON.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={showGeoJSONData}
                    className="text-[11px] px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                  >
                    Show Data ({drawnGeoJSON.length})
                  </button>
                  <button
                    onClick={clearAllDrawings}
                    className="text-[11px] px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-2 mb-2">
              <button
                onClick={() => {
                  if (drawingMode === 'line') {
                    cancelDrawing();
                  } else {
                    setDrawingMode('line');
                    drawingModeRef.current = 'line';
                    setCurrentDrawing([]);
                  }
                }}
                className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                  drawingMode === 'line'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {drawingMode === 'line' ? '✓ Line' : 'Line'}
              </button>

              <button
                onClick={() => {
                  if (drawingMode === 'polygon') {
                    cancelDrawing();
                  } else {
                    setDrawingMode('polygon');
                    drawingModeRef.current = 'polygon';
                    setCurrentDrawing([]);
                  }
                }}
                className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                  drawingMode === 'polygon'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {drawingMode === 'polygon' ? '✓ Polygon' : 'Polygon'}
              </button>

              <button
                onClick={() => {
                  if (drawingMode === 'rectangle') {
                    cancelDrawing();
                  } else {
                    setDrawingMode('rectangle');
                    drawingModeRef.current = 'rectangle';
                    setCurrentDrawing([]);
                  }
                }}
                className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                  drawingMode === 'rectangle'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {drawingMode === 'rectangle' ? '✓ Rectangle' : 'Rectangle'}
              </button>
            </div>

            {drawingMode !== 'none' && (drawingMode === 'line' || drawingMode === 'polygon') && (
              <div className="flex gap-2 mb-2">
                <button
                  onClick={finishDrawing}
                  disabled={
                    (drawingMode === 'line' && currentDrawing.length < 2) ||
                    (drawingMode === 'polygon' && currentDrawing.length < 3)
                  }
                  className="flex-1 px-3 py-2 bg-green-500 text-white rounded text-sm font-medium hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Finish Drawing
                </button>
                <button
                  onClick={cancelDrawing}
                  className="flex-1 px-3 py-2 bg-red-500 text-white rounded text-sm font-medium hover:bg-red-600"
                >
                  Cancel
                </button>
              </div>
            )}

            {currentDrawing.length > 0 && (
              <div className="mb-2 text-xs text-gray-600 bg-blue-50 p-2 rounded">
                📍 Points: {currentDrawing.length}
                {drawingMode === 'line' && currentDrawing.length < 2 && ' (need 2+)'
                }
                {drawingMode === 'polygon' && currentDrawing.length < 3 && ' (need 3+)'
                }
              </div>
            )}
          </div>
        )}

        {/* LAYERS SECTION - ALWAYS VISIBLE */}
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

        {/* DATE RANGE & BUTTONS */}
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
            <button onClick={handleLive} className="bg-green-600 text-white px-3 py-1 rounded text-xs">
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
