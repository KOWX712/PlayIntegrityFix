import type { MdDialog } from '@material/web/dialog/dialog.js'

/**
 * Customize MdDialog animation
 * @param dialog MdDialog instance
 */
export function setupDialogAnimation(dialog: MdDialog): void {
  const defaultOpenAnim = dialog.getOpenAnimation
  const defaultCloseAnim = dialog.getCloseAnimation

  dialog.getOpenAnimation = () => {
    document.body.style.overflow = 'hidden'
    const defaultAnim = defaultOpenAnim.call(dialog)
    return {
      ...defaultAnim,
      dialog: [
        [
          [{ opacity: 0, transform: 'translateY(50px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 300, easing: 'ease' },
        ],
      ],
      scrim: [
        [
          [{ opacity: 0 }, { opacity: 0.32 }],
          { duration: 300, easing: 'linear' },
        ],
      ],
      container: [],
    }
  }

  dialog.getCloseAnimation = () => {
    document.body.style.overflow = ''
    const defaultAnim = defaultCloseAnim.call(dialog)
    return {
      ...defaultAnim,
      dialog: [
        [
          [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-50px)' }],
          { duration: 300, easing: 'ease' },
        ],
      ],
      scrim: [
        [
          [{ opacity: 0.32 }, { opacity: 0 }],
          { duration: 300, easing: 'linear' },
        ],
      ],
      container: [],
    }
  }
}
