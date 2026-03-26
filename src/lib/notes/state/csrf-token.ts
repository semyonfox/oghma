// extracted from Notea (MIT License)
import { create } from 'zustand';

interface CsrfTokenState {
    token?: string;
    setToken: (token?: string) => void;
}

export const useCsrfTokenStore = create<CsrfTokenState>((set) => ({
    token: undefined,
    setToken: (token) => set({ token }),
}));

export default useCsrfTokenStore;
