export type GooglePlaceCandidate = {
    placeId: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    primaryType: string | null;
    googleMapsUri: string | null;
};
