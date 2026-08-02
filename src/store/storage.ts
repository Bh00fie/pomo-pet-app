import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/**
 * AsyncStorage-backed JSON storage for zustand `persist`.
 * Kept in its own module so it can be swapped (e.g. for expo-secure-store or an in-memory
 * fake in tests) without touching the store definition.
 */
export const asyncStorageJSON = createJSONStorage(() => AsyncStorage);
