import { Alpine as AlpineType } from 'alpinejs'

export default (Alpine: AlpineType) => {
  Alpine.data('productValueProps', (arcStrength = 16) => ({
    path: '',
    arcStrength,

    init() {
      this.$nextTick(() => {
        this.draw()

        const bottle = this.$refs.bottle as HTMLImageElement | undefined
        if (bottle && !bottle.complete) {
          bottle.addEventListener('load', () => this.draw())
        }

        window.addEventListener('resize', () => requestAnimationFrame(() => this.draw()))

        if (window.ResizeObserver) {
          new ResizeObserver(() => requestAnimationFrame(() => this.draw())).observe(
            this.$root as HTMLElement,
          )
        }
      })
    },

    // Push the middle icons outward to form a subtle bulging arc.
    applyArc(props: HTMLElement[], dir: number) {
      const n = props.length
      if (n < 2) {
        props.forEach((p) => (p.style.transform = ''))
        return
      }
      const mid = (n - 1) / 2
      props.forEach((p, i) => {
        const t = 1 - Math.abs(i - mid) / mid // 1 at centre, 0 at the ends
        p.style.transform = `translateX(${dir * t * this.arcStrength}px)`
      })
    },

    draw() {
      const root = this.$root as HTMLElement

      if (window.innerWidth < 768) {
        this.path = ''
        return
      }

      const bottle = this.$refs.bottle as HTMLElement | undefined
      if (!bottle) return

      const s = root.getBoundingClientRect()
      const b = bottle.getBoundingClientRect()
      const bcx = b.left + b.width / 2 - s.left
      const bcy = b.top + b.height / 2 - s.top
      const gap = 10

      // Collect icons by side to identify middle ones
      const leftIcons = Array.from(root.querySelectorAll<HTMLElement>('[data-icon][data-side="left"]'))
      const rightIcons = Array.from(root.querySelectorAll<HTMLElement>('[data-icon][data-side="right"]'))
      const middleLeftIndex = Math.floor(leftIcons.length / 2)
      const middleRightIndex = Math.floor(rightIcons.length / 2)

      let d = ''
      root.querySelectorAll<HTMLElement>('[data-icon]').forEach((icon) => {
        const r = icon.getBoundingClientRect()
        const side = icon.dataset.side
        const sy = r.top + r.height / 2 - s.top

        let sx: number
        let ex: number
        if (side === 'left') {
          sx = r.right - s.left + gap
          ex = b.left - s.left - gap
        } else {
          sx = r.left - s.left - gap
          ex = b.right - s.left + gap
        }

        const dx = ex - sx
        
        // Check if this is a middle icon
        const isMiddleLeft = side === 'left' && leftIcons.indexOf(icon) === middleLeftIndex
        const isMiddleRight = side === 'right' && rightIcons.indexOf(icon) === middleRightIndex
        const isMiddle = isMiddleLeft || isMiddleRight

        let ey: number
        if (isMiddle) {
          // Middle icons: endpoints on same horizontal line
          ey = sy
        } else {
          // Other icons: endpoint aims at bottle's centre → radial fan
          const t = dx / (bcx - sx)
          ey = sy + (bcy - sy) * t
        }

        // Midpoint of the chord
        const mx = (sx + ex) / 2
        const my = (sy + ey) / 2
        
        // Bow direction: middle icons have subtle wave, others bow toward bottle
        let bow: number
        if (isMiddleRight) {
          bow = -8  // slight curve up
        } else if (isMiddleLeft) {
          bow = 8   // slight curve down
        } else {
          bow = (bcy - my) * 0.15  // normal: toward bottle centre
        }

        // Quadratic control point
        const qx = mx
        const qy = my + bow

        // Elevate to cubic (exact equivalent)
        const c1x = sx + (qx - sx) * 2 / 3
        const c1y = sy + (qy - sy) * 2 / 3
        const c2x = ex + (qx - ex) * 2 / 3
        const c2y = ey + (qy - ey) * 2 / 3

        d += `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${ex},${ey} `
      })

      this.path = d
    },
  }))
}
