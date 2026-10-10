import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Layers, Maximize2, Crosshair } from 'lucide-react';
import { MAP_CENTER, MAP_DEFAULT_ZOOM } from '../config';
import type { PlotDoc, PlotStatus } from '../types';

interface LeafletMapProps {
  plots?: PlotDoc[];
  plotStatuses?: Record<number, PlotStatus>;
  selectedPlotId?: number;
  highlightPolygon?: [number, number][];
  isDrawing?: boolean;
  onPolygonDrawn?: (points: [number, number][]) => void;
  onPlotClick?: (plotId: number) => void;
  heightClass?: string;
  interactive?: boolean;
  pulsePlotId?: number | null;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  plots = [],
  plotStatuses = {},
  selectedPlotId,
  highlightPolygon,
  isDrawing = false,
  onPolygonDrawn,
  onPlotClick,
  heightClass = 'h-96',
  interactive = true,
  pulsePlotId = null,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{
    tileLayer: L.TileLayer | null;
    polygonsGroup: L.FeatureGroup | null;
    drawGroup: L.FeatureGroup | null;
  }>({
    tileLayer: null,
    polygonsGroup: null,
    drawGroup: null,
  });

  const [tileMode, setTileMode] = useState<'satellite' | 'street'>('satellite');
  const drawnPointsRef = useRef<[number, number][]>([]);
  const [drawnCount, setDrawnCount] = useState(0);

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: MAP_CENTER,
      zoom: MAP_DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: false,
    });
    mapRef.current = map;

    // Default satellite layer (Google Hybrid Satellite)
    const satTile = L.tileLayer(
      'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      { maxZoom: 21, maxNativeZoom: 19 }
    );
    satTile.addTo(map);
    layersRef.current.tileLayer = satTile;

    const polyGroup = L.featureGroup().addTo(map);
    layersRef.current.polygonsGroup = polyGroup;

    const drawGroup = L.featureGroup().addTo(map);
    layersRef.current.drawGroup = drawGroup;

    // Size invalidation after CSS animation finishes
    const timer1 = setTimeout(() => map.invalidateSize({ pan: false }), 200);
    const timer2 = setTimeout(() => map.invalidateSize({ pan: false }), 600);

    const observer = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
    });
    observer.observe(containerRef.current);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Toggle Tiles
  const toggleTileMode = () => {
    const map = mapRef.current;
    if (!map) return;

    if (layersRef.current.tileLayer) {
      map.removeLayer(layersRef.current.tileLayer);
    }

    if (tileMode === 'satellite') {
      const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);
      layersRef.current.tileLayer = street;
      setTileMode('street');
    } else {
      const sat = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 21,
        maxNativeZoom: 19,
      }).addTo(map);
      layersRef.current.tileLayer = sat;
      setTileMode('satellite');
    }
  };

  // Handle Drawing Mode Click
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (!isDrawing) return;
      const pt: [number, number] = [e.latlng.lat, e.latlng.lng];
      const next = [...drawnPointsRef.current, pt];
      drawnPointsRef.current = next;
      setDrawnCount(next.length);

      // Render marker on click
      if (layersRef.current.drawGroup) {
        const marker = L.circleMarker([pt[0], pt[1]], {
          radius: 6,
          fillColor: '#10b981',
          color: '#ffffff',
          weight: 2,
          fillOpacity: 0.9,
        });
        layersRef.current.drawGroup.addLayer(marker);

        if (next.length >= 3) {
          // Draw temporary polygon
          const poly = L.polygon(next, {
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.25,
            weight: 2,
            dashArray: '4,4',
          });
          layersRef.current.drawGroup.addLayer(poly);
        }
      }

      if (next.length === 4) {
        if (onPolygonDrawn) {
          onPolygonDrawn(next);
        }
      }
    };

    if (isDrawing) {
      map.on('click', handleClick);
    } else {
      map.off('click', handleClick);
    }

    return () => {
      map.off('click', handleClick);
    };
  }, [isDrawing, onPolygonDrawn]);

  // Clear drawing on exit
  useEffect(() => {
    if (!isDrawing) {
      drawnPointsRef.current = [];
      setDrawnCount(0);
      layersRef.current.drawGroup?.clearLayers();
    }
  }, [isDrawing]);

  // Render Polygons (Cadastre Grid or Single Selected Plot)
  useEffect(() => {
    const map = mapRef.current;
    const group = layersRef.current.polygonsGroup;
    if (!map || !group) return;

    group.clearLayers();

    // 1. If explicit highlight polygon is provided (e.g. single plot page)
    if (highlightPolygon && highlightPolygon.length >= 3) {
      const status = selectedPlotId ? plotStatuses[selectedPlotId] || 'clear' : 'clear';
      const color =
        status === 'disputed_frozen' ? '#ef4444' : status === 'sale_pending' ? '#f59e0b' : '#10b981';

      const poly = L.polygon(highlightPolygon, {
        color: color,
        weight: 3.5,
        fillColor: color,
        fillOpacity: 0.35,
      });

      // Add vertex dots
      highlightPolygon.forEach(([lat, lng], i) => {
        const dot = L.circleMarker([lat, lng], {
          radius: 5,
          color: '#ffffff',
          weight: 1.5,
          fillColor: color,
          fillOpacity: 1,
        });
        dot.bindTooltip(`Vertex #${i + 1}<br/>${lat.toFixed(6)}, ${lng.toFixed(6)}`, {
          direction: 'top',
        });
        group.addLayer(dot);
      });

      group.addLayer(poly);

      try {
        const bounds = poly.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
        }
      } catch (e) {}
      return;
    }

    // 2. Multi-plot cadastre display
    if (plots.length > 0) {
      plots.forEach((p) => {
        if (!p.polygon || p.polygon.length < 3) return;

        const status = plotStatuses[p.id] || 'clear';
        const isSelected = selectedPlotId === p.id;
        const isPulsing = pulsePlotId === p.id;

        const color =
          status === 'disputed_frozen' ? '#ef4444' : status === 'sale_pending' ? '#f59e0b' : '#10b981';

        const poly = L.polygon(p.polygon, {
          color: isSelected ? '#ffffff' : color,
          weight: isSelected ? 3.5 : isPulsing ? 3.5 : 2,
          fillColor: color,
          fillOpacity: isSelected ? 0.5 : 0.28,
        });

        const statusLabel =
          status === 'disputed_frozen'
            ? 'Disputed · Frozen'
            : status === 'sale_pending'
            ? 'Sale Pending Escrow'
            : 'Clear Title';

        poly.bindTooltip(
          `<div class="p-1 text-xs">
            <strong class="text-sm font-bold block">Plot #${p.id} (Survey ${p.surveyNo})</strong>
            <span class="text-slate-500">${p.village} · ${p.areaSqm} m²</span>
            <div class="mt-1 font-semibold" style="color: ${color}">${statusLabel}</div>
          </div>`,
          { direction: 'top', sticky: true }
        );

        if (interactive) {
          poly.on('click', () => {
            if (onPlotClick) {
              onPlotClick(p.id);
            }
          });
        }

        group.addLayer(poly);
      });

      try {
        const bounds = group.getBounds();
        if (bounds.isValid() && (!selectedPlotId || !highlightPolygon)) {
          map.fitBounds(bounds, { padding: [30, 30] });
        }
      } catch (e) {}
    }
  }, [plots, plotStatuses, selectedPlotId, highlightPolygon, pulsePlotId, interactive, onPlotClick]);

  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    map.setView(MAP_CENTER, MAP_DEFAULT_ZOOM);
  };

  return (
    <div className={`relative w-full ${heightClass} rounded-2xl overflow-hidden border border-slate-800 shadow-xl bg-slate-950`}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Floating Map Controls */}
      <div className="absolute top-3 left-3 z-[400] flex items-center space-x-2">
        <button
          onClick={toggleTileMode}
          className="bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/70 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-lg transition"
          title="Toggle Satellite / Street Map"
        >
          <Layers className="w-3.5 h-3.5 text-emerald-400" />
          <span>{tileMode === 'satellite' ? 'Satellite 🛰️' : 'Street Map 🗺️'}</span>
        </button>
      </div>

      <div className="absolute top-3 right-3 z-[400] flex items-center space-x-2">
        <button
          onClick={recenter}
          className="bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/70 backdrop-blur-md p-2 rounded-xl text-xs shadow-lg transition"
          title="Recenter Map"
        >
          <Crosshair className="w-4 h-4 text-slate-300" />
        </button>
      </div>

      {isDrawing && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[400] bg-slate-900/95 border border-emerald-500/50 backdrop-blur-md px-4 py-2 rounded-xl shadow-2xl text-xs text-white flex items-center space-x-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span>
            Surveying: Click 4 corners on the satellite map ({drawnCount}/4 vertices placed)
          </span>
          {drawnCount > 0 && (
            <button
              onClick={() => {
                drawnPointsRef.current = [];
                setDrawnCount(0);
                layersRef.current.drawGroup?.clearLayers();
              }}
              className="text-xs text-red-400 hover:underline font-mono ml-2"
            >
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
};
