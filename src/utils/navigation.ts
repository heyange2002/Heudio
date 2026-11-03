export type AppSection = 'home' | 'companion' | 'visualizer' | 'lyrics';
export function workspaceView(section: AppSection, pureMusic: boolean) {
  if (pureMusic) return 'music';
  if (section === 'visualizer' || section === 'lyrics') return section;
  return 'companion';
}
