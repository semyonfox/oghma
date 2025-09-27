"use client"; // this component is rendered on the server, but uses client-side interactivity

import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <p>Count: {count}</p>
      <button className="btn btn-dark" onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  );
}

