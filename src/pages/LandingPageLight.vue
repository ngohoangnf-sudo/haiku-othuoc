<template>
  <div class="content content--offset">
    <div class="content__item" style="--aspect-ratio: 10/75">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._1 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">Đọc</h2>
      <div class="content__item-description">
        <p>haiku nhật</p>
        <p>haiku việt</p>
        <p>haiku thế giới</p>
      </div>
      <div class="content__item-poem grid g3">
        <a
          aria-label="link-3"
          target="_blank"
          rel="noopener"
          draggable="false"
          class="link w-inline-block --color-link"
        >
          <p class="right">đường phố không hắt bóng</p>
          <p class="right">dưới mắt đèn đường hỏng</p>
          <p class="right">chỗ trú loài chim đêm</p>
          <img class="" :src="images._7" alt="img7" />
        </a>
      </div>
    </div>

    <!-- <div></div> -->
    <div class="content__item" style="--aspect-ratio: 700/200">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._2 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">Viết</h2>
    </div>
    <div class="content__item" style="--aspect-ratio: 30/60">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._3 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">Nghĩ</h2>
      <div class="content__item-description">
        <p>nghiên cứu</p>
        <p>bình luận</p>
      </div>
    </div>
    <div class="content__item" style="--aspect-ratio: 700/300">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._4 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">Haiku#</h2>
    </div>
    <div class="content__item" style="--aspect-ratio: 500/545">
      <div class="content__item-imgwrap">
        <div
          class="content__item-img"
          :style="'background-image: url(' + images._5 + ')'"
        ></div>
      </div>
      <h2 class="content__item-title content__item-title--layer">Thư Viện</h2>
      <div class="content__item-description">
        <p>giới thiệu sách</p>
        <p>ebook</p>
        <p>mượn sách giấy</p>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent } from "vue";
import _1 from "assets/1.jpg";
import _2 from "assets/2.jpg";
import _3 from "assets/3.jpg";
import _4 from "assets/4.jpg";
import _5 from "assets/5.jpg";
import _7 from "assets/7.jpg";
import * as imagesloaded from "assets/imagesloaded.pkgd.min.js";
import { initLandingPage } from "assets/landing_page.js";
import * as tweenlite from "assets/js/TweenLite.min.js";
// import * as effectshell from "assets/js/EffectShell.js";
import * as math from "assets/js/Math.js";
// import * as rgbshifteffect from "assets/js/RGBShiftEffect.js";
// import * as StretchEffect from "assets/js/StretchEffect.js";
import * as three from "assets/js/three.min.js";
// import * as TrailsEffect from "assets/js/TrailsEffect.js";
// import * as tweenmax from "assets/TweenMax.js";

export default defineComponent({
  name: "LandingPageLight",
  mounted() {
    this.cleanupLandingPage = initLandingPage();
  },
  beforeUnmount() {
    this.cleanupLandingPage?.();
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
});
</script>

<style>
body {
  margin: 0;
  /* --color-text: #686E67; */
  --color-text: #6e635f !important;
  /* --color-text: #b1a59f; */
  --color-bg: #fff !important;
  --color-link: #000;
  --color-link-hover: #b1a189;
}
</style>
