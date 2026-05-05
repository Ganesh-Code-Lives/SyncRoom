import { db } from './firebase';
import { 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    increment, 
    collection, 
    addDoc, 
    query, 
    where, 
    orderBy, 
    limit, 
    getDocs,
    serverTimestamp,
    onSnapshot
} from 'firebase/firestore';

/**
 * Helper to wrap promises with a timeout. 
 * Prevents infinite hanging if Firestore cannot connect.
 */
const withTimeout = (promise, ms = 5000) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Firestore connection timed out. Please check if your Firestore Database is initialized in the Firebase Console.")), ms)
        )
    ]);
};

/**
 * Subscribes to user profile data in real-time.
 */
export const subscribeToUserProfile = (userId, callback) => {
    if (!userId) return () => {};
    const userRef = doc(db, 'users', userId);
    return onSnapshot(userRef, (doc) => {
        callback(doc.exists() ? doc.data() : null);
    }, (error) => {
        console.error("Profile subscription error:", error);
    });
};

/**
 * Subscribes to user activity in real-time.
 */
export const subscribeToUserActivity = (userId, callback, maxItems = 10) => {
    if (!userId) return () => {};
    const activitiesRef = collection(db, 'activities');
    const q = query(
        activitiesRef, 
        where("userId", "==", userId),
        orderBy("timestamp", "desc"),
        limit(maxItems)
    );
    
    return onSnapshot(q, (snapshot) => {
        const activities = [];
        snapshot.forEach((doc) => {
            activities.push({ id: doc.id, ...doc.data() });
        });
        callback(activities);
    }, (error) => {
        console.error("Activity subscription error:", error);
    });
};

/**
 * Ensures a user document exists in Firestore.
 * Call this on successful login/signup.
 */
export const ensureUserDocument = async (user) => {
    if (!user || !user.uid) return;
    
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        await setDoc(userRef, {
            uid: user.uid,
            name: user.displayName || 'Anonymous User',
            email: user.email || '',
            createdAt: serverTimestamp(),
            stats: {
                roomsJoined: 0,
                roomsCreated: 0
            }
        });
    }
};

/**
 * Logs a room activity and updates user stats.
 * @param {string} userId - User's UID
 * @param {string} type - 'JOIN_ROOM' or 'CREATE_ROOM'
 * @param {string} roomId - Room Code
 * @param {string} roomName - Room Name
 */
export const logRoomActivity = async (userId, type, roomId, roomName) => {
    if (!userId) return;

    try {
        // 1. Log activity
        const activitiesRef = collection(db, 'activities');
        await addDoc(activitiesRef, {
            userId,
            type,
            roomId,
            roomName: roomName || 'Unnamed Room',
            timestamp: serverTimestamp()
        });

        // 2. Increment user stats
        const userRef = doc(db, 'users', userId);
        const updateData = {};
        
        if (type === 'CREATE_ROOM') {
            updateData['stats.roomsCreated'] = increment(1);
        } else if (type === 'JOIN_ROOM') {
            updateData['stats.roomsJoined'] = increment(1);
        }

        await updateDoc(userRef, updateData);
    } catch (error) {
        console.error("Failed to log room activity:", error);
    }
};

/**
 * Fetches user profile data from Firestore.
 */
export const getUserProfile = async (userId) => {
    if (!userId) return null;
    const userRef = doc(db, 'users', userId);
    const userSnap = await withTimeout(getDoc(userRef));
    return userSnap.exists() ? userSnap.data() : null;
};

/**
 * Fetches recent activity for a user.
 */
export const getUserActivity = async (userId, maxItems = 10) => {
    if (!userId) return [];
    
    const activitiesRef = collection(db, 'activities');
    const q = query(
        activitiesRef, 
        where("userId", "==", userId),
        orderBy("timestamp", "desc"),
        limit(maxItems)
    );
    
    const querySnapshot = await withTimeout(getDocs(q));
    const activities = [];
    querySnapshot.forEach((doc) => {
        activities.push({ id: doc.id, ...doc.data() });
    });
    
    return activities;
};

/**
 * Derives unique rooms from user activity.
 */
export const getUniqueRoomsFromActivity = (activities) => {
    const uniqueRooms = new Map();
    
    activities.forEach(act => {
        if (!uniqueRooms.has(act.roomId)) {
            uniqueRooms.set(act.roomId, {
                roomId: act.roomId,
                roomName: act.roomName,
                role: act.type === 'CREATE_ROOM' ? 'Host' : 'Participant',
                lastActive: act.timestamp
            });
        } else if (act.type === 'CREATE_ROOM') {
            // Upgrade role if they created it but joined it later
            const existing = uniqueRooms.get(act.roomId);
            existing.role = 'Host';
        }
    });

    return Array.from(uniqueRooms.values());
};
