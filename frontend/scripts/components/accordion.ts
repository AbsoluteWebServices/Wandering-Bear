export default (Alpine: AlpineType) => {
    Alpine.data("accordion", () => ({
        

        init() {
            
        },

        toggleAccordion(event: Event) {
            event.preventDefault();
            event.stopPropagation();

            const trigger = event.currentTarget as HTMLElement
            const accordionItem = trigger.closest('[data-accordion-item]') as HTMLElement | null
          
            if (!accordionItem) return
          
            const accordionItems = this.$root.querySelectorAll<HTMLElement>('[data-accordion-item]')
            const isOpen = accordionItem.hasAttribute('open')
            
          
            accordionItems.forEach(item => item.removeAttribute('open'))
          
            if (!isOpen) {
              accordionItem.setAttribute('open', '')
            }
        }

    }))
}
