import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, deleteDoc } from "firebase/firestore";
import xlsx from 'xlsx';

const firebaseConfig = {
  apiKey: "AIzaSyB-mUHApk_20yRJsQEKs9--VhZmXpkE3EM",
  authDomain: "fmac-attendance.firebaseapp.com",
  projectId: "fmac-attendance",
  storageBucket: "fmac-attendance.firebasestorage.app",
  messagingSenderId: "79220864890",
  appId: "1:79220864890:web:37c7b292be4cdf5e1288c3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    console.log("Checking DB access...");
    const snap = await getDocs(collection(db, "players_v2"));
    console.log(`Successfully read ${snap.size} docs from players_v2`);
    console.log("Access is OPEN in Node!");
  } catch (e) {
    console.error("DB Access failed:", e.message);
  }
}

run();
