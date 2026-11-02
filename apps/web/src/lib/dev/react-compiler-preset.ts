import { reactCompilerPreset } from "@vitejs/plugin-react";

// These upstream renderers subscribe to mutable TanStack state, but read sizes
// and pin offsets through stable table/header/column identities. Compiling those
// reads caches stale values despite the subscription firing. Keep this boundary
// narrow until the renderers expose reactive sizing inputs upstream.
const MUTABLE_GRID_RENDERERS =
  /[\\/]packages[\\/]design-system[\\/]components[\\/]reui[\\/]data-grid[\\/]data-grid-table(?:-dnd)?\.tsx(?:\?.*)?$/;

export function appReactCompilerPreset() {
  const preset = reactCompilerPreset();
  return {
    ...preset,
    // Upstream's preset is a factory, which can't go to the parallel Babel
    // workers. This plain object is what that factory returns.
    preset: { plugins: [["babel-plugin-react-compiler", {}]] },
    rolldown: {
      ...preset.rolldown,
      filter: {
        ...preset.rolldown.filter,
        id: { exclude: [MUTABLE_GRID_RENDERERS] },
      },
    },
  };
}
