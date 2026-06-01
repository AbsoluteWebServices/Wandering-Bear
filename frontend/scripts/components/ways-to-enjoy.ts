export default (Alpine: AlpineType) => {
    Alpine.data("waysToEnjoy", (
        activeTitle: string
    ) => ({
        activeTitle: activeTitle,
        init() {
            
        },

        setActive(title: string) {
            console.log('active title', title);
            this.activeTitle = title;
        }


    }))
}
