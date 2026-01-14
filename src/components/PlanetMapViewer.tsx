import React, { useEffect, useRef, useState } from 'react';
import { fetchPlanetInsights } from '../services/planetService';
import { saveAOI, getUserAOIs, deleteAllUserAOIs, deleteAOI, updateAOIName, SavedAOI } from '../services/aoiService';
import { supabase } from '../lib/supabase';

// Helper function to calculate distance between two points (Haversine formula)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Helper function to calculate line length
const calculateLineLength = (coords: number[][]): { meters: number; feet: number; kilometers: number; miles: number } => {
  if (coords.length < 2) return { meters: 0, feet: 0, kilometers: 0, miles: 0 };
  
  let totalDistance = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    totalDistance += calculateDistance(lat1, lon1, lat2, lon2);
  }
  
  return {
    meters: totalDistance,
    feet: totalDistance * 3.28084,
    kilometers: totalDistance / 1000,
    miles: totalDistance / 1609.34
  };
};

// Helper function to calculate polygon area
const calculatePolygonArea = (coords: number[][]): { sqMeters: number; sqFeet: number; acres: number; hectares: number } => {
  if (coords.length < 3) return { sqMeters: 0, sqFeet: 0, acres: 0, hectares: 0 };

  // Convert lat/lon to approximate meters using spherical Earth
  const R = 6371000; // Earth radius in meters
  
  let area = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    
    const x1 = lon1 * Math.PI / 180 * R * Math.cos(lat1 * Math.PI / 180);
    const y1 = lat1 * Math.PI / 180 * R;
    const x2 = lon2 * Math.PI / 180 * R * Math.cos(lat2 * Math.PI / 180);
    const y2 = lat2 * Math.PI / 180 * R;
    
    area += x1 * y2 - x2 * y1;
  }
  
  const sqMeters = Math.abs(area / 2);
  const sqFeet = sqMeters * 10.7639;
  const acres = sqMeters * 0.000247105;
  const hectares = sqMeters / 10000;

  return { sqMeters, sqFeet, acres, hectares };
};

const calculateMeasurement = (geojson: AOIGeoJSON): { 
  type: 'area' | 'length' | 'none';
  area?: { sqMeters: number; sqFeet: number; acres: number; hectares: number };
  length?: { meters: number; feet: number; kilometers: number; miles: number };
} => {
  if (geojson.geometry.type === 'Polygon') {
    return { 
      type: 'area',
      area: calculatePolygonArea(geojson.geometry.coordinates[0])
    };
  } else if (geojson.geometry.type === 'LineString') {
    return {
      type: 'length',
      length: calculateLineLength(geojson.geometry.coordinates as number[][])
    };
  }
  return { type: 'none' };
};

// Simple formatter for climate values
const formatClimate = (val?: number, unit?: string) =>
  val === undefined || val === null || Number.isNaN(val)
    ? '—'
    : `${val.toFixed(1)}${unit ?? ''}`;

const LAYER_IDS = [
  // 🌱 EXISTING (11)
  'EVI', '3_NDVI-L1C', 'MOISTURE-INDEX', '5_MOISTURE-INDEX-L1C',
  '7_NDWI-L1C', '8_NDSI-L1C', '1_TRUE-COLOR-L1C', '2_FALSE-COLOR-L1C',
  '4_FALSE-COLOR-URBAN-L1C', '2_TONEMAPPED-NATURAL-COLOR-L1C', '6_SWIR-L1C',
  
  // 🔥 APPLE DISEASE (17 NEW)
  'OSAVI', 'PSRI', 'EXG','EXR', 'VARI', 'GNDVI', 'NDMI', 'SAVI', 
  'NDWI', 'LSWI', 'NGRDI', 'CIGREEN', 'GLI', 'NDRE', 'MSAVI',
  'DVI', 'RVI', 'IPVI', 'NDGI',
  
  // 🔥 PHASE 2 NEW (11 NEW UNUSED)
  'RENDVI', 'MCARI', 'MTCI', 'TCARI', 'TSAVI', 'WDVI', 'PVI', 
  'TVI', 'VIGREEN', 'SIPI', 'WBI'
];

