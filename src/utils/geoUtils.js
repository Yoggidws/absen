/**
 * Utility functions for geolocation
 */

/**
 * Calculate distance between two points using Haversine formula
 * @param {Object} location1 - First location with latitude and longitude
 * @param {Object} location2 - Second location with latitude and longitude
 * @returns {number} Distance in meters
 */
exports.calculateDistance = (location1, location2) => {
  const toRad = (value) => (value * Math.PI) / 180

  const R = 6371e3 // Earth's radius in meters
  const φ1 = toRad(location1.latitude)
  const φ2 = toRad(location2.latitude)
  const Δφ = toRad(location2.latitude - location1.latitude)
  const Δλ = toRad(location2.longitude - location1.longitude)

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

/**
 * Check if a location is within the allowed radius
 * @param {Object} userLocation - User's location with latitude and longitude
 * @param {number} officeLat - Office latitude
 * @param {number} officeLng - Office longitude
 * @param {number} maxDistance - Maximum allowed distance in meters
 * @returns {boolean} True if location is valid
 */
exports.isLocationValid = (userLocation, officeLat, officeLng, maxDistance) => {
  const officeLocation = {
    latitude: officeLat,
    longitude: officeLng,
  }

  const distance = this.calculateDistance(userLocation, officeLocation)

  return distance <= maxDistance
}
