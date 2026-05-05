import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider } from '../lib/firebase';
import {
    signInWithPopup,
    signInAnonymously,
    signOut,
    onAuthStateChanged
} from 'firebase/auth';
import LoadingScreen from '../components/LoadingScreen';
import { ensureUserDocument } from '../lib/firestoreUtils';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isGuest, setIsGuest] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                // Ensure their document exists in Firestore (non-blocking for fast UI load)
                ensureUserDocument(currentUser).catch(console.error);
            }
            setUser(currentUser);
            setIsGuest(currentUser ? currentUser.isAnonymous : false);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const signInWithGoogle = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error("Google Sign In Error:", error);
            throw error;
        }
    };

    const signInAsGuest = async () => {
        try {
            await signInAnonymously(auth);
        } catch (error) {
            console.error("Guest Sign In Error:", error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout Error:", error);
        }
    };

    const value = {
        user,
        isGuest,
        loading,
        signInWithGoogle,
        signInAsGuest,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {loading ? (
                <LoadingScreen message="Loading SyncRoom..." />
            ) : (
                children
            )}
        </AuthContext.Provider>
    );
};
