export default (Alpine: AlpineType) => {
    Alpine.data("howToMix", (
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
