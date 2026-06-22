/** Region is encoded as the part before the em dash in a visit's location name. */
export function regionOf(locationName: string): string {
    const idx = locationName.indexOf('—');
    return (idx >= 0 ? locationName.slice(0, idx) : locationName).trim();
}