// Firebase web config for the tapescope project (owner's Firebase, Spark plan).
// These values are public by design: every visitor's browser downloads them, so
// they can't be hidden (moving them out of git would only break the site). Access
// is controlled by sign-in and by firestore.rules. The API key is locked down in
// Google Cloud Console instead: HTTP referrers limited to the site's own addresses,
// and APIs limited to the ones Firebase Auth and Firestore use. If a new key is
// ever made, restrict it the same way before putting it here.
export const firebaseConfig = {
  apiKey: 'AIzaSyDFvG50Qy0xZfdNt3hEyHRW5guR8RHhbIY',
  authDomain: 'tapescope-a26f3.firebaseapp.com',
  projectId: 'tapescope-a26f3',
  storageBucket: 'tapescope-a26f3.firebasestorage.app',
  messagingSenderId: '605709302930',
  appId: '1:605709302930:web:81168467f4b14169bdba4b',
};
