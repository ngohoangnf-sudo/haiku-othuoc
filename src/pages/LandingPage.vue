<template>
  <div v-if="simpleMobileLayout" class="landing-page landing-page--mobile-minimal">
    <div class="landing-page__mobile-poem" aria-label="Bài thơ ngẫu nhiên">
      <p
        v-for="(line, index) in featuredPoem.lines"
        :key="`mobile-line-${index}`"
        class="landing-page__mobile-line"
        :style="{ '--line-index': index }"
      >
        {{ line }}
      </p>
    </div>
  </div>
  <div v-else class="content content--offset landing-page">
    <div class="content__item landing-page__section landing-page__section--hero" style="--aspect-ratio: 10/75">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._1 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">
        <router-link to="/read/jp">Đọc</router-link>
      </h2>
      <div class="content__item-description">
        <router-link to="/read/jp" class="link"><p> haiku nhật</p></router-link>
        <router-link to="/read/vi" class="link"><p>haiku việt</p></router-link>
        <router-link to="/read/global" class="link"><p>haiku thế giới</p></router-link>
      </div>
      <div class="content__item-poem grid g3 landing-page__poem">
        <a
          aria-label="link-3"
          target="_blank"
          rel="noopener"
          draggable="false"
          class="link w-inline-block -col-or-link landing-page__poem-link"
        >
          <p
            v-for="(line, index) in featuredPoem.lines"
            :key="index"
            class="landing-page__poem-line"
          >
            {{ line }}
          </p>
          <img class="" :src="featuredPoem.image" alt="" aria-hidden="true" crossorigin="anonymous" />
        </a>
      </div>
    </div>

    <!-- <div></div> -->
    <div class="content__item landing-page__section" style="--aspect-ratio: 700/200">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._2 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer"><router-link to="/write">Viết</router-link></h2>
      
    </div>
    <div class="content__item landing-page__section" style="--aspect-ratio: 30/60">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._3 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">
        <router-link to="/essays">Nghĩ</router-link>
      </h2>
      <div class="content__item-description">
        <router-link :to="{ path: '/essays', query: { kind: 'research' } }" class="link"><p>nghiên cứu</p></router-link>
        <router-link :to="{ path: '/essays', query: { kind: 'commentary' } }" class="link"><p>bình luận</p></router-link>
      </div>
    </div>
    <div class="content__item landing-page__section" style="--aspect-ratio: 700/300">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._4 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">
        <router-link to="/haiku-number">Haiku#</router-link>
      </h2>
    </div>
    <div class="content__item landing-page__section" style="--aspect-ratio: 500/545">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._5 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">
        <router-link to="/library">Thư Viện</router-link>
      </h2>
      <div class="content__item-description">
        <router-link to="/library" class="link"><p>giới thiệu sách</p></router-link>
        <router-link to="/library" class="link"><p>ebook</p></router-link>
        <router-link to="/library" class="link"><p>mượn sách giấy</p></router-link>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, nextTick } from "vue";
import _1 from "assets/1.jpg";
import _2 from "assets/2.jpg";
import _3 from "assets/3.jpg";
import _4 from "assets/4.jpg";
import _5 from "assets/5.jpg";
import _7 from "assets/7.jpg";
import { initLandingPage } from "assets/landing_page.js";
import { API_BASE, resolveMediaUrl } from "src/utils/runtime";

export default defineComponent({
  name: "LandingPage",
  async mounted() {
    this.mobileMediaQuery = window.matchMedia?.("(max-width: 53em), (hover: none), (pointer: coarse)") ?? null;
    this.simpleMobileLayout = Boolean(this.mobileMediaQuery?.matches);
    this.syncMobileScrollLock();
    this.mobileMediaQuery?.addEventListener?.("change", this.handleMediaQueryChange);
    await this.fetchFeaturedPoem();
    await nextTick();
    if (!this.simpleMobileLayout) {
      this.cleanupLandingPage = initLandingPage();
    }
  },
  beforeUnmount() {
    this.cleanupLandingPage?.();
    this.mobileMediaQuery?.removeEventListener?.("change", this.handleMediaQueryChange);
    document.documentElement.classList.remove("landing-page-mobile-lock");
    document.body.classList.remove("landing-page-mobile-lock");
  },
  props: {
    title: {
      type: String,
      required: false,
    },

    caption: {
      type: String,
      default: "",
    },

    link: {
      type: String,
      default: "#",
    },

    icon: {
      type: String,
      default: "",
    },
  },
  data() {
    return {
      cleanupLandingPage: null,
      mobileMediaQuery: null,
      simpleMobileLayout: false,
      featuredPoem: {
        lines: ["đường phố không hắt bóng", "dưới mắt đèn đường hỏng", "chỗ trú loài chim đêm"],
        image: _7,
      },
      images: {
        _1,
        _2,
        _3,
        _4,
        _5,
        _7,
      },
    };
  },
  methods: {
    syncMobileScrollLock() {
      document.documentElement.classList.toggle("landing-page-mobile-lock", this.simpleMobileLayout);
      document.body.classList.toggle("landing-page-mobile-lock", this.simpleMobileLayout);
    },
    async handleMediaQueryChange(event) {
      const nextIsMobile = Boolean(event?.matches);
      if (nextIsMobile === this.simpleMobileLayout) {
        return;
      }

      this.simpleMobileLayout = nextIsMobile;
      this.syncMobileScrollLock();
      this.cleanupLandingPage?.();
      this.cleanupLandingPage = null;

      if (!nextIsMobile) {
        await nextTick();
        this.cleanupLandingPage = initLandingPage();
      }
    },
    async fetchFeaturedPoem() {
      try {
        const res = await fetch(`${API_BASE}/posts/random`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data?.image || !Array.isArray(data?.lines) || !data.lines.length) {
          return;
        }

        this.featuredPoem = {
          lines: data.lines,
          image: resolveMediaUrl(data.image),
        };
      } catch (err) {
        console.error("Không tải được bài thơ landing", err);
      }
    },
  },
});
</script>

