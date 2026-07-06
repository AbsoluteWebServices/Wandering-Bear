import { Alpine as AlpineType } from "alpinejs"
import Swiper from 'swiper';
import { Navigation } from 'swiper/modules';

export default (Alpine: AlpineType) => {
    Alpine.data("VideoPlayer", (
        video: any) => ({
        video: video,
        videoMuted: false,
        el: null,
        iconPlay: null,
        iconPause: null,

        init() {
            this.el = this.$el;
            this.video = this.el.querySelector('video');

            this.iconPlay = this.el.querySelector('.icon-play');
            this.iconPause = this.el.querySelector('.icon-pause');
        },

        toggleSound() {
            this.video.muted = !this.video.muted;
            this.videoMuted = !this.videoMuted;
        },

        togglePlay() {
            if (this.video.paused) {
                this.video.play();
            } else {
                this.video.pause();
            }
            this.changeIcon();
        },

        changeIcon() {
            if (this.video.paused) {
                this.iconPlay.classList.remove('hidden');
                this.iconPause.classList.add('hidden');
                console.log('paused', this.iconPlay, this.iconPause);

            } else {
                this.iconPlay.classList.add('hidden');
                this.iconPause.classList.remove('hidden');

                console.log('playing', this.iconPlay, this.iconPause);

            }
        },

    }))
}
