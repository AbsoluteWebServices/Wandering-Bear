import { Alpine as AlpineType } from 'alpinejs'

type ModalPayload = {
  modal?: string
  handle?: string
  [key: string]: unknown
}

export default (Alpine: AlpineType) => {
  Alpine.data('modal', (config: { handle: string }) => ({
    handle: config.handle,
    isOpen: false,
    isShown: false,
    payload: null as ModalPayload | null,

    async open(payload: ModalPayload | null = null) {
      const targetHandle = payload?.modal ?? payload?.handle

      if (targetHandle !== this.handle) return

      this.payload = payload
      this.lockBodyScroll()
      this.isOpen = true
      await new Promise((resolve) => setTimeout(resolve, 50))
      this.isShown = true
    },

    async close(payload: ModalPayload | null = null) {
      const targetHandle = payload?.modal ?? payload?.handle

      if (targetHandle && targetHandle !== this.handle) return

      this.isShown = false
      await new Promise((resolve) => setTimeout(resolve, 300))
      this.isOpen = false
      this.unlockBodyScroll()
      this.payload = null
    },

    lockBodyScroll() {
      document.body.classList.add('no-scroll')
    },

    unlockBodyScroll() {
      document.body.classList.remove('no-scroll')
    },
  }))
}
