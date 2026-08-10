import { Alpine as AlpineType } from "alpinejs"
import Swiper from 'swiper';
import { Navigation } from 'swiper/modules';

export default (Alpine: AlpineType) => {
    Alpine.data("tooltip", () => ({
        open: false,
        hovering: false,
        left: 0,
        top: 0,
        arrowLeft: 0,
    
        get visible() {
          return this.open || this.hovering
        },
    
        setPosition() {
          const trigger = this.$refs.trigger
          const tooltip = this.$refs.tooltip
          if (!trigger || !tooltip) return

          const triggerRect = trigger.getBoundingClientRect()

          const padding = 8
          const arrowSpace = 8
          const viewportWidth = window.innerWidth

          const measuredWidth = tooltip.getBoundingClientRect().width
          const tooltipWidth = Math.min(measuredWidth || 200, viewportWidth - padding * 2)

          let left = triggerRect.left + (triggerRect.width / 2) - (tooltipWidth / 2)
          if (left < padding) left = padding
          if (left + tooltipWidth > viewportWidth - padding) {
            left = viewportWidth - tooltipWidth - padding
          }

          this.left = left

          const bar = trigger.closest('[data-tooltip-below]')
          const icon = trigger.querySelector('svg')
          const anchorBottom = icon
            ? icon.getBoundingClientRect().bottom
            : triggerRect.bottom

          this.top = bar
            ? bar.getBoundingClientRect().bottom - arrowSpace
            : anchorBottom + 2

          const triggerCenter = triggerRect.left + (triggerRect.width / 2)
          const minArrow = 16
          const maxArrow = tooltipWidth - 16

          let arrowLeft = triggerCenter - left
          if (arrowLeft < minArrow) arrowLeft = minArrow
          if (arrowLeft > maxArrow) arrowLeft = maxArrow

          this.arrowLeft = arrowLeft
        },
    
        showTooltip() {
          this.hovering = true
          this.setPosition()
        },
    
        hideTooltip() {
          this.hovering = false
        },
    
        toggleTooltip() {
          this.open = !this.open
          if (this.open) this.setPosition()
        }

    }))
}
