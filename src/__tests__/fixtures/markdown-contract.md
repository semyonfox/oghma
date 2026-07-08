# Markdown Contract Fixture

## Inline formatting

This paragraph has **bold**, *italic*, ~~strike~~, [a safe link](https://example.com), and `inlineCode()`.

## Code fences

```ts title="contract-fixture.ts"
export const answer: number = 42;
```

```madeuplang
unknown language fallback
```

## Lists and quotes

- Bullet item
- [x] Completed task
- [ ] Open task

1. Ordered item
2. Next item

> Block quote content.

## Tables

| Feature | Status |
| --- | --- |
| Tables | Supported |

## Math

Inline math $x^2 + y^2 = z^2$.

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

## Images and raw HTML

![Note asset](_page_1_Figure_2.png)

<mark>Safe highlight</mark>
<script>alert("blocked")</script>
<img src="x" onerror="alert('blocked')" />
[bad link](javascript:alert('blocked'))
