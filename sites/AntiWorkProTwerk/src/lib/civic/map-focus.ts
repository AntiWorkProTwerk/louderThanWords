// Camera intent is separate from query/filter state. A regional anchor must not
// masquerade as an exact office, investment destination or transaction location.
export const mapFocusContext = Symbol('civic-map-focus');
export type MapFocusContext = { focusState: (code: string) => void };
