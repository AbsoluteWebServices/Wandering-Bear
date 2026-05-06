import { Alpine as AlpineType } from 'alpinejs'

export default (Alpine: AlpineType) => {
  Alpine.data('diagram', () => ({
    lines: [] as Array<{
      id: number
      x1: number
      y1: number
      x2: number
      y2: number
    }>,

    init() {
      this.$nextTick(() => {
        this.draw()

        window.addEventListener('resize', () => {
          requestAnimationFrame(() => this.draw())
        })
      })
    },

    draw() {
      const wrapper = this.$root as HTMLElement
      const wrapperRect = wrapper.getBoundingClientRect()

      const image = this.$refs.diagramImage as HTMLElement | undefined
      if (!image) return

      const imageRect = image.getBoundingClientRect()

      const anchors = [
        { x: 0.72, y: 0.25 },
        { x: 0.28, y: 0.45 },
        { x: 0.72, y: 0.62 },
      ]

      this.lines = Array.from(wrapper.querySelectorAll<HTMLElement>('[data-callout]'))
        .map((el) => {
          const index = Number(el.dataset.index)
          const anchor = anchors[index]

          const icon = el.querySelector('img')
          if (!icon || !anchor) return null

          const iconRect = icon.getBoundingClientRect()
          const isLeft = iconRect.left < imageRect.left

          return {
            id: index,
            x1: imageRect.left + imageRect.width * anchor.x - wrapperRect.left,
            y1: imageRect.top + imageRect.height * anchor.y - wrapperRect.top,
            x2: isLeft
              ? iconRect.right - wrapperRect.left
              : iconRect.left - wrapperRect.left,
            y2: iconRect.top + iconRect.height / 2 - wrapperRect.top,
          }
        })
        .filter(Boolean) as typeof this.lines
    },
  }))
}