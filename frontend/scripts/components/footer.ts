export default (Alpine: AlpineType) => {
    Alpine.data("footer", () => ({
      accordions: [] as NodeListOf<HTMLElement> | HTMLElement[],
      el: null as HTMLElement | null,
  
      init() {
        this.el = document.querySelector(".footer-content")

        this.accordions = [
            ...this.el.querySelectorAll("accordion-custom")
          ] as HTMLElement[]
  
        window.addEventListener("resize", () => {
          this.setAccordions()
        })
  
        this.setAccordions()
      },
  
      setAccordions() {
        this.accordions.forEach((accordion, index) => {
          const details = accordion.querySelector("details")
          if (!details) return
  
          if (window.innerWidth < 750) {
            index === 0
              ? details.setAttribute("open", "")
              : details.removeAttribute("open")
          } else {
            details.setAttribute("open", "")
          }
        })
      },
    }))
  }