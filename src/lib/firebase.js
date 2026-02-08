import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Your web app's Firebase configuration
// REPLACE THESE VALUES WITH YOUR OWN FROM THE FIREBASE CONSOLE
const firebaseConfig = {
    apiKey: "AIzaSyCsc9_REwB4zc5LuEZGwNU9dOsFUKz_phA",
    authDomain: "syncroom-4e8da.firebaseapp.com",
    projectId: "syncroom-4e8da",
    storageBucket: "syncroom-4e8da.firebasestorage.app",
    messagingSenderId: "125547309692",
    appId: "1:125547309692:web:00cba7124ddb9f0fa3f7f9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export default app;
