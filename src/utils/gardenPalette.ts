import { createContext, useContext } from 'react';
import { OTHER_COLORS, UNKNOWN_COLOR, type BranchColors } from './gardenColors';
import { defaultLayout, paletteFor } from './gardenLayout';

// Branch colors come from the user's layout, which lives in App. Every Garden
// surface (tree, chips, toast, Today strip) reads them from here rather than
// threading the layout through each component.
export const GardenPaletteContext = createContext<Map<string, BranchColors>>(paletteFor(defaultLayout()));

export function useBranchColors(): (name: string) => BranchColors {
  const palette = useContext(GardenPaletteContext);
  return (name) => palette.get(name) ?? { ...OTHER_COLORS, bg: UNKNOWN_COLOR };
}
