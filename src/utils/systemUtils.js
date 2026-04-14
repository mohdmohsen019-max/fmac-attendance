import { db } from '../firebase';
import { collection, getDocs, writeBatch } from 'firebase/firestore';

/**
 * Deletes all documents in a specific collection.
 */
export const clearCollection = async (collectionName) => {
  try {
    const q = collection(db, collectionName);
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => {
      batch.delete(d.ref);
    });
    
    await batch.commit();
    console.log(`Successfully cleared collection: ${collectionName}`);
  } catch (error) {
    console.error(`Error clearing collection ${collectionName}:`, error);
    throw error;
  }
};

/**
 * Specifically clears the attendance_logs collection (History & Analytics).
 */
export const clearAttendanceHistory = async () => {
  await clearCollection("attendance_logs");
};

/**
 * Resets all players to 'absent' status for Today's Attendance.
 * This also clears their transportation for the current session.
 */
export const resetDailyAttendanceStatus = async () => {
  try {
    const q = collection(db, "players_v2");
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => {
      batch.update(d.ref, { 
        status: 'absent', 
        transportation: '',
        lastActionDate: '' 
      });
    });
    
    await batch.commit();
    console.log("Successfully reset all daily player statuses.");
  } catch (error) {
    console.error("Error resetting player statuses:", error);
    throw error;
  }
};

/**
 * Resets ONLY the transportation field in players_v2.
 * Preserves the arrival (status) field.
 */
export const resetTransportationOnly = async () => {
  try {
    const q = collection(db, "players_v2");
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => {
      batch.update(d.ref, { 
        transportation: ''
      });
    });
    
    await batch.commit();
    console.log("Successfully reset transportation assignments.");
  } catch (error) {
    console.error("Error resetting transport assignments:", error);
    throw error;
  }
};

/**
 * Global reset (Kept for reference or emergency cleanup)
 */
export const performGlobalReset = async () => {
  await clearAttendanceHistory();
  await resetDailyAttendanceStatus();
};
