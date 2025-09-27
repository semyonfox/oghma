import { useState } from "react";

export default async function SSRPage() {
    const serverTime = new Date().toISOString();

    return (
        <div>
            <h1>SSR Page</h1>
            <p>Server time (rendered on server): {serverTime}</p>
            <Counter />
        </div>
    );
}

// Client component for interactivity
function Counter() {
    const [count, setCount] = useState(0);

    return (
        <>
            <p>Client counter: {count}</p>
            <button onClick={() => setCount(c => c + 1)}>Increment</button>
        </>
    );
}
