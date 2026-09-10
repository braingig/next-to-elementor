import axios from "axios";
export default function Contact() {
  const onSubmit = () => {
    axios.post("/api/contact");
    fetch("/api/contact");
  };
  return (
    <form>
      <h1>Contact</h1>
      <input name="email" />
      <button type="submit" onClick={onSubmit}>Send</button>
    </form>
  );
}
