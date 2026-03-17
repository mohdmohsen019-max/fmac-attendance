import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB-mUHApk_20yRJsQEKs9--VhZmXpkE3EM",
  authDomain: "fmac-attendance.firebaseapp.com",
  projectId: "fmac-attendance",
  storageBucket: "fmac-attendance.firebasestorage.app",
  messagingSenderId: "79220864890",
  appId: "1:79220864890:web:37c7b292be4cdf5e1288c3",
  measurementId: "G-V89EG3S24N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

// Initialize Firebase Authentication
const auth = getAuth(app);

export { db, auth };
