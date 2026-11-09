/** www-side configuration (dashboard-only features; the 3D scene has its
 *  own CONFIG in orchard/src/config.ts). */
export const CONFIG = {
  /** Photo strip ("Streak"): the ImgSmear canvas animation is too much
   *  processing load for smaller devices.
   *  - 'cycle': lightweight image cycler (crossfade + auto-advance) — DEFAULT
   *  - 'smear': the full ImgSmear sweep animation (opt-in, desktop)
   *  - 'off': hide the strip entirely */
  STREAK: {
    MODE: 'cycle' as 'cycle' | 'smear' | 'off',
    /** seconds per photo in 'cycle' mode */
    CYCLE_SECONDS: 6,
  },
};
