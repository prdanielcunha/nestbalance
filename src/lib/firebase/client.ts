'use client';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const millionsNestFirebase = {
  apiKey: 'AIzaSyAhXY8TV8qoXz8Pd2u5jFHUTVssZmi3kMs',
  authDomain: 'millionsnest.firebaseapp.com',
  projectId: 'millionsnest',
  appId: '1:555464791734:web:3059e8ac2b8089a1767817'
} as const;

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || millionsNestFirebase.apiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || millionsNestFirebase.authDomain,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || millionsNestFirebase.projectId,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || millionsNestFirebase.appId
};

export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
const app = firebaseConfigured ? (getApps()[0] ?? initializeApp(config)) : null;
export const auth = app ? getAuth(app) : null;
