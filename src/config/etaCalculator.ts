// utils/etaCalculator.ts

import { IVehicle } from "../models/vechicle.model";


// Haversine formula to calculate distance between two coordinates
const calculateDistance = (point1: { lat: number; lng: number }, point2: { lat: number; lng: number }): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLng = (point2.lng - point1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Find the nearest route stop to the current location
const findNearestStop = (vehicle: IVehicle, currentLocation: { lat: number; lng: number }) => {
  if (!vehicle.route || vehicle.route.length === 0) return null;
  
  let nearestStop = vehicle.route[0];
  let minDistance = calculateDistance(currentLocation, {
    lat: nearestStop.lat || 0,
    lng: nearestStop.lng || 0
  });
  
  for (const stop of vehicle.route) {
    if (!stop.lat || !stop.lng) continue;
    
    const distance = calculateDistance(currentLocation, { lat: stop.lat, lng: stop.lng });
    if (distance < minDistance) {
      minDistance = distance;
      nearestStop = stop;
    }
  }
  
  return { stop: nearestStop, distance: minDistance };
};

// Calculate remaining distance to destination
const calculateRemainingDistance = (vehicle: IVehicle, currentLocation: { lat: any; lng: any }) => {
  if (!vehicle.route || vehicle.route.length === 0) {
    // Fallback: direct distance to destination
    return calculateDistance(currentLocation, {
      lat : vehicle.destination || 0,
      lng: vehicle.destination || 0
    });
  }
  
  const destination = vehicle.route[vehicle.route.length - 1];
  if (!destination.lat || !destination.lng) {
    return calculateDistance(currentLocation, {
      lat: vehicle.destination || 0,
      lng: vehicle.destination || 0
    });
  }
  
  const nearestStopInfo = findNearestStop(vehicle, currentLocation);
  if (!nearestStopInfo) {
    return calculateDistance(currentLocation, {
      lat: destination.lat,
      lng: destination.lng
    });
  }
  
  // Calculate distance from nearest stop to destination
  let distanceFromStopToDestination = 0;
  const nearestStopIndex = vehicle.route.findIndex(stop => stop.stopName === nearestStopInfo.stop.stopName);
  
  if (nearestStopIndex >= 0) {
    for (let i = nearestStopIndex; i < vehicle.route.length - 1; i++) {
      const currentStop = vehicle.route[i];
      const nextStop = vehicle.route[i + 1];
      
      if (currentStop.lat && currentStop.lng && nextStop.lat && nextStop.lng) {
        distanceFromStopToDestination += calculateDistance(
          { lat: currentStop.lat, lng: currentStop.lng },
          { lat: nextStop.lat, lng: nextStop.lng }
        );
      }
    }
  }
  
  return nearestStopInfo.distance + distanceFromStopToDestination;
};

// Calculate ETA considering multiple factors
export const calculateETA = (vehicle: IVehicle) => {
  if (!vehicle.currentLocation) {
    throw new Error('Current location is required for ETA calculation');
  }
  
  const { currentLocation, departureAt, delayMinutes = 0 } = vehicle;
  
  // Calculate remaining distance
  const remainingDistance = calculateRemainingDistance(vehicle, currentLocation);
  
  // Determine average speed (use current speed if available, otherwise use historical average)
  let averageSpeed = 40; // Default average speed in km/h
  if (currentLocation.speedKmph && currentLocation.speedKmph > 0) {
    averageSpeed = currentLocation.speedKmph;
  }
  
  // Adjust speed based on traffic conditions (simplified)
  const trafficFactor = getTrafficFactor(); // Could be based on time of day, real-time data, etc.
  const adjustedSpeed = averageSpeed * trafficFactor;
  
  // Calculate time to destination in hours
  const timeToDestinationHours = remainingDistance / adjustedSpeed;
  
  // Calculate base ETA from departure time and journey duration
  const departureTime = new Date(departureAt).getTime();
  const scheduledJourneyTime = (new Date(vehicle.arrivalAt).getTime() - departureTime) / (1000 * 60 * 60);
  
  // If we have more accurate data from GPS, use it
  const currentTime = new Date().getTime();
  const estimatedTimeToDestinationMs = timeToDestinationHours * 60 * 60 * 1000;
  const eta = new Date(currentTime + estimatedTimeToDestinationMs + (delayMinutes * 60 * 1000));
  
  const minutesToArrival = Math.max(0, Math.round((eta.getTime() - currentTime) / (1000 * 60)));
  
  // Calculate how delayed the vehicle is compared to schedule
  const scheduledArrivalTime = new Date(vehicle.arrivalAt).getTime();
  const scheduledMinutesToArrival = Math.round((scheduledArrivalTime - currentTime) / (1000 * 60));
  const delayedBy = Math.max(0, minutesToArrival - scheduledMinutesToArrival);
  
  return { eta, minutesToArrival, delayedBy };
};

// Simplified traffic factor (could be enhanced with real-time traffic data)
const getTrafficFactor = (): number => {
  const now = new Date();
  const hour = now.getHours();
  
  // Rush hours: 7-10 AM and 4-7 PM
  if ((hour >= 7 && hour < 10) || (hour >= 16 && hour < 19)) {
    return 0.6; // 40% slower
  }
  
  // Night time: 10 PM - 5 AM
  if (hour >= 22 || hour < 5) {
    return 1.2; // 20% faster
  }
  
  return 1; // Normal speed
};