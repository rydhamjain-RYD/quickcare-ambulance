/**
 * Test mode: for whoever is trying the app out. It is off unless NEXT_PUBLIC_TEST_MODE=on is set
 * (it is set in .env.local on a developer's machine only, never in the shared code or a live site).
 *
 * When on, the officer and hospital logins come pre-filled with the sample accounts, the route
 * planner opens with a ready trip, and a few quick picks and speed controls appear. When off,
 * none of this exists and the app looks and behaves like the real product.
 */
export const TEST_MODE = process.env.NEXT_PUBLIC_TEST_MODE === "on";

// Same accounts as data/officers.json and data/hospital-staff.json.
export const TEST_OFFICERS = [
  { badge: "BLR-TP-1001", pin: "4821", name: "Ravi Kumar" },
  { badge: "BLR-TP-1002", pin: "7305", name: "Anitha Gowda" },
  { badge: "BLR-TP-1003", pin: "1948", name: "Suresh Naik" },
  { badge: "BLR-TP-1004", pin: "6612", name: "Meena Reddy" },
  { badge: "BLR-TP-1005", pin: "2753", name: "Imran Sheikh" },
  { badge: "BLR-TP-1006", pin: "9036", name: "Lakshmi Devi" },
  { badge: "BLR-TP-1007", pin: "4417", name: "Prakash Hegde" },
  { badge: "BLR-TP-1008", pin: "5582", name: "Divya Nair" },
  { badge: "BLR-TP-1009", pin: "8890", name: "Mohan Raj" },
  { badge: "BLR-TP-1010", pin: "3361", name: "Farah Khan" },
];

// Hospital logins are not listed here: /api/hospital/test-accounts supplies them (and, in test mode,
// creates one on the spot for any hospital a driver picks that has no account yet).

// The trip the route planner opens with in test mode: Jayanagar 4th Block to Manipal Hospital (about 12 km, 18 signals).
export const TEST_TRIP = {
  pickup: { name: "Jayanagar 4th Block", lat: 12.9265737, lng: 77.5835041 },
  hospital: { id: "manipal-old-airport", name: "Manipal Hospital, Old Airport Road", lat: 12.959846, lng: 77.649214, source: "saved" },
};
