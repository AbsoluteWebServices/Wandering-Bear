import { Alpine as AlpineType } from 'alpinejs'

type Line = {
  id: number
  x1: number
  y1: number
  x2: number
  y2: number
}

const VIEW_TRANSITION_MS = 750
const VIEW_TRANSITION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'
const VIEW_TRANSITION_CLASSES = [
  'transition-opacity',
  'duration-[750ms]',
  'ease-in-out',
  'motion-reduce:transition-none',
] as const

export default (Alpine: AlpineType) => {
  Alpine.data('diagramToggle', (initialState: number = 0) => ({
    lines: [] as Line[],

    state: initialState,
    pendingState: null as number | null,
    swapId: 0,
    swapTimeoutId: null as ReturnType<typeof setTimeout> | null,

    el: null as HTMLElement | null,

    indicatorStyle: '',
    isDragging: false,
    isSwapping: false,
    pointerStartX: null as number | null,
    pointerStartY: null as number | null,

    resizeHandler: null as (() => void) | null,

    init() {
      this.el = this.$el as HTMLElement

      this.mountState(this.state, false)
      this.updateIndicator(this.state)

      this.resizeHandler = () => {
        requestAnimationFrame(() => {
          this.updateIndicator(this.state)

          this.$nextTick(() => {
            this.draw()
          })
        })
      }

      window.addEventListener('resize', this.resizeHandler)
    },

    destroy() {
      if (this.resizeHandler) {
        window.removeEventListener('resize', this.resizeHandler)
      }
    },

    async setState(index: number) {
      if (index === this.state && !this.isSwapping) return
      if (index === this.state && this.isSwapping) return

      this.updateIndicator(index)

      if (this.isSwapping) {
        this.cancelSwap()
      }

      await this.mountState(index, true)
    },

    isActiveSwap(id: number) {
      return id === this.swapId
    },

    cancelSwap() {
      this.swapId++

      if (this.swapTimeoutId !== null) {
        clearTimeout(this.swapTimeoutId)
        this.swapTimeoutId = null
      }

      const content = this.$refs.content as HTMLElement | undefined
      if (!content) {
        this.isSwapping = false
        return
      }

      content.style.height = ''
      content.style.transition = ''
      content.style.overflow = ''

      const children = Array.from(content.children)
      if (children.length > 1) {
        children[children.length - 1].remove()
      }

      const active = content.firstElementChild
      if (active instanceof HTMLElement) {
        active.classList.remove(
          'absolute',
          'inset-0',
          'top-0',
          'left-0',
          'w-full',
          'opacity-0',
          'opacity-100',
          ...VIEW_TRANSITION_CLASSES
        )
      }

      this.isSwapping = false
    },

    async mountState(index: number, animate = true) {
      const template = this.el?.querySelector<HTMLTemplateElement>(
        `template[data-template-view="${index}"]`
      )

      const content = this.$refs.content as HTMLElement | undefined

      if (!template || !content) return

      const swapId = ++this.swapId

      if (this.swapTimeoutId !== null) {
        clearTimeout(this.swapTimeoutId)
        this.swapTimeoutId = null
      }

      this.isSwapping = true
      this.state = index
      this.updateIndicator(index)

      const previousChildren = Array.from(content.children)

      const next = document.createElement('div')
      next.appendChild(template.content.cloneNode(true))

      if (animate && previousChildren.length) {
        const startHeight = content.offsetHeight

        content.style.height = `${startHeight}px`
        content.style.transition = `height ${VIEW_TRANSITION_MS}ms ${VIEW_TRANSITION_EASING}`
        content.style.overflow = 'hidden'

        previousChildren.forEach((child) => {
          if (child instanceof HTMLElement) {
            child.classList.add(
              'absolute',
              'top-0',
              'left-0',
              'w-full',
              ...VIEW_TRANSITION_CLASSES
            )
          }
        })

        next.className = `absolute top-0 left-0 w-full opacity-0 ${VIEW_TRANSITION_CLASSES.join(' ')}`

        content.appendChild(next)
        Alpine.initTree(next)

        await this.$nextTick()
        if (!this.isActiveSwap(swapId)) return

        await this.waitForImages(next)
        if (!this.isActiveSwap(swapId)) return

        const nextHeight = Math.max(next.scrollHeight, next.offsetHeight)

        this.$nextTick(() => {
          if (this.isActiveSwap(swapId)) {
            this.draw(next)
          }
        })

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!this.isActiveSwap(swapId)) {
                resolve()
                return
              }

              content.style.height = `${nextHeight}px`

              previousChildren.forEach((child) => {
                if (child instanceof HTMLElement) {
                  child.classList.add('opacity-0')
                }
              })

              next.classList.remove('opacity-0')
              next.classList.add('opacity-100')

              resolve()
            })
          })
        })

        if (!this.isActiveSwap(swapId)) return

        await new Promise<void>((resolve) => {
          this.swapTimeoutId = window.setTimeout(() => {
            this.swapTimeoutId = null

            if (!this.isActiveSwap(swapId)) {
              resolve()
              return
            }

            previousChildren.forEach((child) => child.remove())

            next.classList.remove(
              'absolute',
              'top-0',
              'left-0',
              'w-full',
              'opacity-100',
              ...VIEW_TRANSITION_CLASSES
            )

            content.style.height = ''
            content.style.transition = ''
            content.style.overflow = ''

            this.pendingState = null
            this.isSwapping = false

            this.$nextTick(() => {
              if (this.isActiveSwap(swapId)) {
                this.draw(next)
              }
            })

            resolve()
          }, VIEW_TRANSITION_MS + 50)
        })

        return
      }

      if (!this.isActiveSwap(swapId)) return

      content.replaceChildren(next)
      Alpine.initTree(next)

      this.pendingState = null

      await this.$nextTick()
      if (!this.isActiveSwap(swapId)) return

      await this.waitForImages(content)
      if (!this.isActiveSwap(swapId)) return

      this.$nextTick(() => {
        if (this.isActiveSwap(swapId)) {
          this.draw(next)
        }
      })

      if (!this.isActiveSwap(swapId)) return

      this.isSwapping = false
    },

    updateIndicator(index = this.state) {
      const toggle = this.$refs.toggle as HTMLElement | undefined
      if (!toggle) return

      const buttons = toggle.querySelectorAll<HTMLElement>('[data-toggle-button]')
      const activeButton = buttons[index]

      if (!activeButton) return

      this.indicatorStyle = `
        width: ${activeButton.offsetWidth}px;
        transform: translateX(${activeButton.offsetLeft - 8}px);
      `
    },

    startDrag(event: PointerEvent) {
      if (this.isSwapping) return
      if ((event.target as HTMLElement).closest('[data-toggle-button]')) return

      this.pointerStartX = event.clientX
      this.pointerStartY = event.clientY
    },

    onDrag(event: PointerEvent) {
      if (this.isSwapping || this.pointerStartX === null) return

      const dx = Math.abs(event.clientX - this.pointerStartX)
      const dy = Math.abs(event.clientY - (this.pointerStartY ?? event.clientY))

      if (!this.isDragging) {
        if (dx < 8 && dy < 8) return

        this.isDragging = true
        this.pendingState = this.state

        const toggle = this.$refs.toggle as HTMLElement | undefined
        toggle?.setPointerCapture?.(event.pointerId)
      }

      const closestIndex = this.getClosestIndex(event.clientX)

      this.pendingState = closestIndex
      this.updateIndicator(closestIndex)
    },

    endDrag() {
      if (!this.isDragging) {
        this.pointerStartX = null
        this.pointerStartY = null
        return
      }

      this.isDragging = false
      this.pointerStartX = null
      this.pointerStartY = null

      if (
        typeof this.pendingState === 'number' &&
        this.pendingState !== this.state
      ) {
        void this.setState(this.pendingState)
      } else {
        this.updateIndicator(this.state)
      }

      this.pendingState = null
    },

    getClosestIndex(clientX: number) {
      const toggle = this.$refs.toggle as HTMLElement | undefined
      if (!toggle) return this.state

      const buttons = Array.from(
        toggle.querySelectorAll<HTMLElement>('[data-toggle-button]')
      )

      const rect = toggle.getBoundingClientRect()
      const x = clientX - rect.left

      let closestIndex = this.state
      let closestDistance = Infinity

      buttons.forEach((button, index) => {
        const center = button.offsetLeft + button.offsetWidth / 2
        const distance = Math.abs(x - center)

        if (distance < closestDistance) {
          closestDistance = distance
          closestIndex = index
        }
      })

      return closestIndex
    },

    waitForImages(container: HTMLElement) {
      const images = Array.from(container.querySelectorAll('img'))

      return Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve()

          return new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          })
        })
      )
    },

    draw(container?: HTMLElement) {
      const activeContent =
        container ||
        ((this.$refs.content as HTMLElement | undefined)?.firstElementChild as HTMLElement | null)
    
      if (!activeContent) return
    
      const lineWrapper = activeContent.querySelector<HTMLElement>('[data-line-wrapper]')
      if (!lineWrapper) return
    
      const wrapperRect = lineWrapper.getBoundingClientRect()
    
      const image = lineWrapper.querySelector<HTMLElement>('[data-diagram-image]')
      if (!image) return
    
      const imageRect = image.getBoundingClientRect()

      const anchors = [
        { x: 0.72, y: 0.25 },
        { x: 0.28, y: 0.45 },
        { x: 0.72, y: 0.62 },
      ]
    
      this.lines = Array.from(
        lineWrapper.querySelectorAll<HTMLElement>('[data-callout]')
      )
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
        .filter(Boolean) as Line[]

        this.renderLines()
    },

    renderLines() {
      const svg = this.$refs.linesSvg as SVGSVGElement | undefined
      if (!svg) return
    
      svg.innerHTML = ''
    
      this.lines.forEach((line) => {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    
        el.setAttribute('x1', String(line.x1))
        el.setAttribute('y1', String(line.y1))
        el.setAttribute('x2', String(line.x2))
        el.setAttribute('y2', String(line.y2))
        el.setAttribute('stroke', '#2f1a0f')
        el.setAttribute('stroke-width', '1')
        el.setAttribute('stroke-dasharray', '4 4')
    
        svg.appendChild(el)
      })
    }

  }))
}