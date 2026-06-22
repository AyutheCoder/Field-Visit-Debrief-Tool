import { Fragment, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { DensityPoint } from '../lib/insights';

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useMemo(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 9);
    else map.fitBounds(points, { padding: [40, 40] });
  }, [map, points]);
  return null;
}

/**
 * Issue-density heatmap. Each location renders layered translucent circles whose
 * size and opacity scale with the number of blockers logged there, producing a
 * heat-blob effect without an extra plugin. When a pattern is selected, its
 * contributing locations are highlighted.
 */
export default function HeatMapPanel({
  points,
  highlightActive,
  onSelect,
}: {
  points: DensityPoint[];
  highlightActive: boolean;
  onSelect?: (point: DensityPoint) => void;
}) {
  const located = points.filter((p) => p.weight > 0);
  const coords = located.map((p) => [p.lat, p.lng] as [number, number]);
  const center: [number, number] = coords[0] ?? [-1.9, 30.05];
  const maxWeight = Math.max(1, ...located.map((p) => p.weight));

  return (
    <div className="h-80 overflow-hidden rounded-2xl ring-1 ring-gray-100">
      {located.length === 0 ? (
        <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-400">
          No issues to map.
        </div>
      ) : (
        <MapContainer center={center} zoom={7} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds points={coords} />
          {located.map((p) => {
            const intensity = p.weight / maxWeight; // 0..1
            const isHot = highlightActive && p.highlightWeight > 0;
            const dimmed = highlightActive && p.highlightWeight === 0;
            const base = 14 + intensity * 26; // px radius for the outer blob
            const color = isHot ? '#b91c1c' : '#dc2626';
            const latlng: [number, number] = [p.lat, p.lng];

            return (
              <Fragment key={`${p.lat},${p.lng}`}>
                {/* Outer, faint glow */}
                <CircleMarker
                  center={latlng}
                  radius={base}
                  pathOptions={{
                    stroke: false,
                    fillColor: color,
                    fillOpacity: (dimmed ? 0.08 : 0.18) + intensity * 0.12,
                  }}
                />
                {/* Inner, denser core with the interactive popup */}
                <CircleMarker
                  center={latlng}
                  radius={base * 0.55}
                  pathOptions={{
                    stroke: isHot,
                    color: '#7f1d1d',
                    weight: isHot ? 2 : 0,
                    fillColor: color,
                    fillOpacity: (dimmed ? 0.12 : 0.32) + intensity * 0.2,
                  }}
                >
                  <Popup>
                    <div className="space-y-1">
                      <p className="font-semibold">{p.locationName}</p>
                      <p className="text-xs text-gray-500">
                        {p.weight} blocker{p.weight === 1 ? '' : 's'} · {p.visitIds.length} visit{p.visitIds.length === 1 ? '' : 's'}
                      </p>
                      {onSelect && (
                        <button
                          onClick={() => onSelect(p)}
                          className="mt-1 rounded bg-brand-600 px-2 py-1 text-xs font-semibold text-white"
                        >
                          View visits
                        </button>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              </Fragment>
            );
          })}
        </MapContainer>
      )}
    </div>
  );
}
