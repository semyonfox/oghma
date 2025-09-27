"use client";

import { useState, useEffect } from "react";

export default function CSRPage() {
    const [time, setTime] = useState(null);
    const [count, setCount] = useState(0);

    // Fetch on the client (runs in browser only)
    useEffect(() => {
        setTime(new Date().toISOString());
    }, []);

    return (
        <div>
            <h1>CSR Page</h1>
            <p>Server time (loaded on client): {time || "Loading..."}</p>
            <p>Client counter: {count}</p>
            <button onClick={() => setCount(c => c + 1)}>Increment</button>
        </div>
    );
}
