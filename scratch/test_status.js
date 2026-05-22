async function check() {
  try {
    const res = await fetch('http://localhost:3000/status');
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Fetch error:", err);
  }
}
check();
