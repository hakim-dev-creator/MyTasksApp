import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyB6XdpS2pLqXya8PwHlgJSINlIBdlV3J3o",
  authDomain: "my-tasks19.firebaseapp.com",
  projectId: "my-tasks19",
  storageBucket: "my-tasks19.firebasestorage.app",
  messagingSenderId: "569321308168",
  appId: "1:569321308168:web:a8ab214fcfc4607307d1bd"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);