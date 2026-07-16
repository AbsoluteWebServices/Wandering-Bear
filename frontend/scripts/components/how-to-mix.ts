import { Alpine as AlpineType } from 'alpinejs'

export default (Alpine: AlpineType) => {
    Alpine.data("howToMix", (
        activeTitle: string
    ) => ({
        activeTitle: activeTitle,
        indicatorStyle: '',

        init() {
            this.$nextTick(() => {
                this.updateIndicator()
            })

            window.addEventListener('resize', () => {
                requestAnimationFrame(() => this.updateIndicator())
            })
        },

        setActive(title: string) {
            this.activeTitle = title
            this.$nextTick(() => {
                this.updateIndicator()
            })
        },

        updateIndicator() {
            const toggle = this.$refs.toggle as HTMLElement | undefined
            if (!toggle) return

            const buttons = toggle.querySelectorAll<HTMLElement>('[data-step-title]')
            const activeButton = Array.from(buttons).find(
                btn => btn.dataset.title === this.activeTitle
            )

            if (!activeButton) return

            this.indicatorStyle = `
                width: ${activeButton.offsetWidth}px;
                transform: translateX(${activeButton.offsetLeft - 6}px);
            `
        }
    }))
}
