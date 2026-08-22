import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBHcVZFWlTSD8TYV9YCPyQ9mhp_NxzppKM",
  authDomain: "inspecaopop.firebaseapp.com",
  projectId: "inspecaopop",
  storageBucket: "inspecaopop.firebasestorage.app",
  messagingSenderId: "517844065120",
  appId: "1:517844065120:web:d7a13da4d4o868bdb9c05",
  measurementId: "G-2FMV2PZV2S"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);