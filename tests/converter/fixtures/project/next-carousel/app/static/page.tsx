import { Swiper, SwiperSlide } from "swiper/react";
export default function StaticCarousel() {
  return (
    <Swiper>
      <SwiperSlide><h2>Slide One</h2></SwiperSlide>
      <SwiperSlide><h2>Slide Two</h2></SwiperSlide>
    </Swiper>
  );
}
