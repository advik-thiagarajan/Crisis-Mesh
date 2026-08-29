import { SOSReport } from '../utils/types';

export interface RoutePoint {
  sos: SOSReport;
  distance: number;
  index: number;
}

export const haversineDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const optimizeRoute = (
  rescuerLat: number,
  rescuerLng: number,
  sosReports: SOSReport[],
  maxStops: number = 5
): RoutePoint[] => {
  if (sosReports.length === 0) return [];

  const route: RoutePoint[] = [];
  let currentLat = rescuerLat;
  let currentLng = rescuerLng;
  let index = 1;

  const criticals = sosReports.filter((s) => s.priority === 'CRITICAL');
  const veryHighs = sosReports.filter((s) => s.priority === 'VERY HIGH');
  const highs = sosReports.filter((s) => s.priority === 'HIGH');
  const mediums = sosReports.filter((s) => s.priority === 'MEDIUM');
  const lows = sosReports.filter((s) => s.priority === 'LOW');

  for (const priorityGroup of [criticals, veryHighs, highs, mediums, lows]) {
    if (route.length >= maxStops) break;

    const unvisited = [...priorityGroup];

    while (unvisited.length > 0 && route.length < maxStops) {
      let nearestIdx = -1;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const dist = haversineDistance(
          currentLat,
          currentLng,
          unvisited[i].lat,
          unvisited[i].lng
        );
        if (dist < minDistance) {
          minDistance = dist;
          nearestIdx = i;
        }
      }

      if (nearestIdx !== -1) {
        const [chosen] = unvisited.splice(nearestIdx, 1);
        const legDistance = haversineDistance(
          currentLat,
          currentLng,
          chosen.lat,
          chosen.lng
        );

        route.push({
          sos: chosen,
          distance: parseFloat(legDistance.toFixed(2)),
          index: index++,
        });

        currentLat = chosen.lat;
        currentLng = chosen.lng;
      }
    }
  }

  return route;
};

export const getNearestSOS = (
  lat: number,
  lng: number,
  sosReports: SOSReport[]
): SOSReport | null => {
  if (sosReports.length === 0) return null;

  let nearest = sosReports[0];
  let minDistance = haversineDistance(lat, lng, nearest.lat, nearest.lng);

  for (const sos of sosReports) {
    const distance = haversineDistance(lat, lng, sos.lat, sos.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = sos;
    }
  }

  return nearest;
};

export const getSOSWithinRadius = (
  lat: number,
  lng: number,
  radiusKm: number,
  sosReports: SOSReport[]
): SOSReport[] => {
  return sosReports.filter((sos) => {
    const distance = haversineDistance(lat, lng, sos.lat, sos.lng);
    return distance <= radiusKm;
  });
};

export const formatDistance = (km: number): string => {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(2)}km`;
};

export const calculateRouteTotalDistance = (
  route: RoutePoint[],
  startLat?: number,
  startLng?: number
): number => {
  if (route.length === 0) return 0;

  let total = 0;
  let prevLat = startLat ?? route[0].sos.lat;
  let prevLng = startLng ?? route[0].sos.lng;

  for (const point of route) {
    total += haversineDistance(
      prevLat,
      prevLng,
      point.sos.lat,
      point.sos.lng
    );
    prevLat = point.sos.lat;
    prevLng = point.sos.lng;
  }

  return parseFloat(total.toFixed(2));
};