<style scoped>
@media screen and (max-width: 53em) {
  .landing-page--mobile-minimal {
    display: grid;
    min-height: min(62svh, 34rem);
    place-items: center;
    margin: 0;
    padding: 10vh 0 6vh;
  }

  .landing-page__mobile-poem {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.72rem;
    width: min(100%, 18rem);
    text-align: center;
    font-style: italic;
    transform: translateY(6.5vh);
  }

  .landing-page__mobile-line {
    margin: 0;
    width: 100%;
    max-width: 100%;
    line-height: 1.46;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0;
    transform: translateY(1rem);
    filter: blur(1px);
    animation: landing-mobile-line-in 1180ms cubic-bezier(0.2, 0.7, 0.15, 1) forwards;
    animation-delay: calc(var(--line-index, 0) * 280ms + 320ms);
  }

  @keyframes landing-mobile-line-in {
    from {
      opacity: 0;
      transform: translateY(1rem);
      filter: blur(1px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
      filter: blur(0);
    }
  }

  .landing-page {
    display: flex;
    flex-direction: column;
    gap: 4.5rem;
    margin-top: 8vh;
    margin-bottom: 10vh;
  }

  .landing-page__section {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: auto auto 1fr;
    column-gap: 1rem;
    row-gap: 0.3rem;
    align-items: start;
    width: 100%;
    margin: 0;
    padding: 0 0.35rem;
    transform: none !important;
  }

  .landing-page__section .content__item-imgwrap {
    width: 100%;
    height: 100%;
    margin: 0;
    padding-bottom: 0;
    min-height: min(78vw, 26rem);
    aspect-ratio: 4 / 5.3;
    overflow: hidden;
  }

  .landing-page__section .content__item-img {
    top: 0;
    height: 100%;
    width: 100%;
    transform: none !important;
    opacity: 0.88;
    background-position: center center;
    background-size: cover;
  }

  .landing-page__section .content__item-title,
  .landing-page__section .content__item-title--layer {
    width: 100%;
    margin: 0;
    padding: 0;
    font-size: clamp(3.3rem, 10vw, 5.1rem);
    line-height: 0.92;
    mix-blend-mode: normal;
    transform: none !important;
  }

  .landing-page__section .content__item-description {
    width: 100%;
    padding: 0.7rem 0 0;
    transform: none !important;
  }

  .landing-page__section .content__item-description p {
    width: auto;
    margin: 0 0 0.35rem;
  }

  .landing-page__poem {
    width: 100%;
    margin: 0;
    padding: 1rem 0 0;
    transform: none !important;
  }

  .landing-page__poem-link {
    align-items: flex-start;
    gap: 0.45rem;
  }

  .landing-page__poem-link p {
    width: 100%;
    max-width: 100%;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .landing-page__section:nth-of-type(odd) .content__item-imgwrap {
    grid-column: 1;
    grid-row: 1 / span 3;
  }

  .landing-page__section:nth-of-type(odd) .content__item-title,
  .landing-page__section:nth-of-type(odd) .content__item-title--layer,
  .landing-page__section:nth-of-type(odd) .content__item-description,
  .landing-page__section:nth-of-type(odd) .landing-page__poem {
    grid-column: 2;
    text-align: left;
    justify-self: stretch;
  }

  .landing-page__section:nth-of-type(even) .content__item-imgwrap {
    grid-column: 2;
    grid-row: 1 / span 3;
  }

  .landing-page__section:nth-of-type(even) .content__item-title,
  .landing-page__section:nth-of-type(even) .content__item-title--layer,
  .landing-page__section:nth-of-type(even) .content__item-description,
  .landing-page__section:nth-of-type(even) .landing-page__poem {
    grid-column: 1;
    text-align: right;
    justify-self: stretch;
  }

  .landing-page__section:nth-of-type(even) .landing-page__poem-link {
    align-items: flex-end;
  }

  .landing-page__section:nth-of-type(even) .landing-page__poem-link p,
  .landing-page__section:nth-of-type(even) .content__item-description p {
    margin-left: auto;
  }

  .landing-page__section--hero .landing-page__poem {
    align-self: end;
  }
}

@media screen and (max-width: 40em) {
  .landing-page--mobile-minimal {
    min-height: min(58svh, 28rem);
    padding-top: 9vh;
  }

  .landing-page__mobile-poem {
    width: min(100%, 15.5rem);
    gap: 0.62rem;
  }

  .landing-page__mobile-line {
    animation-duration: 1040ms;
  }

  .landing-page {
    gap: 3.5rem;
    margin-top: 7vh;
  }

  .landing-page__section {
    column-gap: 0.8rem;
    padding: 0 0.15rem;
  }

  .landing-page__section .content__item-imgwrap {
    min-height: min(82vw, 22rem);
  }

  .landing-page__section .content__item-title,
  .landing-page__section .content__item-title--layer {
    font-size: clamp(2.8rem, 11.5vw, 4.3rem);
  }

  .landing-page__section .content__item-description {
    padding-top: 0.55rem;
  }

  .landing-page__poem {
    padding-top: 0.8rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .landing-page__mobile-line {
    opacity: 1;
    transform: none;
    animation: none;
  }
}
</style>
