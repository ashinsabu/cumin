import type { Variants, Transition } from 'framer-motion'

// Shared easing — fast ease-out for snappy UI
const snap: Transition = { duration: 0.14, ease: [0.16, 1, 0.3, 1] }
const spring: Transition = { type: 'spring', damping: 28, stiffness: 380, mass: 0.8 }

// Fade: simple opacity for backdrops, page transitions
export const fade: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1 },
  exit:    { opacity: 0 },
}

// Modal center: scale + fade (ItemModal, CreateEpicModal)
export const modalScale: Variants = {
  hidden:  { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: spring },
  exit:    { opacity: 0, scale: 0.95, transition: { ...snap, duration: 0.1 } },
}

// Side panel: slide in from the right (EpicModal)
export const slideRight: Variants = {
  hidden:  { x: '100%' },
  visible: { x: 0, transition: spring },
  exit:    { x: '100%', transition: { ...snap, duration: 0.18 } },
}

// Bottom pill: slide up from below (EpicModal minimized)
export const slideUp: Variants = {
  hidden:  { y: 24, opacity: 0 },
  visible: { y: 0,  opacity: 1, transition: spring },
  exit:    { y: 16, opacity: 0, transition: snap },
}

// Dropdown / popover: scale from top origin
export const popover: Variants = {
  hidden:  { opacity: 0, scale: 0.93, y: -4 },
  visible: { opacity: 1, scale: 1,    y: 0,  transition: snap },
  exit:    { opacity: 0, scale: 0.93, y: -4, transition: { ...snap, duration: 0.08 } },
}

// Page transition: subtle fade + tiny y shift
export const pageTransition: Variants = {
  hidden:  { opacity: 0, y: 5 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.16, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -3, transition: { duration: 0.1, ease: 'easeIn' } },
}
