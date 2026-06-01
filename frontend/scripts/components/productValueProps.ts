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

      this.applyArc(
        Array.from(root.querySelectorAll<HTMLElement>('[data-col="left"] [data-prop]')),
        -1,
      )
      this.applyArc(
        Array.from(root.querySelectorAll<HTMLElement>('[data-col="right"] [data-prop]')),
        1,
      )

      const s = root.getBoundingClientRect()
      const b = bottle.getBoundingClientRect()
      const bcx = b.left + b.width / 2 - s.left
      const bcy = b.top + b.height / 2 - s.top
      const gap = 10

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

        // Endpoint aims straight at the bottle's centre → radial fan.
        const t = (ex - sx) / (bcx - sx)
        const ey = sy + (bcy - sy) * t
        const dx = ex - sx

        // Flat coming off the icon, then hook toward the bottle.
        const c1x = sx + dx * 0.6
        const c1y = sy
        const c2x = ex - dx * 0.05
        const c2y = ey

        d += `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${ex},${ey} `
      })

      this.path = d
    },
  }))
}
