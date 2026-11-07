"use client";

import { createContext, useContext, useEffect } from 'react';

export const PreviousPublicInformation = createContext(false);
export const PublicApplyProof = createContext<{ token: string; report: (part: string, token: string) => void } | null>(null);
export function usePreviousPublicInformation() { return useContext(PreviousPublicInformation); }
export function usePublicApplyProof(part: string) {
    const proof = useContext(PublicApplyProof);
    useEffect(() => { if (proof) proof.report(part, proof.token); }, [proof, part]);
}
