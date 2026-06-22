import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { VisitWithRelations } from '../types';
import { sentimentColor } from '../lib/dashboard';

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useMemo(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 9);
    } else {
      map.fitBounds(points, { padding: [40, 40] });
    }
  }, [map, points]);
  return null;
}

export default function MapPanel({
  visits,
  onSelect,
}: {
  visits: VisitWithRelations[];
  onSelect: (visit: VisitWithRelations) => void;
}) {
  const located = visits.filter(
    (v): v is VisitWithRelations & { lat: number; lng: number } =>
      v.lat != null && v.lng != null
  );

  const points = located.map((v) => [v.lat, v.lng] as [number, number]);
  const center: [number, number] = points[0] ?? [-1.0, 36.85];

  return (
    <div className="h-80 overflow-hidden rounded-2xl ring-1 ring-gray-100">
      {located.length === 0 ? (
        <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-400">
          No geolocated visits to map.
        </div>
      ) : (
        <MapContainer center={center} zoom={7} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds points={points} />
          {located.map((v) => {
            const color = sentimentColor(v.debrief?.sentimentLabel);
            return (
              <CircleMarker
                key={v.id}
                center={[v.lat, v.lng]}
                radius={10}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.7, weight: 2 }}
              >
                <Popup>
                  <div className="space-y-1">
                    <p className="font-semibold">{v.locationName}</p>
                    <p className="text-xs text-gray-500">
                      {v.programArea}
                      {v.debrief?.sentimentLabel ? ` · ${v.debrief.sentimentLabel}` : ''}
                    </p>
                    <button
                      onClick={() => onSelect(v)}
                      className="mt-1 rounded bg-brand-600 px-2 py-1 text-xs font-semibold text-white"
                    >
                      View debrief
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      )}
    </div>
  );
}
