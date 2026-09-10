import { Swiper, SwiperSlide } from "swiper/react";
const items = [{ id: 1, title: "A" }, { id: 2, title: "B" }];
export default function DynamicCarousel() {
  return (
    <Swiper>
      {items.map((s) => (
        <SwiperSlide key={s.id}><h2>{s.title}</h2></SwiperSlide>
      ))}
    </Swiper>
  );
}
