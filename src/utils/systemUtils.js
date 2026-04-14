import { db } from '../firebase';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';

/**
 * Deletes all documents in a specific collection.
 * Note: For very large collections, this should be done in chunks.
 * For this app's scale, a single batch (up to 500) is likely sufficient.
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
 * Resets all players to 'absent' status and clears transportation fields.
 */
export const resetPlayerStatuses = async () => {
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
    console.log("Successfully reset all player statuses.");
  } catch (error) {
    console.error("Error resetting player statuses:", error);
    throw error;
  }
};

/**
 * Performs a full system reset.
 */
export const performGlobalReset = async () => {
  await clearCollection("attendance_logs");
  // If there are other logs like "transportation_logs", clear them too.
  // Based on current code, transportation is part of attendance_logs snapshots.
  await resetPlayerStatuses();
};
