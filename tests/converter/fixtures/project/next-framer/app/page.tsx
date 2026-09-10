import { motion } from "framer-motion";
export default function Home() {
  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <h1>Animated Title</h1>
      <p>Children stay static.</p>
    </motion.section>
  );
}
