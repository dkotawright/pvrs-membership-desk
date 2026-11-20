// Firebase SDK (loaded straight from Google's CDN, no build step)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  signInWithEmailAndPassword, sendPasswordResetEmail, EmailAuthProvider, linkWithCredential, updatePassword, reauthenticateWithPopup,
  createUserWithEmailAndPassword, sendEmailVerification, updateProfile, multiFactor, TotpMultiFactorGenerator, getMultiFactorResolver
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, collection, collectionGroup, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  onSnapshot, query, where, limit, writeBatch, runTransaction, serverTimestamp, deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig } from "./config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export {
  onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  signInWithEmailAndPassword, sendPasswordResetEmail, EmailAuthProvider, linkWithCredential, updatePassword, reauthenticateWithPopup,
  createUserWithEmailAndPassword, sendEmailVerification, updateProfile, multiFactor, TotpMultiFactorGenerator, getMultiFactorResolver,
  doc, collection, collectionGroup, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, query, where, limit, writeBatch, runTransaction,
  serverTimestamp, deleteField, ref, uploadBytes, getDownloadURL, deleteObject
};