const LAYER_GROUPS = {
  '🌱 Vegetation Health': ['EVI', '3_NDVI-L1C', 'OSAVI', 'SAVI', 'MSAVI', 'GNDVI', 'NDRE', 'RENDVI', 'MCARI', 'MTCI', 'TCARI', 'TSAVI'],
  '🔥 Apple Disease': ['PSRI', 'EXG','EXR', 'VARI', 'NGRDI', 'CIGREEN', 'GLI', 'NDGI'],
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

  // ✅ State for saved AOIs
  const [savedAOIs, setSavedAOIs] = useState<SavedAOI[]>([]);
  const [loadingAOIs, setLoadingAOIs] = useState(false);
  const [selectedBoundaryId, setSelectedBoundaryId] = useState<string | null>(null);

  // Climate data per saved AOI
  const [aoiClimateData, setAoiClimateData] = useState<Record<string, {
    temperature?: number;
    windSpeed?: number;
    rainfall?: number;
  }>>({});

  // State for selected boundary details
  const [selectedBoundaryDetails, setSelectedBoundaryDetails] = useState<{
    name: string;
    measurement: {
      type: 'area' | 'length' | 'none';
      area?: { sqMeters: number; sqFeet: number; acres: number; hectares: number };
      length?: { meters: number; feet: number; kilometers: number; miles: number };
    };
    type: string;
  } | null>(null);

  // Mask overlay state
  const maskLayerRef = useRef<any>(null);

  // Remove mask overlay function
  const removeMaskOverlay = () => {
    const L = (window as any).L;
    if (maskLayerRef.current && mapRef.current && L) {
      mapRef.current.removeLayer(maskLayerRef.current);
      maskLayerRef.current = null;
    }
  };

  // Create mask overlay function
  const createMaskOverlay = (shape: any) => {
    const L = (window as any).L;
    if (!mapRef.current || !L) return;

    // Remove old mask if exists
    if (maskLayerRef.current) {
      mapRef.current.removeLayer(maskLayerRef.current);
      maskLayerRef.current = null;
    }

    // Get ALL drawn shapes including the new one
    const allShapes = [...drawnShapesRef.current];
    if (!allShapes.includes(shape)) {
      allShapes.push(shape);
    }

    // Calculate combined bounds of all shapes
    let combinedBounds: any = null;
    allShapes.forEach((s: any) => {
      if (s && s.getBounds) {
        const bounds = s.getBounds();
        if (!combinedBounds) {
          combinedBounds = bounds;
        } else {
          combinedBounds.extend(bounds);
        }
      }
    });

    if (!combinedBounds) return;

    const padding = 1; // degrees

    // Create outer rectangle (covers entire visible area)
    const outerCoords = [
      [combinedBounds.getNorth() + padding, combinedBounds.getWest() - padding],
      [combinedBounds.getNorth() + padding, combinedBounds.getEast() + padding],
      [combinedBounds.getSouth() - padding, combinedBounds.getEast() + padding],
      [combinedBounds.getSouth() - padding, combinedBounds.getWest() - padding],
      [combinedBounds.getNorth() + padding, combinedBounds.getWest() - padding]
    ];

    // Create holes for ALL shapes
    const allHoles: any[] = [];
    allShapes.forEach((s: any) => {
      if (s && s.getLatLngs) {
        const innerCoords = s.getLatLngs();
        let innerLatLngs: any[] = [];
        
        if (innerCoords.length > 0) {
          if (Array.isArray(innerCoords[0])) {
            innerLatLngs = innerCoords[0];
          } else {
            innerLatLngs = innerCoords;
          }
          const hole = [...innerLatLngs];
          hole.push(hole[0]); // close the path
          allHoles.push(hole);
        }
      }
    });

    // Create mask polygon with multiple holes
    const mask = L.polygon([outerCoords, ...allHoles], {
      fillColor: '#000000',
      fillOpacity: 0.99, // 99% dark overlay
      stroke: false,
      interactive: false
    });

    mask.addTo(mapRef.current);
    maskLayerRef.current = mask;
  };

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

  // ✅ DEBUG: Log current user when component mounts
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('🔑 Current logged in user:', user?.id);
      console.log('📧 User email:', user?.email);
    };
    checkUser();
  }, []);

  // Remove mask when switching to point mode
  useEffect(() => {
    if (dataFetchMode === 'point') {
      removeMaskOverlay();
    }
  }, [dataFetchMode]);

  // ✅ Load saved AOIs on mount
  useEffect(() => {
    const loadAOIs = async () => {
      setLoadingAOIs(true);
      try {
        const aois = await getUserAOIs(configId);
        setSavedAOIs(aois);
        
        // ✅ FIXED: Populate drawnGeoJSON with loaded AOIs
        const loadedGeoJSON = aois.map(aoi => aoi.geojson);
        setDrawnGeoJSON(loadedGeoJSON);
        
        // ✅ Render them on map
        const L = (window as any).L;
        if (mapRef.current && L && aois.length > 0) {
          aois.forEach((aoi) => {
            const coords = aoi.geojson.geometry.coordinates;
            let shape: any = null;

            if (aoi.geojson.geometry.type === 'LineString') {
              const latLngs = coords.map((c: number[]) => [c[1], c[0]]);
              shape = L.polyline(latLngs, {
                color: '#10b981',
                weight: 3
              }).addTo(mapRef.current);
              
              // Create mask overlay for loaded line only if in boundary mode
              if (dataFetchMode === 'boundary') {
                createMaskOverlay(shape);
              }
            } else if (aoi.geojson.geometry.type === 'Polygon') {
              const latLngs = coords[0].map((c: number[]) => [c[1], c[0]]);
              shape = L.polygon(latLngs, {
                color: '#10b981',
                fillColor: '#10b981',
                fillOpacity: 0.2,
                weight: 2
              }).addTo(mapRef.current);
              
              // Create mask overlay for loaded polygon boundary only if in boundary mode
              if (dataFetchMode === 'boundary') {
                createMaskOverlay(shape);
              }
            }

            if (shape) {
              shape.bindPopup(`
                <div style="padding: 8px;">
                  <strong>${aoi.name || 'Unnamed AOI'}</strong><br/>
                  <small>Created: ${new Date(aoi.created_at).toLocaleString()}</small>
                </div>
              `);
              drawnShapesRef.current.push(shape);
            }
          });
        }
        
        setLoadingAOIs(false);
      } catch (error) {
        console.error('❌ Error loading AOIs:', error);
        setLoadingAOIs(false);
      }
    };

    loadAOIs();
  }, [configId]);

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
            minZoom: 11,
            maxZoom: 18,
            attribution: '© OpenStreetMap contributors',
          },
        ).addTo(mapRef.current);

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
                
                // ✅ Save rectangle to Supabase
                saveAOI(geoJSON, configId).then(savedAOI => {
                  if (savedAOI) {
                    setSavedAOIs(prev => [savedAOI, ...prev]);
                    console.log('✅ Rectangle saved to database');
                  }
                });
                
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
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (!mapRef.current || !L) return;
    
    if (drawingMode !== 'none') return;
    
    mapRef.current.setView([lat, lon], mapRef.current.getZoom());
    if (!mapRef.current._marker) {
      mapRef.current._marker = L.marker([lat, lon]).addTo(mapRef.current);
    } else {
      mapRef.current._marker.setLatLng([lat, lon]);
    }
  }, [lat, lon, drawingMode]);

  useEffect(() => {
    drawingModeRef.current = drawingMode;
  }, [drawingMode]);

  useEffect(() => {
    const L = (window as any).L;
    if (!mapRef.current || !L) return;

    if (tempLineRef.current) {
      mapRef.current.removeLayer(tempLineRef.current);
      tempLineRef.current = null;
    }

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

  // ✅ MODIFIED: finishDrawing to save to Supabase
  const finishDrawing = async () => {
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
        
        // Create mask overlay only if in boundary mode
        if (dataFetchMode === 'boundary') {
          createMaskOverlay(shape);
        }
        
        // ✅ Save to Supabase
        const savedAOI = await saveAOI(geoJSON, configId);
        if (savedAOI) {
          setSavedAOIs(prev => [savedAOI, ...prev]);
          console.log('✅ AOI saved to database');
        }
        
        setDrawnGeoJSON(prev => {
          const updated = [...prev, geoJSON!];
          console.log('✅ Total AOIs drawn:', updated.length);
          return updated;
        });
        
        sendAOIToBackend(geoJSON).catch(err => 
          console.error('⚠️ Background send failed:', err)
        );
      }

      if (tempLineRef.current && mapRef.current) {
        mapRef.current.removeLayer(tempLineRef.current);
        tempLineRef.current = null;
      }
      
      setCurrentDrawing([]);
      setDrawingMode('none');
      drawingModeRef.current = 'none';
      
    } catch (error) {
      console.error('❌ finishDrawing error:', error);
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

  // ✅ MODIFIED: clearAllDrawings to delete from Supabase
  const clearAllDrawings = async () => {
    if (!mapRef.current) return;
    
    // Delete from database
    await deleteAllUserAOIs();
    
    // Clear from map
    drawnShapesRef.current.forEach(shape => {
      mapRef.current.removeLayer(shape);
    });
    drawnShapesRef.current = [];
    setDrawnGeoJSON([]);
    setSavedAOIs([]);
    setSelectedBoundaryId(null);
    setSelectedBoundaryDetails(null);
    cancelDrawing();
  };

  // ✅ Delete single AOI
  const handleDeleteAOI = async (aoiId: string, index: number) => {
    try {
      const success = await deleteAOI(aoiId);
      if (success) {
        // Remove from state
        setSavedAOIs(savedAOIs.filter(aoi => aoi.id !== aoiId));
        setDrawnGeoJSON(drawnGeoJSON.filter((_, i) => i !== index));
        
        // Remove from map
        if (drawnShapesRef.current[index]) {
          mapRef.current.removeLayer(drawnShapesRef.current[index]);
          drawnShapesRef.current.splice(index, 1);
        }
        
        console.log('✅ AOI deleted successfully');
      }
    } catch (error) {
      console.error('❌ Error deleting AOI:', error);
    }
  };

  const toggleLayer = async (id: string) => {
    const L = (window as any).L;
    const on = !activeLayers[id];
    setActiveLayers((s) => ({ ...s, [id]: on }));

    if (on && L && mapRef.current) {
      try {
        const layerName = encodeURIComponent(id);
        const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/planet-proxy`;

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

  const sendAOIToBackend = async (aoiGeoJSON: AOIGeoJSON): Promise<any> => {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/planet-aoi`, {
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

  const showGeoJSONData = () => {
    if (drawnGeoJSON.length === 0) {
      alert('No AOIs drawn yet. Draw a shape first!');
      return;
    }
    
    console.log('📍 Current GeoJSON AOIs:', drawnGeoJSON);
    console.log('📊 Total AOIs:', drawnGeoJSON.length);
    
    const summary = drawnGeoJSON.map((aoi, idx) => 
      `${idx + 1}. ${aoi.properties.drawingType} (${aoi.geometry.type})`
    ).join('\n');
    
    alert(`Total AOIs drawn: ${drawnGeoJSON.length}\n\n${summary}\n\nCheck console (F12) for full GeoJSON data.`);
  };

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

  const fetchBoundaryData = async (aoiGeoJSON: AOIGeoJSON, aoiId?: string) => {
    const response = await sendAOIToBackend(aoiGeoJSON);
    if (response?.aoiId && response?.climateData) {
      setAoiClimateData(prev => ({
        ...prev,
        [aoiId || response.aoiId]: {
          temperature: response.climateData.temperature,
          windSpeed: response.climateData.windSpeed,
          rainfall: response.climateData.rainfall,
        },
      }));
    }
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

  // Load and select a saved boundary by ID
  const loadSavedBoundary = async (aoi: SavedAOI) => {
    const L = (window as any).L;
    if (!mapRef.current || !L) return;

    // Clear existing drawings
    drawnShapesRef.current.forEach((shape: any) => {
      if (shape && mapRef.current) {
        mapRef.current.removeLayer(shape);
      }
    });
    drawnShapesRef.current = [];

    // Set as selected
    setSelectedBoundaryId(aoi.id);

    // Calculate measurement (area for polygons, length for lines)
    const measurement = calculateMeasurement(aoi.geojson);
    setSelectedBoundaryDetails({
      name: aoi.name || 'Unnamed Boundary',
      measurement,
      type: aoi.geojson.geometry.type
    });

    const coords = aoi.geojson.geometry.coordinates;
    let shape: any = null;

    if (aoi.geojson.geometry.type === 'LineString') {
      const latLngs = coords.map((c: number[]) => [c[1], c[0]]);
      shape = L.polyline(latLngs, {
        color: '#10b981',
        weight: 3
      }).addTo(mapRef.current);
    } else if (aoi.geojson.geometry.type === 'Polygon') {
      const latLngs = coords[0].map((c: number[]) => [c[1], c[0]]);
      shape = L.polygon(latLngs, {
        color: '#10b981',
        fillColor: '#10b981',
        fillOpacity: 0.2,
        weight: 2
      }).addTo(mapRef.current);
    }

    if (shape) {
      drawnShapesRef.current.push(shape);
      
      // Create mask overlay if in boundary mode
      if (dataFetchMode === 'boundary') {
        createMaskOverlay(shape);
      }

      // Fit map to boundary
      mapRef.current.fitBounds(shape.getBounds());

      // Fetch climate data for this boundary
      await fetchBoundaryData(aoi.geojson, aoi.id);
    }
  };

  // Rename a saved boundary
  const renameBoundary = async (aoiId: string, currentName: string) => {
    const newName = prompt('Enter new name for this boundary:', currentName);
    if (newName && newName !== currentName) {
      const success = await updateAOIName(aoiId, newName);
      if (success) {
        setSavedAOIs(prev => 
          prev.map(aoi => 
            aoi.id === aoiId ? { ...aoi, name: newName } : aoi
          )
        );
      }
    }
  };

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

  // ✅ Set map center to first loaded AOI
  useEffect(() => {
    if (drawnGeoJSON.length > 0 && !initialLat && !initialLon) {
      const firstAOI = drawnGeoJSON[0];
      const coords = firstAOI.geometry.coordinates;
      
      if (firstAOI.geometry.type === 'Point') {
        // Point: [lon, lat]
        setLat(coords[1]);
        setLon(coords[0]);
      } else if (firstAOI.geometry.type === 'LineString' || firstAOI.geometry.type === 'Polygon') {
        // Calculate center
        const flatCoords = firstAOI.geometry.type === 'Polygon' ? coords[0] : coords;
        let sumLat = 0, sumLon = 0;
        flatCoords.forEach((c: number[]) => {
          sumLon += c[0];
          sumLat += c[1];
        });
        const centerLat = sumLat / flatCoords.length;
        const centerLon = sumLon / flatCoords.length;
        setLat(centerLat);
        setLon(centerLon);
      }
    }
  }, [drawnGeoJSON, initialLat, initialLon]);

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
        
       {/* DATA FETCH MODE TOGGLE */}
<div>
  <span className="text-xs font-semibold block mb-2">Data Fetch Mode</span>

  <button
    onClick={() => {
      setDataFetchMode(prev => {
        if (prev === 'boundary') {
          cancelDrawing(); // clean up AOI when leaving boundary mode
          return 'point';
        }
        return 'boundary';
      });
    }}
    className={`w-full px-3 py-2 rounded text-sm font-medium transition-colors
      ${dataFetchMode === 'point'
        ? 'bg-blue-500 text-white hover:bg-blue-600'
        : 'bg-green-500 text-white hover:bg-green-600'}`}
  >
    {dataFetchMode === 'point'
      ? '📍 Live Location'
      : '🗺️ Boundary (AOI)'}
  </button>

  <p className="text-xs text-gray-600 mt-2">
    {dataFetchMode === 'point'
      ? 'Click on map to select a single point'
      : 'Draw a shape to define area of interest'}
  </p>
</div>
        {/* ✅ LOADING STATE */}
        {loadingAOIs && (
          <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded">
            📦 Loading saved boundaries...
          </div>
        )}

        {/* ✅ SAVED AOIS COUNT */}
        {savedAOIs.length > 0 && (
          <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
            ✅ {savedAOIs.length} saved AOI(s) loaded from database
          </div>
        )}

        {/* SINGLE POINT MODE */}
        {dataFetchMode === 'point' && (
          <div className="border-t pt-3">
            <span className="text-xs font-semibold block mb-2">Current Location</span>
            <div className="bg-white p-2 rounded text-xs space-y-1 border border-gray-200">
              <div><span className="text-gray-600">Latitude:</span> <span className="font-mono">{lat.toFixed(6)}</span></div>
              <div><span className="text-gray-600">Longitude:</span> <span className="font-mono">{lon.toFixed(6)}</span></div>
            </div>
          </div>
        )}

        {/* BOUNDARY/AOI MODE */}
        {dataFetchMode === 'boundary' && (
          <div className="border-t pt-3">
            {/* Saved Boundaries Section */}
            {savedAOIs.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-semibold mb-2 flex items-center justify-between">
                  <span>📍 Saved Boundaries ({savedAOIs.length})</span>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1 mb-3">
                  {savedAOIs.map((aoi) => {
                    const measurement = calculateMeasurement(aoi.geojson);
                    const climate = aoiClimateData[aoi.id];
                    return (
                      <div
                        key={aoi.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded text-xs transition-all ${
                          selectedBoundaryId === aoi.id
                            ? 'bg-green-500 text-white shadow-md'
                            : 'bg-gray-50 border border-gray-200'
                        }`}
                      >
                        <button
                          onClick={() => loadSavedBoundary(aoi)}
                          className="flex-1 text-left"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{aoi.name || 'Unnamed Boundary'}</span>
                            <span className="text-[10px] opacity-75">
                              {aoi.geojson.geometry.type}
                            </span>
                          </div>
                          <div className="text-[10px] opacity-75 mt-0.5 flex items-center gap-2">
                            {measurement.type === 'area' && measurement.area && (
                              <span>📐 {measurement.area.acres.toFixed(2)} ac</span>
                            )}
                            <span>📅 {new Date(aoi.created_at).toLocaleDateString()}</span>
                          </div>
                          {climate && (
                            <div className="text-[10px] opacity-90 mt-1 flex items-center gap-3">
                              <span>🌡️ {formatClimate(climate.temperature, '°C')}</span>
                              <span>💨 {formatClimate(climate.windSpeed, ' m/s')}</span>
                              <span>🌧️ {formatClimate(climate.rainfall, ' mm')}</span>
                            </div>
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            renameBoundary(aoi.id, aoi.name || 'Unnamed Boundary');
                          }}
                          className={`px-2 py-1 rounded hover:bg-opacity-80 transition-colors ${
                            selectedBoundaryId === aoi.id
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                          title="Rename boundary"
                        >
                          ✏️
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold">Drawing Tools (AOI)</span>
              {(drawnGeoJSON.length > 0 || savedAOIs.length > 0) && (
                <div className="flex gap-2">
                  <button
                    onClick={clearAllDrawings}
                    className="text-[11px] px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                  >
                    Clear All ({savedAOIs.length} saved)
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
                  Save Orchard 
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