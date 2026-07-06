import { Alpine as AlpineType } from "alpinejs"

export default (Alpine: AlpineType) => {
    Alpine.data("modal", (
        modal: any
    ) => ({
      modal: modal,
      isOpen: false,
      isShown: false,
    
      async open(payload) {
            console.log("open", payload);
    
            if (payload.handle === this.handle) {
                this.isOpen = true
                await new Promise(resolve => setTimeout(resolve, 300))
                this.isShown = true
            }
      },
    
      async close() {
        this.isShown = false
        await new Promise(resolve => setTimeout(resolve, 300))
        this.isOpen = false
      },
    }))
}
