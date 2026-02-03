// Mobile storage using expo-secure-store or AsyncStorage fallback
let SecureStore: any = null;
let AsyncStorage: any = null;

try {
  SecureStore = require('expo-secure-store');
} catch {
  // SecureStore not available
}

try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  // AsyncStorage not available
}

const TOKEN_KEY = 'crm_access_token';

export const mobileStorage = {
  getToken: async (): Promise<string | null> => {
    try {
      if (SecureStore) {
        return await SecureStore.getItemAsync(TOKEN_KEY);
      } else if (AsyncStorage) {
        return await AsyncStorage.getItem(TOKEN_KEY);
      }
      return null;
    } catch (error) {
      console.error('Failed to get token:', error);
      return null;
    }
  },

  setToken: async (token: string): Promise<void> => {
    try {
      if (SecureStore) {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
      } else if (AsyncStorage) {
        await AsyncStorage.setItem(TOKEN_KEY, token);
      }
    } catch (error) {
      console.error('Failed to set token:', error);
    }
  },

  clearToken: async (): Promise<void> => {
    try {
      if (SecureStore) {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      } else if (AsyncStorage) {
        await AsyncStorage.removeItem(TOKEN_KEY);
      }
    } catch (error) {
      console.error('Failed to clear token:', error);
    }
  },
};
