export default (Alpine: AlpineType) => {
    Alpine.data("waysToEnjoy", (
        activeTitle: string
    ) => ({
        activeTitle: activeTitle,

        setActive(title: string) {
            this.activeTitle = title;
        }
    }))
}
