/**
 * Haversine Geolocation Utility
 *
 * Provides distance calculation between two GPS coordinates
 * using the Haversine formula — the standard for spherical earth calculations.
 *
 * The formula accounts for Earth's curvature and gives accurate results
 * for distances up to thousands of kilometers. For the 100m geofence check,
 * this is more than precise enough.
 *
 * Reference: https://en.wikipedia.org/wiki/Haversine_formula
 */

/**
 * Earth's radius in meters.
 * The WGS-84 mean radius provides the best general-purpose accuracy.
 */
const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Converts degrees to radians.
 * JavaScript's Math functions work in radians.
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculates the great-circle distance between two GPS coordinates
 * using the Haversine formula.
 *
 * @param lat1 - Latitude of point 1 (decimal degrees)
 * @param lon1 - Longitude of point 1 (decimal degrees)
 * @param lat2 - Latitude of point 2 (decimal degrees)
 * @param lon2 - Longitude of point 2 (decimal degrees)
 * @returns Distance between the two points in meters
 *
 * @example
 *   const officeLat = 37.7749, officeLon = -122.4194;
 *   const userLat = 37.7750, userLon = -122.4190;
 *   const distance = calculateDistance(officeLat, officeLon, userLat, userLon);
 *   if (distance > 100) {
 *     console.log(`User is ${distance.toFixed(1)}m away — outside geofence`);
 *   }
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  // Haversine formula:
  // a = sin²(Δlat/2) + cos(lat1) · cos(lat2) · sin²(Δlon/2)
  // c = 2 · atan2(√a, √(1−a))
  // d = R · c

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Checks whether a given GPS position is within the office geofence.
 *
 * @param userLat - User's current latitude
 * @param userLon - User's current longitude
 * @param officeLat - Office latitude (default: San Francisco 37.7749)
 * @param officeLon - Office longitude (default: -122.4194)
 * @param radiusMeters - Geofence radius in meters (default: 100)
 * @returns true if the user is within the geofence radius
 */
export function isWithinGeofence(
  userLat: number,
  userLon: number,
  officeLat: number = 37.7749,
  officeLon: number = -122.4194,
  radiusMeters: number = 100,
): boolean {
  const distance = calculateDistance(userLat, userLon, officeLat, officeLon);
  return distance <= radiusMeters;
}

/**
 * Returns a human-readable string for the distance from the office.
 *
 * @example
 *   formatDistanceFromOffice(37.7750, -122.4190) => "85.3 m from office"
 *   formatDistanceFromOffice(37.78, -122.42) => "0.6 km from office"
 */
export function formatDistanceFromOffice(
  userLat: number,
  userLon: number,
  officeLat: number = 37.7749,
  officeLon: number = -122.4194,
): string {
  const distanceMeters = calculateDistance(userLat, userLon, officeLat, officeLon);

  if (distanceMeters < 1000) {
    return `${distanceMeters.toFixed(1)} m from office`;
  } else {
    return `${(distanceMeters / 1000).toFixed(2)} km from office`;
  }
}

export type GeofenceSite = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

/**
 * Returns the nearest site the user is inside, or null if outside all sites.
 */
export function findMatchingGeofence(
  userLat: number,
  userLon: number,
  sites: GeofenceSite[],
): GeofenceSite | null {
  let best: { site: GeofenceSite; distance: number } | null = null;
  for (const site of sites) {
    const distance = calculateDistance(
      userLat,
      userLon,
      site.latitude,
      site.longitude,
    );
    if (distance <= site.radiusMeters) {
      if (!best || distance < best.distance) {
        best = { site, distance };
      }
    }
  }
  return best?.site ?? null;
}
