"use client";

import React from 'react';

const Navigation = React.createContext<{ epoch: number; consume: (key: string) => boolean } | null>(null);

// The common root layout keeps this listener mounted across route groups, so
// popstate is recorded even while the user is outside the public layout.
// pageshow/visibility/focus are handled by the mounted public surface.
export default function PublicFreshnessNavigation({ children }: { children: React.ReactNode }) {
    const pending = React.useRef<string | null>(null);
    const [epoch, setEpoch] = React.useState(0);
    const consume = React.useCallback((key: string) => {
        if (pending.current !== key) return false;
        pending.current = null; return true;
    }, []);
    React.useEffect(() => {
        const restore = () => { pending.current = window.location.pathname; setEpoch(value => value + 1); };
        window.addEventListener('popstate', restore);
        return () => window.removeEventListener('popstate', restore);
    }, []);
    const value = React.useMemo(() => ({ epoch, consume }), [epoch, consume]);
    return <Navigation.Provider value={value}>{children}</Navigation.Provider>;
}

export function usePublicFreshnessNavigation() { return React.useContext(Navigation); }
