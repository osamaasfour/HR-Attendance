# HR Attendance App — Setup & Run Guide

## Prerequisites

1. **Node.js** v18+ installed
2. **Expo CLI**: `npm install -g expo-cli`
3. **Firebase Project**: Create one at [Firebase Console](https://console.firebase.google.com/)
4. **Firebase Web App**: Add a Web App in Firebase Project Settings to get API keys
5. **Android Studio** (for Android testing) OR **Xcode** (for iOS testing)

---

## Quick Start

### 1. Install Dependencies

```bash
cd hr-attendance-app
npm install
```

### 2. Configure Firebase

Open `.env` and replace the placeholder values with your Firebase credentials:

```
FIREBASE_API_KEY=AIzaSy...
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abcdef
```

### 3. Start Development Server

```bash
npx expo start
```

This opens the Expo DevTools at `http://localhost:8081`. From there:
- Press `a` for Android emulator
- Press `i` for iOS simulator
- Press `w` for web

---

## Android Testing

### Using Android Studio Emulator

```bash
# Make sure an emulator is running in Android Studio
# Then:
npx expo start --android

# OR run on a physical device via adb:
adb reverse tcp:8081 tcp:8081
npx expo start
# Scan the QR code in Expo Go app
```

### Enable Biometrics on Android Emulator

1. Open Settings → Security → Face/Fingerprint unlock
2. Set up a PIN first, then enroll a fingerprint
3. Use "Virtual fingerprint sensor" option in emulator Extended Controls (… → Fingerprint)

---

## iOS Testing

### Using Xcode Simulator

```bash
npx expo start --ios
```

### Enable Face ID on iOS Simulator

1. Open Simulator → Features → Face ID → Enrolled
2. When Face ID is triggered during the app, choose "Matching Face" or "Non-matching Face"

### Touch ID on Simulator

1. Simulator → Features → Touch ID → Enrolled

---

## Testing Geofence Logic

The office is set at **San Francisco** (37.7749, -122.4194) with a **100m radius**.

### Option A: Physical Testing (in SF)
Walk to the office location and test — the GPS will detect you're within range.

### Option B: Simulate Location (Emulator)

**Android Emulator:**
1. Open Extended Controls (… icon) → Location
2. Set lat: 37.7749, lon: -122.4194 → "Set Location"
3. Test clock in — should succeed
4. Set lat: 37.78, lon: -122.42 → "Set Location"
5. Test clock in — should fail ("outside premises")

**iOS Simulator:**
1. Features → Location → Custom Location
2. Enter lat: 37.7749, lon: -122.4194
3. Test clock in

### Option C: Override Office Coordinates in `.env`
```
OFFICE_LATITUDE=37.7749
OFFICE_LONGITUDE=-122.4194
GEOFENCE_RADIUS_METERS=100
```

---

## Firebase Firestore Setup

### 1. Enable Firestore
1. Firebase Console → Build → Firestore Database
2. Click "Create Database"
3. Choose "Start in test mode" (we'll add rules later)
4. Select a location closest to your users

### 2. Set Security Rules
Copy the rules from `FIRESTORE_RULES.js` and paste them in:
Firebase Console → Firestore Database → Rules → Publish

### 3. Create Composite Indexes
Firebase Console → Firestore Database → Indexes → Create these:
- attendance: `userId` (Asc) + `date` (Desc)
- attendance: `userId` (Asc) + `date` (Asc)
- attendance: `date` (Asc)

Or let the app create them automatically — when a query runs that needs an index,
Firebase will print a direct link in the console error message. Click it to auto-create.

---

## Creating an Admin User

After signing up a new employee, you need to manually promote them to admin:

1. Firebase Console → Firestore Database → users collection
2. Find the user document by UID
3. Change the `role` field from `"employee"` to `"admin"`
4. The app will automatically route them to the Admin Dashboard on next login

---

## Troubleshooting

### "Cannot find module '@env'"
→ Run `npm install` and make sure `react-native-dotenv` is in package.json

### Biometric error on simulator
→ Enroll biometrics first in the simulator settings (see iOS/Android sections above)

### Location permission denied
→ Delete the app and reinstall, or go to device Settings → Apps → HR Attendance → Permissions → Location

### "FIREBASE_API_KEY is undefined"
→ Make sure `.env` file exists and has real values. Restart the dev server after editing.

### NativeWind className not working
→ Run `npx expo start -c` to clear cache and restart.

---

## Project Structure

```
hr-attendance-app/
├── .env                      # Firebase config & app constants
├── .gitignore
├── app.json                  # Expo configuration
├── babel.config.js           # Babel with NativeWind & path aliases
├── index.js                  # Entry point
├── metro.config.js           # Metro bundler config
├── package.json
├── tailwind.config.js        # TailwindCSS theme (custom colors)
├── tsconfig.json
├── nativewind-env.d.ts       # TypeScript NativeWind declarations
├── global.css                # TailwindCSS directives
├── FIRESTORE_RULES.js        # Copy-paste Firestore rules
├── SETUP_GUIDE.md            # This file
└── src/
    ├── App.tsx               # Root component with providers
    ├── constants/
    │   └── theme.ts          # Colors, geofence values, biometric prompts
    ├── context/
    │   └── AuthContext.tsx    # Global auth state (login/signup/logout)
    ├── hooks/
    │   ├── useAttendance.ts  # Clock in/out logic (biometric + GPS + Firestore)
    │   └── useAdminData.ts   # Admin dashboard data aggregation
    ├── navigation/
    │   ├── RootNavigator.tsx  # Role-based routing (auth → employee/admin)
    │   ├── EmployeeTabs.tsx   # Bottom tabs: Home, History, Profile
    │   └── AdminTabs.tsx      # Bottom tabs: Overview, Records
    ├── screens/
    │   ├── Login.tsx          # Email/password login
    │   ├── Signup.tsx         # New employee registration
    │   ├── employee/
    │   │   ├── Home.tsx       # Clock In/Out button + live clock
    │   │   ├── History.tsx    # Last 30 attendance records
    │   │   └── Profile.tsx    # User info + logout
    │   └── admin/
    │       ├── Overview.tsx  # Stats cards + employee status list
    │       └── AllRecords.tsx # Today's attendance for all
    ├── services/
    │   └── firebase.ts       # Firebase initialization + Firestore refs
    ├── types/
    │   └── index.ts           # TypeScript interfaces (User, AttendanceRecord, etc.)
    └── utils/
        ├── geo.ts            # Haversine formula + geofence validation
        ├── time.ts           # Date formatting + duration calculation
        └── offlineSync.ts    # AsyncStorage offline punch queue
```

---

## Build for Production

### Android APK
```bash
eas build --platform android --profile preview
```

### iOS IPA
```bash
eas build --platform ios --profile preview
```

### Install EAS CLI first:
```bash
npm install -g eas-cli
eas login
```
