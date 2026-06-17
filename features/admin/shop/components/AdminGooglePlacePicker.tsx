"use client";

import React from "react";
import type { GooglePlaceCandidate } from "@/types/google-places";

export default function AdminGooglePlacePicker({
    query,
    selectedPlaceId,
    disabled,
    onSelect,
}: {
    query: string;
    selectedPlaceId: string | null;
    disabled?: boolean;
    onSelect: (place: GooglePlaceCandidate) => void;
}) {
    const [places, setPlaces] = React.useState<GooglePlaceCandidate[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState("");

    async function search() {
        const value = query.trim();
        if (value.length < 2) {
            setError("店舗名または住所を2文字以上入力してください。");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const response = await fetch(
                `/api/admin/places/search?q=${encodeURIComponent(value)}`,
            );
            const data = (await response.json().catch(() => null)) as {
                places?: GooglePlaceCandidate[];
                error?: string;
                message?: string;
                available?: boolean;
            } | null;
            if (!response.ok) throw new Error(data?.error ?? "候補検索に失敗しました。");
            setPlaces(data?.places ?? []);
            if (data?.available === false) {
                setError(data.message ?? "Google Places検索は現在設定されていません。");
            }
        } catch (searchError) {
            setError(searchError instanceof Error ? searchError.message : String(searchError));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-extrabold text-gray-900">
                        Google店舗候補との紐付け
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-600">
                        店舗名と住所から候補を検索し、正しい店舗を確認して選択してください。
                    </p>
                </div>
                <button
                    type="button"
                    onClick={search}
                    disabled={disabled || loading}
                    className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                    {loading ? "検索中..." : "Google候補を検索"}
                </button>
            </div>

            {selectedPlaceId ? (
                <p className="mt-3 text-xs font-bold text-green-800">
                    Google店舗候補を選択済みです。
                </p>
            ) : null}
            {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}

            {places.length > 0 ? (
                <div className="mt-4 space-y-2">
                    {places.map((place) => (
                        <button
                            key={place.placeId}
                            type="button"
                            onClick={() => onSelect(place)}
                            className="block w-full rounded-xl border border-blue-100 bg-white p-3 text-left transition hover:border-blue-400"
                        >
                            <span className="block text-sm font-bold text-gray-900">
                                {place.name}
                            </span>
                            <span className="mt-1 block text-xs text-gray-600">
                                {place.address}
                            </span>
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
